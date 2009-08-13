var JqueryTests = {
  testJqueryEventHandlersAreUnloaded: function(self) {
    var jqsb = JQuerySandbox.create(window);
    var div = $('<div></div>');
    var divElem = div.get(0);
    var timesCalled = 0;

    $(document.body).append(div);
    jqsb.$(divElem).click(function() { timesCalled++; });

    function doClick() {
      var evt = document.createEvent("MouseEvents");
      evt.initMouseEvent("click", true, true, window,
                         0, 0, 0, 0, 0, false, false, false, false, 0, null);
      divElem.dispatchEvent(evt);
    }

    doClick();
    self.assertEqual(timesCalled, 1);
    jqsb.unload();
    doClick();
    self.assertEqual(timesCalled, 1);

    div.remove();
  },

  testJqueryCanBeLoadedInSandbox: function(self) {
    var jqsb = JQuerySandbox.create("http://www.foo.com");

    var wasUnloaded = false;
    jqsb.$(jqsb.window).unload(function() { wasUnloaded = true; });
    self.assertEqual(wasUnloaded, false);
    jqsb.unload();
    self.assertEqual(wasUnloaded, true);
  }
};
