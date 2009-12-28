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
 * The Original Code is Video for Jetpack.
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

#ifndef VideoRecorder_h_
#define VideoRecorder_h_

#include "IVideoRecorder.h"

#include <time.h>
#include <ogg/ogg.h>
#include <vidcap/vidcap.h>
#include <vidcap/converters.h>
#include <theora/theoraenc.h>

#include "prmem.h"
#include "gfxContext.h"
#include "gfxPattern.h"
#include "gfxASurface.h"
#include "gfxImageSurface.h"
#include "nsStringAPI.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsICanvasRenderingContextInternal.h"

#define VIDEO_RECORDER_CONTRACTID "@labs.mozilla.com/video/recorder;1"
#define VIDEO_RECORDER_CLASSNAME  "Video Recording Capability"
#define VIDEO_RECORDER_CID { 0xb3ee26b3, 0xe935, 0x4c56, \
                           { 0x83, 0xa1, 0x5e, 0x88, 0x55, 0xd7, 0x11, 0x4b }}


#define WIDTH 640
#define HEIGHT 480
#define FPS_N 15
#define FPS_D 1

class VideoRecorder : public IVideoRecorder
{
public:
    NS_DECL_ISUPPORTS
    NS_DECL_IVIDEORECORDER

    nsresult Init();
    static VideoRecorder *GetSingleton();
    virtual ~VideoRecorder();
    VideoRecorder(){}

private:
    int size;
    int recording;
    FILE *outfile;
    
    vidcap_sapi *sapi;
    vidcap_src *source;
    vidcap_state *state;
    th_enc_ctx *encoder;
    ogg_stream_state *ogg_state;
    
    struct vidcap_src_info *sources;
    static VideoRecorder *gVideoRecordingService;
    
    nsRefPtr<gfxContext> mThebes;
    nsCOMPtr<nsICanvasRenderingContextInternal> mCtx;
protected:
    nsresult SetupOggTheora(nsACString& file);
    static int RecordToFileCallback(vidcap_src *src,
	    void *data, struct vidcap_capture_info *video);
};

#endif
