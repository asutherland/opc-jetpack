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
 * The Original Code is Jetpack Music Interface.
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

#include "iTunesPlayer.h"

NS_IMPL_ISUPPORTS1(iTunesPlayer, IMusicPlayer)

iTunesPlayer *iTunesPlayer::iTunesService = nsnull;

iTunesPlayer *
iTunesPlayer::GetSingleton()
{
    if (iTunesService) {
        NS_ADDREF(iTunesService);
        return iTunesService;
    }
    
    iTunesService = new iTunesPlayer();
    if (iTunesService) {
        NS_ADDREF(iTunesService);
        if (NS_FAILED(iTunesService->Init()))
            NS_RELEASE(iTunesService);
    }
    
    return iTunesService;
}

nsresult
iTunesPlayer::Init()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    iTunes = [SBApplication 
                applicationWithBundleIdentifier:@"com.apple.iTunes"];
                
    if (iTunes)
        return NS_OK;
    else
        return NS_ERROR_FAILURE;

    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

iTunesPlayer::~iTunesPlayer()
{
    iTunesService = nsnull;
}

NS_IMETHODIMP
iTunesPlayer::Play()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    [iTunes playOnce:NO];
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::Pause()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    [iTunes pause];
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::Stop()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    [iTunes stop];
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::GetCurrentTrack(PRUint32 *count, char ***result)
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    // We return an array of "title", "artist", "album"
    *count = 3;
    char **outArray = (char **)nsMemory::Alloc((*count) * sizeof(char *));
    if (!outArray)
        return NS_ERROR_OUT_OF_MEMORY;

    iTunesTrack *ct = [iTunes currentTrack];
    outArray[0] = (char *)nsMemory::Clone(
        [[ct name] cStringUsingEncoding:NSUTF8StringEncoding],
        [[ct name] lengthOfBytesUsingEncoding:NSUTF8StringEncoding] + 1
    );
    if (!outArray[0]) {
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(0, outArray);
        return NS_ERROR_OUT_OF_MEMORY;
    }
    outArray[1] = (char *)nsMemory::Clone(
        [[ct artist] cStringUsingEncoding:NSUTF8StringEncoding],
        [[ct artist] lengthOfBytesUsingEncoding:NSUTF8StringEncoding] + 1
    );
    if (!outArray[1]) {
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(1, outArray);
        return NS_ERROR_OUT_OF_MEMORY;
    }          
    outArray[2] = (char *)nsMemory::Clone(
        [[ct album] cStringUsingEncoding:NSUTF8StringEncoding],
        [[ct album] lengthOfBytesUsingEncoding:NSUTF8StringEncoding] + 1
    );
    if (!outArray[2]) {
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(2, outArray);
        return NS_ERROR_OUT_OF_MEMORY;
    }
    
    *result = outArray;
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}
