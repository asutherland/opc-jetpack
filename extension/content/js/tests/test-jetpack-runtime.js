var JetpackRuntimeTests = {
  makeFakeFeed: function makeFakeFeed(contents) {
    function fakeUri(url) {
      return {spec: url};
    }
    var HashUtils = {};
    Components.utils.import("resource://jetpack/modules/hash_utils.js",
                            HashUtils);
    var srcUrl = "http://www.foo.com/blah.js";
    return {
      uri: fakeUri("http://www.foo.com/blah.html"),
      srcUri: fakeUri(srcUrl),
      id: HashUtils.hashString(srcUrl),
      getCode: function() {
        return contents;
      }
    };
  },

  testContextWorks: function(self) {
    var wasLogCalled = false;
    var fakeConsole = {
      log: function log(text) {
        self.assertEqual(text, "hallo");
        wasLogCalled = true;
      }
    };
    var fakeFeed = this.makeFakeFeed("console.log('hallo');");
    var context = new JetpackRuntime.Context(
      fakeFeed,
      {globals: {console: fakeConsole},
       importers: {}}
    );
    self.assert(wasLogCalled);
    context.unload();
  },

  testUnloader: function(self) {
    const feed = this.makeFakeFeed;
    function withContext(func) {
      var fakeFeed = feed("");
      var context = new JetpackRuntime.Context(fakeFeed);
      func.call(context.sandbox, context);
      context.unload();
    }

    // Basic unloader.
    var value = 0;
    withContext(function (context) {
      context.addUnloader({ unload: function () value++ });
    });
    self.assertEqual(value, 1);

    // Removing an unloader.
    withContext(function (context) {
      var unloader = { unload: function () value++ };
      context.addUnloader(unloader);
      context.removeUnloader(unloader);
    });
    self.assertEqual(value, 1);

    // Removing a nonexisting unloader.
    withContext(function (context) {
      context.removeUnloader("bogus");
    });
    self.assertEqual(value, 1);

    // Adding and removing unloaders while the context is being unloaded.
    var arr = [];
    withContext(function (context) {
      // These should run in the order defined, except unloader3.
      var unloader0 = {
        unload: function () {
          arr.push("unloader0");
          context.addUnloader(unloader1);
          context.removeUnloader(unloader3);
        }
      };
      var unloader1 = {
        unload: function () {
          arr.push("unloader1");
        }
      };
      var unloader2 = {
        unload: function () {
          window.setTimeout(function () {
            arr.push("unloader2");
          }, 100);
        }
      };
      var unloader3 = {
        unload: function () {
          self.assert(false, "This unloader should not run.");
        }
      };
      var unloader4 = {
        unload: function () {
          window.setTimeout(function () {
            self.assertEqual(arr.length, 3);
            self.assertEqual(arr[0], "unloader0");
            self.assertEqual(arr[1], "unloader1");
            self.assertEqual(arr[2], "unloader2");
            self.success();
          }, 200);
        }
      };
      context.addUnloader(unloader0);
      context.addUnloader(unloader2);
      context.addUnloader(unloader3);
      context.addUnloader(unloader4);
    });
    self.setTimeout(5000, "Should not have timed out");
  }
};
