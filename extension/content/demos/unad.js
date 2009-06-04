var blocklist;

jetpack.importFromFuture("securableModules");
jetpack.securableModules.require(
  {url: "unad_blocklist.js",
   callback: function(blocklistModule) {
     blocklist = blocklistModule;
     jQuery.get("http://easylist.adblockplus.org/easylist.txt",
                blocklist.process);
   }});

function removeAds(doc) {
  if (doc.location.protocol == "http:" ||
      doc.location.protocol == "https:")
    $(doc).find("[src]").filter(function(){
      var el = $(this);
      if( blocklist && blocklist.match(el.attr("src")) )
        el.remove();
      });
}

var widgets = [];
var state = "off";

function toggleState() {
  if( state == "off" ){
    jetpack.tabs.onReady(removeAds);
    state = "on";
  } else {
    jetpack.tabs.onReady.unbind(removeAds);
    state = "off";
  }

  // This is a temporary way of keeping all browser window states
  // in sync. We are working on a better API for this.
  widgets.forEach(function(widget) {
    widget.defaultView.wrappedJSObject.setState(state);
  });
}

jetpack.statusBar.append({
  url: "unad.html",
  onReady: function(widget) {
    // This is a temporary way of keeping all browser window states
    // in sync. We are working on a better API for this.
    widgets.push(widget);
    widget.defaultView.wrappedJSObject.setState(state);
    $(widget).click(toggleState);
  },
  onUnload: function(widget) {
    widgets.splice(widgets.indexOf(widget), 1);
  },
  width: 42
});
