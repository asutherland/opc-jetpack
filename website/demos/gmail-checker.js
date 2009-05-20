function GmailNotifier(doc){
  $(doc).click( this.goToInbox );
  this.update( doc );
  setInterval( function(){
    this.update(doc);
  }, 60*1000 );
}

GmailNotifier.prototype = {
  goToInbox: function(){
    Jetpack.tabs.open("http://mail.google.com");
    Jetpack.tabs[ Jetpack.tabs.length-1 ].focus();
  },
  
  update: function(doc){
    var url = "http://mail.google.com/mail/feed/atom";
    doc = $(doc);
    $.get( url, function(xml){
      var el = $(xml).find("fullcount"); // Unread message count

      if( el ){
        var count = el.get(0).textContent;
        doc.find("#count").text( count );
      }
      else{
        doc.find("#count").text( "Login" );
      }
    });
  }
}

Jetpack.statusBar.append({
  html: <>
    <img src="http://mail.google.com/mail/images/favicon.ico"/>
    <span id="count"></span>
  </>,
  onReady: function(doc){
    var gmail = new GmailNotifier(doc);
    $("#count", doc).css({
      position: "absolute",
      left: 4, top: 8,
      fontSize: "10px",
      cursor: "pointer",
      backgroundColor: "rgba(255,255,255,.8)"
    });
  },
  width: 20
});