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

#include "MusicTrack.h"

NS_IMPL_ISUPPORTS1(MusicTrack, IMusicTrack)

MusicTrack::MusicTrack()
    : mData("None")
    , mTitle("None")
    , mAlbum("None")
    , mArtist("None")
{
}

MusicTrack::~MusicTrack()
{
}

nsresult
MusicTrack::Init(const char *ti, const char *al,
    const char *ar, const char *da)
{
    mData.Assign(da, PR_UINT32_MAX);
    mTitle.Assign(ti, PR_UINT32_MAX);
    mAlbum.Assign(al, PR_UINT32_MAX);
    mArtist.Assign(ar, PR_UINT32_MAX);
    return NS_OK;
}

NS_IMETHODIMP
MusicTrack::GetData(nsACString &value)
{
    value = mData;
    return NS_OK;
}

NS_IMETHODIMP
MusicTrack::GetTitle(nsACString &value)
{
    value = mTitle;
    return NS_OK;
}

NS_IMETHODIMP
MusicTrack::GetAlbum(nsACString &value)
{
    value = mAlbum;
    return NS_OK;
}

NS_IMETHODIMP
MusicTrack::GetArtist(nsACString &value)
{
    value = mArtist;
    return NS_OK;
}
