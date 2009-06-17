#include "wrapper.h"

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
                   uintN argc, jsval *argv, jsval *rval)
{
  jsval resolver;
  if (!JS_GetReservedSlot(cx, obj, 0, &resolver))
    return JS_FALSE;
  JSObject *resolverObj = JSVAL_TO_OBJECT(resolver);
  if (!JS_CallFunctionName(cx, resolverObj, name, argc, argv, rval))
    return JS_FALSE;
  return JS_TRUE;
}

static JSBool
enumerate(JSContext *cx, JSObject *obj)
{
  jsval rval = NULL;
  jsval args[1];
  args[0] = OBJECT_TO_JSVAL(obj);
  if (!delegateToResolver(cx, obj, "enumerate", 1, args, &rval))
    return JS_FALSE;

  return JS_TRUE;
}

static JSBool
resolve(JSContext *cx, JSObject *obj, jsval id, uintN flags,
        JSObject **objp)
{
  jsval rval = NULL;
  jsval args[2];
  args[0] = OBJECT_TO_JSVAL(obj);
  args[1] = id;
  if (!delegateToResolver(cx, obj, "resolve", 2, args, &rval))
    return JS_FALSE;

  if (JSVAL_IS_OBJECT(rval))
    *objp = JSVAL_TO_OBJECT(rval);

  return JS_TRUE;
}

static JSBool
propertyOp(const char *name, JSContext *cx, JSObject *obj, jsval id,
           jsval *vp)
{
  jsval rval = NULL;
  jsval args[3];
  args[0] = OBJECT_TO_JSVAL(obj);
  args[1] = id;
  args[2] = *vp;
  if (!delegateToResolver(cx, obj, name, 3, args, &rval))
    return JS_FALSE;

  if (rval)
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
  jsval rval = NULL;
  jsval args[2];
  args[0] = OBJECT_TO_JSVAL(obj);
  args[1] = id;
  if (!delegateToResolver(cx, obj, "delProperty", 2, args, &rval))
    return JS_FALSE;

  // TODO: The MDC docs say that setting *vp to JSVAL_FALSE and then
  // returning JS_TRUE should indicate that the property can't be
  // deleted, but this doesn't seem to actually be the case.
  if (!rval || !JSVAL_IS_BOOLEAN(rval)) {
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

JSExtendedClass sXPC_FlexibleWrapper_JSClass = {
  // JSClass (JSExtendedClass.base) initialization
  { "XPCFlexibleWrapper",
    JSCLASS_NEW_RESOLVE | JSCLASS_IS_EXTENDED |
    JSCLASS_HAS_RESERVED_SLOTS(1),
    addProperty,        delProperty,
    getProperty,        setProperty,
    enumerate,          (JSResolveOp)resolve,
    JS_ConvertStub,     JS_FinalizeStub,
    NULL,               NULL,
    NULL,               NULL,
    NULL,               NULL,
    NULL,               NULL
  },
  // JSExtendedClass initialization
  NULL, // equality
  NULL, // outerObject
  NULL, // innerObject
  NULL, // iterator
  NULL, // wrapped object
  JSCLASS_NO_RESERVED_MEMBERS
};

JSObject *wrapObject(JSContext *cx, JSObject *objToWrap, jsval resolver)
{
  JSObject *obj = JS_NewObject(
    cx,
    &sXPC_FlexibleWrapper_JSClass.base,
    NULL,
    objToWrap
    );
  JS_SetReservedSlot(cx, obj, 0, resolver);
  JS_DefineFunction(cx, obj, "toString", toString, 0, 0);
  return obj;
}
