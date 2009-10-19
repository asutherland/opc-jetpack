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

  create: function create(principal, proto) {
    var systemPrincipal = Cc["@mozilla.org/systemprincipal;1"]
                          .createInstance(Ci.nsIPrincipal);

    //var sb = Components.utils.Sandbox(principal);
    var sb = Components.utils.Sandbox(systemPrincipal);

    var fakeWindow = new Object();

    // Minimal stubs needed to load jQuery in a sandbox.
    fakeWindow.document = {
      defaultView: {
        getComputedStyle: function(elem) {
          return elem.ownerDocument.defaultView.getComputedStyle(elem, null);
        }
      }
    };

    var unloaders = [];

    fakeWindow.removeEventListener = function(name, fn) {
      if (name != "unload")
        throw new Error("Unsupported event type: " + name);
      var index = unloaders.indexOf(fn);
      if (index != -1)
        unloaders.splice(index, 1);
      else
        throw new Error("Event listener not found.");
    };

    fakeWindow.addEventListener = function(name, fn) {
      if (name != "unload")
        throw new Error("Unsupported event type: " + name);
      unloaders.push(fn);
    };

    if (proto)
      fakeWindow.__proto__ = proto;

    //sb.__proto__ = SecureMembrane.wrapTrusted(fakeWindow);
    sb.__proto__ = fakeWindow;

    Cu.evalInSandbox(this.code, sb, "1.8",
                     "chrome://jetpack/content/index.html -> " +
                     this.uri.spec, 1);

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
