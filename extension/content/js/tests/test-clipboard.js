var ClipboardTests = {

  // Test the typical use case, setting & getting with no flavors specified
  testWithNoFlavor: function(self) {
    var contents = "hello there";
    var flavor = "plain";
    var fullFlavor = "text/unicode";
    var clip = new Clipboard();
    // Confirm we set the clipboard
    self.assert(clip.set(contents));
    // Confirm flavor is set
    self.assertEqual(clip.getCurrentFlavors()[0], flavor);
    // Confirm we set the clipboard
    self.assertEqual(clip.get(), contents);
    // Confirm we can get the clipboard using the flavor
    self.assertEqual(clip.get(flavor), contents);
    // Confirm we can still get the clipboard using the full flavor
    self.assertEqual(clip.get(fullFlavor), contents);
  },

  // Test the slightly less common case where we specify the flavor
  testWithFlavor: function(self) {
    var contents = "<b>hello there</b>";
    var flavor = "html";
    var fullFlavor = "text/html";
    var clip = new Clipboard();
    self.assert(clip.set(contents, flavor));
    self.assertEqual(clip.getCurrentFlavors()[0], flavor);
    // Confirm default flavor returns false
    self.assert(!clip.get());
    self.assertEqual(clip.get(flavor), contents);
    self.assertEqual(clip.get(fullFlavor), contents);
  },

  // Test that the typical case still works when we specify the flavor to set
  testWithRedundantFlavor: function(self) {
    var contents = "<b>hello there</b>";
    var flavor = "plain";
    var fullFlavor = "text/unicode";
    var clip = new Clipboard();
    self.assert(clip.set(contents, flavor));
    self.assertEqual(clip.getCurrentFlavors()[0], flavor);
    self.assertEqual(clip.get(), contents);
    self.assertEqual(clip.get(flavor), contents);
    self.assertEqual(clip.get(fullFlavor), contents);
  },

  testNotInFlavor: function(self) {
    var contents = "hello there";
    var flavor = "html";
    var clip = new Clipboard();
    self.assert(clip.set(contents));
    // If there's nothing on the clipboard with this flavor, should return false
    self.assert(!clip.get(flavor));
  }
  // TODO: Test error cases.
};
