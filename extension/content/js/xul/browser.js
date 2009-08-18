(function() {
   var jsm = {};
   Components.utils.import("resource://jetpack/modules/setup.js", jsm);
   jsm.JetpackSetup.createServices();
   jsm.JetpackSetup.installToWindow(window);

   window.gJetpack = {
     openAboutPage: function(enableSafeMode) {
       if (enableSafeMode) {
         var Extension = {};
         Components.utils.import("resource://jetpack/modules/init.js",
                                 Extension);
         // Making it look like about:jetpack was just loaded will
         // force the page into safe mode when it loads.
         Extension.sessionStorage.lastVisibleLoad = new Date();
       }
       JetpackAppNuances.openTab('about:jetpack', false);
     }
   };

   window.addEventListener(
     "load",
     function onLoad(event) {
       if (event.originalTarget == window.document) {
         window.removeEventListener("load", onLoad, false);
         // Kind of silly that we're setting a flag on the window
         // to tell clients whether it's done loading or not, but
         // I'm not sure what other way there is, at least until
         // document.readyState is available in Gecko 1.9.2.
         window.gIsDoneLoading = true;
       }
     },
     false
   );
 })();
