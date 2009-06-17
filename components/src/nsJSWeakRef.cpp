#include "nsJSWeakRef.h"
#include "wrapper.h"

#include "jsapi.h"
#include "nsIXPConnect.h"
#include "nsAXPCNativeCallContext.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"

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

  // get argc and argv and verify arg count
  PRUint32 argc;
  rv = cc->GetArgc(&argc);
  if(NS_FAILED(rv))
    return rv;

  if (argc < 1)
    return NS_ERROR_XPC_NOT_ENOUGH_ARGS;

  jsval *argv;
  rv = cc->GetArgvPtr(&argv);
  if (NS_FAILED(rv))
    return rv;

  if (!JSVAL_IS_OBJECT(argv[0]))
    return NS_ERROR_ILLEGAL_VALUE;

  JSObject *objToWrap = JSVAL_TO_OBJECT(argv[0]);
  JSObject *obj = wrapObject(cx, objToWrap);
  *rval = OBJECT_TO_JSVAL(obj);
  cc->SetReturnValueWasSet(PR_TRUE);

  return NS_OK;
}

NS_IMETHODIMP nsJSWeakRef::Get()
{
  return NS_OK;
}

NS_IMPL_ISUPPORTS1(nsJSWeakRef, nsIJSWeakRef);
