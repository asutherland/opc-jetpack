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
            self[name] = Components.utils.evalInSandbox(dest, context.sandbox);
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
  }
};

// == Globals ==
//
// These are globals in two senses: the first obvious one is that they're
// in the global scope of all Jetpacks.  The second is that they're
// actually //shared globally// between all Jetpacks.

JetpackEnv.addGlobals(
  {"console": console,

   "jQuery": jQuery,

   "$": jQuery,

   "XMLHttpRequest": jQuery.ajaxSettings.xhr,

   "jetpack.track": function track(obj, name) {
     if (typeof(obj) != "object")
       throw new Logging.ErrorAtCaller("Cannot track non-objects.");
     if (name !== undefined && typeof(name) != "string")
       throw new Logging.ErrorAtCaller("Name must be a string.");

     // Make the memory tracker record the stack frame/line number of our
     // caller, not us.
     MemoryTracking.track(obj, name, 1);
   },

   "jetpack.json.encode": function encode(object) {
      var json = Cc["@mozilla.org/dom/json;1"]
                 .createInstance(Ci.nsIJSON);
      return json.encode(object);
    },

   "jetpack.json.decode": function decode(string) {
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
   "js/twitter.js": [
     "Twitter"
   ],
   "js/notifications.js": [
     "Notifications"
   ],
   "js/slidebar.js": [
     "SlideBar"
   ],
   "js/status-bar-panel.js": [
     "StatusBar"
   ],
   "js/securable-modules.js": [
     "SecurableModuleLoader"
   ],
   "js/timers.js": [
     "Timers"
   ]
  });

// Add jetpack.importFromFuture().
JetpackEnv.addImporter(
  "jetpack",
  function importImportFromFuture(context) {
    this.importFromFuture = function(dottedName) {
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
  });

// Add HTML4 timer/interval functions.
JetpackEnv.addImporter(
  function importTimers(context) {
    var functionNames = ["setInterval",
                         "clearInterval",
                         "setTimeout",
                         "clearTimeout"];

    function makeLazyLoader(name) {
      function lazyLoader() {
        var timers = new Timers(window);
        context.addUnloader(timers);
        for each (functionName in functionNames) {
          delete this[functionName];
          this[functionName] = timers[functionName];
        }
        return this[name];
      }
      return lazyLoader;
    }

    for each (functionName in functionNames) {
      this.__defineGetter__(functionName,
                            makeLazyLoader(functionName));
    }
  });

JetpackEnv.addLazyLoaders(
  {"jetpack.lib.twitter": function(context) {
     return Twitter;
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
   }
  });

JetpackEnv.setFutures(
  {"jetpack.T1000" : function(context) {
     return function() { return "I'm from the future."; };
   },

   "jetpack.securableModules": function(context) {
     var loader = new SecurableModuleLoader(context.urlFactory);
     return {require: loader.require};
   },

   "jetpack.slideBar": function(context) {
     // Make sure the SlideBar is ready for this context
     SlideBar.init();
     SlideBar.load(context);

     // When unloading the context, inform SlideBar which one it is
     context.addUnloader(
       {unload: function() {
          SlideBar.unload(context);
        }});

     // Export functions while letting SlideBar know which context is used
     return {
       append: function(args) { SlideBar.append(context, args); }
     };
   }
  });

JetpackEnv.addDeprecations(
  {"jetpack.sessionStorage": "jetpack.storage.live"
  });
