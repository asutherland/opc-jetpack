#include "jsdhash.h"

#include "tcb.h"
#include "memory_profiler.h"
#include "server_socket.h"

// Private structure to track the state of tracing the JS heap.

typedef struct TracingState {
  // Keeps track of what objects we've visited so far.
  JSDHashTable visited;

  // Whether the tracing operation is successful or failed.
  JSBool result;

  // Runtime that we're tracing.
  JSRuntime *runtime;

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
      childrenVals[currChild] = INT_TO_JSVAL((unsigned int) things[i]);
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
  JSScript *script = JS_GetFunctionScript(targetCx, fun);
  // script is null for native code.      
  if (script) {
    JSString *filename = JS_NewStringCopyZ(
      cx,
      JS_GetScriptFilename(targetCx, script)
      );
    uintN lineStart = JS_GetScriptBaseLineNumber(targetCx, script);
    uintN lineEnd = (lineStart +
                     JS_GetScriptLineExtent(targetCx, script) - 1);
    if (!JS_DefineProperty(cx, info, "filename",
                           STRING_TO_JSVAL(filename),
                           NULL, NULL, JSPROP_ENUMERATE) ||
        !JS_DefineProperty(cx, info, "lineStart",
                           INT_TO_JSVAL(lineStart),
                           NULL, NULL, JSPROP_ENUMERATE) ||
        !JS_DefineProperty(cx, info, "lineStart",
                           INT_TO_JSVAL(lineStart),
                           NULL, NULL, JSPROP_ENUMERATE))
      return JS_FALSE;
  }
  return JS_TRUE;
}

static JSBool getPropertiesInfo(JSContext *cx, JSObject *info,
                                JSObject *target, JSContext *targetCx)
{
  JSObject *propInfo = JS_NewObject(cx, NULL, NULL, NULL);
  if (propInfo == NULL) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  if (!JS_DefineProperty(cx, info, "properties", OBJECT_TO_JSVAL(propInfo),
                         NULL, NULL, JSPROP_ENUMERATE))
    return JS_FALSE;

  // TODO: It'd be nice if we could use the OBJ_IS_NATIVE() macro here,
  // but that appears to be defined in a private header, jsobj.h. Still,
  // leakmon uses it, so it might be OK if we do too:
  //
  // http://hg.mozilla.org/users/dbaron_mozilla.com/leak-monitor/file/88274af9f629/src/leakmonJSObjectInfo.cpp#l208
  //
  // It looks like JS_NewPropertyIterator() solves this issue and that
  // we should use it, but I keep getting an assertion in JS_NextProperty()
  // at "JS_ASSERT(scope->object == obj)" when doing this.

  JSIdArray *ids = JS_Enumerate(targetCx, target);
  if (ids == NULL)
    return JS_TRUE;

  for (int i = 0; i < ids->length; i++) {
    jsval id;
    if (!JS_IdToValue(targetCx, ids->vector[i], &id)) {
      JS_ReportError(cx, "JS_IdToValue() failed.");
      return JS_FALSE;
    }

    jsval value;
    JSObject *valueObj;
    if (!JS_LookupPropertyWithFlagsById(
          targetCx,
          target,
          ids->vector[i],
          JSRESOLVE_DETECTING,
          &valueObj,
          &value)) {
      JS_ReportError(cx, "JS_LookupPropertyWithFlagsById() failed.");
      return JS_FALSE;
    }
    if (JSVAL_IS_OBJECT(value)) {
      JSObject *valueObj = JSVAL_TO_OBJECT(value);
      value = INT_TO_JSVAL((unsigned int) valueObj);
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

    if (!JS_DefinePropertyById(
          cx, propInfo,
          ids->vector[i],
          value,
          NULL,
          NULL,
          JSPROP_ENUMERATE))
        return JS_FALSE;
  }

  return JS_TRUE;
}

static JSBool getObjInfo(JSContext *cx, JSObject *obj, uintN argc,
                         jsval *argv, jsval *rval)
{
  uint32 id;

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

  if (JS_DHASH_ENTRY_IS_BUSY((JSDHashEntryHdr *)entry)) {
    JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);
    *rval = OBJECT_TO_JSVAL(info);

    JSObject *target = (JSObject *) id;
    JSContext *targetCx = tracingState.tracer.context;
    JSClass *classp = JS_GET_CLASS(targetCx, target);
    if (classp != NULL) {
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

    if (JS_ObjectIsFunction(targetCx, target))
      if (!getFunctionInfo(cx, info, target, targetCx))
        return JS_FALSE;

    if (!getChildrenInfo(cx, info, target, targetCx))
      return JS_FALSE;

    // If this is a wrapper, don't worry about getting the
    // properties--assume the caller will get around to
    // inspecting the wrappee.
    if (!((classp->flags & JSCLASS_IS_EXTENDED) &&
          ((JSExtendedClass *) classp)->wrappedObject)) {
      if (!getPropertiesInfo(cx, info, target, targetCx))
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
  jsval id = INT_TO_JSVAL(*((unsigned int *)rp));
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
  JS_FS("ServerSocket",   createServerSocket, 0, 0, 0),
  JS_FS("getGCRoots",     getGCRoots,         0, 0, 0),
  JS_FS("getObjectInfo",  getObjInfo,         1, 0, 0),
  JS_FS_END
};

static JSBool doProfile(JSContext *cx, JSObject *obj, uintN argc,
                        jsval *argv, jsval *rval)
{
  // TODO: We really need to make sure everything gets cleaned up
  // properly if an error occurred here.

  JSString *code;
  const char *filename;

  if (!JS_ConvertArguments(cx, argc, argv, "Ss", &code, &filename))
    return JS_FALSE;

  if (!JS_DHashTableInit(&tracingState.visited, JS_DHashGetStubOps(),
                         NULL, sizeof(JSDHashEntryStub),
                         JS_DHASH_DEFAULT_CAPACITY(100))) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  tracingState.runtime = JS_GetRuntime(cx);
  tracingState.result = JS_TRUE;
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
                         filename, 1,
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
