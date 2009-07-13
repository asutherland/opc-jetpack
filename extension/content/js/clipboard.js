const kAllowableFlavors = [
  "text/unicode",
  "text/html"
/* CURRENTLY UNSUPPORTED FLAVORS
  "text/plain",
  "image/png",
  "image/jpg",
  "image/gif"
  "text/x-moz-text-internal",
  "AOLMAIL",
  "application/x-moz-file",
  "text/x-moz-url",
  "text/x-moz-url-data",
  "text/x-moz-url-desc",
  "text/x-moz-url-priv",
  "application/x-moz-nativeimage",
  "application/x-moz-nativehtml",
  "application/x-moz-file-promise-url",
  "application/x-moz-file-promise-dest-filename",
  "application/x-moz-file-promise",
  "application/x-moz-file-promise-dir"
*/
];

const kFlavorMap = [
  { short: "plain", long: "text/unicode" },
  { short: "text", long: "text/unicode" },
  { short: "html", long: "text/html" }
//  { short: "image", long: "image/png" },
];

function Clipboard() {
  MemoryTracking.track(this);
}

Clipboard.prototype = {
  // So that memory tracking shows this object properly.
  constructor: Clipboard,

  // Full clipboard service
  __clipboardService: null,
  get _clipboardService() {
    if (!this.__clipboardService)
      this.__clipboardService = Cc["@mozilla.org/widget/clipboard;1"].
                                getService(Ci.nsIClipboard);
    return this.__clipboardService;
  },

  // Clipboard helper (for strings only)
  __clipboardHelper: null,
  get _clipboardHelper() {
    if (!this.__clipboardHelper)
      this.__clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].
                               getService(Ci.nsIClipboardHelper);
    return this.__clipboardHelper;
  },


  set: function(aData, aDataType) {
    // Handle the single argument case
    if (!aDataType) {
      if (typeof aData === "string") {
        this._clipboardHelper.copyString(aData);
        return true;
      } else {
        throw new Error("The flavor must be specified if content is not a string");
      }
    }

    var flavor = this._fromJetpackFlavor(aDataType);

    if (!flavor)
      throw new Error("Invalid flavor");

    // Additional checks for using the simple case
    if (flavor == "text/unicode") {
      // TODO: Should probably check if aData is a string first
      this._clipboardHelper.copyString(aData);
      return true;
    }

    // Below are the more complex cases where we actually have to work with a
    // nsITransferable object
    var xferable = Cc["@mozilla.org/widget/transferable;1"].
                   createInstance(Ci.nsITransferable);
    if (!xferable)
      throw new Error("Internal Error: Couldn't create Transferable");

    switch (flavor) {
      case "text/html":
        var str = Cc["@mozilla.org/supports-string;1"].
        createInstance(Ci.nsISupportsString);
        str.data = aData;
        xferable.addDataFlavor(flavor);
        xferable.setTransferData(flavor, str, aData.length * 2);
        break;
      // TODO: images!
      default:
        return false;
    }

    // TODO: Not sure if this will ever actually throw. -zpao
    try {
      this._clipboardService.setData(
        xferable,
        null,
        this._clipboardService.kGlobalClipboard
      );
    } catch (e) {
      throw new Error("Internal Error: Could set clipboard data");
    }
    return true;
  },


  get: function(aDataType) {
    var xferable = Cc["@mozilla.org/widget/transferable;1"].
                   createInstance(Ci.nsITransferable);
    if (!xferable)
      throw new Error("Internal Error: Couldn't create Transferable");

    var flavor = aDataType ? this._fromJetpackFlavor(aDataType) : "text/unicode";

    // Ensure that the user hasn't requested a flavor that we don't support.
    if (!flavor)
      throw new Error("Invalid flavor");

    // TODO: Check for matching flavor first? Probably not worth it.

    xferable.addDataFlavor(flavor);

    // Get the data into our transferable.
    this._clipboardService.getData(
      xferable,
      this._clipboardService.kGlobalClipboard
    );

    var data = {};
    var dataLen = {};
    try {
      xferable.getTransferData(flavor, data, dataLen);
    } catch (e) {
      // Clipboard doesn't contain data in flavor, return false
      return null;
    }

    // TODO: Not sure data will ever be null at this point, but
    // doesn't hurt to check.
    if (!data)
      return null;

    // TODO: Add flavors here as we support more in kAllowableFlavors.
    switch (flavor) {
      case "text/plain":
        data = data.value.data;
        break;
      case "text/unicode":
      case "text/html":
        data = data.value.QueryInterface(Ci.nsISupportsString).data;
        break;
      default:
        return null;
    }

    return data;
  },

  getCurrentFlavors: function() {
    // Loop over kAllowableFlavors, calling hasDataMatchingFlavors for each.
    // This doesn't seem like the most efficient way, but we can't get
    // confirmation for specific flavors any other way. This is supposed to be
    // an inexpensive call, so performance shouldn't be impacted (much).
    var currentFlavors = [];
    for each (var flavor in kAllowableFlavors) {
      var matches = this._clipboardService.hasDataMatchingFlavors(
        [flavor],
        1,
        this._clipboardService.kGlobalClipboard
      );
      if (matches)
        currentFlavors.push(this._toJetpackFlavor(flavor));
    }
    return currentFlavors;
  },


  // SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

  _toJetpackFlavor: function(aFlavor) {
    for each (flavorMap in kFlavorMap)
      if (flavorMap.long == aFlavor || flavorMap.short == aFlavor)
        return flavorMap.short;
    // Return null in the case where we don't match
    return null;
  },

  _fromJetpackFlavor: function(aJetpackFlavor) {
    // TODO: Handle proper flavors better
    for each (flavorMap in kFlavorMap)
      if (flavorMap.short == aJetpackFlavor || flavorMap.long == aJetpackFlavor)
        return flavorMap.long;
    // Return null in the case where we don't match.
    return null;
  }
};
