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
#include "MusicTrack.h"

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
iTunesPlayer::PlayTrack(IMusicTrack *tr)
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;

    nsCAutoString pid;
    nsresult ret = tr->GetData(pid);
    NS_ENSURE_SUCCESS(ret, ret);
    
    // This is lame. There doesn't seem to be a way to get an
    // iTunesTrack object from a persistent ID, so we have to loop
    // through all current tracks to find the right one.
    NSString *cid =
        [NSString stringWithCString:pid.get() encoding:NSUTF8StringEncoding];
    SBElementArray *tracks = [[iTunes currentPlaylist] tracks];
    for (iTunesTrack *track in tracks) {
        if ([[track persistentID] isEqualToString:cid]) {
            [track playOnce:NO];
            return NS_OK;
        }
    }

    return NS_ERROR_FAILURE;    
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
iTunesPlayer::Search(const nsACString &what, PRUint32 *count,
    IMusicTrack ***retval)
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    int i = 0;
    MusicTrack *t;
    PromiseFlatCString term(what);
    id tracks = [[iTunes currentPlaylist] searchFor:
        [NSString stringWithCString:term.get() encoding:NSUTF8StringEncoding]
        only:iTunesESrAAll
    ];
    
    *count = [tracks count];
    *retval = static_cast<IMusicTrack**>
        (nsMemory::Alloc((*count) * sizeof(**retval)));
    for (iTunesTrack *tr in tracks) {
        t = new MusicTrack();
        t->Init(
            [[tr name] cStringUsingEncoding:NSUTF8StringEncoding],
            [[tr album] cStringUsingEncoding:NSUTF8StringEncoding],
            [[tr artist] cStringUsingEncoding:NSUTF8StringEncoding],
            [[tr persistentID] cStringUsingEncoding:NSUTF8StringEncoding]
        );
        NS_ADDREF((*retval)[i++] = t);
    }
    
    return NS_OK;
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::GotoNextTrack()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    [iTunes nextTrack];
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::GotoPreviousTrack()
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;
    
    [iTunes previousTrack];
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}

NS_IMETHODIMP
iTunesPlayer::GetCurrentTrack(IMusicTrack **retval)
{
    NS_OBJC_BEGIN_TRY_ABORT_BLOCK_NSRESULT;

    MusicTrack *t = new MusicTrack();
    iTunesTrack *ct = [iTunes currentTrack];
    t->Init(
        [[ct name] cStringUsingEncoding:NSUTF8StringEncoding],
        [[ct album] cStringUsingEncoding:NSUTF8StringEncoding],
        [[ct artist] cStringUsingEncoding:NSUTF8StringEncoding],
        [[ct persistentID] cStringUsingEncoding:NSUTF8StringEncoding]
    );
    
    NS_ADDREF(*retval = t);
    return NS_OK;
    
    NS_OBJC_END_TRY_ABORT_BLOCK_NSRESULT;
}
