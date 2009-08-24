var AnnotationMemoryTests = {
  // This can be used by other tests to create a "fake" annotation memory
  // interface for testing.
  makeTestMemory: function(test) {
    return new this.AnnotationService(this.getTempConnection(test));
  },

  get AnnotationService() {
    var jsm = {};
    var url = "resource://jetpack/ubiquity-modules/annotation_memory.js";
    Components.utils.import(url, jsm);

    delete this.AnnotationService;
    this.AnnotationService = jsm.AnnotationService;
    return this.AnnotationService;
  },

  get Utils() {
    var jsm = {};
    var url = "resource://jetpack/ubiquity-modules/utils.js";
    Components.utils.import(url, jsm);

    delete this.Utils;
    this.Utils = jsm.Utils;
    return this.Utils;
  },

  getTempDbFile: function() {
    var dirSvc = Cc["@mozilla.org/file/directory_service;1"]
                 .getService(Ci.nsIProperties);
    var file = dirSvc.get("TmpD", Ci.nsIFile);
    file.append("testdb.sqlite");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0x600);
    return file;
  },

  getTempConnection: function(test) {
    var file = this.getTempDbFile();

    if (file.exists())
      file.remove(false);

    var connection = this.AnnotationService.openDatabase(file);

    test.onTeardown(
      function teardown() {
        connection.close();
        file.remove(false);
      });

    return connection;
  },

  testMemoryPersists: function(self) {
    var AnnotationService = this.AnnotationService;
    var file = this.getTempDbFile();

    if (file.exists())
      file.remove(false);

    var connection = AnnotationService.openDatabase(file);
    var annSvc = new AnnotationService(connection);

    function reopenDb() {
      connection.close();
      connection = AnnotationService.openDatabase(file);
      annSvc = new AnnotationService(connection);
    }

    var url = this.Utils.url("http://www.foo.com");
    annSvc.setPageAnnotation(url, "perm", "foo");
    self.assertEqual(annSvc.getPagesWithAnnotation("perm").length, 1);

    annSvc.setPageAnnotation(url, "temp", "foo", 0, annSvc.EXPIRE_SESSION);
    self.assertEqual(annSvc.getPagesWithAnnotation("temp").length, 1);

    reopenDb();

    self.assertEqual(annSvc.getPagesWithAnnotation("perm").length, 1);
    annSvc.removePageAnnotation(url, "perm");

    self.assertEqual(annSvc.getPagesWithAnnotation("temp").length, 0);
    annSvc.setPageAnnotation(url, "temp", "foo", 0, annSvc.EXPIRE_SESSION);
    annSvc.removePageAnnotation(url, "temp");
    self.assertEqual(annSvc.getPagesWithAnnotation("temp").length, 0);

    reopenDb();

    self.assertEqual(annSvc.getPagesWithAnnotation("perm").length, 0);

    connection.close();
    file.remove(false);
  },

  testGetPagesWithAnnotation: function(self) {
    var annSvc = this.makeTestMemory(self);

    var url = this.Utils.url("http://www.foo.com");
    self.assertEqual(annSvc.getPagesWithAnnotation("blah").length, 0);
    annSvc.setPageAnnotation(url, "blah", "foo");
    var results = annSvc.getPagesWithAnnotation("blah");
    self.assertEqual(results.length, 1);
    self.assertEqual(results[0].spec, "http://www.foo.com/");
  },

  testPageHasAnnotation: function(self) {
    var annSvc = this.makeTestMemory(self);

    var url = this.Utils.url("http://www.foo.com");
    annSvc.setPageAnnotation(url, "blah", "foo");
    self.assertEqual(annSvc.pageHasAnnotation(url, "blah"), true);
  },

  testGetPageAnnotation: function(self) {
    var annSvc = this.makeTestMemory(self);

    var url = this.Utils.url("http://www.foo.com");

    annSvc.setPageAnnotation(url, "blah", "foo");
    self.assertEqual(annSvc.getPageAnnotation(url, "blah"), "foo");
  },

  testRemovePageAnnotation: function(self) {
    var annSvc = this.makeTestMemory(self);

    var url = this.Utils.url("http://www.foo.com");
    annSvc.setPageAnnotation(url, "blah", "foo");
    annSvc.removePageAnnotation(url, "blah");
    self.assertEqual(annSvc.getPagesWithAnnotation("blah").length, 0);
  },

  testPageAnnotationObserversWork: function(self) {
    var obRemoveCalled = false;
    var obSetCalled = false;

    var ob = {
      onPageAnnotationSet: function(uri, name) {
        self.assertEqual(uri.spec, "http://www.foo.com/");
        self.assertEqual(name, "blah");
        obSetCalled = true;
      },
      onPageAnnotationRemoved: function(uri, name) {
        self.assertEqual(uri.spec, "http://www.foo.com/");
        self.assertEqual(name, "blah");
        obRemoveCalled = true;
      }
    };

    var annSvc = this.makeTestMemory(self);
    var url = this.Utils.url("http://www.foo.com");
    annSvc.addObserver(ob);

    annSvc.setPageAnnotation(url, "blah", "foo");
    self.assertEqual(obSetCalled, true);
    annSvc.removePageAnnotation(url, "blah");
    self.assertEqual(obRemoveCalled, true);

    obSetCalled = false;
    obRemoveCalled = false;
    annSvc.removeObserver(ob);

    annSvc.setPageAnnotation(url, "blah", "foo");
    self.assertEqual(obSetCalled, false);
    annSvc.removePageAnnotation(url, "blah");
    self.assertEqual(obRemoveCalled, false);
  }
};
