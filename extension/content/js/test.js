var Tests = {
  _hasImportedTestFiles: false,

  listDir: function listDir(dir) {
    var contents = [];
    var enumer = dir.directoryEntries;
    while (enumer.hasMoreElements())
      contents.push(enumer.getNext().QueryInterface(Ci.nsIFile).leafName);
    return contents;
  },

  cycleCollect: function cycleCollect() {
    var test_utils = window.QueryInterface(Ci.nsIInterfaceRequestor).
                     getInterface(Ci.nsIDOMWindowUtils);
    test_utils.garbageCollect();
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

  _exceptionAtCaller: function _exceptionAtCaller(message) {
    throw new Logging.ErrorAtCaller(message, 1);
  },

  _runTest: function _runTest(test, onFinished) {
    var self = this;
    var wasErrorLogged = false;
    var listener = new Logging.ConsoleListener();
    var teardownFuncs = [];
    var finishedId = null;
    var timeoutId = null;

    listener.onMessage = function(message) {
      if (message.isError)
        wasErrorLogged = true;
    };

    function endTest(result) {
      if (wasErrorLogged && result == "success")
        result = "failure";
      listener.unload();
      listener = null;
      console.info(test.name,
                   (result == "success") ? "succeeded" : "failed");
      onFinished(result);
    }

    function report(result) {
      teardownFuncs.forEach(function(callback) { callback(); });
      finishedId = window.setTimeout(function() { endTest(result); }, 0);
    }

    var runner = {
      assertRaises: function assertRaises(cb, exception, message) {
        var wasExceptionThrown = false;
        try {
          cb();
        } catch (e if e instanceof exception) {
          wasExceptionThrown = true;
          this.lastException = e;
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
      setTimeout: function setTimeout(ms, message) {
        timeoutId = window.setTimeout(
          function() {
            console.error(test.name, "timed out at", ms, "ms",
                          "(" + message + ")");
            report("failure");
          },
          ms
        );
      },
      success: function success() {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        report("success");
      },
      onTeardown: function onTeardown(callback) {
        teardownFuncs.splice(0, 0, callback);
      }
    };
    try {
      test.func.call(test.suite, runner);
      if (timeoutId === null && finishedId === null)
        report("success");
    } catch (e) {
      console.exception(e);
      if (timeoutId === null && finishedId === null)
        report("failure");
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
                      name: name + "." + testName};
          if (!filter || test.name.indexOf(filter) != -1)
            tests.push(test);
        }
    }

    var succeeded = 0;
    var failed = 0;

    function diffCounts(current, last) {
      var diff = {};
      for (name in current.bins) {
        if (name in last.bins) {
          if (current.bins[name] != last.bins[name])
            diff[name] = current.bins[name] - last.bins[name];
        } else
          diff[name] = current.bins[name];
      }

      for (name in last.bins)
        if (!(name in current.bins))
          diff[name] = -last.bins[name];

      return diff;
    }

    function recomputeCount() {
      self.cycleCollect();
      MemoryTracking.compact();
      var bins = {};
      var names = MemoryTracking.getBins();
      var total = 0;
      names.forEach(
        function(name) {
          var count = MemoryTracking.getLiveObjects(name).length;
          bins[name] = count;
          total += count;
        });
      return {bins: bins, total: total};
    }

    var lastCount = recomputeCount();
    var currentTest = null;

    function runNextTest(lastResult) {
      var currentCount = recomputeCount();
      if (lastResult == "success") {
        succeeded += 1;
        var memoryDiff = currentCount.total - lastCount.total;
        if (memoryDiff)
          console.warn("Memory differences:",
                       JSON.stringify(diffCounts(currentCount, lastCount)));
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
