function StatusBar(featureContext) {
  this._featureContext = featureContext;
  this._urlFactory = featureContext.urlFactory;
  this._browserWatchers = [];
  this._panels = [];
  this._windows = [];

  Extension.addUnloadMethod(
    this,
    function() {
      this._browserWatchers.forEach(
        function(watcher) {
          watcher.unload();
        });
      this._browserWatchers = [];
      // TODO: Assert that panel and window lists are empty?
    });
}

StatusBar.prototype = {
  _BG_PROPS: ["backgroundImage",
              "backgroundPosition",
              "backgroundRepeat",
              "backgroundColor",
              "backgroundAttachment"],

  _copyBackground: function copyBackground(fromElement, toElement) {
    var window = fromElement.ownerDocument.defaultView;
    var style = window.getComputedStyle(fromElement, null);
    this._BG_PROPS.forEach(
      function(name) {
        toElement.style[name] = style[name];
      });
  },

  _injectPanelWindowFunctions: function _injectPanelWindowFunctions(iframe) {
    var functions = {
      close: function close() {
        iframe.parentNode.parentNode.removeChild(iframe.parentNode);
      }
    };

    WebContentFunctions.importIntoWindow(functions, iframe.contentWindow);

    // Add apologizers for stuff that will eventually be available
    // to status bar panel windows but isn't yet.
    WebContentFunctions.evalIntoWindow(
      function(window) {
        function apologize(name) {
          throw new Error("Sorry, window." + name +
                          " is not yet available " +
                          "to Jetpack status bar panels!");
        }

        function apologizeForProperty(name) {
          try {
            window.__defineGetter__(name,
                                    function() { apologize(name); });
            window.__defineSetter__(name,
                                    function() { apologize(name); });
          } catch (e) {}
        }

        function apologizeForFunc(name) {
          window[name] = function() { apologize(name); };
        }

        apologizeForFunc("open");
        apologizeForProperty("jetpack");
        apologizeForProperty("console");
      },
      iframe.contentWindow
    );
  },

  _addPanelToWindow: function _addPanelToWindow(window, url, width) {
    var self = this;
    var document = window.document;
    var statusBar = document.getElementById("status-bar");
    var statusBarPanel = document.createElement("statusbarpanel");

    // This, combined with setting the iframe height to "100%" below,
    // causes the iframe to stretch to the height of the status bar.
    statusBarPanel.setAttribute("align", "stretch");

    // Set up the panel's context menu.  It must be the first child!  If the
    // feature hasn't loaded the jetpack.menu namespace, cancel the menu.
    var contextMenu = document.createElement("menupopup");
    statusBarPanel.appendChild(contextMenu);
    statusBarPanel.contextMenu = "_child";
    this._onContextMenuShowing = function _onContextMenuShowing(event) {
      if (!("menuNamespaceLoaded" in self._featureContext))
        event.preventDefault();
    }
    contextMenu.addEventListener("popupshowing", this._onContextMenuShowing,
                                 true);

    var iframe = document.createElement("iframe");
    MemoryTracking.track(iframe, "StatusBarPanel");
    iframe.setAttribute("type", "content");

    if (statusBar.hidden) {
      $(statusBar).bind(
        "DOMAttrModified",
        function onAttrModified(event) {
          if (event.originalTarget == statusBar && !statusBar.hidden) {
            $(statusBar).unbind("DOMAttrModified", onAttrModified);
            embedIframe();
          }
        });
    } else
      embedIframe();

    function embedIframe() {
      iframe.setAttribute("src", url);
      iframe.style.overflow = "hidden";

      // This, combined with setting the statusBarPanel alignment to "stretch"
      // above, causes the iframe to stretch to the height of the status bar.
      iframe.style.height = "100%";

      iframe.addEventListener(
        "DOMContentLoaded",
        function onPanelLoad(evt) {
          if (evt.originalTarget.nodeName != "#document")
            return;

          iframe.removeEventListener("DOMContentLoaded", onPanelLoad, true);
          self._injectPanelWindowFunctions(iframe);

          // Store the feature ID in the iframe's content window so jetpack.menu
          // will know which feature the iframe is associated with.
          iframe.contentWindow._featureId = self._featureContext.id;

          // Shrink the width of the document to the size of the content
          // it contains so we can automatically size the iframe to the size
          // of the content.
          iframe.contentDocument.documentElement.style.display = "table";

          // Hack the appearance of the iframe to make it look more like
          // a statusbarpanel.

          // Set the font to the one used in statusbarpanels.
          iframe.contentDocument.documentElement.style.font = "status-bar";

          // Set the background color to the one used in statusbarpanels.
          // Unfortunately, a limitation in Gecko causes all HTML documents
          // to have a white background, even when their background is specified
          // as transparent, so we have to jump through hoops to give them
          // statusbarpanel-colored backgrounds.
          if (Extension.OS == "Darwin") {
            // For Mac, we accomplish the effect by making the iframe
            // appear like a statusbar (plus a few positioning tweaks).
            iframe.contentDocument.documentElement.style.MozAppearance =
              "statusbar";
            iframe.contentDocument.documentElement.style.marginTop = "-1px";
            iframe.contentDocument.documentElement.style.paddingBottom = "1px";
            iframe.contentDocument.documentElement.style.height = "100%";
          }
          else if (Extension.OS == "WINNT") {
            // For Windows, setting the document element's -moz-appearance
            // to statusbar adds 1px left- and right-hand borders, which we
            // can accommodate with padding on the document element (or margin
            // on the body), but that causes panels to have less space than
            // the amount they specify via the initial width or by changing
            // the width CSS property.

            // We could add 2px to the initial width to accommodate the borders,
            // but we can't easily add it to the value of the CSS property,
            // which might not be in pixels, so instead we copy the background
            // styles from the statusbar into the iframe body.  For Vista
            // we also have to add a margin to the top of the iframe so it
            // doesn't overlap the border of the outer statusbar.

            //iframe.contentDocument.documentElement.style.MozAppearance =
            //  "statusbar";
            //iframe.contentDocument.documentElement.style.padding = "0 1px";
            //iframe.contentDocument.documentElement.style.height = "100%";
            self._copyBackground(iframe.parentNode.parentNode,
                                 iframe.contentDocument.body);
            iframe.style.marginTop = "2px";
          }
          else if (Extension.OS == "Linux") {
            // For Linux, all we have to do is copy the background styles
            // from the statusbar into the iframe body.
            self._copyBackground(iframe.parentNode.parentNode,
                                 iframe.contentDocument.body);
          }
          else {
            // If this is some other operating system, then copy the background
            // styles and hope for the best.
            self._copyBackground(iframe.parentNode.parentNode,
                                 iframe.contentDocument.body);
          }

          // Set various other properties to the values used in statusbarpanels.
          iframe.style.marginLeft = "4px";
          iframe.style.marginRight = "4px";
          iframe.contentDocument.body.style.padding = 0;
          iframe.contentDocument.body.style.margin = 0;

          // There are two ways in which statusbarpanel widths get set.
          // By default, Jetpack automatically sets the width of the panel
          // to the width of the containing document.  If a feature specifies
          // an initial width, however, Jetpack sets the width of its panel
          // to that width and then updates it only when the feature sets
          // the width of its document explicitly.
          if (width == null) {
            var setIframeWidth = function() {
              iframe.style.width =
                iframe.contentDocument.documentElement.offsetWidth + "px";
            }

            // Set the initial width of the iframe based on the width of its
            // document.
            setIframeWidth();

            // Listen for DOM mutation events on the document and update
            // the iframe's width when its document's width changes.
            iframe.contentDocument.addEventListener("DOMSubtreeModified",
                                                    setIframeWidth,
                                                    false);
          }
          else {
            // Set the initial width of the iframe and the document based on
            // the width specified by the feature.  The specified width we get
            // here is an integer number of pixels, so we have to convert it
            // to a CSS value before setting style.width to it.
            iframe.style.width = width + "px";
            iframe.contentDocument.documentElement.style.width = width + "px";

            // Listen for DOM mutation events on the document's style attribute
            // and update the iframe's width when its document's width changes.
            iframe.contentDocument.addEventListener(
              "DOMAttrModified",
              function(evt) {
                if (evt.target != iframe.contentDocument.documentElement ||
                    evt.attrName != "style")
                  return;

                // Update the iframe's width to match the width of its document.
                // TODO: diff evt.oldValue and evt.newValue to determine whether
                // or not the width CSS property changed, since we should only
                // update the iframe's width if it's the property that changed.
                // TODO: parse the value of the document's width property
                // and only update the iframe's width if the document's width
                // is a specific width.
                // XXX if it's a relative width (auto, inherit), should we
                // switch to auto-width mode?
                iframe.style.width =
                  iframe.contentDocument.documentElement.style.width;
              },
              false
            );
          }
        },
        true
      );
      statusBarPanel.appendChild(iframe);
      statusBar.appendChild(statusBarPanel);
    }

    return iframe;
  },

  append: function append(options) {
    var self = this;
    var url;

    if (options.url) {
      url = self._urlFactory.makeUrl(options.url);
    } else if (options.html) {
      url = "data:text/html," + encodeURI(options.html);
    } else
      url = "about:blank";

    var width = options.width ? options.width : null;

    // Add a deprecation/not-implemented warning to be helpful.
    if (options.onLoad)
      console.warn("options.onLoad is not currently supported; please " +
                   "consider using options.onReady instead.");

    self._browserWatchers.push(
      new BrowserWatcher(
        {onLoad: function(window) {
           var iframe = self._addPanelToWindow(window, url, width);
           self._windows.push(window);
           self._panels.push({url: url, iframe: iframe});
           if (options.onReady) {
             iframe.addEventListener(
               "DOMContentLoaded",
               function onPanelLoad(event) {
                 iframe.removeEventListener("DOMContentLoaded",
                                            onPanelLoad,
                                            false);
                 try {
                   // TODO: Do we want to use .call() or .apply() to
                   // set the handler's 'this' variable?
                   options.onReady(iframe.contentDocument);
                 } catch (e) {
                   console.exception(e);
                 }
               },
               false
             );
           }
         },
         onUnload: function(window) {
           var index = self._windows.indexOf(window);
           if (index != -1) {
             var panel = self._panels[index];
             delete self._windows[index];
             delete self._panels[index];
             if (options.onUnload) {
               try {
                 options.onUnload(panel.iframe.contentDocument);
               } catch (e) {
                 console.exception(e);
               }
             }

             // Remove anything in jQuery's cache that's associated with
             // the window we're closing.
             for (var id in jQuery.cache)
               if (jQuery.cache[id].handle) {
                 var elem = jQuery.cache[id].handle.elem;
                 if (elem.ownerDocument == panel.iframe.contentDocument)
                   jQuery.event.remove(elem);
               }

             // Remove the statusbarpanel containing the iframe from the doc,
             // which has the effect of removing the iframe as well.
             if (panel.iframe.parentNode &&
                 panel.iframe.parentNode.parentNode) {
               var contextMenu = panel.iframe.parentNode.childNodes[0];
               contextMenu.removeEventListener("popupshowing",
                                               self._onContextMenuShowing,
                                               true);
               panel.iframe.parentNode.parentNode.
                     removeChild(panel.iframe.parentNode);
             }
           }
         }
        }));
    }
};
