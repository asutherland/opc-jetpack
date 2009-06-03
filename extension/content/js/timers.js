function Timers(impl) {
  MemoryTracking.track(this);

  var timeouts = {};
  var intervals = {};

  this.setInterval = function(cb, ms) {
    var args = Array.slice(arguments, 2);
    function cbWrapper() {
      cb.apply(null, args);
    }
    var id = impl.setInterval(cbWrapper, ms);
    intervals[id] = cbWrapper;
    return id;
  };

  this.clearInterval = function(id) {
    if (id in intervals) {
      delete intervals[id];
      impl.clearInterval(id);
    }
  };

  this.setTimeout = function(cb, ms) {
    var args = Array.slice(arguments, 2);
    function cbWrapper() {
      delete timeouts[id];
      cb.apply(null, args);
    }
    var id = impl.setTimeout(cbWrapper, ms);
    timeouts[id] = cbWrapper;
    return id;
  };

  this.clearTimeout = function(id) {
    if (id in timeouts) {
      delete timeouts[id];
      impl.clearTimeout(id);
    }
  };

  Extension.addUnloadMethod(
    this,
    function() {
      for (id in timeouts) {
        delete timeouts[id];
        impl.clearTimeout(id);
      }
      for (id in intervals) {
        delete intervals[id];
        impl.clearInterval(id);
      }
    });
}
