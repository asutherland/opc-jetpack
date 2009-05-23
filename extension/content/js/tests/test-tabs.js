var TabsTests = {
  testTabIsObject: function(self) {
    var tabs = new Tabs();
    self.assert(typeof(tabs.tabs.focused) == "object");
    tabs.unload();
  },

  testMixInEventsBubble: function(self) {
    var tabs = new Tabs();
    tabs.tabs.onReady(
      function onReady(document) {
        tabs.tabs.onReady.unbind(onReady);
        self.assert(this, tab);
        self.assert($(document).text() == "hello");
        tab.close();
        tabs.unload();
        self.success();
      });
    var tab = tabs.tabs.open("data:text/html,hello");
    self.setTimeout(1000);
  },

  testTabOpenFocusAndClose: function(self) {
    var tabs = new Tabs();
    var originalTabCount = tabs.tabs.length;
    var tab = tabs.tabs.open("data:text/html,hai2u");
    self.assert(tabs.tabs.focused != tab);
    self.assert(tabs.tabs.length == originalTabCount+1);
    var onFocusCalled = false;
    tab.onFocus(function() { onFocusCalled = true; });
    tab.focus();
    self.assert(tabs.tabs.focused == tab);
    self.assert(onFocusCalled);
    tab.onReady(
      function onReady(document) {
        self.assert(this, tab);
        tab.onReady.unbind(onReady);
        self.assert($(document).text() == "hai2u");
        tab.close();
        self.assert(tabs.tabs.length == originalTabCount);
        tabs.unload();
        self.success();
      });
    self.setTimeout(1000);
  }
};
