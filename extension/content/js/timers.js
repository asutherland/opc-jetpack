function Timers(impl) {
  MemoryTracking.track(this);

  var timeouts = {};
  var intervals = {};

  this.setInterval = function(cb, ms) {
    function cbWrapper() {
      cb();
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
    function cbWrapper() {
      delete timeouts[id];
      cb();
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

  this.addMethodsTo = function addMethodsTo(obj) {
    var self = this;

    ['setInterval', 'clearInterval',
     'setTimeout', 'clearTimeout'].forEach(
       function(name) {
         obj[name] = self[name];
       });
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
