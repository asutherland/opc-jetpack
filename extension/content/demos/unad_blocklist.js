var rules = [];

function ruleToRegExp(text) {
  if ( text[0] == "!" || text[0] == "[" || text[0] == "@")
    return null;
  if ( text.match(/\$/) )
    return null;

  var regexp;

  if (text[0] == "/" && text[text.length - 1] == "/") {
    // filter is a regexp already
    regexp = text.substr(1, text.length - 2);
  } else {
    // remove multiple wildcards
    regexp = text.replace(/\*+/g, "*")
      .replace(/(\W)/g, "\\$1")    // escape special symbols
      .replace(/\\\*/g, ".*")      // replace wildcards by .*
      .replace(/^\\\|/, "^")       // process anchor at expression start
      .replace(/\\\|$/, "$")       // process anchor at expression end
      .replace(/^(\.\*)/,"")       // remove leading wildcards
      .replace(/(\.\*)$/,"");      // remove trailing wildcards
  }

  if (regexp == "")
    return null;

  return new RegExp(regexp);
}

function addRule( text ) {
  var rule = ruleToRegExp(text);
  if ( rule )
    rules.push(rule);
}

// Process an AdBlock Plus blocklist.
exports.process = function process(data) {
  data = data.split("\n");
  for each ( line in data ) {
    addRule( line );
  }
  addRule( "doubleclick" );
};

// Return whether the given URL string represents an ad
// that should be blocked.
exports.match = function match( url ) {
  for each ( rule in rules) {
    if ( rule.exec(url) ) {
      return true;
    }
  }
  return false;
};
