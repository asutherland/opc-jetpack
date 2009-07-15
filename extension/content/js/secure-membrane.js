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

  wrap: function wrap(thing) {
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
        wrapper.name == this.Wrapper.prototype.name)
      return thing;
    return this.binary.wrap(thing, new this.Wrapper(thing));
  },

  Wrapper: function Wrapper(obj) {
    dump("new wrapper\n");
    this.obj = obj;
  }
};

SecureMembrane.Wrapper.prototype = {
  name: "SecureMembrane",

  // The kind of membrane we want to wrap untrusted code in.
  wrapUntrusted: XPCSafeJSObjectWrapper,

  // Bad property names that we never want to give anything access
  // to.
  badProperties: {"eval": null,
                  "prototype": null,
                  "Components": null,
                  "__proto__": null,
                  "__parent__": null,
                  "caller": null},

  getProperty: function(wrappee, wrapper, name, defaultValue) {
    dump("getproperty " + name + "\n");
    if (name in this.badProperties)
      return null;
    return SecureMembrane.wrap(wrappee[name]);
  },

  setProperty: function(wrappee, wrapper, name, defaultValue) {
    dump("setproperty\n");
    throw "object properties are read-only";
  },

  delProperty: function(wrappee, wrapper, name) {
    dump("delproperty\n");
    throw "object properties are read-only";
  },

  call: function call(wrappee, wrapper, thisObj, args) {
    dump("call\n");
    if (typeof(wrappee) == "function") {
      var wrappedArgs = [];
      args.forEach(function(arg) {
                     wrappedArgs.push(this.wrapUntrusted(arg));
                   });
      try {
        var result = wrappee.apply(this.wrapUntrusted(thisObj),
                                   wrappedArgs);
      } catch (e) {
        throw SecureMembrane.wrap(e);
      }
      return SecureMembrane.wrap(result);
    } else
      throw "object is not callable";
  },

  enumerate: function(wrappee, wrapper) {
    dump("ENUMERATE!\n");
    for (name in wrappee)
      yield name;
  },

  iteratorObject: function(wrappee, wrapper, keysonly) {
    dump("iterator " + keysonly + "\n");
    if (keysonly) {
      function keyIterator() {
        for (name in wrappee)
          yield name;
      }
      return keyIterator();
    } else {
      function keyValueIterator() {
        for (name in wrappee)
          yield [name, SecureMembrane.wrap(wrappee[name])];
      }
      return keyValueIterator();
    }
  }
};
