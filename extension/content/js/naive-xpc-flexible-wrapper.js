(
  function(exports) {
    // TODO: Construct an eviction strategy for the cache.
    var cache = [];

    function cacheGet(target, makeWrapper, options) {
      for (var i = 0; i < cache.length; i++) {
        var entry = cache[i];
        var obj = entry.weakref.get();
        if (obj &&
            obj === target &&
            entry.options.trustedPrincipal == options.trustedPrincipal &&
            entry.options.untrustedPrincipal == options.untrustedPrincipal) {
          var wrapper = entry.weakWrapper.get();
          if (wrapper)
            return wrapper;
          cache.splice(i, 1);
          break;
        }
      }
      var wrapper = makeWrapper(target, options);
      cache.push({weakref: Components.utils.getWeakReference(target),
                  weakWrapper: Components.utils.getWeakReference(wrapper),
                  options: options});
      return wrapper;
    }

    function wrapFunction(target, options) {
      var sandbox = new Components.utils.Sandbox(options.untrustedPrincipal);

      var reverseOptions = {
        trustedPrincipal: options.untrustedPrincipal,
        untrustedPrincipal: options.trustedPrincipal
      };

      sandbox.importFunction(
        function wrappedFunction() {
          var wrappedArgs = [];
          for (var i = 0; i < arguments.length; i++)
            wrappedArgs.push(wrap(arguments[i], reverseOptions));
          // TODO: What about exceptions?
          var retval = wrap(target.apply(this, wrappedArgs),
                            reverseOptions);
          // TODO: This doesn't support recursive functions.
          sandbox.result = retval;
        });

      function wrappedCaller() {
        wrappedFunction.apply(this, arguments);
        return result;
      }

      Components.utils.evalInSandbox(wrappedCaller.toString(),
                                     sandbox);

      MemoryTracking.track(sandbox.wrappedCaller,
                           "NaiveXPCFlexibleWrappedFuncton");
      return sandbox.wrappedCaller;
    }

    function wrapObject(target, options) {
      var sandbox = new Components.utils.Sandbox(options.untrustedPrincipal);

      Components.utils.evalInSandbox("wrapper = new Object();", sandbox);

      var names = [];
      for (name in target)
        names.push(name);

      Components.utils.evalInSandbox("names = " + uneval(names) + ";",
                                     sandbox);

      sandbox.importFunction(
        function get(name) {
          // TODO: wrap name in an XPCSafeJSObjectWrapper?
          sandbox.result = wrap(target[name], options);
        });

      function makeGetters() {
        names.forEach(
          function(name) {
            wrapper.__defineGetter__(
              name,
              function() {
                get(name);
                return result;
              }
            );
          });
      }

      Components.utils.evalInSandbox("(" + makeGetters.toString() + ")();",
                                     sandbox);

      MemoryTracking.track(sandbox.wrapper,
                           "NaiveXPCFlexibleWrappedObject");
      return sandbox.wrapper;
    }

    function wrap(target, options) {
      switch (typeof(target)) {
      case "boolean":
      case "string":
      case "number":
        return target;
      case "undefined":
        return undefined;
      case "function":
        return cacheGet(target, wrapFunction, options);
      case "object":
        if (target === null)
          return null;
        return cacheGet(target, wrapObject, options);
      }
    }

    exports.NaiveXPCFlexibleWrapper = function(target, options) {
      if (!options)
        options = new Object();

      if (!options.trustedPrincipal)
        options.trustedPrincipal = window;

      if (!options.untrustedPrincipal)
        options.untrustedPrincipal = window;

      return wrap(target, options);
    };
  }
)(this);
