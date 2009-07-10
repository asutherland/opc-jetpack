jetpack.future.import("audio");
jetpack.future.import("slideBar");
jetpack.future.import("storage.simple");

/* Globals */
var site, title, cb;
var time = new Date();
var initialContent = '<style type="text/css"> \
h4 {font-family: Arial;}</style> \
<h4>Voice Memos</h4> \
<div id="content"></div>';

function showUrl(event) {
  jetpack.tabs.focused.contentDocument.location = event.data;
}
function playSound(event) {
  jetpack.audio.playFile(event.data);
}

function addMemo(path) {
  let ctime = time.getMonth() +1;
  ctime += "/" + time.getDate();
  ctime += " at " + time.getHours();
  ctime += ":" + time.getMinutes();
  
  let memo = {'site':site, 'path':path, 'time':ctime, 'title':title};
  let memos = jetpack.storage.simple.memos;
  
  if (!memos) {
    jetpack.storage.simple.memos = [memo];
  } else {
    memos[memos.length] = memo;
    jetpack.storage.simple.memos = memos;
  }
  jetpack.storage.simple.sync();
  jetpack.notifications.show("Memo saved!");
}

function displayMemos(content) {
  let toShow = '';
  let memos = jetpack.storage.simple.memos;

  if (!memos) {
    content.attr('innerHTML', 'No memos recorded');
  } else {
    for (let i = 0; i < memos.length; i++) {
      toShow += '<img id="sound' + i;
      toShow += '" border="0" src="http://www.kix.in/misc/jetpacks/play.png"/> ';
      toShow += '<a href="#" id="url'+ i + '">' + memos[i].title + '</a>';
      toShow += ' on ' + memos[i].time;
      toShow += '<br/>';
    }
    content.attr('innerHTML', toShow);
    for (i = 0; i < memos.length; i++) {
      content.find("#url" + i).bind('click', memos[i].site, showUrl);
      content.find("#sound" + i).bind('click', 'file://' + memos[i].path, playSound);
    }
  }
}

jetpack.statusBar.append({
  html: '<img src="http://www.kix.in/misc/jetpacks/record.png"/>',
  width: 16,
  onReady: function(doc) {
    $(doc).find("img").click(function() {
      if (jetpack.audio.isRecording) {
        addMemo(jetpack.audio.stopRecording());
        $(doc).find("img").attr("src", "http://www.kix.in/misc/jetpacks/record.png");
      } else {
        site = jetpack.tabs.focused.url;
        title = jetpack.tabs.focused.contentDocument.title;
        jetpack.audio.recordToFile();
        jetpack.notifications.show("Recording");
        $(doc).find("img").attr("src", "http://www.kix.in/misc/jetpacks/stop.png");
      }
    });
  }
});

jetpack.slideBar.append({
  width: 250,
  icon: 'http://www.kix.in/misc/jetpacks/notes.png',
  html: initialContent,
  onReady: function(slide) {
    cb = slide;
  },
  onSelect: function(slide) {
    displayMemos($(slide.contentDocument).find("#content"));
  }
});

jetpack.tabs.onFocus(function() {
  let memos = jetpack.storage.simple.memos;
  for (let i = 0; i < memos.length; i++) {
    if (this.url == memos[i].site)
      cb.notify();
  }
});
