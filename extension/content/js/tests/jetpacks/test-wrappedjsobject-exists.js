jetpack.statusBar.append({
  html: "Boom<i>!</i>",
  width: 45,
  onReady: function(widget) {
    test.assert(widget.wrappedJSObject, "Wrapped JS object must exist.");
    test.success();
  }
});

test.setTimeout(2000, "Status bar widget must trigger onReady.");
