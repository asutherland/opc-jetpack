var App = {
  _jetpackLinks: {},

  _addButton: function _addButton(div, name, label, disabled) {
    var self = this;
    if (!label)
      label = name;
    var button = $('<span class="buttony"></span>');
    $(button).attr('name', name);
    button.text(label);
    button.mouseup(function() {
      if (typeof $(this).attr('disabled') == 'undefined')
        self._onButton($(this));
    });
    if (disabled)
      $(button).attr('disabled', 'disabled');
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
    case "force-reinstall":
      JetpackRuntime.forceFeedUpdate(feed);
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
    case "open-settings":
      var context = JetpackRuntime.getJetpack(url);
      new SettingsView(context);
      break;
    }
  },

  getLocalFile: function getLocalFile(filename, cb) {
    var req = new XMLHttpRequest();
    req.open('GET', filename, true);
    req.overrideMimeType('text/html');
    req.onreadystatechange = function() {
      if (req.readyState == 4 && req.status == 0)
        cb(req.responseText);
    };
    req.send(null);
  },

  CODE_EDITOR_FILENAME: 'jetpack-editor-code.txt',

  codeEditor: null,

  initCodeEditor: function initCodeEditor() {
    var FeedManager = JetpackRuntime.FeedPlugin.FeedManager;
    var codeEditor = new JetpackCodeEditor(this.CODE_EDITOR_FILENAME);
    if (!FeedManager.isSubscribedFeed(codeEditor.url))
      codeEditor.registerFeed(FeedManager);
    App.codeEditor = codeEditor;
  },

  showCodeEditor: function showCodeEditor() {
    var iframe = $('<iframe id="the-editor"></iframe>');
    iframe.attr('src', 'editor.html#' +
                encodeURI(this.CODE_EDITOR_FILENAME));
    iframe.addClass('editor-widget');
    $("#editor-widget-container").append(iframe);
  },

  // This is called right before an old tab's content is hidden.
  onClickTab: function onClickTab(tabLink, content, hiddenContent) {
    var hiddenTab = $(hiddenContent).attr("id");
    switch (hiddenTab) {
    case "develop":
      $(hiddenContent).find("#editor-widget-container").empty();
      break;
    case "tutorial":
    case "api":
      this.hideExampleEditor();
      break;
    }
  },

  // This is called right after a new tab's content is shown.
  onShowTab: function onShowTab(tabLink, content, hiddenContent) {
    var shownTab = $(content).attr("id");
    switch (shownTab) {
    case "develop":
      this.showCodeEditor();
      break;
    case "tutorial":
      // Generate the tutorial content if we haven't yet.
      var tutorialContent = $("#tutorial .content");
      if (!tutorialContent.children().length) {
        this.getLocalFile(
          "tutorial.html",
          function(html) {
            tutorialContent.html(html);
            App.enableExampleHacking(tutorialContent);
            App.activateDynamicButtons(tutorialContent);
          });
      }
      break;
    case "api":
      // Generate the API reference content if we haven't yet.
      var rawApiDocs = $("#raw-api-documentation");
      var apiContent = $("#api");
      if (!rawApiDocs.children().length) {
        this.getLocalFile(
          "raw-api-documentation.html",
          function(html) {
            rawApiDocs.html(html);
            App.buildApiReference(rawApiDocs, apiContent);
            App.enableExampleHacking(apiContent);
            App.activateDynamicButtons(apiContent);
          });
      }
      break;
    }
  },

  initTabs: function initTabs() {
    var self= this;

    $("#container").tabs(
      {initial: (Extension.Manager.sessionStorage.tab ?
                 Extension.Manager.sessionStorage.tab-1 : 0),
       onShow: function(tabLink, content, hiddenContent) {
         Extension.Manager.sessionStorage.tab = $("#container").activeTab();
         self.onShowTab(tabLink, content, hiddenContent);
       },
       onClick: function(tabLink, content, hiddenContent) {
         self.onClickTab(tabLink, content, hiddenContent);
       }
      });

    // Because onShow isn't triggered for the initially showing tab...
    var tabLink = $("#container .tabs-selected > a");
    var content = $("#container " + tabLink.attr("href"));
    self.onShowTab(tabLink, content, null);
  },

  activateDynamicButtons: function activateDynamicButtons(context) {
    var loggingSource = $(".logging-source", context);
    var tabLink = $(".tab-link", context);

    if (window.console.isFirebug) {
      loggingSource.text("Firebug Console");
      loggingSource.addClass("buttony");
      loggingSource.click(App.openFirebugConsole);
    } else {
      loggingSource.click(App.openJsErrorConsole);
      loggingSource.addClass("buttony");
      loggingSource.text("JS Error Console");
    }

    tabLink.addClass("buttony");
    tabLink.click(
      function() {
        window.scroll(0, 0);
        $("#container").triggerTab($(this).attr('name'));
      });
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
      this._addButton(div, "force-reinstall", "refresh");
      parent = $("#installed-jetpacks");
    } else {
      // We're an unsubscribed feed.
      this._addButton(div, "reinstall");
      this._addButton(div, "purge");
      parent = $("#uninstalled-jetpacks");
    }

    this._addButton(div, "view-source", "view source");

    var context = JetpackRuntime.getJetpack(url);
    this._addButton(div, "open-settings", "settings",
                    !(context && context.manifest.settings));

    div.hide();
    if (parent.children('.jetpack').length == 0)
      parent.slideDown();
    parent.append(div);
    div.slideDown(function() { self.updateInstalledJetpackCount(); });

    this._jetpackLinks[url] = div;
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

  buildApiReference: function buildApiReference(data, output) {
    var fakeUri = {spec: "http://jetpack.mozillalabs.com/"};
    var fakeFeed = {uri: fakeUri,
                    srcUri: fakeUri,
                    getCode: function() { return ""; }};

    var context = new JetpackRuntime.Context(fakeFeed);

    context.sandbox.jetpack.future.list().forEach(
      function(name) {
        context.sandbox.jetpack.future.import(name);
      });

    this.buildDocsForObject(output, data, context.sandbox,
                            data.find("[name=globals]"));
    this.buildDocsForObject(output, data,
                            context.sandbox.jetpack.tabs.focused,
                            data.find("[name=Tab]"));

    context.unload();
  },

  buildDocsForObject: function buildDocsForObject(output,
                                                  data,
                                                  object,
                                                  objectData) {
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
      if (data.get(0).nodeName == "A")
        data = getLinkedDocs(data);
      var objDocs = data.clone();
      // Remove all information about properties of the object,
      // we'll deal with that later.
      objDocs.find(".property").remove();

      // Compose the heading that contains the property/function name.
      var heading = null;
      if (nameParts.length) {
        heading = $('<div class="heading"></div>');
        heading.text($(output).attr("name"));
      }

      const VALID_TYPES = {string: 'String',
                           options: 'Options Object',
                           'function': 'Function',
                           number: 'Number',
                           url: 'URL'};

      function makeTypes(className) {
        var types = $('<span class="types"></span>');
        var classes = className.split(' ');
        var typesArray = [name for each (name in classes)
                               if (name in VALID_TYPES)];
        jQuery.each(
          typesArray,
          function(i) {
            if (i > 0)
              types.append(document.createTextNode(' or '));
            var type = $('<span class="type"></span>');
            type.text(VALID_TYPES[this]);
            type.mouseover(glossaryMouseOverHandler);
            types.append(type);
          });
        return types;
      }

      function makeArgDocs(arg, output, name) {
        var argDoc = $('<div class="argument"></div>');
        argDoc.append($('<span class="name"></span>').text(name));
        argDoc.append(makeTypes(arg.className));
        var desc = $('<span class="description"></span>');
        if ($(arg).hasClass("options")) {
          $(arg).children().each(
            function() {
              var row = $('<div class="option">' +
                          '<span class="name"></span>' +
                          '<span class="description"></span>' +
                          '</div>');
              row.find('.name').text($(this).attr("name"))
                               .after(makeTypes(this.className));
              row.find('.description').append($(this).html());
              desc.append(row);
            });
        } else
          desc.append($(arg).html());
        argDoc.append(desc);
        output.append(argDoc);
      };

      // Compose the function signature, if we're a function.
      var args = objDocs.find(".argument");
      var argHeading = $('<h2>Arguments</h2>');
      var argDocs = $('<div class="arguments"></div>');
      if (typeof(object) == "function" ||
          args.length) {
        heading.append(document.createTextNode("("));
        args.each(
          function(i) {
            var name = $(this).attr("name");
            if (i > 0)
              heading.append(document.createTextNode(","));
            heading.append(document.createTextNode(name));
            makeArgDocs(this, argDocs, name);
          });
        heading.append(document.createTextNode(")"));
      }
      if (!args.length) {
        argDocs = null;
        argHeading = null;
      }
      args.remove();

      objDocs.addClass('description');

      var descHeading = argDocs ? $('<h2>Description</h2>') : null;
      objDocs.find("em").mouseover(glossaryMouseOverHandler);
      var properties = $('<div class="properties"></div>');

      var content = $('<div class="content"></div>');
      content.append(argHeading, argDocs, descHeading, objDocs);

      $(output).append(heading, content, properties);
      output = properties;

      var names = [name for (name in object)];
      names.sort();
      for each (name in names) {
        var result = data.find(".property[name='" + name + "']");
        if (result.length) {
          var newOutput = $('<div class="documentation">');
          var newNameParts = nameParts.slice();
          newNameParts.push(name);
          newOutput.attr("name", newNameParts.join("."));
          generateDocs(newNameParts, object[name], result, newOutput);
          output.append(newOutput);
        } else {
          //console.warn("Undocumented property", name);
        }
      }
    }

    generateDocs([], object, objectData, output);
  },

  EXAMPLE_FILENAME: "jetpack-example-code.txt",

  exampleEditor: null,

  currExampleElement: null,

  hideExampleEditor: function hideExampleEditor() {
    if (this.currExampleElement) {
      $(this.currExampleElement).empty();
      $(this.currExampleElement).addClass('example');
      var code = this.exampleEditor.loadData();
      $(this.currExampleElement).text(code);
      this.currExampleElement = null;
      this.resetExampleEditor();
    }
  },

  resetExampleEditor: function resetExampleEditor() {
    var FeedManager = JetpackRuntime.FeedPlugin.FeedManager;

    if (!this.exampleEditor)
      this.exampleEditor = new JetpackCodeEditor(this.EXAMPLE_FILENAME);

    this.exampleEditor.saveData('');
    if (!FeedManager.isSubscribedFeed(this.exampleEditor.url))
      this.exampleEditor.registerFeed(FeedManager);
    else
      JetpackRuntime.forceFeedUpdate(this.exampleEditor.url);
  },

  enableExampleHacking: function enableExampleHacking(context) {
    var self = this;

    function showEditor(element) {
      var iframe = $('<iframe></iframe>');
      iframe.attr('src', 'editor.html#' +
                  encodeURI(self.EXAMPLE_FILENAME));
      iframe.addClass('editor-widget');
      var button = $('#reload-editor-code').clone();
      button.click(
        function() {
          JetpackRuntime.forceFeedUpdate(self.exampleEditor.url);
        });
      $(element).removeClass('example');
      $(element).empty().append(iframe).append('<p></p>');
      $(element).append(button);
      self.currExampleElement = element;
    }

    // Hovering over an example shows instructions on how to edit.
    var edit = $(".messages .click-to-edit").clone().addClass("overlay");

    var example = $(".example", context);

    example.hover(
      function(event) {
        if( this.className == "example" ) $(this).after( edit );
      },
      function(event) {
          edit.remove();
      });

    // Clicking on an example code snippet enables the user
    // to edit it.
    example.click(
      function(event) {
        if (self.currExampleElement == this)
          // We've already got an editor embedded in us, just leave.
          return;
        self.hideExampleEditor();
        var code = $(this).text();
        self.exampleEditor.saveData(code);
        JetpackRuntime.forceFeedUpdate(self.exampleEditor.url);
        showEditor(this);
        edit.remove();
      });

    // Some of the example snippets don't have proper HTML-escaping,
    // which is okay b/c it improves their readability when viewing
    // their source; we'll properly escape them here.
    example.each(
      function() {
        $(this).text(jQuery.trim($(this).html()));
      });
  }
};

$(window).ready(
  function() {
    App.initCodeEditor();
    App.resetExampleEditor();

    // If we're being loaded in a hidden window, don't even worry about
    // providing the UI for this page.
    if (!Extension.isVisible)
      return;

    App.initTabs();

    window.setInterval(App.tick, 1000);

    // Activate some unique dynamic buttons.

    $("#reload-editor-code").click(
      function() {
        JetpackRuntime.forceFeedUpdate(App.codeEditor.url);
      });
    $("#this-page-source-code").click(
      function() {
        App.viewSource(window.location.href, null);
      });
    $("#force-gc").click(App.forceGC);
    $("#run-tests").click(
      function() {
        Tests.run(null, $("#test-filter").val());
      });

    if (Extension.isInSafeMode)
      $(".general-warnings").append($("#safe-mode-enabled"));

    if (window.console.isFirebug)
      $(".developer-warnings").append($("#firebug-caveats"));
    else
      $(".developer-warnings").append($("#firebug-not-found"));

    App.activateDynamicButtons(document);

    // Set up the feed management interface.

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

    // Finish up.

    App.updateInstalledJetpackCount();
    App.forceGC();
  });
