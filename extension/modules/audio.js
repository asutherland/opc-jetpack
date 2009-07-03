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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const CC = Components.Constructor;
const En = Cc["@labs.mozilla.com/audio/encoder;1"].
			getService(Ci.IAudioEncoder);
const Re = Cc["@labs.mozilla.com/audio/recorder;1"].
            getService(Ci.IAudioRecorder);
const Bi = CC("@mozilla.org/binaryinputstream;1",
			"nsIBinaryInputStream",
			"setInputStream");
const Fi = CC("@mozilla.org/file/local;1",
            "nsILocalFile",
            "initWithPath");
            
function Audio() {
    this._path = null;
}
Audio.prototype = {
    beginRecordToFile: function() {
        //this._path = En.createOgg();
        this._input = Re.start();
        this._input.asyncWait(new inputStreamListener(), 0, 0, null);
    },

    stopRecordToFile: function() {
        Re.stop();
        /*
        En.finalize();
        
        let src = new Fi(this._path);
        let dst = getOrCreateDirectory();

        En.finalize();
        src.moveTo(dst, '');
        dst.append(src.leafName);
        return dst.path;
        */
    }
}

function inputStreamListener() {
    this._data = [];
}
inputStreamListener.prototype = {
	_readBytes: function(inputStream, count) {
		return new Bi(inputStream).readByteArray(count);
	},
	
	onInputStreamReady: function(input) {
	    try {
            this._readBytes(input, input.available());
	    } catch (e) {
	        dump("*** Exception " + e + " assuming stream was closed ***");
	        input.close();
	        return;
	    }
        
        if (this._data.length % 2 == 0) {
            /* Even bytes means we can write all channels now */
        //    En.appendFrames(this._data);
        } else {
            /* Odd bytes, write as much as we can and do the rest later */
        //    En.appendFrames(this._data.splice(0, this._data.length - 1));
        }
        input.asyncWait(this, 0, 0, null);
	},
	
	QueryInterface: function(aIID) {
	    if (aIID.equals(Ci.nsIInputStreamCallback) ||
	        aIID.equals(Ci.nsISupports))
	        return this;
	    throw Cr.NS_ERROR_NO_INTERFACE;
	}
};

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

