#include "jsdhash.h"

#include "tcb.h"
#include "memory_profiler.h"
#include "server_socket.h"

typedef struct {
  JSDHashEntryStub base;
  unsigned int id;
} Profiler_HashEntry;

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

// A class that encapsulates the profiler's JS runtime and
// associated data.
class ProfilerRuntime {
private:
  // Disallow copy constructors and assignment.
  ProfilerRuntime(const ProfilerRuntime&);
  ProfilerRuntime& operator= (const ProfilerRuntime&);

public:
  // JS runtime for our profiler.
  JSRuntime *rt;

  // JS context for any code that runs.
  JSContext *cx;

  // Global object for any code that runs.
  JSObject *global;

  // The runtime's global functions.
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
private:
  // Disallow copy constructors and assignment.
  ExtStringManager(const ExtStringManager&);
  ExtStringManager& operator= (const ExtStringManager&);

  // Memory profiling runtime.
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
  JSString *getExt(JSString *extString);

  // Initializes the string manager. If it returns JS_FALSE, an
  // exception will be pending on the context.
  JSBool init(ProfilerRuntime *aProfiler);
};

class MemoryProfiler;

class ExtObjectManager {
private:
  // Disallow copy constructors and assignment.
  ExtObjectManager(const ExtObjectManager&);
  ExtObjectManager& operator= (const ExtObjectManager&);

  // C array that maps from object IDs to JSObject *'s in the runtime
  // that we're tracing.
  JSObject **ids;

  // The latest object ID that we've assigned.
  unsigned int currId;

  // Keeps track of what objects we've visited so far.
  JSDHashTable visited;

  // Whether the tracing operation is successful or failed.
  JSBool tracerResult;

  // Structure required to use JS tracing functions.
  JSTracer tracer;

  JSContext *targetCx;
  JSContext *cx;

  JSBool getChildrenInfo(JSObject *info, JSObject *target);

  JSBool getFunctionInfo(JSObject *info, JSObject *target);

  JSBool maybeIncludeObject(JSObject *info, const char *objName,
                            JSObject *obj);

  JSBool maybeIncludeObjectOp(JSObject *info, const char *objName,
                              JSObjectOp objOp, JSObject *target);

  JSBool lookupNamedObject(const char *name, uint32 *rid);

  // JSTraceCallback to build a hashtable of existing object references.
  static void visitedBuilder(JSTracer *trc, void *thing, uint32 kind);

  static JSDHashOperator mapIdsToObjects(JSDHashTable *table,
                                         JSDHashEntryHdr *hdr,
                                         uint32 number,
                                         void *arg);

public:
  ExtObjectManager(void);
  ~ExtObjectManager();

  JSBool init(ProfilerRuntime *profiler, JSContext *atargetCx,
              JSObject *anamedTargetObjects);

  JSBool copyPropertyInfo(JSObject *propInfo, jsid targetPropId,
                          const char *name, JSObject *target);

  JSBool getPropertiesInfo(JSObject *propInfo, JSObject *target);

  JSBool getPropertiesInfo2(JSObject *propInfo, JSObject *target);

  JSBool getTargetTable(jsval *rval);

  // Mapping from strings to objects for the profiler's convenience.
  // This object is owned by the target runtime.
  JSObject *namedTargetObjects;

  // Create a 'dictionary' of information about the target object
  // and put it in rval. Return JS_FALSE if an error occurs.
  JSBool getInfoForTarget(JSObject *target, jsval *rval);

  // Given a named object string or an object ID at the front of argv,
  // get the object in the JS runtime we're profiling and put it in
  // rtarget. If it doesn't exist, put NULL in rtarget. If an error
  // occurs, return JS_FALSE.
  JSBool getTarget(uintN argc, jsval *argv, JSObject **rtarget);

  // Given a JSObject * in the target runtime, return the small
  // positive integer ID mapping to it, or 0 if no such object exists.
  uint32 lookupIdForTarget(JSObject *target);

  // Given a small positive integer ID, return the JSObject * mapping to
  // it, or NULL if no such object exists. The JSObject * is property
  // of the target runtime.
  JSObject *lookupTargetForId(uint32 id);
};

// A singleton class that encapsulates the entire state of the memory
// profiler.
class MemoryProfiler {
private:
  // Disallow copy constructors and assignment.
  MemoryProfiler(const MemoryProfiler&);
  MemoryProfiler& operator= (const MemoryProfiler&);

  // Singleton instance.
  static MemoryProfiler *gSelf;

public:
  MemoryProfiler();
  ~MemoryProfiler();

  // JS context of the target JS runtime that called us.
  JSContext *targetCx;

  // JS runtime that we're profiling (and which called us).
  JSRuntime *targetRt;

  // The order in which these are listed is the order in which their
  // constructors are called, and the reverse order in which their
  // destructors are called.
  ProfilerRuntime runtime;
  ExtStringManager strings;
  ExtObjectManager objects;

  // Return the profiler's singleton instance.
  static MemoryProfiler *get() {
    return gSelf;
  }

  // Run a profiling script.
  JSBool profile(JSContext *cx, JSString *code, const char *filename,
                 uint32 lineNumber, JSObject *namedObjects,
                 JSString *argument, jsval *rval);
};

// JSTraceCallback to build object children.
static void childBuilder(JSTracer *trc, void *thing, uint32 kind)
{
  if (kind == JSTRACE_OBJECT) {
    ExtObjectManager &objects = MemoryProfiler::get()->objects;
    uint32 id = objects.lookupIdForTarget((JSObject *) thing);

    if (!JS_DefineElement(trc->context,
                          childTracingState.objects,
                          childTracingState.numObjects,
                          INT_TO_JSVAL(id),
                          NULL, NULL, JSPROP_ENUMERATE))
      childTracingState.result = JS_FALSE;
    else
      childTracingState.numObjects++;
  }
}

void ExtObjectManager::visitedBuilder(JSTracer *trc, void *thing,
                                      uint32 kind)
{
  ExtObjectManager &self = MemoryProfiler::get()->objects;
  Profiler_HashEntry *entry;

  if (!self.tracerResult)
    return;

  switch (kind) {
  case JSTRACE_OBJECT:
    entry = (Profiler_HashEntry *)
      JS_DHashTableOperate(&self.visited,
                           thing,
                           JS_DHASH_LOOKUP);
    if (JS_DHASH_ENTRY_IS_FREE((JSDHashEntryHdr *)entry)) {
      entry = (Profiler_HashEntry *) JS_DHashTableOperate(
        &self.visited,
        thing,
        JS_DHASH_ADD
        );
      if (entry == NULL) {
        JS_ReportOutOfMemory(trc->context);
        self.tracerResult = JS_FALSE;
        return;
      }
      entry->base.key = thing;
      entry->id = self.currId++;
      JS_TraceChildren(trc, thing, kind);
    }
    break;
  case JSTRACE_DOUBLE:
    break;
  case JSTRACE_STRING:
    break;
  }
}

JSObject *ExtObjectManager::lookupTargetForId(uint32 id)
{
  if (id > 0 && id < currId)
    return ids[id];
  return NULL;
}

uint32 ExtObjectManager::lookupIdForTarget(JSObject *target)
{
  Profiler_HashEntry *entry;
  entry = (Profiler_HashEntry *)
    JS_DHashTableOperate(&visited,
                         target,
                         JS_DHASH_LOOKUP);
  
  if (entry == NULL)
    return 0;

  if (JS_DHASH_ENTRY_IS_BUSY((JSDHashEntryHdr *)entry))
    return entry->id;
  else
    return 0;
}

ExtObjectManager::ExtObjectManager(void) :
  ids(NULL),
  currId(1),
  targetCx(NULL),
  cx(NULL),
  namedTargetObjects(NULL)
{
  visited.ops = NULL;
}

ExtObjectManager::~ExtObjectManager()
{
  if (ids) {
    PR_Free(ids);
    ids = NULL;
  }

  if (visited.ops) {
    JS_DHashTableFinish(&visited);
    visited.ops = NULL;
  }

  cx = NULL;
  targetCx = NULL;
  namedTargetObjects = NULL;
}

JSDHashOperator ExtObjectManager::mapIdsToObjects(JSDHashTable *table,
                                                  JSDHashEntryHdr *hdr,
                                                  uint32 number,
                                                  void *arg)
{
  ExtObjectManager *self = (ExtObjectManager *) arg;
  Profiler_HashEntry *entry = (Profiler_HashEntry *) hdr;
  self->ids[entry->id] = (JSObject *) entry->base.key;
  return JS_DHASH_NEXT;
}

JSBool ExtObjectManager::init(ProfilerRuntime *profiler,
                              JSContext *atargetCx,
                              JSObject *anamedTargetObjects)
{
  if (cx) {
    JS_ReportError(atargetCx, "ExtObjectManager already inited");
    return JS_FALSE;
  }

  cx = profiler->cx;
  targetCx = atargetCx;
  namedTargetObjects = anamedTargetObjects;

  if (!JS_DHashTableInit(&visited, JS_DHashGetStubOps(),
                         NULL, sizeof(Profiler_HashEntry),
                         JS_DHASH_DEFAULT_CAPACITY(100))) {
    JS_ReportOutOfMemory(targetCx);
    return JS_FALSE;
  }

  tracerResult = JS_TRUE;
  tracer.context = targetCx;
  tracer.callback = visitedBuilder;
  JS_TraceRuntime(&tracer);

  if (!tracerResult)
    return JS_FALSE;

  ids = (JSObject **)PR_Malloc((currId) * sizeof(JSObject *));
  if (ids == NULL) {
    JS_ReportOutOfMemory(targetCx);
    return JS_FALSE;
  }
  ids[0] = NULL;
  JS_DHashTableEnumerate(&visited,
                         mapIdsToObjects,
                         this);

  return JS_TRUE;
}

JSBool ExtObjectManager::getChildrenInfo(JSObject *info, JSObject *target)
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

JSBool ExtObjectManager::getFunctionInfo(JSObject *info, JSObject *target)
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
      ExtStringManager &strings = MemoryProfiler::get()->strings;
      JSString *funcName = strings.getExt(targetFuncName);
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

JSBool ExtObjectManager::copyPropertyInfo(JSObject *propInfo,
                                          jsid targetPropId,
                                          const char *name,
                                          JSObject *target)
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
    value = INT_TO_JSVAL(lookupIdForTarget(valueObj));
  } else if (JSVAL_IS_STRING(value)) {
    ExtStringManager &strings = MemoryProfiler::get()->strings;
    JSString *valueStr = strings.getExt(JSVAL_TO_STRING(value));
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

JSBool ExtObjectManager::getPropertiesInfo2(JSObject *propInfo,
                                            JSObject *target)
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

    if (!copyPropertyInfo(propInfo, iterId, NULL, target))
      return JS_FALSE;
  }

  return JS_TRUE;
}

JSBool ExtObjectManager::getPropertiesInfo(JSObject *propInfo,
                                           JSObject *target)
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
    if (!copyPropertyInfo(propInfo,
                          ids->vector[i], NULL, target)) {
      success = JS_FALSE;
      break;
    }
  }

  JS_DestroyIdArray(targetCx, ids);

  return success;
}

JSBool ExtObjectManager::maybeIncludeObject(JSObject *info,
                                            const char *objName,
                                            JSObject *obj)
{
  if (obj != NULL)
    if (!JS_DefineProperty(cx, info, objName,
                           INT_TO_JSVAL(lookupIdForTarget(obj)),
                           NULL, NULL, JSPROP_ENUMERATE))
      return JS_FALSE;
  return JS_TRUE;
}

JSBool ExtObjectManager::maybeIncludeObjectOp(JSObject *info,
                                              const char *objName,
                                              JSObjectOp objOp,
                                              JSObject *target)
{
  if (objOp)
    return maybeIncludeObject(info, objName, objOp(targetCx, target));
  return JS_TRUE;
}

JSBool ExtObjectManager::lookupNamedObject(const char *name,
                                           uint32 *id)
{
  *id = 0;

  if (namedTargetObjects == NULL)
    return JS_TRUE;

  JSBool found;
  if (!JS_HasProperty(targetCx,
                      namedTargetObjects,
                      name,
                      &found)) {
    JS_ReportError(cx, "JS_HasProperty() failed.");
    return JS_FALSE;
  }

  if (!found)
    return JS_TRUE;

  jsval val;
  if (!JS_LookupProperty(targetCx,
                         namedTargetObjects,
                         name,
                         &val)) {
    JS_ReportError(cx, "JS_LookupProperty failed.");
    return JS_FALSE;
  }

  if (!JSVAL_IS_OBJECT(val))
    return JS_TRUE;

  JSObject *obj = JSVAL_TO_OBJECT(val);
  *id = lookupIdForTarget(obj);

  return JS_TRUE;
}

JSBool ExtObjectManager::getInfoForTarget(JSObject *target,
                                          jsval *rval)
{
  JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);

  if (info == NULL) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  // This should root the object.
  *rval = OBJECT_TO_JSVAL(info);

  JSClass *classp = JS_GET_CLASS(targetCx, target);
  if (classp != NULL) {
    if (!JS_DefineProperty(cx, info, "id",
                           INT_TO_JSVAL(lookupIdForTarget(target)),
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

  if (!maybeIncludeObject(info, "parent",
                          JS_GetParent(targetCx, target)) ||
      !maybeIncludeObject(info, "prototype",
                          JS_GetPrototype(targetCx, target)))
    return JS_FALSE;

  // TODO: We used to include 'constructor' here too, but
  // we ran into a problem with Block objects, so removed it.

  if (JS_ObjectIsFunction(targetCx, target))
    if (!getFunctionInfo(info, target))
      return JS_FALSE;

  if (!getChildrenInfo(info, target))
    return JS_FALSE;

  if (classp->flags & JSCLASS_IS_EXTENDED) {
    JSExtendedClass *exClassp = (JSExtendedClass *) classp;

    if (!maybeIncludeObjectOp(info, "wrappedObject",
                              exClassp->wrappedObject, target) ||
        !maybeIncludeObjectOp(info, "outerObject",
                              exClassp->outerObject, target) ||
        !maybeIncludeObjectOp(info, "innerObject",
                              exClassp->innerObject, target))
      return JS_FALSE;
  }

  if (((classp->flags & JSCLASS_IS_EXTENDED) &&
       ((JSExtendedClass *) classp)->wrappedObject)) {
    if (!maybeIncludeObject(
          info, "wrappedObject",
          ((JSExtendedClass *) classp)->wrappedObject(targetCx, target)
          ))
      return JS_FALSE;
  }

  return JS_TRUE;
}

JSBool ExtObjectManager::getTargetTable(jsval *rval)
{
  JSObject *table = JS_NewObject(cx, NULL, NULL, NULL);

  if (table == NULL) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  // This should root table.
  *rval = OBJECT_TO_JSVAL(table);

  for (unsigned int i = 1; i < currId; i++) {
    jsval value = JSVAL_NULL;
    JSClass *classp = JS_GET_CLASS(targetCx, ids[i]);

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

JSBool ExtObjectManager::getTarget(uintN argc, jsval *argv,
                                   JSObject **rtarget)
{
  uint32 id;

  if (argc >= 1 && JSVAL_IS_STRING(argv[0])) {
    const char *name = JS_GetStringBytes(JSVAL_TO_STRING(argv[0]));
    if (!lookupNamedObject(name, &id))
      return JS_FALSE;
  } else
    if (!JS_ConvertArguments(cx, argc, argv, "u", &id))
      return JS_FALSE;

  *rtarget = lookupTargetForId(id);
  return JS_TRUE;
}

static JSBool getObjProperty(JSContext *cx, JSObject *obj, uintN argc,
                             jsval *argv, jsval *rval)
{
  JSObject *target;
  ExtObjectManager &objects = MemoryProfiler::get()->objects;

  if (!objects.getTarget(argc, argv, &target))
    return JS_FALSE;

  if (!(argc >= 2 && JSVAL_IS_STRING(argv[1]))) {
    JS_ReportError(cx, "Must supply a string as second parameter.");
    return JS_FALSE;
  }

  char *name = JS_GetStringBytes(JSVAL_TO_STRING(argv[1]));

  if (target) {
    JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);

    if (info == NULL) {
      JS_ReportOutOfMemory(cx);
      return JS_FALSE;
    }

    *rval = OBJECT_TO_JSVAL(info);
    return objects.copyPropertyInfo(info, NULL, name, target);
  }

  *rval = JSVAL_NULL;
  return JS_TRUE;
}

static JSBool getObjProperties(JSContext *cx, JSObject *obj, uintN argc,
                               jsval *argv, jsval *rval)
{
  JSObject *target;
  ExtObjectManager &objects = MemoryProfiler::get()->objects;

  if (!objects.getTarget(argc, argv, &target))
    return JS_FALSE;

  bool useGetPropertiesInfo2 = false;

  if (argc > 1 && argv[1] == JSVAL_TRUE)
    useGetPropertiesInfo2 = true;

  if (target) {
    JSObject *propInfo = JS_NewObject(cx, NULL, NULL, NULL);
    if (propInfo == NULL) {
      JS_ReportOutOfMemory(cx);
      return JS_FALSE;
    }

    *rval = OBJECT_TO_JSVAL(propInfo);

    if (useGetPropertiesInfo2)
      return objects.getPropertiesInfo2(propInfo, target);
    else
      return objects.getPropertiesInfo(propInfo, target);
  }

  *rval = JSVAL_NULL;
  return JSVAL_TRUE;
}

static JSBool getNamedObjects(JSContext *cx, JSObject *obj, uintN argc,
                              jsval *argv, jsval *rval)
{
  JSObject *info = JS_NewObject(cx, NULL, NULL, NULL);

  if (info == NULL) {
    JS_ReportOutOfMemory(cx);
    return JS_FALSE;
  }

  *rval = OBJECT_TO_JSVAL(info);

  ExtObjectManager &objects = MemoryProfiler::get()->objects;

  if (objects.namedTargetObjects != NULL)
    return objects.getPropertiesInfo(info, objects.namedTargetObjects);

  return JS_TRUE;
}

static JSBool getObjTable(JSContext *cx, JSObject *obj, uintN argc,
                          jsval *argv, jsval *rval)
{
  return MemoryProfiler::get()->objects.getTargetTable(rval);
}

static JSBool getObjParent(JSContext *cx, JSObject *obj, uintN argc,
                           jsval *argv, jsval *rval)
{
  JSObject *target;
  ExtObjectManager &objects = MemoryProfiler::get()->objects;

  if (!objects.getTarget(argc, argv, &target))
    return JS_FALSE;

  if (target) {
    JSObject *parent = JS_GetParent(MemoryProfiler::get()->targetCx,
                                    target);
    if (parent) {
      *rval = INT_TO_JSVAL(objects.lookupIdForTarget(parent));
      return JS_TRUE;
    }
  }

  *rval = JSVAL_NULL;
  return JS_TRUE;
}

static JSBool getObjInfo(JSContext *cx, JSObject *obj, uintN argc,
                         jsval *argv, jsval *rval)
{
  JSObject *target;
  ExtObjectManager &objects = MemoryProfiler::get()->objects;

  if (!objects.getTarget(argc, argv, &target))
    return JS_FALSE;

  if (target)
    return objects.getInfoForTarget(target, rval);

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

  ExtObjectManager &objects = MemoryProfiler::get()->objects;
  RootMapStruct *roots = (RootMapStruct *) data;
  uint32 objId = objects.lookupIdForTarget(*((JSObject **)rp));
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

  JS_MapGCRoots(MemoryProfiler::get()->targetRt, rootMapFun, &roots);

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

JSString *ExtStringManager::getExt(JSString *extString)
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

  if (!objects.init(&runtime, targetCx, namedObjects))
    return JS_FALSE;

  jsval argumentVal = JSVAL_NULL;

  if (argument) {
    JSString *serverArgumentStr = strings.getExt(argument);
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
