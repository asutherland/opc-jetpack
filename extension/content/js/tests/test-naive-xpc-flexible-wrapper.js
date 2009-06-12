window.addLazyLoaders(
  {"js/naive-xpc-flexible-wrapper.js": ["NaiveXPCFlexibleWrapper"]}
);

var NaiveXPCFlexibleWrapperTests = {
  _testPrimitiveIsPreserved: function(self, value) {
    var wrapped = new NaiveXPCFlexibleWrapper({blarg: value});
    self.assertEqual(typeof(wrapped.blarg), typeof(value));
    self.assertEqual(wrapped.blarg, value);
  },

  testNumbersAreWrapped: function(self) {
    this._testPrimitiveIsPreserved(self, 1);
  },

  testStringsAreWrapped: function(self) {
    this._testPrimitiveIsPreserved(self, "test");
  },

  testBooleansAreWrapped: function(self) {
    this._testPrimitiveIsPreserved(self, true);
    this._testPrimitiveIsPreserved(self, false);
  },

  testWrappedObjectsPreserveIdentity: function(self) {
    var source = new Object();
    var obj1 = new NaiveXPCFlexibleWrapper(source);
    var obj2 = new NaiveXPCFlexibleWrapper(source);
    self.assert(obj1 === obj2, "Wrapped objects must preserve identity.");
  },

  testFunctionsAreWrapped: function(self) {
    function func(x) {
      return x + 1;
    }

    var wrapped = new NaiveXPCFlexibleWrapper({blarg: func});
    self.assertEqual(typeof(wrapped.blarg), "function");
    self.assertEqual(wrapped.blarg(5), func(5));
  },

  _inSandbox: function(object, evalString) {
    var sandbox = new Components.utils.Sandbox("about:blank");
    sandbox.object = new NaiveXPCFlexibleWrapper(
      object,
      {untrustedPrincipal: "about:blank"}
    );
    return Components.utils.evalInSandbox(evalString, sandbox);
  },

  testWrapperAllowsAccessToDomNode: function(self) {
    self.assertEqual(
      this._inSandbox(document,
                      "object.documentElement.nodeName"),
      "HTML"
    );
  },

  testWrapperAllowsAccessToFunction: function(self) {
    self.assertEqual(
      this._inSandbox({a: {b: function(x) { return "blarg " + x; }}},
                      "object.a.b('hi');"),
      "blarg hi"
    );
  },

  testWrapperAllowsAccessToProperty: function(self) {
    self.assertEqual(
      this._inSandbox({a: {b: "blarg"}},
                      "object.a.b"),
      "blarg"
    );
  }
};
