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

#include "VideoRecorder.h"

NS_IMPL_ISUPPORTS1(VideoRecorder, IVideoRecorder)

VideoRecorder *VideoRecorder::gVideoRecordingService = nsnull;

VideoRecorder *
VideoRecorder::GetSingleton()
{
    if (gVideoRecordingService) {
        NS_ADDREF(gVideoRecordingService);
        return gVideoRecordingService;
    }
    
    gVideoRecordingService = new VideoRecorder();
    if (gVideoRecordingService) {
        NS_ADDREF(gVideoRecordingService);
        if (NS_FAILED(gVideoRecordingService->Init()))
            NS_RELEASE(gVideoRecordingService);
    }
    
    return gVideoRecordingService;
}

nsresult
VideoRecorder::Init()
{
    recording = 0;
    int num_devices = 0;
    struct vidcap_src_info *sources;
    struct vidcap_sapi_info sapi_info;
    
    if (!(vc = vidcap_initialize())) {
        fprintf(stderr, "Could not initialize vidcap, aborting!\n");
        return NS_ERROR_FAILURE;
    }
    
    if (!(sapi = vidcap_sapi_acquire(vc, 0))) {
		fprintf(stderr, "Failed to acquire default sapi\n");
		return NS_ERROR_FAILURE;
	}
	
	if (vidcap_sapi_info_get(sapi, &sapi_info)) {
		fprintf(stderr, "Failed to get default sapi info\n");
		return NS_ERROR_FAILURE;
	}
	
	num_devices = vidcap_src_list_update(sapi);
	if (num_devices < 0) {
		fprintf(stderr, "Failed vidcap_src_list_update()\n");
		return NS_ERROR_FAILURE;
	} else if (num_devices == 0) {
	    // FIXME: Not really a failure
        fprintf(stderr, "No video capture sources available\n");
		return NS_ERROR_FAILURE;
	}
	
	if (!(sources = (struct vidcap_src_info *)
	    PR_Calloc(num_devices, sizeof(struct vidcap_src_info)))) {
        return NS_ERROR_OUT_OF_MEMORY;
	}
	
	if (vidcap_src_list_get(sapi, num_devices, sources)) {
	    PR_Free(sources);
		fprintf(stderr, "Failed vidcap_src_list_get()\n");
		return NS_ERROR_FAILURE;
	}
	
    if (!(source = vidcap_src_acquire(sapi, &sources[0]))) {
        PR_Free(sources);
        fprintf(stderr, "Failed vidcap_src_acquire()\n");
        return NS_ERROR_FAILURE;
    }
    
    PR_Free(sources);
    return NS_OK;
}

VideoRecorder::~VideoRecorder()
{
    vidcap_sapi_release(sapi);
    vidcap_destroy(vc);
    gVideoRecordingService = nsnull;
}

#define TABLE_SIZE 36
static const char table[] = {
    'a','b','c','d','e','f','g','h','i','j',
    'k','l','m','n','o','p','q','r','s','t',
    'u','v','w','x','y','z','0','1','2','3',
    '4','5','6','7','8','9' 
};

/*
 * This code is ripped from profile/src/nsProfile.cpp and is further
 * duplicated in uriloader/exthandler.  this should probably be moved
 * into xpcom or some other shared library.
 */ 
static void
MakeRandomString(char *buf, PRInt32 bufLen)
{
    // turn PR_Now() into milliseconds since epoch
    // and salt rand with that.
    double fpTime;
    LL_L2D(fpTime, PR_Now());

    // use 1e-6, granularity of PR_Now() on the mac is seconds
    srand((uint)(fpTime * 1e-6 + 0.5));   
    PRInt32 i;
    for (i=0;i<bufLen;i++) {
        *buf++ = table[rand()%TABLE_SIZE];
    }
    *buf = 0;
}

/*
 * This replaces \ with \\ so that Windows paths are sane
 */
static void
EscapeBackslash(nsACString& str)
{
	const char *sp;
	const char *mp = "\\";
	const char *np = "\\\\";

	PRUint32 sl;
	PRUint32 ml = 1;
	PRUint32 nl = 2;

	sl = NS_CStringGetData(str, &sp);
	for (const char* iter = sp; iter <= sp + sl - ml; ++iter) {
	    if (memcmp(iter, mp, ml) == 0) {
            PRUint32 offset = iter - sp;
            NS_CStringSetDataRange(str, offset, ml, np, nl);
            sl = NS_CStringGetData(str, &sp);
            iter = sp + offset + nl - 1;
	    }
	}
}

int
VideoRecorder::RecordToFileCallback(vidcap_src *src, void *user_data,
    struct vidcap_capture_info *cap_info)
{
    FILE *out = static_cast<VideoRecorder*>(user_data)->outfile;
    fwrite(cap_info->video_data, sizeof(char),
            cap_info->video_data_size, out);
    return 0;
}


/*
 * Start recording to file
 */
NS_IMETHODIMP
VideoRecorder::StartRecordToFile(nsACString& file)
{
    nsresult rv;
    nsCOMPtr<nsIFile> o;
    
    if (recording) {
        fprintf(stderr, "Recording in progress!\n");
        return NS_ERROR_FAILURE;
    }

    /* Allocate RAW file */
    char buf[13];
    nsCAutoString path;

    rv = NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(o));
    if (NS_FAILED(rv)) return rv;

    MakeRandomString(buf, 8);
    memcpy(buf + 8, ".raw", 5);
    rv = o->AppendNative(nsDependentCString(buf, 12));
    if (NS_FAILED(rv)) return rv;
    rv = o->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
    if (NS_FAILED(rv)) return rv;
    rv = o->GetNativePath(path);
    if (NS_FAILED(rv)) return rv;
    rv = o->Remove(PR_FALSE);
    if (NS_FAILED(rv)) return rv;

    /* Open file */
    if (!(outfile = fopen(path.get(), "w+"))) {
        fprintf(stderr, "Could not open RAW file\n");
        return NS_ERROR_FAILURE;
    }

    EscapeBackslash(path);
	file.Assign(path.get(), strlen(path.get()));

    /* Start recording */
    struct vidcap_fmt_info fmt_info;
    fmt_info.width = 640;
    fmt_info.height = 480;
    fmt_info.fourcc = VIDCAP_FOURCC_I420;
    fmt_info.fps_numerator = 15;
    fmt_info.fps_denominator = 1;
    
    if (vidcap_format_bind(source, &fmt_info)) {
		fprintf(stderr, "Failed vidcap_format_bind()\n");
		return NS_ERROR_FAILURE;
	}
	
	if (vidcap_src_capture_start(source, this->RecordToFileCallback, this)) {
		fprintf(stderr, "Failed vidcap_src_capture_start()\n");
		return NS_ERROR_FAILURE;
	}
	
	recording = 1;
    return NS_OK;
}

/*
 * Stop recording
 */
NS_IMETHODIMP
VideoRecorder::Stop()
{
    if (!recording) {
        fprintf(stderr, "No recording in progress!\n");
        return NS_ERROR_FAILURE;    
    }
    
    if (vidcap_src_capture_stop(source)) {
		fprintf(stderr, "Failed vidcap_src_capture_stop()\n");
		return NS_ERROR_FAILURE;
	}
    vidcap_src_release(source);
    
    fclose(outfile);
    recording = 0;
    return NS_OK;
}
