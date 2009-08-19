// Create a test runner that adds a page mod for the provided option and opens
// the url to trigger the page mod
function testAdd(options, url) function(runner) {
  // Grab a jetpack context
  let fakeFeed = JetpackRuntimeTests.makeFakeFeed("");
  let context = new JetpackRuntime.Context(fakeFeed);
  
  // Add the page mod that will close the tab and report success
  let tab;
  let pageMods = new PageMods(context.sandbox.jetpack);
  pageMods.add(function() {
    tab.close();
    context.unload();
    runner.success();
  }, options);

  // Trigger the page mod but time out just incase
  tab = context.sandbox.jetpack.tabs.open(url);
  runner.setTimeout(3000);
}

var PageModsTests = {
  testAddModificationString: let (url = "http://0.0.0/String")
    testAdd(url, url),

  testAddModificationArray: let (url = "http://0.0.0/Array")
    testAdd([url], url),

  testAddModificationObjectString: let (url = "http://0.0.0/ObjectString")
    testAdd({ matches: url }, url),

  testAddModificationObjectArray: let (url = "http://0.0.0/ObjectArray")
    testAdd({ matches: [url] }, url),

  _mp: (function () {
    Components.utils.import("resource://jetpack/modules/page-modification.js");
    return MatchPattern;
  })(),

  testMatchPattern: function(runner){
    var m = new this._mp("http://*.adw.com/*");
    runner.assert(m.doMatch("http://w.adw.com/foo"));

    m = new this._mp("http://*.adw.com/*diamonds");
    runner.assert(m.doMatch("http://w.adw.com/fdiamonds"));

    m = new this._mp("http://*.adw.com/");
    runner.assert(m.doMatch("http://w.adw.com/"));

    m = new this._mp("http://*.cnn.com/");
    runner.assert(!m.doMatch("http://cnn.com/"));

    m = new this._mp("http://*/*");
    runner.assert(m.doMatch("http://cnn.com/blah-foo"));

    m = new this._mp("http://*.cnn.com/foo");
    runner.assert(m.doMatch("http://videos.cnn.com/foo"));

    m = new this._mp("file:///var/log/foo*.log");
    runner.assert(m.doMatch("file:///var/log/foo.log"));

    m = new this._mp("http://ddahl.com/*");
    runner.assert(m.doMatch("http://ddahl.com"));

    /* Hit the same URL a few more times to make sure it's not suffering
     * from bug 98409. (jetpack bug 506449)
     */
    for (let i=0; i < 10; i++) {
        runner.assert(m.doMatch("http://ddahl.com"));
    }
  },

  testInvalidPatterns: function(runner){
    // invalid patterns cribbed from chromium dev site
    var invalid_patterns = ["http",
                            "http://",
                            "http://foo",
                            "http://*foo/bar",
                            "http://foo.*.bar/baz",
                            "http:/bar",
                            "foo://*"];
    var m;
    for (var i=0; i < invalid_patterns.length; i++){
      var func = function(){
        m = new this._mp(invalid_patterns[i]);
      };
      try{
        func();
      }
      catch(e){
        console.log("testInvalidPatterns: " + invalid_patterns[i] + " threw an exception, this was expected. PASS");
      }

    }
  }
};
