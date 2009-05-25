var WebContentFunctions = {
  // Safely import the given list of functions into the given webpage
  // window, so that they can be used from content-space.  Each
  // function must return a JS primitive.
  importIntoWindow: function importIntoWindow(functions, window) {
    var sandbox = Components.utils.Sandbox(window);
    var codeLines = [];

    for (name in functions)
      if (typeof(functions[name]) == "function") {
        codeLines.push("window." + name + " = " + name + ";");
        sandbox.importFunction(functions[name]);
      }

    sandbox.window = window.wrappedJSObject;
    Components.utils.evalInSandbox(codeLines.join('\n'), sandbox);
  },

  // Inject the source code of the given function into the given
  // window and call it, passing it the window as its argument.
  evalIntoWindow: function evalIntoWindow(func, window) {
    var sandbox = Components.utils.Sandbox(window);
    sandbox.window = window.wrappedJSObject;
    Components.utils.evalInSandbox("(" + func.toString() + ")(window);",
                                   sandbox);
  }
};

function UrlFactory(baseUrl) {
  MemoryTracking.track(this);
  var ios = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService);
  var base = ios.newURI(baseUrl, null, null);

  this.makeUrl = function(url) {
    return ios.newURI(url, null, base).spec;
  };
}

function addLazyLoader(url) {
  var symbolNames = [];
  for (var i = 1; i < arguments.length; i++)
    symbolNames.push(arguments[i]);

  var absoluteUrl = (new UrlFactory(document.baseURI)).makeUrl(url);

  symbolNames.forEach(
    function(name) {
      window.__defineGetter__(
        name,
        function() {
          // Remove all lazy getters.
          symbolNames.forEach(function(name) { delete window[name]; });

          var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                       .getService(Ci.mozIJSSubScriptLoader);

          // Import the script.
          loader.loadSubScript(absoluteUrl);

          return window[name];
        });
    });
}

function Dictionary() {
  MemoryTracking.track(this);
  var keys = [];
  var values = [];

  this.set = function set(key, value) {
    var id = keys.indexOf(key);
    if (id == -1) {
      keys.push(key);
      values.push(value);
    } else
      values[id] = value;
  };

  this.get = function get(key, defaultValue) {
    if (defaultValue === undefined)
      defaultValue = null;
    var id = keys.indexOf(key);
    if (id == -1)
      return defaultValue;
    return values[id];
  };

  this.remove = function remove(key) {
    var id = keys.indexOf(key);
    if (id == -1)
      throw new Error("object not in dictionary: " + key);
    keys.splice(id, 1);
    values.splice(id, 1);
  };

  var readOnlyKeys = new ImmutableArray(keys);
  var readOnlyValues = new ImmutableArray(values);

  this.__defineGetter__("keys", function() { return readOnlyKeys; });
  this.__defineGetter__("values", function() { return readOnlyValues; });
  this.__defineGetter__("length", function() { return keys.length; });
}

function ImmutableArray(baseArray) {
  var self = this;
  var UNSUPPORTED_MUTATOR_METHODS = ["pop", "push", "reverse", "shift",
                                     "sort", "splice", "unshift"];
  UNSUPPORTED_MUTATOR_METHODS.forEach(
    function(methodName) {
      self[methodName] = function() {
        throw new Error("Mutator method '" + methodName + "()' is " +
                        "unsupported on this object.");
      };
    });

  self.toString = function() { return "[ImmutableArray]"; };

  self.__proto__ = baseArray;
}
