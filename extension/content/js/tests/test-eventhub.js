var EventHubTests = {
  get eventHub() {
    var jsm = {};
    var url = "resource://jetpack/ubiquity-modules/eventhub.js";
    Components.utils.import(url, jsm);

    delete this.eventHub;
    this.eventHub = jsm;
    return this.eventHub;
  },

  HubFramework: function HubFramework() {
    let self = this;
    self.hub = new EventHubTests.eventHub.EventHub();
    self.lastNotify = {eventName: undefined, data: undefined};
    self.listener = function listener(eventName, data) {
      self.lastNotify.eventName = eventName;
      self.lastNotify.data = data;
    };
  },

  testNotifies: function(self) {
    let fw = new this.HubFramework();

    fw.hub.addListener("testEvent", fw.listener);
    fw.hub.notifyListeners("testEvent", "foo");
    self.assertEqual(fw.lastNotify.eventName, "testEvent");
    self.assertEqual(fw.lastNotify.data, "foo");
  },

  testRemoveWorks: function(self) {
    let fw = new this.HubFramework();

    fw.hub.addListener("testEvent", fw.listener);
    fw.hub.removeListener("testEvent", fw.listener);
    fw.hub.notifyListeners("testEvent", "foo");
    self.assertEqual(fw.lastNotify.eventName, undefined);
    self.assertEqual(fw.lastNotify.data, undefined);
  },

  testRaisesErrorOnDoubleRemove: function(self) {
    let fw = new this.HubFramework();

    fw.hub.addListener("testEvent", fw.listener);
    fw.hub.removeListener("testEvent", fw.listener);
    self.assertRaises(
      function() { fw.hub.removeListener("testEvent", fw.listener); },
      this.eventHub.Error
      );
    self.assertEqual(self.lastException.message,
                     'Listener not registered for event "testEvent"');
  },

  testRaisesErrorOnDoubleRegister: function(self) {
    let fw = new this.HubFramework();

    fw.hub.addListener("testEvent", fw.listener);
    self.assertRaises(
      function() { fw.hub.addListener("testEvent", fw.listener); },
      this.eventHub.Error
      );
    self.assertEqual(self.lastException.message,
                     'Listener already registered for event "testEvent"');
  },

  testAttachMethodsWorks: function(self) {
    let fw = new this.HubFramework();

    let obj = new Object();

    fw.hub.attachMethods(obj);

    obj.addListener("testEvent", fw.listener);
    fw.hub.notifyListeners("testEvent", "foo");
    self.assertEqual(fw.lastNotify.eventName, "testEvent");
    self.assertEqual(fw.lastNotify.data, "foo");
    obj.removeListener("testEvent", fw.listener);
  }
};
