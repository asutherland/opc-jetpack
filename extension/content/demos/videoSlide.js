jetpack.future.import("slideBar");
jetpack.slideBar.append({
  // Listen for click events on the icon
  onReady: function(slide) $(slide.icon).click(function() {
    let hasVideos = function() $(slide.doc).find("div.video").length > 1;

    // Find video elements to put in the SlideBar
    $(jetpack.tabs.focused.contentDocument).find("video, embed").each(function() {
      let paused = this.paused;

      // Move the video to the slidebar
      let video = $(slide.doc).find("proto > .video").clone();
      video.appendTo(slide.doc.body).prepend(this);

      // Add a control to remove the video
      video.find(".remove").click(function() {
        video.remove();
        // No more videos? Hide the slidebar
        if (!hasVideos())
          slide();
      });

      // Show built-in firefox video controls; we lose the site's custom ones
      this.controls = true;

      // Resume playing for seamless import
      if (!paused && this.play)
        this.play();
    });

    // Slide open to show videos, but only stay open if we have videos
    slide({ size: 206, persist: hasVideos() });
  }),

  html: <>
    <style><![CDATA[
      body { margin: 0; }
      video, embed { max-height: 150px; width: 200px; }
      help { font-style: italic; }
      proto { display: none; }
      div.video { margin: 3px; min-height: 2em; position: relative; }
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
