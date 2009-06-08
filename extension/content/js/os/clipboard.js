const kAllowableFlavors = [
  "text/unicode",
  "text/plain",
  "text/html"
/* CURRENTLY UNSUPPORTED FLAVORS
  "text/x-moz-text-internal",
  "AOLMAIL",
  "image/png",
  "image/jpg",
  "image/gif",
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
const kGenericFlavors = {
  "text": ["text/unicode", "text/plain", "text/html"]
}

function Clipboard() {
  MemoryTracking.track(this);
}

Clipboard.prototype = {
  __clipboardService: null,
  get _clipboardService() {
    if (!this.__clipboardService)
      this.__clipboardService = Cc["@mozilla.org/widget/clipboard;1"].
                                getService(Ci.nsIClipboard);
    return this.__clipboardService;
  },


  set: function(aData, aDataType) {
    var xferable = Cc["@mozilla.org/widget/transferable;1"].
                   createInstance(Ci.nsITransferable);
    if (!xferable)
      return false;

    var dataToSet = [];

    // If we don't have a data type, determine if we have key/pair or
    // just a single type.
    if (!aDataType) {
      if (typeof aData === "string") {
        /// TODO: should we take the shortcut here and use
        /// nsIClipboardHelper.copyString? -zpao
        dataToSet.push(["text/unicode", aData]);
      }
      // TODO: Add other cases here (e.g., image) if we can figure them
      // out.
      else if (typeof aData === "object") {
        for (var flavor in aData) {
          // Ensure we allow this flavor
          var data = aData[flavor];
          if (kAllowableFlavors.indexOf(flavor) !== -1)
            dataToSet.push([flavor, data]);
        }
      }
    } else if (kAllowableFlavors.indexOf(aDataType) !== -1) {
      // TODO: We should probably sanity check that the type they
      // specify is what they passed in.
      dataToSet.push([aDataType, aData]);
    }

    // TODO: return false or throw? -zpao
    if (!dataToSet.length)
      throw "invalid arg...";

    for (var i in dataToSet) {
      // Internal representation is a little weird, but it works
      // (makes it easy to check for .length).
      var [flavor, data] = dataToSet[i];
      switch (flavor) {
        case "text/plain":
        case "text/html":
        case "text/unicode":
          var str = Cc["@mozilla.org/supports-string;1"].
                    createInstance(Ci.nsISupportsString);
          str.data = data;
          xferable.addDataFlavor(flavor);
          // Unicode (and html because we store that in unicode) take up
          // 2 bytes/char.
          var dataLen = (flavor == "text/plain") ? data.length
                                                 : data.length * 2;
          xferable.setTransferData(flavor, str, dataLen);
      }
    }
    // TODO: Not sure if this will ever actually throw. -zpao
    try {
      this._clipboardService.setData(
        xferable,
        null,
        this._clipboardService.kGlobalClipboard
      );
    } catch (e) {
      return false;
    }
    return true;
  },


  get: function(aDataType, aCallback) {
    var xferable = Cc["@mozilla.org/widget/transferable;1"].
                   createInstance(Ci.nsITransferable);
    if (!xferable)
      return false;

    var requestedFlavors = [];

    // Determine how get() is being used.
    if (!aDataType) {
      // No arguments, so we try to grab the most best flavor.
      requestedFlavors = kAllowableFlavors;
    } else if (aDataType instanceof Array) {
      // The user has requested multiple types, so use them.
      requestedFlavors = aDataType;
    } else if (typeof aDataType === "string") {
      // The user has either requested a single type or a generic type
      // like "text".
      if (kGenericFlavors[aDataType]){
        // It was generic.
        requestedFlavors = kGenericFlavors[aDataType];
      } else {
        requestedFlavors.push(aDataType);
      }
    }

    // Ensure that the user hasn't requested a flavor that we don't
    // support.

    // TODO: Should we just get rid of the unsupported type or should
    // we throw an ArgumentError?
    for (var i = requestedFlavors - 1; i >= 0; i--)
      if (kAllowableFlavors.indexOf(requestedFlavors[i]) == -1)
        requestedFlavors.splice(i, 1);

    // We should definitely have SOME flavor to try to get, but if
    // not, throw an exception.
    if (!requestedFlavors.length)
      throw new Error("Requested flavors must be specifie.");

    for (i in requestedFlavors)
      xferable.addDataFlavor(requestedFlavors[i]);

    // TODO: We should probably check for matching flavors before
    // getting the clipboard data. see:
    //
    // http://mxr.mozilla.org/mozilla-central/source/browser/components/places/content/controller.js#386

    // Get the data into our transferable.
    this._clipboardService.getData(
      xferable,
      this._clipboardService.kGlobalClipboard
    );

    var returnData = {};

    for (i in requestedFlavors) {
      var flavor = requestedFlavors[i];

      var data = {};
      var dataLen = {};
      try {
        xferable.getTransferData(flavor, data, dataLen);
      } catch (e) {
        continue;
      }

      // TODO: Not sure data will ever be null at this point, but
      // doesn't hurt to check.
      if (!data)
        continue;

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
      }
      returnData[flavor] = data;
    }

    return returnData;
  }
};
