// This test suite dynamically creates its own tests by looking in the
// 'jetpacks' subdirectory and creating a test for each Jetpack feature
// script in there.
//
// The subdirectory may contain a file called 'options.json' that specifies
// options for each file.  It should have the following format:
//
//   { "filename": fileOptions, ... }
//
// "filename" is the basename of a test file in the subdirectory, e.g.,
// "test-me-onFirstRun.js".  fileOptions is an object specifying the options
// for that file.  The following options are currently supported:
//
//   firstRun: Set to true to simulate first-run for the test.

(function() {
   var jsm = {};
   Components.utils.import("resource://jetpack/modules/setup.js", jsm);
   var dir = jsm.JetpackSetup.getExtensionDirectory();
   ["content", "js", "tests", "jetpacks"].forEach(
     function(path) {
       dir.append(path);
     });
   var files = Tests.listDir(dir).filter(function (f) /\.js$/.test(f));

   var optionsFile = dir.clone();
   optionsFile.append("options.json");
   try {
     var options = JSON.parse(FileIO.read(optionsFile, "utf-8"));
   }
   catch (err) {
     options = {};
   }

   var tests = {};

   var ios = Cc["@mozilla.org/network/io-service;1"]
             .getService(Ci.nsIIOService);

   files.forEach(
     function(filename) {
       var file = dir.clone();
       file.append(filename);
       var uri = ios.newFileURI(file);
       var opts = options[filename] || {};
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
         var context = new JetpackRuntime.Context(feed, env, !!opts.firstRun);
         self.onTeardown(function() { context.unload();
                                      context = null; });
       };
     });

   window.JetpackTests = tests;
 })();
