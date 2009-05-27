var JSBridge = {
  // Whether we can start communicating with the client or not.
  isReady: false,

  // Results of last test, 0 if N/A.
  lastResult: 0,

  get events() {
    delete this.events;
    this.events = {};
    Components.utils.import('resource://jsbridge/modules/events.js',
                            this.events);
    return this.events;
  },

  // Run the tests from jsbridge. Needed because jsbridge doesn't
  // transmit 'this' properly.
  runTests: function runTests() {
    var cl = new Logging.ConsoleListener();
    cl.onMessage = function onMessage(msg) {
      if (!(msg.sourceName && msg.sourceName.indexOf('http') == 0))
        JSBridge.events.fireEvent('jetpack:message', msg);
    };
    Tests.run(
      function onDone(result) {
        JSBridge.lastResult = result;
        cl.unload();
      });
  }
};

$(window).load(function() { JSBridge.isReady = true; });
