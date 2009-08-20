var xhr = jQuery.get(
  'http://www.mozilla.org/',
  function onSuccess(data, textStatus) {
     test.assert(data.indexOf("Mozilla") != -1);
     test.success();
   });

test.assert(xhr);
test.setTimeout(2000, "XHR must succeed");
