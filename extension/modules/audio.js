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
// This module implements a simple audio recording interface as proposed in
// [[https://wiki.mozilla.org/Labs/Jetpack/JEP/18|JEP 18]].  It depends
// on a binary component that is included with Jetpack for the low-level
// recording and encoding routines.
//
Components.utils.import("resource://jetpack/modules/init.js");

var Re;
var EXPORTED_SYMBOLS = ["AudioModule"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const CC = Components.Constructor;
const Fi = CC(
            "@mozilla.org/file/local;1",
            "nsILocalFile",
            "initWithPath");
const Ff = CC(
            "@mozilla.org/file/local;1",
            "nsILocalFile",
            "initWithFile");
const Bi = CC(
            "@mozilla.org/binaryinputstream;1",
            "nsIBinaryInputStream",
            "setInputStream");
const Ds = Cc["@mozilla.org/file/directory_service;1"].
           getService(Ci.nsIProperties);

function AudioModule() {
  // Don't fail if the binary audio component is missing.
  try {
    Re = Cc["@labs.mozilla.com/audio/recorder;1"].
         getService(Ci.IAudioRecorder);
    En = Cc["@labs.mozilla.com/audio/encoder;1"].
         getService(Ci.IAudioEncoder);
    CT = Cc["@mozilla.org/thread-manager;1"].
         getService().currentThread;
    this.isRecording = 0;
  } catch (e) {
    // We may be failing because of Windows! 
    // I AM A HACK. FIXME!
    let ddir = Ds.get("CurProcD", Ci.nsIFile);

    let cdir = getWindowsComponentDir();
    cdir.append("portaudio_x86.dll");
    let pDll = new Ff(cdir);
    if (pDll.exists())
      pDll.moveTo(ddir, '');
        
    cdir = getWindowsComponentDir();
    cdir.append("libsndfile-1.dll");
    let sDll = new Ff(cdir);
    if (sDll.exists())
      sDll.moveTo(ddir, '');
        
    try {
      Re = Cc["@labs.mozilla.com/audio/recorder;1"].
           getService(Ci.IAudioRecorder);
      this.isRecording = 0;
    } catch (e) {
      // Really give up
      return {};
    }
  }
}
AudioModule.prototype = {
  // === {{{AudioModule.recordToFile()}}} ===
  //
  // Starts recording audio and encoding it into
  // and Ogg/Vorbis file.
  //
  recordToFile: function() {
    try {
      this._path = Re.startRecordToFile();
    } catch (e) {
      return false;
    }
        
    this.isRecording = 1;
    return true;
  },
  
  // === {{{AudioModule.recordToFile()}}} ===
  //
  // Starts recording audio and feeds raw frames
  // (PCM float sampled at 44000Hz) to the output
  // end of an nsIPipe.
  //
  recordToPipe: function() {
    this._pipe = Re.start();
    this._pipe.asyncWait(new inputStreamListener(), 0, 0, CT);
    this._path = En.createOgg();
    this.isRecording = 2;
  },
  
  // === {{{AudioModule.stopRecording()}}} ===
  //
  // Stops recording. If recording was started
  // with {{{recordToFile}}} then this routine will
  // return the full (local) path of the Ogg/Vorbis
  // file that the audio was saved to.
  //
  stopRecording: function() {
    switch (this.isRecording) {
      case 0:
        throw "Not recording!";
        break;
      case 1:
        Re.stop();
        this.isRecording = 0;
        let src = new Fi(this._path);
        let dst = getOrCreateDirectory();

        src.copyTo(dst, '');
        dst.append(src.leafName);

        return dst.path;
      case 2:
        Re.stop();
        dump("Wrote to " + this._path + "\n");
        break;
    }
  },
    
  // === {{{AudioModule.playFile(path)}}} ===
  //
  // Plays an audio file located at {{{path}}}.
  //
  playFile: function(path) {
    let win = null;
    while (!win) {
      win = get("chrome://jetpack/content/index.html");
    }
    let tag = win.document.createElement("audio");
    tag.setAttribute("src", path);
    tag.setAttribute("autoplay", "true");
    win.document.body.appendChild(tag);
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
  file.append("audio");
  ensureDirectoryExists(file);

  return file;
}

function getWindowsComponentDir() {
  let file = Ds.get("ProfD", Ci.nsIFile);
    
  file.append("extensions");
  file.append("jetpack@labs.mozilla.com");
  file.append("platform");
  file.append("WINNT_x86-msvc");
  file.append("components");

  return file;
}

function inputStreamListener() {
  this._data = [];
}
inputStreamListener.prototype = {
  onInputStreamReady: function(input) {
    try {
        this._data = this._data.concat(
          new Bi(input).readByteArray(input.available())
        );
    } catch (e) {
      dump("Pipe exception " + e + ", assumed it was closed!\n");
      En.finalize();
      return;
    }
    
    // Each frame is 2 bytes
    let diff = this._data.length % 2;
    let clen = this._data.length - diff;
    En.appendFrames(this._data.slice(0, clen), clen);
    this._data = this._data.slice(clen, diff);
    input.asyncWait(this, 0, 0, CT);
  },

  QueryInterface: function(aIID) {
    if (aIID.equals(Ci.nsIInputStreamCallback) ||
        aIID.equals(Ci.nsISupports))
        return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  }
}
