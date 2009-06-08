(function() {
   var jsm = {};
   Components.utils.import("resource://jetpack/modules/setup.js", jsm);
   jsm.JetpackSetup.createServices();
   jsm.JetpackSetup.installToWindow(window);

   window.addEventListener(
     "load",
     function onLoad(event) {
       if (event.originalTarget == window.document) {
         window.removeEventListener("load", onLoad, false);
         // Kind of silly that we're setting a flag on the window
         // to tell clients whether it's done loading or not, but
         // I'm not sure what other way there is... -AV
         window.gIsDoneLoading = true;
       }
     },
     false
   );
 })();
