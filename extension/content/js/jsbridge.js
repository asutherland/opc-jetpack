var JSBridge = {
  // Whether we can start communicating with the client or not.
  isReady: false,

  get events() {
    delete this.events;
    this.events = {};
    Components.utils.import('resource://jsbridge/modules/events.js',
                            this.events);
    return this.events;
  },

  renderDocs: function renderDocs() {
    var result = {};
    function maybeSendResult() {
      if (result.apiHtml && result.tutorialHtml)
        JSBridge.events.fireEvent('jetpack:result', result);
    }

    var rawApiDocs = $("<div></div>");
    var apiContent = $("<div></div>");
    var tutorialContent = $("<div></div>");
    App.getLocalFile(
      "raw-api-documentation.html",
      function(html) {
        rawApiDocs.html(html);
        App.buildApiReference(rawApiDocs, apiContent);
        $(".logging-source", apiContent).text("logging console");
        result.apiHtml = apiContent.html();
        maybeSendResult();
      });
    App.getLocalFile(
      "tutorial.html",
      function(html) {
        result.tutorialHtml = html;
        maybeSendResult();
      });
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
        JSBridge.events.fireEvent('jetpack:result', result);
        cl.unload();
      });
  }
};

$(window).load(function() { JSBridge.isReady = true; });
