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

let HOSTNAME = "chrome://jetpack";

function SettingsStore(context) {
  let s = {};
  Cu.import("resource://jetpack/modules/simple-storage.js", s);

  let ss = new s.simpleStorage.SimpleStorage(context.id, "settings");
  s.simpleStorage.register(ss);
  context.addUnloader({ unload: function () s.simpleStorage.unregister(ss) });

  let manifest;
  if ("manifest" in context &&
      context.manifest &&
      typeof(context.manifest) == "object" &&
      "settings" in context.manifest)
    manifest = context.manifest.settings;

  return new SettingsWrapper(ss, ss, context.id, manifest, []);
}

/**
 * A flexible membrane wrapper that stores passwords using the login manager
 * rather than the simple store.  This enables us to store most settings using
 * simple storage but passwords using the more secure and consistent login
 * manager storage.
 *
 * @param   store     {Object}
 *          The simple store in which settings are stored.  We need this
 *          to flush settings changes to disk.
 *
 * @param   settings  {Object}
 *          Some settings for a jetpack.  This is either the top-level object
 *          representing all settings for a jetpack or an intermediate object
 *          representing a group of settings in a settings group within
 *          the top-level object.
 *
 * @param   id        {String}
 *          The ID of the jetpack.  We need this to uniquely identify passwords,
 *          which we store in the login manager.
 *
 * @param   spec      {Array}  [optional]
 *          The object in the jetpack's manifest that describes the settings.
 *          This can be undefined if we're wrapping an object whose spec has
 *          been removed from the manifest, since we keep those objects around
 *          to enable jetpacks to retrieve information from them.
 *
 * @param   path      {Object}
 *          The path to the settings object within the object hierarchy.
 *
 * Note: ideally, we'd like SettingsWrapper to be able to wrap an object
 * without regard to the location of the object within the object hierarchy
 * in the settings data structure, but when storing passwords, we have to
 * include the path of the password in the URL with which we identify it
 * in the login manager, so SettingsWrapper instances have to know their paths.
 */
function SettingsWrapper(store, settings, id, spec, path) {
  this._store = store;
  this._settings = settings;
  this._id = id;

  // Convert the spec from the ordered list in which it is provided to us
  // to an unordered collection to make it easier/faster to retrieve specific
  // settings by ID.
  spec = spec || [];
  this._spec = {};
  for each (let setting in spec)
    this._spec[setting.name] = setting;

  this._path = path;

  let tortilleria = Cc["@labs.mozilla.com/jetpackdi;1"].
                    createInstance(Ci.nsIJetpack);
  let tortilla = tortilleria.get();
  let burrito = tortilla.wrap(settings, this);

  return burrito;
}

SettingsWrapper.prototype = {
  _store: null,
  _settings: null,
  _id: null,
  _spec: null,
  _path: null,

  get _loginManager() {
    let _loginManager = Cc["@mozilla.org/login-manager;1"].
                        getService(Ci.nsILoginManager);
    this.__defineGetter__("_loginManager", function() _loginManager);
    return this._loginManager;
  },

  // Whether or not we are currently in a call to the resolve function.
  // We use this to bail out of setProperty early if we're currently resolving,
  // since we set wrapper[name] in resolve, and that triggers a call to
  // setProperty, but we don't actually want to set the property, which would
  // cause the value to get written to the store, even if it hasn't changed
  // or is the default value.
  _resolving: false,

  /**
   * Resolve a nonexistent property to its value.  Supposedly this happens
   * when a nonexistent property is first accessed, in case its value is lazily
   * loaded.  An expression as simple as |"foo" in bar| can trigger it.
   *
   * If the property is a password, we check in the login manager.  Otherwise
   * we check in the wrapped object.
   */
  resolve: function(wrappee, wrapper, name) {
    if (name in this._spec && this._spec[name].type == "password" &&
        this._hasPassword(name)) {
      this._resolving = true;
      wrapper[name] = this._getPassword(name);
      this._resolving = false;
      return wrapper;
    }

    if (name in wrappee) {
      this._resolving = true;
      wrapper[name] = wrappee[name];
      this._resolving = false;
      return wrapper;
    }

    if (name in this._spec && "default" in this._spec[name]) {
      this._resolving = true;
      wrapper[name] = this._spec[name]["default"];
      this._resolving = false;
      return wrapper;
    }

    // XXX JavaScript strict warning: this function does not always return
    // a value.  What should we return here if none of the above was true?
  },

  addProperty: function(wrappee, wrapper, name, defaultValue) {},

  delProperty: function(wrappee, wrapper, name) {
    if (name in this._spec && this._spec[name].type == "password")
      this._delPassword(name);
    else {
      delete wrappee[name];
      this._store.sync();
    }

    return true;
  },

  getProperty: function(wrappee, wrapper, name, defaultValue) {
    let value;

    // If it's a password, retrieve it from the login manager rather than
    // the simple store.
    if (name in this._spec && this._spec[name].type == "password") {
      value = this._getPassword(name);
    }
    else {
      // Make sure the object for a group exists so we can try to retrieve
      // its members without triggering a JavaScript exception.
      if (!(name in wrappee) && name in this._spec &&
          this._spec[name].type == "group") {
        wrappee[name] = {};
      }

      if (typeof wrappee[name] == "object") {
        value = new SettingsWrapper(this._store,
                                    wrappee[name],
                                    this._id,
                                    this._spec[name].settings,
                                    this._path.concat(name));
      }
      else {
        value = wrappee[name];
      }
    }

    // If the setting has no user-entered value, but it does have a default
    // value, use that value.
    if (typeof value == "undefined" && name in this._spec &&
        "default" in this._spec[name])
      value = this._spec[name]["default"];

    return value;
  },

  setProperty: function(wrappee, wrapper, name, defaultValue) {
    if (this._resolving)
      return;

    if (!(name in this._spec))
      throw new Error("can't set setting not specified in manifest");

    let value;

    // If it's a password, store it in the login manager rather than
    // the simple store.
    if (this._spec[name].type == "password") {
      value = this._setPassword(name, defaultValue);
    }

    // If it's a group, create a new object, wrap it with a wrapper, and set
    // its properties individually so we can validate them against the manifest.
    else if (this._spec[name].type == "group") {
      value = new SettingsWrapper(this._store,
                                  {},
                                  this._id,
                                  this._spec[name].settings,
                                  this._path.concat(name));
      for (let property in defaultValue)
        value[property] = defaultValue[property];
    }

    // It's a simple value, so set its property as normal.
    else {
      value = wrappee[name] = defaultValue;
      this._store.sync();
    }

    // XXX Are we supposed to return the new value of the property?
    return value;
  },

  iteratorObject: function(wrappee, wrapper, keysonly) {
    dump("SettingsStore::iteratorObject\n");
    if (keysonly) {
      function keyIterator() {
        for (name in wrappee)
          yield name;
      }
      return keyIterator();
    } else {
      function keyValueIterator() {
        for (name in wrappee)
          yield [name, wrappee[name]];
      }
      return keyValueIterator();
    }
  },

  enumerate: function(wrappee, wrapper) {
    console.error("SettingsStore::enumerate not implemented\n");
  },

  /**
   * Get the realm for the given property name.  The realm is the string
   * by which we identify the property when storing it in and retrieving it
   * from the login manager.
   */
  _getRealm: function(name) {
    let parts = [].concat(this._id, this._path, name);
    return "/" + parts.map(function(v) encodeURIComponent(v)).join("/");
  },

  _hasPassword: function(name) {
    let realm = this._getRealm(name);
    return (this._loginManager.countLogins(HOSTNAME, null, realm) > 0);
  },

  _getPassword: function(name) {
    let realm = this._getRealm(name);

    // We use countLogins instead of just findLogins because it doesn't prompt
    // the user to enter their master password, so this way we can avoid that
    // prompt if the password doesn't exist.
    if (this._loginManager.countLogins(HOSTNAME, null, realm) > 0) {
      let login = this._loginManager.findLogins({}, HOSTNAME, null, realm)[0];
      return login.password;
    }

    return undefined;
  },

  _setPassword: function(name, value) {
    let realm = this._getRealm(name);

    // TODO: validate value, f.e. make sure it isn't undefined, which the login
    // manager can't deal with (it stores the value without complaint, but an
    // attempt to retrieve the value causes the manager to throw an exception).

    if (this._loginManager.countLogins(HOSTNAME, null, realm) > 0) {
      let oldLogin =
        this._loginManager.findLogins({}, HOSTNAME, null, realm)[0];
      let newLogin = oldLogin.clone();
      newLogin.password = value;
      this._loginManager.modifyLogin(oldLogin, newLogin);
    }
    else {
      let login = Cc["@mozilla.org/login-manager/loginInfo;1"].
                  createInstance(Ci.nsILoginInfo);
      login.init(HOSTNAME, null, realm, "", value, "", "");
      this._loginManager.addLogin(login);
    }

    return value;
  },

  _delPassword: function(name) {
    let realm = this._getRealm(name);

    if (this._loginManager.countLogins(HOSTNAME, null, realm) > 0) {
      let login = this._loginManager.findLogins({}, HOSTNAME, null, realm)[0];
      this._loginManager.removeLogin(login);
    }
  }

};
