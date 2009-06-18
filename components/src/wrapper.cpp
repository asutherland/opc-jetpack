#include "wrapper.h"

// Reserved slot ID for the resolver (meta) object
#define SLOT_RESOLVER 0

// Reserved slot ID for the object to be wrapped
#define SLOT_WRAPPEE  1

static JSBool
toString(JSContext *cx, JSObject *obj, uintN argc, jsval *argv,
         jsval *rval)
{
  JSString *str = JS_NewStringCopyZ(cx, "[object XPCFlexibleWrapper]");
  if (!str)
    return JS_FALSE;

  *rval = STRING_TO_JSVAL(str);
  return JS_TRUE;
}

static JSBool
delegateToResolver(JSContext *cx, JSObject *obj, const char *name,
                   uintN argc, jsval *argv, jsval *rval, jsval defaultRval)
{
  jsval resolver;
  if (!JS_GetReservedSlot(cx, obj, SLOT_RESOLVER, &resolver))
    return JS_FALSE;
  JSObject *resolverObj = JSVAL_TO_OBJECT(resolver);
  
  JSBool hasProperty;
  if (!JS_HasProperty(cx, resolverObj, name, &hasProperty))
    return JS_FALSE;
  if (!hasProperty) {
    *rval = defaultRval;
    return JS_TRUE;
  }

  uintN allArgc = argc + 2;
  jsval allArgv[10];
  if (allArgc > 10) {
    JS_ReportError(cx, "Didn't expect so many args!");
    return JS_FALSE;
  }

  if (!JS_GetReservedSlot(cx, obj, SLOT_WRAPPEE, allArgv))
    return JS_FALSE;
  allArgv[1] = OBJECT_TO_JSVAL(obj);

  for (int i = 0; i < argc; i++)
    allArgv[i + 2] = argv[i];

  if (!JS_CallFunctionName(cx, resolverObj, name, allArgc, allArgv, rval))
    return JS_FALSE;
  return JS_TRUE;
}

static JSBool
enumerate(JSContext *cx, JSObject *obj)
{
  jsval rval;
  if (!delegateToResolver(cx, obj, "enumerate", 0, NULL, &rval, JSVAL_VOID))
    return JS_FALSE;

  return JS_TRUE;
}

static JSBool
resolve(JSContext *cx, JSObject *obj, jsval id, uintN flags,
        JSObject **objp)
{
  jsval rval;
  jsval args[1];
  args[0] = id;
  if (!delegateToResolver(cx, obj, "resolve", 1, args, &rval, JSVAL_VOID))
    return JS_FALSE;

  if (JSVAL_IS_OBJECT(rval))
    *objp = JSVAL_TO_OBJECT(rval);

  return JS_TRUE;
}

static JSBool
propertyOp(const char *name, JSContext *cx, JSObject *obj, jsval id,
           jsval *vp)
{
  jsval rval;
  jsval args[2];
  args[0] = id;
  args[1] = *vp;
  if (!delegateToResolver(cx, obj, name, 2, args, &rval, JSVAL_VOID))
    return JS_FALSE;

  if (!JSVAL_IS_VOID(rval))
    *vp = rval;
  return JS_TRUE;
}

static JSBool
addProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp)
{
  return propertyOp("addProperty", cx, obj, id, vp);
}

static JSBool
delProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp)
{
  jsval rval;
  jsval args[1];
  args[0] = id;
  if (!delegateToResolver(cx, obj, "delProperty", 1, args, &rval, JSVAL_TRUE))
    return JS_FALSE;

  // TODO: The MDC docs say that setting *vp to JSVAL_FALSE and then
  // returning JS_TRUE should indicate that the property can't be
  // deleted, but this doesn't seem to actually be the case.
  if (!JSVAL_IS_BOOLEAN(rval)) {
    JS_ReportError(cx, "delProperty must return a boolean");
    return JS_FALSE;
  }
  *vp = rval;
  return JS_TRUE;
}

static JSBool
getProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp)
{
  return propertyOp("getProperty", cx, obj, id, vp);
}

static JSBool
setProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp)
{
  return propertyOp("setProperty", cx, obj, id, vp);
}

static JSBool
checkAccess(JSContext *cx, JSObject *obj, jsid id, JSAccessMode mode,
            jsval *vp)
{
  // TODO: This effectively overrides the default JS_CheckAccess() and
  // always grants access to any property on the object!
  return JS_GetPropertyById(cx, obj, id, vp);
}

static JSObject *
wrappedObject(JSContext *cx, JSObject *obj) {
  jsval wrappee;
  if (!JS_GetReservedSlot(cx, obj, SLOT_WRAPPEE, &wrappee))
    return obj;
  return JSVAL_TO_OBJECT(wrappee);
}

static JSBool
equality(JSContext *cx, JSObject *obj, jsval v, JSBool *bp) {
  jsval rval;
  jsval args[1];
  args[0] = v;

  jsval defaultRval = JSVAL_FALSE;
  if (JSVAL_IS_OBJECT(v) && JSVAL_TO_OBJECT(v) == obj)
    defaultRval = JSVAL_TRUE;

  if (!delegateToResolver(cx, obj, "equality", 1, args, &rval, defaultRval))
    return JS_FALSE;

  if (!JSVAL_IS_BOOLEAN(rval)) {
    JS_ReportError(cx, "equality must return a boolean");
    return JS_FALSE;
  }
  *bp = JSVAL_TO_BOOLEAN(rval);
  return JS_TRUE;
}

JSExtendedClass sXPC_FlexibleWrapper_JSClass = {
  // JSClass (JSExtendedClass.base) initialization
  { "XPCFlexibleWrapper",
    JSCLASS_NEW_RESOLVE | JSCLASS_IS_EXTENDED |
    JSCLASS_HAS_RESERVED_SLOTS(2),
    addProperty,        delProperty,
    getProperty,        setProperty,
    enumerate,          (JSResolveOp)resolve,
    JS_ConvertStub,     JS_FinalizeStub,
    NULL,               checkAccess,
    NULL,               NULL,
    NULL,               NULL,
    NULL,               NULL
  },
  // JSExtendedClass initialization
  equality,
  NULL, // outerObject
  NULL, // innerObject
  NULL, // iterator
  wrappedObject,
  JSCLASS_NO_RESERVED_MEMBERS
};

JSObject *wrapObject(JSContext *cx, jsval object, jsval resolver)
{
  JSObject *obj = JS_NewObject(
    cx,
    &sXPC_FlexibleWrapper_JSClass.base,
    NULL,
    NULL
    );
  JS_SetReservedSlot(cx, obj, SLOT_RESOLVER, resolver);
  JS_SetReservedSlot(cx, obj, SLOT_WRAPPEE, object);
  JS_DefineFunction(cx, obj, "toString", toString, 0, 0);
  return obj;
}
