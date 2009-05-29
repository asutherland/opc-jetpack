// = Extension Initialization =
//
// This module encapsulates a Firefox Extension in a chrome-privileged page.
// This has a number of benefits:
//
// * The lifetime of the page is tied to the lifetime of the
//   Extension: reloading the page effectively reloads the extension, which
//   makes the process of developing an Extension much faster because
//   the developer doesn't need to constantly restart their browser.
//
// * Scripts originally written for content space can be reused in
//   chrome space without any modification (though obviously care must
//   be taken to ensure that such scripts are secure).
//
// * Tools originally made for use with the Web, such as Firebug, can be
//   reused in the context of Extension development.
//
// * With few exceptions, anything available to Web content is automatically
//   available to the Extension's page, which isn't the case with JS Modules.
//
// The Extension's page is a ubiquitous singleton; when it's not loaded into
// a browser window or tab, it's automatically loaded into a hidden window.

// Globally alias the standard XPCOM accessors.
const Cc = Components.classes;
const Ci = Components.interfaces;

// Expose the MemoryTracking module to this page, so that objects can
// be easily accounted for via weak references.
Components.utils.import("resource://jetpack/modules/track.js");

var Extension = {
  // TODO: Eventually we may want to be able to put extensions in iframes
  // that are in visible windows, which these flags aren't compatible
  // with (right now they assume that if they're in an iframe, they're in
  // the hidden window).
  isVisible: (window.frameElement === null),
  isHidden: (window.frameElement !== null),

  visibleMainWindow: null,
  visibleBrowser: null,

  Manager: {},

  get OS() {
    var xulr = Cc["@mozilla.org/xre/app-info;1"]
               .getService(Ci.nsIXULRuntime);
    return xulr.OS;
  },

  // === {{{Extension.addUnloadMethod()}}} ===
  //
  // This attaches a given method called 'unload' to the given object.
  // The method is also tied to the Extension page's lifetime, so if
  // the unload method isn't called before the page is unloaded, it is
  // called at that time.  This helps ensure both that memory leaks
  // don't propagate past Extension page reloads, and it can also help
  // developers find objects that aren't being properly cleaned up
  // before the page is unloaded.

  addUnloadMethod: function addUnloadMethod(obj, unloader) {
    function unloadWrapper() {
      window.removeEventListener("unload", unloadWrapper, true);
      unloader.apply(obj, arguments);
    }

    window.addEventListener("unload", unloadWrapper, true);

    obj.unload = unloadWrapper;
  }
};

(function() {
   var host;
   if (window.location.protocol == "about:")
     host = window.location.href.slice(window.location.href.indexOf(":") + 1);
   else
     host = window.location.host;

   var initUrl  = "resource://" + host + "/modules/init.js";
   Components.utils.import(initUrl, Extension.Manager);
   Extension.Manager.set(window);

   MemoryTracking.track(window, "ExtensionWindow");

   window.setInterval(function() { MemoryTracking.compact(); },
                      MemoryTracking.COMPACT_INTERVAL);

   if (Extension.isVisible) {
     var mainWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
                      .getInterface(Ci.nsIWebNavigation)
                      .QueryInterface(Ci.nsIDocShellTreeItem)
                      .rootTreeItem
                      .QueryInterface(Ci.nsIInterfaceRequestor)
                      .getInterface(Ci.nsIDOMWindow);
     var browser = mainWindow.getBrowserFromContentWindow(window);

     Extension.visibleMainWindow = mainWindow;
     Extension.visibleBrowser = browser;
   }
 })();
