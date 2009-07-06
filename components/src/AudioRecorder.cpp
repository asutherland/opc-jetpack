/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Audio Recorder.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Labs
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Anant Narayanan <anant@kix.in>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

#include "AudioRecorder.h"

NS_IMPL_ISUPPORTS1(AudioRecorder, IAudioRecorder)

AudioRecorder::AudioRecorder()
{
    fprintf(stderr, "CONSTRUCTOR!!\n");
    
    stream = NULL;
    recording = 0;

    PaError err;
    err = Pa_Initialize();
    if (err != paNoError) {
        fprintf(stderr, "JEP Audio:: Could not initialize PortAudio! %d\n", err);
    }
    
    /* Open stream */
    PaStreamParameters inputParameters;    
    inputParameters.device = Pa_GetDefaultInputDevice();
    inputParameters.channelCount = 2;
    inputParameters.sampleFormat = PA_SAMPLE_TYPE;
    inputParameters.suggestedLatency =
        Pa_GetDeviceInfo(inputParameters.device)->defaultLowInputLatency;
    inputParameters.hostApiSpecificStreamInfo = NULL;

    err = Pa_OpenStream(
            &stream,
            &inputParameters,
            NULL,
            SAMPLE_RATE,
            FRAMES_PER_BUFFER,
            paClipOff,
            this->RecordCallback,
            this
    );
    if (err != paNoError) {
        fprintf(stderr, "JEP Audio:: Could not open stream! %d", err);
    }
}

AudioRecorder::~AudioRecorder()
{
    fprintf(stderr, "DESTRUCTOR!!\n");
    
    PaError err;
    if ((err = Pa_Terminate()) != paNoError) {
        fprintf(stderr, "JEP Audio:: Could not terminate PortAudio! %d\n", err);
    }
    
    fprintf(stderr, "DESTRUCTOR DONE!!\n");
}

int
AudioRecorder::RecordCallback(const void *input, void *output,
        unsigned long framesPerBuffer,
        const PaStreamCallbackTimeInfo* timeInfo,
        PaStreamCallbackFlags statusFlags,
        void *userData)
{
    unsigned long i;
    const short *rptr = (const short *)input;

    nsIAsyncOutputStream *op = static_cast<AudioRecorder*>(userData)->mPipeOut;

    if (input != NULL) {
        for (i = 0; i < framesPerBuffer; i++) {
            PRUint32 written;
            op->Write((const char *)rptr, (PRUint32)sizeof(short) * 2, &written);
            rptr++;
            rptr++;
        }
    }
    
    return paContinue;
}

/*
 * Start recording
 */
NS_IMETHODIMP
AudioRecorder::Start(nsIAsyncInputStream** out)
{
    if (recording) {
        fprintf(stderr, "JEP Audio:: Recording in progress!\n");
        return NS_ERROR_FAILURE;
    }

    /* Create pipe: NS_NewPipe2 is not exported by XPCOM */
    nsCOMPtr<nsIPipe> pipe = do_CreateInstance("@mozilla.org/pipe;1");
    if (!pipe)
        return NS_ERROR_OUT_OF_MEMORY;

    nsresult rv = pipe->Init(PR_TRUE, PR_FALSE, 0, PR_UINT32_MAX, NULL);
    if (NS_FAILED(rv)) return rv;

    pipe->GetInputStream(getter_AddRefs(mPipeIn));
    pipe->GetOutputStream(getter_AddRefs(mPipeOut));

    recording = 1;
    *out = mPipeIn;

    /* Start recording */
    PaError err = Pa_StartStream(stream);
    if (err != paNoError) {
        fprintf(stderr, "JEP Audio:: Could not start stream! %d", err);
        return NS_ERROR_FAILURE;
    }
    return NS_OK;
}

/*
 * Stop stream recording
 */
NS_IMETHODIMP
AudioRecorder::Stop()
{
    if (!recording) {
        fprintf(stderr, "JEP Audio:: No recording in progress!\n");
        return NS_ERROR_FAILURE;    
    }
    
    PaError err = Pa_StopStream(stream);
    if (err != paNoError) {
        fprintf(stderr, "JEP Audio:: Could not close stream!\n");
        return NS_ERROR_FAILURE;
    }
    
    mPipeOut->Close();
    mPipeOut->Release();
    
    recording = 0;
    return NS_OK;
}
