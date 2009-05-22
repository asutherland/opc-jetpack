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
    if (toElement.style.backgroundImage == "none" &&
        toElement.style.backgroundColor == "transparent" &&
        Extension.OS == "Darwin") {
      // Due to the fixing of bug 449442, it's very hard for us to
      // copy the background of the status bar on OS X, but here's
      // a shot.

      // TODO: We may also want to try applying this bg to the
      // entire statusbar.

      // This file used to be at
      // chrome://global/skin/statusbar-background.gif, but was
      // removed when 449442 was fixed.
      var url = ("chrome://jetpack-safe/content/" +
                 "old-osx-statusbar-background.gif");

      toElement.style.backgroundImage = "url(" + url + ")";
      toElement.style.backgroundColor = "rgb(148, 147, 147)";
      toElement.style.backgroundRepeat = "repeat-x";
    }
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
      iframe.setAttribute("width", width);
      iframe.setAttribute("height", statusBar.boxObject.height);
      iframe.setAttribute("src", url);
      iframe.style.overflow = "hidden";
      iframe.addEventListener(
        "DOMContentLoaded",
        function onPanelLoad(evt) {
          if (evt.originalTarget.nodeName == "#document") {
            iframe.removeEventListener("DOMContentLoaded", onPanelLoad, true);
            self._injectPanelWindowFunctions(iframe);
            self._copyBackground(iframe.parentNode,
                                 iframe.contentDocument.body);
            iframe.style.marginLeft = "4px";
            iframe.style.marginRight = "4px";
            iframe.contentDocument.body.style.padding = 0;
            iframe.contentDocument.body.style.margin = 0;
          }
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
