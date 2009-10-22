var XHR = {
  TERMINATE_EVENTS: ["load", "error", "abort"],

  Factory: function XHRFactory() {
    MemoryTracking.track(this);

    var requests = [];

    this.__defineGetter__(
      "requestCount",
      function() {
        var count = 0;
        requests.forEach(function() { count++; });
        return count;
      });

    this.create = function XHRFcreate() {
      var xhr = XHR.fromVisibleChromeWindow();

      function cleanup() {
        if (requests[id]) {
          XHR.TERMINATE_EVENTS.forEach(
            function(name) {
              xhr.removeEventListener(name, cleanup, false);
            });
          delete requests[id];
        }
      }

      var id = requests.push({xhr: xhr, cleanup: cleanup}) - 1;

      XHR.TERMINATE_EVENTS.forEach(
        function(name) {
          xhr.addEventListener(name, cleanup, false);
        });

      return xhr;
    };

    this.unload = function XHRFunload() {
      requests.forEach(function(request) { request.xhr.abort();
                                           request.cleanup(); });
    };
  },

  // This is a fix for Ubiquity bug #470.
  fromVisibleChromeWindow: function XHRfromVisibleChromeWindow() {
    var xhr;
    if (Extension.isHidden) {
      var currWindow = XULApp.mostRecentAppWindow;
      xhr = new currWindow.XMLHttpRequest();
    }
    else
      xhr = new XMLHttpRequest();
    MemoryTracking.track(xhr, "XMLHttpRequest");
    return xhr;
  }
};
