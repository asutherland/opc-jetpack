var TabsTests = {
  testTabIsObject: function(self) {
    var tabs = new Tabs();
    self.assert(typeof(tabs.tabs.focused) == "object");
    tabs.unload();
  },

  testMixInEventsBubble: function(self) {
    var tabs = new Tabs();
    var url = "data:text/html,hello";
    tabs.tabs.onReady(
      function onReady(document) {
        if (document.location.href != url)
          // It's some other tab that loaded in the user's browser,
          // ignore it.
          return;
        tabs.tabs.onReady.unbind(onReady);
        self.assert(this, tab);
        self.assert($(document).text() == "hello");
        tab.close();
        tabs.unload();
        self.success();
      });
    var tab = tabs.tabs.open(url);
    self.setTimeout(1000);
  },

  testTabOpenFocusAndClose: function(self) {
    var tabs = new Tabs();
    var originalTabCount = tabs.tabs.length;
    var onOpenCalled = false;
    tabs.tabs.onOpen(function() { onOpenCalled = true; });
    var tab = tabs.tabs.open("data:text/html,hai2u");
    self.assert(tabs.tabs.focused != tab);
    self.assert(tabs.tabs.length == originalTabCount+1);
    self.assert(onOpenCalled);
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
        var onCloseCalled = false;
        tabs.tabs.onClose(function() { self.assert(this == tab);
                                       onCloseCalled = true; });
        tab.close();
        self.assert(tabs.tabs.length == originalTabCount);
        self.assert(onCloseCalled);
        tabs.unload();
        self.success();
      });
    self.setTimeout(1000);
  }
};
