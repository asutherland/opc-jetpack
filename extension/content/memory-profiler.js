const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

function getBinaryComponent() {
  try {
    var factory = Cc["@labs.mozilla.com/jetpackdi;1"]
                 .createInstance(Ci.nsIJetpack);
    return factory.get();
  } catch (e) {
    return null;
  }
}

function log(message, isInstant) {
  var elem = $("<pre></pre>");
  if (!isInstant)
    elem.hide();
  elem.text(message);
  $("#output").append(elem);
  if (!isInstant)
    elem.slideDown();
}

function analyzeResult(result) {
  var worker = new Worker('memory-profiler.worker.js');
  worker.onmessage = function(event) {
    var data = JSON.parse(event.data);

    var objInfos = [{name: name, count: data.shapes[name]}
                    for (name in data.shapes)];
    objInfos.sort(function(b, a) {
      return a.count - b.count;
    });
    objInfos.forEach(function(info) {
      var row = $("<tr></tr>");
      var name = $("<td></td>");
      if (info.name.length > 80)
        info.name = info.name.slice(0, 80) + "...";
      info.name = info.name.replace(/,/g, "/");
      name.text(info.name);
      name.css({fontFamily: "monospace"});
      row.append(name);
      var count = $("<td></td>");
      count.text(info.count);
      row.append(count);
      $("#objtable").append(row);
    });
    $("#objtable").parent().fadeIn();

    var funcInfos = [info for each (info in data.functions)];
    funcInfos.sort(function(b, a) {
      return a.rating - b.rating;
    });
    funcInfos.forEach(function(info) {
      var row = $("<tr></tr>");
      var name = $("<td></td>");
      name.text(info.name + "()");
      name.css({cursor: "pointer", fontFamily: "monospace"});
      name.get(0).info = info;
      name.click(function() {
        window.openDialog("chrome://global/content/viewSource.xul",
                          "_blank", "all,dialog=no",
                          this.info.filename, null, null, this.info.lineStart);
      });
      row.append(name);

      function addCell(content) {
        var cell = $("<td></td>");
        row.append(cell.text(content));
      }

      addCell(info.instances);
      addCell(info.referents);
      addCell(info.isGlobal);
      addCell(info.protoCount);

      $("#functable").append(row);
    });
    $("#functable").parent().fadeIn();

    log("Raw window data: " + JSON.stringify(data.windows));
    if (data.rejectedTypes.length)
      log("Rejected types: " + data.rejectedTypes.join(", "));
    log("Done.");
  };
  worker.onerror = function(error) {
    log("An error occurred: " + error.message);
  };
  worker.postMessage(result);
}

function getBrowserWindows() {
  var windows = [];
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
    .getService(Ci.nsIWindowMediator);
  var enumerator = wm.getEnumerator("navigator:browser");
  while(enumerator.hasMoreElements()) {
    var win = enumerator.getNext();
    if (win.gBrowser) {
      var browser = win.gBrowser;
      for (var i = 0; i < browser.browsers.length; i++) {
        var page = browser.browsers[i];
        windows.push({browser: page,
                      href: page.contentWindow.location.href});
      }
    }
  }
  return windows;
}

function htmlCollectionToArray(coll) {
  var array = [];
  for (var i = 0; i < coll.length; i++)
    array.push(coll[i]);
  return array;
}

function getIframes(document) {
  return htmlCollectionToArray(document.getElementsByTagName("iframe"));
}

function recursivelyGetIframes(document) {
  var iframes = [];
  var subframes = getIframes(document);
  subframes.forEach(
    function(iframe) {
      iframes.push(iframe.contentWindow.wrappedJSObject);
      var children = recursivelyGetIframes(iframe.contentDocument);
      iframes = iframes.concat(children);
    });
  return iframes;
}

function doProfiling() {
  Cu.import("resource://jetpack/modules/setup.js");
  var file = JetpackSetup.getExtensionDirectory();
  file.append('content');
  file.append('memory-profiler.profiler.js');
  var code = FileIO.read(file, 'utf-8');
  var filename = FileIO.path(file);

  var windows = getBrowserWindows();
  var windowsToProfile = [];
  var toProfile;
  for (var i = 0; i < windows.length; i++) {
    var win = windows[i];
    if ((win.href.indexOf("http") == 0) ||
        (win.href.indexOf("file:") == 0)) {
      var iframes = recursivelyGetIframes(win.browser.contentDocument);
      windowsToProfile = [win.browser.contentWindow.wrappedJSObject];
      windowsToProfile = windowsToProfile.concat(iframes);
      toProfile = win;
      break;
    }
  }

  if (!toProfile) {
    log("please open a tab with an http, https, or file URL to profile.");
    return;
  }
  log("profiling the tab at " + toProfile.href +
      " but ignoring any embedded iframes.");

  var start = new Date();
  var binary = getBinaryComponent();
  if (!binary) {
    log("Required binary component not found! One may not be available " +
        "for your OS and Firefox version.");
    return;
  }
  var result = binary.profileMemory(code, filename, 1,
                                    windowsToProfile);
  var totalTime = (new Date()) - start;
  log("time spent in memory profiling: " + totalTime + " ms");

  result = JSON.parse(result);
  if (result.success) {
    log("analyzing data now, please wait.");
    log("named objects: " + JSON.stringify(result.data.namedObjects));
    window.setTimeout(function() {
      analyzeResult(JSON.stringify(result.data));
    }, 0);
  } else {
    log("An error occurred while profiling.");
    log(result.traceback);
    log(result.error);
  }
}

$(window).ready(function() {
  Components.utils.forceGC();
  log("profiling now, please wait.", true);
  window.setTimeout(doProfiling, 0);
});
