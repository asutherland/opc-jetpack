jetpack.statusBar.append({
  html: "Boom<i>!</i>",
  width: 45,
  onReady: function(widget) {
    $(widget).click(function() { test.success(); });
    setTimeout(
      function() {
        var evt = widget.createEvent("MouseEvents");
        evt.initMouseEvent("click", true, true, widget.defaultView,
                           0, 0, 0, 0, 0, false, false, false, false, 0,
                           null);
        widget.dispatchEvent(evt);
      },
      100
    );
  }
});

test.setTimeout(2000, "Click event must propagate.");
