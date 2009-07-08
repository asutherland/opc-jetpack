jetpack.future.import("slideBar");

// Keep track of how many videos moved to the SlideBar
let videoCount = 0;

// Get video-like elements from the currently focused tab
function getTabVideos() {
  return $(jetpack.tabs.focused.contentDocument).find("video, embed");
}

jetpack.slideBar.append({
  onReady: function(slider) {
    // Listen for tab-ready events and notify in the SlideBar if there's videos
    jetpack.tabs.onReady(function() {
      if (getTabVideos().length > 0)
        slider.notify();
    });
  },
  
  onClick: function(slider) {
    // Find video elements to put in the SlideBar
    getTabVideos().each(function() {
      let paused = this.paused;

      // Move the video to the SlideBar
      let video = $(slider.contentDocument).find("proto > .video").clone();
      video.appendTo(slider.contentDocument.body).prepend(this);
      ++videoCount;

      // Add a control to remove the video
      video.find(".remove").click(function() {
        video.remove();
        // No more videos? Close the slidebar
        if (--videoCount == 0)
          slider.close();
      });

      // Show built-in firefox video controls; we lose the site's custom ones
      this.controls = true;

      // Resume playing for seamless import
      if (!paused && this.play)
        this.play();
    });

    // Slide open to show videos, but only stay open if we have videos
    if (videoCount > 0)
      slider.slide(this.width, true);
  },

  width: 200,
  html: <>
    <style><![CDATA[
      body { margin: 0; overflow: hidden; }
      video, embed { max-height: 150px; width: 200px; }
      help { font-style: italic; }
      proto { display: none; }
      div.video { margin: 3px 0; min-height: 2em; position: relative; }
      div.video div.remove { background: #000; color: #fff; height: 1em; left: 3px; position: absolute; top: 3px; visibility: hidden; width: 1em; }
      div.video:hover div.remove { border: 1px solid #fff; -moz-border-radius: 1em; opacity: .6; text-align: center; visibility: visible; }
      div.video div.remove:hover { cursor: pointer; opacity: .8; }
    ]]></style>
    <body>
      <help>click icon when viewing videos</help>
      <proto>
        <div class="video">
          <div class="remove">X</div>
        </div>
      </proto>
    </body>
  </>
});
