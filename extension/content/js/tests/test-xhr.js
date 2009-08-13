var XHRTests = {
  testXHRFactoryUnloadAbortsPendingRequests: function(self) {
    var factory = new XHR.Factory();
    var xhr = factory.create();
    var aborted = false;
    xhr.open('GET', 'http://www.mozilla.org/');
    xhr.addEventListener("abort", function() { aborted = true; }, false);
    xhr.send(null);
    self.assertEqual(aborted, false);
    self.assertEqual(factory.requestCount, 1);
    factory.unload();
    self.assertEqual(aborted, true);
    self.assertEqual(factory.requestCount, 0);
  }
};
