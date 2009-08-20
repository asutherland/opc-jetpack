var id = setTimeout(function() { test.success(); }, 100);
test.assertEqual(typeof(id), 'number');
test.setTimeout(1000, "Timeout function must be called.");
