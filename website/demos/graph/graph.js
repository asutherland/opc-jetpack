/*
	@author: Aza Raskin
	@url: http://azarask.in
	@title: Tab Grapher
	@description: Graphs your tab usage, as a sparkline.
	@license: MPL
*/

var tabCountHistory = [jetpack.tabs.length];
var tabCount = jetpack.tabs.length;
var data = null;
var legend = null;

function updateTabCount(){
  tabCountHistory.push( tabCount );
  
  if( tabCountHistory.length > 150 )
    tabCountHistory = tabCountHistory.slice(1);
  
  data.text( tabCountHistory.join(",") );
  legend.text( tabCount );
}

jetpack.tabs.onOpen(function(){ tabCount++; updateTabCount(); });
jetpack.tabs.onClose(function(){ tabCount--; updateTabCount(); });

jetpack.statusBar.append({
  url: "statusbar.html",
  width: 105,
  onReady: function(widget){
    data = $("#data", widget);
    legend = $("#legend", widget);
  }
})