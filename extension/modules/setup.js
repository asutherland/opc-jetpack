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

var Jetpack = {};
Components.utils.import("resource://jetpack/modules/jetpack_feed_plugin.js",
                        Jetpack);

var Cc = Components.classes;
var Ci = Components.interfaces;

let Application = Components.classes["@mozilla.org/fuel/application;1"]
                  .getService(Components.interfaces.fuelIApplication);

let gServices;

const ANN_DB_FILENAME = "jetpack_ann.sqlite";

let JetpackSetup = {
  __getExtDir: function __getExtDir() {
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
    let extDir = this.__getExtDir();
    let baseUri = ioSvc.newFileURI(extDir).spec;

    return baseUri;
  },

  isInstalledAsXpi: function isInstalledAsXpi() {
    let profileDir = Cc["@mozilla.org/file/directory_service;1"]
                     .getService(Components.interfaces.nsIProperties)
                     .get("ProfD", Components.interfaces.nsIFile);
    let extDir = this.__getExtDir();
    if (profileDir.contains(extDir, false))
      return true;
    return false;
  },

  createServices: function createServices() {
    if (!gServices) {
      var annDbFile = AnnotationService.getProfileFile(ANN_DB_FILENAME);
      var annDbConn = AnnotationService.openDatabase(annDbFile);
      var annSvc = new AnnotationService(annDbConn);

      var feedManager = new FeedManager(annSvc);
      var jpfp = new Jetpack.FeedPlugin(feedManager, null);

      gServices = {feedManager: feedManager};

      this.__setupFinalizer();
    }

    return gServices;
  },

  get version() {
    return Application.extensions.get("jetpack@labs.mozilla.com").version;
  }
};
