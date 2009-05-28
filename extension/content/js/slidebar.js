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
* The Original Code is SlideBar.
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

////////////////////////////////////////////////////////////////////////////////
//// SlideBar

let SlideBar = let (T = {
  //////////////////////////////////////////////////////////////////////////////
  //// JetpackEnv

  append: function SlideBar_append(context, args) {
    // Remember which features have been appended
    context.slideBar.appends.push(args);

    // Add this new feature to all open windows
    T.windows.forEach(function(window) T.addFeature(context, args, window));
  },

  //////////////////////////////////////////////////////////////////////////////
  //// JetpackRuntime

  watcher: null,

  init: function SlideBar_init() {
    // We should only run once, so set ourselves to do nothing
    T.init = function() {};

    // Listen in on when the runtime and browsers unload
    JetpackRuntime.addUnloader(T.uninit);
    T.watcher = new BrowserWatcher(T);
  },

  uninit: function SlideBar_uninit() {
    // Unload the watcher to trigger browser unloads
    T.watcher.unload();
    T.watcher = null;
  },

  //////////////////////////////////////////////////////////////////////////////
  //// JetpackContext

  contexts: [],

  load: function SlideBar_load(context) {
    // Keep track of all contexts to add their features to new windows
    T.contexts.push(context);

    // Inject SlideBar data to the context
    context.slideBar = {
      appends: [],
      features: []
    };
  },

  unload: function SlideBar_unload(context) {
    // Remove all feature instances for this context
    T.removeFeatures(context.slideBar.features);

    // Forget about this context now that it's unloaded
    T.removeItem(T.contexts, context);
  },

  //////////////////////////////////////////////////////////////////////////////
  //// BrowserWatcher

  windows: [],

  onLoad: function SlideBar_onLoad(window) {
    // Keep track of all windows to add features to them later
    T.windows.push(window);

    let doc = window.document.getElementById("slidebar").contentWindow.document;
    let content = window.document.getElementById("_browser");

    // Inject SlideBar data to the window
    let W = window.slideBar = {
      content: content,
      ease: {
        curr: [0, 0],
        end: null,
        start: null,
        time: null,
        timer: null
      },
      features: [],
      icons: doc.getElementById("icons"),
      iframes: doc.getElementById("iframes"),
      mouse: {
        pos: null,
        timer: null
      },
      shown: null,
      slideDoc: doc,
      state: {
        persist: false,
        size: 0
      },

      onMouseMove: function Window_onMouseMove(event) {
        // Don't bother sliding if there's nothing to show
        if (W.features.length == 0)
          return;

        // We can calculate movement if we have another point
        if (W.mouse.pos != null) {
          // Calculate the pointer position and movement
          let x = event.screenX - content.boxObject.screenX;
          let diff = event.screenX - W.mouse.pos;

          // If we're closed, close to the left, and moving left..
          if (W.state.size == 0) {
            let near = function(left, thresh) x < left && diff < thresh;
            if (near(64, -16) || near(128, -128))
              W.slide(32);
          }
          // If we're not staying open, far from the left, and moving right..
          else if (!W.state.persist) {
            let near = function(left, thresh) x > left && diff > thresh;
            if (near(512, 16) || near(256, 128))
              W.slide(0);
          }
        }
        else {
          // Save where and when we started
          W.mouse.pos = event.screenX;

          // Clear these stats after a little bit
          W.mouse.timer = setTimeout(function() {
            W.mouse.pos = null;
            W.mouse.timer = null;
          }, 500);
        }
      },

      selectFeature: function Browser_selectFeature(feature) {
        // Don't bother doing anything if we're already showing it
        if (W.shown == feature)
          return;

        // Unselect the previously shown feature
        if (W.shown) {
          W.shown.icon.className = "";
          W.shown.iframe.className = "";
        }

        // Remember which feature is being shown
        W.shown = feature;

        // Show the feature and slide to the minimal view
        if (W.shown) {
          W.shown.icon.className = "selected";
          W.shown.iframe.className = "selected";
          W.slide(32);

          // Let the feature know it's been selected
          T.catchCall(feature.args, "onSelect", feature.cbArgs);
        }
      },

      slide: function Window_slide(size, persist) {
        // Only handle number slide sizes
        if (typeof size != "number")
          return;

        // Don't bother sliding if it's what we already have
        persist = !!persist;
        if (size == W.state.size && persist == W.state.persist)
          return;

        // We can't be showing anything
        if (size == 0)
          W.selectFeature();

        // Remember what state we're getting into
        W.state.size = size;
        W.state.persist = persist;

        // Set the left and right end points
        W.ease.end = [size, persist ? 0 : size];

        // Save where and when we started
        W.ease.start = W.ease.curr;
        W.ease.time = Date.now();

        // If we already have a timer running, it'll use the updated values
        if (W.ease.timer != null)
          return;
    
        // Create a new timer to slide from "start" to "end"
        W.ease.timer = setInterval(function() {
          // Figure out how much we've progressed since starting
          let prog = (Date.now() - W.ease.time) / 400;
          if (prog >= 1) {
            // We need to finish up, so no need for the timer anymore
            clearInterval(W.ease.timer);
            W.ease.timer = null;
    
            // We might have exceeded our time, so pretend we're at the end
            prog = 1;
          }
    
          // Overshoot some when sliding
          let scale = Math.PI / 1.8;
          prog = Math.sin(scale * prog) / Math.sin(scale);
    
          // Calculate the new position to shift things
          W.ease.curr = W.ease.curr.map(function(curr, idx)
            prog * W.ease.end[idx] + (1 - prog) * W.ease.start[idx]);
    
          W.content.style.marginLeft = W.ease.curr[0] + "px";
          W.content.style.marginRight = -W.ease.curr[1] + "px";
        }, 30);
      }
    };

    // Detect when we should show the SlideBar
    content.addEventListener("mousemove", W.onMouseMove, false);

    // Add existing features to the new window
    T.contexts.forEach(function(context) context.slideBar.appends.forEach(
      function(args) T.addFeature(context, args, window)));
  },

  onUnload: function SlideBar_onUnload(window) {
    let winBar = window.slideBar;
    // Remove listeners on unload
    winBar.content.removeEventListener("mousemove", winBar.onMouseMove, false);

    // Remove all feature instances for this window
    T.removeFeatures(winBar.features);

    // Forget about this window now that it's unloaded
    T.removeItem(T.windows, window);
  },

  //////////////////////////////////////////////////////////////////////////////
  //// SlideBar

  addFeature: function SlideBar_addFeature(context, args, window) {
    let winBar = window.slideBar;

    // Create a new instance of the feature for the context and window
    let F = {
      args: args,
      cbArgs: function(options) {
        options = options || {};

        let size = Number(options.size);
        if (size > 0)
          winBar.slide(options.size + 32, options.persist);
        else
          winBar.slide(0);
      },
      context: context,
      icon: null,
      iframe: null,
      window: window
    };

    F.cbArgs.__defineGetter__("icon", function() F.icon.firstChild);
    F.cbArgs.__defineGetter__("doc", function() F.iframe.contentDocument);

    let makeEl = function(type) winBar.slideDoc.createElement(type);

    // Add the icon for the feature
    F.icon = winBar.icons.appendChild(makeEl("div"));
    let img = F.icon.appendChild(makeEl("img"));
    img.src = args.icon || "chrome://jetpack/content/gfx/jetpack_32x32.png";

    // Figure out what to load for the iframe
    let url = "about:blank";
    if (args.html)
      url = "data:text/html," + encodeURI(args.html);
    else if (args.url)
      url = args.url;

    // Add the iframe for the feature
    F.iframe = winBar.iframes.appendChild(makeEl("iframe"));
    F.iframe.src = url;

    // Track when the icon is selected
    F.icon.addEventListener("click", function() winBar.selectFeature(F), true);

    // Track when the iframe loads
    F.iframe.addEventListener("DOMContentLoaded", function iframeLoaded() {
      F.iframe.removeEventListener("DOMContentLoaded", iframeLoaded, false);

      // Let the feature know the iframe has loaded
      T.catchCall(args, "onReady", F.cbArgs);
    }, false);

    // The contexts tracks all instances of the feature
    context.slideBar.features.push(F);

    // The window needs to know which features are in it
    window.slideBar.features.push(F);
  },

  catchCall: function SlideBar_catchCall(obj, func /* , arg1, arg2, .. */) {
    // Convert object property function names to the function
    if (typeof func == "string")
      func = obj[func];

    // Try calling the function with any additional arguments
    if (typeof func == "function") {
      try {
        func.apply(obj, Array.slice(arguments, 2));
      }
      catch(ex) {
        console.exception(ex);
      }
    }
  },

  removeItem: function SlideBar_removeItem(array, item) {
    // Remove the item from the array if it exists
    let idx = array.indexOf(item);
    if (idx != -1)
      array.splice(idx, 1);
  },

  removeFeature: function SlideBar_removeFeature(feature) {
    // Close if the feature is being removed
    let winBar = feature.window.slideBar;
    if (winBar.shown == feature)
      winBar.slide(0);

    // Remove the feature from the window
    let remEl = function(el) el.parentNode.removeChild(el);
    remEl(feature.icon);
    remEl(feature.iframe);

    // Remove feature instance from its context
    T.removeItem(feature.context.slideBar.features, feature);

    // Remove feature instance from its window
    T.removeItem(feature.window.slideBar.features, feature);
  },

  removeFeatures: function SlideBar_removeFeatures(features) {
    // Make a copy of the array as it might change as we remove features
    features.slice().forEach(function(feature) T.removeFeature(feature));
  }
}) T;
