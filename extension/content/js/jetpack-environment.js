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
  function track() {
    var newArgs = [];
    for (var i = 0; i < 2; i++)
      newArgs.push(arguments[i]);
    // Make the memory tracker record the stack frame/line number of our
    // caller, not us.
    newArgs.push(1);
    MemoryTracking.track.apply(MemoryTracking, newArgs);
  });

JetpackEnv.addImporter(
  function importTimers(obj, context) {
    var timers = new Timers(window);
    timers.addMethodsTo(obj);
    return timers;
  });

JetpackEnv.addImporter(
  "jetpack",
  function importTabs(obj, context) {
    var tabs = new Tabs();
    obj.tabs = tabs.tabs;
    return tabs;
  });

JetpackEnv.addImporter(
  "jetpack",
  function importNotifications(obj, context) {
    obj.notifications = new Notifications();
  });

JetpackEnv.addImporter(
  "jetpack",
  function importSessionStorage(obj, context) {
    if (!Extension.Manager.sessionStorage.jetpacks)
      Extension.Manager.sessionStorage.jetpacks = {};
    var sessionStorage = Extension.Manager.sessionStorage.jetpacks;
    var id = context.urlFactory.makeUrl("");
    if (!sessionStorage[id])
      sessionStorage[id] = {};
    obj.sessionStorage = sessionStorage[id];
  });

JetpackEnv.addImporter(
  "jetpack.json",
  function importJson(obj, context) {
    obj.encode = function encode(object) {
      var json = Cc["@mozilla.org/dom/json;1"]
                 .createInstance(Ci.nsIJSON);
      return json.encode(object);
    };
    obj.decode = function decode(string) {
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
  function importStatusBar(obj, context) {
    var statusBar = new StatusBar(context.urlFactory);
    obj.append = function append(options) {
      return statusBar.append(options);
    };
    return statusBar;
  });
