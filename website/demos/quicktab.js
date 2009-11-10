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
 * The Original Code is the Quicktab Jetpack feature.
 *
 * The Initial Developer of the Original Code is
 * Drew Willcoxon <adw@mozilla.com>
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Sean Martell (Quicktab icon) <http://www.seanmartell.com/>
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

// Manage tabs in the slidebar.

const QUICKTAB_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGXRFWHRTb2Z0\nd2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAs1JREFUeNrEV0trGlEUPhOt\nGUetteAivqINNXYREXVdcVfoMpA0XRZSUn9J/0FDs0k2XQTyA0IWxZW4sNSd\nNqgVkSBN6wufJLHn3M5ICo0zYzPjgTPHb9Rzv3vm3u/c4SaTCSzSjHoNxHHc\nCwwG9Ab6BUWc/JVRx8mGv+RybzBm0NPRWOwT3VzSkcBjujSbzb+qbxTLQ0Tc\n6BF0C93SYPAHs9aAGT2ZSqWSr3d2NgVBsGlUheJdBGjA1Vfb21vD4VAYjUa6\n7wITVYHneWGIg38rFqFWq4HX64VgMAiGJe2WipSZkz4XCgVwuVxgsVhYJCzZ\n92oVflxesqgEqyEwtSr+uVKpQDgchnw+z7BkNpsN+v0+i0rwXARcKyvgxpnn\ncjkIb2wwLFmn0wHBbGZRCZ5LCf2BAJRKJZakVC7D2tra9LuA38+i0+lUhNUQ\noIZww8potUIsGmWu5y74Sevv8OjoUGMduK2Ef1Y/dUOdlPAJ9oKXSCDjcDio\nFxzj2H1WAfxA5a+JrlU3fK9oFyzkPKDBI6BF3UP/il4XKwyyzSiRSCTf7e1t\nPlSjJP+wTrfb/bC/f5JOpx0IT0QyMwmwZvR2d3er1+sJA1Sz/7GbycRGuZBA\nWczdk1NC1oxQ/wUelax4fg6nZ2csmnhePYHra+olglhZk6pmRPrv8/nAioJE\nkbBktXodWqiQFGfhi0bjdn5OlRSXUX7H4zHE43HIZrOAjxOera+z7+x2O5No\nikrwXM3I43bDKs48k8lAPBZjWLJWqwVWbNMUleC5esFTPIDQGaDdbkMBDyah\nUGj6Y5/Hw+IjcYZ3YSIhLQcxtyyBMfoAd0CfX14WopEIkM99yjEYgHJRTjG3\nLIEunUU+Hhwc36cOUE4xtywBYvoZ920T/fSelXAgS0CPZqR4F2hov+iCrVjC\nV9PzgE4vp89FWSaVIonu0Mspt+jX898CDADbal+dftVjIwAAAABJRU5ErkJg\ngg==";

const DEFAULT_FAVICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0\nd2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAATVJREFUeNrMUztOw0AQnfVP\n3gIsIVk+A9dA4haJRRpCwg3ccQgqKkoKrkEqGgpSubXcOIUty9auHTODNtHG\nDliRKBjpaVc7M2/fG3tZ13XAGDMA4ApB60+xQXwghH5oaet5mqaverJtWyiK\nAoQQ8LZaPd7N5894/I7Y9gno5jPbtg+utCwL6rqGOI5hOpneb7KsjqJIKiVb\n6Em2qUEHERI8zwPOXVgslsub2ewaay8RjJqYmoGL+0lZlk9941VVQZZlkOc5\nSCmR0KnCMLxdrz9fMC0tvdg0zcHkOOcQBAH4vg9N00CSJBybqdAcEBjG8CPQ\n2W42pNZ13W+7OwsHBGgFfgvKkyIV3YDgmIKxOEnBsTj9yn+n4E8tSLTwQI9q\npCen2r1t9Ss7uL9QcEYIhHraBPElwACnOV2cu60DswAAAABJRU5ErkJggg==";

const CLOSE_TAB_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0\nd2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAjJJREFUeNqkUz2oUmEY1vOj\nGBp6JQxFcQjJdBCjoUAwcWpwKh0MiXAxRJukxUF0UBQRwSYnaXBw0SEcArcg\npAa5xMUWCcRcrqLeW+ccz7HnAy9c77kEcT94OO95v+f9ed7zHuVut1Pc5FCK\nGx7mqkOpVBLfU+AhYN+7J8BXYICOtwf8yxIoijoCUpIkHeH1N5IJxA8Oi4cG\nd6e4qwOnMgk0TTMqleotzNvJZPLMarWeIWBFYDabN6lU6pzcEQ7hyhJoNBo/\nMmvT6TRfr9d/9Pt92mazMQhmYKtqtdpJJpPhwdERrmwGJpPp8Ww2O2+325xe\nr/+SzWa/dbvd5whQut3uTrVa/dNqtWwMw4iEi5BPBzNAUBH2hvhYlmUSiUQn\nn8/T5L1YLPKVSuWFIAgiGQlmo10ul+8OOlCr1VtU44ksnU53C63fgX2yT37P\nYDBoFovFEsEiuKJMgsfjkUajkcJoNFKQIaHtRaFQMK7Xa7pUKq18Pp8QjUap\n+XwuOp1OUTZEv99PJs5GIhEV0Vwul/lGo/Eaul/lcjnR5XJ1wuEwC44qEAis\nZHuw2WyehEKhZ+PxWLJYLMeo9IDjOM1eHofBHU+nU7fD4aB6vd5HrVb7+eoi\n0ZPJ5E08Hr+LJCIqCfjeZOt2oiiymA+LYLrZbP6y2+3v4Rdlm0gWhef5l2jb\nNBgMtsPhkCNOr9erDgaDTCwWm2ORPsC1unaVLzoBHgH3L/0LP4HvwPCi8r8S\n/Nf5K8AA6TD1fj2VZVgAAAAASUVORK5CYII=";

jetpack.future.import("slideBar");

// Add our content to the slidebar.
jetpack.slideBar.append({
  onReady: function (slide) {

    function getTabIndex(tab) {
      return tabs.indexOf(tab);
    }

    function getTabFavicon(tab) {
      var favicon = tab.favicon || DEFAULT_FAVICON;
      return /^chrome:/.test(favicon) ? DEFAULT_FAVICON : favicon;
    }

    function getTabTitle(tab) {
      return tab.raw.label;
    }

    // Builds up some HTML for a widget corresponding to the tab.
    function makeTabWidget(tab) {
      var tabWidget = $("<div />", slide.contentDocument.body);
      tabWidget.addClass("tab");
      var favicon = $("<img />", slide.contentDocument.body);
      favicon.attr("src", getTabFavicon(tab));
      favicon.addClass("favicon");
      tabWidget.append(favicon);
      var closeIcon = $("<img />", slide.contentDocument.body);
      closeIcon.attr("src", CLOSE_TAB_ICON);
      closeIcon.addClass("closeButton");
      closeIcon.click(function () tab.close());
      tabWidget.append(closeIcon);
      var title = $("<div />", slide.contentDocument.body);
      title.addClass("title");
      title.text(getTabTitle(tab));
      tabWidget.append(title);
      tabWidget.mousedown(function (event) {
        if (!$(event.target).hasClass("closeButton"))
          tab.focus();
      });
      return tabWidget;
    }

    // Makes the closed tab's widget disappear.
    function onTabClosed(tab) {
      var tabIndex = getTabIndex(tab);
      var tabWidget = tabWidgets[tabIndex];
      if (tabWidget.hasClass("focused"))
        tabWidget.addClass("focusedClosing");
      tabWidgets.splice(tabIndex, 1);
      tabs.splice(tabIndex, 1);
      tabWidget.fadeOut(300, function () tabWidget.remove());
    }

    // Sets the focused class for the selected tab's widget.
    function onTabFocused(tab) {
      $(".focused", slide.contentDocument.body).removeClass("focused");
      tabWidgets[getTabIndex(tab)].addClass("focused");
    }

    // Appends a tab widget for the new tab.
    function onTabOpened(tab) {
      var tabWidget = makeTabWidget(tab);
      tabWidgets.push(tabWidget);
      tabs.push(tab);
      tabWidget.appendTo($("#tabList", slide.contentDocument.body)).
        fadeIn(500);
      $(slide.contentDocument.body).scrollTop(tabWidget.offset().top);
    }

    // Updates the tab widget's title and favicon.
    function onTabReady(tab) {
      var tabWidget = tabWidgets[getTabIndex(tab)];
      $(".title", tabWidget).text(getTabTitle(tab));
      setTimeout(function () {
        $(".favicon", tabWidget).attr("src", getTabFavicon(tab));
      }, 3000);
    }

    // These are parallel arrays.  tabs holds jetpack.tabs objects, and
    // tabWidgets holds their corresponding tab widgets.  We can't just use
    // jetpack.tabs directly because on tab close we need to be able to lookup
    // the tab's widget, and the tab is gone from jetpack.tabs by that time.
    var tabs = []
    var tabWidgets = [];

    // Initialize everything.
    jetpack.tabs.forEach(function (tab) onTabOpened(tab));
    onTabFocused(jetpack.tabs.focused);

    // Setup event handlers.  |this| is the Jetpack tab object.  Pretty cool.
    jetpack.tabs.onClose(function () onTabClosed(this));
    jetpack.tabs.onFocus(function () onTabFocused(this));
    jetpack.tabs.onOpen(function () onTabOpened(this));
    jetpack.tabs.onReady(function () onTabReady(this));

    // Open a new, focused tab on double-click.
    $(slide.contentDocument).dblclick(function (event) {
      if (event.target.localName === "HTML")
        jetpack.tabs.open("about:blank").focus();
    });
  },

  // This automagically becomes our slidebar's icon.
  icon: QUICKTAB_ICON,
  width: 300,
  persist: true,

  // This automagically becomes our slidebar's content.
  html: <>
    <style><![CDATA[
      body {
        font-family: sans-serif;
        font-size:   10pt;
        overflow-x:  hidden;
      }
      div.tab {
        background-color:   rgba(255, 255, 255, 0.3);
        position:           relative;
        padding:            0.3em 6px;
        margin:             0.75em 10px 0.75em 0;
        -moz-border-radius: 5px;
        cursor:             pointer;
      }
      div.tab.focused, div.tab.focusedClosing {
        background-color: rgba(255, 255, 255, 0.8);
        font-weight:      bold;
        margin-right:    -20px;
        padding-right:    30px;
      }
      div.tab:hover {
        background-color: rgba(255, 255, 255, 0.6);
      }
      div.tab.focused:hover, div.tab.focusedClosing:hover {
        background-color: rgba(255, 255, 255, 0.9);
      }
      img.favicon {
        width:       16px;
        height:      16px;
        position:    absolute;
        top:         50%;
        float:       left;
        margin-top: -8px;
        opacity:     0.7;
      }
      div.tab:hover img.favicon,
      div.tab.focused img.favicon,
      div.tab.focusedClosing img.favicon {
        opacity: 1;
      }
      div.title {
        margin-left: 24px;
      }
      img.closeButton {
        display: none;
      }
      div.tab:hover img.closeButton {
        display:   block;
        position:  absolute;
        top:      -5px;
        right:    -5px;
      }
      div.tab.focused:hover img.closeButton {
        right: 25px;
      }
    ]]></style>
    <body><div id="tabList"></div></body>
  </>
});
