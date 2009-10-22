var manifest = {
  settings: [
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
  ]
};

jetpack.future.import("storage.settings");

test.assertEqual(jetpack.storage.settings.facebook.username, "jdoe");
test.assertEqual(jetpack.storage.settings.music, true);
test.assertEqual(jetpack.storage.settings.volume, 5);
