function SecurableModuleLoader(urlFactory) {
  MemoryTracking.track(this);

  var json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);

  // Get the code at the given URL and call the given callback with
  // an object that contains an 'error' property. If 'error' is false,
  // then the object also contains a 'data' property which is the
  // string containing the JS code at the URL.
  function getCode(url, cb) {
    var desiredStatus = 0;
    if (url.indexOf("http") == 0)
      desiredStatus = 200;
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.overrideMimeType('text/javascript');
    req.onreadystatechange = function() {
      if (req.readyState == 4) {
        var result = {data: req.responseText,
                      error: false};
        if (req.status != desiredStatus)
          result.error = true;
        cb(result);
      }
    };
    try {
      req.send(null);
    } catch (e) {
      cb({error: true});
    }
  }

  // This function is toString'd and evaluated in the context of a JS
  // sandbox.
  function initSandbox(sandbox) {
    sandbox.exports = new Object();
  }

  // This function is toString'd and evaluated in the context of a JS
  // sandbox. Given an object containing objects to export, it returns
  // a safe JSON representation of them.
  function exportFunctions(exports) {
    var exportData = {};
    for (name in exports) {
      var obj = exports[name];
      switch (typeof(obj)) {
      case "function":
        // This is a cheap placeholder that essentially says
        // "replace this with a real function later".  It relies
        // on no one actually exporting a real string with this
        // value, though.
        exportData[name] = "[[function]]";
        break;
      case "object":
        exportData[name] = exportFunctions(obj);
        break;
      case "string":
      case "number":
        exportData[name] = obj;
        break;
      }
    }
    return exportData;
  }

  // Safely returns a JS string representation of the given JS value, similar
  // to Python's repr().
  function unevalValue(value) {
    switch (typeof(value)) {
    case "undefined":
      return "undefined";
    case "object":
      if (value === null)
        return "null";
      return json.encode(value);
    case "string":
    case "number":
    case "boolean":
      return uneval(value);
    default:
      // Point to the line of code that's most likely to actually
      // be responsible for the mistake, to make debugging easier.
      console.logFromCaller(["value is not JSON-encodable: ", value],
                            'error', 3);
    }
  }

  // Converts the given potentially dangerous JS value into a safe
  // value and returns it.
  function makeSafe(value) {
    switch (typeof(value)) {
    case "undefined":
      return undefined;
    case "object":
      if (value === null)
        return null;
      return json.decode(json.encode(value));
    case "string":
    case "number":
    case "boolean":
      return eval(uneval(value));
    default:
      // TODO: For some reason throwing an exception here doesn't work,
      // so we're using this lame placeholder for now.
      return "[[error]]";
      break;
    }
  }

  // Creates a function that wraps a function in a JS sandbox, serializing
  // all passed-in arguments and deserializing the return value. This
  // basically means that the function in the sandbox can only take in
  // JSON-able arguments and can only return JSON-able results. It also
  // means that any modifications the sandboxed function makes to its
  // arguments won't affect the real arguments, because this
  // is effectively pass-by-value taken to the extreme.
  function makeWrappedFunction(fullName, sandbox) {
    return function wrappedFunction() {
      var argStrings = [];
      for (var i = 0; i < arguments.length; i++)
        argStrings.push(unevalValue(arguments[i]));
      var code = fullName + "(" + argStrings.join(",") + ");";
      var result = Components.utils.evalInSandbox(code, sandbox);
      result = XPCSafeJSObjectWrapper(result);
      result = makeSafe(result);
      if (result == "[[error]]")
        throw new Error(fullName + "() returned a non-JSON-encodable value.");
      return result;
    };
  }

  // Our one exported function. It takes an options argument with properties
  // 'url' and 'callback': the JS code at the given URL is fetched and
  // interpreted as a SecurableModule which can only communicate w/
  // the caller via what's essentially serialized JSON. If the URL
  // was successfully fetched, the callback is called and passed the
  // SecurableModule's namespace of exports; if not, the callback is
  // called with the value 'null'.
  this.require = function(options) {
    var url = urlFactory.makeUrl(options.url);

    getCode(
      url,
      function(result) {
        if (result.error) {
          options.callback(null);
          return;
        }
        var data = result.data;
        try {
          var sandbox = new Components.utils.Sandbox(url);
          var initCode = "(" + initSandbox.toString() + ")(this);";
          Components.utils.evalInSandbox(initCode, sandbox);
          Components.utils.evalInSandbox(data,
                                         sandbox,
                                         "1.8",
                                         url,
                                         1);
          var exportCode = "(" + exportFunctions.toString() + ")(exports);";
          var exportData = Components.utils.evalInSandbox(exportCode,
                                                          sandbox);
          exportData = XPCSafeJSObjectWrapper(exportData);
          exportData = json.decode(json.encode(exportData));

          var toWrap = [{obj: exportData, name: "exports"}];

          while (toWrap.length) {
            var info = toWrap.pop();
            for (name in info.obj) {
              var fullName = info.name + "." + name;
              if (info.obj[name] == "[[function]]") {
                info.obj[name] = makeWrappedFunction(fullName, sandbox);
              } else if (typeof(info.obj[name]) == "object") {
                toWrap.push({obj: info.obj[name], name: fullName});
              }
            }
          }

          MemoryTracking.track(exportData, "SecurableModuleWrapper");
          options.callback(exportData);
        } catch (e) {
          try {
            options.callback(null);
          } catch (e2) {
            console.exception(e2);
          }
          throw e;
        }
      });
  };
}
