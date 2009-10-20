// This test suite dynamically creates its own tests by looking in the
// 'jetpacks' subdirectory and creating a test for each Jetpack feature
// script in there.

(function() {
   var jsm = {};
   Components.utils.import("resource://jetpack/modules/setup.js", jsm);
   var dir = jsm.JetpackSetup.getExtensionDirectory();
   ["content", "js", "tests", "jetpacks"].forEach(
     function(path) {
       dir.append(path);
     });
   var files = Tests.listDir(dir);
   var tests = {};

   var ios = Cc["@mozilla.org/network/io-service;1"]
             .getService(Ci.nsIIOService);

   files.forEach(
     function(filename) {
       var file = dir.clone();
       file.append(filename);
       var uri = ios.newFileURI(file);
       tests[filename] = function(self) {
         var feed = {
           uri: uri,
           srcUri: uri,
           getCode: function() {
             return FileIO.read(file, "utf-8");
           }
         };
         var env = {
           globals: {
             test: self,
             __proto__: JetpackEnv.globals
           },
           __proto__: JetpackEnv
         };
         var context = new JetpackRuntime.Context(feed, env);
         self.onTeardown(function() { context.unload();
                                      context = null; });
       };
     });

   window.JetpackTests = tests;
 })();
