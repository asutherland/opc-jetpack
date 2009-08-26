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
    var factory = Cc["@labs.mozilla.com/jetpackdi;1"]
                  .createInstance(Ci.nsIJetpack);
    var binary = factory.get();
    delete this.binary;
    this.binary = binary;
    return binary;
  },

  // Wrap a thing coming from trusted code, for export to untrusted code.
  wrapTrusted: function wrapTrusted(thing, isApply) {
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
    if (wrapper !== null) {
      if (wrapper.name == this.UntrustedWrapper.prototype.name)
        // It's already untrusted, so return the wrappee.
        return this.binary.unwrap(thing);
      if (wrapper.name == this.TrustedWrapper.prototype.name)
        // It's already wrapped for export to untrusted code, so
        // just return it.
        return thing;
    }
    return this.binary.wrap(thing, new this.TrustedWrapper(thing, isApply));
  },

  // Wrap a thing coming from untrusted code, for export to trusted code.
  wrapUntrusted: function wrapUntrusted(thing) {
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
    if (wrapper !== null) {
      if (wrapper.name == this.TrustedWrapper.prototype.name)
        // Actually, it's already wrapped with a SecureMembrane, so we
        // trust it; just return the wrappee.
        return this.binary.unwrap(thing);
      if (wrapper.name == this.UntrustedWrapper.prototype.name)
        // It's already wrapped for export to trusted code, so just
        // return it.
        return thing;
    }
    if (this.binary.getClassName(thing) == "XPCSafeJSObjectWrapper")
      thing = this.binary.unwrapAny(thing);
    return this.binary.wrap(thing, new this.UntrustedWrapper(thing));
  },

  UntrustedWrapper: function UntrustedWrapper(obj) {
    this.obj = obj;
    this.safeObj = XPCSafeJSObjectWrapper(obj);
  },

  TrustedWrapper: function TrustedWrapper(obj, isApply) {
    this.obj = obj;
    this.safeObj = obj;
    this.isApply = isApply;
  },

  // TODO: This is a workaround for #505494.
  apply: function apply(thisObj, args) {
    var wrapper = this;
    var self = SecureMembrane.binary.getWrapper(wrapper);
    var wrappee = SecureMembrane.binary.unwrap(wrapper);
    if (!(self && wrappee))
      throw "apply() called on incompatible object " + this;
    var argsArray = [];
    for (var i = 0; i < args.length; i++)
      argsArray.push(args[i]);
    return self.call(wrappee, wrapper, thisObj, argsArray);
  }
};

SecureMembrane.BaseWrapper = {
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

  enumerate: function(wrappee, wrapper) {
    for (name in wrappee)
      yield name;
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
          yield [name, this.safeGetProperty(wrappee, name)];
      }
      return keyValueIterator();
    }
  },

  convert: function(wrappee, wrapper, type) {
    // TODO: When, if ever, do we want to call valueOf()?
    if (!(type == "string" || type == "undefined"))
      return wrapper;
    var retval = "<error>";
    try {
      var str = this.safeObj.toString();
      if (typeof(str) == "string")
        retval = str;
    } catch (e) {}
    return retval;
  }
};

SecureMembrane.UntrustedWrapper.prototype = {
  name: "UntrustedMembrane",

  safeGetProperty: function(wrappee, name) {
    return SecureMembrane.wrapUntrusted(this.safeObj[name]);
  },

  resolve: function(wrappee, wrapper, name) {
    if (name in wrappee) {
      wrapper[name] = true;
      return wrapper;
    }
  },

  getProperty: function(wrappee, wrapper, name, defaultValue) {
    if (name in wrappee) {
      if (typeof(wrappee) == "function" && name == "apply")
        // TODO: This is a workaround for #505494.
        return SecureMembrane.apply;
      return SecureMembrane.wrapUntrusted(this.safeObj[name]);
    }
  },

  call: function call(wrappee, wrapper, thisObj, args) {
    if (typeof(wrappee) == "function") {
      var wrappedArgs = [];
      args.forEach(function(arg) {
                     wrappedArgs.push(SecureMembrane.wrapTrusted(arg));
                   });
      // If an exception gets thrown, it'll be XPCSafeJSObjectWrapped,
      // so no biggie.
      var result = this.safeObj.apply(SecureMembrane.wrapTrusted(thisObj),
                                      wrappedArgs);
      return SecureMembrane.wrapUntrusted(result);
    } else
      throw "object is not callable";
  },

  __proto__: SecureMembrane.BaseWrapper
};

SecureMembrane.TrustedWrapper.prototype = {
  name: "SecureMembrane",

  resolve: function(wrappee, wrapper, name) {
    if (name in wrappee) {
      var resolved = this.safeGetProperty(wrappee, name);
      // TODO: Is this safe?  What if wrapper[name] is a getter?
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
    if (typeof(wrappee) == "function" && name == "apply") {
      // TODO: This is a workaround for #505494.
      return SecureMembrane.wrapTrusted(wrappee, true);
    }
    if ((name in wrappee) ||
        (name == "wrappedJSObject" && wrappee.wrappedJSObject))
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

  construct: function construct(wrappee, wrapper, thisObj, args) {
    return this.call(wrappee, wrapper, thisObj, args);
  },

  call: function call(wrappee, wrapper, thisObj, args) {
    if (typeof(wrappee) == "function") {
      var wrappedArgs = [];
      args.forEach(function(arg) {
                     wrappedArgs.push(SecureMembrane.wrapUntrusted(arg));
                   });
      try {
        var result;
        if (this.isApply && wrappedArgs.length > 1) {
          // TODO: This is a workaround for #505494.
          var realArray = [wrappedArgs[1][i]
                           for (i in wrappedArgs[1])];
          result = wrappee.apply(wrappedArgs[0], realArray);
        } else {
          result = wrappee.apply(SecureMembrane.wrapUntrusted(thisObj),
                                 wrappedArgs);
        }
      } catch (e) {
        throw SecureMembrane.wrapTrusted(e);
      }
      return SecureMembrane.wrapTrusted(result);
    } else
      throw "object is not callable";
  },

  __proto__: SecureMembrane.BaseWrapper
};
