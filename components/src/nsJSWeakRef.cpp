#include "nsJSWeakRef.h"
#include "tcb.h"
#include "wrapper.h"
#include "memory_profiler.h"

#include "jsapi.h"
#include "nsIXPConnect.h"
#include "nsAXPCNativeCallContext.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"

static JSFunctionSpec endpointFunctions[] = {
  JS_FS("wrap",          wrapObject,      2, JSPROP_ENUMERATE, 0),
  JS_FS("unwrap",        unwrapObject,    1, JSPROP_ENUMERATE, 0),
  JS_FS("getWrapper",    getWrapper,      1, JSPROP_ENUMERATE, 0),
  JS_FS("profileMemory", profileMemory,   1, JSPROP_ENUMERATE, 0),
  JS_FS("enumerate",     TCB_enumerate,   1, JSPROP_ENUMERATE, 0),
  JS_FS_END
};

nsJSWeakRef::nsJSWeakRef()
{
}

nsJSWeakRef::~nsJSWeakRef()
{
}

NS_IMETHODIMP nsJSWeakRef::Set()
{
  nsresult rv = NS_OK;
  nsCOMPtr<nsIXPConnect> xpc = do_GetService(
    "@mozilla.org/js/xpc/XPConnect;1",
    &rv
  );
  if (NS_FAILED(rv))
    return NS_ERROR_FAILURE;

  // get the xpconnect native call context
  nsAXPCNativeCallContext *cc = nsnull;
  xpc->GetCurrentNativeCallContext(&cc);
  if(!cc)
    return NS_ERROR_FAILURE;

  // Get JSContext of current call
  JSContext* cx;
  rv = cc->GetJSContext(&cx);
  if(NS_FAILED(rv) || !cx)
    return NS_ERROR_FAILURE;

  // get place for return value
  jsval *rval = nsnull;
  rv = cc->GetRetValPtr(&rval);
  if(NS_FAILED(rv) || !rval)
    return NS_ERROR_FAILURE;

  JSObject *endpoint = JS_NewObject(cx, NULL, NULL, NULL);
  if (endpoint == NULL) {
    return NS_ERROR_FAILURE;
  }

  *rval = OBJECT_TO_JSVAL(endpoint);

  if (!JS_DefineFunctions(cx, endpoint, endpointFunctions)) {
    // The JS exception state was set.
    cc->SetReturnValueWasSet(PR_FALSE);
    return NS_OK;
  }

  cc->SetReturnValueWasSet(PR_TRUE);

  return NS_OK;
}

NS_IMETHODIMP nsJSWeakRef::Get()
{
  return NS_OK;
}

NS_IMPL_ISUPPORTS1(nsJSWeakRef, nsIJSWeakRef);
