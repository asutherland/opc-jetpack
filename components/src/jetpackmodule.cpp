#include "nsIGenericFactory.h"
#include "nsJSWeakRef.h"

#ifdef BUILD_AUDIO
#include "AudioRecorder.h"
#include "AudioEncoder.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(AudioEncoder)
NS_GENERIC_FACTORY_CONSTRUCTOR(AudioRecorder)
#endif

NS_GENERIC_FACTORY_CONSTRUCTOR(nsJSWeakRef)

static nsModuleComponentInfo components[] =
{
#ifdef BUILD_AUDIO
    {
        AUDIO_RECORDER_CLASSNAME,
        AUDIO_RECORDER_CID,
        AUDIO_RECORDER_CONTRACTID,
        AudioRecorderConstructor,
    },

    {
    	AUDIO_ENCODER_CLASSNAME,
    	AUDIO_ENCODER_CID,
    	AUDIO_ENCODER_CONTRACTID,
    	AudioEncoderConstructor,
    },
#endif
    {
        NSJSWEAKREFDI_CLASSNAME,
        NSJSWEAKREFDI_CID,
        NSJSWEAKREFDI_CONTRACTID,
        nsJSWeakRefConstructor,
    }
};

NS_IMPL_NSGETMODULE("nsJetpackModule", components)
