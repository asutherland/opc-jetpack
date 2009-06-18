if (this.window)
  // We're not running in xpcshell, so define print().
  function print(msg) {
    var output = document.getElementById('output');
    var text = document.createTextNode(msg + '\n');
    output.appendChild(text);
  };

print("\nRunning wrapper test suite.\n");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

function wrap(resolver) {
  var factory = Cc["@labs.mozilla.com/jsweakrefdi;1"]
                .createInstance(Ci.nsIJSWeakRef);
  return factory.set(resolver);
}

function assert(a, msg) {
  if (!a)
    throw new Error("Assertion failed: " + msg);
}

function assertEqual(a, b) {
  if (a != b)
    throw new Error('"' + a + '" is not equal to ' +
                    '"' + b + '"');
}

var resolver = {
  resolve: function(self, name) {
    print("resolve on " + name);
    if (name == 'blarg') {
      print('resolving blarg now!');
      self.__defineGetter__('blarg',
                            function() { return 'boop'; });
      return self;
    }
  },

  enumerateCalled: false,

  enumerate: function(self) {
    this.enumerateCalled = true;
  },

  addProperty: function(self, name, defaultValue) {
    if (name == 'foo')
      return defaultValue + 1;
    return defaultValue;
  },

  delProperty: function(self, name) {
    if (name == 'foo') {
      print('delProperty ' + name);
      // TODO: We'd like to just return false here to indicate that
      // the property can't be deleted, as specified in MDC, but this
      // doesn't seem to do anything, so we'll throw an exception.
      throw new Error('no wai');
    }
    return true;
  },

  getProperty: function(self, name, defaultValue) {
    print('get ' + name);
    if (name == "nom")
      return "nowai";
    return defaultValue;
  },

  setProperty: function(self, name, defaultValue) {
    print('set ' + name);
    if (name == 'foo')
      return defaultValue + 1;
    return defaultValue;
  }
};

var wrapped = wrap(resolver);

assertEqual(wrapped.toString(), "[object XPCFlexibleWrapper]");

assertEqual(wrapped.blarg, "boop");
assertEqual(wrapped.blarg, "boop");

assertEqual(resolver.enumerateCalled, false);
for (name in wrapped) {}
assertEqual(resolver.enumerateCalled, true);

wrapped.foo = 2;
assertEqual(wrapped.foo, 4);

try { delete wrapped.foo; } catch (e) {}
assertEqual(wrapped.foo, 4);

assertEqual(wrapped.nom, "nowai");

var sandbox = new Cu.Sandbox("http://www.google.com");
sandbox.wrapped = wrapped;
assertEqual(Cu.evalInSandbox("wrapped.nom", sandbox), "nowai");

wrapped = wrap({});
assertEqual(wrapped.blargle, undefined);

function testGCWorks() {
  var resolver = {
    getProperty: function(self, name, defaultValue) {
      if (name == "foo")
        return "bar";
      return defaultValue;
    }
  };
  var weakref = Cu.getWeakReference(resolver);
  var wrapped = wrap(resolver);
  resolver = undefined;
  Cu.forceGC();
  assert(weakref.get(), "weakref should still exist");
  wrapped = undefined;
  Cu.forceGC();
  assertEqual(weakref.get(), null);
}

testGCWorks();

print("All tests passed!");
