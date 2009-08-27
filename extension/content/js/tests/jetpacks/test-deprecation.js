test.assert(jetpack.sessionStorage);
test.assert(!jetpack.sessionStorage.blah);

test.assertEqual(jetpack.json.decode('{"foo":1}').foo, 1);
