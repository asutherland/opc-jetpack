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
 * The Original Code is Jetpack.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Myk Melez <myk@mozilla.org>
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

var SettingsStoreTests = {
  _store: (function() {
    Cc["@mozilla.org/moz/jssubscript-loader;1"]
    .getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript("resource://jetpack/content/js/settings-store.js");

    var fakeContext = {
      id: "fake-ID",
      addUnloader: function() {},
      manifest: {
        settings: [
          { name: "group", label: "Group", type: "group",
            settings: [ { name: "foo", label: "Foo", type: "number" } ] },
          { name: "boolean", label: "Boolean", type: "boolean" },
          { name: "text", label: "Text", type: "text" },
          { name: "number", label: "Number", type: "number" },
          { name: "password", label: "Password", type: "password" },
          { name: "range", label: "Range", type: "range" },
          { name: "member", label: "Member", type: "member", set: [] },
          { name: "hasDefault", label: "Has Default", type: "text",
            default: "foo" }
        ]
      }
    };

    return new SettingsStore(fakeContext);
  })(),

  testStore: function(runner) {
    // FIXME: figure out how to make this report SettingsStore.
    runner.assertEqual(this._store.constructor.name, "SimpleStorage");
  },

  testGroup: function(runner) {
    runner.assertEqual(typeof this._store.group, "object");
    this._store.group.foo = 1;
    runner.assertEqual(typeof this._store.group.foo, "number");

    delete this._store.group;
  },

  testBoolean: function(runner) {
    runner.assertEqual(typeof this._store.boolean, "undefined");
    this._store.boolean = false;
    runner.assertEqual(this._store.boolean, false);
    this._store.boolean = true;
    runner.assertEqual(this._store.boolean, true);

    delete this._store.boolean;
  },

  testText: function(runner) {
    runner.assertEqual(typeof this._store.text, "undefined");
    this._store.text = "Hello, world!";
    runner.assertEqual(this._store.text, "Hello, world!");

    delete this._store.text;
  },

  testNumber: function(runner) {
    runner.assertEqual(typeof this._store.number, "undefined");
    this._store.number = 1;
    runner.assertEqual(this._store.number, 1);

    delete this._store.number;
  },

  testPassword: function(runner) {
    runner.assertEqual(typeof this._store.password, "undefined");
    this._store.password = "sekret";
    runner.assertEqual(this._store.password, "sekret");
    // TODO: test that the password is stored in the password manager
    // rather than the simple store.

    delete this._store.password;
  },

  testRange: function(runner) {
    runner.assertEqual(typeof this._store.range, "undefined");
    this._store.range = 5;
    runner.assertEqual(this._store.range, 5);
    // TODO: test setting the setting to a value outside its range.

    delete this._store.range;
  },

  testMember: function(runner) {
    runner.assertEqual(typeof this._store.member, "undefined");
    this._store.member = "blue";
    runner.assertEqual(this._store.member, "blue");
    // TODO: test setting the setting to a value outside its set.

    delete this._store.member;
  },

  testNonexistent: function(runner) {
    // FIXME: figure out why this assertion fails the second and subsquent times
    // one runs these tests in a browser session.
    runner.assert(!("nonexistent" in this._store));
    runner.assertEqual(typeof this._store.nonexistent, "undefined");
    var store = this._store;
    runner.assertRaises(function() { store.nonexistent = "foo" }, Error);
    //runner.assertEqual(typeof this._store.nonexistent, "undefined");
  },

  testHasDefault: function(runner) {
    runner.assert("hasDefault" in this._store);
    runner.assertEqual(this._store.hasDefault, "foo");
    this._store.hasDefault = "bar";
    runner.assertEqual(this._store.hasDefault, "bar");

    delete this._store.hasDefault;
  }

};
