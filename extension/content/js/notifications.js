function Notifications() {
  MemoryTracking.track(this);

  this.show = function(message) {
    var body = message;
    var title = Application.name + " Notification";
    var icon = null;

    if (typeof(message) == "object") {
      body = message.body;

      if ("title" in message)
        title = message.title;

      if ("icon" in message)
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
