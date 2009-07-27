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
 * The Original Code is Jetpack Music API.
 *
 * The Initial Developer of the Original Code is Mozilla Labs.
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

// = Music =
//
// This module implements a simple music probe.
//
var Mu;
var EXPORTED_SYMBOLS = ["MusicModule"];

const Cc = Components.classes;
const Ci = Components.interfaces;

function MusicModule() {
  // Don't fail if the binary music component is missing.
  // FIXME: Get the appropriate component based on platform
  // Currently, only iTunes on Mac is supported.
  try {
    Mu = Cc["@labs.mozilla.com/music/itunes;1"].
         getService(Ci.IMusicPlayer);
  } catch (e) {
    return {};
  }
}
MusicModule.prototype = {
  // === {{{MusicModule.play()}}} ===
  //
  // Play current track.
  //
  play: function() {
    Mu.play();
  },
  
  // === {{{MusicModule.stop()}}} ===
  //
  // Stop current track.
  //
  stop: function() {
    Mu.stop();
  },
  
  // === {{{MusicModule.pause()}}} ===
  //
  // Pause current track.
  //
  pause: function() {
    Mu.pause();
  },
    
  // === {{{MusicModule.getCurrentTrack}}} ===
  //
  // Returns information on the current track.
  //
  getCurrentTrack: function() {
    let info = Mu.getCurrentTrack({});
    return {"title":info[0], "artist":info[1], "album":info[2]};
  }
}
