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
Components.utils.import("resource://jetpack/modules/init.js");
var EXPORTED_SYMBOLS = ["CanvasBrowser"];

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

function CanvasBrowser(canvas, context, iframe) {
  this._init(canvas, context, iframe);
}
CanvasBrowser.prototype = {  
  _canvas: null,
  _iframe: null,
  _context: null,
  
  _init: function(canvas, context, iframe) {
    this._iframe = iframe;
    this._canvas = canvas;
    this._context = context;
    return this;
  },
  
  renderPage: function(url) {
    // Load url and update canvas
    let self = this;
    this._iframe.setAttribute("src", url);
    
    // Setup event handler for page changes in iframe
    this._iframe.addEventListener("load", function() {
      // FIXME!
			// Hiding the iframe results in the page not rendering
			// possibly due to Gecko optimization?
			//
      //self._iframe.style.visibility = "hidden";
      
      // Setup event handler for propogating changes in iframe back
      self._iframe.contentWindow.addEventListener(
        "MozAfterPaint", function(e) { self._repaint(e); }, false
      );
      self._repaint();
      
      // Setup event handlers for all user interaction on canvas
      let keyEvents = ["keydown", "keyup"];
      let mouseEvents = [
        "mousedown", "mouseup", "mouseover", "mousemove", "mouseout"
      ];
      
      let i;
      for (i = 0; i < keyEvents.length; i++) {
        self._canvas.ownerDocument.addEventListener(
          keyEvents[i], function(e) { self._handleKeyEvent(e); }, false
        );
      }
      for (i = 0; i < mouseEvents.length; i++) {
        self._canvas.addEventListener(
          mouseEvents[i], function(e) { self._handleMouseEvent(e); }, false
        );
      }
    }, false);
  },
  
  _repaint: function(aEvent) {
    this._context.drawWindow(
      this._iframe.contentWindow,
      0, 0, this._canvas.width, this._canvas.height,
      "rgb(0,0,0)"
    );
  },
  
  // Parse the key modifier flags from an event.
  _parseModifiers: function(aEvent) {
    let mval = 0;
    let mask = Components.interfaces.nsIDOMNSEvent;
    
    if (aEvent.shiftKey)
      mval |= mask.SHIFT_MASK;
    if (aEvent.ctrlKey)
      mval |= mask.CONTROL_MASK;
    if (aEvent.altKey)
      mval |= mask.ALT_MASK;
    if (aEvent.metaKey)
      mval |= mask.META_MASK;

    return mval;
  },
  
  _handleKeyEvent: function(aEvent) {
    // FIXME: Key events loop infinitely even if we call stopPropogation!
		
		/*
    let windowUtils = this._iframe.contentWindow.
      QueryInterface(Components.interfaces.nsIInterfaceRequestor).
      getInterface(Components.interfaces.nsIDOMWindowUtils);
    
    
    windowUtils.sendKeyEvent(
      aEvent.type, aEvent.keyCode, aEvent.charCode, this._parseModifiers(aEvent), false
    );
    aEvent.stopPropagation();
    */
  },
  
  _handleMouseEvent: function(aEvent) {
    let windowUtils = this._iframe.contentWindow.
      QueryInterface(Components.interfaces.nsIInterfaceRequestor).
      getInterface(Components.interfaces.nsIDOMWindowUtils);

    try {
      windowUtils.sendMouseEvent(
        aEvent.type, aEvent.clientX, aEvent.clientY, aEvent.button,
        aEvent.detail, this._parseModifiers(aEvent)
      );
    } catch (e) {
      dump("Got exception " + e + "while sending " + aEvent.type + "\n");
    }
  }
}
