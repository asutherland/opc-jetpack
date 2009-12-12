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
 *   Andrew Sutherland <asutherland@asutherland.org>
 *   Atul Varma <avarma@mozilla.com>
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

let EXPORTED_SYMBOLS = ["XULApp"];

const Ci = Components.interfaces;
const Cc = Components.classes;

let Application = Cc["@mozilla.org/fuel/application;1"] ?
                  Cc["@mozilla.org/fuel/application;1"]
                  .getService(Ci.fuelIApplication) :
                  Cc["@mozilla.org/steel/application;1"]
                  .getService(Ci.steelIApplication);

var XULAppProto = {
  get mostRecentAppWindow() {
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
             .getService(Ci.nsIWindowMediator);
    return wm.getMostRecentWindow(this.appWindowType);
  }
};

if (Application.name == "Firefox") {
  XULApp = {
    appWindowType: "navigator:browser",
    tabStripForWindow: function(aWindow) {
      return aWindow.document.getElementById("content").mStrip;
    },
    openTab: function(aUrl, aInBackground) {
      var window = this.mostRecentAppWindow;
      var tabbrowser = window.getBrowser();
      var tab = tabbrowser.addTab(aUrl);
      if (!aInBackground)
        tabbrowser.selectedTab = tab;
    },
    getBrowserFromContentWindow: function(aMainWindow, aWindow) {
      var browsers = aMainWindow.gBrowser.browsers;
      for (var i = 0; i < browsers.length; i++) {
        if (browsers[i].contentWindow == aWindow)
          return browsers[i];
      }
      return null;
    }
  };
} else if (Application.name == "Thunderbird") {
  XULApp = {
    appWindowType: "mail:3pane",
    tabStripForWindow: function (aWindow) {
      return aWindow.document.getElementById("tabmail").tabStrip;
    },
    openTab: function(aUrl, aInBackground) {
      var document = this.mostRecentAppWindow.document;
      document.getElementById('tabmail').openTab(
        'contentTab',
        {contentPage: aUrl,
         background: aInBackground}
      );
    },
    getBrowserFromContentWindow: function(aMainWindow, aWindow) {
      var tabmail = aMainWindow.document.getElementById("tabmail");
      var tabInfo = tabmail.tabInfo;

      for (var i = 0; i < tabInfo.length; ++i) {
        var browserFunc = (tabInfo[i].mode.getBrowser ||
                           tabInfo[i].mode.tabType.getBrowser);
        if (browserFunc) {
          var possBrowser = browserFunc.call(tabInfo[i].mode.tabType,
                                             tabInfo[i]);
          if (possBrowser && possBrowser.contentWindow == aWindow)
            return possBrowser;
        }
      }

      return null;
    }
  };
}

XULApp.Application = Application;
XULApp.__proto__ = XULAppProto;
