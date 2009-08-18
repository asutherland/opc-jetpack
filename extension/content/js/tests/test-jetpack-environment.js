var JetpackEnvironmentTests = {
  _withSandbox: function _withSandbox(func) {
    var fakeFeed = JetpackRuntimeTests.makeFakeFeed("/* do nothing */");
    var context = new JetpackRuntime.Context(fakeFeed);
    func.call(context.sandbox, context);
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

  testImportFutureWorks: function(self) {
    this._withSandbox(
      function() {
        self.assertEqual(typeof(this.jetpack.T1000), "undefined");
        self.assert(this.jetpack.future.list().indexOf('jetpack.T1000') != -1);
        this.jetpack.future.import("T1000");
        self.assertEqual(this.jetpack.T1000(), "I'm from the future.");

        self.assertEqual(typeof(this.jetpack.storage.simple), "undefined");
        self.assert(this.jetpack.future.list().
                      indexOf("jetpack.storage.simple") != -1);
        this.jetpack.future.import("storage.simple");
        self.assertEqual(typeof(this.jetpack.storage.simple), "object");
      });
  },

  testJqueryXhrWorks: function(self) {
    this._withSandbox(
      function(context) {
        Components.utils.evalInSandbox(
          "jQuery.get('http://www.mozilla.org/');",
          context.unsafeSandbox
        );
      });
  },

  testGeneral: function(self) {
    this._withSandbox(
      function() {
        self.assert(this.jetpack.lib.twitter);
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
