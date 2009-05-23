var JetpackEnv = {
  importers: {},
  globals: {},
  addGlobal: function addGlobal(dottedName, value) {
    if (dottedName in this.globals)
      throw new Error("Name " + dottedName + " already exists");
    this.globals[dottedName] = value;
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
JetpackEnv.addGlobal("jetpack.lib.twitter", Twitter);
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

JetpackEnv.addImporter(
  "jetpack",
  function importTabs(context) {
    var tabsContext = new Tabs();
    this.tabs = tabsContext.tabs;
    context.addUnloader(tabsContext);
  });

JetpackEnv.addImporter(
  "jetpack",
  function importNotifications(context) {
    this.notifications = new Notifications();
  });

JetpackEnv.addImporter(
  "jetpack",
  function importSessionStorage(context) {
    if (!Extension.Manager.sessionStorage.jetpacks)
      Extension.Manager.sessionStorage.jetpacks = {};
    var sessionStorage = Extension.Manager.sessionStorage.jetpacks;
    var id = context.urlFactory.makeUrl("");
    if (!sessionStorage[id])
      sessionStorage[id] = {};
    this.sessionStorage = sessionStorage[id];
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

JetpackEnv.addImporter(
  "jetpack.statusBar",
  function importStatusBar(context) {
    var statusBar = new StatusBar(context.urlFactory);
    this.append = function append(options) {
      return statusBar.append(options);
    };
    context.addUnloader(statusBar);
  });
