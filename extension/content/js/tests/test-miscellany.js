var DictionaryTests = {
  testSetAndGet: function(self) {
    var dict = new Dictionary();
    var a = {foo: "bar"};
    var b = {baz: "blah"};
    var c = window;
    dict.set("hi", "there");
    dict.set(a, b);
    self.assertEqual(dict.get("hi"), "there");
    self.assertEqual(dict.get(a), b);
    dict.set(a, c);
    self.assertEqual(dict.get(a), c);
    self.assertEqual(dict.length, 2);
  },

  testRemove: function(self) {
    var dict = new Dictionary();
    var a = {a: 1};
    dict.set(1, 2);
    dict.set(3, 4);
    dict.set(a, 1);
    dict.remove(3);
    self.assertEqual(dict.get(3), null);
    self.assertEqual(dict.length, 2);
    self.assertRaises(function() { dict.remove(3); }, Error);
  }
};

var UrlFactoryTests = {
  testEmpty: function(self) {
    var uf = new UrlFactory("http://www.google.com");
    self.assertEqual(uf.makeUrl(""), "http://www.google.com/");
  },

  testRelative: function(self) {
    var uf = new UrlFactory("http://www.google.com");
    self.assertEqual(uf.makeUrl("blarg"), "http://www.google.com/blarg");
  },

  testAbsolute: function(self) {
    var uf = new UrlFactory("http://www.google.com");
    self.assertEqual(uf.makeUrl("http://www.imdb.com"),
                     "http://www.imdb.com/");
  }
};
