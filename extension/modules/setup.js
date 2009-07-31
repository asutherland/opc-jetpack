/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Ubiquity.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

EXPORTED_SYMBOLS = ["JetpackSetup"];

Components.utils.import("resource://jetpack/ubiquity-modules/utils.js");
Components.utils.import("resource://jetpack/ubiquity-modules/feedmanager.js");
Components.utils.import("resource://jetpack/ubiquity-modules/annotation_memory.js");

var Extension = {};
Components.utils.import("resource://jetpack/modules/init.js", Extension);

var Jetpack = {};
Components.utils.import("resource://jetpack/modules/jetpack_feed_plugin.js",
                        Jetpack);

var Cc = Components.classes;
var Ci = Components.interfaces;

let Application = Cc["@mozilla.org/fuel/application;1"] ?
                  Cc["@mozilla.org/fuel/application;1"]
                    .getService(Ci.fuelIApplication) :
                  Cc["@mozilla.org/steel/application;1"]
                    .getService(Ci.steelIApplication);

let gServices;

const VERSION_PREF ="extensions.jetpack.lastversion";
const ANN_DB_FILENAME = "jetpack_ann.sqlite";

let JetpackSetup = {
  isNewlyInstalledOrUpgraded: false,
  _wasWelcomePageShownAtStartup: false,

  getExtensionDirectory: function getExtensionDirectory() {
    let extMgr = Cc["@mozilla.org/extensions/manager;1"]
                 .getService(Components.interfaces.nsIExtensionManager);
    let loc = extMgr.getInstallLocation("jetpack@labs.mozilla.com");
    let extDir = loc.getItemLocation("jetpack@labs.mozilla.com");

    return extDir;
  },

  __setupFinalizer: function __setupFinalizer() {
    var observer = {
      observe: function(subject, topic, data) {
        gServices.feedManager.finalize();
      }
    };

    var observerSvc = Cc["@mozilla.org/observer-service;1"]
                      .getService(Ci.nsIObserverService);
    observerSvc.addObserver(observer, "quit-application", false);
  },

  getBaseUri: function getBaseUri() {
    let ioSvc = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);
    let extDir = this.getExtensionDirectory();
    let baseUri = ioSvc.newFileURI(extDir).spec;

    return baseUri;
  },

  isInstalledAsXpi: function isInstalledAsXpi() {
    let profileDir = Cc["@mozilla.org/file/directory_service;1"]
                     .getService(Components.interfaces.nsIProperties)
                     .get("ProfD", Components.interfaces.nsIFile);
    let extDir = this.getExtensionDirectory();
    if (profileDir.contains(extDir, false))
      return true;
    return false;
  },

  get version() {
    return Application.extensions.get("jetpack@labs.mozilla.com").version;
  },

  createServices: function createServices() {
    if (!gServices) {
      // Compare the version in our preferences from our version in the
      // install.rdf.
      var currVersion = Application.prefs.getValue(VERSION_PREF, "firstrun");
      if (currVersion != this.version) {
        Application.prefs.setValue(VERSION_PREF, this.version);
        this.isNewlyInstalledOrUpgraded = true;
      }

      // Allow JS chrome errors to show up in the error console.
      Application.prefs.setValue("javascript.options.showInConsole", true);

      var annDbFile = AnnotationService.getProfileFile(ANN_DB_FILENAME);
      var annDbConn = AnnotationService.openDatabase(annDbFile);
      var annSvc = new AnnotationService(annDbConn);

      var feedManager = new FeedManager(annSvc);
      var jpfp = new Jetpack.FeedPlugin(feedManager, null);

      gServices = {feedManager: feedManager};

      Extension.load("about:jetpack");

      // We might need to do some bootstrapping on first run
      if (currVersion == "firstrun")
        this._bootstrap();

      this.__setupFinalizer();
    }

    return gServices;
  },

  installToWindow: function installToWindow(window) {
    gServices.feedManager.installToWindow(window);

    // Show the welcome page if we need to.
    if (this.isNewlyInstalledOrUpgraded &&
        !this._wasWelcomePageShownAtStartup) {
      this._wasWelcomePageShownAtStartup = true;
      window.addEventListener(
        "load",
        function onWindowLoad() {
          window.removeEventListener("load", onWindowLoad, false);
          // If we're Thunderbird, do things slightly differently...
          if (Application.name == "Thunderbird") {
            window.document.getElementById("tabmail")
              .openTab("contentTab", {contentPage: "about:jetpack"});
          }
          else {
            var tabbrowser = window.getBrowser();
            var tab = tabbrowser.addTab("about:jetpack");
            tabbrowser.selectedTab = tab;
          }
        },
        false
      );
    }
  },

  _bootstrap: function _bootstrap() {
    // Figure out what Feature page linked to the Jetpack install
    let query = Cc["@mozilla.org/browser/nav-history-service;1"].
      getService(Ci.nsPIPlacesDatabase).DBConnection.createStatement(
        "SELECT url FROM moz_places WHERE id = (" +
          "SELECT place_id FROM moz_historyvisits WHERE id = (" +
            "SELECT from_visit FROM moz_historyvisits WHERE place_id = (" +
              "SELECT id FROM moz_places WHERE url = :url) " +
            "ORDER BY id DESC LIMIT 1))");
    query.params.url = "https://jetpack.mozillalabs.com/install.html";
    if (!query.executeStep())
      return;

    // Load the Feature page in the hidden window to get the Feature <link>
    let hiddenDoc = Cc["@mozilla.org/appshell/appShellService;1"].
      getService(Ci.nsIAppShellService).hiddenDOMWindow.document.documentElement;
    let iframe = hiddenDoc.ownerDocument.createElement("iframe");
    iframe.addEventListener("DOMContentLoaded", function getFeature(event) {
      // Clean up now that we've been triggered
      iframe.removeEventListener("DOMContentLoaded", getFeature, false);
      iframe.parentNode.removeChild(iframe);

      // Look for the first Jetpack Feature <link>
      Array.some(event.target.getElementsByTagName("link"), function(link) {
        if (link.rel != "jetpack")
          return false;

        // Fetch the contents of the Feature
        let req = new hiddenDoc.ownerDocument.defaultView.XMLHttpRequest();
        req.open("GET", link.href, false);
        req.overrideMimeType("text/plain; charset=x-user-defined");
        req.send(null);
        if (req.status != 200 && req.status != 0)
          return false;

        // Auto-subscribe to the Feature
        gServices.feedManager.addSubscribedFeed({
          canAutoUpdate: true,
          sourceCode: req.responseText,
          sourceUrl: link.href,
          title: link.getAttribute("name") || event.target.title,
          type: "jetpack",
          url: query.row.url
        });
        return true;
      });
    }, false);
    iframe.setAttribute("type", "content");
    iframe.setAttribute("src", query.row.url);
    hiddenDoc.appendChild(iframe);
  }
};
