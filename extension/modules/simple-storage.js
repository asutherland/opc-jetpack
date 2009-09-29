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
 *   David Dahl <ddahl@mozilla.com>
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

// = Simple Storage =
//
// This module implements simple, persistent storage as proposed in
// [[https://wiki.mozilla.org/Labs/Jetpack/JEP/11|JEP 11]].  It is implemented
// via serialized JSON on disk.
//
// Simple storage is really simple.  {{{jetpack.storage.simple}}} is a single,
// persistent JavaScript object available to each Jetpack feature.  For the most
// part this object is like any other JavaScript object, and a feature can set
// whatever properties it wants on it.  To manipulate its persistent data, a
// feature therefore need only use the various [[https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference|standard JavaScript functions and operators]].
// Each feature gets its own private storage.
//
// Storage is automatically flushed to disk periodically.  To flush it manually,
// you can call {{{jetpack.storage.simple.sync()}}}.  To force the object to
// reload its data from disk, call {{{jetpack.storage.simple.open()}}}, although
// the data comes loaded automatically so you shouldn't have to worry about it.
//
// Here's an example:
//
// {{{
// var myStorage = jetpack.storage.simple;
// myStorage.fribblefrops = [1, 3, 3, 7];
// myStorage.heimelfarbs = { bar: "baz" };
// }}}
//
// And then later:
//
// {{{
// var myStorage = jetpack.storage.simple;
// myStorage.fribblefrops.forEach(function (elt) console.log(elt));
// var bar = myStorage.heimelfarbs.bar;
// }}}
//
// Each Jetpack feature that uses simple storage gets its own private backing
// JSON store located at the following path:
//
// {{{ProfD/jetpack/featureId/storage/simple.json}}}
//
// where {{{ProfD}}} is the user's Firefox profile directory and {{{featureId}}}
// is the ID of the feature.
//
// Jetpack modules that use SimpleStorage to store their own feature-specific
// data and don't want to overwrite data that the feature is storing (or have
// their data overwritten by it) can specify a different store name to the
// SimpleStorage constructor, whereupon this module will use a separate private
// backing JSON store at a path like the one above, except that the filename
// will be the provided store name followed by ".json".  For example,
// the settings module uses SimpleStorage to create a store with the filename
// "settings.json" by passing "settings" as the constructor's second argument.

var EXPORTED_SYMBOLS = ["simpleStorage"];

var Cc = Components.classes;
var Ci = Components.interfaces;

const STREAM_BUFFER_SIZE = 8192;

Components.utils.import("resource://jetpack/modules/track.js");

var gSyncTimer;
var gSimpleStorageInstances = [];

// This object is exposed by the module.
var simpleStorage = {

  // The SimpleStorage constructor.
  SimpleStorage: SimpleStorage,

  // Registers a SimpleStorage instance with the sync timer.
  register: function simpleStorage_register(aSimpleStorage) {
    if (gSimpleStorageInstances.indexOf(aSimpleStorage) >= 0)
      throw new Error("Tried to register a registered SimpleStorage");
    if (gSimpleStorageInstances.length === 0)
      gSyncTimer = createSyncTimer();
    gSimpleStorageInstances.push(aSimpleStorage);
  },

  // Flushes the given SimpleStorage instance to disk and unregisters it with
  // the sync timer.
  unregister: function simpleStorage_unregister(aSimpleStorage) {
    var idx = gSimpleStorageInstances.indexOf(aSimpleStorage);
    if (idx < 0)
      throw new Error("Tried to unregister an unregistered SimpleStorage");
    aSimpleStorage.sync();
    gSimpleStorageInstances.splice(idx, 1);
    if (gSimpleStorageInstances.length === 0) {
      gSyncTimer.cancel();
      gSyncTimer = null;
    }
  }
};

// == The SimpleStorage Prototype ==
//
// Each Jetpack feature is tied to an instance of simple storage, and that's
// reflected in the code.  Create a new {{{SimpleStorage}}} object with this
// constructor, passing in the feature's URL and the name of the store
// to create.

function SimpleStorage(aFeatureId, aStoreName) {
  MemoryTracking.track(this);

  ensureGecko191();
  if (typeof(aFeatureId) !== "string" || !aFeatureId)
    throw new Error("Feature ID must be a nonempty string.");

  if (typeof(aStoreName) !== "string" || !aStoreName)
    aStoreName = "simple";

  var impl = new SimpleStorageImpl(aFeatureId, aStoreName);
  var deprecatedImpl = new SimpleStorageDeprecatedImpl(aFeatureId);

  // This object delegates to the API implementations by forwarding method calls
  // to them.  That allows us to not have to worry (too much, see below) about
  // callers clobbering properties defined on this object.
  var that = this;
  this.__noSuchMethod__ = function SimpleStorage___noSuchMethod__(name, args) {
    if (name in impl)
      impl[name].apply(that, args);
    else if (name in deprecatedImpl) {
      if (name !== "_suppressDeprecationWarnings" &&
          !deprecatedImpl._suppressDeprecationWarnings()) {
        logMsg("Warning: jetpack.storage.simple." + name + " and the rest of " +
               "the simple storage async API is deprecated and will be " +
               "removed in a future version of Jetpack.");
      }
      deprecatedImpl._ensureDatabaseIsSetup();
      deprecatedImpl[name].apply(that, args);
    }
    else {
      let fullName = "jetpack.storage.simple." + name;
      throw new TypeError(fullName + " is not a function");
    }
  };

  // It's important to call open() with this |this| pointer so that the
  // properties are added to this object -- not the impl object.
  try {
    impl.open.call(this);
  }
  catch (err) {
    // This constructor is called only by the environment to hook up a feature
    // to its storage.  There's nothing the environment can really do if this
    // fails, so just report the error instead of throwing it.  The feature will
    // still be able to attach properties to this object and hopefully sync it.
    Components.utils.reportError(err);
  }
}

SimpleStorage.prototype = {
  // Just so we show up as some class when introspected.
  constructor: function SimpleStorage() {},

  // Unfortunately, since we add __noSuchMethod__ directly on this object, it's
  // yielded during iteration.  Define a custom iterator to hide it.  It's
  // hidden only during iteration, though.
  __iterator__: function SimpleStorage_prototype___iterator__(aKeysOnly) {
    var iter = new Iterator(this, false);
    return {
      next: function () {
        var pair = iter.next();
        if (pair[0] === "__noSuchMethod__")
          return this.next();
        return aKeysOnly ? pair[0] : pair;
      }
    };
  }
};


// API implementation /////////////////////////////////////////////////////////

function SimpleStorageImpl(aFeatureId, aStoreName) {
  MemoryTracking.track(this);
  var jsonFile = getJsonFile(aFeatureId, aStoreName);

  // === {{{SimpleStorage.deleteBackingFile()}}} ===
  //
  // Deletes the backing JSON file if it exists.  The {{{jetpack}}} directory
  // structure as described above is also deleted if the directories are empty.

  this.deleteBackingFile = function SimpleStorage_deleteBackingFile() {
    deleteBackingFileStructure(jsonFile);
  };

  // === {{{SimpleStorage.open()}}} ===
  //
  // Loads the store from disk and reads it into the object.  Note that any
  // properties already on the object will be overwritten, but no properties
  // are deleted before loading.

  this.open = function SimpleStorage_open() {
    loadJsonIntoObject(jsonFile, this);
  };

  // === {{{SimpleStorage.sync()}}} ===
  //
  // Writes the object to disk.  The object is automatically and periodically
  // written, but you can use this method to manually flush it.

  this.sync = function SimpleStorage_sync() {
    try {
      if (!jsonFile.exists())
        jsonFile.create(jsonFile.NORMAL_FILE_TYPE, 0600);

      var stream = Cc["@mozilla.org/network/file-output-stream;1"].
                   createInstance(Ci.nsIFileOutputStream);
      stream.init(jsonFile, 0x02 | 0x08 | 0x20, 0600, 0);
      var converter = Cc["@mozilla.org/intl/converter-output-stream;1"].
                      createInstance(Ci.nsIConverterOutputStream);
      converter.init(stream, "UTF-8", 0, 0);
      converter.writeString(JSON.stringify(this));
      converter.close();
    }
    catch (err) {
      throw new SimpleStorageError("Error writing JSON: " + err);
    }
  };
}


// Helper functions ///////////////////////////////////////////////////////////

// Prepends "jetpack.storage.simple:" to aMsg.
function SimpleStorageError(aMsg) {
  this.__proto__ = new Error("jetpack.storage.simple: " + aMsg);
}

// Adds all the key-value pairs of aSourceObj to aDestObj.
function cloneObject(aSourceObj, aDestObj) {
  for (let [prop, val] in Iterator(aSourceObj))
    aDestObj[prop] = val;
}

// Creates a repeating timer, whose period is getSyncTimerPeriod() and which
// flushes all simple storage instances to disk.
function createSyncTimer() {
  var syncTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  syncTimer.initWithCallback({
    notify: function SimpleStorage_syncTimer_notify() {
      gSimpleStorageInstances.forEach(function (ss) {
        try {
          ss.sync();
        }
        catch (err) {
          let e = new SimpleStorageError("Error syncing on timer: " + err);
          Components.utils.reportError(e);
        }
      });
    }
  }, getSyncTimerPeriod(), syncTimer.TYPE_REPEATING_SLACK);

  return syncTimer;
}

// Deletes the backing file if it exists.  The {{{jetpack}}} directory
// structure as described above is also deleted if the directories are empty.
function deleteBackingFileStructure(aFile) {
  try {
    if (!aFile.exists())
      return;
    aFile.remove(false);

    // Remove the storage, feature, and jetpack directories (in that order)
    // if they are now empty.
    let dir = aFile.parent;
    for (let i = 0; i < 3; i++) {
      if (dir.directoryEntries.hasMoreElements())
        return;
      dir.remove(false);
      dir = dir.parent;
    }
  }
  catch (err) {
    // This method should only be called when the feature is purged, and
    // there's nothing the caller can really do if this fails.  So, just
    // report the error instead of throwing it.
    let e = new SimpleStorageError("Error deleting file: " + err);
    Components.utils.reportError(e);
  }
}

// Simple storage is supported on Firefox 3.5+ only.
function ensureGecko191() {
  var appInfo = Cc["@mozilla.org/xre/app-info;1"].
                getService(Ci.nsIXULAppInfo);
  var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].
                       getService(Ci.nsIVersionComparator);

  if (versionChecker.compare(appInfo.platformVersion, "1.9.1") < 0)
    throw new Error("jetpack.storage.simple requires Gecko 1.9.1 or later.");
}


// Returns an nsIFile suitable for the feature with the given ID.  This function
// does *not* create the file.
function getJsonFile(aFeatureId, aStoreName) {
  var dir = Cc["@mozilla.org/file/directory_service;1"].
            getService(Ci.nsIProperties);
  var file = dir.get("ProfD", Ci.nsIFile);
  file.append("jetpack");
  file.append(aFeatureId);
  file.append("storage");
  file.append(aStoreName + ".json");
  return file;
}

// Gets the default period for the sync timer or if the user has set a pref
// for it, gets that instead.
function getSyncTimerPeriod() {
  var period;
  try {
    period = Cc["@mozilla.org/preferences-service;1"].
             getService(Ci.nsIPrefService).
             getBranch("extensions.jetpack.").
             getIntPref("storage.simple.syncTimerPeriod");
  }
  catch (err) {
    // Default to 5 minutes.
    period = 300000;
  }
  return period;
}

// Decodes the JSON stored in aJsonFile and adds the key-value pairs to
// aDestObj.
function loadJsonIntoObject(aJsonFile, aDestObj) {
  var jsonObj = parseJsonFile(aJsonFile);
  if (typeof(jsonObj) === "object")
    cloneObject(jsonObj, aDestObj);
}

// Decodes the JSON in aJsonFile and returns the resulting object.  If the file
// does not exist or is not JSON, returns undefined.
function parseJsonFile(aJsonFile) {
  try {
    if (!aJsonFile.exists())
      return undefined;

    var stream = Cc["@mozilla.org/network/file-input-stream;1"].
                 createInstance(Ci.nsIFileInputStream);
    stream.init(aJsonFile, 0x01, 0, 0);
    var converter = Cc["@mozilla.org/intl/converter-input-stream;1"].
                    createInstance(Ci.nsIConverterInputStream);
    converter.init(stream, "UTF-8", STREAM_BUFFER_SIZE,
                   converter.DEFAULT_REPLACEMENT_CHARACTER);

    var buffer = {};
    var json = "";
    while (converter.readString(STREAM_BUFFER_SIZE, buffer))
      json += buffer.value;
    converter.close();

    return json.length ? JSON.parse(json) : undefined;
  }
  catch (err) {
    throw new SimpleStorageError("Error reading JSON: " + err);
  }
}


// DEPRECATED API implementation //////////////////////////////////////////////

var TABLE_NAME = "simple_storage";

var CREATE_COLUMN_SQL = [
  "key TEXT PRIMARY KEY NOT NULL UNIQUE",
  "value TEXT"
];

function SimpleStorageDeprecatedImpl(aFeatureId) {
  MemoryTracking.track(this);

  var dbConn;
  var suppressDeprecationWarnings = false;

  // Creates our database if it doesn't already exist.
  this._ensureDatabaseIsSetup =
  function SimpleStorageDeprecatedImpl__ensureDatabaseIsSetup() {
    if (dbConn)
      return;
    dbConn = getOrCreateDatabase(aFeatureId);
    if (!dbConn.tableExists(TABLE_NAME))
      dbConn.createTable(TABLE_NAME, CREATE_COLUMN_SQL.join(", "));
  }

  this._suppressDeprecationWarnings =
  function SimpleStorage_suppressDeprecationWarnings(aSuppress) {
    if (aSuppress !== undefined)
      suppressDeprecationWarnings = aSuppress;
    return suppressDeprecationWarnings;
  };

  // === {{{SimpleStorage.clear()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Deletes all items from the store.
  //
  // * onResult()
  // * onError(errorMessage)

  this.clear = function SimpleStorage_clear(aCallback) {
    ensureTypeOfArg(aCallback, "callback", "First", "callback");
    var stmt = dbConn.createStatement("DELETE FROM " + TABLE_NAME);
    var ucb = new UserCallback(aCallback);
    stmt.executeAsync({
      handleCompletion: function () ucb.onResult(),
      handleError: function (err) handleStorageError(err, ucb),
      handleResult: function () {}
    });
    stmt.finalize();
  };

  // === {{{SimpleStorage.forEachItem()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Iterates over items in the store.
  //
  // ==== {{{forEachItem(keyArray, callback)}}} ====
  //
  // Iterates over items with the given keys.  onResult is called for each
  // key-value pair in the order that keys are given in keyArray.  If a key
  // does not exist in the store, undefined is passed as the value.  When all
  // pairs are exhausted, onResult is passed null.
  //
  // * onResult(key, value) for each key in keyArray
  // * onResult(null, null) when all items are exhausted
  // * onError(errorMessage, keyArray)
  //
  // ==== {{{forEachItem(callback)}}} ====
  //
  // Iterates over all the items in the store.  onResult is called for each
  // key-value pair, and when all pairs are exhausted, onResult is passed null.
  // The order of iteration is arbitrary.
  //
  // * onResult(key, value) for each item in the store
  // * onResult(null, null) when all items are exhausted
  // * onError(errorMessage)

  this.forEachItem = function SimpleStorage_forEachItem(aArg0, aArg1) {
    switch (typeOfArg(aArg0)) {
    case "array":
      // aArg0 = array of of keys
      // aArg1 = callback
      ensureKeysAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      forEachItemMultiple(aArg0.slice(0), new UserCallback(aArg1));
      break;
    case "callback":
      // aArg0 = callback
      forEachItemAll(new UserCallback(aArg0));
      break;
    default:
      throw new ArgumentError("First", "key array or callback");
    }
  };

  function forEachItemMultiple(aKeys, aUserCallback) {
    var sql = "SELECT key, value FROM " + TABLE_NAME + " WHERE key = :key";
    var value;
    var errored = false;
    var numCompleted = 0;

    // We can't just batch statements with dbConn.executeAsync because we have
    // to pass undefined to aCallback if a row doesn't exist.
    for (let i = 0; i < aKeys.length && !errored; i++) {
      let key = aKeys[i];
      let stmt = dbConn.createStatement(sql);
      stmt.params.key = key;
      stmt.executeAsync({
        handleResult: function (result) {
          value = unwrapValue(result.getNextRow().getResultByName("value"));
        },
        handleCompletion: function () {
          aUserCallback.onResult(key, value);
          value = undefined;
          numCompleted++;
          if (numCompleted === aKeys.length)
            aUserCallback.onResult(null, null);
        },
        handleError: function (err) {
          errored = true;
          handleStorageError(err, aUserCallback, [aKeys]);
        }
      });
      stmt.finalize();
    }
  }

  function forEachItemAll(aUserCallback) {
    var stmt = dbConn.createStatement("SELECT key, value FROM " + TABLE_NAME);
    stmt.executeAsync({
      handleResult: function (result) {
        var row;
        while (row = result.getNextRow()) {
          aUserCallback.onResult(row.getResultByName("key"),
                                 unwrapValue(row.getResultByName("value")));
        }
      },
      handleCompletion: function () aUserCallback.onResult(null, null),
      handleError: function (err) handleStorageError(err, aUserCallback)
    });
    stmt.finalize();
  }

  // === {{{SimpleStorage.forEachKey()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Iterates over all the keys in the store.  onResult is called for each key,
  // and when all keys are exhausted, onResult is passed null.  The order of
  // iteration is arbitrary.
  //
  // * onResult(key) for each key in the store
  // * onResult(null) when all keys are exhausted
  // * onError(errorMessage)

  this.forEachKey = function SimpleStorage_forEachKey(aCallback) {
    ensureTypeOfArg(aCallback, "callback", "First", "callback");
    var ucb = new UserCallback(aCallback);
    forEachItemAll({
      onResult: function (key, val) ucb.onResult(key),
      onError: function (err) ucb.onError(err)
    });
  };

  // === {{{SimpleStorage.forEachValue()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Iterates over values in the store.
  //
  // ==== {{{forEachValue(keyArray, callback)}}} ====
  //
  // Iterates over values with the given keys.  onResult is called for each
  // value in the order that keys are given in keyArray.  If a key does not
  // exist in the store, undefined is passed as the value.  When all values are
  // exhausted, onResult is passed null.
  //
  // * onResult(value) for each key in keyArray
  // * onResult(null) when all values are exhausted
  // * onError(errorMessage, keyArray)
  //
  // ==== {{{forEachValue(callback)}}} ====
  //
  // Iterates over all the values in the store.  onResult is called for each
  // value, and when all values are exhausted, onResult is passed null.  The
  // order of iteration is arbitrary.
  //
  // * onResult(value) for each value in the store
  // * onResult(null) when all values are exhausted
  // * onError(errorMessage)

  this.forEachValue = function SimpleStorage_forEachValue(aArg0, aArg1) {
    switch (typeOfArg(aArg0)) {
    case "array":
      // aArg0 = key array
      // aArg1 = callback
      ensureKeysAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      forEachValueMultiple(aArg0.slice(0), new UserCallback(aArg1));
      break;
    case "callback":
      // aArg0 = callback
      forEachValueAll(new UserCallback(aArg0));
      break;
    default:
      throw new ArgumentError("First", "key array or callback");
    }
  };

  function forEachValueMultiple(aKeys, aUserCallback) {
    forEachItemMultiple(aKeys, makeForEachValueCallback(aUserCallback, aKeys));
  }

  function forEachValueAll(aUserCallback) {
    forEachItemAll(makeForEachValueCallback(aUserCallback));
  }

  function makeForEachValueCallback(aUserCallback, aOnErrorArg) {
    return {
      onResult: function (key, val) aUserCallback.onResult(val),
      onError: function (err) aUserCallback.onError(err, aOnErrorArg)
    };
  }

  // === {{{SimpleStorage.get()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Gets items with given keys.
  //
  // ==== {{{get(key, callback)}}} ====
  //
  // Gets the item associated with the given key.  If the key does not exist
  // in the store, undefined is passed as the value to onResult.
  //
  // * onResult(key, value)
  // * onError(errorMessage, key)
  //
  // ==== {{{get(keyArray, callback)}}} ====
  //
  // Gets the items associated with the given keys and yields them as an
  // object.  That is, if keyArray contains key_1, key_2, ..., key_m, this
  // form yields { key_1: value_1, key_2: value_2, ..., key_m: value_m }.  If
  // key_i does not exist in the store, value_i is undefined.
  //
  // * onResult(itemsObject)
  // * onError(errorMessage, keyArray)
  //
  // ==== {{{get(callback)}}} ====
  //
  // Gets all the items in the store and yields them as an object.  That is,
  // this form yields { key_1: value_1, key_2: value_2, ..., key_n: value_n }
  // for all n key-value pairs in the store.
  //
  // * onResult(allItemsObject)
  // * onError(errorMessage)

  this.get = function SimpleStorage_get(aArg0, aArg1) {
    switch (typeOfArg(aArg0)) {
    case "array":
      // aArg0 = key array
      // aArg1 = callback
      ensureKeysAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      getMultiple(aArg0.slice(0), new UserCallback(aArg1));
      break;
    case "callback":
      // aArg0 = callback
      getAll(new UserCallback(aArg0));
      break;
    case "string":
      // aArg0 = key
      // aArg1 = callback
      ensureKeyIsLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      getSingle(aArg0, new UserCallback(aArg1));
      break;
    default:
      throw new ArgumentError("First", "key, key array, or callback");
    }
  };

  function getSingle(aKey, aUserCallback) {
    getMultiple([aKey], {
      onResult: function (itemObj) aUserCallback.onResult(aKey, itemObj[aKey]),
      onError: function (err) aUserCallback.onError(err, aKey)
    });
  }

  function getMultiple(aKeys, aUserCallback) {
    reduceItemsMultiple(aKeys, {}, getReduceFunc, aUserCallback);
  }

  function getAll(aUserCallback) {
    reduceItemsAll({}, getReduceFunc, aUserCallback);
  }

  function getReduceFunc(itemsObj, key, val) {
    itemsObj[key] = val;
    return itemsObj;
  }

  // === {{{SimpleStorage.has()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Indicates whether a key or keys exist in the store.
  //
  // ==== {{{has(key, callback)}}} ====
  //
  // Yields true if the given key exists in the store and false otherwise.
  //
  // * onResult(key, exists)
  // * onError(errorMessage, key)
  //
  // ==== {{{has(keyArray, callback)}}} ====
  //
  // Yields an object that indicates whether the given keys exist in the
  // store.  If keyArray contains key_1, key_2, ..., key_m, this form yields
  // { key_1: key_1_exists, key_2: key_2_exists, ..., key_m: key_m_exists },
  // where key_i_exists is true if key_i exists in the store and false
  // otherwise.
  //
  // * onResult(existsObject)
  // * onError(errorMessage, keyArray)

  this.has = function SimpleStorage_has(aArg0, aArg1) {
    switch (typeOfArg(aArg0)) {
    case "array":
      // aArg0 = key array
      // aArg1 = callback
      ensureKeysAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      hasMultiple(aArg0.slice(0), new UserCallback(aArg1));
      break;
    case "string":
      // aArg0 = key
      // aArg1 = callback
      ensureKeyIsLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      hasSingle(aArg0, new UserCallback(aArg1));
      break;
    default:
      throw new ArgumentError("First", "key or key array");
    }
  };

  function hasSingle(aKey, aUserCallback) {
    hasMultiple([aKey], {
      onResult: function (hasObj) aUserCallback.onResult(aKey, hasObj[aKey]),
      onError: function (err) ucb.onError(err, aKey)
    });
  }

  function hasMultiple(aKeys, aUserCallback) {
    reduceItemsMultiple(aKeys, {}, function (hasObj, key, val) {
      hasObj[key] = val !== undefined;
      return hasObj;
    }, aUserCallback);
  }

  // === {{{SimpleStorage.keys()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Yields all the keys of the store in an unordered array.
  //
  // * onResult(keyArray)
  // * onError(errorMessage)

  this.keys = function SimpleStorage_keys(aCallback) {
    ensureTypeOfArg(aCallback, "callback", "First", "callback");
    mapItemsAll(function (key, val) key, new UserCallback(aCallback));
  };

  // === {{{SimpleStorage.mapItems()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Applies a function to items in the store and yields the results in an
  // array.
  //
  // ==== {{{mapItems(keyArray, mapFunction, callback)}}} ====
  //
  // Applies mapFunction to the items in the store with the given keys and
  // yields the results in an array.  mapFunction is called for each key-value
  // pair in the order that keys are given, like so:
  //
  //   mapFunction(key, value)
  //
  // If a given key does not exist in the store, value will be undefined.
  //
  // * onResult(keyArray, mappedArray)
  // * onError(errorMessage, keyArray)
  //
  // ==== {{{mapItems(mapFunction, callback)}}} ====
  //
  // Applies mapFunction to each item in the store and yields the results in an
  // array.  mapFunction is called for each key-value pair in an arbitrary
  // order, like so:
  //
  //   mapFunction(key, value)
  //
  // * onResult(mappedArray)
  // * onError(errorMessage)

  this.mapItems = function SimpleStorage_mapItems(aArg0, aArg1, aArg2) {
    if (arguments.length === 3) {
      // aArg0 = key array
      // aArg1 = map function
      // aArg2 = callback
      ensureTypeOfArg(aArg0, "array", "First", "key array");
      ensureKeysAreLegal(aArg0);
      ensureJsTypeOfArg(aArg1, "function", "Second", "function");
      ensureTypeOfArg(aArg2, "callback", "Third", "callback");
      mapItemsMultiple(aArg0, aArg1, new UserCallback(aArg2));
    }
    else if (arguments.length === 2) {
      // aArg0 = map function
      // aArg1 = callback
      ensureJsTypeOfArg(aArg0, "function", "First", "function");
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      mapItemsAll(aArg0, new UserCallback(aArg1));
    }
    else
      throw new ArgumentError("First", "key array or map function");
  };

  function mapItemsMultiple(aKeys, aMapFunc, aUserCallback) {
    reduceItemsMultiple(aKeys,
                        [],
                        makeMapItemsReduceFunction(aMapFunc),
                        aUserCallback,
                        true);
  }

  function mapItemsAll(aMapFunc, aUserCallback) {
    reduceItemsAll([], makeMapItemsReduceFunction(aMapFunc), aUserCallback);
  }

  function makeMapItemsReduceFunction(aMapFunc) {
    return function (map, key, val) {
      map.push(aMapFunc(key, val));
      return map;
    };
  }

  // === {{{SimpleStorage.reduceItems()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Combines items in the store by applying a function to them and accumulating
  // the result.  This method may be known as "inject" or "fold" in other
  // languages.
  //
  // ==== {{{reduceItems(keyArray, initialValue, reduceFunction, callback)}}} ====
  //
  // For each item with a given key, applies reduceFunction to it and stores the
  // return value in an accumulated result.  reduceFunction is then called with
  // the accumulated result for the item with the next given key.
  // reduceFunction is called like so:
  //
  //   reduceFunction(accumulatedValue, key, value)
  //
  // reduceFunction should return the new accumulated value.  If a given key
  // does not exist in the store, value will be undefined.  reduceItems
  // ultimately yields the accumulated value over all items with the given keys.
  //
  // * onResult(keyArray, accumulatedValue)
  // * onError(errorMessage, keyArray)
  //
  // ==== {{{reduceItems(initialValue, reduceFunction, callback)}}} ====
  //
  // For each item in the store, applies reduceFunction to it and stores the
  // return value in an accumulated result.  reduceFunction is then called with
  // the accumulated result for the next item in the store.  reduceFunction is
  // called like so:
  //
  //   reduceFunction(accumulatedValue, key, value)
  //
  // reduceFunction should return the new accumulated value.  reduceItems
  // ultimately yields the accumulated value over all items.
  //
  // * onResult(accumulatedValue)
  // * onError(errorMessage)

  this.reduceItems = function SimpleStorage_reduceItems(aArg0,
                                                        aArg1,
                                                        aArg2,
                                                        aArg3) {
    if (arguments.length === 4) {
      // aArg0 = key array
      // aArg1 = initial value
      // aArg2 = reduce function
      // aArg3 = callback
      ensureTypeOfArg(aArg0, "array", "First", "key array");
      ensureKeysAreLegal(aArg0);
      ensureJsTypeOfArg(aArg2, "function", "Third", "function");
      ensureTypeOfArg(aArg3, "callback", "Fourth", "callback");
      reduceItemsMultiple(aArg0, aArg1, aArg2, new UserCallback(aArg3), true);
    }
    else if (arguments.length === 3) {
      // aArg0 = initial value
      // aArg1 = reduce function
      // aArg2 = callback
      ensureJsTypeOfArg(aArg1, "function", "Second", "function");
      ensureTypeOfArg(aArg2, "callback", "Third", "callback");
      reduceItemsAll(aArg0, aArg1, new UserCallback(aArg2));
    }
    else
      throw new ArgumentError("First", "key array or initial value");
  };

  function reduceItemsMultiple(aKeys,
                               aMemo,
                               aReduceFunc,
                               aUserCallback,
                               aPassKeysToUserCallback) {
    var cb = makeReduceItemsCallback(aMemo,
                                     aReduceFunc,
                                     aUserCallback,
                                     aPassKeysToUserCallback ? [aKeys] : []);
    forEachItemMultiple(aKeys, cb);
  }

  function reduceItemsAll(aMemo, aReduceFunc, aUserCallback) {
    var cb = makeReduceItemsCallback(aMemo, aReduceFunc, aUserCallback, []);
    forEachItemAll(cb);
  }

  function makeReduceItemsCallback(aMemo,
                                   aReduceFunc,
                                   aUserCallback,
                                   aUserCallbackArgs) {
    return {
      onResult: function (key, val) {
        if (key === null) {
          aUserCallbackArgs.push(aMemo);
          aUserCallback.onResult.apply(aUserCallback, aUserCallbackArgs);
        }
        else
          aMemo = aReduceFunc(aMemo, key, val);
      },
      onError: function (err) {
        aUserCallbackArgs.unshift(err);
        aUserCallback.onError.apply(aUserCallback, aUserCallbackArgs);
      }
    };
  }

  // === {{{SimpleStorage.remove()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Removes items with given keys.
  //
  // ==== {{{remove(key, callback)}}} ====
  //
  // Removes the item with the given key if it exists in the store.
  //
  // * onResult(key)
  // * onError(errorMessage, key)
  //
  // ==== {{{remove(keyArray, callback)}}} ====
  //
  // Removes the items with the given keys if they exist in the store.
  //
  // * onResult(keyArray)
  // * onError(errorMessage, keyArray)

  this.remove = function SimpleStorage_remove(aArg0, aArg1) {
    switch (typeOfArg(aArg0)) {
    case "array":
      // aArg0 = key array
      // aArg1 = callback
      ensureKeysAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      removeMultiple(aArg0.slice(0), new UserCallback(aArg1));
      break;
    case "string":
      // aArg0 = key
      // aArg1 = callback
      ensureKeyIsLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      removeSingle(aArg0, new UserCallback(aArg1));
      break;
    default:
      throw new ArgumentError("First", "key or key array");
    }
  };

  function removeSingle(aKey, aUserCallback) {
    setSingle(aKey, undefined, {
      onResult: function () aUserCallback.onResult(aKey),
      onError: function (err) aUserCallback.onError(err, aKey)
    });
  }

  function removeMultiple(aKeys, aUserCallback) {
    var items = {};
    aKeys.forEach(function (key) items[key] = undefined);
    setMultiple(items, {
      onResult: function () aUserCallback.onResult(aKeys),
      onError: function (err) aUserCallback.onError(err, aKeys)
    });
  }

  // === {{{SimpleStorage.set()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Sets the values of given keys.
  //
  // ==== {{{set(key, value, callback)}}} ====
  //
  // Sets the value of the given key.  If the value is undefined, the key is
  // removed from the store.
  //
  // * onResult(key, value)
  // * onError(errorMessage, key, value)
  //
  // ==== {{{set(itemsObject, callback)}}} ====
  //
  // Sets the values of multiple keys.  itemsObject must be an object
  // { key_1: value_1, key_2: value_2, ..., key_m: value_m }.  The value of
  // each key_i is set to value_i.  If value_i is undefined, key_i is removed
  // from the store.
  //
  // * onResult(itemsObject)
  // * onError(errorMessage, itemsObject)

  this.set = function SimpleStorage_set(aArg0, aArg1, aArg2) {
    switch (typeOfArg(aArg0)) {
    case "object":
      // aArg0 = items dictionary
      // aArg1 = callback
      ensureKeysInItemsAreLegal(aArg0);
      ensureValuesInItemsAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      setMultiple(aArg0, new UserCallback(aArg1));
      break;
    case "string":
      // aArg0 = key
      // aArg1 = value
      // aArg2 = callback
      ensureKeyIsLegal(aArg0);
      ensureValueIsLegal(aArg1);
      ensureTypeOfArg(aArg2, "callback", "Third", "callback");
      setSingle(aArg0, aArg1, new UserCallback(aArg2));
      break;
    default:
      throw new ArgumentError("First", "key or item object");
    }
  };

  function setSingle(aKey, aValue, aUserCallback) {
    var items = {};
    items[aKey] = aValue;
    setMultiple(items, {
      onResult: function () aUserCallback.onResult(aKey, aValue),
      onError: function (err) aUserCallback.onError(err, aKey, aValue)
    });
  }

  function setMultiple(aItems, aUserCallback) {
    var insertSql = "INSERT OR REPLACE INTO " + TABLE_NAME + " (key, value) " +
                    "VALUES (:key, :value)";
    var deleteSql = "DELETE FROM " + TABLE_NAME + " WHERE key = :key";

    var stmts = [];
    for (let [key, val] in Iterator(aItems)) {
      if (val === undefined) {
        let stmt = dbConn.createStatement(deleteSql);
        stmt.params.key = key;
        stmts.push(stmt);
      }
      else {
        let stmt = dbConn.createStatement(insertSql);
        stmt.params.key = key;
        stmt.params.value = wrapValue(val);
        stmts.push(stmt);
      }
    }

    dbConn.executeAsync(stmts, stmts.length, {
      handleCompletion: function () aUserCallback.onResult(aItems),
      handleError: function (err) handleStorageError(err,
                                                     aUserCallback,
                                                     [aItems]),
      handleResult: function () {}
    });
    stmts.forEach(function (stmt) stmt.finalize());
  }

  // === {{{SimpleStorage.size()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Yields the number of items in the store.
  //
  // * onResult(numItems)
  // * onError(errorMessage)

  this.size = function SimpleStorage_size(aCallback) {
    ensureTypeOfArg(aCallback, "callback", "First", "callback");
    var stmt = dbConn.createStatement("SELECT count(*) FROM " + TABLE_NAME);
    var ucb = new UserCallback(aCallback);
    stmt.executeAsync({
      handleResult: function (result) {
        ucb.onResult(parseInt(result.getNextRow().getResultByIndex(0)));
      },
      handleError: function (err) handleStorageError(err, ucb),
      handleCompletion: function () {}
    });
    stmt.finalize();
  };

  // === {{{SimpleStorage.values()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Yields an array of values in the store.
  //
  // ==== {{{values(keyArray, callback)}}} ====
  //
  // Yields an array of values corresponding to the given keys.  The values are
  // ordered in the order that their keys are given.  If a given key does not
  // exist in the store, its corresponding value in the array will be undefined.
  //
  // * onResult(keyArray, valueArray)
  // * onError(errorMessage, keyArray)
  //
  // ==== {{{values(callback)}}} ====
  //
  // Yields all the values of the store in an unordered array.
  //
  // * onResult(valueArray)
  // * onError(errorMessage)

  this.values = function SimpleStorage_values(aArg0, aArg1) {
    switch (typeOfArg(aArg0)) {
    case "array":
      // aArg0 = key array
      // aArg1 = callback
      ensureKeysAreLegal(aArg0);
      ensureTypeOfArg(aArg1, "callback", "Second", "callback");
      valuesMultiple(aArg0, new UserCallback(aArg1));
      break;
    case "callback":
      // aArg0 = callback
      valuesAll(new UserCallback(aArg0));
      break;
    default:
      throw new ArgumentError("First", "key array or callback");
    }
  };

  function valuesMultiple(aKeys, aUserCallback) {
    mapItemsMultiple(aKeys, function (key, val) val, aUserCallback);
  }

  function valuesAll(aUserCallback) {
    mapItemsAll(function (key, val) val, aUserCallback);
  }

  // === {{{SimpleStorage.deleteDatabaseFile()}}} ===
  //
  // Deletes the store's backing database file.

  this.deleteDatabaseFile = function SimpleStorage_deleteDatabaseFile() {
    var file = getDatabaseFile(aFeatureId);
    deleteBackingFileStructure(file);
  };

  // === {{{SimpleStorage.teardown()}}} ===
  //
  // **This method and the rest of the async API is deprecated and will be
  // removed in a future version of Jetpack.**
  //
  // Closes the store's backing database connection.  The store must not be
  // used after calling this method.

  this.teardown = function SimpleStorage_teardown() {
    dbConn.close();
    dbConn = null;
  };
}


// DEPRECATED Helper functions ////////////////////////////////////////////////

// aPosition is the argument's position in the parameter list.  aExpectedTypes
// is a string fragment indicating the argument's expected types.
function ArgumentError(aPosition, aExpectedTypes) {
  this.__proto__ = new TypeError(aPosition + " argument must be a " +
                                 aExpectedTypes);
}

// aBadKey is the illegal key.  aKeyIndex, optional, is the index of the key in
// its key array.
function IllegalKeyError(aBadKey, aKeyIndex) {
  var msg = (aKeyIndex === undefined ? "Key" : "Key at index " + aKeyIndex) +
            " must be a string.  Got instead: " +
            aBadKey.toSource();
  this.__proto__ = new TypeError(msg);
}

// aBadValue is the illegal value.  aKey, optional, is the value's associated
// key.
function IllegalValueError(aBadValue, aKey) {
  var msg = (aKey === undefined ? "Value" : 'Value with key "' + aKey + '"') +
            " must be non-null."
  this.__proto__ = new TypeError(msg);
}

// This wraps a caller's callback to make it easy and safe to call.
// aUserCallback may be undefined, a function, or an object, and if it's an
// object, its methods onResult() and onError() are called if they exist.
// Simply use this prototype's onResult() and onError() methods freely.  Your
// UserCallback instance will do the right thing, including catching any errors
// thrown by the wrapped callback.
function UserCallback(aUserCallback) {
  this.callback = aUserCallback;
}

UserCallback.prototype = {
  onResult: function UserCallback_prototype_onResult( /* args */ ) {
    var func;
    if (typeof(this.callback) === "function")
      func = this.callback;
    else if (this.callback && typeof(this.callback.onResult) === "function")
      func = this.callback.onResult;
    if (func) {
      try {
        func.apply(this.callback, arguments);
      }
      catch (err) {
        Components.utils.reportError(err);
      }
    }
  },
  onError: function UserCallback_prototype_onError( /* args */ ) {
    if (this.callback && typeof(this.callback.onError) === "function") {
      try {
        this.callback.onError.apply(this.callback, arguments);
      }
      catch (err) {
        Components.utils.reportError(err);
      }
    }
  }
};

// Creates a directory at the given file's path if it doesn't already exist.
function ensureDirectoryExists(aFile) {
  if (aFile.exists()) {
    if (!aFile.isDirectory())
      throw new SimpleStorageError("File " + aFile.path +
                                   " exists but is not a directory.");
  }
  else
    aFile.create(aFile.DIRECTORY_TYPE, 0755);
}

// Throws an IllegalKeyError if any of the keys in the given items object are
// illegal.
function ensureKeysInItemsAreLegal(aItems) {
  for (let key in aItems) {
    if (!isKeyLegal(key))
      throw new IllegalKeyError(key);
  }
}

// Throws an IllegalKeyError if the given key is illegal.
function ensureKeyIsLegal(aKey) {
  if (!isKeyLegal(aKey))
    throw new IllegalKeyError(aKey);
}

// Throws an IllegalKeyError if any of the given keys are illegal.
function ensureKeysAreLegal(aKeys) {
  for (let i = 0; i < aKeys.length; i++) {
    if (!isKeyLegal(aKeys[i]))
      throw new IllegalKeyError(aKeys[i], i);
  }
}

// This is like ensureTypeOfArg(), except that the plain typeof() function is
// used to get aArg's type.
function ensureJsTypeOfArg(aArg, aExpectedType, aArgPosition, aExpectedMsg) {
  if (typeof(aArg) !== aExpectedType)
    throw new ArgumentError(aArgPosition, aExpectedMsg);
}

// Throws an ArgumentError if the type of the given argument, as returned by
// typeOfArg(), is unexpected.  aArg is the argument, and aExpectedType is its
// expected type, a string returned by typeOfArg().  aArgPosition and
// aExpectedMsg are strings used only in the error's informational message.
// aArgPosition indicates aArg's position in the parameter list, and
// aExpectedMsg is a fragment indicating aArg's expected type.
function ensureTypeOfArg(aArg, aExpectedType, aArgPosition, aExpectedMsg) {
  if (typeOfArg(aArg) !== aExpectedType)
    throw new ArgumentError(aArgPosition, aExpectedMsg);
}

// Throws an IllegalValueError if the given value is illegal.
function ensureValueIsLegal(aValue) {
  if (!isValueLegal(aValue))
    throw new IllegalValueError(aValue);
}

// Throws an IllegalValueError if any of the values in the given items object
// are illegal.
function ensureValuesInItemsAreLegal(aItems) {
  for (let [key, val] in Iterator(aItems)) {
    if (!isValueLegal(val))
      throw new IllegalValueError(val, key);
  }
}

// Returns the database nsIFile of the given feature.
function getDatabaseFile(aFeatureId) {
   var dir = Cc["@mozilla.org/file/directory_service;1"].
             getService(Ci.nsIProperties);
   var file = dir.get("ProfD", Ci.nsIFile);
   file.append("jetpack");
   file.append(aFeatureId);
   file.append("storage");
   file.append("simple.sqlite");
   return file;
}
 
// Creates the given feature's database file if it doesn't already exist and
// returns a connection to it.
function getOrCreateDatabase(aFeatureId) {
  var file = getDatabaseFile(aFeatureId);
  ensureDirectoryExists(file.parent);
  var stor = Cc["@mozilla.org/storage/service;1"].
             getService(Ci.mozIStorageService);
  return stor.openDatabase(file);
}

// Logs aError, a mozStorage asynchronous callback error, and calls the given
// UserCallback's onError() with the given arguments.  aCallbackArgs should be
// either undefined or an array.
function handleStorageError(aError, aUserCallback, aCallbackArgs) {
  var msg = makeErrorMsg(aError);
  logError(msg);
  aCallbackArgs = aCallbackArgs || [];
  aCallbackArgs.unshift(msg);
  aUserCallback.onError.apply(aUserCallback, aCallbackArgs);
}

// Returns true if the given key is legal and false otherwise.
function isKeyLegal(aKey) {
  return typeof(aKey) === "string";
}

// Returns true if the given value is legal and false otherwise.
function isValueLegal(aValue) {
  return aValue !== null;
}

// Logs the given error message.
function logError(aMsg) {
  console.error(aMsg);
}

// Logs an information message to the console.
function logMsg(aMsg) {
  var console = Cc["@mozilla.org/consoleservice;1"].
                getService(Ci.nsIConsoleService);
  console.logStringMessage(aMsg);
}

// Returns a message generated from the given mozStorage async callback error.
function makeErrorMsg(aStorageError) {
  return "mozIStorageError: [" + aStorageError.result + "] " +
          aStorageError.message;
}

// Returns the "type" of the given Simple Storage API method argument.  This is
// is not necessarily equivalent to typeof(aArg).  Returns "string", "callback",
// or "array" if aArg quacks like one of those types and typeof(aArg) otherwise.
// Note that if aArg is undefined, it's considered to be a callback, since
// callbacks are optional.
function typeOfArg(aArg) {
  var type = typeof(aArg);
  if (type === "string")
    return "string";
  if (type === "function" ||
      type === "undefined" ||
      (type === "object" && (typeof(aArg.onResult) === "function" ||
                             typeof(aArg.onError) === "function")))
    return "callback";
  if (type === "object" && "length" in aArg)
    return "array";
  return type;
}

// All values are wrapped in an array on set.  See wrapValue().
function unwrapValue(aRawValue) {
  return JSON.parse(aRawValue)[0];
}

// json.decode() returns null if aValue is not an object or array.  A nice hacky
// way to store primitives is to wrap them in an array.  So, we wrap all values
// in an array on set and unwrap all values on get.
function wrapValue(aJsValue) {
  return JSON.stringify([aJsValue]);
}
