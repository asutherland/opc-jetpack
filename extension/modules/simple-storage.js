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
 *   David Dahl <ddahl@mozilla.com>   (Original Author)
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
// This module implements asynchronous simple storage as proposed in
// [[https://wiki.mozilla.org/Labs/Jetpack/JEP/11|JEP 11]].  It is implemented
// using asynchronous mozStorage.
//
// Callbacks passed to the API's methods may be either functions or objects.
// If a callback is a function, it is called when its associated asynchronous
// operation successfully completes.  If a callback is an object, it should
// define the method onResult and, optionally, the method onError.  onResult
// is called on successful completion, and onError is called if an error
// occurs.  In the method documentation that follows, "onResult" is used to
// refer to either the function form or the object.onResult form.
//
// Each Jetpack feature that uses simple storage gets its own private backing
// SQLite database.  This has the following benefits:
//
// * Sandboxing.  One feature cannot touch another's database using only this
//   API.  Even if a feature manages to mangle its database, the databases of
//   others are unaffected.
//
// * Performance.  Separate databases implies smaller databases.
//
// * At the implementation level there is no need to worry about whether to use
//   shared or unshared database connections or SQLite locking in the context
//   of asynchronous access across multiple Jetpack features.
//
// Each feature's database is stored in the file system at the following path:
//
// * ProfD/jetpack/featureId/storage/simple.sqlite
//
// where ProfD is the user's Firefox profile directory and featureId is the
// "ID" of the feature.  To generate a feature's ID, we hash its URL.  See
// featureUrlToId() below.

var EXPORTED_SYMBOLS = ["SimpleStorage"];

var Cc = Components.classes;
var Ci = Components.interfaces;

var TABLE_NAME = "simple_storage";

var CREATE_COLUMN_SQL = [
  "key TEXT PRIMARY KEY NOT NULL UNIQUE",
  "value TEXT"
];

var json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);

// == The SimpleStorage Class ==
//
// Each Jetpack feature is tied to an instance of simple storage, and that's
// reflected in the code.  Create a new {{{SimpleStorage}}} object with this
// constructor, passing in the feature's URL.

function SimpleStorage(aFeatureUrl) {
  //XXXadw Now that simple storage is a real JS module, this doesn't work.
//   Components.utils.import("resource://jetpack/modules/tracking.js");
//   MemoryTracking.track(this);

  if (typeof(aFeatureUrl) !== "string"|| !aFeatureUrl) {
    throw new Error("Feature URL must be a nonempty string");
  }

  this.featureUrl = aFeatureUrl;
  this.featureId = featureUrlToId(aFeatureUrl);
  var dbConn = getOrCreateDatabase(this.featureId);
  ensureDatabaseIsSetup(dbConn);

  // === {{{SimpleStorage.get()}}} ===
  //
  // Gets the value of the given key.  aCallback is either a callback function
  // or a callback object.  (See this module's introductory documentation.)
  // The onResult callback is called as
  //
  //   onResult(aKey, value)
  //
  // where aKey is the given key and value is the associated value.  value
  // will be undefined if aKey does not exist in the store.
  //
  // The onError callback is called as
  //
  //   onError(aKey, errorMessage)

  this.get = function SimpleStorage_get(aKey, aCallback) {
    if (!isKeyLegal(aKey)) {
      throw new Error("Key must be a string");
    }

    var sql = "SELECT value FROM " + TABLE_NAME + " WHERE key = :key";
    var stmt = dbConn.createStatement(sql);
    stmt.params.key = aKey;

    var storageCallback = null;
    if (aCallback) {
      var gottenValue;
      var callback = new CanonicalCallback(aCallback);
      storageCallback = {
        handleResult: function (aResultSet) {
          var row = aResultSet.getNextRow();
          // All values are wrapped in an array on set.  See the comment there.
          gottenValue = json.decode(row.getResultByName("value"))[0];
        },
        handleCompletion: function () {
          // gottenValue === undefined iff there were no results.
          var value = (gottenValue === undefined ? undefined : gottenValue);
          callback.onResult(aKey, value);
        },
        handleError: function (aError) {
          var msg = makeErrorMsg(aError);
          logError(msg);
          callback.onError(aKey, msg);
        }
      };
    }
    stmt.executeAsync(storageCallback);
    stmt.finalize();
  };

  // === {{{SimpleStorage.remove()}}} ===
  //
  // Removes the value with the given key if the key exists.  Otherwise does
  // nothing.  aCallback is either a callback function or a callback object.
  // (See this module's introductory documentation.)  The onResult callback is
  // called as
  //
  //   onResult(aKey)
  //
  // where aKey is the given key.
  //
  // The onError callback is called as
  //
  //   onError(aKey, errorMessage)

  this.remove = function SimpleStorage_remove(aKey, aCallback) {
    if (!isKeyLegal(aKey)) {
      throw new Error("Key must be a string");
    }

    var sql = "DELETE FROM " + TABLE_NAME + " WHERE key = :key";
    var stmt = dbConn.createStatement(sql);
    stmt.params.key = aKey;
    var storageCallback = null;
    if (aCallback) {
      var callback = new CanonicalCallback(aCallback);
      storageCallback = {
        handleCompletion: function () {
          callback.onResult(aKey);
        },
        handleError: function (aError) {
          var msg = makeErrorMsg(aError);
          logError(msg);
          callback.onError(aKey, msg);
        },
        handleResult: function () {}
      };
    }
    stmt.executeAsync(storageCallback);
    stmt.finalize();
  };

  // === {{{SimpleStorage.set()}}} ===
  //
  // Sets the value of the given key.  If aValue is undefined, this method is
  // equivalent to calling {{{SimpleStorage.remove()}}}.  aCallback is either
  // a callback function or a callback object.  (See this module's introductory
  // documentation.)  The onResult callback is called as
  //
  //   onResult(aKey, aValue)
  //
  // where aKey and aValue are the given key and value.  
  //
  // The onError callback is called as
  //
  //   onError(aKey, aValue, errorMessage)

  this.set = function SimpleStorage_set(aKey, aValue, aCallback) {
    if (!isKeyLegal(aKey)) {
      throw new Error("Key must be a string");
    }

    if (aValue === undefined) {
      this.remove(aKey, function () aCallback(aKey, aValue));
    }
    else {
      var sql = "INSERT OR REPLACE INTO " + TABLE_NAME + " (key, value) " +
                "VALUES (:key, :value)";
      var stmt = dbConn.createStatement(sql);
      stmt.params.key = aKey;

      // json.encode returns null if aValue is not an object or array.  A nice
      // hacky way to store primitives is to wrap them in an array.  So, we
      // wrap all values in an array on set and unwrap all values on get.
      stmt.params.value = json.encode([aValue]);

      var storageCallback = null;
      if (aCallback) {
        var callback = new CanonicalCallback(aCallback);
        storageCallback = {
          handleCompletion: function () {
            callback.onResult(aKey, aValue);
          },
          handleError: function (aError) {
            var msg = makeErrorMsg(aError);
            logError(msg);
            callback.onError(aKey, aValue, msg);
          },
          handleResult: function () {}
        };
      }
      stmt.executeAsync(storageCallback);
      stmt.finalize();
    }
  };

  // === {{{SimpleStorage.teardown()}}} ===
  //
  // Closes the store's backing database connection.  The store must not be
  // used after calling this method.

  this.teardown = function SimpleStorage_teardown() {
    dbConn.close();
    dbConn = null;
  };

  //XXXadw TODO Delete the DB file when the feature is purged.
  this.deleteDatabaseFile = function SimpleStorage_deleteDatabaseFile() {
    throw "NOT YET IMPLEMENTED";
  };
}

// This wraps a caller's callback to make calling it easier.
function CanonicalCallback(aUserCallback) {
  this.userCallback = aUserCallback;
}

CanonicalCallback.prototype = {
  onResult: function CanonicalCallback_prototype_onResult() {
    if (typeof(this.userCallback) === "function") {
      this.userCallback.apply(this.userCallback, arguments);
    }
    else if (typeof(this.userCallback.onResult) === "function") {
      this.userCallback.onResult.apply(this.userCallback, arguments);
    }
  },
  onError: function CanonicalCallback_prototype_onError() {
    if (typeof(this.userCallback.onError) === "function") {
      this.userCallback.onError.apply(this.userCallback, arguments);
    }
  }
};

function bytesToHexString(aByteStr) {
  return Array.map(
    aByteStr, function (c) ("0" + c.charCodeAt(0).toString(16)).slice(-2)
  ).join("");
}

function ensureDatabaseIsSetup(aDBConn) {
  if (!aDBConn.tableExists(TABLE_NAME)) {
    aDBConn.createTable(TABLE_NAME, CREATE_COLUMN_SQL.join(", "));
  }
}

function ensureDirectoryExists(aFile) {
  if (aFile.exists()) {
    if (!aFile.isDirectory()) {
      throw new Error("File " + aFile.path + " exists but is not a directory");
    }
  }
  else {
    aFile.create(aFile.DIRECTORY_TYPE, 0755);
  }
}

function featureUrlToId(aFeatureUrl) {
  return hashString(aFeatureUrl);
}

function getOrCreateDatabase(aFeatureId) {
  var dir = Cc["@mozilla.org/file/directory_service;1"].
            getService(Ci.nsIProperties);
  var file = dir.get("ProfD", Ci.nsIFile);
  file.append("jetpack");
  ensureDirectoryExists(file);
  file.append(aFeatureId);
  ensureDirectoryExists(file);
  file.append("storage");
  ensureDirectoryExists(file);
  file.append("simple.sqlite");

  var stor = Cc["@mozilla.org/storage/service;1"].
             getService(Ci.mozIStorageService);
  return stor.openDatabase(file);
}

function hashString(aStr) {
  var stream = Cc["@mozilla.org/io/string-input-stream;1"].
               createInstance(Ci.nsIStringInputStream);
  stream.setData(aStr, aStr.length);
  var cryp = Cc["@mozilla.org/security/hash;1"].
             createInstance(Ci.nsICryptoHash);
  cryp.init(cryp.SHA1);
  cryp.updateFromStream(stream, aStr.length);
  return bytesToHexString(cryp.finish(false));
}

function isKeyLegal(aKey) {
  return typeof(aKey) === "string";
}

function logError(aMsg) {
  console.error(aMsg);
}

function makeErrorMsg(aStorageError) {
  return "mozIStorageError: [" + aStorageError.result + "] " +
          aStorageError.message;
}
