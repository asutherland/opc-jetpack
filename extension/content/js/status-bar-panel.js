function StatusBar(urlFactory) {
  this._urlFactory = urlFactory;
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
        iframe.parentNode.removeChild(iframe);
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
      // The width we get here is an integer number of pixels, so we have to
      // convert it to a CSS value before setting style.width to it.
      iframe.style.width = width + "px";

      iframe.setAttribute("height", statusBar.boxObject.height);
      iframe.setAttribute("src", url);
      iframe.style.overflow = "hidden";
      iframe.addEventListener(
        "DOMContentLoaded",
        function onPanelLoad(evt) {
          if (evt.originalTarget.nodeName != "#document")
            return;

          iframe.removeEventListener("DOMContentLoaded", onPanelLoad, true);
          self._injectPanelWindowFunctions(iframe);

          // Hack the appearance of the iframe to make it look more like
          // a statusbarpanel.  Unfortunately, a limitation in Gecko causes
          // all HTML documents to have a white background, even when their
          // background is specified as transparent, so we have to jump
          // through hoops to give them statusbarpanel-colored backgrounds.
          if (Extension.OS == "Darwin") {
            iframe.contentDocument.documentElement.style.MozAppearance =
              "statusbar";
            iframe.contentDocument.documentElement.style.marginTop = "-1px";
            iframe.contentDocument.documentElement.style.height = "100%";
          }
          else if (Extension.OS == "WINNT") {
            // Setting the document element's -moz-appearance to statusbar
            // adds 1px left- and right-hand borders, which we can accommodate
            // with padding on the document element (or margin on the body),
            // but that causes panels to have less space than the amount
            // they specify via the initial width or by changing the width
            // CSS property.

            // We could add 2px to the initial width to accommodate the borders,
            // but we can't easily add it to the value of the CSS property,
            // which might not be in pixels, so instead we copy the background
            // styles from the statusbar into the iframe body and then add a bit
            // of top and bottom margin to the iframe so it doesn't overlap
            // the top and bottom borders of the statusbar.

            // That doesn't give it native style, but it's close.

            //iframe.contentDocument.documentElement.style.MozAppearance =
            //  "statusbar";
            //iframe.contentDocument.documentElement.style.padding = "0 1px";
            //iframe.contentDocument.documentElement.style.height = "100%";
            self._copyBackground(iframe.parentNode,
                                 iframe.contentDocument.body);
            iframe.style.marginTop = "2px";
            iframe.style.marginBottom = "2px";
          }
          else {
            self._copyBackground(iframe.parentNode,
                                 iframe.contentDocument.body);
          }

          iframe.style.marginLeft = "4px";
          iframe.style.marginRight = "4px";
          iframe.contentDocument.body.style.padding = 0;
          iframe.contentDocument.body.style.margin = 0;

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
              iframe.style.width =
                iframe.contentDocument.documentElement.style.width;
            },
            false
          );
        },
        true
      );
      statusBar.appendChild(iframe);
    }

    return iframe;
  },

  DEFAULT_PANEL_WIDTH: 200,

  append: function append(options) {
    var self = this;
    var url;

    if (options.url) {
      url = self._urlFactory.makeUrl(options.url);
    } else if (options.html) {
      url = "data:text/html," + encodeURI(options.html);
    } else
      url = "about:blank";

    var width = options.width ? options.width : self.DEFAULT_PANEL_WIDTH;

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

             if (panel.iframe.parentNode)
               panel.iframe.parentNode.removeChild(panel.iframe);
           }
         }
        }));
    }
};
