var EXPORTED_SYMBOLS = ["MemoryTracking"];

var MemoryTracking = {
  COMPACT_INTERVAL: 1000,
  _trackedObjects: {},
  track: function track(object, bin, stackFrameNumber) {
    var frame = Components.stack.caller;
    var weakref = Components.utils.getWeakReference(object);
    if (!bin)
      bin = object.constructor.name;
    if (bin == "Object")
      bin = frame.name;
    if (!(bin in this._trackedObjects))
      this._trackedObjects[bin] = [];

    if (stackFrameNumber > 0)
      for (var i = 0; i < stackFrameNumber; i++)
        frame = frame.caller;

    this._trackedObjects[bin].push(
      {weakref: weakref,
       created: new Date(),
       fileName: frame.filename,
       lineNumber: frame.lineNumber});
  },
  compact: function compact() {
    var newTrackedObjects = {};
    for (name in this._trackedObjects) {
      var oldBin = this._trackedObjects[name];
      var newBin = [];
      var strongRefs = [];
      for (var i = 0; i < oldBin.length; i++) {
        var strongRef = oldBin[i].weakref.get();
        if (strongRef && strongRefs.indexOf(strongRef) == -1) {
          strongRefs.push(strongRef);
          newBin.push(oldBin[i]);
        }
      }
      if (newBin.length)
        newTrackedObjects[name] = newBin;
    }
    this._trackedObjects = newTrackedObjects;
  },
  getBins: function getBins() {
    var names = [];
    for (name in this._trackedObjects)
      names.push(name);
    return names;
  },
  getLiveObjects: function getLiveObjects(bin) {
    function getLiveObjectsInBin(bin, array) {
      for (var i = 0; i < bin.length; i++) {
        var object = bin[i].weakref.get();
        if (object)
          array.push(bin[i]);
      }
    }

    var results = [];
    if (bin) {
      if (bin in this._trackedObjects)
        getLiveObjectsInBin(this._trackedObjects[bin], results);
    } else
      for (name in this._trackedObjects)
        getLiveObjectsInBin(this._trackedObjects[name], results);
    return results;
  }
};
