// = Jetpack Environment =
//
// The Jetpack Environment contained in {{{JetpackEnv}}} defines the
// global namespace that all Jetpacks have access to.
//
// {{{JetpackEnv}}} tries to lazy-load everything it can, so that
// a resource is loaded only if a particular Jetpack asks for it;
// this means that Jetpacks which don't need to do much don't take
// up much memory, and Jetpacks which need lots of functionality
// have instant access to it without needing to explicitly
// import anything.

const Cu = Components.utils;

var JetpackEnv = {
  importers: {},
  globals: {},
  futures: {},
  setFuture: function setFuture(dottedName, factory) {
    this.futures[dottedName] = factory;
  },
  setFutures: function setFutures(dottedNamesToFactories) {
    for (dottedName in dottedNamesToFactories)
      this.setFuture(dottedName, dottedNamesToFactories[dottedName]);
  },
  addGlobal: function addGlobal(dottedName, value) {
    if (dottedName in this.globals)
      throw new Error("Name " + dottedName + " already exists");
    this.globals[dottedName] = value;
  },
  addGlobals: function addGlobals(dottedNamesToValues) {
    for (dottedName in dottedNamesToValues)
      this.addGlobal(dottedName, dottedNamesToValues[dottedName]);
  },
  addDeprecation: function addDeprecation(source, dest) {
    var parts = source.split(".");
    var name = parts.pop();
    var namespace = parts.join(".");
    this.addImporter(
      namespace,
      function importer(context) {
        var self = this;
        self.__defineGetter__(
          name,
          function() {
            console.logFromCaller([source, "is deprecated, please use",
                                   dest, "instead."], "warn");
            delete self[name];
            var value = context.sandbox;
            var destParts = dest.split(".");
            destParts.forEach(function(name) { value = value[name]; });
            self[name] = value;
            return self[name];
          });
      });
  },
  addDeprecations: function addDeprecations(sourcesToDests) {
    for (name in sourcesToDests)
      this.addDeprecation(name, sourcesToDests[name]);
  },
  addLazyLoader: function addLazyLoader(dottedName, factory) {
    var parts = dottedName.split(".");
    var name = parts.pop();
    var namespace = parts.join(".");
    this.addImporter(
      namespace,
      function importer(context) {
        var self = this;
        self.__defineGetter__(
          name,
          function() {
            delete self[name];
            self[name] = factory(context);
            return self[name];
          });
      });
  },
  addLazyLoaders: function addLazyLoaders(dottedNamesToFactories) {
    for (dottedName in dottedNamesToFactories)
      this.addLazyLoader(dottedName, dottedNamesToFactories[dottedName]);
  },
  addImporter: function addImporter(namespace, importer) {
    if (typeof(namespace) == "function" && !importer) {
      importer = namespace;
      namespace = "";
    }
    if (!(namespace in this.importers))
      this.importers[namespace] = [];
    this.importers[namespace].push(importer);
  },
  addMultiLazyLoader: function addMultiLazyLoader(namespace, names, factory) {
    function importMultiple(context) {
      // When any of the names are accessed, we'll invoke the factory
      // and import them all.

      function makeLazyLoader(aName) {
        function lazyLoader() {
          var object = factory(context);
          for each (name in names) {
            delete this[name];
            this[name] = object[name];
          }
          return this[aName];
        }
        return lazyLoader;
      }

      for each (name in names) {
        this.__defineGetter__(name,
                              makeLazyLoader(name));
      }
    }

    this.addImporter(namespace, importMultiple);
  }
};

// == Globals ==
//
// These are globals in two senses: the first obvious one is that they're
// in the global scope of all Jetpacks.  The second is that they're
// actually //shared globally// between all Jetpacks.

JetpackEnv.addGlobals(
  {"console": console,

   "jetpack.track": function track(obj, name) {
     if (typeof(obj) != "object")
       throw new Logging.ErrorAtCaller("Cannot track non-objects.");
     if (name !== undefined && typeof(name) != "string")
       throw new Logging.ErrorAtCaller("Name must be a string.");

     // Make the memory tracker record the stack frame/line number of our
     // caller, not us.
     MemoryTracking.track(obj, name, 1);
   },

   "JSON.stringify": function stringify(object) {
     switch (typeof(object)) {
     case "number":
     case "boolean":
     case "string":
       return uneval(object);
     case "object":
       var json = Cc["@mozilla.org/dom/json;1"]
                  .createInstance(Ci.nsIJSON);
       return json.encode(object);
     }
    },

   "JSON.parse": function parse(string) {
      var json = Cc["@mozilla.org/dom/json;1"]
                 .createInstance(Ci.nsIJSON);
      try {
        return json.decode(string);
      } catch (e) {
        throw new Logging.ErrorAtCaller("Invalid JSON: " + string);
      }
    }
  });

// == Importers and Lazy Loaders ==
//
// An //Importer// is simply a function that the Jetpack Runtime calls to add
// a property to the global namespace of a Jetpack Context.  The Importer
// has the ability to interact with the Jetpack Context it's augmenting,
// including adding //Unloader// objects to unload any resources taken
// up by the importer when the Jetpack Context is unloaded.
//
// A //Lazy Loader// is just a special type of Importer that is
// instantiated only when a Jetpack tries to access the global
// property the Lazy Loader provides.

window.addLazyLoaders(
  {"js/tabs.js": [
     "EventListenerMixIns",
     "EventListenerMixIn",
     "Tabs"
   ],
   "js/clipboard.js": [
     "Clipboard"
   ],
   "js/twitter.js": [
     "twitter"
   ],
   "js/notifications.js": [
     "Notifications"
   ],
   "js/selection.js": [
     "_Selection"
   ],
   "js/slidebar.js": [
     "SlideBar"
   ],
   "js/status-bar-panel.js": [
     "StatusBar"
   ],
   "js/timers.js": [
     "Timers"
   ],
   "js/secure-membrane.js": [
     "SecureMembrane"
   ],
   "js/info.js": [
    "Information"
   ],
   "js/jquery-sandbox.js": [
     "JQuerySandbox"
   ]
  });

// Add HTML4 timer/interval functions.
JetpackEnv.addMultiLazyLoader(
  "",
  ["setInterval",
   "clearInterval",
   "setTimeout",
   "clearTimeout"],
  function addTimers(context) {
    var timers = new Timers(window);
    context.addUnloader(timers);
    return timers;
  });

// Add sandboxed jQuery.
JetpackEnv.addImporter(
  "",
  function(context) {
    // TODO: We're actually loading jQuery into the jetpack context at the
    // initialization of each jetpack this way, rather than lazily if/when
    // jQuery/$ is requested.
    var proto = {
      get XMLHttpRequest() {
        return context.sandbox.XMLHttpRequest;
      },
      get setInterval() {
        return context.sandbox.setInterval;
      },
      get clearInterval() {
        return context.sandbox.clearInterval;
      },
      get setTimeout() {
        return context.sandbox.setTimeout;
      }
    };
    var jqsb = JQuerySandbox.create(context.srcUrl, proto);
    context.addUnloader(jqsb);
    jqsb.window.jetpackFeature = context.unsafeSandbox;
    Components.utils.evalInSandbox(("jetpackFeature.$ = $;" +
                                    "jetpackFeature.jQuery = jQuery;"),
                                    jqsb.window);
  });

JetpackEnv.addLazyLoaders({
   "XMLHttpRequest": function(context) {
     var xhrf = new XHR.Factory();
     context.addUnloader(xhrf);
     return xhrf.create;
   },

   "jetpack.lib.twitter": function(context) {
     return twitter();
   },

   "jetpack.future": function(context) {
     var future = {
       list: function() {
         var list = [];
         for (name in JetpackEnv.futures)
           list.push(name);
         list.sort();
         return list;
       }
     };
     future['import'] = function(dottedName) {
       if (dottedName.indexOf("jetpack.") != 0)
         dottedName = "jetpack." + dottedName;
       var factory = JetpackEnv.futures[dottedName];
       if (!factory)
         throw new Logging.ErrorAtCaller(dottedName + " has no future.");
       var parts = dottedName.split(".");
       var name = parts.pop();
       var namespace = parts.join(".");
       context.doImport(namespace,
                        function(context) {
                          this[name] = factory(context);
                        });
     };
     return future;
   },

   "jetpack.tabs": function(context) {
     var tabsContext = new Tabs();
     context.addUnloader(tabsContext);
     return tabsContext.tabs;
   },

   "jetpack.notifications": function(context) {
     return new Notifications();
   },

   "jetpack.storage.live": function(context) {
     if (!Extension.Manager.sessionStorage.jetpacks)
       Extension.Manager.sessionStorage.jetpacks = {};
     var sessionStorage = Extension.Manager.sessionStorage.jetpacks;
     var id = context.urlFactory.makeUrl("");
     if (!sessionStorage[id])
       sessionStorage[id] = {};
     return sessionStorage[id];
   },

   "jetpack.statusBar": function(context) {
     var statusBar = new StatusBar(context.urlFactory);
     context.addUnloader(statusBar);
     return {
       append: function append(options) {
         return statusBar.append(options);
       }
     };
   },

   "jetpack.info": function(context) {
     return new Information();
   }
});

// == Futures ==
//
// These are candidates to be parts of the {{{jetpack}}} namespace that
// are currently under development, and can be accessed via a call
// to {{{jetpack.future.import()}}}. See
// [[https://wiki.mozilla.org/Labs/Jetpack/JEP/13|JEP 13]] for more
// information.

JetpackEnv.setFutures(
  {"jetpack.T1000" : function(context) {
     return function() { return "I'm from the future."; };
   },

   "jetpack.clipboard": function(context) {
     return new Clipboard();
   },

   "jetpack.selection": function(context) {
     return _Selection.makeExported(context);
   },

   "jetpack.storage.simple": function (context) {
     var s = {};
     Cu.import("resource://jetpack/modules/simple-storage.js", s);

     var ss = new s.simpleStorage.SimpleStorage(context.id);
     s.simpleStorage.register(ss);
     context.addUnloader({ unload: function () s.simpleStorage.unregister(ss)});
     return ss;
   },

   "jetpack.slideBar": function(context) {
     return SlideBar.makeExported(context);
   },

   "jetpack.audio": function(context) {
     var s = {};
     Cu.import("resource://jetpack/modules/audio.js", s);
     return new s.AudioModule();
   },

   "jetpack.pageMods": function(context) {
     var s = {};
     Cu.import("resource://jetpack/modules/page-modification.js", s);
     return new s.PageMods(context.sandbox.jetpack);
   },

   "jetpack.music": function(context) {
     var s = {};
     Cu.import("resource://jetpack/modules/music.js", s);
     return new s.MusicModule();
   },

   "jetpack.video": function(context) {
     var s = {};
     Cu.import("resource://jetpack/modules/video.js", s);
     return new s.VideoModule();
   }
  });

// == Deprecations ==
//
// These are mappings from the names of old, deprecated functions or
// namespaces to their new locations.  Everything listed here allows
// the deprecated name to be an alias to the non-deprecated name,
// with the provision that upon the first access of the deprecated
// name, a warning is logged to the console.

JetpackEnv.addDeprecations(
  {"jetpack.sessionStorage": "jetpack.storage.live",
   "jetpack.json.encode": "JSON.stringify",
   "jetpack.json.decode": "JSON.parse",
   "jetpack.importFromFuture": "jetpack.future.import"
  });
