#include "nsIGenericFactory.h"
#include "nsJSWeakRef.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsJSWeakRef)

static nsModuleComponentInfo components[] =
{
    {
        NSJSWEAKREFDI_CLASSNAME,
        NSJSWEAKREFDI_CID,
        NSJSWEAKREFDI_CONTRACTID,
        nsJSWeakRefConstructor,
    }
};

NS_IMPL_NSGETMODULE("nsJetpackModule", components)
