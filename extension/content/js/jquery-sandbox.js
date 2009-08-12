var JQuerySandbox = {
  get file() {
    var jsm = {};
    Components.utils.import("resource://jetpack/modules/setup.js", jsm);
    var jQueryFile = jsm.JetpackSetup.getExtensionDirectory();
    jQueryFile.append("content");
    jQueryFile.append("js");
    jQueryFile.append("ext");
    jQueryFile.append("jquery.js");
    delete this.file;
    this.file = jQueryFile;
    return this.file;
  },

  get uri() {
    let ioSvc = Cc["@mozilla.org/network/io-service;1"]
                .getService(Ci.nsIIOService);
    delete this.uri;
    this.uri = ioSvc.newFileURI(this.file);
    return this.uri;
  },

  get code() {
    delete this.code;
    this.code = FileIO.read(this.file, "utf-8");
    return this.code;
  },

  create: function create(principal) {
    var sb = Components.utils.Sandbox(principal);

    // Minimal stubs needed to load jQuery in a sandbox.
    sb.document = {
      defaultView: {
        getComputedStyle: function(elem) {
          return elem.ownerDocument.defaultView.getComputedStyle(elem, null);
        }
      }
    };

    var unloaders = [];

    sb.removeEventListener = function(name, fn) {
      if (name != "unload")
        throw new Error("Unsupported event type: " + name);
      var index = unloaders.indexOf(fn);
      if (index != -1)
        unloaders.splice(index, 1);
      else
        throw new Error("Event listener not found.");
    };

    sb.addEventListener = function(name, fn) {
      if (name != "unload")
        throw new Error("Unsupported event type: " + name);
      unloaders.push(fn);
    };

    Cu.evalInSandbox(this.code, sb, "1.8", this.uri.spec, 1);

    var sandbox = {
      unload: function() {
        unloaders.forEach(function(unloader) { unloader({type: "unload"}); });
      },
      window: sb,
      $: sb.$,
      jQuery: sb.jQuery
    };

    MemoryTracking.track(sandbox, "JQuerySandbox");

    return sandbox;
  }
};
