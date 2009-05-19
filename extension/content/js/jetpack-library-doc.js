// == {{{jetpack}}} ==
//
// The {{{jetpack}}} namespace is available to all Jetpack Features,
// and is the main point of contact for Features with the rest of
// Firefox. The API is intended as a lightweight backwards-compatible
// facade to the underlying Mozilla platform, which means that if you
// write a Feature using the Jetpack library, you won't have to
// change your code as Firefox continues to evolve.
//
// For now, it has the following properties:
//
// * {{{tabs}}} provides access to all open tabs (irrespective of window).
// * {{{statusBar}}} lets you add or modify to Firefox's status bar at
//   the bottom of Firefox browser windows.
// * {{{lib}}} gives access to small libraries for the web, providing
//   encapsulated and easy-to-use ways of accessing services like
//   Twitter, Flickr, Delicious, and so forth. Eventually you'll be
//   able to import libraries from anywhere, but the default ones will
//   be code reviewed by Mozilla.

// === {{{jetpack.tabs}}} ===
//
// {{{jetpack.tabs}}} is an Array-like object with special tab-related
// properties.

// ** {{{jetpack.tabs.focused}}} **
//
// Returns the currently focused/active tab as a Tab object.
//
// ** {{{jetpack.tabs.length}}} **
//
// Returns the number of tabs currently being displayed.

// ==== Tab Event Handlers ====
//
// Most of what {{{jetpack.tabs}}} is useful for is setting up event
// handlers.  The wonderful thing about these event handlers is that
// they handle all the difficult edge cases for you. When you create
// an event handler using an event binder function such as
// {{{jetpack.tabs.onReady()}}}, it's not only set up for all
// currently open tabs, but when a new tab is created (in any window),
// Jetpack will bind the event handler to it.
//
// All event binders take an event handler function,
// {{{callback}}}. When called, the handler receieves an event object
// as its only argument. The event handler's {{{this}}} is set to the
// {{{Tab}}} that had the event occur.
//
// To remove an event handler, you simply call the
// {{{remove(callback)}}} function that's attached to an event binder,
// where {{{callback}}} is the instance of the event handler passed
// into the aforementioned binder. For example,
// {{{jetpack.tabs.onReady.remove(cb)}}} removes the {{{cb}}} handler
// for {{{onReady}}} events.

// ** {{{jetpack.tabs.onReady(callback)}}} **
//
// The function {{{callback}}} is called when a tab's DOM, or the DOM
// of an iframe within a tab, has finished loading.  Note that images
// and other components may not yet be loaded in the target.
//
// The event passed to {{{callback}}} has one property, {{{target}}},
// which is the HTML document object of the document whose DOM is
// ready.
//
// This handler is particularly useful for page-modifying scripts that
// alter pages before they are displayed.

// === {{{[tab]}}} ===
//
// A {{{tab}}} represents a browser tab. From it, you can peek
// into the content of a page, and control a tab. You can access a
// particular tab from the {{{jetpack.tabs}}} array.

// ** {{{tab.contentWindow}}} **
//
// As with iframes, {{{contentWindow}}} is the way to access the {{{window}}}
// object of the document contained within a tab.
//
// Note that if the content of the page has changed the definition of a
// built-in function, you'll get the changed function. For example, if a page
// has defined a new {{{window.alert}}}) to open mozilla.com,
// {{{tab.contentWindow.alert()}}} will also open mozilla.com.

// === {{{jetpack.notifications}}} ===
//
// Eventually, this will be the end-all be-all of easy communication with your
// users. Notification bars, transparent messages, Growls, doorknob messages,
// etc. will all go through here. For now, it just has simple notifications.

// ** {{{jetpack.notifications.show(message)}}} **
//
// Shows a simple notification message. On Windows it's a toaster
// notification, and on OS X it's a Growl message (if Growl is
// installed).  {{{message}}} is either a string, or an object with
// properties {{{title}}}, {{{icon}}}, and {{{body}}}. If {{{icon}}}
// is supplied, it should be URL.
