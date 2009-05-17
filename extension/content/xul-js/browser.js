(function() {
   var jsm = {};
   Components.utils.import("resource://jetpack/modules/setup.js", jsm);
   var services = jsm.JetpackSetup.createServices();
   services.feedManager.installToWindow(window);
 })();
