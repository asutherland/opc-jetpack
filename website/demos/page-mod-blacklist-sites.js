jetpack.future.import("pageMods");

var callback = function(document){
  // check the current time if it is between 9 and 5
  // 'blacklist' the sites in options.matches
  var currentTime;
  var currentHour;
  currentTime = new Date();
  currentHour = currentTime.getHours();
  if (currentHour > 8 && currentHour < 17){
    document.title = "This site is blacklisted. Get some work done!";
    $(document).find("body").css({border:"3px solid #000000"});
    $(document).find("body").children().hide();
    $(document).find("body").prepend($('<h1>Sorry this site is blacklisted until 17:00. sadface.</h1>'));
  }

};

var options = {};
options.matches = ["http://*.reddit.com/*",
                   "http://*.cnn.com/*",
                   "http://*.bbc.co.uk/*",
                   "http://*.dpreview.com/*",
                   "http://dpreview.com/*",
                   "http://*.bloglines.com/*",
                   "http://bloglines.com/*"];
jetpack.pageMods.add(callback, options);
