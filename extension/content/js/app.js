var App = {
  _jetpackLinks: {},

  _addButton: function _addButton(div, name, label) {
    var self = this;
    if (!label)
      label = name;
    var button = $('<span class="buttony"></span>');
    $(button).attr('name', name);
    button.text(label);
    button.mouseup(function() { self._onButton($(this)); });
    $(div).append($('<span>&nbsp;</span>'));
    $(div).append(button);
  },

  _onButton: function _onButton(button) {
    var name = button.attr("name");
    var url = button.parent().find('.jetpack-link').attr('href');
    var feed = JetpackRuntime.FeedPlugin.FeedManager.getFeedForUrl(url);

    if (!feed)
      return;

    // TODO: Add 'check for manual update'
    switch (name) {
    case "view-source":
      // TODO: Show cached code if the feed isn't auto-updating.
      App.viewSource(feed.srcUri.spec, null);
      break;
    case "uninstall":
      feed.remove();
      break;
    case "reinstall":
      feed.unremove();
      break;
    case "purge":
      feed.purge();
      break;
    }
  },

  CODE_EDITOR_FILENAME: 'jetpack-editor-code.txt',

  codeEditor: null,

  initTabs: function initTabs() {
    var FeedManager = JetpackRuntime.FeedPlugin.FeedManager;
    var codeEditor = new JetpackCodeEditor(this.CODE_EDITOR_FILENAME);
    if (!FeedManager.isSubscribedFeed(codeEditor.url))
      codeEditor.registerFeed(FeedManager);
    JetpackRuntime.forceFeedUpdate(codeEditor.url);
    App.codeEditor = codeEditor;

    var self= this;
    function showEditor() {
      var iframe = $('<iframe id="the-editor"></iframe>');
      iframe.attr('src', 'editor.html#' +
                  encodeURI(self.CODE_EDITOR_FILENAME));
      iframe.addClass('editor-widget');
      $("#editor-widget-container").append(iframe);
    }

    $("#container").tabs(
      {initial: (Extension.Manager.sessionStorage.tab ?
                 Extension.Manager.sessionStorage.tab-1 : 0),
       onShow: function(tabLink, content, hiddenContent) {
         if ($(content).find("#editor-widget-container").length)
           showEditor();
         Extension.Manager.sessionStorage.tab = $("#container").activeTab();
       },
       onClick: function(tabLink, content, hiddenContent) {
         $(hiddenContent).find("#editor-widget-container").empty();
         self.hideTutorialEditor();
       }
      });

    // Because onShow isn't triggered for the initially showing tab...
    if ($("#container .tabs-selected > a").attr("href") == "#develop")
      showEditor();
  },

  updateInstalledJetpackCount: function updateInstalledJetpackCount() {
    var count = $("#installed-jetpacks").children().length;
    var messages = $(".messages .installed-jetpacks");
    var node;
    if (count > 1) {
      node = messages.find(".has-many");
      node.find(".installed-count").text(count);
    } else
      node = messages.find(".has-" + count);
    $("#installed .summary").empty().append(node.clone());
  },

  removeLinkForJetpack: function removeLinkForJetpack(url) {
    var self = this;
    if (url in this._jetpackLinks) {
      this._jetpackLinks[url].slideUp(
        function() {
          var me = $(this);
          var myParent = me.parent();
          me.remove();
          if (myParent.children('.jetpack').length == 0)
            myParent.slideUp();
          self.updateInstalledJetpackCount();
        });
      delete this._jetpackLinks[url];
    }
  },

  addLinkForJetpack: function addLinkForJetpack(feed, eventName) {
    if (feed.isBuiltIn)
      return;

    var self = this;
    var url = feed.uri.spec;

    // Assume that we're either switching subscribed/unsubscribed
    // state or displaying this link for the first time.
    this.removeLinkForJetpack(url);

    // Create a new link to display and show it.
    var link = $('<a class="jetpack-link"></a>').attr('href', url);
    link.text(feed.title);

    var div = $('<div class="jetpack"></div>').append(link);
    MemoryTracking.track(div, "JetpackLink");

    var parent;
    if (eventName == "subscribe") {
      // We're a subscribed feed.
      this._addButton(div, "uninstall");
      parent = $("#installed-jetpacks");
    } else {
      // We're an unsubscribed feed.
      this._addButton(div, "reinstall");
      this._addButton(div, "purge");
      parent = $("#uninstalled-jetpacks");
    }

    this._addButton(div, "view-source", "view source");

    div.hide();
    if (parent.children('.jetpack').length == 0)
      parent.slideDown();
    parent.append(div);
    div.slideDown(function() { self.updateInstalledJetpackCount(); });

    this._jetpackLinks[url] = div;
  },

  get isFirefoxOld() {
    var appInfo = Cc["@mozilla.org/xre/app-info;1"]
                  .getService(Ci.nsIXULAppInfo);
    var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"]
                         .getService(Ci.nsIVersionComparator);
    if (versionChecker.compare(appInfo.version, "3.1b3") < 0)
      return true;
    return false;
  },

  // Open the view-source window. This code was taken from Firebug's source code.
  viewSource: function viewSource(url, lineNumber) {
    window.openDialog("chrome://global/content/viewSource.xul",
                      "_blank", "all,dialog=no",
                      url, null, null, lineNumber);
  },

  openFirebugConsole: function openFirebugConsole() {
    var browser = Extension.visibleBrowser;
    browser.chrome.window.Firebug.toggleBar(true, "console");
  },

  // Open the JS error console.  This code was largely taken from
  // http://mxr.mozilla.org/mozilla-central/source/browser/base/content/browser.js
  openJsErrorConsole: function openJsErrorConsole() {
    var wm = Cc['@mozilla.org/appshell/window-mediator;1'].getService();
    var wmInterface = wm.QueryInterface(Ci.nsIWindowMediator);
    var topWindow = wmInterface.getMostRecentWindow("global:console");

    if (topWindow)
      topWindow.focus();
    else
      window.open("chrome://global/content/console.xul", "_blank",
                  "chrome,extrachrome,menubar,resizable,scrollbars," +
                  "status,toolbar");
  },

  forceGC: function forceGC() {
    Components.utils.forceGC();
    App.tick();
  },

  inspectTrackedObjects: function inspectTrackedObjects(objects) {
    var newObjects = [];
    objects.forEach(
      function(object) {
        var newObject = { object: object.weakref.get() };
        newObject.__proto__ = object;
        newObjects.push(newObject);
      });
    console.log(newObjects);
  },

  tick: function tick() {
    const ID_PREFIX = "MemoryTracking-";
    var bins = MemoryTracking.getBins();
    bins.sort();
    var newRows = $('<div></div>');
    bins.forEach(
      function(name) {
        var objects = MemoryTracking.getLiveObjects(name);
        if (objects.length == 0)
          return;
        var row = $('<div class="row"></div>');
        row.attr("id", ID_PREFIX + name);
        var binName = $('<span class="code"></span>').text(name);
        binName.css({cursor: "pointer"});
        binName.mouseup(
          function() {
            App.viewSource(objects[0].fileName, objects[0].lineNumber);
          });
        row.append(binName);
        row.append($('<span class="count"></span>').text(objects.length));
        if (window.console.isFirebug) {
          var inspectInFb = $('<span class="buttony"></span>');
          inspectInFb.text('inspect');
          inspectInFb.click(
            function() { App.inspectTrackedObjects(objects); }
          );
          row.append(inspectInFb);
        }
        newRows.append(row);
      });
    $("#extension-weakrefs").empty().append(newRows);
    bins = null;
    newRows = null;
  },

  buildApiReference: function buildApiReference() {
    var output = $("#api");
    var data = $("#raw-api-documentation");
    var fakeUri = {spec: "http://jetpack.mozillalabs.com/"};
    var fakeFeed = {uri: fakeUri,
                    srcUri: fakeUri,
                    getCode: function() { return ""; }};

    var context = new JetpackRuntime.Context(fakeFeed);

    function getLinkedDocs(link) {
      var name = link.attr("href").slice(1);
      var result = data.find("[name='" + name + "']");
      if (result.length) {
        return result;
      } else {
        console.warn("Couldn't find linked documentation for", name);
        return $('<div></div>');
      }
    }

    function glossaryMouseOverHandler(event) {
      var name = $(this).text().toLowerCase();
      var entry = $(data).find(".glossary[name='" + name + "']");
      if (entry.length) {
        var overlay = $('<div class="overlay fixed"></div>');
        overlay.append(entry.clone());
        overlay.css({left: $(this).position().left});
        $(this).after(overlay);
        var self = this;
        $(this).mouseout(
          function onOut() {
            overlay.remove();
            $(self).unbind("mouseout", onOut);
          });
      } else {
        console.warn("No glossary entry for", name);
      }
    }

    function generateDocs(nameParts, object, data, output) {
      if (nameParts.length) {
        var heading = $('<div class="heading"></div>');
        heading.text($(output).attr("name"));
        if (data.get(0).nodeName == "A")
          data = getLinkedDocs(data);
        var objDocs = data.clone();
        objDocs.find(".property").remove();
        objDocs.find("em").mouseover(glossaryMouseOverHandler);
        var properties = $('<div class="properties"></div>');
        $(output).append(heading).append(objDocs).append(properties);
        output = properties;
      }
      for (name in object) {
        var result = data.find(".property[name='" + name + "']");
        if (result.length) {
          var newOutput = $('<div class="documentation">');
          var newNameParts = nameParts.slice();
          newNameParts.push(name);
          newOutput.attr("name", newNameParts.join("."));
          generateDocs(newNameParts, object[name], result, newOutput);
          output.append(newOutput);
        } else {
          //console.warn("Undocumented token", name);
        }
      }
    }

    generateDocs([], context.sandbox, data, output);

    context.unload();
  },

  TUTORIAL_FILENAME: "jetpack-tutorial-code.txt",

  tutorialEditor: null,

  currTutorialElement: null,

  hideTutorialEditor: function hideTutorialEditor() {
    if (this.currTutorialElement) {
      $(this.currTutorialElement).empty();
      $(this.currTutorialElement).addClass('example');
      var code = this.tutorialEditor.loadData();
      $(this.currTutorialElement).text(code);
      this.currTutorialElement = null;
    }
  },

  enableTutorialHacking: function enableTutorialHacking() {
    var FeedManager = JetpackRuntime.FeedPlugin.FeedManager;
    var editor = new JetpackCodeEditor(this.TUTORIAL_FILENAME);
    editor.saveData('');
    if (!FeedManager.isSubscribedFeed(editor.url))
      editor.registerFeed(FeedManager);
    JetpackRuntime.forceFeedUpdate(editor.url);
    App.tutorialEditor = editor;

    var self= this;

    function showEditor(element) {
      var iframe = $('<iframe></iframe>');
      iframe.attr('src', 'editor.html#' +
                  encodeURI(self.TUTORIAL_FILENAME));
      iframe.addClass('editor-widget');
      var button = $('#reload-editor-code').clone();
      button.click(
        function() {
          JetpackRuntime.forceFeedUpdate(App.tutorialEditor.url);
        });
      $(element).removeClass('example');
      $(element).empty().append(iframe).append('<p></p>');
      $(element).append(button);
      self.currTutorialElement = element;
    }

    // Hovering over an example shows instructions on how to edit.
    var edit = $(".messages .click-to-edit").clone().addClass("overlay");

    $(".example").hover(
      function(event) {
        if( this.className == "example" ) $(this).after( edit );
      },
      function(event) {
          edit.remove();
      });

    // Clicking on an example code snippet enables the user
    // to edit it.
    $(".example").click(
      function(event) {
        if (self.currTutorialElement == this)
          // We've already got an editor embedded in us, just leave.
          return;
        self.hideTutorialEditor();
        var code = $(this).text();
        editor.saveData(code);
        JetpackRuntime.forceFeedUpdate(editor.url);
        showEditor(this);
        edit.remove();
      });

    // Some of the tutorial snippets don't have proper HTML-escaping,
    // which is okay b/c it improves their readability when viewing
    // their source; we'll properly escape them here.
    $(".example").each(
      function() {
        $(this).text(jQuery.trim($(this).html()));
      });
  }
};

$(window).ready(
  function() {
    App.initTabs();

    window.setInterval(App.tick, 1000);
    $("#reload-editor-code").click(
      function() {
        JetpackRuntime.forceFeedUpdate(App.codeEditor.url);
      });
    $("#this-page-source-code").click(
      function() {
        App.viewSource(window.location.href, null);
      });
    $("#force-gc").click(App.forceGC);
    $("#run-tests").click(function() { Tests.run(); });
    $(".tutorial-link").click(
      function() { $("#container").triggerTab('tutorial'); }
    );

    if (App.isFirefoxOld)
      $(".developer-warnings").append($("#old-firefox-version"));

    if (window.console.isFirebug) {
      $(".developer-warnings").append($("#firebug-caveats"));
      $(".logging-source").text("Firebug Console");
      $(".logging-source").addClass("buttony");
      $(".logging-source").click(App.openFirebugConsole);
    } else {
      $(".developer-warnings").append($("#firebug-not-found"));
      $(".logging-source").click(App.openJsErrorConsole);
      $(".logging-source").addClass("buttony");
      $(".logging-source").text("JS Error Console");
    }

    JetpackRuntime.FeedPlugin.FeedManager.getSubscribedFeeds().forEach(
      function (feed) {
        if (feed.type == "jetpack")
          App.addLinkForJetpack(feed, "subscribe");
      });

    JetpackRuntime.FeedPlugin.FeedManager.getUnsubscribedFeeds().forEach(
      function (feed) {
        if (feed.type == "jetpack")
          App.addLinkForJetpack(feed, "unsubscribe");
      });

    function onFeedEvent(eventName, uri) {
      switch (eventName) {
      case "purge":
        App.removeLinkForJetpack(uri.spec);
        break;
      case "unsubscribe":
      case "subscribe":
        var feed = JetpackRuntime.FeedPlugin.FeedManager.getFeedForUrl(uri);
        if (feed && feed.type == "jetpack")
          App.addLinkForJetpack(feed, eventName);
        break;
      }
    }

    var watcher = new EventHubWatcher(JetpackRuntime.FeedPlugin.FeedManager);
    watcher.add("subscribe", onFeedEvent);
    watcher.add("unsubscribe", onFeedEvent);
    watcher.add("purge", onFeedEvent);

    App.buildApiReference();
    App.enableTutorialHacking();

    $(".tab-link").addClass("buttony");
    $(".tab-link").click(
      function() {
        $("#container").triggerTab($(this).attr('name'));
      });

    App.forceGC();
  });
