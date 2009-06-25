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

#ifndef AudioRecorder_h_
#define AudioRecorder_h_

#include "IAudioRecorder.h"
#include "nsCOMPtr.h"
#include "nsITimer.h"

#define AUDIO_RECORDER_CONTRACTID "@labs.mozilla.com/audio/recorder;1"
#define AUDIO_RECORDER_CLASSNAME  "Audio Recording Capability"
#define AUDIO_RECORDER_CID { 0x1fdf790f, 0x0648, 0x4e53, \
                           { 0x92, 0x7d, 0xbe, 0x13, 0xa3, 0xc6, 0x92, 0x54 } }

class AudioRecorder : public IAudioRecorder
{
public:
    AudioRecorder();
    NS_DECL_ISUPPORTS
    NS_DECL_IAUDIORECORDER

private:
    ~AudioRecorder();

protected:
    int recording;
};

#define TABLE_SIZE 36
static const char table[] = {
    'a','b','c','d','e','f','g','h','i','j',
    'k','l','m','n','o','p','q','r','s','t',
    'u','v','w','x','y','z','0','1','2','3',
    '4','5','6','7','8','9' 
};

#endif
