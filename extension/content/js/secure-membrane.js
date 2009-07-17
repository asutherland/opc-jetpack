var SecureMembrane = {
  get isAvailable() {
    var binary;
    try {
      binary = this.binary;
    } catch (e) {
      return false;
    }
    if (binary)
      return true;
    return false;
  },

  get binary() {
    var factory = Cc["@labs.mozilla.com/jsweakrefdi;1"]
                  .createInstance(Ci.nsIJSWeakRef);
    var binary = factory.set();
    delete this.binary;
    this.binary = binary;
    return binary;
  },

  // Wrap a thing coming from trusted code, for export to untrusted code.
  wrapTrusted: function wrapTrusted(thing) {
    switch (typeof(thing)) {
    case "number":
    case "string":
    case "boolean":
    case "undefined":
      return thing;
    case "object":
      if (thing === null)
        return null;
      // TODO: What about regular expressions? There was something in
      // the original XPCSafeJSObjectWrapper that cleared some state
      // with regexps.
    }

    var wrapper = this.binary.getWrapper(thing);
    // TODO: What if the object is wrapped many times? We may need to
    // recurse through all the levels of wrapping.
    if (wrapper !== null &&
        wrapper.name == this.TrustedWrapper.prototype.name)
      return thing;
    return this.binary.wrap(thing, new this.TrustedWrapper(thing));
  },

  // Wrap a thing coming from untrusted code, for export to trusted code.
  wrapUntrusted: function wrapUntrusted(thing) {
    var wrapper = this.binary.getWrapper(thing);
    // TODO: What if the object is wrapped many times? We may need to
    // recurse through all the levels of wrapping.
    if (wrapper !== null &&
        wrapper.name == this.TrustedWrapper.prototype.name)
      // Actually, it's already wrapped with a SecureMembrane, so we trust it.
      return this.binary.unwrap(thing);
    return XPCSafeJSObjectWrapper(thing);
  },

  TrustedWrapper: function TrustedWrapper(obj) {
    this.obj = obj;
  }
};

SecureMembrane.TrustedWrapper.prototype = {
  name: "SecureMembrane",

  isPropertyDangerous: function(name) {
    switch (name) {
    case "eval":
    case "prototype":
    case "Components":
    case "__proto__":
    case "__parent__":
    case "caller":
      return true;
    default:
      return false;
    }
  },

  resolve: function(wrappee, wrapper, name) {
    if (name in wrappee) {
      var resolved = this.safeGetProperty(wrappee, name);
      wrapper[name] = resolved;
      return wrapper;
    }
  },

  safeGetProperty: function(wrappee, name) {
    if (this.isPropertyDangerous(name))
      return undefined;
    var value;
    try {
      value = wrappee[name];
    } catch (e) {
      throw SecureMembrane.wrapTrusted(e);
    }
    return SecureMembrane.wrapTrusted(value);
  },

  getProperty: function(wrappee, wrapper, name, defaultValue) {
    if (name in wrappee)
      return this.safeGetProperty(wrappee, name);
    return undefined;
  },

  setProperty: function(wrappee, wrapper, name, defaultValue) {
    if (Components.stack.filename == Components.stack.caller.filename)
      // We're being called by our own wrapper code, e.g. resolve, so
      // don't write back to our wrappee.
      return defaultValue;
    if (this.isPropertyDangerous(name))
      throw "Permission to set " + name + " denied";
    try {
      wrappee[name] = SecureMembrane.wrapUntrusted(defaultValue);
    } catch (e) {
      throw SecureMembrane.wrapTrusted(e);
    }
    return defaultValue;
  },

  delProperty: function(wrappee, wrapper, name) {
    if (this.isPropertyDangerous(name))
      throw "Permission to delete " + name + " denied";
    try {
      delete wrappee[name];
    } catch (e) {
      throw SecureMembrane.wrapTrusted(e);
    }
    return true;
  },

  call: function call(wrappee, wrapper, thisObj, args) {
    if (typeof(wrappee) == "function") {
      var wrappedArgs = [];
      args.forEach(function(arg) {
                     wrappedArgs.push(SecureMembrane.wrapUntrusted(arg));
                   });
      try {
        var result = wrappee.apply(SecureMembrane.wrapUntrusted(thisObj),
                                   wrappedArgs);
      } catch (e) {
        throw SecureMembrane.wrapTrusted(e);
      }
      return SecureMembrane.wrapTrusted(result);
    } else
      throw "object is not callable";
  },

  enumerate: function(wrappee, wrapper) {
    for (name in wrappee)
      yield name;
  },

  convert: function(wrappee, wrapper, type) {
    // TODO: When, if ever, do we want to call valueOf()?
    var retval = "<error>";
    try {
      var str = wrappee.toString();
      if (typeof(str) == "string")
        retval = "[SecureMembraned " + str + "]";
    } catch (e) {}
    return retval;
  },

  iteratorObject: function(wrappee, wrapper, keysonly) {
    if (keysonly) {
      function keyIterator() {
        for (name in wrappee)
          yield name;
      }
      return keyIterator();
    } else {
      var self = this;
      function keyValueIterator() {
        for (name in wrappee)
          yield [name, self.safeGetProperty(wrappee, name)];
      }
      return keyValueIterator();
    }
  }
};
