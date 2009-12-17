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

let EXPORTED_SYMBOLS = ["FeedPlugin", "FeedManager"];

var UrlUtils = {};
Components.utils.import("resource://jetpack/modules/url_utils.js",
                        UrlUtils);
Components.utils.import("resource://jetpack/modules/xulapp.js");

var Cc = Components.classes;
var Ci = Components.interfaces;

const CONFIRM_URL = "chrome://jetpack/content/confirm-add-jetpack.html";
const TYPE = "jetpack";
const TRUSTED_DOMAINS_PREF = "extensions.jetpack.trustedDomains";

var FeedManager = null;

function FeedPlugin(feedManager) {
  if (!FeedManager)
    FeedManager = feedManager;
  else
    Components.utils.reportError("FeedManager already defined.");

  this.type = TYPE;

  this.onSubscribeClick = function DFP_onSubscribeClick(targetDoc,
                                                        commandsUrl,
                                                        mimetype,
                                                        name) {
    // Clicking on "subscribe" takes them to the warning page:
    if (!name)
      name = targetDoc.title;

    var confirmUrl = (CONFIRM_URL + "?url=" +
                      encodeURIComponent(targetDoc.location.href) +
                      "&sourceUrl=" + encodeURIComponent(commandsUrl) +
                      "&title=" + encodeURIComponent(name));

    function isTrustedUrl(commandsUrl, mimetype) {
      // Even if the command feed resides on a trusted host, if the
      // mime-type is application/x-javascript-untrusted, the host
      // itself doesn't trust it (perhaps because it's mirroring code
      // from somewhere else).

      if (mimetype == "application/x-javascript-untrusted")
        return false;

      var url = UrlUtils.url(commandsUrl);

      if (url.scheme == "chrome")
        return true;

      if (url.scheme != "https")
        return false;

      var domains = XULApp.Application.prefs.getValue(TRUSTED_DOMAINS_PREF,
                                                      "");
      domains = domains.split(",");

      for (var i = 0; i < domains.length; i++) {
        if (domains[i] == url.host)
          return true;
      }

      return false;
    }

    if (isTrustedUrl(commandsUrl, mimetype)) {
      function onSuccess(data) {
        feedManager.addSubscribedFeed({url: targetDoc.location.href,
                                       title: name,
                                       sourceUrl: commandsUrl,
                                       canAutoUpdate: true,
                                       sourceCode: data,
                                       type: TYPE});
        // The first-run page will now be triggered by the new subscription.
      }

      if (UrlUtils.isRemote(commandsUrl)) {
        var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                  .createInstance(Ci.nsIXMLHttpRequest);
        req.mozBackgroundRequest = true;
        req.open('GET', commandsUrl, true);
        req.overrideMimeType("text/plain");
        req.onreadystatechange = function() {
          if (req.readyState == 4 &&
              req.status == 200)
            onSuccess(req.responseText);
        };
        req.send(null);
      } else
        onSuccess("");
    } else
      XULApp.openTab(confirmUrl);
  };

  this.makeFeed = function DFP_makeFeed(baseFeedInfo, hub) {
    return new Feed(baseFeedInfo, hub);
  };

  feedManager.registerPlugin(this);
}

function Feed(feedInfo, hub) {
  if (UrlUtils.isLocal(feedInfo.srcUri))
    this.canAutoUpdate = true;

  let self = this;

  self.nounTypes = [];
  self.commands = [];
  self.pageLoadFuncs = [];

  this.refresh = function refresh() {
  };

  this.checkForManualUpdate = function checkForManualUpdate(cb) {
  };

  this.broadcastChangeEvent = function broadcastChangeEvent() {
    hub.notifyListeners("feed-change", feedInfo.uri);
  };

  this.__proto__ = feedInfo;
}
