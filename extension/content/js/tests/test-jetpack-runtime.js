var JetpackRuntimeTests = {
  testContextWorks: function(self) {
    function fakeUri(url) {
      return {spec: url};
    }
    var wasLogCalled = false;
    var fakeConsole = {
      log: function log(text) {
        self.assertEqual(text, "hallo");
        wasLogCalled = true;
      }
    };
    var fakeFeed = {
      uri: fakeUri("http://www.foo.com/blah.html"),
      srcUri: fakeUri("http://www.foo.com/blah.js"),
      getCode: function() {
        return "console.log('hallo');";
      }
    };
    var context = new JetpackRuntime.Context(fakeFeed, {},
                                             {console: fakeConsole});
    self.assert(wasLogCalled);
    context.unload();
  }
};
