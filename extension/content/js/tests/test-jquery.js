var JqueryTests = {
  testJqueryCanBeLoadedInSandbox: function(self) {
    var jsm = {};
    Components.utils.import("resource://jetpack/modules/setup.js", jsm);
    var jqueryFile = jsm.JetpackSetup.getExtensionDirectory();
    jqueryFile.append("content");
    jqueryFile.append("js");
    jqueryFile.append("ext");
    jqueryFile.append("jquery.js");

    let ioSvc = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);
    let jqueryUri = ioSvc.newFileURI(jqueryFile).spec;

    var jquery = FileIO.read(jqueryFile, "utf-8");

    // This optional membrane can be wrapped around the window
    // executing this test and set as the sandbox's prototype to
    // observe what global variables are being accessed by jQuery, if
    // any.
    var membranePrototype = {
      resolve: function resolve(wrappee, wrapper, name) {
        var newName;
        if (typeof(name) == "number")
          newName = this.name + "[" + name + "]";
        else
          newName = this.name + "." + name;
        if (typeof(wrappee[name]) == "undefined")
          return undefined;
        wrapper[name] = makeWrapper(wrappee[name], newName);
        return wrapper;
      },

      enumerate: function(wrappee, wrapper) {
        for (name in wrappee)
          yield name;
      },

      setProperty: function(wrappee, wrapper, name, value) {
        if (name == "innerHTML" && typeof(wrapper[name]) != "undefined") {
          console.logFromCaller([this.name + "." + name, "=", value], "info");
          wrappee[name] = value;
        }
        return value;
      },

      call: function(wrappee, wrapper, thisObj, args) {
        var name = this.name;
        var realThis = SecureMembrane.binary.unwrap(thisObj);
        if (!realThis)
          realThis = thisObj;
        var realArgs = [];
        for (var i = 0; i < args.length; i++) {
          var realArg = SecureMembrane.binary.unwrap(args[i]);
          if (!realArg)
            realArg = args[i];
          realArgs.push(realArg);
        }
        var strArgs = "";
        if (realArgs.length > 0 && typeof(realArgs[0]) == "string")
          strArgs = uneval(realArgs[0]);
        console.logFromCaller(["calling", name + "(" + strArgs + ")"], "info");
        if (name != "window.addEventListener") {
          var result = wrappee.apply(realThis, realArgs);
          return makeWrapper(result, name + "(" + strArgs + ")");
        } else {
          // TODO: ???
          return undefined;
        }
      },

      convert: function(wrappee, wrapper, type) {
        if (type == "object")
          return wrapper;
        return undefined;
      }
    };

    function makeWrapper(thing, name) {
      switch (typeof(thing)) {
      case "number":
      case "string":
      case "boolean":
      case "undefined":
        console.logFromCaller([name, "is", thing], "info", 1);
        return thing;
      case "object":
        if (thing === null)
          return null;
      }

      var membrane = {name: name,
                      __proto__: membranePrototype};
      return SecureMembrane.binary.wrap(thing, membrane);
    }

    var sb = Components.utils.Sandbox("http://www.foo.com");

    // Uncomment this line to see what global objects are being called
    // by jQuery.
    //sb.__proto__ = makeWrapper(window, "window");

    // Minimal stubs needed to load jQuery in a sandbox.
    sb.document = {
      defaultView: {
        getComputedStyle: function() {
          throw new Error("Not implemented.");
        }
      }
    };

    Components.utils.evalInSandbox(jquery, sb, "1.8", jqueryUri, 1);
  }
};
