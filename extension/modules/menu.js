/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et: */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Jetpack.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Drew Willcoxon <adw@mozilla.com> (Original Author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

let EXPORTED_SYMBOLS = ["exports"];

let Cc = Components.classes;
let Ci = Components.interfaces;

let gOsX = Cc["@mozilla.org/xre/app-info;1"].
             getService(Ci.nsIXULRuntime).
             OS === "Darwin";

Components.utils.import("resource://jetpack/modules/track.js");

// Exports /////////////////////////////////////////////////////////////////////

let exports = {
  // jetpack.menu.
  menu: function exports_menu(aFeatureContext) {
    // Get all the docs of the currently opened browsers.
    let docs = [];
    let winEnum = Cc["@mozilla.org/appshell/window-mediator;1"].
                    getService(Ci.nsIWindowMediator).
                    getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements())
      docs.push(winEnum.getNext().QueryInterface(Ci.nsIDOMWindow).document);

    let menubarMakers = makeMenubarMenus(aFeatureContext, docs);

    // jetpack.menu, an alias of the Tools menu.
    let jpMenu = menubarMakers.tools();

    // Attach the menu bar menus to jetpack.menu.
    for (let [name, maker] in Iterator(menubarMakers))
      jpMenu[name] = maker();

    // jetpack.menu.context.
    jpMenu.context = makeContextMenus(aFeatureContext, docs);

    aFeatureContext.menuNamespaceLoaded = true;
    return jpMenu;
  },

  // jetpack.Menu, the Menu constructor.
  Menu: function exports_Menu(aFeatureContext) {
    return function exports_Menu_ctor(aOpts) {
      return new Menu(aOpts, aFeatureContext);
    }
  }
};

// Returns the object at the jetpack.menu.context namespace.
function makeContextMenus(aFeatureContext, aDocs) {
  let domains = [];

  domains.unshift(new ContextMenuDomain(aFeatureContext,
    function featureDomainGuard(cWin) cWin._featureId === aFeatureContext.id));
  let featureSet = new ContextMenuSet(null, domains[0]);

  domains.unshift(new ContextMenuDomain(aFeatureContext,
    function contentDomainGuard(cWin, xDoc) cWin == xDoc.defaultView.content));
  featureSet.page = new ContextMenuSet(null, domains[0]);

  domains.unshift(new ContextMenuDomain(aFeatureContext,
    function browserDomainGuard(cWin, xDoc) cWin.document == xDoc));
  featureSet.browser = new ContextMenuSet(null, domains[0]);

  // Add the browser docs to each domain.
  domains.forEach(function (d) aDocs.forEach(function (doc) d.addDoc(doc)));

  // When new browser windows open, add their docs, too.
  let bw = new BrowserWatcher(aFeatureContext);
  bw.onOpen = function makeContextMenus_bw_onOpen(doc) {
    domains.forEach(function (d) d.addDoc(doc));
  };

  return featureSet;
}

// Returns an object { menuName: makeFunc }.  menuName is "file", "tools", so
// on.  makeFunc returns a Menu object.
function makeMenubarMenus(aFeatureContext, aDocs) {
  // Maps menu name => [popupId, insertBeforeId].
  let menus = {
    file: ["menu_FilePopup", null],
    edit: ["menu_EditPopup", null],
    view: ["menu_viewPopup", null],
    history: ["goPopup", "startHistorySeparator"],
    bookmarks: ["bookmarksMenuPopup", "organizeBookmarksSeparator"],
    tools: ["menu_ToolsPopup", "sanitizeSeparator"]
  };

  // Build up the return value and return it.
  let obj = {};
  for (let [name, vals] in Iterator(menus)) {
    let [n, v] = [name, vals];
    obj[n] = function makeMenubarMenus_maker() {
      let menu = new Menu(null, aFeatureContext, new Transforms(v[1]));

      function makeMenubarMenus_setupPopup(doc) {
        let popup = doc.getElementById(v[0]);
        menu._addPopup(popup);
        let unloader = new Unloader(function makeMenubarMenus_unload() {
          menu._removePopup(popup);
        });
        unloader.onFeatureContext(aFeatureContext);
        unloader.onDocUnload(doc);
      }

      // Add each browser doc's popup to the menu.
      aDocs.forEach(makeMenubarMenus_setupPopup);

      // When new browser windows open, add their docs' popups, too.
      let bw = new BrowserWatcher(aFeatureContext);
      bw.onOpen = makeMenubarMenus_setupPopup;

      return menu;
    };
  }
  return obj;
};


// Menus, menuitems ////////////////////////////////////////////////////////////

// A PopupTracker keeps track of XUL popups globally, across all feature
// contexts.  (It takes advantage of the fact that JS modules are cached across
// scopes.)  Its need arises because multiple features may modify a single
// popup.  When a popup is shown, the features' transforms are applied, and when
// it is hidden the transforms are undone.  We must be careful to undo the
// transforms in the reverse order in which they were applied.  Ensuring that
// any given feature's transforms are undone in reverse is easy, and that's
// handled by Menu and ContextMenuDomain.  Ensuring that transforms are undone
// in reverse across features, however, requires global coordination, and that's
// PopupTracker's job.
//
// Consumers should call onPopupshowing() when a popup is shown to register that
// popup and onPopuphiding() when it's hidden to unregister it.  When all
// consumers that have registered a popup have unregistered it, its transforms
// are undone in reverse.  Popups are therefore registered with a PopupTracker
// only while they are showing.
function PopupTracker() {
  MemoryTracking.track(this);
  this.registry = []; // Contains { popup, depth, onHidingFuncs } objects.
}

PopupTracker.prototype = {

  // Registers aPopup.
  onPopupshowing: function PopupTracker_onPopupshowing(aPopup) {
    let record = this._lookupRecord(aPopup);
    if (record)
      record.depth++;
    else
      this._addRecord(aPopup);
  },

  // Unregisters aPopup.  aFunc is a function that will be invoked when all
  // consumers have unregistered aPopup.  It should undo the caller's transforms
  // on aPopup.
  onPopuphiding: function PopupTracker_onPopuphiding(aPopup, aFunc) {
    let record = this._lookupRecord(aPopup);
    record.depth--;
    record.onHidingFuncs.push(aFunc);

    // For a given popup, popuphiding listeners are called in the same order as
    // their popupshowing counterparts.  We've pushed aFunc onto
    // record.onHidingFuncs, so to undo transforms in reverse, just pop each
    // function off of record.onHidingFuncs.
    if (record.depth === 0) {
      this._removeRecord(aPopup);
      while (record.onHidingFuncs.length > 0)
        record.onHidingFuncs.pop()();
    }
  },

  _addRecord: function PopupTracker__addRecord(aPopup) {
    this.registry.push({ popup: aPopup, depth: 1, onHidingFuncs: [] });
  },

  _indexOfRecord: function PopupTracker__indexOfRecord(aPopup) {
    for (let i = 0; i < this.registry.length; i++)
      if (this.registry[i].popup == aPopup)
        return i;
    return -1;
  },

  _lookupRecord: function PopupTracker__lookupRecord(aPopup) {
    let idx = this._indexOfRecord(aPopup);
    return idx >= 0 ? this.registry[idx] : null;
  },

  _removeRecord: function PopupTracker__removeRecord(aPopup) {
    let idx = this._indexOfRecord(aPopup);
    if (idx >= 0)
      this.registry.splice(idx, 1);
  }
};


// Private Menu constructor.  aOpts is any value appropriate to the public Menu
// constructor.  aTransforms is a Transforms object that describes how to apply
// the menu's stack of transforms to a receiver.  aStack is a TransformsStack
// and can be used to initialize the Menu with an existing stack of transforms.
// Both aTransforms and aStack are optional.
function Menu(aOpts, aFeatureContext, aTransforms, aStack) {
  MemoryTracking.track(this);

  const self = this;
  let mFeatureContext = aFeatureContext;
  let mTransforms = aTransforms || new Transforms();
  let mStack = aStack || new TransformsStack();
  let mPopups = []; // Contains { popup, cleanup() } objects.

  mTransforms.mixin(this, mStack);

  this.__defineGetter__("isShowing", function Menu_get_isShowing() {
    return !!showingPopup();
  });

  this.__defineGetter__("items", function Menu_get_items() {
    let arr = [];

    // If the menu has a backing popup, turn its items into Menuitems.
    let visPopup = showingPopup();
    let popup = visPopup || (mPopups.length > 0 ? mPopups[0].popup : null);
    if (popup)
      for (let item in popupIterator(popup))
        arr.push(new Menuitem(item));

    // If the backing popup is showing, transforms have already been applied,
    // so don't apply them again.  Otherwise, apply the transforms to the array.
    if (!visPopup) {
      let context = new TransformsContext(mStack, mTransforms,
                                          new ArrayWrapper(arr));
      context.apply().cleanup();
      arr.forEach(function (menuitem) menuitem._evalFunction());
    }

    return arr;
  });

  this.contextOn = function Menu_contextOn(aNode) {
    aNode = rawNode(aNode);
    if (isXulElt(aNode))
      contextOnXul(aNode);
    else
      contextOnHtml(aNode);
  };

  this.hide = function Menu_hide() {
    let visPopup = showingPopup();
    if (visPopup)
      visPopup.boxObject.QueryInterface(Ci.nsIPopupBoxObject).hidePopup();
  };

  this.item = function Menu_item(aTarget) {
    // Grab the items array, wrap it, and use the wrapper to get the target.
    return new ArrayWrapper(this.items).item(aTarget);
  };

  this.popupOn = function Menu_popupOn(aNode) {
    aNode = rawNode(aNode);
    if (isXulElt(aNode))
      popupOnXul(aNode);
    else
      popupOnHtml(aNode);
  };

  this.show = function Menu_show(aAnchorNode) {
    showPopup(aAnchorNode);
  };

  // Registers aPopup with the Menu, and, unless aPassive is true, sets up event
  // listeners so that when aPopup is shown it contains the items of this Menu,
  // and when it is hidden it reverts to its previous state.
  this._addPopup = function Menu__addPopup(aPopup, aPassive) {
    let record = { popup: aPopup };
    mPopups.unshift(record);

    if (!aPassive) {
      var context;
      var dummyChild;

      // Apply the Menu's transforms when aPopup is shown.
      function Menu__addPopup_onPopupshowing(event) {
        if (event.target == aPopup) {
          context = new TransformsContext(mStack, mTransforms,
                                          new PopupWrapper(aPopup));
          context.apply();
          if (typeof(self.beforeShow) === "function")
            callUserFunc(self, self.beforeShow, [self]);
          Menu.popups.onPopupshowing(aPopup);

          // This stupid business is needed for popups in the OS X menu bar.
          // popuphiding is dispatched to those popups only the first time
          // they're hidden -- unless, for some reason, they're modified during
          // popupshowing.  So, make sure they're modified.
          if (gOsX) {
            dummyChild = aPopup.ownerDocument.createElement("menuitem");
            dummyChild.hidden = true;
            aPopup.appendChild(dummyChild);
          }
        }
      }

      // Undo the transforms when aPopup is hidden.
      function Menu__addPopup_onPopuphiding(event) {
        if (event.target == aPopup)
          Menu.popups.onPopuphiding(aPopup, function Menu__addPopup_hiding() {
            if (typeof(self.beforeHide) === "function")
              callUserFunc(self, self.beforeHide, [self]);
            context.undo().cleanup();

            // Null out context to prevent it from hanging around until aPopup
            // is removed from this Menu or Menu__addPopup_onPopupshowing is
            // called again, whichever happens first.
            context = null;

            if (dummyChild)
              aPopup.removeChild(dummyChild);
          });
      }

      aPopup.addEventListener("popupshowing", Menu__addPopup_onPopupshowing,
                              true);
      aPopup.addEventListener("popuphiding", Menu__addPopup_onPopuphiding,
                              true);

      record.cleanup = function Menu__addPopup_cleanup() {
        aPopup.removeEventListener("popupshowing",
                                   Menu__addPopup_onPopupshowing, true);
        aPopup.removeEventListener("popuphiding",
                                   Menu__addPopup_onPopuphiding, true);
      };
    }
  };

  // Unregisters aPopup from the Menu, removing event listeners if necessary.
  this._removePopup = function Menu__removePopup(aPopup) {
    for (let i = 0; i < mPopups.length; i++) {
      if (mPopups[i].popup == aPopup) {
        if (typeof(mPopups[i].cleanup) === "function")
          mPopups[i].cleanup();
        mPopups.splice(i, 1);
        break;
      }
    }
  };

  init(aOpts);

  // Helper for popupOn and contextOn.  aAttr should be either "popup" or
  // "context".  Creates a backing popup and attaches it to aNode via the
  // attribute aAttr.
  function attachToXul(aNode, aAttr) {
    let doc = browserXulDocFromNode(aNode);
    let popup = doc.createElement("menupopup");
    MemoryTracking.track(popup, "XUL menupopup");
    self._addPopup(popup);
    let id = newGuid();
    popup.setAttribute("id", id);
    let popupset = doc.getElementById("mainPopupSet");
    popupset.appendChild(popup);
    aNode.setAttribute(aAttr, id);

    // popup lives until the feature context or doc is unloaded.
    let unloader = new Unloader(function attachToXul_unload() {
      popupset.removeChild(popup);
      self._removePopup(popup);
    });
    unloader.onFeatureContext(mFeatureContext);
    unloader.onDocUnload(doc);
  }

  // HTML nodes don't have a "context" attribute like XUL nodes.  So, piggyback
  // on popups in aNode's ContextMenuDomain.
  function contextOnHtml(aNode) {
    // We want this Menu to be *the* context menu on aNode, so push a clear
    // transform on the stack first to remove all existing items.
    let set = new ContextMenuSet(null, null, mTransforms);
    set.clear();
    mStack.copyTo(set);
    ContextMenuDomain.addNode(aNode, set);

    // set lives until the feature context or doc is unloaded.
    let unloader = new Unloader(function contextOnHtml_unload() {
      ContextMenuDomain.removeNode(aNode);
    });
    unloader.onFeatureContext(mFeatureContext);
    unloader.onDocUnload(aNode.ownerDocument || aNode);
  }

  // XUL nodes have a "context" attribute, so attach the Menu to it.
  function contextOnXul(aNode) {
    attachToXul(aNode, "context");
  }

  // Dispatches to the init* method appropriate to aOpts's type.  Should do
  // nothing more.
  function init(aOpts) {
    if (isArray(aOpts))
      initWithArray(aOpts);
    else if (aOpts && typeof(aOpts) === "object")
      initWithObject(aOpts);
  }

  function initWithArray(aArr) {
    self.add(aArr);
  }

  function initWithObject(aObj) {
    if (isArray(aObj.items))
      self.add(aObj.items);
    for (let [key, val] in Iterator(aObj))
      if (!(key in self))
        self[key] = val;
  }

  // HTML nodes don't have a "popup" attribute like XUL nodes.  So, just listen
  // for clicks on aNode and show the Menu.
  function popupOnHtml(aNode) {
    function popupOnHtml_onClick(event) {
      if (event.button === 0)
        showPopup(aNode, event.screenY);
    }
    aNode.addEventListener("click", popupOnHtml_onClick, true);

    // Remove the click event listener when the feature context or the node's
    // document is unloaded.
    let unloader = new Unloader(function popupOnHtml_unload() {
      aNode.removeEventListener("click", popupOnHtml_onClick, true);
    });
    unloader.onFeatureContext(mFeatureContext);
    unloader.onDocUnload(aNode.ownerDocument || aNode);
  }

  // XUL nodes have a "popup" attribute, so attach the Menu to it.
  function popupOnXul(aNode) {
    attachToXul(aNode, "popup");
  }

  // Returns the popup registered with the Menu that is currently open, if any.
  function showingPopup() {
    for (let i = 0; i < mPopups.length; i++) {
      let popup = mPopups[i].popup;
      let bo = popup.boxObject.QueryInterface(Ci.nsIPopupBoxObject);

      // We consider popups in the process of showing or hiding to be open,
      // since features are free to modify them during those times.
      if (["showing", "open", "hiding"].indexOf(bo.popupState) >= 0)
        return popup;
    }
    return null;
  }

  // Shows the Menu in a popup anchored on the specified node.  aMouseScreenY
  // should be defined when showing the popup as the result of a click event.
  function showPopup(aAnchorNode, aMouseScreenY) {
    aAnchorNode = rawNode(aAnchorNode);
    let doc = browserXulDocFromNode(aAnchorNode);
    let popup = doc.createElement("menupopup");
    MemoryTracking.track(popup, "XUL menupopup");
    self._addPopup(popup);
    let popupset = doc.getElementById("mainPopupSet");
    popupset.appendChild(popup);
    popup.addEventListener("popuphiding", function Menu_show_onPopuphiding(e) {
      if (e.target == popup) {
        popup.removeEventListener("popuphiding", Menu_show_onPopuphiding, true);
        popupset.removeChild(popup);
        self._removePopup(popup);
      }
    }, true);

    // The default position is "overlap", but it doesn't work well for nodes in
    // the status bar.  Popups on non-Jetpack status bar items appear above the
    // status bar, so we simulate that by detecting where in the browser window
    // the click event occurred:  If the final 35 vertical pixels, show above.
    let position = "overlap";
    if (aMouseScreenY) {
      let browserWin = doc.defaultView;
      let browserBottomY = browserWin.screenY + browserWin.outerHeight;
      if (aMouseScreenY + 35 >= browserBottomY)
        position = "before_start";
    }

    popup.boxObject.QueryInterface(Ci.nsIPopupBoxObject).
      openPopup(aAnchorNode, position, 0, 0, false, false);
  }
}

Menu.popups = new PopupTracker();


// Private Menuitem constructor.  aOpts is any value appropriate for creating a
// Menuitem.  Most of Menuitem's properties simply delegate to the backing XUL
// menuitem element.  See addAccessors().
function Menuitem(aOpts) {
  MemoryTracking.track(this);

  const self = this;
  var mAccessors;
  var mFunction;
  var mXulElt;

  // Map Jetpack Menuitem properties => XUL attributes.
  addAccessors({
    data: "value",
    disabled: "disabled",
    icon: "image",
    label: "label",
    mnemonic: "accesskey",
    xulId: "id"
  });
  init(aOpts);

  // If the Menuitem was initialized with a function, calls it and re-inits with
  // the result.  Returns false if there was an error calling the function and
  // true in all other cases.
  this._evalFunction = function Menuitem__evalFunction(aXulDoc) {
    if (mFunction) {
      var item;
      try {
        item = mFunction(aXulDoc ? makeContextObject(aXulDoc) : undefined);
        if (typeof(item) === "function")
          throw new Error("Menuitem function cannot return another function.");
      }
      catch (err) {
        reportError(err);
        return false;
      }
      init(item);
    }
    return true;
  };

  // Creates and returns a XUL element from aBrowserXulDoc representing the
  // menuitem.
  this._makeXulElt = function Menuitem__makeXulElt(aBrowserXulDoc) {
    if (!this._evalFunction(aBrowserXulDoc))
      return null;

    // Create the element appropriate to the type of the menuitem.
    let hasMenu = this.menu && typeof(this.menu) === "object";
    let eltName = hasMenu ? "menu" : (this.type === "separator" ?
                                      "menuseparator" :
                                      "menuitem");
    let elt = aBrowserXulDoc.createElement(eltName);
    if (hasMenu) {
      let popup = aBrowserXulDoc.createElement("menupopup");
      MemoryTracking.track(popup, "XUL menupopup");
      this.menu._addPopup(popup);
      elt.appendChild(popup);

      // Unregister popup when this item's parent popup is hidden.
      let unloader = new Unloader(function Menuitem__makeXulElt_menu_unload() {
        self.menu._removePopup(popup);
        elt.removeChild(popup);
      });
      unloader.onCapture("popuphiding", aBrowserXulDoc,
        function Menuitem__makeXulElt_menu_hiding(target)
          !elt.parentNode || target == elt.parentNode);
    }

    // Set the element's attributes.  We can't set mXulElt and then use the
    // accessors we define above (i.e., by doing this[prop] = this[prop]),
    // because there's a chicken-and-egg problem.
    for (let [jpProp, xulProp] in Iterator(mAccessors))
      if (this[jpProp])
        elt.setAttribute(xulProp, this[jpProp]);
    if (this.icon)
      elt.setAttribute("class", hasMenu ? "menu-iconic" : "menuitem-iconic");

    // Set up a command listener if the menuitem defines a command.
    if (typeof(this.command) === "function") {
      function Menuitem__makeXulElt_onCommand(event) {
        // Menus disappear when menuitems are clicked, so it's safe and correct
        // to remove the command listener now.
        unloader.unload();
        callUserFunc(self, self.command, [new Menuitem(event.target)]);
      }
      // Listen for bubbles if this item expands into a submenu, captures
      // otherwise.  That way any command listeners added to descendents of
      // an item that expands into a submenu will be called before the item's.
      elt.addEventListener("command", Menuitem__makeXulElt_onCommand, !hasMenu);

      let unloader = new Unloader(
        function Menuitem__makeXulElt_onCommand_unload() {
          // popuphiding events are dispatched to the doc before command events
          // are dispatched to items in the Mac menu bar.  So before
          // Menuitem__makeXulElt_onCommand gets a chance to run, it's removed
          // by this unloader.  A timeout avoids the problem.
          elt.ownerDocument.defaultView.setTimeout(
            function Menuitem__makeXulElt_onCommand_unloadTimeout() {
              elt.removeEventListener("command", Menuitem__makeXulElt_onCommand,
                                      !hasMenu);
            }, 0);
        });

      // Remove the command listener when elt's parent popup is hidden.
      unloader.onCapture("popuphiding", aBrowserXulDoc,
        function Menuitem__makeXulElt_onCommand_onDocHiding(target)
          !elt.parentNode || target == elt.parentNode);
    }

    // Don't set mXulElt any earlier to avoid the chicken-and-egg problem
    // mentioned above.
    mXulElt = elt;
    return elt;
  };

  // This function adds getters and setters to |this| that delegate to the
  // backing XUL menuitem element, if it exists.  aProps should be an object
  // { jetpackProperty: xulProperty } that maps Jetpack Menuitem properties to
  // XUL properties.  If no backing XUL element exists, setting a property "foo"
  // sets a property "_foo".
  function addAccessors(aProps) {
    mAccessors = aProps;
    for (let [jpProp, xulProp] in Iterator(aProps)) {
      let [jp, xul] = [jpProp, xulProp];
      self.__defineGetter__(jp, function Menuitem_getter() {
        return mXulElt ? mXulElt.getAttribute(xul) : self["_" + jp];
      });
      self.__defineSetter__(jp, function Menuitem_setter(val) {
        if (mXulElt)
          mXulElt.setAttribute(xul, val);
        else
          self["_" + jp] = val;
      });
    }
  }

  // Dispatches to the init* method appropriate to aOpts's type.  Should do
  // nothing more.
  function init(aOpts) {
    if (!aOpts)
      initWithFalsey();
    else if (typeof(aOpts) === "string")
      initWithString(aOpts);
    else if (typeof(aOpts) === "function")
      initWithFunction(aOpts);
    else if (isXulElt(aOpts))
      initWithXulElt(aOpts);
    else if (typeof(aOpts) === "object")
      initWithObject(aOpts);
  }

  function initWithFalsey() {
    initWithObject({ type: "separator" });
  }

  function initWithFunction(aFunc) {
    mFunction = aFunc;
  }

  function initWithObject(aObj) {
    for (let [key, val] in Iterator(aObj))
      self[key] = val;
  }

  function initWithString(aStr) {
    initWithObject({ label: aStr });
  }

  function initWithXulElt(aElt) {
    mXulElt = aElt;
  }
};


// A ContextMenuSet is a "set" of context menus and is defined by a
// (domain, selector) pair, where domain is some set of real context menus in
// the browser and selector is a CSS selector.  The menus in a ContextMenuSet
// are those that match the selector in the domain.  The selector may be null,
// in which case the ContextMenuSet contains all menus in the domain.  Any
// transform applied to the ContextMenuSet applies to all menus in it.
function ContextMenuSet(aSelector, aDomain, aTransforms) {
  MemoryTracking.track(this);

  let mSelector = aSelector;
  let mDomain = aDomain;
  let mTransforms = aTransforms || new Transforms();
  let mStack = new TransformsStack();

  mTransforms.mixin(this, mStack);
  if (mDomain)
    mDomain.addSet(this);

  this.__defineGetter__("selector", function ContextMenuSet_get_selector() {
    return mSelector;
  });

  this.on = function ContextMenuSet_on(aSelector) {
    return new ContextMenuSet(aSelector, mDomain);
  };

  this.__defineGetter__("_stack", function ContextMenuSet_get__stack() {
    return mStack;
  });

  this.__defineGetter__("_transforms",
    function ContextMenuSet_get__transforms() {
      return mTransforms;
    });
};


// A ContextMenuDomain is a collection of real context menus in the browser.
// A ContextMenuDomain also contains a set of ContextMenuSets.  When any real
// menu in the domain is shown, the transforms of all the ContextMenuSets that
// match it are applied to it.
function ContextMenuDomain(aFeatureContext, aGuardFunc) {
  MemoryTracking.track(this);
  this.featureContext = aFeatureContext;
  this.guardFunc = aGuardFunc;
  this.sets = [];
}

ContextMenuDomain.prototype = {

  // Registers a XUL doc with the domain.
  addDoc: function ContextMenuDomain_proto_addDoc(aXulDoc) {
    const self = this;
    let isDomainEvent = false;
    var specSets;

    // popupshowing doesn't provide any way of determining whether a popup is a
    // context menu.  The contextmenu event does, but it doesn't provide any
    // handle to the popup.  So, use a two-stage process: 1) capture a
    // contextmenu event and determine whether it occurred in this domain.  If
    // so, 2) the next popupshowing is the context popup.  Apply transforms
    // there.

    function ContextMenuDomain_proto_addDoc_onContextmenu(event) {
      // Get the topmost content window in which the event occured.
      let contentWin = event.view.top;
      let xulDoc = browserXulDocFromContentWindow(contentWin);
      isDomainEvent = self.guardFunc(contentWin, xulDoc);

      // Collect any speculative sets that apply to the popup opened on the node
      // event.target.
      specSets = ContextMenuDomain.nodes.
                   filter(function (n) n.node == event.target).
                   map(function (n) n.set);
    }

    function ContextMenuDomain_proto_addDoc_onPopupshowing(event) {
      // event.target is retargeted in anonymous content.
      let popup = event.originalTarget;

      if (!isDomainEvent || ["popup", "menupopup"].indexOf(popup.localName) < 0)
        return;

      ContextMenuDomain.popups.onPopupshowing(popup);

      isDomainEvent = false;
      let matchingSets = [];
      let popupNode = aXulDoc.popupNode;
      let contentDoc = popupNode.ownerDocument;

      // Apply the transforms of all matching sets.  Speculative sets last.
      self.sets.concat(specSets).forEach(function (set) {
        if (nodeMatchesSelector(popupNode, set.selector, contentDoc)) {
          let context = new TransformsContext(set._stack, set._transforms,
                                              new PopupWrapper(popup));
          let menu = new Menu(null, self.featureContext, set._transforms,
                              set._stack);
          menu._addPopup(popup, true);

          // Unshift so that transforms are undone in reverse order below.
          matchingSets.unshift({ set: set, context: context, menu: menu });
          context.apply();
          if (typeof(set.beforeShow) === "function")
            callUserFunc(set, set.beforeShow,
                         [menu, makeContextObject(aXulDoc)]);
        }
      });

      // Undo the transforms and clean up when the popup is hidden.
      aXulDoc.addEventListener("popuphiding",
        function ContextMenuDomain_proto_addDoc_onPopuphiding(event) {
          if (event.originalTarget == popup) {
            aXulDoc.removeEventListener("popuphiding",
              ContextMenuDomain_proto_addDoc_onPopuphiding, false);
            ContextMenuDomain.popups.onPopuphiding(popup,
              function ContextMenuDomain_addDoc_hiding() {
                matchingSets.forEach(function (s) {
                  if (typeof(s.set.beforeHide) === "function")
                    callUserFunc(s.set, s.set.beforeHide,
                                 [s.menu, makeContextObject(aXulDoc)]);
                  s.menu._removePopup(popup);
                  s.context.undo().cleanup();
                });
              });
          }
        }, false);

      // If popup is empty, cancel the event to prevent it from showing.
      // Otherwise you get either a really tiny, empty popup or nothing at all,
      // yet it has focus.  This is really only an issue for feature context
      // menu popups, since features might not add anything to them.
      if (popup.childNodes.length === 0)
        event.preventDefault();
    }

    aXulDoc.addEventListener("contextmenu",
                             ContextMenuDomain_proto_addDoc_onContextmenu,
                             true);

    // It's important to listen for bubbles, not captures.  Other consumers will
    // modify the popup (e.g., the browser itself in the case of the content
    // context menu) and we want those modifications to be visible to our
    // consumers.
    aXulDoc.addEventListener("popupshowing",
                             ContextMenuDomain_proto_addDoc_onPopupshowing,
                             false);

    let unloader = new Unloader(
      function ContextMenuDomain_proto_addDoc_unload() {
        aXulDoc.removeEventListener("contextmenu",
          ContextMenuDomain_proto_addDoc_onContextmenu, true);
        aXulDoc.removeEventListener("popupshowing",
          ContextMenuDomain_proto_addDoc_onPopupshowing, false);
      });
    unloader.onFeatureContext(this.featureContext);
    unloader.onDocUnload(aXulDoc);
  },

  // Registers a ContextMenuSet with the domain.
  addSet: function ContextMenuDomain_proto_addSet(aSet) {
    this.sets.push(aSet);
  }
};

// When a popup in any domain is opened, the popupNode is compared to aNode.  If
// they are the same, the transforms of aSet are applied to the popup.  This
// allows ContextMenuSets to be speculatively added to any domain.
ContextMenuDomain.nodes = [];
ContextMenuDomain.addNode = function ContextMenuDomain_addNode(aNode, aSet) {
  this.nodes.push({ node: aNode, set: aSet });
};

// Unregisters aNode, which was previously registered via addNode().
ContextMenuDomain.removeNode = function ContextMenuDomain_removeNode(aNode) {
  for (let i = 0; i < this.nodes.length; i++)
    if (this.nodes[i].node == aNode) {
      this.nodes.splice(i, 1);
      break;
    }
};

ContextMenuDomain.popups = new PopupTracker();


// Transforms machinery ////////////////////////////////////////////////////////

// A Transforms object is the machinery that modifies a XUL popup or array.  You
// can modify an instance of a Transforms to change how it performs these
// modifications.  Menus and ContextMenuSets should mixin Transforms via
// mixin().  This will create stub methods on the mixee that push transforms
// onto the mixee's transforms stack, one stub method per Transforms.prototype
// method.  A TransformsContext is then used to apply the transforms stack to
// a receiver.  On application, the methods of the Transforms are called.
// aDefaultTarget is a target (a string, regular expression, or index) of an
// item before which new items are inserted by default.
function Transforms(aDefaultTarget) {
  MemoryTracking.track(this);
  this.defaultTarget = aDefaultTarget;
  this.mixin = function Transforms_mixin(aObj, aStack) {
    for (let transformName in this.__proto__) {
      let name = transformName;
      aObj[name] = function Transforms_stub() {
        aStack.push(name, Array.slice(arguments, 0));
      };
    }
  };
}

// Most of these methods return a function that when invoked will undo the
// transform.  Since reset() pops the entire undo stack of a TransformsContext,
// it cannot be undone and therefore returns no value.
Transforms.prototype = {

  add: function Transforms_proto_add(aCtxt, aItems) {
    return this.insertBefore(aCtxt, aItems, this.defaultTarget);
  },

  clear: function Transforms_proto_clear(aCtxt) {
    let recItems = [];
    while (true) {
      let targItem = aCtxt.receiver.item(0);
      if (!targItem)
        break;
      recItems.unshift(targItem);
      aCtxt.receiver.remove(targItem);
    }
    return function Transforms_proto_clear_undo() {
      recItems.forEach(function (i) aCtxt.receiver.insertBefore(i, null));
    }
  },

  insertBefore: function Transforms_proto_insertBefore(aCtxt, aItems, aTarget) {
    let recItems = [];
    let rec = aCtxt.receiver;
    let targItem = rec.item(aTarget) || rec.item(this.defaultTarget);
    boxMenuitems(aItems).forEach(function (item) {
      let recItem = rec.makeItem(item);
      if (recItem) {
        recItems.push(recItem);
        rec.insertBefore(recItem, targItem);
      }
    });
    return function Transforms_proto_insertBefore_undo() {
      recItems.forEach(function (i) rec.remove(i));
    };
  },

  remove: function Transforms_proto_remove(aCtxt, aTarget) {
    var idx;
    let targItem = aCtxt.receiver.item(aTarget);
    if (targItem) {
      idx = aCtxt.receiver.indexOf(targItem);
      aCtxt.receiver.remove(targItem);
    }
    return function Transforms_proto_remove_undo() {
      if (targItem)
        aCtxt.receiver.insertBefore(targItem, aCtxt.receiver.item(idx));
    };
  },

  replace: function Transforms_proto_replace(aCtxt, aTarget, aItems) {
    let undos = [];
    let targItem = aCtxt.receiver.item(aTarget);
    // Don't do anything if the target is not present.
    if (targItem) {
      // Be careful here.  Remove the target first, because the new items might
      // also match the target.
      let idx = aCtxt.receiver.indexOf(targItem);
      undos.unshift(this.remove(aCtxt, idx));
      undos.unshift(this.insertBefore(aCtxt, aItems, idx));
    }
    return function Transforms_proto_replace_undo() {
      undos.forEach(function (f) f());
    };
  },

  reset: function Transforms_proto_reset(aCtxt) {
    aCtxt.undo();
  },

  set: function Transforms_proto_set(aCtxt, aItems) {
    this.reset(aCtxt);
    return this.add(aCtxt, aItems);
  }
};


// TransformsContext's job is to encapsulate applications of a stack of
// transforms on a receiver.  The ability to undo the applications is also part
// of the context.  It therefore aggregates a TransformsStack, a Transforms, and
// a receiver, which is a PopupWrapper or an ArrayWrapper.  The context attaches
// itself to the stack so that when the stack is modified, the transforms are
// applied to the receiver immediately.  A context must therefore be detached
// from the stack when its task is complete, and this is done via cleanup().
function TransformsContext(aStack, aTransforms, aReceiver) {
  MemoryTracking.track(this);
  this.stack = aStack;
  aStack.attachContext(this);
  this.transforms = aTransforms;
  this.receiver = aReceiver;
  this.undos = [];
}

TransformsContext.prototype = {

  apply: function TransformsContext_proto_apply(aStart, aLen) {
    aStart = aStart || 0;
    aLen = aLen || this.stack.stack.length - aStart;
    for (let i = aStart; i < aStart + aLen; i++) {
      let transform = this.stack.stack[i];
      let args = [this].concat(transform.args);
      let undo = this.transforms[transform.name].apply(this.transforms, args);
      if (undo)
        this.undos.push(undo);
    }
    return this;
  },

  applyTop: function TransformsContext_proto_applyTop() {
    return this.apply(this.stack.stack.length - 1);
  },

  cleanup: function TransformsContext_proto_cleanup() {
    this.stack.detachContext(this);
  },

  undo: function TransformsContext_proto_undo() {
    while (this.undos.length > 0)
      this.undos.pop()();
    return this;
  }
};


// A stack of transforms.  TransformsContexts may attach themselves so that when
// the stack is modified, the modifications apply immediately to the contexts'
// receivers.
function TransformsStack() {
  MemoryTracking.track(this);
  this.stack = [];
  this.contexts = [];
}

TransformsStack.prototype = {

  attachContext: function TransformsStack_proto_attachContext(aContext) {
    this.contexts.push(aContext);
  },

  // Pushes all the transforms on this stack to aObj, which is any object that
  // has mixed in Transforms.
  copyTo: function TransformsStack_proto_copyTo(aObj) {
    this.stack.forEach(function (t) aObj[t.name].apply(aObj, t.args));
  },

  detachContext: function TransformsStack_proto_detachContext(aContext) {
    let idx = this.contexts.indexOf(aContext);
    if (idx >= 0)
      this.contexts.splice(idx, 1);
  },

  // Adds a transform to the stack.  aName is the name of a method on
  // Transforms.prototype, and aArgs is an array of arguments appropriate to
  // that method.  Although the methods of Transforms.prototype all take a
  // TransformsContext object as their first parameter, aArgs should not include
  // such an object.
  push: function TransformsStack_proto_push(aName, aArgs) {
    this.stack.push({ name: aName, args: aArgs });
    this.contexts.forEach(function (c) c.applyTop());
  }
};


// Wrappers ////////////////////////////////////////////////////////////////////

// Transforms are applied to both XUL popups and arrays.  It's therefore useful
// to create a layer of abstraction so that transforms may be applied to either
// using a single set of Transforms methods.  These wrappers provide a small set
// of methods to facilitate this.  See PopupWrapper.prototype for documentation.

function PopupWrapper(aPopup) {
  MemoryTracking.track(this);
  this.popup = aPopup;
}

// Popups contain XUL elements, so items in the context of PopupWrappers are XUL
// elements except where noted.
PopupWrapper.prototype = {

  // Returns the index of aItem within the popup, -1 if it's not present.
  indexOf: function PopupWrapper_proto_indexOf(aItem) {
    for (let [item, index] in popupIterator(this.popup, true))
      if (item == aItem)
        return index;
    return -1;
  },

  // Inserts aNewItem before the existing aItem.
  insertBefore: function PopupWrapper_proto_insertBefore(aNewItem, aItem) {
    this.popup.insertBefore(aNewItem, aItem);
  },

  // Returns the first item in aPopup whose label or ID matches aTarget, which
  // may be either a string, regular expression, or index.
  item: function PopupWrapper_proto_item(aTarget) {
    if (typeof(aTarget) === "string")
      return this._itemByString(aTarget);
    else if (typeof(aTarget) === "number")
      return this._itemByIndex(aTarget);
    else if (isRegExp(aTarget))
      return this._itemByRegExp(aTarget);
    return null;
  },

  // Creates and returns a XUL element from aMenuitem, a Menuitem.
  makeItem: function PopupWrapper_proto_makeItem(aMenuitem) {
    return aMenuitem._makeXulElt(this.popup.ownerDocument);
  },

  // Removes aItem from the popup.
  remove: function PopupWrapper_proto_remove(aItem) {
    this.popup.removeChild(aItem);
  },

  _itemByIndex: function PopupWrapper_proto__itemByIndex(aIndex) {
    let iter = popupIterator;
    if (aIndex < 0) {
      aIndex = -aIndex - 1;
      iter = popupIteratorReverse;
    }
    for (let [item, idx] in iter(this.popup, true))
      if (idx === aIndex)
        return item;
    return null;
  },

  _itemByRegExp: function PopupWrapper_proto__itemByRegExp(aRegExp) {
    for (let item in popupIterator(this.popup))
      if (aTarget.test(item.getAttribute("label") || "") ||
          aTarget.test(item.id || ""))
        return item;
    return null;
  },

  _itemByString: function PopupWrapper_proto__itemByString(aStr) {
    let low = aStr.toLowerCase();
    for (let item in popupIterator(this.popup))
      if ((item.getAttribute("label") || "").toLowerCase().indexOf(low) >= 0 ||
          (item.id || "").toLowerCase().indexOf(low) >= 0)
        return item;
    return null;
  }
};


function ArrayWrapper(aArray) {
  MemoryTracking.track(this);
  this.array = aArray;
}

// Arrays contain Menuitems, so items in the context of ArrayWrappers are simply
// Menuitems.
ArrayWrapper.prototype = {

  indexOf: function ArrayWrapper_proto_indexOf(aItem) {
    return this.array.indexOf(aItem);
  },

  insertBefore: function ArrayWrapper_proto_insertBefore(aNewItem, aItem) {
    let idx = aItem ? this.array.indexOf(aItem) : this.array.length;
    if (idx >= 0)
      this.array.splice(idx, 0, aNewItem);
  },

  item: function ArrayWrapper_proto_item(aTarget) {
    if (typeof(aTarget) === "string")
      return this._itemByString(aTarget);
    else if (typeof(aTarget) === "number")
      return this._itemByIndex(aTarget);
    else if (isRegExp(aTarget))
      return this._itemByRegExp(aTarget);
    return null;
  },

  makeItem: function ArrayWrapper_proto_makeItem(aMenuitem) {
    return aMenuitem;
  },

  remove: function ArrayWrapper_proto_remove(aItem) {
    let idx = this.array.indexOf(aItem);
    if (idx >= 0)
      this.array.splice(idx, 1);
  },

  _itemByIndex: function ArrayWrapper_proto__itemByIndex(aIndex) {
    if (aIndex < 0)
      aIndex = this.array.length + aIndex;
    return this.array[aIndex] || null;
  },

  _itemByRegExp: function ArrayWrapper_proto__itemByRegExp(aRegExp) {
    for (let i = 0; i < this.array.length; i++) {
      let item = this.array[i];
      if (aRegExp.test(item.label || "") || aRegExp.test(item.xulId || ""))
        return item;
    }
    return null;
  },

  _itemByString: function ArrayWrapper_proto__itemByString(aStr) {
    let lower = aStr.toLowerCase();
    for (let i = 0; i < this.array.length; i++) {
      let item = this.array[i];
      if ((item.label || "").toLowerCase().indexOf(lower) >= 0 ||
          (item.xulId || "").toLowerCase().indexOf(lower) >= 0)
        return item;
    }
    return null;
  }
};


// Helper constructors /////////////////////////////////////////////////////////

// Watches for openings and closings of the main browser window.  Define
// onOpen() and onClose() on a BrowserWatcher, and they'll be called.  Both are
// optional.  onOpen is called on browser.xul's load, and onClose on unload.
function BrowserWatcher(aFeatureContext) {
  MemoryTracking.track(this);

  let winWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].
                     getService(Ci.nsIWindowWatcher);
  winWatcher.registerNotification(this);

  // Stop watching when the feature context is unloaded.
  const self = this;
  let unloader = new Unloader(function BrowserWatcher_unload() {
    winWatcher.unregisterNotification(self);
  });
  unloader.onFeatureContext(aFeatureContext);
}

BrowserWatcher.prototype = {
  observe: function BrowserWatcher_proto_observe(aSubject, aTopic, aData) {
    if (aTopic === "domwindowopened") {
      const self = this;
      let win = aSubject.QueryInterface(Ci.nsIDOMWindow);
      function addListener(event, method) {
        win.addEventListener(event, function BrowserWatcher_onEvent(event) {
          let doc = event.target;
          if (doc == win.document &&
              doc.documentElement.getAttribute("windowtype") ===
                "navigator:browser") {
            win.removeEventListener(event, BrowserWatcher_onEvent, true);
            self[method](doc, win);
          }
        }, true);
      }
      [["load", "onOpen"], ["unload", "onClose"]].forEach(function (a) {
        if (a[1] in self)
          addListener.apply(null, a);
      });
    }
  }
};


// An Unloader object defines a method unload() that can be called to perform an
// arbitrary cleanup task.  This task is specified by the function aFunc, which
// unload() will invoke.  The Unloader remembers whether it has been unloaded,
// and subsequent unloads are no-ops.  Once created an Unloader should be
// unloaded; otherwise memory leaks will likely occur.
function Unloader(aFunc) {
  MemoryTracking.track(this);
  this.function = aFunc;
  this.listenerRemovers = [];
  this.featureContexts = [];
}

Unloader.prototype = {

  // Schedules an invocation of unload() when aXulDoc is unloaded.
  onDocUnload: function Unloader_proto_onDocUnload(aXulDoc) {
    this.onBubble("unload", aXulDoc.defaultView, aXulDoc);
  },

  // Schedules an invocation of unload() when an event of type aEvt targeted to
  // the node aGuard bubbles to aNode.  aGuard may be a function.  See _onEvent.
  onBubble: function Unloader_proto_onBubble(aEvt, aNode, aGuard) {
    this._onEvent(aEvt, aNode, aGuard, false);
  },

  // Schedules an invocation of unload() when aNode captures an event of type
  // aEvt targeted to the node aGuard.  aGuard may be a function.  See _onEvent.
  onCapture: function Unloader_proto_onCapture(aEvt, aNode, aGuard) {
    this._onEvent(aEvt, aNode, aGuard, true);
  },

  // Schedules an invocation of unload() when aFeatureContext is unloaded.
  onFeatureContext: function Unloader_proto_onFeatureContext(aFeatureContext) {
    this.featureContexts.push(aFeatureContext);
    aFeatureContext.addUnloader(this);
  },

  // Calls the Unloader's cleanup function only if it hasn't been called yet.
  unload: function Unloader_proto_unload() {
    if (this.function) {
      this.function();
      delete this.function;
      this.listenerRemovers.forEach(function (f) f());
      delete this.listenerRemovers;
      const self = this;
      this.featureContexts.forEach(function (c) c.removeUnloader(self));
      delete this.featureContexts;
    }
  },

  // Schedules an invocation of unload() when an event of type aEvt targeted to
  // the node aGuard is dispatched to aNode.  aGuard may be a function instead
  // of a node, in which case it is called as aGuard(event.target) whenever an
  // event of type aEvt is dispatched to aNode.  If the function returns true,
  // the unload is triggered.
  _onEvent: function Unloader_proto__onEvent(aEvt, aNode, aGuard, aCapture) {
    const self = this;

    function Unloader_proto__onEvent_f(evt) {
      if (typeof(aGuard) === "function" ? aGuard(evt.target) :
                                          evt.target == aGuard) {
        Unloader_proto__onEvent_removeListener();
        self.unload();
      }
    }

    function Unloader_proto__onEvent_removeListener() {
      aNode.removeEventListener(aEvt, Unloader_proto__onEvent_f, aCapture);

      // unload might have been called already, deleting self.listenerRemovers.
      if (self.listenerRemovers) {
        let idx = self.listenerRemovers.indexOf(
                    Unloader_proto__onEvent_removeListener);
        self.listenerRemovers.splice(idx, 1);
      }
    }

    // The event listener may never be fired.  So if we only remove it when it's
    // fired, it may never be removed.  Solution:  Stuff
    // Unloader_proto__onEvent_removeListener in a list and call it on unload.
    aNode.addEventListener(aEvt, Unloader_proto__onEvent_f, aCapture);
    this.listenerRemovers.push(Unloader_proto__onEvent_removeListener);
  }
};


// Helper functions ////////////////////////////////////////////////////////////

// Creates and returns a Menuitem object from the simple object aObj.  aObj may
// instead be an array of simple objects, in which case an array of Menuitems is
// returned.
function boxMenuitems(aObj) {
  return (isArray(aObj) ? aObj : [aObj]).map(function (obj) new Menuitem(obj));
}

// Returns the browser XUL doc that contains the given node.
function browserXulDocFromNode(aNode) {
  let doc = aNode.ownerDocument || aNode;
  return browserXulDocFromContentWindow(doc.defaultView);
}

// Returns the browser XUL doc that contains the given content window.
function browserXulDocFromContentWindow(aContentWindow) {
  // Yeesh.  Better way to do this?  Taken from
  // https://developer.mozilla.org/en/Working_with_windows_in_chrome_code.
  return aContentWindow.
           QueryInterface(Ci.nsIInterfaceRequestor).
           getInterface(Ci.nsIWebNavigation).
           QueryInterface(Ci.nsIDocShellTreeItem).
           rootTreeItem.
           QueryInterface(Ci.nsIInterfaceRequestor).
           getInterface(Ci.nsIDOMWindow).
           document;
}

// Calls aFunc applied to aThis with aArgs in a try-catch, reporting any errors.
function callUserFunc(aThis, aFunc, aArgs) {
  try {
    return aFunc.apply(aThis, aArgs);
  }
  catch (err) {
    reportError(err);
  }
}

// Returns true if the given object is an array.
function isArray(aObj) {
  return aObj &&
         (aObj instanceof Array ||
          (typeof(aObj) === "object" &&
           typeof(aObj.length) === "number" &&
           !aObj.propertyIsEnumerable("length") &&
           typeof(aObj.splice) === "function"));
}

// Returns true if the given object is a regular expression.
function isRegExp(aObj) {
  return aObj &&
         (aObj instanceof RegExp ||
          (typeof(aObj) === "object" && typeof(aObj.test) === "function"));
}

// Returns true if the given object is a XUL element.
function isXulElt(aObj) {
  let ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  return aObj && ("namespaceURI" in aObj) && aObj.namespaceURI === ns;
}

// Returns an object describing the context of a context menu's invocation.
// (If a context menu is open, aXulDoc.popupNode will be defined.)  Returns
// undefined if there is no popup node.
function makeContextObject(aXulDoc) {
  return !aXulDoc.popupNode ? undefined : {
    node: aXulDoc.popupNode,
    document: aXulDoc.popupNode.ownerDocument,
    window: aXulDoc.popupNode.ownerDocument.defaultView
    // XXXadw tab: ???  How to access/create Jetpack Tab objects from here?
  };
}

// Returns a new GUID.
function newGuid() {
  return Cc["@mozilla.org/uuid-generator;1"].
           getService(Ci.nsIUUIDGenerator).
           generateUUID();
}

// Returns true if the given node is in the node list.
function nodeInNodeList(aNode, aNodeList) {
  return Array.indexOf(aNodeList, aNode) >= 0;
}

// Returns true if the given node matches the CSS selector in the doc.
// aSelector may be falsey, in which case this function returns true.
// XXXadw 1.9.2 has Node.mozMatchesSelector(), so when Jetpack requires Fx 3.6+
// this can be replaced.
function nodeMatchesSelector(aNode, aSelector, aDoc) {
  return !aSelector || nodeInNodeList(aNode, aDoc.querySelectorAll(aSelector));
}

// Iterates over the items in aPopup.  If aWithIndex is true, yields
// [item, index] instead of only item.
function popupIterator(aPopup, aWithIndex) {
  let index = 0;
  for (let i = 0; i < aPopup.childNodes.length; i++) {
    let item = aPopup.childNodes[i];
    if (!item.hidden) {
      yield aWithIndex ? [item, index] : item;
      index++;
    }
  }
}

// Iterates over the items in aPopup in reverse.  If aWithIndex is true, yields
// [item, index] instead of only item.
function popupIteratorReverse(aPopup, aWithIndex) {
  let index = 0;
  for (let i = aPopup.childNodes.length - 1; i >= 0; i--) {
    let item = aPopup.childNodes[i];
    if (!item.hidden) {
      yield aWithIndex ? [item, index] : item;
      index++;
    }
  }
}

// If aNode is wrapped in jQuery, returns the raw node.  Returns aNode
// otherwise.
function rawNode(aNode) {
  // Since we're in a module we can't just use instanceof jQuery...
  try {
    return aNode.get(0);
  }
  catch (e) {}
  return aNode;
}

// Cu.reportError.
function reportError(aErr) {
  Components.utils.reportError(aErr);
}
