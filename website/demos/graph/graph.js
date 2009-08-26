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

var data = null;
var legend = null;

function updateGraph(){
  stash.history.push( jetpack.tabs.length );

  if( stash.history.length > 400 )
    stash.history = stash.history.slice( 1 );

  data.text( stash.history.join(",") );
  legend.text( stash.history[ stash.history.length-1 ] );
}

jetpack.tabs.onOpen( updateGraph );
jetpack.tabs.onClose( updateGraph );
jetpack.tabs.onFocus( updateGraph );

jetpack.statusBar.append({
  url: "statusbar.html",
  width: 175,
  onReady: function(widget){
    data = $("#data", widget);
    legend = $("#legend", widget);
    updateGraph();
  }
})