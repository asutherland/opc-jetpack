var JetpackEnvironmentTests = {
  _withSandbox: function _withSandbox(func) {
    var fakeFeed = JetpackRuntimeTests._makeFakeFeed("/* do nothing */");
    var context = new JetpackRuntime.Context(fakeFeed);
    func.call(context.sandbox);
    context.unload();
  },

  testJsonParseWorks: function(self) {
    this._withSandbox(
      function() {
        self.assertEqual(this.JSON.parse("3"), 3);
        self.assertEqual(this.JSON.parse("true"), true);
        self.assertEqual(this.JSON.parse('"3"'), '3');
        var obj = this.JSON.parse('{"blar":3}');
        self.assertEqual(obj.blar, 3);
      });
  },

  testJsonStringifyWorks: function(self) {
    this._withSandbox(
      function() {
        self.assertEqual(this.JSON.stringify('blar'), '"blar"');
        self.assertEqual(this.JSON.stringify(3), '3');
        self.assertEqual(typeof(this.JSON.stringify(function() {})),
                         "undefined");
        self.assertEqual(this.JSON.stringify({blar: 3}), '{"blar":3}');
      });
  },

  testImportFromFutureWorks: function(self) {
    this._withSandbox(
      function() {
        self.assertEqual(typeof(this.jetpack.T1000), "undefined");
        this.jetpack.importFromFuture("T1000");
        self.assertEqual(this.jetpack.T1000(), "I'm from the future.");
      });
  },

  testGeneral: function(self) {
    this._withSandbox(
      function() {
        self.assert(this.jetpack.lib.twitter.Twit);
        self.assert(this.jetpack.notifications.show);
        self.assert(this.jetpack.tabs.focused);
        self.assert(this.jetpack.statusBar.append);
        self.assert(this.jetpack.track);
        self.assert(this.jetpack.storage.live);
        self.assert(this.JSON.parse);
        self.assert(this.JSON.stringify);
        self.assert(this.setInterval);
        self.assert(this.clearTimeout);
        self.assert(new this.XMLHttpRequest());
      });
  }
};
