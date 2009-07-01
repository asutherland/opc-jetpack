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

(function importEndpoint(exports) {
   var factory = Cc["@labs.mozilla.com/jsweakrefdi;1"]
                 .createInstance(Ci.nsIJSWeakRef);
   var endpoint = factory.set();
   for (name in endpoint) {
     if (endpoint.hasOwnProperty(name)) {
       var obj = endpoint[name];
       if (typeof(obj) == "function")
	 exports[name] = obj;
     }
   }
 })(this);

function assert(a, msg) {
  if (!a)
    throw new Error("Assertion failed: " + msg);
}

function assertEqual(a, b) {
  if (a != b)
    throw new Error('"' + a + '" is not equal to ' +
                    '"' + b + '"');
}

function assertThrows(func, validator, msg) {
  try {
    func();
  } catch (e) {
    switch (typeof(validator)) {
    case "string":
      assertEqual(e.toString(), validator);
      break;
    default:
      throw new Error("Not sure what to do with " + validator);
    }
    return;
  }
  throw new Error("Assertion failed: " + msg);
}

var resolver = {
  resolve: function(wrappee, wrapper, name) {
    print("resolve on " + name);
    if (name == 'blarg') {
      print('resolving blarg now!');
      wrapper.blarg = 'boop';
      return wrapper;
    }
    if (name == 'toString') {
      wrapper.toString = function() { return "[my wrapped object]"; };
      return wrapper;
    }
  },

  enumerateCalled: false,

  enumerate: function(wrappee, wrapper) {
    this.enumerateCalled = true;
    yield "i am enumerating!";
    yield 2;
  },

  addProperty: function(wrappee, wrapper, name, defaultValue) {
    if (name == 'foo')
      return defaultValue + 1;
    return defaultValue;
  },

  delProperty: function(wrappee, wrapper, name) {
    if (name == 'foo') {
      print('delProperty ' + name);
      // TODO: We'd like to just return false here to indicate that
      // the property can't be deleted, as specified in MDC, but this
      // doesn't seem to do anything, so we'll throw an exception.
      throw new Error('no wai');
    }
    return true;
  },

  getProperty: function(wrappee, wrapper, name, defaultValue) {
    print('get ' + name);
    if (name == "nom")
      return "nowai";
    return defaultValue;
  },

  setProperty: function(wrappee, wrapper, name, defaultValue) {
    print('set ' + name);
    if (name == 'foo')
      return defaultValue + 1;
    return defaultValue;
  },

  iteratorObject: function(wrappee, wrapper, keysonly) {
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
  }
};

var object = {a: 5};
var wrapped = wrap(object, resolver);

for each (name in ["__parent__", "__proto__", "prototype", "constructor"]) {
  assert(wrapped[name] === undefined,
         name + " property of wrapped object should be undefined");
}

assertEqual(typeof(wrapped), "object");
assertEqual(wrapped, "[my wrapped object]");

assertEqual(wrapped.blarg, "boop");
assertEqual(wrapped.blarg, "boop");

for (name in wrapped) {}
for each (obj in wrapped) {}
var iter = Iterator(wrapped);
assertEqual(iter.next()[0], "a");

assertEqual(resolver.enumerateCalled, false);
assertEqual(enumerate(wrapped)[0], "i am enumerating!");
assertEqual(resolver.enumerateCalled, true);

// TODO: Somehow create a test that calls the enumerate hook. It used to be
// automatically called when doing a for..in loop, but when the iteratorObject
// hook was added, it got called instead.

assertThrows(function() {
               var wrapper = wrap({}, {});
               for (name in wrapper) {}
             },
             "Error: iteratorObject() is unimplemented.",
             "Iterating over a wrapper with no defined iterator should " +
             "throw an error.");

wrapped.foo = 2;
assertEqual(wrapped.foo, 4);

assertThrows(function() { delete wrapped.foo; },
             "Error: no wai",
             "property delete handlers should work");

assertEqual(wrapped.foo, 4);

assertEqual(wrapped.nom, "nowai");

assertEqual(wrapped, wrapped);

assert(wrapped === wrapped, "a wrapper instance must be === to itself");
assert(wrap(object, resolver) === wrap(object, resolver),
       "a wrapper instance must be === to another wrapper instance of " +
       "the same target object");

assert(getWrapper(wrap(object, resolver)) == resolver,
       "getWrapper() must == the original wrapper.");
assert(getWrapper(wrap(object, resolver)) === resolver,
       "getWrapper() must === the original wrapper.");
assert(getWrapper({}) === null,
       "getWrapper() of a non-wrappedo object should return null.");

assert(unwrap(wrap(object, resolver)) == object,
       "unwrap() must == the original object.");
assert(unwrap(wrap(object, resolver)) === object,
       "unwrap() must === the original object.");
assertEqual(unwrap(wrapped), "[object Object]");
assert(unwrap(wrapped).blarg === undefined,
       "unwrap() should return the original object.");
assert(unwrap(unwrap(wrapped)) === null,
       "calling unwrap() on an already-unwrapped object " +
       "should return null.");

assert(wrap({}, resolver) !== wrap({}, resolver),
       "a wrapper instance must be !== to another wrapper instance of " +
       "a different target object");

var sandbox = new Cu.Sandbox("http://www.google.com");
sandbox.wrapped = wrapped;
assertEqual(Cu.evalInSandbox("wrapped.nom", sandbox), "nowai");

assertEqual(wrap(
              {},
              {equality: function(wrappee, wrapper, v) {
                 return v.blah == "beans";
               }}),
            {blah: "beans"});

wrapped = wrap({}, {});
assertEqual(wrapped.blargle, undefined);

function testGCWorks() {
  var resolver = {
    getProperty: function(wrappee, wrapper, name, defaultValue) {
      if (name == "foo")
        return "bar";
      return defaultValue;
    }
  };
  var obj = new Object();

  var weakResolver = Cu.getWeakReference(resolver);
  var weakObj = Cu.getWeakReference(obj);

  var wrapped = wrap(obj, resolver);
  resolver = undefined;
  obj = undefined;

  Cu.forceGC();

  assert(weakResolver.get(), "weakResolver should still exist");
  assert(weakObj.get(), "weakObj should still exist");
  assertEqual(wrapped.foo, "bar");
  wrapped = undefined;
  Cu.forceGC();
  assertEqual(weakResolver.get(), null);
  assertEqual(weakObj.get(), null);
}

testGCWorks();

assertThrows(function() {
               var funcWrapper = wrap(function(x) { return x + 1; }, {});
               funcWrapper(1);
             },
             "Error: Either the object isn't callable, or the " +
             "caller doesn't have permission to call it.",
             "By default, wrappers shouldn't allow function calls.");

var funcWrapper = wrap(function(x) { return x + 1; },
                       {call: function(wrappee, wrapper, thisObj, args) {
                          return wrappee.apply(thisObj, args);
                        }});
assertEqual(typeof(funcWrapper), "function");
assertEqual(funcWrapper(1), 2);

assertThrows(function() {
               var Constructor = wrap(function(x) { this.x = 1; }, {});
               var obj = new Constructor(1);
             },
             "Error: Either the object can't be used as a constructor, or " +
             "the caller doesn't have permission to use it.",
             "By default, wrappers shouldn't allow for constructors.");

var Constructor = wrap(function(x) { this.x = 1; },
                       {construct: function(wrappee, wrapper,
                                            thisObj, args) {
                         thisObj.x = args[0];
                         return thisObj;
                       }});
assertEqual((new Constructor(1)).x, 1);

wrapped = wrap({},
               {convert: function(wrappee, wrapper, type) {
                  // TODO: Not sure why type is always "undefined".
                  if (type == "undefined")
                    return 5;
                  throw new Error("unknown type: " + type);
                }});
assert(3 + wrapped == 8);
assert("hi" + wrapped == "hi5");

// A silly wrapper that masks all non-string values in the wrapped object,
// except for sub-objects, and that uppercases all string values.
function SillyWrapper(wrappee) {
  this.wrappee = wrappee;
  return wrap(wrappee, this);
}

SillyWrapper.prototype = {
  getProperty: function(wrappee, wrapper, name, defaultValue) {
    assertEqual(this.wrappee, wrappee);
    var value = this.wrappee[name];
    switch (typeof(value)) {
    case "string":
      return value.toUpperCase();
    case "object":
      return new SillyWrapper(value);
    default:
      return undefined;
    }
  },
  equality: function(wrappee, wrapper, other) {
    return wrappee === other;
  }
};

wrapped = new SillyWrapper({boop: 'blarg',
                            number: 5,
                            sub: {flarg: 'arg'}});
assertEqual(wrapped.boop, 'BLARG');
assertEqual(wrapped.number, undefined);
assertEqual(wrapped.sub.flarg, 'ARG');
assert(wrapped.sub == wrapped.sub);
assert(wrapped.sub === wrapped.sub);

function testReadOnlyDomWrapper() {
  function WrappedDomFunction(node, func) {
    this.node = node;
    this.func = func;
    return wrap(func, this);
  }
  WrappedDomFunction.prototype = {
    call: function call(wrappee, wrapper, thisObj, args) {
      var safeArgs = [];
      for (var i = 0; i < args.length; i++)
        safeArgs.push(XPCSafeJSObjectWrapper(args[i]));
      var result = this.func.apply(this.node, safeArgs);
      switch (typeof(result)) {
      case "string":
        return result;
      default:
        return undefined;
      }
    }
  };
  function ReadOnlyDomWrapper(node) {
    this.node = node;
    return wrap(node, this);
  }
  ReadOnlyDomWrapper.prototype = {
    accessibleFunctions: {getAttribute: true},
    getProperty: function(wrappee, wrapper, name, defaultValue) {
      var value = this.node[name];
      switch (typeof(value)) {
      case "string":
        return value;
      case "object":
        return new ReadOnlyDomWrapper(value);
      case "function":
        if (name in this.accessibleFunctions)
          return new WrappedDomFunction(this.node, value);
        throw new Error("Sorry, you can't access that function.");
      default:
        return undefined;
      }
    },
    setProperty: function(wrappee, wrapper, name, defaultValue) {
      throw new Error("Sorry, this DOM is read-only.");
    }
  };

  var wrapped = new ReadOnlyDomWrapper(document.getElementById("test"));
  assertEqual(wrapped.innerHTML, "This is test <b>HTML</b>.");
  assertEqual(wrapped.style.display, "none");
  assertEqual(wrapped.firstChild.nodeValue, "This is test ");
  assertThrows(
    function() { wrapped.innerHTML = "blah"; },
    "Error: Sorry, this DOM is read-only."
  );
  assertThrows(
    function() { wrapped.setAttribute('blarg', 'fnarg'); },
    "Error: Sorry, you can't access that function."
  );

  var sandbox = new Cu.Sandbox("http://www.google.com");
  sandbox.wrapped = wrapped;
  assertEqual(
    Cu.evalInSandbox("wrapped.innerHTML", sandbox),
    "This is test <b>HTML</b>."
  );
  assertEqual(
    Cu.evalInSandbox("wrapped.style.display", sandbox),
    "none"
  );
  assertEqual(
    Cu.evalInSandbox("wrapped.getAttribute('id');", sandbox),
    "test"
  );
  assertThrows(
    function() {
      Cu.evalInSandbox("wrapped.setAttribute('blarg', 'fnarg');",
                       sandbox);
    },
    "Error: Sorry, you can't access that function."
  );

}

if (this.window)
  testReadOnlyDomWrapper();

// MEMORY PROFILING TESTS

function runMemoryProfilingTest(func, namedObjects) {
  function injectErrorReportingIntoContext(global) {
    // This function is called by the profiling runtime whenever an
    // uncaught exception occurs.
    global.handleError = function handleError() {
      printTraceback(lastExceptionTraceback);
      print(lastException);
    };

    // This function uses the Python-inspired traceback functionality of the
    // playground to print a stack trace that looks much like Python's.
    function printTraceback(frame) {
      print("Traceback (most recent call last):");
      if (frame === undefined)
        frame = stack();
      var lines = [];
      while (frame) {
        var line = ('  File "' + frame.filename + '", line ' +
                    frame.lineNo + ', in ' + frame.functionName);
        lines.splice(0, 0, line);
        frame = frame.caller;
      }
      print(lines.join('\n'));
    }
  }

  var code = injectErrorReportingIntoContext.toString();

  // Remove newlines from error reporting code so that the function
  // code we put after it retains its original line numbering.
  code = "(" + code.replace(/\n/g, ";") + ")(this);";
  code += "(" + func.toString() + ")();";

  var funcInfo = functionInfo(func);

  profileMemory(code, funcInfo.filename, funcInfo.lineNumber,
                namedObjects);
}

// This function's source code is injected into the separate JS
// runtime of the memory profiler.
function memoryProfilingTests(global) {
  var visited = {};

  function recursiveGetInfo(id) {
    var info = getObjectInfo(id);
    if (info) {
      for (var i = 0; i < roots.length; i++) {
        recursiveGetInfo();
      }
    }
  }

  var visitedCount = 0;
  var namedObjects = getNamedObjects();
  var leftToVisit = [namedObjects[name] for (name in namedObjects)];
  if (leftToVisit.length == 0)
    leftToVisit = getGCRoots();
  var STANDARD_PROPERTY_INFO = false;
  var ALTERNATE_PROPERTY_INFO = true;
  var classProps = {Function: STANDARD_PROPERTY_INFO,
                    Object: STANDARD_PROPERTY_INFO};
  while (leftToVisit.length > 0) {
    var id = leftToVisit.pop();
    if (!(id in visited)) {
      visited[id] = true;
      visitedCount++;
      var info = getObjectInfo(id);
      if (info) {
        leftToVisit = leftToVisit.concat(info.children);
        if (info.nativeClass in classProps)
          getObjectProperties(id, classProps[info.nativeClass]);

        //        if (info.name && info.filename &&
        //            info.filename.indexOf("http") == "0")
        //          print(JSON.stringify(info));
      }
    }
  }

  print("Successfully visited " + visitedCount + " objects.");
}

assert(
  functionInfo(memoryProfilingTests).filename.indexOf("test-wrapper") > 0,
  "functionInfo() must contain accurate filename component."
  );

assert(
  functionInfo(memoryProfilingTests).lineNumber > 0,
  "functionInfo() must contain accurate line number component."
  );

profileMemory("if (!getObjectInfo('blarg')) throw new Error()",
              "<string>", 1,
              {blarg: {}});

profileMemory("if (getObjectInfo('oof')) throw new Error()",
              "<string>");

assertThrows(function() {
               profileMemory("function handleError() {}; " +
                             "iAmBadCode();", "<string>");
             },
             "Error: Profiling failed.",
             "Profiling bad code should raise an exception.");

print("Now profiling memory.");

function getBrowserWindows() {
  var windows = {};
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
           .getService(Ci.nsIWindowMediator);
  var enumerator = wm.getEnumerator("navigator:browser");
  while(enumerator.hasMoreElements()) {
    var win = enumerator.getNext();
    if (win.gBrowser) {
      var browser = win.gBrowser;
      for (var i = 0; i < browser.browsers.length; i++) {
        var page = browser.browsers[i];
        var location = page.contentWindow.location;
        var name = location.href;
        while (name in windows) {
          name += "_";
        }
        windows[name] = page.contentWindow.wrappedJSObject;
      }
    }
  }
  return windows;
}

runMemoryProfilingTest(memoryProfilingTests,
                       getBrowserWindows());

print("Done profiling memory.");

print("All tests passed!");
