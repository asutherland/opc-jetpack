window.addLazyLoaders(
  {"js/naive-xpc-flexible-wrapper.js": ["NaiveXPCFlexibleWrapper"]}
);

var NaiveXPCFlexibleWrapperTests = {
  testFunctionIsCallable: function(self) {

  },

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

  testWrapperAllowsAccess: function(self) {
    var sandbox = new Components.utils.Sandbox("about:blank");
    var object = {a: {b: "blarg"}};
    sandbox.object = new NaiveXPCFlexibleWrapper(
      object,
      {untrustedPrincipal: "about:blank"}
    );
    var result = Components.utils.evalInSandbox("object.a.b", sandbox);
    self.assertEqual(result, "blarg");
  }
};
