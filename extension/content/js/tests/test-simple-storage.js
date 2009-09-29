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

  // Helpers //////////////////////////////////////////////////////////////////

  _ss: (function () {
    Components.utils.import("resource://jetpack/modules/simple-storage.js");
    // The hex string is the SHA1 of the "http://example.com/my_jetpack" source
    // URL example, since SimpleStorage takes a feature ID, and feature IDs are
    // currently SHA1 hashes of their source URLs.  We could actually use any
    // value, but we might as well test it with the kind of value it expects.
    var ss = new simpleStorage.
             SimpleStorage("b9cf68241646a52c29bef63ac402c372a29b78f5");
    ss._suppressDeprecationWarnings(true);
    return ss;
  })(),

  _key: "test key",

  _areArraysEquivalent: function (aArr1, aArr2) {
    // We can't use instanceof Array here for the same reason we make our
    // own _assertRaises function.  See the comment there.
    if (typeof(aArr1.length) === "undefined" ||
        typeof(aArr2.length) === "undefined") {
      return false;
    }
    if (aArr1.length !== aArr2.length)
      return false;
    try {
      for (var i = 0; i < aArr1.length; i++) {
        if (aArr1[i] !== aArr2[i])
          return false;
      }
    }
    catch (err) {
      return false;
    }
    return true;
  },

  _areObjectsEquivalent: function (aObj1, aObj2) {
    if (typeof(aObj1) !== "object" || typeof(aObj2) !== "object")
      return false;
    if (aObj1.__count__ !== aObj2.__count__)
      return false;
    for (var [key, val] in Iterator(aObj2)) {
      if (!aObj1.hasOwnProperty(key))
        return false;
      if (aObj1[key] !== val)
        return false;
    }
    return true;
  },

  // We can't use the test runner's assertRaises, because it uses instanceof
  // to check that the exception is of the expected type.  Simple storage is
  // implemented as a module, which means that the Error constructor in its
  // scope is not equal to the Error constructor in the test runner's scope,
  // and instanceof here therefore returns false for an array created in the
  // module.
  _assertRaises: function (aCallback) {
    try {
      aCallback();
    }
    catch (err) {
      return;
    }
    throw new Error("Test should have thrown exception but did not");
  },

  _insertTestItems: function (aRunner, aCallback) {
    var that = this;
    var keys = [];
    var vals = [];
    var items = {};
    // map "a" - "j" to 0 - 9
    for (var i = 0; i < 10; i++) {
      keys.push(String.fromCharCode(97 + i)); // "a" - "j"
      vals.push(i);
      items[keys[keys.length - 1]] = vals[vals.length - 1];
    }
    // Clear the store.
    that._ss.clear(function () {
      // Size should be 0.
      that._ss.size(function (size) {
        aRunner.assertEqual(size, 0);
        // Set the items.
        that._ss.set(items, function (setItems) {
          aRunner.assert(that._areObjectsEquivalent(setItems, items));
          // New size should be number of items.
          that._ss.size(function (newSize) {
            aRunner.assertEqual(newSize, items.__count__);
            aCallback(keys, vals, items);
          });
        });
      });
    });
  },

  _testGetIllegalKeys: function (ssMethodName) {
    var that = this;
    that._assertRaises(function () that._ss[ssMethodName](null));
    that._assertRaises(function () that._ss[ssMethodName](1337));
    that._assertRaises(function () that._ss[ssMethodName](false));
  },

  _testGetIllegalKeyArrays: function (ssMethodName) {
    var that = this;
    that._assertRaises(function () that._ss[ssMethodName]({}));
    that._assertRaises(function () that._ss[ssMethodName]([undefined]));
    that._assertRaises(function () that._ss[ssMethodName]([null]));
    that._assertRaises(function () that._ss[ssMethodName]([1337]));
    that._assertRaises(function () that._ss[ssMethodName]([false]));
    that._assertRaises(function () that._ss[ssMethodName]([{}]));
  },

  _testSetAndGetArray: function (key, val, runner) {
    this._testSetAndGet(key, val, this._areArraysEquivalent, runner);
  },

  _testSetAndGetObject: function (key, val, runner) {
    this._testSetAndGet(key, val, this._areObjectsEquivalent, runner);
  },

  _testSetAndGetPrimitive: function (key, val, runner) {
    this._testSetAndGet(key, val, function (v1, v2) (v1 === v2), runner);
  },

  _testSetAndGet: function (key, val, equivFunc, runner) {
    var that = this;
    that._ss.set(key, val, function (setKey, setVal) {
      runner.assertEqual(setKey, key);
      runner.assert(setVal === val);
      that._ss.get(key, function (getKey, gottenVal) {
        runner.assertEqual(getKey, key);
        runner.assert(equivFunc(gottenVal, val));
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  // Expected usage tests /////////////////////////////////////////////////////

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
                              { hey: "now", 1: 2, huh: false },
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

  testForEachItem: function (runner) {
    var that = this;
    var gottenItems = {};
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.forEachItem(function (key, val) {
        if (!key) {
          runner.assert(that._areObjectsEquivalent(gottenItems, items));
          runner.success();
        }
        else
          gottenItems[key] = val;
      });
    });
    runner.setTimeout(5000);
  },

  testForEachItemWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.forEachItem(targetKeys, function (key, val) {
        if (!key) {
          runner.assertEqual(targetKeys.length, 0);
          runner.success();
        }
        else {
          runner.assert(targetKeys.length > 0);
          var targetKey = targetKeys.shift();
          runner.assertEqual(key, targetKey);
          runner.assert(val === items[key]);
        }
      });
    });
    runner.setTimeout(5000);
  },

  testForEachKey: function (runner) {
    var that = this;
    var gottenKeys = [];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.forEachKey(function (key) {
        if (!key) {
          runner.assert(that._areArraysEquivalent(gottenKeys.sort(),
                                                  keys.sort()));
          runner.success();
        }
        else
          gottenKeys.push(key);
      });
    });
    runner.setTimeout(5000);
  },

  testForEachValue: function (runner) {
    var that = this;
    var gottenValues = [];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.forEachValue(function (val) {
        if (val === null) {
          runner.assert(that._areArraysEquivalent(gottenValues.sort(),
                                                  vals.sort()));
          runner.success();
        }
        else
          gottenValues.push(val);
      });
    });
    runner.setTimeout(5000);
  },

  testForEachValueWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.forEachValue(targetKeys, function (val) {
        if (val === null) {
          runner.assertEqual(targetKeys.length, 0);
          runner.success();
        }
        else {
          runner.assert(targetKeys.length > 0);
          var targetKey = targetKeys.shift();
          runner.assert(val === items[targetKey]);
        }
      });
    });
    runner.setTimeout(5000);
  },

  testGetAll: function (runner) {
    var that = this;
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.get(function (gottenItems) {
        runner.assert(that._areObjectsEquivalent(items, gottenItems));
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testGetWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.get(targetKeys, function (gottenItems) {
        runner.assertEqual(gottenItems.__count__, targetKeys.length);
        targetKeys.forEach(function (key) {
          runner.assert(gottenItems.hasOwnProperty(key));
          runner.assert(gottenItems[key] === items[key]);
        });
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testHas: function (runner) {
    var that = this;
    that._insertTestItems(runner, function (keys, vals, items) {
      // Test existing key.
      that._ss.has("c", function (key, has) {
        runner.assertEqual(key, "c");
        runner.assert(has);
        // Test nonexisting key.
        that._ss.has("frobble", function (key, has) {
          runner.assertEqual(key, "frobble");
          runner.assert(!has);
          runner.success();
        });
      });
    });
    runner.setTimeout(5000);
  },

  testHasWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.has(targetKeys, function (hasDict) {
        runner.assertEqual(hasDict.__count__, targetKeys.length);
        targetKeys.forEach(function (key) {
          runner.assert(hasDict.hasOwnProperty(key));
          runner.assert((key in items && hasDict[key] === true) ||
                        (!(key in items) && hasDict[key] === false));
        });
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testRemoveWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    var remainingItems = {};
    that._insertTestItems(runner, function (keys, vals, items) {
      // Calculate the items that should remain after removal.
      for (var [key, val] in Iterator(items)) {
        if (targetKeys.indexOf(key) < 0)
          remainingItems[key] = val;
      }
      // Remove items of targetKeys.
      that._ss.remove(targetKeys, function (removeKeys) {
        runner.assert(that._areArraysEquivalent(removeKeys, targetKeys));
        // Size should be right.
        that._ss.size(function (newSize) {
          runner.assertEqual(newSize, remainingItems.__count__);
          // targetKeys should no longer be in the store.
          that._ss.forEachValue(targetKeys, function (val) {
            if (val === null) {
              // Existing items should be remainingItems.
              that._ss.get(function (allItems) {
                runner.assert(that._areObjectsEquivalent(allItems,
                                                         remainingItems));
                runner.success();
              });
            }
            else
              runner.assert(val === undefined);
          });
        });
      });
    });
    runner.setTimeout(5000);
  },

  testKeys: function (runner) {
    var that = this;
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.keys(function (gottenKeys) {
        runner.assert(that._areArraysEquivalent(gottenKeys.sort(),
                                                keys.sort()));
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testValues: function (runner) {
    var that = this;
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.values(function (gottenVals) {
        runner.assert(that._areArraysEquivalent(gottenVals.sort(),
                                                vals.sort()));
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testInitMultipleTimes: function (runner) {
    for (var i = 0; i < 10; i++) {
      this._ss = new simpleStorage.
                 SimpleStorage("b9cf68241646a52c29bef63ac402c372a29b78f5");
      this._ss._suppressDeprecationWarnings(true);
    }
  },

  testValuesWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.values(targetKeys, function (vKeys, gottenVals) {
        runner.assert(that._areArraysEquivalent(vKeys, targetKeys));
        runner.assertEqual(gottenVals.length, targetKeys.length);
        for (var i = 0; i < targetKeys.length; i++) {
          runner.assertEqual(gottenVals[i], items[targetKeys[i]]);
        }
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testReduceItems: function (runner) {
    var that = this;
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.reduceItems([], function (arr, key, val) {
        arr.push(key);
        return arr;
      }, function (reduction) {
        runner.assert(that._areArraysEquivalent(reduction.sort(), keys.sort()));
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testReduceItemsWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.reduceItems(targetKeys, [], function (arr, key, val) {
        arr.push(key);
        return arr;
      }, function (reduceKeys, reduction) {
        runner.assert(that._areArraysEquivalent(reduceKeys, targetKeys));
        runner.assert(that._areArraysEquivalent(reduction.sort(),
                                                targetKeys.sort()));
        runner.success();
      });
    });
    runner.setTimeout(5000);
  },

  testMapItems: function (runner) {
    var that = this;
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.mapItems(function (key, val) key, function (map) {
        runner.assert(that._areArraysEquivalent(map.sort(), keys.sort()));
        runner.success();
      });
    });
    runner.setTimeout(115000);
  },

  testMapItemsWithKeys: function (runner) {
    var that = this;
    var targetKeys = ["b", "c", "frobble", "f", "j", "munnle", "dipple", "d"];
    that._insertTestItems(runner, function (keys, vals, items) {
      that._ss.mapItems(targetKeys, function (key, val) key,
        function (mapKeys, map) {
          runner.assert(that._areArraysEquivalent(mapKeys, targetKeys));
          runner.assertEqual(map.length, targetKeys.length);
          for (var i = 0; i < targetKeys.length; i++) {
            runner.assertEqual(map[i], targetKeys[i]);
          }
          runner.success();
        });
    });
    runner.setTimeout(5000);
  },

  // Stress tests /////////////////////////////////////////////////////////////

  testSetIllegalKeys: function (runner) {
    var ss = this._ss;
    this._assertRaises(function () ss.set(undefined, "no!"));
    this._assertRaises(function () ss.set(null, "no!"));
    this._assertRaises(function () ss.set(1337, "no!"));
    this._assertRaises(function () ss.set(false, "no!"));
    this._assertRaises(function () ss.set({ foo: "bar" }, "no!"));
  },

  testSetIllegalValues: function (runner) {
    var ss = this._ss;
    this._assertRaises(function () ss.set("no", null));
    this._assertRaises(function () ss.set({ no: null }));
  },

  testGetIllegalKeys: function (runner) {
    this._testGetIllegalKeys("get");
    this._testGetIllegalKeyArrays("get");
  },

  testForEachItemIllegalKeys: function (runner) {
    this._testGetIllegalKeyArrays("forEachItem");
  },

  testForEachValueIllegalKey: function (runner) {
    this._testGetIllegalKeyArrays("forEachValue");
  },

  testHasIllegalKeys: function (runner) {
    this._testGetIllegalKeys("has");
    this._testGetIllegalKeyArrays("has");
  },

  testRemoveIllegalKeys: function (runner) {
    this._testGetIllegalKeys("remove");
    this._testGetIllegalKeyArrays("remove");
  },

  testMapItemsIllegal: function (runner) {
    var ss = this._ss;
    this._assertRaises(function () ss.mapItems());
    this._assertRaises(function () ss.mapItems("no"));
    this._assertRaises(function () ss.mapItems([123],
                                               function () {},
                                               function() {}));
  },

  testReduceItemsIllegal: function (runner) {
    var ss = this._ss;
    this._assertRaises(function () ss.reduceItems());
    this._assertRaises(function () ss.reduceItems("no"));
    this._assertRaises(function () ss.reduceItems([123],
                                                  [],
                                                  function () {},
                                                  function() {}));
  },

  testValuesIllegalKeys: function (runner) {
    this._testGetIllegalKeyArrays("values");
  },

  // New sync API

  _areObjectsEquivalentRecursive: function (aObj1, aObj2) {
    if (typeof(aObj1) !== typeof(aObj2))
      return false;
    if (typeof(aObj1) !== "object")
      return aObj1 === aObj2;
    if (aObj1 === null)
      return aObj2 === null;
    if (aObj2 === null)
      return false;
    // __noSuchMethod__ and __iterator__ contribute to __count__...
//     if (aObj1.__count__ !== aObj2.__count__)
//       return false;
    // aObj1 and aObj2 are equivalent iff all items in aObj1 are in aObj2...
    for (var key in aObj1) {
      if (!(key in aObj2))
        return false;
      if (!this._areObjectsEquivalentRecursive(aObj1[key], aObj2[key]))
        return false;
    }
    // ... and all items in aObj2 are in aObj1.
    for (var key in aObj2) {
      if (!(key in aObj1))
        return false;
      if (!this._areObjectsEquivalentRecursive(aObj2[key], aObj1[key]))
        return false;
    }
    return true;
  },

  _testSyncStoreAndLoad: function (aRunner, aObj) {
    var key, val;
    // First empty the store.
    for (key in this._ss)
      delete this._ss[key];
    // Add all of aObj's key-value pairs to the store.
    for ([key, val] in Iterator(aObj))
      this._ss[key] = val;
    // Write out the store and then empty it again.
    this._ss.sync();
    for (key in this._ss)
      delete this._ss[key];
    // Read in the store, which should then be equivalent to aObj.
    this._ss.open();
    aRunner.assert(this._areObjectsEquivalentRecursive(this._ss, aObj));
  },

  testSyncObject: function (runner) {
    this._testSyncStoreAndLoad(runner, {
      string: "bar",
      number: 1337,
      boolTrue: true,
      boolFalse: false,
      nil: null,
      simpleArray: [1, 2, 3],
      complexArray: [1, { foo: { bar: 2 } }, ["baz", "qux"], null],
      simpleObject: { foo: "bar", 1: 2, qux: null },
      complexObject: { foo: { bar: { baz: "qux" } }, qix: [1, 2, 3] }
    });
  },

  testSyncHiddenProperty: function (runner) {
    var forEachItem = this._ss.forEachItem;
    this._testSyncStoreAndLoad(runner, { forEachItem: "foo" });
    this._ss.forEachItem = forEachItem;
  },

  testSyncEmptyObject: function (runner) {
    this._testSyncStoreAndLoad(runner, {});
  },

  testSyncDifferentStoreName: function (runner) {
    // If I create a store under a different store name and set a property
    // in it, the property shouldn't be defined in the existing store.
    var ss = new simpleStorage.SimpleStorage("fake-ID", "settings");
    ss.foo = "bar";
    runner.assertEqual(typeof this._ss.foo, "undefined");
  }
};
