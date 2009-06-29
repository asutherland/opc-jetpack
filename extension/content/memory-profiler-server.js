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

function debug(out) {
    print("DEBUG: " + out);
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
function dumpObject(objNum) {
    try {
        if (dump[objNum]) return; // got it
        var objInfo = getObjectInfo(objNum);
        if (objInfo) {
            dump[objNum] = objInfo;

            if (objInfo.children) {
                for (var i = 0; i < objInfo.children.length; i++) {
                    dumpObject(objInfo.children[i]);
                }
            }
        }
    } catch (e) {
        console.log("Bad dumping! ", objNum);
    }
}

// This is just a test to exercise the code a bit.
JSON.stringify(getObjectInfo(getGCRoots()[0]));

var socket = new ServerSocket();

var IP = "127.0.0.1";
var PORT = 8888;
var BASE_URL = "http://" + IP + ":" + PORT;
var HELP = [
  "REST API methods available:",
  "",
  "  /gc-roots       JSON array of GC root object IDs.",
  "  /dump-root/{ID} JSON array of metadata for given GC root.",
  "  /objects/{ID}   JSON metadata about the given object ID.",
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
        toSend = "Stopping server now!";
    } else if (path.indexOf("/ping") == 0) {
        toSend = "'Ping!'";
    } else {
        if (path.indexOf("/gc-roots") == 0) {
            toSend = JSON.stringify(getGCRoots());
        } else if (path.indexOf("/dump-root/") == 0) {
            var objNum = path.match(/^\/dump-root\/(\d+)/);
            if (objNum) {
                objNum = objNum[1];
                debug("Dumping root object with ID: " + objNum);
                dump = {};
                dumpObject(objNum); // recursively get everything
                toSend = JSON.stringify({ id: objNum, heap: dump });
            }
        } else {
            var objNum = path.match(/^\/objects\/(\d+)/);
            if (objNum) {
              //throw new Error('wut');
              objNum = objNum[1];
              debug(objNum);
              var objInfo = getObjectInfo(objNum);
              if (objInfo) {
                toSend = JSON.stringify(objInfo);
              } else {
                code = "404 Not Found";
                toSend = "Object " + objNum + " does not exist.";
              }
            }
        }
    }

    if (!toSend) {
      code = "404 Not Found";
      toSend = "Not found, yo.";
    }

    // maybe wrap the response in JSONP
    toSend = wrapJSONP(path, toSend);
    debug("toSend == " + toSend);

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
  if (path == "/stop")
    return false;
  return true;
}

var keepGoing = true;

while (keepGoing) {
  try {
    keepGoing = processRequest(socket);
  } catch (e) {
    handleError();
  }
}

socket.close();
