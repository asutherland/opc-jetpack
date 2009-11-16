/*
	@author: Aza Raskin
	@url: http://azarask.in
	@title: Tab Grapher
	@description: Graphs your tab usage, as a sparkline.
	@license: MPL
*/

// TODO: This only works when there is one window!
// We need the Shadow DOM to fix this properly.

// We keep the history in session storage so that the sparkline
// is maintained even during development.

var stash = jetpack.storage.live;
if( !stash.history ) stash.history = [jetpack.tabs.length]

jetpack.statusBar.append({
  url: "statusbar.html",
  onReady: function(widget){
    data = $("#data", widget);
    legend = $("#legend", widget);
    
    function updateGraph(){
      stash.history.push( jetpack.tabs.length );

      if( stash.history.length > 400 )
        stash.history = stash.history.slice( 1 );

      data.text( stash.history.join(",") );
      legend.text( stash.history[ stash.history.length-1 ] ); 
    }

    jetpack.tabs.onOpen( updateGraph );
    jetpack.tabs.onClose( updateGraph );
    setInterval( updateGraph, 1000*60*2 ); // Flat-line every three minutes.
    
    updateGraph();
    
    jetpack.future.import("menu");
    jetpack.menu.context.set({
      label: "Reset",
      command: function(){
        stash.history = [ jetpack.tabs.length ];
        updateGraph();
      }
    });
    
    
  }
})
