var SecureMembraneTests = {
  testSecureMembraneWorks: function(self) {
    if (SecureMembrane.isAvailable) {
      // Test that the wrapping of primitive types/built-ins is pass-through.
      self.assertEqual(SecureMembrane.wrapTrusted(null), null);
      self.assertEqual(SecureMembrane.wrapTrusted(5), 5);
      self.assertEqual(SecureMembrane.wrapTrusted(false), false);

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
      self.assertEqual(tryCode("'' + tabs"), "[SecureMembraned [Tabs]]");

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
    } else
      console.warn("SecureMembrane is not available; skipping test.");
  }
};
