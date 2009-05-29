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
  addGlobal: function addGlobal(dottedName, value) {
    if (dottedName in this.globals)
      throw new Error("Name " + dottedName + " already exists");
    this.globals[dottedName] = value;
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

JetpackEnv.addGlobal("console", console);
JetpackEnv.addGlobal("jQuery", jQuery);
JetpackEnv.addGlobal("$", jQuery);
JetpackEnv.addGlobal(
  "jetpack.track",
  function track(obj, name) {
    if (typeof(obj) != "object")
      throw new Logging.ErrorAtCaller("Cannot track non-objects.");
    if (name !== undefined && typeof(name) != "string")
        throw new Logging.ErrorAtCaller("Name must be a string.");

    // Make the memory tracker record the stack frame/line number of our
    // caller, not us.
    MemoryTracking.track(obj, name, 1);
  });

JetpackEnv.addImporter(
  function importTimers(context) {
    var timers = new Timers(window);
    timers.addMethodsTo(this);
    context.addUnloader(timers);
  });

window.addLazyLoader("js/twitter.js", "Twitter");
JetpackEnv.addLazyLoader("jetpack.lib.twitter",
                         function() { return Twitter; });

window.addLazyLoader("js/tabs.js", "EventListenerMixIns",
                     "EventListenerMixIn", "Tabs");
JetpackEnv.addLazyLoader(
  "jetpack.tabs",
  function(context) {
    var tabsContext = new Tabs();
    context.addUnloader(tabsContext);
    return tabsContext.tabs;
  });

window.addLazyLoader("js/notifications.js", "Notifications");
JetpackEnv.addLazyLoader("jetpack.notifications",
                         function(context) { return new Notifications(); });

JetpackEnv.addLazyLoader(
  "jetpack.sessionStorage",
  function(context) {
    if (!Extension.Manager.sessionStorage.jetpacks)
      Extension.Manager.sessionStorage.jetpacks = {};
    var sessionStorage = Extension.Manager.sessionStorage.jetpacks;
    var id = context.urlFactory.makeUrl("");
    if (!sessionStorage[id])
      sessionStorage[id] = {};
    return sessionStorage[id];
  });

JetpackEnv.addImporter(
  "jetpack.json",
  function importJson(context) {
    this.encode = function encode(object) {
      var json = Cc["@mozilla.org/dom/json;1"]
                 .createInstance(Ci.nsIJSON);
      return json.encode(object);
    };
    this.decode = function decode(string) {
      var json = Cc["@mozilla.org/dom/json;1"]
                 .createInstance(Ci.nsIJSON);
      try {
        return json.decode(string);
      } catch (e) {
        throw new Logging.ErrorAtCaller("Invalid JSON: " + string);
      }
    };
  });

window.addLazyLoader("js/slidebar.js", "SlideBar");
JetpackEnv.addLazyLoader("jetpack.slideBar", function(context) {
  // Make sure the SlideBar is ready for this context
  SlideBar.init();
  SlideBar.load(context);

  // When unloading the context, inform SlideBar which one it is
  context.addUnloader({
    unload: function() SlideBar.unload(context)
  });

  // Export functions while letting SlideBar know which context is used
  return {
    append: function(args) SlideBar.append(context, args)
  };
});

window.addLazyLoader("js/status-bar-panel.js", "StatusBar");
JetpackEnv.addLazyLoader(
  "jetpack.statusBar",
  function(context) {
    var statusBar = new StatusBar(context.urlFactory);
    context.addUnloader(statusBar);
    return {
      append: function append(options) {
        return statusBar.append(options);
      }
    };
  });

window.addLazyLoader("js/securable-modules.js", "SecurableModuleLoader");
JetpackEnv.addLazyLoader(
  "jetpack.require",
  function(context) {
    return (new SecurableModuleLoader(context.urlFactory)).require;
  });
