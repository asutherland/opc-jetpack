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
 * The Original Code is Jetpack Simple Storage.
 *
 * The Initial Developer of the Original Code is Mozilla Corp.
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

var SimpleStorageTests = {
  _ss: (function () {
    Components.utils.import("resource://jetpack/modules/simple-storage.js");
    return new SimpleStorage("http://example.com/my_jetpack");
  })(),

  _key: "test key",

  // We can't use the test runner's assertRaises, because it uses instanceof
  // to check that the exception is of the expected type.  Simple storage is
  // implemented as a module, which means that the Error constructor in its
  // scope is not equal to the Error constructor in the test runner's scope,
  // and instanceof here therefore returns false for an array created in the
  // module.
  _assertRaises: function (aCallback) {
    try {
      aCallback();
      throw "Test should have thrown exception but did not";
    }
    catch (err) {}
  },

  _testSetAndGetArray: function (key, val, runner) {
    function equiv(val1, val2) {
      // We can't use instanceof Array here for the same reason we make our
      // own _assertRaises function.  See the comment there.
      if (typeof(val1.length) === "undefined" ||
          typeof(val2.length) === "undefined") {
        return false;
      }
      if (val1.length !== val2.length) {
        return false;
      }
      try {
        for (var i = 0; i < val1.length; i++) {
          if (val1[i] !== val2[i]) {
            return false;
          }
        }
      }
      catch (err) {
        return false;
      }
      return true;
    }
    this._testSetAndGet(key, val, equiv, runner);
  },

  _testSetAndGetObject: function (key, val, runner) {
    function equiv(val1, val2) {
      if (typeof(val1) !== "object" || typeof(val2) !== "object") {
        return false;
      }
      if (val1.__count__ !== val2.__count__) {
        return false;
      }
      for (var prop in val1) {
        if (!val2.hasOwnProperty(prop) || val2[prop] !== val1[prop]) {
          return false;
        }
      }
      return true;
    }
    this._testSetAndGet(key, val, equiv, runner);
  },

  _testSetAndGetPrimitive: function (key, val, runner) {
    function equiv(val1, val2) {
      return val1 === val2;
    }
    this._testSetAndGet(key, val, equiv, runner);
  },

  _testSetAndGet: function (key, val, equivFunc, runner) {
    var that = this;
    that._ss.set(key, val, function (setKey, setVal) {
      runner.assertEqual(setKey, key);
      runner.assert(setVal === val);
      that._ss.get(key, function (getKey, gottenVal) {
        runner.assertEqual(getKey, key);
        try{
        runner.assert(equivFunc(gottenVal, val));
        }catch (e) { throw "" + (val instanceof Array); }
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  // Legal calls

  testInitMultipleTimes: function (runner) {
    for (var i = 0; i < 10; i++) {
      this._ss = new this._ss.constructor("http://example.com/my_jetpack");
    }
  },

  testSetAndGetNull: function (runner) {
    this._testSetAndGetPrimitive(this._key, null, runner);
  },

  testSetAndGetNumber: function (runner) {
    this._testSetAndGetPrimitive(this._key, 1337, runner);
  },

  testSetAndGetString: function (runner) {
    this._testSetAndGetPrimitive(this._key, "oh snap", runner);
  },

  testSetAndGetBooleanTrue: function (runner) {
    this._testSetAndGetPrimitive(this._key, true, runner);
  },

  testSetAndGetBooleanFalse: function (runner) {
    this._testSetAndGetPrimitive(this._key, false, runner);
  },

  testSetAndGetEmptyArray: function (runner) {
    this._testSetAndGetArray(this._key, [], runner);
  },

  testSetAndGetArray: function (runner) {
    this._testSetAndGetArray(this._key, [1, "two", null], runner);
  },

  testSetAndGetEmptyObject: function (runner) {
    this._testSetAndGetObject(this._key, {}, runner);
  },

  testSetAndGetObject: function (runner) {
    this._testSetAndGetObject(this._key,
                              { hey: "now", 1: 2, huh: null },
                              runner);
  },

  testSetAndGetUndefined: function (runner) {
    var that = this;
    var initialVal = "testSetAndGetUndefined";

    // First set (key, val) for a defined val.
    that._ss.set(that._key, initialVal, function (setKey, setVal) {
      runner.assertEqual(setKey, that._key);
      runner.assertEqual(setVal, initialVal);
      // Make sure the defined val was stored OK.
      that._ss.get(that._key, function (getKey, gottenVal) {
        runner.assertEqual(getKey, that._key);
        runner.assertEqual(gottenVal, initialVal);
        // Now set (key, undefined).
        that._ss.set(that._key, undefined, function (setUndefKey, setUndefVal) {
          runner.assertEqual(setUndefKey, that._key);
          runner.assert(setUndefVal === undefined);
          // Get key should return undefined.
          that._ss.get(that._key, function (getUndefKey, getUndefVal) {
            runner.assertEqual(getUndefKey, that._key);
            runner.assert(getUndefVal === undefined);
            runner.success();
          });
        });
      });
    });
    runner.setTimeout(5000);
  },

  testGetNonexisting: function (runner) {
    var key = "i never set this key";
    this._ss.get(key, function (getKey, gottenVal) {
      runner.assertEqual(key, getKey);
      runner.assert(gottenVal === undefined);
      runner.success();
    });
    runner.setTimeout(5000);
  },

  testSetAndGetMultipleKeys: function (runner) {
    var that = this;
    var keyValPairs = {};
    for (var i = 0; i < 100; i++) {
      var key = i.toString();
      var val = i;
      keyValPairs[key] = val;
      that._ss.set(key, val, function (setKey, setVal) {
        that._ss.get(setKey, function (getKey, gottenVal) {
          runner.assert(keyValPairs.hasOwnProperty(getKey));
          delete keyValPairs[getKey];
          runner.assertEqual(gottenVal, setVal);
          if (keyValPairs.__count__ === 0) {
            runner.success();
          }
        });
      });
    }
    runner.setTimeout(5000);
  },

  testRemove: function (runner) {
    var that = this;
    var val = "testRemove";

    // First set (key, val).
    that._ss.set(that._key, val, function (setKey, setVal) {
      runner.assertEqual(setKey, that._key);
      runner.assertEqual(setVal, val);
      // Make sure the val was stored OK.
      that._ss.get(that._key, function (getKey, gottenVal) {
        runner.assertEqual(getKey, that._key);
        runner.assertEqual(gottenVal, val);
        // Now remove key.
        that._ss.remove(that._key, function (removeKey) {
          runner.assertEqual(removeKey, that._key);
          // Get key should return undefined.
          that._ss.get(that._key, function (getUndefKey, getUndefVal) {
            runner.assertEqual(getUndefKey, that._key);
            runner.assert(getUndefVal === undefined);
            runner.success();
          });
        });
      });
    });
    runner.setTimeout(5000);
  },

  testRemoveNonexisting: function (runner) {
    var key = "all up in mah bidness";
    this._ss.remove(key, function (removeKey) {
      runner.assertEqual(removeKey, key);
      runner.success();
    });
    runner.setTimeout(5000);
  },

  testVerboseCallback: function (runner) {
    var that = this;
    var val = "testVerboseCallback";

    that._ss.set(that._key, val, {
      foo: "bar",
      onResult: function (setKey, setVal) {
        runner.assertEqual(this.foo, "bar");
        runner.assertEqual(setKey, that._key);
        runner.assert(setVal === val);
        that._ss.get(that._key, {
          baz: "qux",
          onResult: function (getKey, gottenVal) {
            runner.assertEqual(this.baz, "qux");
            runner.assertEqual(getKey, that._key);
            runner.assert(gottenVal === val);
            runner.success();
          }
        });
      }
    });
    runner.setTimeout(5000);
  },

  // Illegal calls

  testSetWithUndefinedKey: function (runner) {
    var that = this;
    that._assertRaises(function () that._ss.set(undefined, "no!"));
  },

  testSetWithNullKey: function (runner) {
    var that = this;
    that._assertRaises(function () that._ss.set(null, "no!"));
  },

  testSetWithNonstringKey: function (runner) {
    var that = this;
    that._assertRaises(function () that._ss.set(1337, "no!"));
  },

  testGetUndefinedKey: function (runner) {
    var that = this;
    that._assertRaises(function () that._ss.get(undefined));
  },

  testGetNonstringKey: function (runner) {
    var that = this;
    that._assertRaises(function () that._ss.get(1337));
  }
};
