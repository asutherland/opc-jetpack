var SecureMembraneTests = {
  testSecureMembraneWorks: function(self) {
    if (SecureMembrane.isAvailable) {
      // Ensure that the type of wrapped functions is 'function'.
      self.assertEqual(typeof(SecureMembrane.wrapTrusted(function(){})),
                       "function");
      self.assertEqual(typeof(SecureMembrane.wrapUntrusted(function(){})),
                       "function");

      // Test that the wrapping of primitive types/built-ins is pass-through.
      self.assertEqual(SecureMembrane.wrapTrusted(null), null);
      self.assertEqual(SecureMembrane.wrapTrusted(5), 5);
      self.assertEqual(SecureMembrane.wrapTrusted(false), false);

      self.assert("foo" in SecureMembrane.wrapTrusted({foo: 1}));
      self.assertEqual(SecureMembrane.wrapTrusted({foo: 5}).foo, 5);

      self.assert("foo" in SecureMembrane.wrapUntrusted({foo: 1}));
      self.assertEqual(SecureMembrane.wrapUntrusted({foo: 5}).foo, 5);

      var sandbox = Components.utils.Sandbox("http://www.foo.com");
      var tabHarness = new Tabs();
      var tabs = tabHarness.tabs;
      sandbox.tabs = SecureMembrane.wrapTrusted(tabs);

      function tryCode(code) {
        return Components.utils.evalInSandbox(code, sandbox);
      }

      function testCodeBehavior(code) {
        self.assertEqual(tryCode(code), eval(code));
      }

      // Test that code returning primitives via SecureMembrane is the same
      // as via the original object.
      testCodeBehavior("tabs.focused.isClosed");
      testCodeBehavior("tabs.focused.url");

      // Test coercion to string.
      self.assertEqual(tryCode("'' + tabs"),
                       "[object SecureMembrane [Tabs]]");

      // Test dangerous properties.
      self.assertEqual(tryCode("tabs.nonexistent"), undefined);
      self.assertEqual(tryCode("tabs.prototype"), undefined);
      self.assertEqual(tryCode("tabs.caller"), undefined);
      self.assertEqual(tryCode("tabs.__parent__"), undefined);
      self.assertEqual(tryCode("tabs.__proto__"), undefined);
      tabHarness.unload();

      // Test coercion to string raising error.
      var thing = {toString: function() { throw "NO"; } };
      self.assertEqual('' + SecureMembrane.wrapTrusted(thing), "<error>");

      // Test function calling.
      function sampleFunc(x) {
        return x.foo + 1;
      }
      sandbox.sampleFunc = SecureMembrane.wrapTrusted(sampleFunc);
      self.assertEqual(tryCode("sampleFunc({foo: 4})"), 5);

      var sampleObj = {
        _foo: 1,
        get foo(x) {
          return this._foo;
        },
        set foo(x) {
          this._foo = x + 1;
        }
      };
      sandbox.sampleObj = SecureMembrane.wrapTrusted(sampleObj);
      // Ensure the setter works.
      tryCode("sampleObj.foo = 5");
      // Ensure the getter works.
      self.assertEqual(tryCode("sampleObj.foo"), 6);
      // Ensure deleting works.
      tryCode("delete sampleObj.foo;");
      self.assertEqual(tryCode("sampleObj.foo"), undefined);

      // Ensure call() and apply() work.
      sandbox.foo = SecureMembrane.wrapTrusted(
        function foo(x) { return x+1; }
      );
      self.assertEqual(tryCode("foo.apply(this, [5])"), 6);
      self.assertEqual(tryCode("foo.call(this, 5)"), 6);

      tryCode("function foo(x) { return x*2; }");
      var wrappedFoo = SecureMembrane.wrapUntrusted(sandbox.foo);
      self.assertEqual(wrappedFoo(5), 10);
      self.assertEqual(wrappedFoo.apply(this, [5]), 10);
      self.assertEqual(wrappedFoo.call(this, 5), 10);
    } else
      throw new Error("SecureMembrane is not available.");
  }
};
