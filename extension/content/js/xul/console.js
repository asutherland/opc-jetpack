var JetpackModules = {};
Components.utils.import("resource://jetpack/modules/setup.js", JetpackModules);

JetpackModules.baseUri = JetpackModules.JetpackSetup.getBaseUri();

function maybeFixUpJetpackMessage(target) {
  if (typeof(target.getAttribute) != "function")
    return;
  var href = target.getAttribute("href");

  // Remove pointless error messages.
  if (href &&
      href.indexOf(JetpackModules.baseUri) == 0 &&
      target.getAttribute("msg") == "not well-formed") {
    target.parentNode.removeChild(target);
    return;
  }
}

window.addEventListener(
  "load",
  function() {
    var box = document.getElementById("ConsoleBox");
    box.addEventListener(
      "DOMNodeInserted",
      function(aEvt) { maybeFixUpJetpackMessage(aEvt.originalTarget); },
      true
    );

    var child = box.mConsoleRowBox.firstChild;
    while (child) {
      maybeFixUpJetpackMessage(child);
      child = child.nextSibling;
    }
  },
  false
);
