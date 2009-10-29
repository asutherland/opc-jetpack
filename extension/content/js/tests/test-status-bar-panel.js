var StatusBarPanelTests = {
  testStatusBarWorks: function(self) {
    var browserCount = 0;
    var bw = new BrowserWatcher(
      {onLoad: function(window) {
         if (!window.document.getElementById("status-bar").hidden)
           browserCount += 1;
       }}
    );
    bw.unload();
    bw = null;

    if (browserCount) {
      var fakeContext = {};
      var sb = new StatusBar(fakeContext);
      function onDone() {
        browserCount -= 1;
        if (browserCount == 0) {
          sb.unload();
          sb = null;
          self.success();
        }
      }
      sb.append(
        {html: "<p>testing</p>",
         onReady: function(document) {
           self.assert($("p", document).text() == "testing");
           window.setTimeout(onDone, 0);
         }});
      self.setTimeout(5000);
    }
  }
};
