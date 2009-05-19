Components.utils.import("resource://jetpack/ubiquity-modules/utils.js");

var EXPORTED_SYMBOLS = ["isRemote", "isLocal"];

function isRemote(url) {
  url = Utils.url(url);
  return (url.scheme == "http" ||
          url.scheme == "https");
}

function isLocal(url) {
  url = Utils.url(url);
  return (url.scheme == "file" ||
          url.scheme == "chrome" ||
          url.scheme == "resource");
}
