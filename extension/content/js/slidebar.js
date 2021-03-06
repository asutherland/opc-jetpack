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
*  Drew Willcoxon <adw@mozilla.com>
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

// = SlideBar =
//
// This static singleton module handles appending of SlideBar features as well
// as animating the SlideBar in each browser window. SlideBar keeps track of
// each Jetpack context (and each of its appended features) as well as each
// browser window so that each feature is instantiated for each browser.

let SlideBar = let (T = {
  //////////////////////////////////////////////////////////////////////////////
  //// JetpackEnv

  // ==== {{{SlideBar.makeExported}}} ====
  // Create an object to export for this new JetpackContext
  makeExported: function Selection_makeExported(context) {
    // Prepare SlideBar for the context's listeners
    T.load(context);

    // Add items for Jetpack features to access
    let exportObj = {};

    // Append a new feature to SlideBar for the feature args
    exportObj.append = function(args) {
      // Remember which features have been appended
      context.slideBar.appends.push(args);

      // Add this new feature to all open windows
      T.windows.forEach(function(window) T.addFeature(context, args, window));
    };

    return exportObj;
  },

  //////////////////////////////////////////////////////////////////////////////
  //// JetpackRuntime

  // ==== {{{SlideBar.watcher}}} ====
  // BrowserWatcher to detect when windows are loaded and unloaded
  watcher: null,

  // ==== {{{SlideBar.init()}}} ====
  // Called (once) to initialize the singleton on first access
  init: function SlideBar_init() {
    // We should only run once, so set ourselves to do nothing
    T.init = function() {};

    try {
      // This should always throw because we either get not avail or no file
      Components.utils.import("resource://personas");
    }
    catch(ex) {
      // We'll get NS_ERROR_FILE_NOT_FOUND if Personas /is/ installed
      T.hasPersonas = ex.name != "NS_ERROR_NOT_AVAILABLE";
    }

    // Listen in on when the runtime and browsers unload
    JetpackRuntime.addUnloader(T.uninit);
    T.watcher = new BrowserWatcher(T);

    return T;
  },

  // ==== {{{SlideBar.uninit()}}} ====
  // Clean up the singleton when the runtime is quitting
  uninit: function SlideBar_uninit() {
    // Unload the watcher to trigger browser unloads
    T.watcher.unload();
    T.watcher = null;
  },

  //////////////////////////////////////////////////////////////////////////////
  //// JetpackContext

  // ==== {{{SlideBar.contexts}}} ====
  // Track each JetpackContext that uses SlideBar
  contexts: [],

  // ==== {{{SlideBar.load()}}} ====
  // Prepare the JetpackContext for use with SlideBar
  load: function SlideBar_load(context) {
    // Hook up the unloader to pass in the context
    context.addUnloader({
      unload: function() T.unload(context)
    });

    // Keep track of all contexts to add their features to new windows
    T.contexts.push(context);

    // == Context ==
    // Extend the JetpackContext with custom SlideBar properties to remember
    // which features were appended and all live instances of the features.

    // Inject SlideBar data to the context
    context.slideBar = {
      // ==== {{{Context.appends}}} ====
      // All the appended options from the context
      appends: [],

      // ==== {{{Context.features}}} ====
      // All the feature instances across all windows for the context
      features: []
    };
  },

  // ==== {{{SlideBar.unload()}}} ====
  // Handle the removal of a context (it might be reloading)
  unload: function SlideBar_unload(context) {
    // Remove all feature instances for this context
    T.removeFeatures(context.slideBar.features);

    // Forget about this context now that it's unloaded
    T.removeItem(T.contexts, context);
  },

  //////////////////////////////////////////////////////////////////////////////
  //// BrowserWatcher

  // ==== {{{SlideBar.windows}}} ====
  // Track each browser window that has a SlideBar
  windows: [],

  // ==== {{{SlideBar.onLoad()}}} ====
  // Handle the load of a new browser window and add features to it
  onLoad: function SlideBar_onLoad(window) {
    // Keep track of all windows to add features to them later
    T.windows.push(window);

    let slideBar = window.document.getElementById("slidebar");
    let doc = slideBar.contentWindow.document;
    let content = window.document.getElementById("_browser");

    // Add an image as a target area for the SlideBar
    let slideButton = window.document.createElement("slideButton");
    slideButton.style.height = slideButton.style.width = "11px";
    slideButton.style.padding = "7px 2px";
    slideButton.style.width = "20px";

    slideButton.style.backgroundRepeat = "no-repeat";
    slideButton.style.backgroundPosition = "center";

    let tabStrip = window.document.getElementById("content").mStrip;
    tabStrip.insertBefore(slideButton, tabStrip.firstChild);

    // Push down the top of the SlideBar browser element so that it's not
    // visible, so Personas can shine through
    if (T.hasPersonas)
      slideBar.style.marginTop = tabStrip.clientHeight + "px";
    slideBar.style.opacity = 1;

    // Setup the context menu listener
    let menu = window.document.getElementById("jetpack:slidebarContextMenu");
    menu.addEventListener("popupshowing", T.onContextMenuShowing, true);

    // == Window ==
    // Extend the browser window with custom SlideBar properties such as its
    // SlideBar and content area plus track animation progress and mouse moves

    // Inject SlideBar data to the window
    let W = window.slideBar = {
      // ==== {{{Window.content}}} ====
      // Alias to the original browser content area
      content: content,

      // ==== {{{Window.ease}}} ====
      // Status of the easing animation such as left/right current, starting and
      // ending positions as well as timing
      ease: {
        curr: [0, 0],
        end: null,
        start: null,
        time: null,
        timer: null
      },

      // ==== {{{Window.features}}} ====
      // All the feature instances across all contexts for the window
      features: [],

      // ==== {{{Window.icons}}} ====
      // Alias to the icons container in the browser's SlideBar
      icons: doc.getElementById("icons"),

      // ==== {{{Window.iframes}}} ====
      // Alias to the iframes container in the browser's SlideBar
      iframes: doc.getElementById("iframes"),

      // ==== {{{Window.mouse}}} ====
      // Mouse stats such as last position recorded
      mouse: {
        posX: null,
        posY: null,
        timer: null
      },

      // ==== {{{Window.shown}}} ====
      // Currently shown feature in the browser's SlideBar
      shown: null,

      // === {{{Window.slideButton}}} ===
      // Button shown in chrome UI to toggle the SlideBar
      slideButton: slideButton,

      // === {{{Window.slideButtonLeft}}} ===
      // Image to show when the SlideBar should go left
      slideButtonLeft: "chrome://jetpack/content/gfx/arrowLeft.png",

      // === {{{Window.slideButtonRight}}} ===
      // Image to show when the SlideBar should go right
      slideButtonRight: "chrome://jetpack/content/gfx/arrowRight.png",

      // ==== {{{Window.doc}}} ====
      // Alias to the browser's SlideBar's document
      slideDoc: doc,

      // ==== {{{Window.state}}} ====
      // Current state of the browser's Slidebar position
      state: {
        persist: null,
        size: 0
      },

      // ==== {{{Window.notifyFeature()}}} ====
      // Indicate that the provided feature has something to notify
      notifyFeature: function Window_notifyFeature(feature) {
        // Don't bother notifying for something that is already shown
        if (W.shown == feature)
          return;

        // Open if the icons aren't being shown
        if (W.state.size < 32)
          W.slide(32, true);

        // Highlight the notified feature
        feature.icon.className = "notified";

        // Animate the icon for ~1 second
        let icon = feature.cbArgs.icon;
        let frame = 0;
        (function updateIcon() {
          let deg = Math.round(25 * Math.sin(frame / 15 * Math.PI));
          icon.style.MozTransform = "rotate(" + deg + "deg)";
          if (frame++ < 30)
            setTimeout(updateIcon, 33);
        })();
      },

      // ==== {{{Window.onMouseMove()}}} ====
      // Handle the user moving the mouse over the browser content area
      onMouseMove: function Window_onMouseMove(event) {
        // Don't bother sliding if there's nothing to show
        if (W.features.length == 0)
          return;

        // We can calculate movement if we have another point
        if (W.mouse.posX != null) {
          // Calculate the pointer position and movement
          let x = event.screenX - content.boxObject.screenX;
          let y = event.screenY - content.boxObject.screenY;
          let diffX = event.screenX - W.mouse.posX;
          let diffY = event.screenY - W.mouse.posY;

          // Might want to open if we're closed
          if (W.state.size == 0) {
            // Open if the pointer is moving to the top left
            if (x < 32 && y < 32 && (diffX < -32 || diffY < -32))
              W.slide(32);
          }
          // Might want to close if we're transiently open
          else if (!W.state.persist) {
            // Any motion to the right will close
            if (diffX > 16)
              W.slide(0);
          }
        }
        else {
          // Save where and when we started
          W.mouse.posX = event.screenX;
          W.mouse.posY = event.screenY;

          // Clear these stats after a little bit
          W.mouse.timer = setTimeout(function() {
            W.mouse.posX = null;
            W.mouse.posY = null;
            W.mouse.timer = null;
          }, 500);
        }
      },

      // ==== {{{Window.selectFeature()}}} ====
      // Select the provided feature and unselect the previous one
      selectFeature: function Window_selectFeature(feature) {
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

        // Show the feature and slide to the feature's width and persist
        if (W.shown) {
          // Automatically reload the content on select if necessary
          if (feature.args.autoReload)
            feature.cbArgs.contentDocument.reload();

          W.shown.icon.className = "selected";
          W.shown.iframe.className = "selected";
          feature.cbArgs.slide(feature.iframeWidth, feature.args.persist);

          // Let the feature know it's been selected
          T.catchCall(feature.args, "onSelect", feature.cbArgs);
        }
      },

      // ==== {{{Window.slide()}}} ====
      // Slide the browser's SlideBar to the given size and persist state
      slide: function Window_slide(size, persist) {
        // Only handle number slide sizes
        if (typeof size != "number")
          return;

        // Don't bother sliding if it's what we already have
        persist = !!persist;
        if (size == W.state.size && persist == W.state.persist)
          return;

        // We can't be showing anything
        if (size == 0) {
          W.selectFeature();
          W.slideButton.style.backgroundImage = "url(" + W.slideButtonRight + ")";

          // Move focus to the slideButton in-case focus went to the SlideBar
          W.slideButton.focus();
        }
        else
          W.slideButton.style.backgroundImage = "url(" + W.slideButtonLeft + ")";

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
      },

      // ==== {{{{Window.toggle()}}} ====
      toggle: function Window_toggle() {
        W.slide(W.state.size == 0 ? 32 : 0);
      }
    };

    // Make sure the SlideBar is in the right position and init background
    W.slide(0);

    // Detect when we should show the SlideBar
    content.addEventListener("mousemove", W.onMouseMove, false);
    slideButton.addEventListener("click", W.toggle, false);

    // Add existing features to the new window
    T.contexts.forEach(function(context) context.slideBar.appends.forEach(
      function(args) T.addFeature(context, args, window)));
  },

  // ==== {{{SlideBar.onUnload()}}} ====
  // Handle the unload of a browser to remove features from it
  onUnload: function SlideBar_onUnload(window) {
    let winBar = window.slideBar;
    // Remove listeners on unload
    winBar.content.removeEventListener("mousemove", winBar.onMouseMove, false);

    // Remove added chrome UI
    winBar.slideButton.parentNode.removeChild(winBar.slideButton);

    // Remove all feature instances for this window
    T.removeFeatures(winBar.features);

    // Forget about this window now that it's unloaded
    T.removeItem(T.windows, window);

    // Remove the context menu listener
    let menu = window.document.getElementById("jetpack:slidebarContextMenu");
    menu.removeEventListener("popupshowing", T.onContextMenuShowing, true);
  },

  //////////////////////////////////////////////////////////////////////////////
  //// SlideBar

  // ==== {{{SlideBar.hasPersonas}}} ====
  // Flag to indicate if the user has Personas installed
  hasPersonas: false,

  // ==== {{{SlideBar.addFeature()}}} ====
  // Add the appended options for the context to the window
  addFeature: function SlideBar_addFeature(context, args, window) {
    let winBar = window.slideBar;

    // == Feature ==
    // Create a new instance of the feature for the context and window
    let F = {
      // ==== {{{Feature.args}}} ====
      // Remember the original args used to append the feature
      args: args,

      // ==== {{{Feature.cbArgs}}} ====
      // Provide an object for all SlideBar callbacks
      cbArgs: {
        // ==== {{{Feature.cbArgs.close()}}} ====
        // Feature specific function to close the SlideBar
        close: function() {
          winBar.slide(0);
        },

        // ==== {{{Feature.cbArgs.contentDocument}}} ====
        // Alias to the actual document of the iframe
        get contentDocument() {
          let doc = F.iframe.contentDocument;
          // ==== {{{Feature.cbArgs.contentDocument.reload()}}} ====
          // Reset the content to the original html/url appended
          doc.reload = function() doc.location.replace(F.contentUrl);
          return doc;
        },

        // ==== {{{Feature.cbArgs.icon}}} ====
        // Alias to the actual img node of the icon
        get icon() {
          let icon = F.icon.firstChild;
          // ==== {{{Feature.cbArgs.icon.reload()}}} ====
          // Reset the icon to the original icon url appended
          icon.reload = function() icon.src = F.iconUrl;
          return icon;
        },

        // ==== {{{Feature.cbArgs.notify()}}} ====
        // Let the feature notify itself in the SlideBar
        notify: function() {
          winBar.notifyFeature(F);
        },

        // ==== {{{Feature.cbArgs.slide()}}} ====
        // Feature specific function to slide the SlideBar
        slide: function(size, options) {
          options = options || {};
          size = size || 0;
          let persist = typeof options == "boolean" ? options : options.persist;

          // Only do something if we have a valid size
          if (size > 0)
            winBar.slide(size + 32, persist);
        },
      },

      // ==== {{{Feature.contentUrl}}} ====
      // Remember what url to load for the content frame
      contentUrl: "about:blank",

      // ==== {{{Feature.context}}} ====
      // Remember which context the feature belongs to
      context: context,

      // ==== {{{Feature.icon}}} ====
      // Icon object for the minimal SlideBar view
      icon: null,

      // ==== {{{Feature.iconUrl}}} ====
      // Remember what url to load for the icon
      iconUrl: "chrome://jetpack/content/gfx/jetpack_32x32.png",

      // ==== {{{Feature.iframe}}} ====
      // Iframe object for the expanded SlideBar view
      iframe: null,

      // ==== {{{Feature.iframeWidth}}} ====
      // Remember how big to make the iframe
      iframeWidth: 200,

      // ==== {{{Feature.window}}} ====
      // Remember which window the feature belongs to
      window: window
    };

    // Figure out what icon and content to load then save them
    if (args.icon)
      F.iconUrl = args.icon;
    if (args.html)
      F.contentUrl = "data:text/html," + encodeURI(args.html);
    else if (args.url)
      F.contentUrl = args.url;
    if (args.width)
      F.iframeWidth = args.width;

    let makeEl = function(type) winBar.slideDoc.createElement(type);

    // Add the icon for the feature
    let img = winBar.slideDoc.createElement("img");
    img.src = F.iconUrl;
    F.icon = winBar.slideDoc.createElement("div");
    F.icon.appendChild(img);
    winBar.icons.appendChild(F.icon);

    // Add the iframe for the feature
    F.iframe = winBar.slideDoc.createElementNS("http://www.mozilla.org/" +
      "keymaster/gatekeeper/there.is.only.xul", "iframe");
    F.iframe.setAttribute("type", "content");
    F.iframe.setAttribute("src", F.contentUrl);
    F.iframe.style.width = F.iframeWidth + "px";
    winBar.iframes.appendChild(F.iframe);

    F.icon.addEventListener("click", function() {
      // Track when the icon is selected
      winBar.selectFeature(F);

      // Let the feature know it was clicked
      T.catchCall(args, "onClick", F.cbArgs);
    }, true);

    // Track when the iframe loads
    F.iframe.addEventListener("DOMContentLoaded", function iframeLoaded() {
      F.iframe.removeEventListener("DOMContentLoaded", iframeLoaded, false);

      // Store the feature ID in the iframe's content window so jetpack.menu
      // will know which feature the iframe is associated with.
      F.iframe.contentWindow._featureId = context.id;

      // Let the feature know the iframe has loaded
      T.catchCall(args, "onReady", F.cbArgs);
    }, false);

    // The contexts tracks all instances of the feature
    context.slideBar.features.push(F);

    // The window needs to know which features are in it
    window.slideBar.features.push(F);
  },

  // ==== {{{SlideBar.catchCall()}}} ====
  // Call the named function of an object with any arguments if it exists
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

  // ==== {{{SlideBar.removeItem()}}} ====
  // Remove the item from the array if it exists
  removeItem: function SlideBar_removeItem(array, item) {
    let idx = array.indexOf(item);
    if (idx != -1)
      array.splice(idx, 1);
  },

  // ==== {{{SlideBar.removeFeature()}}} ====
  // Remove a given feature instance from its window and context
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

  // ==== {{{SlideBar.removeFeatures()}}} ====
  // Remove all features given an array of features
  removeFeatures: function SlideBar_removeFeatures(features) {
    // Make a copy of the array as it might change as we remove features
    features.slice().forEach(function(feature) T.removeFeature(feature));
  },

  // ==== {{{SlideBar.onContextMenuShowing()}}} ====
  // If the SlideBar context menu is invoked on an iframe created by a feature
  // that has not loaded the jetpack.menu namespace, cancel the menu
  onContextMenuShowing: function SlideBar_onContextMenuShowing(event) {
    // Get the feature ID of the iframe containing the node that was clicked
    let browserWin = event.view;
    let iframeWin = browserWin.document.popupNode.ownerDocument.defaultView;
    let featureId = iframeWin._featureId;

    if (featureId) {
      // Find the context of the feature that created the iframe
      for (let i = 0; i < T.contexts.length; i++) {
        let context = T.contexts[i];
        if (context.id === featureId) {
          if (!("menuNamespaceLoaded" in context))
            event.preventDefault();
          return;
        }
      }
    }
    else {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}) T.init();
