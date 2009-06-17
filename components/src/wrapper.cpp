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
enumerate(JSContext *cx, JSObject *obj)
{
  jsval resolver;
  if (!JS_GetReservedSlot(cx, obj, 0, &resolver))
    return JS_FALSE;
  JSObject *resolverObj = JSVAL_TO_OBJECT(resolver);
  jsval rval = NULL;
  jsval args[1];
  args[0] = OBJECT_TO_JSVAL(obj);
  if (!JS_CallFunctionName(cx, resolverObj, "enumerate", 1, args, &rval))
    return JS_FALSE;

  return JS_TRUE;
}

static JSBool
resolve(JSContext *cx, JSObject *obj, jsval id, uintN flags,
        JSObject **objp)
{
  jsval resolver;
  if (!JS_GetReservedSlot(cx, obj, 0, &resolver))
    return JS_FALSE;
  JSObject *resolverObj = JSVAL_TO_OBJECT(resolver);
  jsval rval = NULL;
  jsval args[2];
  args[0] = OBJECT_TO_JSVAL(obj);
  args[1] = id;
  if (!JS_CallFunctionName(cx, resolverObj, "resolve", 2, args, &rval))
    return JS_FALSE;

  if (JSVAL_IS_OBJECT(rval))
    *objp = JSVAL_TO_OBJECT(rval);

  return JS_TRUE;
}

JSExtendedClass sXPC_FlexibleWrapper_JSClass = {
  // JSClass (JSExtendedClass.base) initialization
  { "XPCFlexibleWrapper",
    JSCLASS_NEW_RESOLVE | JSCLASS_IS_EXTENDED |
    JSCLASS_HAS_RESERVED_SLOTS(1),
    JS_PropertyStub,    JS_PropertyStub,
    JS_PropertyStub,    JS_PropertyStub,
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
  JS_DefineFunction(cx, obj, "toString", toString, 0, 0);
  JS_SetReservedSlot(cx, obj, 0, resolver);
  return obj;
}
