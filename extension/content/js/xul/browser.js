(function() {
   var jsm = {};
   Components.utils.import("resource://jetpack/modules/setup.js", jsm);
   jsm.JetpackSetup.createServices();
   jsm.JetpackSetup.installToWindow(window);
 })();
