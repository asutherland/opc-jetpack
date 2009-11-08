/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et: */
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
 * Mozilla Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Drew Willcoxon <adw@mozilla.com> (Original Author)
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

var MenuTests = {

  // Helpers //////////////////////////////////////////////////////////////////

  // Ensures that popup contains the specified number of children (count) with
  // the given targetLabel.
  _assertPopupContains: function (runner, popup, targetLabel, count) {
    var foundCount = 0;
    var nodes = this._childNodes(popup);
    for (var i = 0; i < nodes.length; i++)
      if (nodes[i].getAttribute("label") === targetLabel)
        foundCount++;
    runner.assertEqual(foundCount, count,
                       "Popup should contain expected number of target items");
  },

  // Asserts that the labels of menu.items match the values in expectedItems,
  // which may be strings, functions that return strings, or objects with a
  // label member.
  _assertItemsMatch: function (runner, menu, expectedItems) {
    runner.assertEqual(menu.items.length, expectedItems.length,
      "menu.items should be of expected length");
    for (var i = 0; i < menu.items.length; i++) {
      var label = typeof(expectedItems[i]) === "function" ?
                  expectedItems[i]() :
                  (expectedItems[i].label || expectedItems[i]);
      runner.assertEqual(menu.items[i].label, label,
                         "menu.items[" + i + "] should match expected item");
    }
  },

  // Returns the test's browser window.
  _browserWindow: function () {
    return Cc["@mozilla.org/appshell/window-mediator;1"].
             getService(Ci.nsIWindowMediator).
             getMostRecentWindow("navigator:browser");
  },

  // Returns popup.childNodes sans hidden children.
  _childNodes: function (popup) {
    var nodes = [];
    for (var i = 0; i < popup.childNodes.length; i++) {
      if (!popup.childNodes[i].hidden)
        nodes.push(popup.childNodes[i]);
    }
    return nodes;
  },

  // Returns the browser's content context menu, a XUL menupopup.
  _contentContextMenupopup: function () {
    return this._browserWindow().document.
             getElementById("contentAreaContextMenu");
  },

  // The object that the menu module exports.
  _exports: (function (self) {
    if (!self.__exports) {
      var s = {};
      Components.utils.import("resource://jetpack/modules/menu.js", s);
      self.__exports = s.exports;
    }
    return self.__exports;
  })(this),

  // Returns an object that simulates a JetpackRuntime.Context object.
  _makeFeatureContext: function () {
    return {
      id: "MenuTests",
      unloaders: [],
      addUnloader: function (unloader) {
        this.unloaders.push(unloader);
      },
      removeUnloader: function (unloader) {
        var idx = this.unloaders.indexOf(unloader);
        if (idx >= 0)
          this.unloaders.splice(idx, 1);
      },
      unload: function () {
        while (this.unloaders.length > 0)
          this.unloaders.pop().unload();
      }
    };
  },

  // Helper for running a test inside a context.  func is applied to |this| as
  // func(context, menuNamespace, MenuConstructor, this).
  _run: function (func) {
    var context = this._makeFeatureContext();
    func.call(this, context, this._exports.menu(context),
              this._exports.Menu(context), this);
    context.unload();
  },

  // Shows the content context menu in the currently visible page.
  _showContentContextMenu: function () {
    // We can't just openPopup() the menupopup.  Our menu code sniffs for
    // contextmenu events, so dispatch one.
    this._browserWindow().content.
      QueryInterface(Components.interfaces.nsIInterfaceRequestor).
      getInterface(Components.interfaces.nsIDOMWindowUtils).
      sendMouseEvent("contextmenu", 0, 0, 2, 1, 0);
  },


  // Tests ////////////////////////////////////////////////////////////////////

  // Menu initialized from an array should contain correct items.
  testMenuInitArray: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var items = ["a", { label: "b" }, function () "c"];
      var menu = new Menu(items);
      this._assertItemsMatch(runner, menu, items);
    });
  },

  // Menu initialized from an object should contain correct items.
  testMenuInitObject: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var items = ["a", { label: "b" }, function () "c"];
      var menu = new Menu({ items: items });
      this._assertItemsMatch(runner, menu, items);
    });
  },

  // Menu.add() should cause menu to contain correct items.
  testMenuAdd: function (runner) {
    this._run(function (context, menuNs, Menu, self) {
      function add(item, expected) {
        menu.add(item);
        self._assertItemsMatch(runner, menu, expected);
      }
      var menu = new Menu();
      add("a", ["a"]);
      add({ label: "b" }, ["a", "b"]);
      add(["c", function () "d"], ["a", "b", "c", "d"]);
    });
  },

  // Menu.remove() should cause menu to contain correct items.
  testMenuRemove: function (runner) {
    this._run(function (context, menuNs, Menu, self) {
      function remove(target, expected) {
        menu.remove(target);
        self._assertItemsMatch(runner, menu, expected);
      }
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      remove("b", ["a", "c", "d"]);
      remove("d", ["a", "c"]);
      remove("a", ["c"]);
      remove("c", []);
    });
  },

  // Menu.replace() should cause menu to contain correct items.
  testMenuReplace: function (runner) {
    this._run(function (context, menuNs, Menu, self) {
      function replace(target, newItems, expected) {
        menu.replace(target, newItems);
        self._assertItemsMatch(runner, menu, expected);
      }
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      replace("b", "e", ["a", "e", "c", "d"]);
      replace("c", ["f", "g"], ["a", "e", "f", "g", "d"]);
    });
  },

  // Menu.insertBefore() should cause menu to contain correct items.
  testMenuInsertBefore: function (runner) {
    this._run(function (context, menuNs, Menu, self) {
      function insertBefore(newItems, target, expected) {
        menu.insertBefore(newItems, target);
        self._assertItemsMatch(runner, menu, expected);
      }
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      insertBefore("before c", "c", ["a", "b", "before c", "c", "d"]);
      insertBefore(["before a 1", "before a 2"], "a",
        ["before a 1", "before a 2", "a", "b", "before c", "c", "d"]);
      insertBefore("end", null,
        ["before a 1", "before a 2", "a", "b", "before c", "c", "d", "end"]);
    });
  },

  // Menu.clear() should cause menu to contain correct items.
  testMenuClear: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      menu.clear();
      this._assertItemsMatch(runner, menu, []);
    });
  },

  // Menu.reset() should cause menu to contain correct items.
  testMenuReset: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      menu.reset();
      this._assertItemsMatch(runner, menu, []);
    });
  },

  // Menu.set() should cause menu to contain correct items.
  testMenuSet: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      var newItems = ["x", "y", "z"];
      menu.set(newItems);
      this._assertItemsMatch(runner, menu, newItems);
    });
  },

  // Menu.item() should return correct items.
  testMenuItem: function (runner) {
    this._run(function (context, menuNs, Menu) {
      function item(target, expectedLabel) {
        var i = menu.item(target);
        runner.assertEqual(!!i, !!expectedLabel,
          "Retrieved Menuitem should exist as expected");
        if (expectedLabel)
          runner.assertEqual(i.label, expectedLabel,
            "Retrieved Menuitem's label should be what's expected");
      }
      var menu = new Menu(["first", { label: "SECOND" }, "Third"]);
      item("first", "first");
      item("f", "first");
      item("F", "first");
      item("i", "first");
      item("I", "first");
      item(/i/, "first");
      item(/first/, "first");
      item("sec", "SECOND");
      item(0, "first");
      item(1, "SECOND");
      item(2, "Third");
      item(-3, "first");
      item(-2, "SECOND");
      item(-1, "Third");
      item("bogus", null);
      item(/bogus/, null);
      item(3, null);
      item(-4, null);
   });
  },

  // Menu initialized with a falsey value should contain correct items,
  // including a separator.
  testMenuSeparator: function (runner) {
    this._run(function (context, menuNs, Menu) {
      function test(separator) {
        var menu = new Menu(["a", separator, "c"]);
        runner.assertEqual(menu.item(1).type, "separator",
                           "Menuitem should be a separator");
      }
      [null, undefined, "", false, { type: "separator" }].
        forEach(function (i) test(i));
    });
  },

  // Menu.show(), Menu.hide(), Menu.beforeShow(), and Menu.beforeHide() should
  // work correctly.
  testMenuShowHide: function (runner) {
    runner.setTimeout(5000, "testMenuShowHide popup should not time out");
    this._run(function (context, menuNs, Menu, self) {
      var win = this._browserWindow();
      var doc = win.document;
      var label1 = "testMenuShowHide";
      var label2 = "It worked!";
      var m = new Menu({
        items: [label1],
        beforeShow: function (menu) {
          runner.assertEqual(menu, this, "menu should be this Menu");
          runner.assertEqual(this, m, "this Menu should be declared menu");
          self._assertItemsMatch(runner, menu, [label1]);
          win.setTimeout(function () {
            self._assertItemsMatch(runner, menu, [label1]);
            menu.set(label2);
            self._assertItemsMatch(runner, menu, [label2]);
            menu.hide();
            self._assertItemsMatch(runner, menu, [label2]);
          }, 100);
        },
        beforeHide: function (menu) {
          runner.assertEqual(menu, this, "menu should be this Menu");
          runner.assertEqual(this, m, "this Menu should be declared menu");
          win.setTimeout(function () {
            self._assertItemsMatch(runner, menu, [label2]);
            menu.add(label1);
            self._assertItemsMatch(runner, menu, [label2, label1]);
            runner.success();
          }, 200);
        }
      });
      m.show(doc.getElementById("stop-button"));
    });
  },

  // Command function of a Menuitem should be triggered and work correctly.
  testMenuCommand: function (runner) {
    runner.setTimeout(5000, "testMenuCommand popup should not time out");
    this._run(function (context, menuNs, Menu, self) {
      var win = this._browserWindow();
      var doc = win.document;
      var item = {
        label: "testMenuCommand",
        command: function (clickedItem) {
          runner.assertEqual(clickedItem.label, this.label,
                             "clickedItem should be this Menuitem");
          runner.assertEqual(this.label, item.label,
                             "this Menuitem should be declared item");
          m.hide();
          runner.success();
        }
      };
      var m = new Menu([item]);
      win.addEventListener("popupshown", function popupshown(event) {
        win.removeEventListener("popupshown", popupshown, true);
        var popup = event.target;
        var childNodes = self._childNodes(popup);
        runner.assertEqual(childNodes.length, 1,
                           "Popup should have expected number of children");
        childNodes[0].click();
      }, true);
      m.show(doc.getElementById("stop-button"));
    });
  },

  // Command function of a Menuitem with a submenu should be triggered and work
  // correctly.
  testMenuCommandBubble: function (runner) {
    runner.setTimeout(5000, "testMenuCommandBubble should not time out");
    this._run(function (context, menuNs, Menu, self) {
      var win = this._browserWindow();
      var doc = win.document;
      var submenuitemLabel = "Submenu click";
      var item = {
        label: "testMenuCommandBubble",
        menu: new Menu([submenuitemLabel]),
        command: function (clickedItem) {
          runner.assertEqual(clickedItem.label, submenuitemLabel,
                             "clickedItem should be this Menuitem");
          runner.assertEqual(this.label, item.label,
                             "this Menuitem should be declared item");
          m.hide();
          runner.success();
        }
      };
      var m = new Menu([item]);
      win.addEventListener("popupshown", function popupshown(event) {
        win.removeEventListener("popupshown", popupshown, true);
        var popup = event.target;
        var childNodes = self._childNodes(popup);
        runner.assertEqual(childNodes.length, 1,
                           "Popup should have expected number of children");
        var xulMenu = childNodes[0];
        xulMenu.open = true;
        var subpopup = xulMenu.childNodes[0];
        childNodes = self._childNodes(subpopup);
        runner.assertEqual(childNodes.length, 1,
                           "Subpopup should have expected number of children");
        var subpopupItem = childNodes[0];
        subpopupItem.click();
      }, true);
      m.show(doc.getElementById("stop-button"));
    });
  },

  // Modifications to menus from beforeShow() should be correctly applied.
  testBeforeShow: function (runner) {
    runner.setTimeout(5000, "testBeforeShow should not time out");
    this._run(function (context, menuNs, Menu, self) {
      var label = "testBeforeShow";
      var m = new Menu({
        beforeShow: function (menu) {
          menu.add({
            label: label,
            command: function () {
              menu.hide();
              runner.success();
            }
          });
        }
      });
      var win = this._browserWindow();
      var doc = win.document;
      win.addEventListener("popupshown", function popupshown(event) {
        win.removeEventListener("popupshown", popupshown, true);
        var popup = event.target;
        var childNodes = self._childNodes(popup);
        runner.assertEqual(childNodes.length, 1,
                           "Popup should have expected number of children");
        var item = childNodes[0];
        runner.assertEqual(item.getAttribute("label"), label,
                           "Popup should contain expected item");
        item.click();
      }, true);
      m.show(doc.getElementById("stop-button"));
    });
  },

  // Modifications to context menus from beforeShow() should be correctly
  // applied.
  testContextMenuBeforeShow: function (runner) {
    runner.setTimeout(5000, "testContextMenuBeforeShow should not time out");
    this._run(function (context, menuNs, Menu, self) {
      menuNs.context.page.beforeShow = function (m) {
        var label = "testContextMenuBeforeShow";
        m.add(label);
        var popup = self._contentContextMenupopup();
        self._assertPopupContains(runner, popup, label, 1);

        // Be sure to hide the popup.  Popups can't be hidden inside a
        // popupshowing event, apparently, so use a timeout.
        self._browserWindow().content.setTimeout(function () {
          m.hide();
          var bo = popup.boxObject.QueryInterface(Ci.nsIPopupBoxObject);
          runner.assertEqual(bo.popupState, "closed",
                             "m.hide() should have worked, context menu " +
                             "should now be closed");
          runner.success();
        }, 0);
      };
      self._showContentContextMenu();
    });
  }
};
