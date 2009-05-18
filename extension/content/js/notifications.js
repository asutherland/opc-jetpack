function Notifications() {
  MemoryTracking.track(this);
  
  this.show = function(message) {
    var text = message;
    var title = "Jetpack Notification";
    var icon = "http://www.mozilla.com/favicon.ico";

    if (typeof(message) == "object") {
      text = message.text;

      if (message.title)
        title = message.title;

      if (message.icon)
        icon = message.icon;
    }

    try {
      var classObj = Cc["@mozilla.org/alerts-service;1"];
      var alertService = classObj.getService(Ci.nsIAlertsService);

      alertService.showAlertNotification(icon, title, text);
      return true;
    } catch (e) {
      console.log("Unable to display notification:", message);
      return false;
    }
  };
}
