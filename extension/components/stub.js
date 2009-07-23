const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

// The bulk of this function was taken from:
//
// http://code.google.com/p/gears/source/browse/trunk/gears/base/firefox/static_files/components/stub.js

function NSGetModule() {
  return {
    registerSelf: function(compMgr, location, loaderStr, type) {
      var appInfo = Cc["@mozilla.org/xre/app-info;1"]
                    .getService(Ci.nsIXULAppInfo);
      var platformVersion = appInfo.platformVersion;
      var libFile = location.parent.parent;
      libFile.append("lib");
      libFile.append(platformVersion);

      // Note: we register a directory instead of an individual file because
      // Gecko will only load components with a specific file name pattern. We
      // don't want this file to have to know about that. Luckily, if you
      // register a directory, Gecko will look inside the directory for files
      // to load.
      compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
      compMgr.autoRegister(libFile);
    }
  };
}
