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


  // Tests ////////////////////////////////////////////////////////////////////

  testMenuInitArray: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var items = ["a", { label: "b" }, function () "c"];
      var menu = new Menu(items);
      this._assertItemsMatch(runner, menu, items);
    });
  },

  testMenuInitObject: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var items = ["a", { label: "b" }, function () "c"];
      var menu = new Menu({ items: items });
      this._assertItemsMatch(runner, menu, items);
    });
  },

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

  testMenuClear: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      menu.clear();
      this._assertItemsMatch(runner, menu, []);
    });
  },

  testMenuReset: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      menu.reset();
      this._assertItemsMatch(runner, menu, []);
    });
  },

  testMenuSet: function (runner) {
    this._run(function (context, menuNs, Menu) {
      var menu = new Menu(["a", { label: "b" }, "c", "d"]);
      var newItems = ["x", "y", "z"];
      menu.set(newItems);
      this._assertItemsMatch(runner, menu, newItems);
    });
  },

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

  testMenuShowHide: function (runner) {
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
      runner.setTimeout(5000, "Showing, hiding popup should not time out");
    });
  },

  testMenuCommand: function (runner) {
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
        runner.assertEqual(popup.childNodes.length, 1,
                           "Popup should have expected number of children");
        popup.childNodes[0].click();
      }, true);
      m.show(doc.getElementById("stop-button"));
      runner.setTimeout(5000, "Showing, clicking popup should not time out");
    });
  },

  testMenuCommandBubble: function (runner) {
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
        runner.assertEqual(popup.childNodes.length, 1,
                           "Popup should have expected number of children");
        var xulMenu = popup.childNodes[0];
        xulMenu.open = true;
        var subpopup = xulMenu.childNodes[0];
        runner.assertEqual(subpopup.childNodes.length, 1,
                           "Subpopup should have expected number of children");
        var subpopupItem = subpopup.childNodes[0];
        subpopupItem.click();
      }, true);
      m.show(doc.getElementById("stop-button"));
      runner.setTimeout(5000, "Showing, clicking popup should not time out");
    });
  }
};
