var JqueryTests = {
  testJqueryCanBeLoadedInSandbox: function(self) {
    var jqsb = JQuerySandbox.create("http://www.foo.com");

    var wasUnloaded = false;
    jqsb.$(jqsb.window).unload(function() { wasUnloaded = true; });
    self.assertEqual(wasUnloaded, false);
    jqsb.unload();
    self.assertEqual(wasUnloaded, true);
  }
};
