var ClipboardTests = {
  testClipboardWorks: function(self) {
    var contents = "hello there";
    var clip = new Clipboard();
    clip.set(contents);
    self.assertEqual(clip.get()["text/unicode"], contents);
  }
};
