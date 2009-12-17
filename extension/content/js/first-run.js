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
 * The Original Code is Mozilla Jetpack.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Drew Willcoxon <adw@mozilla.com>
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

function closeWindow() {
  window.close();
}

// Returns a dictionary containing the URL's query parameters.
function urlParams() {
  return document.URL.split("?")[1].split("&").reduce(function (dict, pairStr) {
    let pair = pairStr.split("=");
    dict[pair[0]] = decodeURIComponent(pair[1]);
    return dict;
  }, {});
}

$(window).ready(function onready() {
  let params = urlParams();
  let title = params.title || "The feature";
  let contentUri = params.contentUri;

  // Set the embedded iframe's src to a default URI if none was specified.
  if (!contentUri) {
    contentUri = "chrome://jetpack/content/first-run-default.html";

    // Let the default iframe content close the outer page.  jQuery can't seem
    // to handle load events on iframes, so use the DOM API.
    let iframe = $("#featureContent")[0];
    iframe.addEventListener("load", function onIframeLoad() {
      iframe.removeEventListener("load", onIframeLoad, true);
      let win = iframe.contentWindow.wrappedJSObject;
      win.closeWindow = closeWindow;
    }, true);
  }
  else
    $("#bannerSubheading").show();

  $("#featureContent").attr("src", contentUri);
  $("title").text("Jetpack: Installed " + title);
  $("#featureName").text(title);
  $("body").fadeIn();
});
