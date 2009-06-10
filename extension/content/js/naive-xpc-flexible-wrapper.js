(
  function(exports) {
    // TODO: Construct an eviction strategy for the cache.
    var cache = [];

    function cacheGet(target, makeWrapper) {
      for (var i = 0; i < cache.length; i++) {
        var entry = cache[i];
        var obj = entry.weakref.get();
        if (obj && obj === target)
          return entry.wrappedObject;
      }
      var wrapper = makeWrapper(target);
      cache.push({weakref: Components.utils.getWeakReference(target),
                  wrappedObject: wrapper});
      return wrapper;
    }

    function wrapFunction(target) {
      function wrappedFunction() {
        var wrappedArgs = [];
        for (var i = 0; i < arguments.length; i++) {
          wrappedArgs.push(wrap(arguments[i]));
          // TODO: What about exceptions?
          return wrap(target.apply(this, wrappedArgs));
        }
      }
      return wrappedFunction;
    }

    function wrapObject(target) {
      var wrapper = new Object();

      var names = [];
      for (name in target)
        names.push(name);
      names.forEach(
        function(name) {
          wrapper.__defineGetter__(
            name,
            function() { return wrap(target[name]); }
          );
        });
      return wrapper;
    }

    function wrap(target) {
      switch (typeof(target)) {
      case "boolean":
      case "string":
      case "number":
        return target;
      case "undefined":
        return undefined;
      case "function":
        return cacheGet(target, wrapFunction);
      case "object":
        if (target === null)
          return null;
        return cacheGet(target, wrapObject);
      }
    }

    exports.NaiveXPCFlexibleWrapper = wrap;
  }
)(this);
