var FeedManagerTests = {
  get FeedManager() {
    var jsm = {};
    var url = "resource://jetpack/ubiquity-modules/feedmanager.js";
    Components.utils.import(url, jsm);

    delete this.FeedManager;
    this.FeedManager = jsm.FeedManager;
    return this.FeedManager;
  },

  testFeedManagerWorks: function(self) {
    var annSvc = AnnotationMemoryTests.makeTestMemory(self);
    var FMgr = new this.FeedManager(annSvc);

    var fakeFeedPlugin = {
      type: 'fake',
      makeFeed: function makeFeed(baseFeedInfo, hub) {
        var feedInfo = {};

        feedInfo.refresh = function refresh() {
        };

        feedInfo.__proto__ = baseFeedInfo;

        return feedInfo;
      }
    };

    FMgr.registerPlugin(fakeFeedPlugin);

    var url = "http://www.foo.com";
    var sourceUrl = "http://www.foo.com/code.js";
    var code = "function blah() {}";

    self.assert(!FMgr.isSubscribedFeed(url));
    FMgr.addSubscribedFeed({url: url,
                            sourceUrl: sourceUrl,
                            sourceCode: code,
                            canAutoUpdate: false,
                            type: 'fake'});
    self.assert(FMgr.isSubscribedFeed(url));

    var results = FMgr.getSubscribedFeeds();

    self.assert(results.length == 1);

    // Ensure the result is what we think it is.
    var feed = results[0];
    self.assert(feed.getCode() == code);

    // Add another subscribed feed and make sure things still make sense.
    var moreCode = "function narg() {}";
    FMgr.addSubscribedFeed({url: "http://www.bar.com",
                            sourceUrl: "http://www.bar.com/code.js",
                            sourceCode: moreCode,
                            canAutoUpdate: false,
                            type: 'fake'});
    results = FMgr.getSubscribedFeeds();

    self.assertEqual(results[0].getCode(), code);
    self.assertEqual(results[1].getCode(), moreCode);

    results[0].setCode("// new code");
    self.assertEqual(results[0].getCode(), "// new code");

    // TODO: Iterate through the collection and ensure that it behaves
    // how we think it should.

    results[0].remove();

    self.assert(!FMgr.isSubscribedFeed(url));
  }
};
