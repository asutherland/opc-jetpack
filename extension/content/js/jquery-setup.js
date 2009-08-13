// = jQuery Setup =
//
// This sets up jQuery's Ajax functions to work when the host window
// is loaded in a hidden window that doesn't provide a user interface.
//
// When the host window is invisible, we create the XHR object from
// whatever current window the user's using, so that any UI that needs
// to be brought up as a result of the XHR is shown to the user,
// rather than being invisible and locking up the application.

jQuery.ajaxSetup(
  {xhr: function() { return XHR.fromVisibleChromeWindow(); }}
);

MemoryTracking.track(jQuery, "jQuery");
