var SecureMembraneTests = {
  testSecureMembraneWorks: function(self) {
    if (SecureMembrane.isAvailable) {
      self.assertEqual(SecureMembrane.wrap(null), null);
      self.assertEqual(SecureMembrane.wrap(5), 5);
      self.assertEqual(SecureMembrane.wrap(false), false);

      var sandbox = Components.utils.Sandbox("http://www.foo.com");
      var tabHarness = new Tabs();
      var tabs = tabHarness.tabs;
      sandbox.tabs = SecureMembrane.wrap(tabs);

      function tryCode(code) {
        return Components.utils.evalInSandbox(code, sandbox);
      }

      function ensureEqual(code) {
        self.assertEqual(tryCode(code), eval(code));
      }

      ensureEqual("tabs.focused.isClosed");
      ensureEqual("tabs.focused.url");

      self.assertEqual(tryCode("'' + tabs"), "[Tabs]");
      self.assertEqual(tryCode("tabs.nonexistent"), undefined);
      self.assertEqual(tryCode("tabs.prototype"), undefined);
      self.assertEqual(tryCode("tabs.caller"), undefined);
      self.assertEqual(tryCode("tabs.__parent__"), undefined);
      self.assertEqual(tryCode("tabs.__proto__"), undefined);
      tabHarness.unload();

      var thing = {toString: function() { throw "NO"; } };
      self.assertEqual('' + SecureMembrane.wrap(thing), "<error>");
    } else
      console.warn("SecureMembrane is not available; skipping test.");
  }
};
