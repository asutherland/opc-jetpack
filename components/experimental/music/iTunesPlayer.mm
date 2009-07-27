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
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::Pause()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    [iTunes pause];
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::Stop()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    [iTunes stop];
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}