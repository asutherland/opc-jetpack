/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Ubiquity.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// = Jetpack Runtime =
//
// This is the singleton that manages the loading, execution, and
// unloading of all Jetpacks the user has installed.

var JetpackRuntime = {
  // Just so we show up as some class when introspected.
  constructor: function JetpackRuntime() {},

  // == Contexts ==
  //
  // A Jetpack Context contains all information about a single installed
  // Jetpack.  The {{{JetpackRuntime.contexts}}} array is a registry of
  // all existing Contexts.
  contexts: [],

  Context: function JetpackContext(feed, environment) {
    MemoryTracking.track(this);

    if (!environment)
      environment = JetpackEnv;

    var importers = environment.importers;
    var globals = environment.globals;

    var code = feed.getCode();
    var sandboxFactory;
    var unsafeSandbox;
    var sandbox;

    var systemPrincipal = Cc["@mozilla.org/systemprincipal;1"]
                          .createInstance(Ci.nsIPrincipal);

    //unsafeSandbox = Components.utils.Sandbox(feed.srcUri.spec);
    unsafeSandbox = Components.utils.Sandbox(systemPrincipal);
    sandbox = new Object();
    //unsafeSandbox.__proto__ = SecureMembrane.wrapTrusted(sandbox);
    unsafeSandbox.__proto__ = sandbox;

    sandbox.location = feed.srcUri.spec;

    var unloaders = [];
    var self = this;

    this.unsafeSandbox = unsafeSandbox;
    this.sandbox = sandbox;
    this.feed = feed;
    this.url = feed.uri.spec;
    this.srcUrl = feed.srcUri.spec;
    // Generate an ID for the feature based on its source URL.
    // TODO: this.srcUrl or this.url?  We hash this as the feature's ID,
    // so it should be unique to this feature. -adw
    this.id = JetpackRuntime.featureUrlToId(this.srcUrl);
    this.urlFactory = new UrlFactory(feed.uri.spec);
    this.addUnloader = function addUnloader(unloader) {
      unloaders.push(unloader);
    };
    this.doImport = function doImport(name, importer) {
      var parts = name.split(".");
      var obj = this.sandbox;
      for each (part in parts) {
        if (part) {
          if (!obj[part])
            obj[part] = new Object();
          obj = obj[part];
        }
      }

      importer.call(obj, self);
    };

    var names = [name for (name in importers)];
    names.sort();

    names.forEach(
      function(name) {
        importers[name].forEach(
          function(importer) {
            self.doImport(name, importer);
          });
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

    if (!Extension.isInSafeMode) {
      try {
        Components.utils.evalInSandbox(
          code, unsafeSandbox, "1.8",
          ("chrome://jetpack/content/index.html -> " +
           feed.srcUri.spec), 1
        );
        // TODO: What are the security implications of retrieving the
        // manifest from the sandbox?
        if ("manifest" in unsafeSandbox)
          this.manifest = unsafeSandbox.manifest;
      } catch (e) {
        console.exception(e);
      }
    }

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

  unloaders: [],

  addUnloader: function addUnloader(unload) {
    this.unloaders.push(unload);
  },

  unloadRuntime: function unloadRuntime() {
    // Run each unloader function now that we're about to quit
    this.unloaders.forEach(
      function(unload) {
        unload.call(JetpackRuntime);
      });
    this.unloaders = [];
  },

  unloadAllJetpacks: function unloadAllJetpacks() {
    this.contexts.forEach(
      function(jetpack) {
        jetpack.unload();
      });
    this.contexts = [];
  },

  // == The Feed Update Loop ==
  //
  // The feed update loop checks for updates to installed Jetpacks
  // at a regular interval.

  // An object mapping Jetpack URLs to the {{{XMLHttpRequest}}} objects
  // representing in-progress update checks.
  _feedUpdates: {},

  // The amount of time we wait, in milliseconds, before giving up on
  // an ongoing update request.
  FEED_UPDATE_REMOTE_TIMEOUT: 5000,

  // The amount of time between update checks, in milliseconds.
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
    try {
      req.send(null);
    } catch (e) {
      if (e.result == Components.results.NS_ERROR_FILE_NOT_FOUND)
        console.error("Couldn't find", feed.srcUri.spec, "linked to from",
                      feed.uri.spec, ". You may want to consider",
                      "uninstalling the Jetpack feature.");
      else
        console.exception(e);
      return null;
    }
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

    this.cancelFeedUpdate(feed.uri.spec);

    var req;

    if (feed.type == "jetpack") {
      if (UrlUtils.isLocal(feed.srcUri))
        req = this._getLocalFeed(feed);
      else if (UrlUtils.isRemote(feed.srcUri) &&
               feed.canAutoUpdate) {
        req = this._getRemoteFeed(feed);
      }
      if (req)
        this._feedUpdates[feed.uri.spec] = req;
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
  },

  loadJetpacks: function loadJetpacks() {
    var self = this;

    var UrlUtils = {};
    Components.utils.import("resource://jetpack/modules/url_utils.js",
                            UrlUtils);

    var feeds = self.FeedPlugin.FeedManager.getSubscribedFeeds();
    feeds.forEach(
      function(feed) {
        if (feed.type == "jetpack") {
          if (UrlUtils.isLocal(feed.srcUri)) {
            // It's just local, so flush the cached copy and get the
            // latest one.
            feed.setCode("");
            self.forceFeedUpdate(feed);
          }
          self.contexts.push(new self.Context(feed));
        }
      });
    feeds = null;
  },

  FeedPlugin: {},

  // Hashes the given feature URL.  Hey, an ID.
  featureUrlToId: function(aFeatureUrl) {
    return this._hashString(aFeatureUrl);
  },

  // Returns a hex string hash of the given string.  We use this to generate
  // IDs for features based on their URLs.
  _hashString: function(aStr) {
    var stream = Cc["@mozilla.org/io/string-input-stream;1"].
                 createInstance(Ci.nsIStringInputStream);
    stream.setData(aStr, aStr.length);
    var cryp = Cc["@mozilla.org/security/hash;1"].
               createInstance(Ci.nsICryptoHash);
    cryp.init(cryp.SHA1);
    cryp.updateFromStream(stream, aStr.length);
    return this._bytesToHexString(cryp.finish(false));
  },

  // Maps the given string of bytes to its hexidecimal representation.  Returns a
  // string.
  _bytesToHexString: function(aByteStr) {
    return Array.map(
      aByteStr, function (c) ("0" + c.charCodeAt(0).toString(16)).slice(-2)
    ).join("");
  }
};

JetpackRuntime.addUnloader(JetpackRuntime.unloadAllJetpacks);
Extension.addUnloadMethod(JetpackRuntime, JetpackRuntime.unloadRuntime);

Components.utils.import("resource://jetpack/modules/jetpack_feed_plugin.js",
                        JetpackRuntime.FeedPlugin);

// == Initialization ==
//
// When the host window is ready, we initialize the Jetpack Runtime,
// load all Jetpacks, and start the feed update loop.

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
