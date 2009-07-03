/***************************** BEGIN LICENSE BLOCK *****************************
* Version: MPL 1.1/GPL 2.0/LGPL 2.1
*
* The contents of this file are subject to the Mozilla Public License Version
* 1.1 (the "License"); you may not use this file except in compliance with the
* License. You may obtain a copy of the License at http://www.mozilla.org/MPL/
*
* Software distributed under the License is distributed on an "AS IS" basis,
* WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for
* the specific language governing rights and limitations under the License.
*
* The Original Code is Selection.
*
* The Initial Developer of the Original Code is Mozilla Corporation.
* Portions created by the Initial Developer are Copyright (C) 2009 the Initial
* Developer. All Rights Reserved.
*
* Contributor(s):
*  Edward Lee <edilee@mozilla.com> (original author)
*
* Alternatively, the contents of this file may be used under the terms of either
* the GNU General Public License Version 2 or later (the "GPL"), or the GNU
* Lesser General Public License Version 2.1 or later (the "LGPL"), in which case
* the provisions of the GPL or the LGPL are applicable instead of those above.
* If you wish to allow use of your version of this file only under the terms of
* either the GPL or the LGPL, and not to allow others to use your version of
* this file under the terms of the MPL, indicate your decision by deleting the
* provisions above and replace them with the notice and other provisions
* required by the GPL or the LGPL. If you do not delete the provisions above, a
* recipient may use your version of this file under the terms of any one of the
* MPL, the GPL or the LGPL.
*
****************************** END LICENSE BLOCK ******************************/

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

////////////////////////////////////////////////////////////////////////////////
//// Selection

// = Selection =
//
// This static singleton module handles getting and setting the currently
// focused window/tab's selected content as well as providing a way to trigger
// when content is selected. Selection adds selection listeners to each loaded
// page and tracks each context's added callbacks to trigger each when selection
// changes.

let Selection = let (T = {
  //////////////////////////////////////////////////////////////////////////////
  //// JetpackEnv

  // ==== {{{Selection.makeExported()}}} ====
  // Create an object to export for this new JetpackContext
  makeExported: function Selection_makeExported(context) {
    // Prepare Selection for the context's listeners
    T.load(context);

    // Add items for Jetpack features to access
    let exportObj = {};

    // Allow listening for the user to select content
    exportObj.onSelection = function(callback) {
      T.addListener(context, callback);
    };

    // Allow listeners to stop listening
    exportObj.onSelection.unbind = function(callback) {
      T.removeListener(context, callback);
    };

    // Make getter/setters for various selection types
    ["html", "text"].forEach(function(type) {
      exportObj.__defineGetter__(type, function() T.getData(type));
      exportObj.__defineSetter__(type, function(val) T.setData(type, val));
    });

    return exportObj;
  },

  //////////////////////////////////////////////////////////////////////////////
  //// JetpackRuntime

  // ==== {{{Selection.init()}}} ====
  // Called (once) to initialize the singleton on first access
  init: function Selection_init() {
    // We should only run once, so set ourselves to do nothing
    T.init = function() {};

    // Listen in on when the runtime and browsers unload
    JetpackRuntime.addUnloader(T.uninit);
    T.watcher = new BrowserWatcher(T);

    return T;
  },

  // ==== {{{Selection.uninit()}}} ====
  // Clean up the singleton when the runtime is quitting
  uninit: function Selection_uninit() {
    // Unload the watcher to trigger browser unloads
    T.watcher.unload();
    T.watcher = null;

    // Stop tracking any listener callbacks that were added
    T.listeners = [];
  },

  // ==== {{{Selection.watcher}}} ====
  // BrowserWatcher to detect when windows are loaded and unloaded
  watcher: null,

  //////////////////////////////////////////////////////////////////////////////
  //// JetpackContext

  // ==== {{{Selection.load()}}} ====
  // Prepare the JetpackContext for use with Selection
  load: function Selection_load(context) {
    // Hook up the unloader to pass in the context
    context.addUnloader({
      unload: function() T.unload(context)
    });

    // Inject Selection data to the context
    context.selection = {
      // Track all the selection listeners from the context
      listeners: [],
    };
  },

  // ==== {{{Selection.unload()}}} ====
  // Handle the removal of a context (it might be reloading)
  unload: function Selection_unload(context) {
    // Remove the listeners added from this context (copy because we remove)
    context.selection.listeners.slice().forEach(function(callback) {
      T.removeListener(context, callback);
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  //// BrowserWatcher

  // ==== {{{Selection.onLoad()}}} ====
  // Handle the load of a new browser window and add features to it
  onLoad: function Selection_onLoad(window) {
    // Listen for DOM events
    let browser = window.document.getElementById("appcontent");
    browser.addEventListener("load", T.onPageLoad, true);
    browser.addEventListener("unload", T.onPageUnload, true);

    // Add selection listeners for all open tabs
    T.getAllWindows(window).forEach(T.addSelection);
  },

  // ==== {{{Selection.onUnload()}}} ====
  // Handle the unload of a browser to remove features from it
  onUnload: function Selection_onUnload(window) {
    // Stop listening for DOM events
    let browser = window.document.getElementById("appcontent");
    browser.removeEventListener("load", T.onPageLoad, true);
    browser.removeEventListener("unload", T.onPageUnload, true);

    // Remove selection listeners for all open tabs
    T.getAllWindows(window).forEach(T.removeSelection);
  },

  //////////////////////////////////////////////////////////////////////////////
  //// nsISelectionListener

  // ==== {{{Selection.notifySelectionChanged()}}} ====
  // Handle the selection change and notify listeners
  notifySelectionChanged: function Selection_notifySelectionChanged(document,
    selection, reason) {
    // We only look for certain types of selection reasons
    if (!["SELECTALL", "KEYPRESS", "MOUSEUP"].some(function(type) reason &
      Ci.nsISelectionListener[type + "_REASON"]))
      return;
    if (selection.toString() == "")
      return;

    // Notify each listener immediately (don't block on them)
    T.listeners.forEach(function(callback) setTimeout(callback, 0));
  },

  //////////////////////////////////////////////////////////////////////////////
  //// DOMContent Listener

  // ==== {{{Selection.onPageLoad()}}} ====
  // Handle some content page (tab or iframe) finishing loading
  onPageLoad: function Selection_onPageLoad(event) {
    // Nothing to do without a useful window
    let window = event.target.defaultView;
    if (window == null)
      return;

    // Wrap the add selection call with some number of setTimeout 0 because some
    // reason it's possible to add a selection listener "too early". 2 sometimes
    // works for gmail, and more consistently with 3, so make it 5 to be safe.
    (function wrap(count, func) {
      if (count-- > 0)
        setTimeout(wrap, 0, count, func);
      else
        func();
    })(5, function() T.addSelection(window));
  },

  // ==== {{{Selection.onPageUnload()}}} ====
  // Handle the unloading of some content page
  onPageUnload: function Selection_onPageUnload(event) {
    // Nothing to do without a useful window
    let window = event.target.defaultView;
    if (window == null)
      return;
    T.removeSelection(window);
  },

  //////////////////////////////////////////////////////////////////////////////
  //// Selection

  // ==== {{{Selection.addListener()}}} ====
  // Add a selection listener for the given JetpackContext
  addListener: function Selection_addListener(context, callback) {
    // Remember each added listener for the context to remove them on unload
    context.selection.listeners.push(callback);

    // Remember all added listeners to notify them on selection
    T.listeners.push(callback);
  },

  // ==== {{{Selection.addSelection()}}} ====
  // Watch the provided window's selection for selection changes
  addSelection: function Selection_addSelection(window) {
    // Only add the selection for a window once
    if (window.selectionAdded == true)
      return;
    window.selectionAdded = true;

    let selection = window.getSelection();
    if (!(selection instanceof Ci.nsISelectionPrivate))
      return;
    selection.addSelectionListener(T);
  },

  // ==== {{{Selection.context}}} ====
  // Get the currently focused browser's tab's window
  get context Selection_get_context() {
    return Cc["@mozilla.org/appshell/window-mediator;1"].
      getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser").
      document.commandDispatcher.focusedWindow;
  },

  // ==== {{{Selection.getAllWindows()}}} ====
  // Get all (frame) windows for all tabs of the browser window
  getAllWindows: function Selection_getAllWindows(window) {
    // Track all frames recursively found from the window
    let windows = [];
    let getFrames = function(window) {
      windows.push(window);
      Array.forEach(window.frames, getFrames);
    };

    // Iterate over the array-like browsers (tabs) to get each frame in them
    Array.forEach(window.getBrowser().browsers, function(browser)
      getFrames(browser.contentWindow));
    return windows;
  },

  // ==== {{{Selection.getData()}}} ====
  // Get the currently selected data as the provided type
  getData: function Selection_getData(type) {
    // Make sure we have a window context with a selection
    let window, selection, range;
    try {
      window = T.context;
      selection = window.getSelection();
      range = selection.getRangeAt(0);
    }
    catch(ex) {
      return null;
    }

    // Get the selected content as the specified type
    if (type == "text")
      return selection.toString();

    // Must be type "html", so read out the nodes
    let html = range.cloneContents();
    let node = window.document.createElement("span");
    node.appendChild(html);
    return node.innerHTML;
  },

  // ==== {{{Selection.listeners}}} ====
  // Track all currently added listeners from all contexts to notify them
  listeners: [],

  // ==== {{{Selection.removeItem()}}} ====
  // Remove the item from the array if it exists
  removeItem: function Selection_removeItem(array, item) {
    let idx = array.indexOf(item);
    if (idx != -1)
      array.splice(idx, 1);
  },

  // ==== {{{Selection.removeListener()}}} ====
  // Remove the callback listener for the context and Selection
  removeListener: function Selection_removeListener(context, callback) {
    T.removeItem(context.selection.listeners, callback);
    T.removeItem(T.listeners, callback);
  },

  // ==== {{{Selection.removeSelection()}}} ====
  // Stop watching for selection changes in the window
  removeSelection: function Selection_removeSelection(window) {
    // Only remove a selection if we've added it
    if (window.selectionAdded != true)
      return;
    window.selectionAdded = false;

    let selection = window.getSelection();
    if (!(selection instanceof Ci.nsISelectionPrivate))
      return;
    selection.removeSelectionListener(T);
  },

  // ==== {{{Selection.setData()}}} ====
  // Change the selected content to the provided value of type
  setData: function Selection_setData(type, val) {
    // Make sure we have a window context with a selection
    let window, range;
    try {
      window = T.context;
      range = window.getSelection().getRangeAt(0);
    }
    catch(ex) {
      return;
    }

    // Get rid of the current selection and insert our own
    range.deleteContents();
    let node = window.document.createElement("span");
    range.surroundContents(node);
    node[type == "text" ? "textContent" : "innerHTML"] = val;
  },

  //////////////////////////////////////////////////////////////////////////////
  //// nsISupports

  // ==== {{{Selection.QueryInterface()}}} ====
  // Indicate which XPCOM interfaces that are implemented
  QueryInterface: XPCOMUtils.generateQI(["nsISelectionListener"])
}) T.init();
