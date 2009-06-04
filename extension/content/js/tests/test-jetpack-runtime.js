var JetpackRuntimeTests = {
  _makeFakeFeed: function _makeFakeFeed(contents) {
    function fakeUri(url) {
      return {spec: url};
    }
    return {
      uri: fakeUri("http://www.foo.com/blah.html"),
      srcUri: fakeUri("http://www.foo.com/blah.js"),
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
    var fakeFeed = this._makeFakeFeed("console.log('hallo');");
    var context = new JetpackRuntime.Context(
      fakeFeed,
      {globals: {console: fakeConsole},
       importers: {}}
    );
    self.assert(wasLogCalled);
    context.unload();
  },

  testFullContextWorks: function(self) {
    var fakeFeed = this._makeFakeFeed("/* do nothing */");
    var context = new JetpackRuntime.Context(fakeFeed);
    var sandbox = context.sandbox;

    self.assert(sandbox.jetpack.lib.twitter.Twit);
    self.assert(sandbox.jetpack.notifications.show);
    self.assert(sandbox.jetpack.tabs.focused);
    self.assert(sandbox.jetpack.statusBar.append);
    self.assert(sandbox.jetpack.track);
    self.assert(sandbox.jetpack.storage.live);
    self.assert(sandbox.jetpack.json.encode);
    self.assert(sandbox.setInterval);
    self.assert(sandbox.clearTimeout);
    self.assert(new sandbox.XMLHttpRequest());

    self.assertEqual(typeof(sandbox.jetpack.T1000), "undefined");
    sandbox.jetpack.importFromFuture("T1000");
    self.assertEqual(sandbox.jetpack.T1000(),
                     "I'm from the future.");

    context.unload();
  }
};
