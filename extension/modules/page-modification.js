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
 * The Original Code is Page Modifications code.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   David Dahl <ddahl@mozilla.com>
 *   Drew Willcoxon <adw@mozilla.com>
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

var EXPORTED_SYMBOLS = ['PageMods', 'MatchPattern'];

function typeOf(value) {
  // all hail d. crockford: http://javascript.crockford.com/remedial.html
  var s = typeof value;
  if (s === 'object') {
    if (value) {
      if (typeof value.length === 'number' &&
          !(value.propertyIsEnumerable('length')) &&
          typeof value.splice === 'function') {
        s = 'array';
      }
    } else {
      s = 'null';
    }
  }
  return s;
}

Components.utils.import("resource://jetpack/modules/track.js");

var ioService = Components.classes["@mozilla.org/network/io-service;1"].
getService(Components.interfaces.nsIIOService);

function PageMods(jetpack) {
  MemoryTracking.track(this);
  // store the patterns in this array
  this.patterns = [];

  if (typeOf(jetpack) === 'object'){
    this.jetpack  = jetpack;
  }
  else {
    throw new Error("Please pass in jetpack to instatiate PageMods");
  }

  this.__defineGetter__("MatchPattern", function() { return MatchPattern; });

}

PageMods.prototype = {

  add: function Jetpack_pageMods_add(callBack, options){
    // add this pageMod to Jetpack's pageMods collection
    // add a callback to all tabs and tabs that will open or reload...

    if(!typeOf(callBack) === 'function'){
      throw new Error("PageMods requires a function passed in as argument 0");
    }

    // introspect the options, handle string, array, and object
    var _options;
    var _patterns = [];

    if (typeOf(options) === 'object'){
      if (options.matches){
        _options = options.matches;
      }
      else {
        throw new Error("PagesMods.add expects an object with a matches property");
      }
    }
    else {
      _options = options;
    }

    if(typeOf(_options) === 'array'){
      _patterns = _options.slice();
    }
    else if (typeOf(_options) === 'string'){
      _patterns = [_options];
    }

    // store all MatchPattern Objects in a new object with its corrresponding
    // callback function
    for (var i=0; i < _patterns.length; i++) {
      try {
        // dump("Current Pattern: " + _patterns[i] + "\n");
        let m = new MatchPattern(_patterns[i]);
        this.patterns.push({ pattern: m, callback: callBack });
      }
      catch (e) {
        throw new Error("There was a problem creating a MatchPattern\n " +
                        e + "\n");
      }
    }
    // register the matches and callbacks

    var scope = this;

    this.jetpack.tabs.onReady(function() {
      for (var i=0; i < scope.patterns.length; i++){
        if(scope.patterns[i].pattern.doMatch(this.contentDocument.location)){
          scope.patterns[i].callback(this.contentDocument);
        }
        else {
          // match failure, noop
        }
      }
    });

  }
};

function MatchPattern(pattern){
  MemoryTracking.track(this);
  // create and return a match pattern obj
  // validate match pattern!

  // matches *. or * or text of host
  var validateHost = /^(\*|\*\.[^/*]+|[^/*]+)$/;
  // matches * or text in path
  var validatePath = /^\/.*$/;
  var caseFlag = "i";
  var globalFlag = "g";
  var flags = caseFlag + globalFlag;

  try {
    var uri = ioService.newURI(pattern, null, null );
  }
  catch(e) {
    throw new Error("Pattern could not be parsed by nsURI: " + e);
  }

  var validScheme = ['http', 'https', 'ftp', 'file'];

  if (uri.scheme === 'file') {
    if (!validatePath.test(uri.path)) {
      // dump(">>>>>> scheme: " + uri.scheme + "\n");
      // dump("host: " + uri.host + "\n");
      // dump("path: " + uri.path + "\n");
      throw new Error("File scheme match pattern does not conform to pattern rules");
    }
  }
  else {
    if (!validateHost.test(uri.host) || !validatePath.test(uri.path)
       || validScheme.indexOf(uri.scheme) < 0) {
      // dump(">>>>>> scheme: " + uri.scheme + "\n");
      // dump("host: " + uri.host + "\n");
      // dump("path: " + uri.path + "\n");
      throw new Error("http(s) or ftp match pattern does not conform to pattern rules");
    }
  }

  var regexes = {};
  regexes.scheme = uri.scheme;

  if (uri.scheme !== 'file'){
    // dump(RegExp.escape(uri.host) + "\n\n\n");
    var host = RegExp.escape(uri.host).replace('\\*', '[a-zA-Z0-9-]+');
    regexes.host = new RegExp(host, flags);
  }
  else {
    regexes.host = null;
  }

  var path = RegExp.escape(uri.path).replace('\\*', '.*');
  regexes.path = new RegExp(path, flags);

  this.regexes = regexes;
  return this;
}

MatchPattern.prototype = {

  doMatch: function jetpack_pageMods_MatchPattern_doMatch(uriSpec){
    // dump("Matching for " + uriSpec + "\n");
    var matchURI = ioService.newURI(uriSpec, null, null);
    var results;
    if (this.regexes.host === null){
      results =  (this.regexes.scheme === matchURI.scheme &&
                  this.regexes.path.test(matchURI.path));
    }
    else {
      results =  (this.regexes.scheme === matchURI.scheme &&
                  this.regexes.path.test(matchURI.path) &&
                  this.regexes.host.test(matchURI.host));

    }
    return results;
  }
};

RegExp.escape = function(text) {
  if (!arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  return text.replace(arguments.callee.sRE, '\\$1');
};
