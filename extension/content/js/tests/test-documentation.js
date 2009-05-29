var DocumentationTests = {
  testDocumentationCodeIsValid: function(self) {
    $("code.window-global").each(
      function() {
        var code = $(this).text();
        var result = eval(code);
        self.assert(typeof(result) != "undefined");
      });
  }
};
