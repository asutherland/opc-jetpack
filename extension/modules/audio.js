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
 * The Original Code is Jetpack Audio API.
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

// = Audio =
//
// This module implements a simple audio recording interface.
// A JEP for it has not been created yet.
//

var EXPORTED_SYMBOLS = ["Audio"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var CC = Components.Constructor;
var Re = Cc["@labs.mozilla.com/audio/recorder;1"].
            getService(Ci.IAudioRecorder);

function Audio() {
    this.recorder = {
        start: function() {
            Re.start();
        },

        stop: function() {
            let fPath = Re.stop();
            let lFile = CC("@mozilla.org/file/local;1",
                    "nsILocalFile", "initWithPath");
            let src = new lFile(fPath);
            let dst = getOrCreateDirectory();

            src.moveTo(dst, '');
            dst.append(src.leafName);
            return dst.path;
        }
    };
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
    let dir = Cc["@mozilla.org/file/directory_service;1"].
        getService(Ci.nsIProperties);
    let file = dir.get("ProfD", Ci.nsIFile);

    file.append("jetpack");
    ensureDirectoryExists(file);
    file.append("audio");
    ensureDirectoryExists(file);

    return file;
}

