/*
	@author: Aza Raskin
	@url: http://azarask.in
	@title: Tab Grapher
	@description: Graphs your tab usage, as a sparkline.
	@license: MPL
*/

// We keep the history in session storage so that the sparkline
// is maintained even during development.
var stash = jetpack.sessionStorage;
if( !stash.history ) stash.history = [jetpack.tabs.length]

var tabCount = jetpack.tabs.length;
var data = null;
var legend = null;

function updateTabCount(){
  stash.history.push( tabCount );
  
  if( stash.history.length > 400 )
    stash.history = stash.history.slice( 1 );
  
  data.text( stash.history.join(",") );
  legend.text( tabCount );
}

jetpack.tabs.onOpen(function(){ tabCount++; updateTabCount(); });
jetpack.tabs.onClose(function(){ tabCount--; updateTabCount(); });
jetpack.tabs.onFocus(function(){ updateTabCount(); });

jetpack.statusBar.append({
  url: "statusbar.html",
  width: 175,
  onReady: function(widget){
    data = $("#data", widget);
    legend = $("#legend", widget);
    updateTabCount();    
  }
})