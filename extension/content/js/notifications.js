function Notifications() {
  MemoryTracking.track(this);

  this.show = function(message) {
    var body = message;
    var title = "Jetpack Notification";
    var icon = "chrome://jetpack/content/gfx/jetpack_icon.png";

    if (typeof(message) == "object") {
      body = message.body;

      if (message.title)
        title = message.title;

      if (message.icon)
        icon = message.icon;
    }

    try {
      var classObj = Cc["@mozilla.org/alerts-service;1"];
      var alertService = classObj.getService(Ci.nsIAlertsService);

      alertService.showAlertNotification(icon, title, body);
      return true;
    } catch (e) {
      console.log("Unable to display notification:", message);
      return false;
    }
  };
}
