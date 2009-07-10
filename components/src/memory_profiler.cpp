#include "jsdhash.h"

#include "tcb.h"
#include "memory_profiler.h"
#include "server_socket.h"

// TODO: This isn't actually safe, it just prints a warning message
// whenever an integer is too big to fit into a jsval and returns
// 0. Ideally this should be fixed to create a jsdouble * with the
// integer's value.
#define SAFE_INT_TO_JSVAL(i) (INT_FITS_IN_JSVAL(i) ? INT_TO_JSVAL(i) : \
                              dealWithBigInt(i))

// Private structure to track the state of tracing the JS heap.

typedef struct TracingState {
  // Keeps track of what objects we've visited so far.
  JSDHashTable visited;

  // Whether the tracing operation is successful or failed.
  JSBool result;

  // Runtime that we're tracing.
  JSRuntime *runtime;

  // Mapping from strings to objects for the profiler's convenience.
  JSObject *namedObjects;

  // Structure required to use JS tracing functions.
  JSTracer tracer;
};

// Static singleton for tracking the state of tracing the JS heap.
static TracingState tracingState;

typedef struct ChildTracingState {
  int num;
  void **things;
  uint32 *kinds;
  JSTracer tracer;
};

static ChildTracingState childTracingState;

static jsval dealWithBigInt(unsigned int i) {
  printf("WARNING: Large int %u cannot fit in jsval.\n", i);
  return JSVAL_ZERO;
}

// JSTraceCallback to build a hashtable of children.
static void childCountBuilder(JSTracer *trc, void *thing, uint32 kind)
{
  childTracingState.num++;
}

// JSTraceCallback to build a hashtable of children.
static void childBuilder(JSTracer *trc, void *thing, uint32 kind)
{
  *childTracingState.kinds = kind;
  childTracingState.kinds++;
  *childTracingState.things = thing;
  childTracingState.things++;
}

// JSTraceCallback to build a hashtable of existing object references.
static void visitedBuilder(JSTracer *trc, void *thing, uint32 kind)
{
  switch (kind) {
  case JSTRACE_OBJECT:
    JSDHashEntryStub *entry = (JSDHashEntryStub *)
      JS_DHashTableOperate(&tracingState.visited,
                           thing,
                           JS_DHASH_LOOKUP);
    if (JS_DHASH_ENTRY_IS_FREE((JSDHashEntryHdr *)entry)) {
      entry = (JSDHashEntryStub *) JS_DHashTableOperate(&tracingState.visited,
                                                        thing,
                                                        JS_DHASH_ADD);
      if (entry == NULL) {
        JS_ReportOutOfMemory(trc->context);
        tracingState.result = JS_FALSE;
        return;
      }
      entry->key = thing;
      JS_TraceChildren(trc, thing, kind);
    }
    break;
  case JSTRACE_DOUBLE:
    break;
  case JSTRACE_STRING:
    break;
  }
}

static JSBool getChildrenInfo(JSContext *cx, JSObject *info,
                              JSObject *target, JSContext *targetCx)
{
  childTracingState.tracer.context = targetCx;
  childTracingState.tracer.callback = childCountBuilder;
  childTracingState.num = 0;
  JS_TraceChildren(&childTracingState.tracer, target, JSTRACE_OBJECT);

  void *things[childTracingState.num];
  uint32 kinds[childTracingState.num];

  childTracingState.things = things;
  childTracingState.kinds = kinds;

  childTracingState.tracer.callback = childBuilder;
  JS_TraceChildren(&childTracingState.tracer, target, JSTRACE_OBJECT);

  int numObjectChildren = 0;
  for (int i = 0; i < childTracingState.num; i++) {
    if (kinds[i] == JSTRACE_OBJECT)
      numObjectChildren++;
  }

  jsval childrenVals[numObjectChildren];

  int currChild = 0;
  for (int i = 0; i < childTracingState.num; i++) {
    if (kinds[i] == JSTRACE_OBJECT) {
      childrenVals[currChild] = SAFE_INT_TO_JSVAL((unsigned int) things[i]);
      currChild += 1;
    }
  }

  if (numObjectChildren != currChild) {
    JS_ReportError(cx, "Assertion failure, numObjectChildren != currChild");
    return JS_FALSE;
  }

  JSObject *children = JS_NewArrayObject(cx, numObjectChildren, childrenVals);
  if (children == NULL) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  return JS_DefineProperty(cx, info, "children", OBJECT_TO_JSVAL(children),
                           NULL, NULL, JSPROP_ENUMERATE);
}

static JSBool getFunctionInfo(JSContext *cx, JSObject *info,
                              JSObject *target, JSContext *targetCx)
{
  // Thanks to dbaron's leakmon code for this:
  //
  // http://hg.mozilla.org/users/dbaron_mozilla.com/leak-monitor/file/88274af9f629/src/leakmonJSObjectInfo.cpp#l208

  JSFunction *fun = JS_ValueToFunction(
    targetCx,
    OBJECT_TO_JSVAL(target)
    );
  if (fun == NULL) {
    JS_ReportError(cx, "JS_ValueToFunction() failed.");
    return JS_FALSE;
  }

  if (!JS_DefineProperty(
        cx, info, "functionSize",
        INT_TO_JSVAL(JS_GetFunctionTotalSize(targetCx, fun)),
        NULL, NULL, JSPROP_ENUMERATE)) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  JSScript *script = JS_GetFunctionScript(targetCx, fun);
  // script is null for native code.      
  if (script) {
    jsval name = JSVAL_NULL;

    JSString *targetFuncName = JS_GetFunctionId(fun);
    if (targetFuncName) {
      JSString *funcName = JS_NewUCStringCopyZ(
        cx,
        JS_GetStringChars(targetFuncName)
        );
      name = STRING_TO_JSVAL(funcName);
    }

    if (!JS_DefineProperty(
          cx, info, "scriptSize",
          INT_TO_JSVAL(JS_GetScriptTotalSize(targetCx, script)),
          NULL, NULL, JSPROP_ENUMERATE)) {
      JS_ReportOutOfMemory(cx);
      return JS_FALSE;
    }

    JSString *filename = JS_NewStringCopyZ(
      cx,
      JS_GetScriptFilename(targetCx, script)
      );
    uintN lineStart = JS_GetScriptBaseLineNumber(targetCx, script);
    uintN lineEnd = (lineStart +
                     JS_GetScriptLineExtent(targetCx, script) - 1);
    if (!JS_DefineProperty(cx, info, "name", name,
                           NULL, NULL, JSPROP_ENUMERATE) ||
        !JS_DefineProperty(cx, info, "filename",
                           STRING_TO_JSVAL(filename),
                           NULL, NULL, JSPROP_ENUMERATE) ||
        !JS_DefineProperty(cx, info, "lineStart",
                           INT_TO_JSVAL(lineStart),
                           NULL, NULL, JSPROP_ENUMERATE) ||
        !JS_DefineProperty(cx, info, "lineEnd",
                           INT_TO_JSVAL(lineEnd),
                           NULL, NULL, JSPROP_ENUMERATE))
      return JS_FALSE;
  }
  return JS_TRUE;
}

static JSBool copyPropertyInfo(JSContext *cx, JSObject *propInfo,
                               jsid targetPropId, const char *name,
                               JSObject *target, JSContext *targetCx)
{
  jsval value;
  if (name == NULL) {
    JSObject *valueObj;
    if (!JS_LookupPropertyWithFlagsById(
          targetCx,
          target,
          targetPropId,
          JSRESOLVE_DETECTING,
          &valueObj,
          &value)) {
      JS_ReportError(cx, "JS_LookupPropertyWithFlagsById() failed.");
      return JS_FALSE;
    }
  } else {
    if (!JS_LookupPropertyWithFlags(
          targetCx,
          target,
          name,
          JSRESOLVE_DETECTING,
          &value)) {
      JS_ReportError(cx, "JS_LookupPropertyWithFlags() failed.");
      return JS_FALSE;
    }
  }

  if (JSVAL_IS_OBJECT(value)) {
    JSObject *valueObj = JSVAL_TO_OBJECT(value);
    value = SAFE_INT_TO_JSVAL((unsigned int) valueObj);
  } else if (JSVAL_IS_STRING(value)) {
    JSString *valueStr = JS_NewUCStringCopyZ(
      cx,
      JS_GetStringChars(JSVAL_TO_STRING(value))
      );
    if (valueStr == NULL) {
      JS_ReportOutOfMemory(cx);
      return JS_FALSE;
    }
    value = STRING_TO_JSVAL(valueStr);
  } else
    value = JSVAL_NULL;

  if (name == NULL) {
    if (!JS_DefinePropertyById(
          cx, propInfo,
          // TODO: Is it OK to use this ID from a different JSRuntime?
          targetPropId,
          value,
          NULL,
          NULL,
          JSPROP_ENUMERATE))
      return JS_FALSE;
  } else {
    if (!JS_DefineProperty(
          cx, propInfo,
          name,
          value,
          NULL,
          NULL,
          JSPROP_ENUMERATE))
      return JS_FALSE;
  }

  return JS_TRUE;
}

static JSBool getPropertiesInfo2(JSContext *cx, JSObject *propInfo,
                                 JSObject *target, JSContext *targetCx)
{
  JSObject *iterator = JS_NewPropertyIterator(targetCx, target);
  if (iterator == NULL)
    return JS_TRUE;

  jsid iterId;
  while (1) {
    if (!JS_NextProperty(targetCx, iterator, &iterId)) {
      JS_ReportError(cx, "Iterating to next property failed.");
      return JS_FALSE;
    }
    if (iterId == JSVAL_VOID)
      break;

    if (!copyPropertyInfo(cx, propInfo,
                          iterId, NULL, target,
                          targetCx))
      return JS_FALSE;
  }

  return JS_TRUE;
}

static JSBool getPropertiesInfo(JSContext *cx, JSObject *propInfo,
                                JSObject *target, JSContext *targetCx)
{
  // TODO: It'd be nice if we could use the OBJ_IS_NATIVE() macro here,
  // but that appears to be defined in a private header, jsobj.h. Still,
  // leakmon uses it, so it might be OK if we do too:
  //
  // http://hg.mozilla.org/users/dbaron_mozilla.com/leak-monitor/file/88274af9f629/src/leakmonJSObjectInfo.cpp#l208
  //
  // It looks like JS_NewPropertyIterator() solves this issue and that
  // we should use it, but I keep getting an assertion in JS_NextProperty()
  // at "JS_ASSERT(scope->object == obj)" when doing this.

  JSBool success = JS_TRUE;
  JSIdArray *ids = JS_Enumerate(targetCx, target);
  if (ids == NULL)
    return JS_TRUE;

  for (int i = 0; i < ids->length; i++) {
    if (!copyPropertyInfo(cx, propInfo,
                          ids->vector[i], NULL, target,
                          targetCx)) {
      success = JS_FALSE;
      break;
    }
  }

  JS_DestroyIdArray(targetCx, ids);

  return success;
}

static JSBool maybeIncludeObject(JSContext *cx, JSObject *info,
                                 const char *objName, JSObject *obj)
{
  if (obj != NULL)
    if (!JS_DefineProperty(cx, info, objName,
                           SAFE_INT_TO_JSVAL((unsigned int) obj),
                           NULL, NULL, JSPROP_ENUMERATE))
      return JS_FALSE;
  return JS_TRUE;
}

static JSBool maybeIncludeObjectOp(JSContext *cx, JSObject *info,
                                   const char *objName, JSObjectOp objOp,
                                   JSContext *targetCx, JSObject *target)
{
  if (objOp)
    return maybeIncludeObject(cx, info, objName, objOp(targetCx, target));
  return JS_TRUE;
}

static JSBool lookupNamedObject(JSContext *cx, const char *name,
                                uint32 *id)
{
  *id = 0;

  if (tracingState.namedObjects == NULL)
    return JS_TRUE;

  JSBool found;
  if (!JS_HasProperty(tracingState.tracer.context,
                      tracingState.namedObjects,
                      name,
                      &found)) {
    JS_ReportError(cx, "JS_HasProperty() failed.");
    return JS_FALSE;
  }

  if (!found)
    return JS_TRUE;

  jsval val;
  if (!JS_LookupProperty(tracingState.tracer.context,
                         tracingState.namedObjects,
                         name,
                         &val)) {
    JS_ReportError(cx, "JS_LookupProperty failed.");
    return JS_FALSE;
  }

  if (!JSVAL_IS_OBJECT(val))
    return JS_TRUE;

  JSObject *obj = JSVAL_TO_OBJECT(val);
  *id = (unsigned int) obj;

  return JS_TRUE;
}

// Given a named object string or an object ID, get the object in
// the JS runtime we're profiling and put it in rval. If it doesn't
// exist, put JSVAL_NULL in rval. If an error occurs, return JS_FALSE.
static JSBool getJSObject(JSContext *cx, uintN argc, jsval *argv,
                          jsval *rval)
{
  uint32 id;

  if (argc >= 1 && JSVAL_IS_STRING(argv[0])) {
    const char *name = JS_GetStringBytes(JSVAL_TO_STRING(argv[0]));
    if (!lookupNamedObject(cx, name, &id))
      return JS_FALSE;
  } else
    if (!JS_ConvertArguments(cx, argc, argv, "u", &id))
      return JS_FALSE;

  JSDHashEntryStub *entry = (JSDHashEntryStub *)
    JS_DHashTableOperate(&tracingState.visited,
                         (void *) id,
                         JS_DHASH_LOOKUP);
  if (entry == NULL) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  if (JS_DHASH_ENTRY_IS_BUSY((JSDHashEntryHdr *)entry))
    *rval = OBJECT_TO_JSVAL((JSObject *) id);
  else
    *rval = JSVAL_NULL;

  return JS_TRUE;
}

static JSBool getObjProperty(JSContext *cx, JSObject *obj, uintN argc,
                             jsval *argv, jsval *rval)
{
  jsval targetVal;
  bool useGetPropertiesInfo2 = false;

  if (!getJSObject(cx, argc, argv, &targetVal))
    return JS_FALSE;

  if (!JSVAL_IS_STRING(argv[1])) {
    JS_ReportError(cx, "Must supply a string as second parameter.");
    return JS_FALSE;
  }

  char *name = JS_GetStringBytes(JSVAL_TO_STRING(argv[1]));

  if (JSVAL_IS_OBJECT(targetVal) && !JSVAL_IS_NULL(targetVal)) {
    JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);
    *rval = OBJECT_TO_JSVAL(info);

    JSObject *target = JSVAL_TO_OBJECT(targetVal);
    JSContext *targetCx = tracingState.tracer.context;

    if (!copyPropertyInfo(cx, info,
                          NULL, name, target,
                          targetCx))
      return JS_FALSE;
  } else
    *rval = JSVAL_NULL;

  return JS_TRUE;
}

static JSBool getObjProperties(JSContext *cx, JSObject *obj, uintN argc,
                               jsval *argv, jsval *rval)
{
  jsval targetVal;
  bool useGetPropertiesInfo2 = false;

  if (!getJSObject(cx, argc, argv, &targetVal))
    return JS_FALSE;
  
  if (argc > 1 && argv[1] == JSVAL_TRUE)
    useGetPropertiesInfo2 = true;

  if (JSVAL_IS_OBJECT(targetVal) && !JSVAL_IS_NULL(targetVal)) {
    JSObject *target = JSVAL_TO_OBJECT(targetVal);
    JSContext *targetCx = tracingState.tracer.context;

    JSObject *propInfo = JS_NewObject(cx, NULL, NULL, NULL);
    if (propInfo == NULL) {
      JS_ReportOutOfMemory(cx);
      return JS_FALSE;
    }

    *rval = OBJECT_TO_JSVAL(propInfo);

    if (useGetPropertiesInfo2) {
      if (!getPropertiesInfo2(cx, propInfo, target, targetCx))
        return JS_FALSE;
    } else {
      if (!getPropertiesInfo(cx, propInfo, target, targetCx))
        return JS_FALSE;
    }
  } else
    *rval = JSVAL_NULL;

  return JSVAL_TRUE;
}

static JSBool getNamedObjects(JSContext *cx, JSObject *obj, uintN argc,
                              jsval *argv, jsval *rval)
{
  JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);
  *rval = OBJECT_TO_JSVAL(info);
 
  if (tracingState.namedObjects != NULL) {
    JSContext *targetCx = tracingState.tracer.context;
    JSObject *target = tracingState.namedObjects;

    if (!getPropertiesInfo(cx, info, target, targetCx))
      return JS_FALSE;
  }

  return JS_TRUE;
}

static JSBool getObjInfo(JSContext *cx, JSObject *obj, uintN argc,
                         jsval *argv, jsval *rval)
{
  jsval targetVal;

  if (!getJSObject(cx, argc, argv, &targetVal))
    return JS_FALSE;

  if (JSVAL_IS_OBJECT(targetVal) && !JSVAL_IS_NULL(targetVal)) {
    JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);
    *rval = OBJECT_TO_JSVAL(info);

    JSObject *target = JSVAL_TO_OBJECT(targetVal);
    JSContext *targetCx = tracingState.tracer.context;
    JSClass *classp = JS_GET_CLASS(targetCx, target);
    if (classp != NULL) {
      if (!JS_DefineProperty(cx, info, "id",
                             SAFE_INT_TO_JSVAL((unsigned int) target),
                             NULL, NULL,
                             JSPROP_ENUMERATE))
        return JS_FALSE;

      // TODO: Should really be using an interned string here or something.
      JSString *name = JS_NewStringCopyZ(cx, classp->name);
      if (name == NULL) {
        JS_ReportOutOfMemory(cx);
        return JS_FALSE;        
      }
      if (!JS_DefineProperty(cx, info, "nativeClass", STRING_TO_JSVAL(name),
                             NULL, NULL, JSPROP_ENUMERATE)) {
        JS_ReportOutOfMemory(cx);
        return JS_FALSE;
      }
    }

    if (!JS_DefineProperty(
          cx, info, "size",
          INT_TO_JSVAL(JS_GetObjectTotalSize(targetCx, target)),
          NULL, NULL, JSPROP_ENUMERATE)) {
      JS_ReportOutOfMemory(cx);
      return JS_FALSE;
    }

    if (!maybeIncludeObject(cx, info, "parent",
                            JS_GetParent(targetCx, target)) ||
        !maybeIncludeObject(cx, info, "prototype",
                            JS_GetPrototype(targetCx, target)))
      return JS_FALSE;

    // TODO: We used to include 'constructor' here too, but
    // we ran into a problem with Block objects, so removed it.

    if (JS_ObjectIsFunction(targetCx, target))
      if (!getFunctionInfo(cx, info, target, targetCx))
        return JS_FALSE;

    if (!getChildrenInfo(cx, info, target, targetCx))
      return JS_FALSE;

    if (classp->flags & JSCLASS_IS_EXTENDED) {
      JSExtendedClass *exClassp = (JSExtendedClass *) classp;

      if (!maybeIncludeObjectOp(cx, info, "wrappedObject",
                                exClassp->wrappedObject, targetCx, target) ||
          !maybeIncludeObjectOp(cx, info, "outerObject",
                                exClassp->outerObject, targetCx, target) ||
          !maybeIncludeObjectOp(cx, info, "innerObject",
                                exClassp->innerObject, targetCx, target))
        return JS_FALSE;
    }

    if (((classp->flags & JSCLASS_IS_EXTENDED) &&
          ((JSExtendedClass *) classp)->wrappedObject)) {
      if (!maybeIncludeObject(
            cx, info, "wrappedObject",
            ((JSExtendedClass *) classp)->wrappedObject(targetCx, target)
            ))
        return JS_FALSE;
    }

    *rval = OBJECT_TO_JSVAL(info);
  } else
    *rval = JSVAL_NULL;

  return JS_TRUE;
}

typedef struct RootMapStruct {
  JSBool rval;
  int length;
  JSContext *cx;
  JSObject *array;
};

static intN rootMapFun(void *rp, const char *name, void *data)
{
  // rp is a JS GC root. From the documentation for JS_AddRoot() in jsapi.h:
  //
  //   A JS GC root is a pointer to a JSObject *, JSString *, or
  //   jsdouble * that itself points into the GC heap (more recently,
  //   we support this extension: a root may be a pointer to a jsval v
  //   for which JSVAL_IS_GCTHING(v) is true).
  //
  // The public JSAPI appears to provide no way of actually determining
  // which it is, though, so we're just going to have to list them all,
  // and hope that a later tracing will give us more information about
  // them.

  RootMapStruct *roots = (RootMapStruct *) data;
  jsval id = SAFE_INT_TO_JSVAL(*((unsigned int *)rp));
  if (!JS_SetElement(roots->cx, roots->array, roots->length, &id)) {
    roots->rval = JS_FALSE;
    return JS_MAP_GCROOT_STOP;
  }
  roots->length++;
  return JS_MAP_GCROOT_NEXT;
}

static JSBool getGCRoots(JSContext *cx, JSObject *obj, uintN argc,
                         jsval *argv, jsval *rval)
{
  RootMapStruct roots;
  roots.array = JS_NewArrayObject(cx, 0, NULL);
  roots.length = 0;
  roots.rval = JS_TRUE;
  roots.cx = cx;

  if (roots.array == NULL) {
    JS_ReportError(cx, "Creating array failed.");
    return JS_FALSE;
  }

  JS_MapGCRoots(tracingState.runtime, rootMapFun, &roots);

  if (roots.rval == JS_FALSE)
    return JS_FALSE;

  *rval = OBJECT_TO_JSVAL(roots.array);
  return JS_TRUE;
}

static JSFunctionSpec server_global_functions[] = {
  JS_FS("ServerSocket",         createServerSocket, 0, 0, 0),
  JS_FS("getGCRoots",           getGCRoots,         0, 0, 0),
  JS_FS("getObjectInfo",        getObjInfo,         1, 0, 0),
  JS_FS("getObjectProperties",  getObjProperties,   1, 0, 0),
  JS_FS("getObjectProperty",    getObjProperty,     2, 0, 0),
  JS_FS("getNamedObjects",      getNamedObjects,    0, 0, 0),
  JS_FS_END
};

static JSBool doProfile(JSContext *cx, JSObject *obj, uintN argc,
                        jsval *argv, jsval *rval)
{
  // TODO: We really need to make sure everything gets cleaned up
  // properly if an error occurred here.

  JSString *code;
  const char *filename;
  uint32 lineNumber = 1;
  JSObject *namedObjects = NULL;

  if (!JS_ConvertArguments(cx, argc, argv, "Ss/uo", &code, &filename,
                           &lineNumber, &namedObjects))
    return JS_FALSE;

  if (!JS_DHashTableInit(&tracingState.visited, JS_DHashGetStubOps(),
                         NULL, sizeof(JSDHashEntryStub),
                         JS_DHASH_DEFAULT_CAPACITY(100))) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  tracingState.runtime = JS_GetRuntime(cx);
  tracingState.result = JS_TRUE;
  tracingState.namedObjects = namedObjects;
  tracingState.tracer.context = cx;
  tracingState.tracer.callback = visitedBuilder;
  JS_TraceRuntime(&tracingState.tracer);

  if (!tracingState.result)
    return JS_FALSE;

  JSRuntime *serverRuntime = JS_NewRuntime(8L * 1024L * 1024L);
  if (serverRuntime == NULL) {
    JS_ReportError(cx, "Couldn't create server JS runtime.");
    return JS_FALSE;
  }

  JSContext *serverCx = JS_NewContext(serverRuntime, 8192);
  if (serverCx == NULL) {
    JS_ReportError(cx, "Couldn't create server JS context.");
    return JS_FALSE;
  }
  JS_SetOptions(serverCx, JSOPTION_VAROBJFIX);
  JS_SetVersion(serverCx, JSVERSION_LATEST);

  JS_BeginRequest(serverCx);

  jsval serverRval;
  if (!TCB_init(serverCx, &serverRval))
    return JS_FALSE;

  JSObject *serverGlobal = JSVAL_TO_OBJECT(serverRval);

  if (!JS_DefineFunctions(serverCx, serverGlobal, server_global_functions))
    return JS_FALSE;

  JSBool wasSuccessful = JS_TRUE;

  if (!JS_EvaluateScript(serverCx, serverGlobal,
                         JS_GetStringBytes(code),
                         JS_GetStringLength(code),
                         filename, lineNumber,
                         &serverRval)) {
    TCB_handleError(serverCx, serverGlobal);
    JS_ReportError(cx, "Profiling failed.");
    wasSuccessful = JS_FALSE;
  }

  /* Cleanup. */
  JS_DHashTableFinish(&tracingState.visited);
  JS_EndRequest(serverCx);
  JS_DestroyContext(serverCx);
  JS_DestroyRuntime(serverRuntime);

  return wasSuccessful;
}

JSBool profileMemory(JSContext *cx, JSObject *obj, uintN argc,
                     jsval *argv, jsval *rval)
{
  return doProfile(cx, obj, argc, argv, rval);
}
