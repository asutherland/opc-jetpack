#include "jsdhash.h"

#include "tcb.h"
#include "memory_profiler.h"
#include "server_socket.h"

typedef struct {
  JSDHashEntryStub base;
  unsigned int id;
} Profiler_HashEntry;

// Private structure to track the state of tracing the JS heap.

typedef struct _TracingState {
  // C array that maps from object IDs to JSObject *'s in the runtime
  // that we're tracing.
  JSObject **ids;

  // The latest object ID that we've assigned.
  unsigned int currId;

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
} TracingState;

// Static singleton for tracking the state of tracing the JS heap.
static TracingState tracingState;

typedef struct _ChildTracingState {
  int numObjects;
  JSObject *objects;
  JSBool result;
  JSTracer tracer;
} ChildTracingState;

static ChildTracingState childTracingState;

typedef struct {
  JSDHashEntryStub base;
  JSString *string;
  int index;
} String_HashEntry;

class ProfilerRuntime {
public:
  JSRuntime *rt;
  JSContext *cx;
  JSObject *global;

  static JSFunctionSpec ProfilerRuntime::globalFunctions[];

  ProfilerRuntime(void);
  ~ProfilerRuntime();
  JSBool init(void);
};

// A class to 'mirror' strings in the target runtime as external strings
// in the profiling runtime. This allows us both to conserve memory and
// save time by not needlessly copying strings, and it also allows us
// to figure out how much space is being taken up by strings.
class ExtStringManager {
  ProfilerRuntime *profiler;

  // A hash table mapping strings in the external (target) runtime to
  // their 'mirrors' in the profiling runtime.
  JSDHashTable strings;

  // A rooted JavaScript Array that contains all the mirrored strings
  // in the profiling runtime, so we don't need to deal with GC'ing
  // them until we shut down the profiling runtime.
  JSObject *strArray;

  // Length of the mirrored string array.
  int strArrayLen;

  // Type index for our custom external string type.
  intN type;

  // The finalizer for our custom external string type.
  static void finalizeExtString(JSContext *cx, JSString *str) {
    // We've set things up so that this won't get called until
    // the memory profiling runtime is about to be shut down.
    // Since this 'external' string actually points to strings
    // owned by the target runtime, we do nothing here.
  }

public:
  ExtStringManager(void);
  ~ExtStringManager();

  // Converts a string from the target runtime to an 'external' string
  // in the profiling runtime, returning NULL on failure.
  JSString *getExtString(JSString *extString);

  // Initializes the string manager. If it returns JS_FALSE, an
  // exception will be pending on the context.
  JSBool init(ProfilerRuntime *aProfiler);
};

class MemoryProfiler {
private:
  static MemoryProfiler *gSelf;

  JSContext *targetCx;
  JSRuntime *targetRt;

  // The order in which these are listed is the order in which their
  // constructors are called, and the reverse order in which their
  // destructors are called.
  ProfilerRuntime runtime;
  ExtStringManager strings;

public:
  MemoryProfiler();
  ~MemoryProfiler();

  static MemoryProfiler *get() {
    return gSelf;
  }

  ExtStringManager *getStrings() {
    return &strings;
  }

  JSBool profile(JSContext *cx, JSString *code, const char *filename,
                 uint32 lineNumber, JSObject *namedObjects,
                 JSString *argument, jsval *rval);
};

static uint32 lookupIdForThing(void *thing);

// JSTraceCallback to build object children.
static void childBuilder(JSTracer *trc, void *thing, uint32 kind)
{
  if (kind == JSTRACE_OBJECT) {
    if (!JS_DefineElement(trc->context,
                          childTracingState.objects,
                          childTracingState.numObjects,
                          INT_TO_JSVAL(lookupIdForThing(thing)),
                          NULL, NULL, JSPROP_ENUMERATE))
      childTracingState.result = JS_FALSE;
    else
      childTracingState.numObjects++;
  }
}

// JSTraceCallback to build a hashtable of existing object references.
static void visitedBuilder(JSTracer *trc, void *thing, uint32 kind)
{
  Profiler_HashEntry *entry;

  switch (kind) {
  case JSTRACE_OBJECT:
    entry = (Profiler_HashEntry *)
      JS_DHashTableOperate(&tracingState.visited,
                           thing,
                           JS_DHASH_LOOKUP);
    if (JS_DHASH_ENTRY_IS_FREE((JSDHashEntryHdr *)entry)) {
      entry = (Profiler_HashEntry *) JS_DHashTableOperate(
        &tracingState.visited,
        thing,
        JS_DHASH_ADD
        );
      if (entry == NULL) {
        JS_ReportOutOfMemory(trc->context);
        tracingState.result = JS_FALSE;
        return;
      }
      entry->base.key = thing;
      entry->id = tracingState.currId++;
      JS_TraceChildren(trc, thing, kind);
    }
    break;
  case JSTRACE_DOUBLE:
    break;
  case JSTRACE_STRING:
    break;
  }
}

// Given a small positive integer ID, return the JSObject * mapping to
// it, or NULL if no such object exists.
static JSObject *lookupObjectForId(uint32 id)
{
  if (id > 0 && id < tracingState.currId)
    return tracingState.ids[id];
  return NULL;
}

// Given a JSObject *, return the small positive integer ID mapping to
// it, or 0 if no such object exists.
static uint32 lookupIdForThing(void *thing)
{
  Profiler_HashEntry *entry;
  entry = (Profiler_HashEntry *)
    JS_DHashTableOperate(&tracingState.visited,
                         thing,
                         JS_DHASH_LOOKUP);
  
  if (entry == NULL)
    return 0;

  if (JS_DHASH_ENTRY_IS_BUSY((JSDHashEntryHdr *)entry))
    return entry->id;
  else
    return 0;
}

static JSBool getChildrenInfo(JSContext *cx, JSObject *info,
                              JSObject *target, JSContext *targetCx)
{
  childTracingState.tracer.context = targetCx;
  childTracingState.tracer.callback = childBuilder;
  childTracingState.numObjects = 0;
  childTracingState.result = JS_TRUE;

  JSObject *objects = JS_NewArrayObject(cx, 0, NULL);
  if (!objects) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  childTracingState.objects = objects;
  JS_TraceChildren(&childTracingState.tracer, target, JSTRACE_OBJECT);

  if (!(childTracingState.result &&
        JS_SetArrayLength(cx, objects, childTracingState.numObjects)))
    return JS_FALSE;

  return JS_DefineProperty(cx, info, "children", OBJECT_TO_JSVAL(objects),
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
      ExtStringManager *strings = MemoryProfiler::get()->getStrings();
      JSString *funcName = strings->getExtString(targetFuncName);
      if (!funcName) {
        JS_ReportOutOfMemory(cx);
        return JS_FALSE;
      }
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
    value = INT_TO_JSVAL(lookupIdForThing(valueObj));
  } else if (JSVAL_IS_STRING(value)) {
    ExtStringManager *strings = MemoryProfiler::get()->getStrings();
    JSString *valueStr = strings->getExtString(JSVAL_TO_STRING(value));
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
                           INT_TO_JSVAL(lookupIdForThing(obj)),
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
  *id = lookupIdForThing(obj);

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

  JSObject *obj = lookupObjectForId(id);
  if (obj)
    *rval = OBJECT_TO_JSVAL(obj);
  else
    *rval = JSVAL_NULL;

  return JS_TRUE;
}

static JSBool getObjProperty(JSContext *cx, JSObject *obj, uintN argc,
                             jsval *argv, jsval *rval)
{
  jsval targetVal;

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

static JSDHashOperator mapIdsToObjects(JSDHashTable *table,
                                       JSDHashEntryHdr *hdr,
                                       uint32 number,
                                       void *arg)
{
  Profiler_HashEntry *entry = (Profiler_HashEntry *) hdr;
  tracingState.ids[entry->id] = (JSObject *) entry->base.key;
  return JS_DHASH_NEXT;
}

static JSBool getObjTable(JSContext *cx, JSObject *obj, uintN argc,
                          jsval *argv, jsval *rval)
{
  JSObject *table = JS_NewObject(cx, NULL, NULL, NULL);

  if (table == NULL)
    return JS_FALSE;

  *rval = OBJECT_TO_JSVAL(table);

  for (unsigned int i = 1; i < tracingState.currId; i++) {
    JSObject *target = tracingState.ids[i];
    jsval value = JSVAL_NULL;
    JSContext *targetCx = tracingState.tracer.context;
    JSClass *classp = JS_GET_CLASS(targetCx, target);

    if (classp) {
      JSString *name = JS_InternString(cx, classp->name);
      if (name == NULL) {
        JS_ReportOutOfMemory(cx);
        return JS_FALSE;
      }
      value = STRING_TO_JSVAL(name);
    }

    if (!JS_DefineElement(cx, table, i,
                          value, NULL, NULL,
                          JSPROP_ENUMERATE | JSPROP_INDEX)) {
      JS_ReportError(cx, "JS_DefineElement() failed");
      return JS_FALSE;
    }
  }

  return JS_TRUE;
}

static JSBool getObjParent(JSContext *cx, JSObject *obj, uintN argc,
                           jsval *argv, jsval *rval)
{
  jsval targetVal;

  if (!getJSObject(cx, argc, argv, &targetVal))
    return JS_FALSE;

  if (JSVAL_IS_OBJECT(targetVal) && !JSVAL_IS_NULL(targetVal)) {
    JSObject *target = JSVAL_TO_OBJECT(targetVal);
    JSContext *targetCx = tracingState.tracer.context;

    JSObject *parent = JS_GetParent(targetCx, target);
    if (parent) {
      *rval = INT_TO_JSVAL(lookupIdForThing(parent));
      return JS_TRUE;
    }
  }

  *rval = JSVAL_NULL;
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
                             INT_TO_JSVAL(lookupIdForThing(target)),
                             NULL, NULL,
                             JSPROP_ENUMERATE))
        return JS_FALSE;

      JSString *name = JS_InternString(cx, classp->name);
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

typedef struct _RootMapStruct {
  JSBool rval;
  int length;
  JSContext *cx;
  JSObject *array;
} RootMapStruct;

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
  uint32 objId = lookupIdForThing(*((void **)rp));
  if (objId) {
    jsval id = INT_TO_JSVAL(objId);
    if (!JS_SetElement(roots->cx, roots->array, roots->length, &id)) {
      roots->rval = JS_FALSE;
      return JS_MAP_GCROOT_STOP;
    }
    roots->length++;
  }
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

JSFunctionSpec ProfilerRuntime::globalFunctions[] = {
  JS_FS("ServerSocket",         createServerSocket, 0, 0, 0),
  JS_FS("getGCRoots",           getGCRoots,         0, 0, 0),
  JS_FS("getObjectParent",      getObjParent,       1, 0, 0),
  JS_FS("getObjectInfo",        getObjInfo,         1, 0, 0),
  JS_FS("getObjectProperties",  getObjProperties,   1, 0, 0),
  JS_FS("getObjectProperty",    getObjProperty,     2, 0, 0),
  JS_FS("getNamedObjects",      getNamedObjects,    0, 0, 0),
  JS_FS("getObjectTable",       getObjTable,        0, 0, 0),
  JS_FS_END
};

JSBool profileMemory(JSContext *cx, JSObject *obj, uintN argc,
                     jsval *argv, jsval *rval)
{
  JSString *code;
  const char *filename;
  uint32 lineNumber = 1;
  JSObject *namedObjects = NULL;
  JSString *argument = NULL;

  if (!JS_ConvertArguments(cx, argc, argv, "Ss/uoS", &code, &filename,
                           &lineNumber, &namedObjects, &argument))
    return JS_FALSE;

  MemoryProfiler profiler;

  return profiler.profile(cx, code, filename, lineNumber, namedObjects,
                          argument, rval);
}

ProfilerRuntime::ProfilerRuntime(void) :
  rt(NULL),
  cx(NULL),
  global(NULL)
{
}

ProfilerRuntime::~ProfilerRuntime()
{
  if (cx) {
    JS_EndRequest(cx);
    JS_DestroyContext(cx);
    cx = NULL;
  }

  if (rt) {
    JS_DestroyRuntime(rt);
    rt = NULL;
  }

  global = NULL;
}

JSBool ProfilerRuntime::init(void)
{
  rt = JS_NewRuntime(8L * 1024L * 1024L);
  if (!rt)
    return JS_FALSE;

  cx = JS_NewContext(rt, 8192);
  if (!cx)
    return JS_FALSE;

  JS_SetOptions(cx, JSOPTION_VAROBJFIX | JSOPTION_JIT);
  JS_SetVersion(cx, JSVERSION_LATEST);
  JS_BeginRequest(cx);

  jsval rval;
  if (!TCB_init(cx, &rval))
    return JS_FALSE;

  // Note that this is already rooted in our context.
  global = JSVAL_TO_OBJECT(rval);

  if (!JS_DefineFunctions(cx, global, globalFunctions))
    return JS_FALSE;

  return JS_TRUE;
}

ExtStringManager::ExtStringManager(void) :
  profiler(NULL),
  strArray(NULL),
  strArrayLen(0),
  type(-1)
{
  strings.ops = NULL;
}

ExtStringManager::~ExtStringManager()
{
  if (profiler && strArray) {
    JS_RemoveRoot(profiler->cx, &strArray);
    strArray = NULL;
  }

  profiler = NULL;

  if (strings.ops) {
    JS_DHashTableFinish(&strings);
    strings.ops = NULL;
  }

  if (type > 0) {
    JS_RemoveExternalStringFinalizer(finalizeExtString);
    type = -1;
  }
}

JSString *ExtStringManager::getExtString(JSString *extString)
{
  String_HashEntry *entry = (String_HashEntry *)
    JS_DHashTableOperate(&strings,
                         extString,
                         JS_DHASH_LOOKUP);
  if (JS_DHASH_ENTRY_IS_FREE((JSDHashEntryHdr *)entry)) {
    JSString *str = JS_NewExternalString(profiler->cx,
                                         JS_GetStringChars(extString),
                                         JS_GetStringLength(extString),
                                         type);
    if (!str)
      return NULL;

    entry = (String_HashEntry *) JS_DHashTableOperate(&strings,
                                                      extString,
                                                      JS_DHASH_ADD);
    if (entry == NULL)
      return NULL;

    entry->base.key = extString;
    entry->string = str;
    entry->index = strArrayLen;

    if (!JS_DefineElement(
          profiler->cx, strArray, entry->index,
          STRING_TO_JSVAL(entry->string),
          NULL, NULL,
          JSPROP_ENUMERATE | JSPROP_READONLY | JSPROP_PERMANENT
          ))
      return NULL;

    strArrayLen++;
    
    if (!JS_SetArrayLength(profiler->cx, strArray, strArrayLen))
      return NULL;
  }
  return entry->string;
}

JSBool ExtStringManager::init(ProfilerRuntime *aProfiler)
{
  profiler = aProfiler;
  JSContext *cx = profiler->cx;

  // TODO: We need to ensure that we're the only JS thread running
  // when we do this, or bad things will happen, according to the docs.
  type = JS_AddExternalStringFinalizer(finalizeExtString);
  if (type == -1) {
    JS_ReportError(cx, "JS_AddExternalStringFinalizer() failed");
    return JS_FALSE;
  }

  strArray = JS_NewArrayObject(cx, 0, NULL);
  if (!(strArray &&
        JS_AddNamedRoot(cx, &strArray, "ExtStringManager Array"))) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  if (!JS_DHashTableInit(&strings, JS_DHashGetStubOps(),
                         NULL, sizeof(String_HashEntry),
                         JS_DHASH_DEFAULT_CAPACITY(100))) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }
  return JS_TRUE;
}

MemoryProfiler *MemoryProfiler::gSelf;

MemoryProfiler::MemoryProfiler() :
  targetCx(NULL),
  targetRt(NULL)
{
  if (!gSelf)
    gSelf = this;
}

MemoryProfiler::~MemoryProfiler()
{
  if (gSelf == this)
    gSelf = NULL;
}

class AutoCleanupTracingState {
public:
  ~AutoCleanupTracingState() {
    if (tracingState.ids) {
      PR_Free(tracingState.ids);
      tracingState.ids = NULL;
    }

    if (tracingState.visited.ops) {
      JS_DHashTableFinish(&tracingState.visited);
      tracingState.visited.ops = NULL;
    }
  }
};

JSBool MemoryProfiler::profile(JSContext *cx, JSString *code,
                               const char *filename, uint32 lineNumber,
                               JSObject *namedObjects, JSString *argument,
                               jsval *rval)
{
  if (gSelf != this) {
    JS_ReportError(cx, "memory profiling singleton already exists");
    return JS_FALSE;
  }

  targetCx = cx;
  targetRt = JS_GetRuntime(cx);

  if (!runtime.init())
    return JS_FALSE;

  if (!strings.init(&runtime))
    return JS_FALSE;

  AutoCleanupTracingState autoCleanupTracingState;

  if (!JS_DHashTableInit(&tracingState.visited, JS_DHashGetStubOps(),
                         NULL, sizeof(Profiler_HashEntry),
                         JS_DHASH_DEFAULT_CAPACITY(100))) {
    JS_ReportOutOfMemory(targetCx);
    return JS_FALSE;
  }

  tracingState.currId = 1;
  tracingState.ids = NULL;
  tracingState.runtime = targetRt;
  tracingState.result = JS_TRUE;
  tracingState.namedObjects = namedObjects;
  tracingState.tracer.context = targetCx;
  tracingState.tracer.callback = visitedBuilder;
  JS_TraceRuntime(&tracingState.tracer);

  if (!tracingState.result)
    return JS_FALSE;

  tracingState.ids = (JSObject **)PR_Malloc(
    (tracingState.currId) * sizeof(JSObject *)
    );
  if (tracingState.ids == NULL) {
    JS_ReportOutOfMemory(targetCx);
    return JS_FALSE;
  }
  tracingState.ids[0] = NULL;
  JS_DHashTableEnumerate(&tracingState.visited,
                         mapIdsToObjects,
                         NULL);

  jsval argumentVal = JSVAL_NULL;

  if (argument) {
    JSString *serverArgumentStr = strings.getExtString(argument);
    if (serverArgumentStr == NULL) {
      JS_ReportOutOfMemory(targetCx);
      return JS_FALSE;
    }
    argumentVal = STRING_TO_JSVAL(serverArgumentStr);
  }

  if (!JS_DefineProperty(runtime.cx, runtime.global, "argument",
                         argumentVal, NULL, NULL, JSPROP_ENUMERATE))
    return JS_FALSE;

  jsval scriptRval;

  if (!JS_EvaluateScript(runtime.cx, runtime.global,
                         JS_GetStringBytes(code),
                         JS_GetStringLength(code),
                         filename, lineNumber,
                         &scriptRval)) {
    TCB_handleError(runtime.cx, runtime.global);
    JS_ReportError(targetCx, "Profiling failed.");
    return JS_FALSE;
  } else {
    if (JSVAL_IS_STRING(scriptRval)) {
      JSString *scriptRstring = JS_NewUCStringCopyZ(
        targetCx,
        JS_GetStringChars(JSVAL_TO_STRING(scriptRval))
        );
      if (scriptRstring == NULL) {
        JS_ReportOutOfMemory(targetCx);
        return JS_FALSE;
      } else
        *rval = STRING_TO_JSVAL(scriptRstring);
    } else if (!JSVAL_IS_GCTHING(scriptRval)) {
      *rval = scriptRval;
    } else {
      *rval = JSVAL_VOID;
    }
  }

  return JS_TRUE;
}
