
/**
 * A function that raises an exception if the given callback doesn't.
 *
 * Note: we can't use the test runner's assertRaises, because it uses instanceof
 * to check that the exception is of the expected type, and we're in a different
 * context from the settings store, so our Error constructor is not the same as
 * the setting store's Error constructor.
 **/
var assertRaises = function assertRaises(cb, exception, message) {
  var wasExceptionThrown = false;
  try {
    cb();
  } catch (e) {
    wasExceptionThrown = true;
    this.lastException = e;
  }
  if (!wasExceptionThrown) {
    if (!message)
      message = "Assertion failed: exception not raised";
    test._exceptionAtCaller(message);
  }
};

var manifest = {};


//****************************************************************************//
// Test the settings validator to make sure it catches various problems
// with the settings manifest.

var cb = function() { jetpack.future.import("storage.settings") };

manifest.settings = {};
assertRaises(cb, Error, "manifest.settings is not an array");

manifest.settings = [ { label: "T", type: "text" } ];
assertRaises(cb, Error, "a setting doesn't have a name");

manifest.settings = [ { name: "t", type: "text" } ];
assertRaises(cb, Error, "a setting doesn't have a label");

manifest.settings = [ { name: "t", label: "T" } ];
assertRaises(cb, Error, "a setting doesn't have a type");

manifest.settings = [ { name: "t", label: "T", type: "bar" } ];
assertRaises(cb, Error, "a setting has an unknown type");

manifest.settings = [ { name: "t", label: "T", type: "group" } ];
assertRaises(cb, Error, "a group setting doesn't have a settings property");

manifest.settings = [ { name: "t", label: "T", type: "group", settings: {} } ];
assertRaises(cb, Error, "a group setting's settings property isn't an array");

manifest.settings = [ { name: "t", label: "T", type: "range",
                        min: 6, max: 5 } ];
assertRaises(cb, Error, "a range setting's min is greater than its max");

manifest.settings = [ { name: "t", label: "T", type: "range",
                        min: 5, max: 5 } ];
assertRaises(cb, Error, "a range setting's min is equal to its max");

manifest.settings = [ { name: "t", label: "T", type: "range",
                        min: 4, max: 5, step: 2 } ];
assertRaises(cb, Error, "a range setting's step is greater than its max - min");

manifest.settings = [ { name: "t", label: "T", type: "member" } ];
assertRaises(cb, Error, "a member setting doesn't have a set property");

manifest.settings = [ { name: "t", label: "T", type: "member", set: {} } ];
assertRaises(cb, Error, "a member setting's set property isn't an array");


//****************************************************************************//
// Test the settings store to make sure it initializes settings correctly
// when the manifest is valid, and we can get and set values.

manifest.settings = [
  {
    name: "twitter",
    type: "group",
    label: "Twitter",
    settings: [
      { name: "username", type: "text", label: "Username" },
      { name: "password", type: "password", label: "Password" }
    ]
  },
  {
    name: "facebook",
    type: "group",
    label: "Facebook",
    settings: [
      { name: "username", type: "text", label: "Username", "default": "jdoe" },
      { name: "password", type: "password", label: "Secret" }
    ]
  },
  { name: "music", type: "boolean", label: "Music", "default": true },
  { name: "volume", type: "range", label: "Volume", min: 0, max: 10, "default": 5 },
  { name: "size", type: "number", label: "Size" },
  { name: "mood", type: "member", label: "Mood", set: ["happy", "sad", "nonchalant"] }
];

jetpack.future.import("storage.settings");

// Make sure we can get settings' default values.
test.assertEqual(jetpack.storage.settings.facebook.username, "jdoe");
test.assertEqual(jetpack.storage.settings.music, true);
test.assertEqual(jetpack.storage.settings.volume, 5);

// Make sure we can change a setting with a default value programmatically.
jetpack.storage.settings.volume = 6;
test.assertEqual(jetpack.storage.settings.volume, 6);

// Make sure we can change a setting without a default value programmatically.
jetpack.storage.settings.twitter.username = "johnd";
test.assertEqual(jetpack.storage.settings.twitter.username, "johnd");
