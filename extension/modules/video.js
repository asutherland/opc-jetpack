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
 * The Original Code is Jetpack Video API.
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

// = Video =
//
// This module implements a simple Video recording interface. It depends
// on a binary component that is included with Jetpack for the low-level
// recording and encoding routines.
//
Components.utils.import("resource://jetpack/modules/init.js");

var Re;
var EXPORTED_SYMBOLS = ["VideoModule"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Fi = Components.Constructor(
            "@mozilla.org/file/local;1",
            "nsILocalFile",
            "initWithPath");
const Ds = Cc["@mozilla.org/file/directory_service;1"].
           getService(Ci.nsIProperties);

function VideoModule() {
  // Don't fail if the binary component is missing.
  try {
    this.isRecording = 0;
    Re = Cc["@labs.mozilla.com/video/recorder;1"].
         getService(Ci.IVideoRecorder);
  } catch (e) { return {}; }
}
VideoModule.prototype = {
  recordToFile: function() {
    try {
      this._path = Re.startRecordToFile();
    } catch (e) {
      return false;
    }
        
    this.isRecording = 1;
    return true;
  },
  
  stopRecording: function() {
    if (this.isRecording) {
      Re.stop();
      this.isRecording = 0;
      let src = new Fi(this._path);
      let dst = getOrCreateDirectory();

      src.moveTo(dst, '');
      dst.append(src.leafName);

      return dst.path;
    } else {
      throw "Not recording!";
    }
  },

  playFile: function(path) {
    let win = null;
    while (!win) {
      win = get("chrome://jetpack/content/index.html");
    }
    win.open(path, "video");
  }
}

function ensureDirectoryExists(aFile) {
  if (aFile.exists()) {
    if (!aFile.isDirectory()) {
      throw new Error("File " + aFile.path + 
      " exists but is not a directory");
    }
  } else {
    aFile.create(aFile.DIRECTORY_TYPE, 0755);
  }
}

function getOrCreateDirectory() {
  let file = Ds.get("ProfD", Ci.nsIFile);

  file.append("jetpack");
  ensureDirectoryExists(file);
  file.append("video");
  ensureDirectoryExists(file);

  return file;
}
