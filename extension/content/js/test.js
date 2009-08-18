var Tests = {
  _hasImportedTestFiles: false,

  listDir: function listDir(dir) {
    var contents = [];
    var enumer = dir.directoryEntries;
    while (enumer.hasMoreElements())
      contents.push(enumer.getNext().QueryInterface(Ci.nsIFile).leafName);
    return contents;
  },

  _findTestJsFiles: function _findTestJsFiles() {
    // TODO: This is yucky because it assumes things about how our
    // chrome: URIs are mapped to our filesystem.
    var jsm = {};
    Components.utils.import("resource://jetpack/modules/setup.js", jsm);
    var dir = jsm.JetpackSetup.getExtensionDirectory();
    var pathParts = ["content", "js", "tests"];
    pathParts.forEach(function(path) { dir.append(path); });
    var relPaths = this.listDir(dir);
    var absBase = "chrome://jetpack/" + pathParts.join("/") + "/";
    return [(absBase + relPath)
            for each (relPath in relPaths)
            if (relPath.match(/^test-.*\.js$/))];
  },

  _importTestFiles: function _importTestFiles() {
    if (!this._hasImportedTestFiles) {
      var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                   .getService(Ci.mozIJSSubScriptLoader);
      var files = this._findTestJsFiles();
      console.log("Found", files.length, "test suites in external files.");
      files.forEach(function(file) { loader.loadSubScript(file); });
      this._hasImportedTestFiles = true;
    }
  },

  _TestFailedAndExceptionLogged: function _TestFailedAndExceptionLogged() {
    this.message = "Test failed and exception logged.";
    this.alreadyLogged = true;
    this.__proto__ = new Error();
  },

  _exceptionAtCaller: function _exceptionAtCaller(message) {
    var frame = Components.stack.caller.caller;
    var e = new Error();
    e.fileName = frame.filename;
    e.lineNumber = frame.lineNumber;
    e.message = message;
    console.exception(e);
    throw new this._TestFailedAndExceptionLogged();
  },

  _runTest: function _runTest(test, onFinished) {
    var self = this;
    function reportSuccess() { onFinished("success"); }
    function reportFailure() { onFinished("failure"); }

    var finishedId = null;
    var timeoutId = null;
    var runner = {
      assertRaises: function assertRaises(cb, exception, message) {
        var wasExceptionThrown = false;
        try {
          cb();
        } catch (e if e instanceof exception) {
          wasExceptionThrown = true;
        }
        if (!wasExceptionThrown) {
          if (!message)
            message = "Assertion failed: exception not raised";
          self._exceptionAtCaller(message);
        }
      },
      assertEqual: function assertEqual(a, b, message) {
        if (a != b) {
          console.error(a, "is not equal to", b);
          if (!message)
            message = "Assertion failed";
          self._exceptionAtCaller(message);
        }
      },
      assert: function assert(predicate, message) {
        if (!predicate) {
          if (!message)
            message = "Assertion failed";
          self._exceptionAtCaller(message);
        }
      },
      allowForMemoryError: function allowForMemoryError(margin) {
        test.memoryErrorMargin = margin;
      },
      setTimeout: function setTimeout(ms, message) {
        timeoutId = window.setTimeout(
          function() {
            console.error(test.name, "timed out at", ms, "ms");
            finishedId = window.setTimeout(reportFailure, 0);
          },
          ms
        );
      },
      success: function success() {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.info(test.name, "succeeded");
        finishedId = window.setTimeout(reportSuccess, 0);
      }
    };
    try {
      test.func.call(test.suite, runner);
      if (timeoutId === null && finishedId === null) {
        console.info(test.name, "succeeded");
        finishedId = window.setTimeout(reportSuccess, 0);
      }
    } catch (e) {
      if (!e.alreadyLogged)
        console.exception(e);
      if (timeoutId === null && finishedId === null)
        finishedId = window.setTimeout(reportFailure, 0);
    }
  },

  run: function run(cb, filter) {
    var self = this;
    var testSuites = {};

    console.log("Now running tests.");

    self._importTestFiles();

    // Find any objects whose name ends in "Tests".
    for (name in window) {
      if (name != "Tests" &&
          name.lastIndexOf("Tests") != -1 &&
          name.lastIndexOf("Tests") == (name.length - "Tests".length))
        testSuites[name] = window[name];
    }

    var tests = [];

    for (name in testSuites) {
      var suite = testSuites[name];
      for (testName in suite)
        if (testName.indexOf('test') == 0) {
          var test = {func: suite[testName],
                      suite: suite,
                      name: name + "." + testName,
                      memoryErrorMargin: 0};
          if (!filter || test.name.indexOf(filter) != -1)
            tests.push(test);
        }
    }

    var succeeded = 0;
    var failed = 0;

    function recomputeCount() {
      Components.utils.forceGC();
      MemoryTracking.compact();
      return MemoryTracking.getLiveObjects().length;
    }

    var lastCount = recomputeCount();
    var currentTest = null;

    function runNextTest(lastResult) {
      var currentCount = recomputeCount();
      if (lastResult == "success") {
        succeeded += 1;
        var memoryDiff = Math.abs(currentCount - lastCount);
        if (memoryDiff > currentTest.memoryErrorMargin)
          console.warn("Object count was", lastCount, "but is now",
                       currentCount, ". You may want to check for " +
                       "memory leaks, though this could be a false " +
                       "alarm.");
      } else if (lastResult == "failure") {
        failed += 1;
      }

      lastCount = currentCount;
      currentTest = tests.pop();

      if (currentTest)
        self._runTest(currentTest, runNextTest);
      else {
        console.log(succeeded, "out of", succeeded + failed,
                    "tests successful (", failed, "failed ).");
        if (cb)
          cb({failed: failed, succeeded: succeeded});
      }
    }

    runNextTest();
  }
};
