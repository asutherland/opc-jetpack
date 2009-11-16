/*
	@author: James Nisbet
	@url: http://www.bandit.co.nz
	@update: http://lab.bandit.co.nz/scripts/jetpack/bandit-gmail.js
	@title: Jetpack Gmail Checker
	@description: Jetpack Gmail checker, adapted from Aza Raskin's example script
	@license: MPL
*/

function GmailNotifier(doc){
	$(doc).click( this.goToInbox );
}

GmailNotifier.prototype = {
	goToInbox: function() {
		jetpack.tabs.open("http://mail.google.com");
		jetpack.tabs[ jetpack.tabs.length-1 ].focus();
	},

	update: function(doc) {
		doc = $(doc); self = this; // juggling name spaces
		$.get( self.url, function(xml) {
			var el = $(xml).find("fullcount"); // unread message count
			
			if( el ){
				var newcount = parseInt(el.get(0).textContent);
				if(newcount>self.count) {
					var sender = $(xml).find("name").get(0).textContent;
					self.notify("New message from "+sender);
				}
				self.count = newcount;
				doc.find("#count").text( self.count );
			}
			else {
				doc.find("#count").text( "Login" );
				self.notify("Please login to Gmail");
			}
		});
	},
	
	notify: function(msg) {
		jetpack.notifications.show({
			title: "Gmail",
			body: msg,
			icon: "http://mail.google.com/mail/images/favicon.ico"
		});
	},
	
	count: 0,
	url: "http://mail.google.com/mail/feed/atom"
}

jetpack.statusBar.append({
	html: <>
		<img src="http://mail.google.com/mail/images/favicon.ico"/>
		<span id="count"></span>
		</>,
	onReady: function(doc) {
		var gmail = new GmailNotifier(doc);
		$("#count", doc).css({
			position: "absolute",
			fontFamily: "Tahoma, Arial, sans-serif",
			left: 0, top: 0,
			display: "block",
			textAlign: "center",
			fontSize: "10px",
			cursor: "pointer",
			"text-shadow": "0 0 1px white",
			fontWeight: "bold",
			fontSize: "5pt"
		});
		gmail.update(doc);
		setInterval( function() { gmail.update(doc) }, 60*1000 );
<<<<<<< local
	},
	width: 16
=======
	}
>>>>>>> other
});