// This script executes in a memory profiling runtime, which is an
// entirely separate JavaScript runtime (JSRuntime) from that of Firefox.
// It therefore has an entirely different set of global functions and
// variables from that of Firefox: there's no XPConnect/XPCOM, etc.

// This function is called by the platform whenever an uncaught exception
// occurs.

function handleError() {
  printTraceback(lastExceptionTraceback);
  print(lastException);
}

// This function uses the Python-inspired traceback functionality of the
// playground to print a stack trace that looks much like Python's.

function printTraceback(frame) {
  print("Traceback (most recent call last):");
  if (frame === undefined)
    frame = stack();
  var lines = [];
  while (frame) {
    var line = ('  File "' + frame.filename + '", line ' +
                frame.lineNo + ', in ' + frame.functionName);
    lines.splice(0, 0, line);
    frame = frame.caller;
  }
  print(lines.join('\n'));
}

function debug(out, object) {
    out = "DEBUG: " + out;
    if (object) {
        out += JSON.stringify(object);
    }
    print(out);
}

// Work out if the caller wants the output to be wrapped in a JSONP function wrapper
function wrapJSONP(path, json) {
    var callbackName = path.match(/callback=(\w+)/);
    if (callbackName) {
        return callbackName[1] + "(" + json + ")";
    } else {
        return json;
    }
}

var dump = {}; // hold the entire set of objects
var meta = {};
var totalBytes = 0;
var filter = false;

function getObjectInfoAndProperties(objNum) {
    var o = getObjectInfo(objNum);
    if (!o) return;

    if (o.wrappedObject) {
        return getObjectInfoAndProperties(o.wrappedObject);
    } else {
        var properties = getObjectProperties(objNum);
        if (!emptyObject(properties)) o.properties = properties;
        return o;
    }
}

function emptyObject(object) {
    for (var key in object) {
        return false;
    }
    return true;
}

function getObjectInfoAndPrototype(objNum) {
    var o = getObjectInfo(objNum);
    if (!o) return;

    if (o.wrappedObject) {
        return getObjectInfoAndPrototype(o.wrappedObject);
    } else {
        var prototype = getObjectProperty(objNum, 'prototype');
        if (prototype.prototype) o.properties = prototype;
        return o;
    }
}

/*
 * From the object, get back to the "Window" object and then come down the path
 */
function roundupWindowObjects(objNum) {
    var objInfo = getObjectInfoAndProperties(objNum);
    //debug("ROUNDUP: ", objInfo);
    if (!objInfo) return;

    var windowObject;

    if (objInfo.nativeClass == "Window") {
        windowObject = objInfo;
    } else {
        var again = getObjectInfoAndProperties(objInfo.wrappedObject || objInfo.parent);
        if (again && again.nativeClass == "Window") {
            windowObject = again;
            //debug("", again);
        }
    }
    
    if (!windowObject) return;

    // now we have the window object we can go down down down
    // window.foo ->     
    for (var key in windowObject.properties) {
        if (typeof windowObject.properties[key] == "number") {
            //debug("windowObject.properties: ", windowObject.properties[key]);
            traverseRoundup(windowObject.properties[key]);
        }
    }
    
    debug("typeMap: ", typeMap);
    // debug("typeSize: ", typeSize);
}

var typeMap = {};
var typeSize = {};
var typeCount = {};
var roundup = {};

function getType(object) {
    if (object.name) return object.name;
    if (object.filename) return object.filename;
    return "anonymous";
}

function traverseRoundup(objNum) {
    debug("traverseRoundup: " + objNum);
    if (roundup[objNum]) return; // been here
    roundup[objNum] = true;

    var objInfo = getObjectInfoAndPrototype(objNum);
    if (!objInfo) return;
    //debug("traverseRoundup: ", objInfo);
    
    if (objInfo.nativeClass == "Function" && objInfo.properties) { //} && objInfo.properties.prototype) {
        //debug("Function: ", objInfo);
        for (var key in objInfo.properties) {
            if (key == "prototype") {
                debug("prototype found for ", objInfo);
                // var type = getType(objInfo);
                // debug("Type: ", type);
                //debug("Function value for properties.prototype: ", objInfo.properties[key]);
                typeMap[objInfo.properties[key]] = objInfo;
                //addTypeSizeAndCount(objInfo.prototype, objInfo.size);
                break;
            }
        }

        if (objInfo.children) for (var x = 0; x < objInfo.children.length; x++) {
            var kid = objInfo.children[x];
            if (kid != objInfo.prototype && kid != objInfo.parent) { // not the parent scope or prototype chain
                //debug("Kid got through 1: " + kid);
                traverseRoundup(kid);
            }
        }
    } else if (objInfo.nativeClass == "Array") {
        //debug("Array: ", objInfo);
        if (objInfo.children) for (var x = 0; x < objInfo.children.length; x++) {
            var kid = objInfo.children[x];
            //var kid = getObjectInfoAndPrototype(objInfo.children[x]);

            if (kid != objInfo.prototype && kid != objInfo.parent) { // not the parent scope or prototype chain
                //debug("Kid got through 2: ", kid);
                var arrayItem = getObjectInfoAndPrototype(kid);
                //debug("Kid " + kid + " has prototype " + arrayItem.prototype);

                if (arrayItem && arrayItem.prototype) {
                    addTypeSizeAndCount(arrayItem.prototype, arrayItem.size);
                }
            }
        }
    } else if (objInfo.nativeClass == "Object") {
        //debug("Object: ", objInfo);
        if (objInfo.prototype) {
            addTypeSizeAndCount(objInfo.prototype, objInfo.size);
        }
    } else {
        debug("What type is this pup? " + objInfo.nativeClass);
    }
}

function addTypeSizeAndCount(id, size) {
    if (typeSize[id]) {
        typeSize[id] += size;
        typeCount[id]++;
    } else {
        typeSize[id] = size;
        typeCount[id] = 1;
    }
}

function getFirstTab() {
    var windows = getNamedObjects();
    for (var k in windows) {
        if (k.indexOf('chrome:') < 0) {
            return {
                url: k,
                root: windows[k]
            }
        }
    }
}

var f = {};
function dumpObject(objNum) {
    //debug("dumping: " + objNum);

    try {
        if (dump[objNum]) return; // got it
        var objInfo = getObjectInfoAndProperties(objNum);

        if (objInfo) {
            if (filter && objInfo.filename && (objInfo.filename.indexOf("chrome:") >= 0 || objInfo.filename.indexOf("file:") >= 0 || objInfo.filename.indexOf("/ns") >= 0 || objInfo.filename.indexOf("/XPCOMUtils.jsm") >= 0 || objInfo.filename.indexOf("/aboutRobots.js") >= 0)) return;
            
            if (filter && objInfo.nativeClass && (objInfo.nativeClass.indexOf("XPC") >= 0)) return;
            
            // if (objInfo.nativeClass == "Function" || objInfo.nativeClass == "Object") {
            //     debug(JSON.stringify(objInfo));
            //     return;
            // }
            
            // if (objInfo.filename && objInfo.filename.indexOf("sample") >= 0) {
                //debug(JSON.stringify(objInfo));
            // }

            // if (objInfo.filename) {
            //     if (!f[objInfo.filename]) {
            //         debug("Filename: " + objInfo.filename);
            //         f[objInfo.filename] = true;
            //     }
            // } else {
            //     debug("Class: " + objInfo.nativeClass);
            // }

            // meta data
            var key = [objInfo.filename, objInfo.lineStart].join(':');
            if (meta[key]) {
                meta[key].count++;
                meta[key].size += objInfo.size;
                if (!meta[key].filename && objInfo.filename) {
                    meta[key].filename = objInfo.filename;
                }
                if (!meta[key].name && objInfo.name) {
                    meta[key].name = objInfo.name;
                }
                if (!meta[key].lineStart && objInfo.lineStart) {
                    meta[key].lineStart = objInfo.lineStart;
                }
            } else {
                meta[key] = {
                    count: 1,
                    size: objInfo.size,
                    filename: objInfo.filename,
                    lineStart: objInfo.lineStart,
                    name: objInfo.name
                }
            }
            
            if (objInfo.size) {
                totalBytes += objInfo.size;
            }

            dump[objNum] = true;
            //dump[objNum] = objInfo;

            if (objInfo.children) {
                for (var i = 0; i < objInfo.children.length; i++) {
                    dumpObject(objInfo.children[i]);
                }
            }
        }
    } catch (e) {
        print("Bad dumping! " + objNum + " Error: " + e);
    }
}

// This is just a test to exercise the code a bit.
//JSON.stringify(getObjectInfo(getGCRoots()[0]));

// -- KICK IT OFF 

var socket = new ServerSocket();

var IP = "127.0.0.1";
var PORT = 8888;
var BASE_URL = "http://" + IP + ":" + PORT;
var HELP = [
  "REST API methods available:",
  "",
  "  /gc-roots       JSON array of GC root object IDs.",
  "  /dump-win       Dump for the given tab",
  "  /dump-roots?filter=t|f Do a huge heap dump.",
  "  /dump-root/{ID} JSON array of metadata for given GC root.",
  "  /objects/{ID}   JSON metadata about the given object ID.",
  "  /ping           Test to see if the connection is on.",
  "  /stop           Stops the server."];

HELP = HELP.join("\r\n");

socket.bind(IP, PORT);
socket.listen();

var NEWLINE = "\r\n";
var DOUBLE_NEWLINE = NEWLINE + NEWLINE;

function getHeaders(conn) {
  var headers = "";
  while (1) {
    var character = conn.recv(1);
    if (character == null)
      return null;
    headers += character;
    if (headers.indexOf(DOUBLE_NEWLINE) != -1)
      return headers;
  }
}

print("Waiting for requests at " + BASE_URL + ".\n");
print(HELP);

function processRequest(socket) {
  var conn = socket.accept();

  try {
    var requestHeaders = getHeaders(conn);
    if (requestHeaders == null)
      return true;
    var requestLines = requestHeaders.split("\r\n");
    debug("Request: " + requestLines[0]);
    var reqParts = requestLines[0].split(" ");
    var method = reqParts[0];
    var path = reqParts[1];
    debug("Path: " + path);

    var code = "200 OK";
    var toSend;

    // TODO: We'd like to set the MIME type of JSON data to application/json,
    // but Firefox doesn't let us browse a webserver this way, which is
    // annoying, so we're just leaving it at text/plain for now.

    if (path == "/") {
        toSend = HELP;
    } else if (path.indexOf("/stop") == 0) {
        toSend = "'Stopping server now!'";
    } else if (path.indexOf("/ping") == 0) {
        toSend = JSON.stringify(getFirstTab());
//        toSend = "'pong'";
    } else {
        if (path.indexOf("/gc-roots") == 0) {
            toSend = JSON.stringify(getGCRoots());
        } else if (path.indexOf("/dump-win") == 0) {
            var tab = getFirstTab();
            // debug(windows['file:///SourceControl/memory/sample.html']);
            // var root = windows['file:///SourceControl/memory/sample.html'];

            debug("Dumping objects for sample...: " + tab.root);
            dump = {};
            meta = {};

            roundupWindowObjects(tab.root);
            dumpObject(tab.root);

            debug("TOTAL BYTES: " + totalBytes);
            toSend = JSON.stringify({ meta:meta, totalBytes:totalBytes, typeSize:typeSize, typeCount:typeCount, typeMap:typeMap, tabUrl:tab.url });
            
            //toSend = JSON.stringify(getNamedObjects());
        } else if (path.indexOf("/dump-roots") == 0) {
            if (path.indexOf("filter=true") > 0) filter = true;

            var roots = getGCRoots();
            debug("Dumping root objects...");
            dump = {};
            meta = {};

            for (var i = 0; i < roots.length; i++) {
                debug("root: " + i + " of " + roots.length + " id: " + roots[i]);
                dumpObject(roots[i]);
            }
            debug("TOTAL BYTES: " + totalBytes);
            toSend = JSON.stringify({ meta: meta, totalBytes: totalBytes });
        } else if (path.indexOf("/dump-root/") == 0) {
            var objNum = path.match(/^\/dump-root\/(\d+)/);
            if (objNum) {
                objNum = parseInt(objNum[1]);
                debug("Dumping root object with ID: " + objNum);
                dump = {};
                windowRollup = {};
                //meta = {};
                dumpObject(objNum); // recursively get everything
                toSend = JSON.stringify({ id: objNum, heap: dump, meta: meta });
            }
        } else {
            var objNum = path.match(/^\/objects\/(\d+)/);
            if (objNum) {
              //throw new Error('wut');
              objNum = parseInt(objNum[1]);
              debug(objNum);

              var objInfo = getObjectInfoAndProperties(objNum);
              if (objInfo) {
                toSend = JSON.stringify(objInfo);
              } else {
                code = "404 Not Found";
                toSend = "'Object " + objNum + " does not exist.'";
              }
            }
        }
    }

    if (!toSend) {
      code = "404 Not Found";
      toSend = "'Not found, yo.'";
    }

    // maybe wrap the response in JSONP
    toSend = wrapJSONP(path, toSend);
    //debug("toSend == " + toSend);

    //print("headers: " + uneval(requestHeaders));
    var headerLines = ["HTTP/1.0 " + code,
                       "Content-Type: text/plain",
                       "Connection: close",
                       "Content-Length: " + toSend.length];
    var headers = headerLines.join("\r\n");
    var response = headers + DOUBLE_NEWLINE + toSend;
    //print("response: " + uneval(response));
    conn.send(response);
    conn.close();
    //print("response sent.");
  } catch (e) {
    handleError();
    try { conn.close(); } catch (e) {}
  }
  return (path.indexOf("/stop") != 0);
}

var keepGoing = true;

while (keepGoing) {
  try {
    keepGoing = processRequest(socket);
  } catch (e) {
    handleError();
  }
}

print("Closing socket.");
socket.close();
