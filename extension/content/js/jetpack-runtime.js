var JetpackRuntime = {
  // Just so we show up as some class when introspected.
  constructor: function JetpackRuntime() {},

  contexts: [],

  Context: function JetpackContext(feed, environment) {
    MemoryTracking.track(this);

    if (!environment)
      environment = JetpackEnv;

    var importers = environment.importers;
    var globals = environment.globals;

    var jsm = {};
    Components.utils.import("resource://jetpack/ubiquity-modules/sandboxfactory.js",
                            jsm);
    var sandboxFactory = new jsm.SandboxFactory({});
    jsm = null;

    var code = feed.getCode();
    var sandbox = sandboxFactory.makeSandbox({});

    sandbox.location = feed.srcUri.spec;

    this.sandbox = sandbox;
    this.url = feed.uri.spec;
    this.srcUrl = feed.srcUri.spec;
    this.urlFactory = new UrlFactory(feed.uri.spec);

    var unloaders = [];
    var self = this;

    var names = [name for (name in importers)];
    names.sort();

    names.forEach(
      function(name) {
        var parts = name.split(".");
        var obj = sandbox;
        for each (part in parts) {
          if (part) {
            if (!obj[part])
              obj[part] = new Object();
            obj = obj[part];
          }
        }

        function doImport(importer) {
          var unloader = importer(obj, self);
          if (unloader)
            unloaders.push(unloader);
        }
        importers[name].forEach(doImport);
      });

    names = [name for (name in globals)];
    names.sort();

    names.forEach(
      function(name) {
        var parts = name.split(".");
        var propName = parts.slice(-1)[0];
        parts = parts.slice(0, -1);
        var obj = sandbox;
        for each (part in parts) {
          if (part) {
            if (!obj[part])
              obj[part] = new Object();
            obj = obj[part];
          }
        }
        obj[propName] = globals[name];
        unloaders.push({unload: function() { delete obj[propName]; }});
      });

    try {
      var codeSections = [{length: code.length,
                           filename: feed.srcUri.spec,
                           lineNumber: 1}];
      sandboxFactory.evalInSandbox(code, sandbox, codeSections);
    } catch (e) {
      console.exception(e);
    }

    sandboxFactory = null;

    Extension.addUnloadMethod(
      this,
      function() {
        unloaders.forEach(function(obj) { obj.unload(); });
        unloaders = null;
      });
  },

  getJetpack: function getJetpack(url) {
    var matches = [context for each (context in JetpackRuntime.contexts)
                           if (context.url == url)];
    if (matches.length)
      return matches[0];
    return null;
  },

  addJetpack: function addJetpack(url) {
    var self = this;
    var feed = JetpackRuntime.FeedPlugin.FeedManager.getFeedForUrl(url);
    if (feed && feed.isSubscribed && feed.type == "jetpack")
      self.contexts.push(new self.Context(feed));
    else
      throw new Error("Not a subscribed jetpack feed: " + uri);
  },

  removeJetpack: function removeJetpack(context) {
    this.cancelFeedUpdate(context.url);
    var index = this.contexts.indexOf(context);
    this.contexts.splice(index, 1);
    context.unload();
  },

  reloadJetpack: function reloadJetpack(context) {
    var url = context.url;
    this.removeJetpack(context);
    this.addJetpack(url);
  },

  unloadAllJetpacks: function unloadAllJetpacks() {
    this.contexts.forEach(
      function(jetpack) {
        jetpack.unload();
      });
    this.contexts = [];
  },

  _feedUpdates: {},

  FEED_UPDATE_REMOTE_TIMEOUT: 5000,

  FEED_UPDATE_INTERVAL: 60 * 60 * 1000,

  _getLocalFeed: function _getLocalFeed(feed) {
    var self = this;
    var req = new XMLHttpRequest();
    req.open('GET', feed.srcUri.spec, true);
    req.overrideMimeType('text/javascript');
    req.onreadystatechange = function() {
      if (!feed.uri.spec in self._feedUpdates)
        return;
      delete self._feedUpdates[feed.uri.spec];
      if (req.readyState == 4 &&
          req.status == 0 &&
          typeof(req.responseText) == "string" &&
          req.responseText.indexOf("ERROR:") != 0) {
        var currCode = feed.getCode();
        if (currCode != req.responseText) {
          feed.setCode(req.responseText);
          feed.broadcastChangeEvent();
        }
      } else {
        // TODO: Log the error?
      }
    };
    req.send(null);
    return req;
  },

  _getRemoteFeed: function _getRemoteFeed(feed) {
    var self = this;
    return jQuery.ajax(
      {url: feed.srcUri.spec,
       timeout: self.FEED_UPDATE_REMOTE_TIMEOUT,
       dataType: "text",
       complete: function(xhr, textStatus) {
         if (feed.uri.spec in self._feedUpdates)
           delete self._feedUpdates[feed.uri.spec];
       },
       error: function(xhr, textStatus, errorThrown) {
         // TODO: Log the error?
       },
       success: function(data) {
         var currCode = feed.getCode();
         if (currCode != data) {
           feed.setCode(data);
           feed.broadcastChangeEvent();
         }
       }});
  },

  forceFeedUpdate: function forceFeedUpdate(feedOrUrl) {
    var feed;
    if (typeof(feedOrUrl) == "string")
      feed = this.FeedPlugin.FeedManager.getFeedForUrl(feedOrUrl);
    else
      feed = feedOrUrl;

    if (!feed)
      throw new Error("Invalid feed: " + feedOrUrl);

    var UrlUtils = {};
    Components.utils.import("resource://jetpack/modules/url_utils.js",
                            UrlUtils);

    if (feed.type == "jetpack" &&
        !(feed.uri.spec in this._feedUpdates)) {
      if (UrlUtils.isLocal(feed.srcUri))
        this._feedUpdates[feed.uri.spec] = this._getLocalFeed(feed);
      else if (UrlUtils.isRemote(feed.srcUri) &&
               feed.canAutoUpdate) {
        this._feedUpdates[feed.uri.spec] = this._getRemoteFeed(feed);
      }
    }
  },

  cancelFeedUpdate: function cancelFeedUpdate(url) {
    if (url in this._feedUpdates) {
      this._feedUpdates[url].abort();
      delete this._feedUpdates[url];
    }
  },

  startFeedUpdateLoop: function startFeedUpdateLoop() {
    var self = this;
    function updateAllFeeds() {
      var feeds = self.FeedPlugin.FeedManager.getSubscribedFeeds();
      feeds.forEach(function(feed) { self.forceFeedUpdate(feed); });
    }
    window.setInterval(updateAllFeeds, self.FEED_UPDATE_INTERVAL);
    updateAllFeeds();
  },

  loadJetpacks: function loadJetpacks() {
    var self = this;

    var feeds = self.FeedPlugin.FeedManager.getSubscribedFeeds();
    feeds.forEach(
      function(feed) {
        if (feed.type == "jetpack") {
          self.contexts.push(new self.Context(feed));
        }
      });
    feeds = null;
  },

  FeedPlugin: {}
};

Extension.addUnloadMethod(JetpackRuntime, JetpackRuntime.unloadAllJetpacks);

Components.utils.import("resource://jetpack/modules/jetpack_feed_plugin.js",
                        JetpackRuntime.FeedPlugin);

$(window).ready(
  function() {
    var FeedManager = JetpackRuntime.FeedPlugin.FeedManager;

    JetpackRuntime.loadJetpacks();
    JetpackRuntime.startFeedUpdateLoop();

    function maybeReload(eventName, uri) {
      switch (eventName) {
      case "feed-change":
      case "purge":
      case "unsubscribe":
        var context = JetpackRuntime.getJetpack(uri.spec);
        if (context) {
          if (eventName == "feed-change")
            // Reload the feed.
            JetpackRuntime.reloadJetpack(context);
          else
            // Destroy the feed.
            JetpackRuntime.removeJetpack(context);
        }
        break;
      case "subscribe":
        var feed = FeedManager.getFeedForUrl(uri);
        if (feed && feed.type == "jetpack")
          JetpackRuntime.addJetpack(uri.spec);
        break;
      }
    }

    var watcher = new EventHubWatcher(FeedManager);
    watcher.add("feed-change", maybeReload);
    watcher.add("subscribe", maybeReload);
    watcher.add("purge", maybeReload);
    watcher.add("unsubscribe", maybeReload);
  });
