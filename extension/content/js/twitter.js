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
 * The Original Code is the Jetpack Twitter library.
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

// = Twitter Library =
//
// Jetpack's Twitter library is a very simple, lightweight layer on top of
// Twitter's REST API.  In fact it's hardly more than syntactic sugar for doing
// XMLHttpRequests.
//
// To use this library, you therefore need to be familiar with
// [[http://apiwiki.twitter.com/Twitter-API-Documentation|Twitter's own API]].
// (It's easy!)
//
// == Methods ==
//
// Each method in Twitter's API maps to a method here.  For example, the Twitter
// method for tweeting, {{{"statuses/update"}}}, maps to
// {{{jetpack.lib.twitter.statuses.update()}}}.  To call {{{"trends/current"}}},
// use {{{jetpack.lib.twitter.trends.current()}}}.  For {{{"search"}}},
// {{{jetpack.lib.twitter.search()}}}.  See a pattern?  Replace slashes with
// dots.
//
// == Arguments ==
//
// Each and every method in the library takes a single argument, an object.
// There are two styles you can use to define this object.
//
// The first is simple:  Define properties on the object corresponding to the
// parameters of the Twitter method.  For instance, some Twitter methods have
// an {{{id}}} parameter, so you would define an {{{id}}} property and set its
// value to a user's ID.  (You can read about the parameters of the various
// methods at the Twitter API linked above.)  There are two special, optional
// properties:  {{{success}}} and {{{error}}}.  {{{success}}} is a function
// that's called when the request successfully completes, and {{{error}}} is a
// function called when it fails to complete.  The library simply passes them
// to {{{jQuery.ajax()}}}, and so they are called like so:
//
// * {{{success(data, textStatus)}}}
// ** {{{data}}} is Twitter's decoded JSON response.
// ** {{{textStatus}}} is a simple string describing the status.
// * {{{error(xmlHttpRequest, textStatus, errorThrown)}}}
// ** {{{xmlHttpRequest}}} is the XHR used in the request.
// ** {{{textStatus}}} is a simple string describing the type of error.
// ** {{{errorThrown}}} is an exception object, if one was thrown.
//
// The examples below all use this first, simpler style.
//
// The second style will be familiar if you have used {{{jQuery.ajax()}}} -- in
// fact the object is passed as-is (almost) to it.  In other words, define a
// {{{data}}} property that is itself an object whose properties correspond to
// the parameters of the Twitter method.  With this style you can use any of
// the various {{{jQuery.ajax()}}} options in your request:  {{{data}}},
// {{{success}}}, {{{complete}}}, etc.  Example:
//
// {{{
// jetpack.lib.twitter.statuses.update({
//   data: {
//     status: "O frabjous day!"
//   },
//   username: "basic_auth_username",
//   password: "basic_auth_password",
//   success: function () console.log("Hey!")
// });
// }}}
//
// == User Authentication ==
//
// You can supply a username and password to methods that require
// authentication using the second, more advanced call style described above.
//
// Or you can simply rely on Firefox.  When you call a method that requires
// authentication -- such as {{{jetpack.lib.twitter.statuses.update()}}} --
// without providing a username or password, Firefox will prompt the user for
// them if she is not already authenticated with Twitter.
//
// == Example Usage ==
//
// === Tweeting ===
//
// {{{
// jetpack.lib.twitter.statuses.update({ status: "O frabjous day!" });
// }}}
//
// Firefox will prompt for a username and password if the user is not already
// authenticated with Twitter.
//
// === User Info ===
//
// {{{
// jetpack.lib.twitter.users.show({
//   id: "mozillajetpack",
//   success: function (data, status) console.log(data.toSource()),
//   error: function (xhr, errMsg, errObj) console.error(xhr.responseText)
// });
// }}}
//
// === Friends of a User ===
//
// {{{
// jetpack.lib.twitter.statuses.friends({
//   id: "mozillajetpack",
//   page: 3,
//   success: function (data, status) console.log(data.toSource()),
//   error: function (xhr, errMsg, errObj) console.error(xhr.responseText)
// });
// }}}
//
// === Trends ===
//
// {{{
// jetpack.lib.twitter.trends({
//   success: function (data, status) console.log(data.toSource()),
//   error: function (xhr, errMsg, errObj) console.error(xhr.responseText)
// });
// }}}
//
// === Searching ===
//
// {{{
// jetpack.lib.twitter.search({
//   q: "mozilla jetpack",
//   lang: "ja",
//   rpp: 10,
//   page: 5,
//   since_id: 1337,
//   success: function (data, status) console.log(data.toSource()),
//   error: function (xhr, errMsg, errObj) console.error(xhr.responseText)
// });
// }}}


// Hide our private parts in the scope of a function.  Call this to get a new
// twitter instance per feature.
function twitter() {

  // == Twitter REST API Description ==
  //
  // //This section describes the library's implementation, so you probably
  // don't need to read it.//
  //
  // Below is a description of Twitter's REST API.  Our Twitter library is
  // dynamically created from it.  It's an object hierarchy with the following
  // format:
  //
  // {{{ { schemeAndHostname: { httpMethod: pathsArray } } }}}
  //
  // Each string in each {{{pathsArray}}} maps to the following two things:
  //
  // # A hierarchy of objects in the {{{jetpack.lib.twitter}}} object.  The last
  //   fragment in a path turns into a method at the end of the hierarchy.  For
  //   example, {{{"statuses/public_timeline"}}} becomes the method
  //   {{{jetpack.lib.twitter.statuses.public_timeline()}}}.  The method takes
  //   all its arguments, including the user callbacks {{{success}}} and
  //   {{{error}}}, as a single object with key-value pairs.  For a description
  //   of Twitter's API and the parameters of its various methods, visit the
  //   [[http://apiwiki.twitter.com/Twitter-API-Documentation|Twitter API wiki]].
  //   The exception to this rule is that a path may end in a variable prefixed
  //   with a {{{'$'}}}.  At the time the path's corresponding method is
  //   invoked, the path is interpolated and the variable is replaced with the
  //   argument of the same name in the options object that the caller has
  //   passed in.
  // # The URL of a method in Twitter's REST API.

  const API = {
    "http://twitter.com": {
      get: [
        "statuses/public_timeline",
        "statuses/friends_timeline",
        "statuses/user_timeline",
        "statuses/mentions",
        "statuses/show/$id",
        "users/show",
        "statuses/friends",
        "statuses/followers",
        "direct_messages",
        "direct_messages/sent",
        "friendships/exists",
        "friendships/show",
        "friends/ids",
        "followers/ids",
        "account/verify_credentials",
        "account/rate_limit_status",
        "favorites",
        "blocks/exists/$id",
        "blocks/blocking",
        "blocks/ids",
        "saved_searches",
        "saved_searches/show/$id",
        "help/test",
      ],
      post: [
        "statuses/update",
        "statuses/destroy/$id",
        "direct_messages/new",
        "direct_messages/destroy/$id",
        "friendships/create/$id",
        "friendships/destroy/$id",
        "account/end_session",
        "account/update_delivery_device",
        "account/update_profile_colors",
        "account/update_profile_image",
        "account/update_profile_background_image",
        "account/update_profile",
        "favorites/create/$id",
        "favorites/destroy/$id",
        "notifications/follow/$id",
        "notifications/leave/$id",
        "blocks/create/$id",
        "blocks/destroy/$id",
        "saved_searches/create",
        "saved_searches/destroy/$id",
      ],
    },
    "http://search.twitter.com": {
      get: [
        "search",
        "trends",
        "trends/current",
        "trends/daily",
        "trends/weekly",
      ]
    }
  };

  // This object is returned by this function.
  var twitter = {

    // == {{{twitter.addApi(aApiDesc)}}} ==
    //
    // If Twitter adds anything to its API that we don't take into account
    // above, this method can be used to dynamically add it to our library.
    // {{{aApiDesc}}} should be in the same format as the API description
    // above.

    addApi: function twitter_addApi(aApiDesc) {
      for (let [schemeAndHost, httpMethods] in Iterator(aApiDesc))
        for (let [httpMethod, paths] in Iterator(httpMethods))
          for (let i = 0; i < paths.length; i++)
            addApiMethod(this, schemeAndHost, paths[i], httpMethod);
    }
  };

  twitter.addApi(API);


  // Private helpers //////////////////////////////////////////////////////////

  // Builds up aDestObj as described above.
  function addApiMethod(aDestObj, aSchemeAndHost, aPath, aHttpMethod) {
    var pathFrag;
    var interpParam;
    var obj = aDestObj;
    var urlFrags = [];

    // Break the path into fragments [a, b, c, ..., N-1] and build up a
    // corresponding object hierarchy aDestObj.a.b.c.....N-1.
    var pathFrags = aPath.split("/");
    while (pathFrags.length > 0) {
      pathFrag = pathFrags.shift();
      urlFrags.push(pathFrag);

      // Look ahead to the next fragment to see if it's a parameter to be
      // interpolated.  Dequeue it if so.
      interpParam = pathFrags.length > 0 && pathFrags[0][0] === "$" ?
                    pathFrags.shift().substr(1) :
                    null;

      // Add a new object at the end of the hierarchy corresponding to the
      // fragment unless such an object already exists or the fragment is last.
      if (pathFrags.length > 0) {
        obj[pathFrag] = obj[pathFrag] || {};
        obj = obj[pathFrag];
      }
    }

    // The final fragment becomes a method at the end of the hierarchy.
    var currEndObj = obj[pathFrag];
    obj[pathFrag] = function (opts) {
      var ajaxOpts = userOptsToAjaxOpts(opts);
      var url = [aSchemeAndHost].
                concat(urlFrags).
                concat(interpParam ? ajaxOpts.data[interpParam] : []).
                join("/") + ".json";
      ajax(url, aHttpMethod, ajaxOpts);
    };

    // If there was already an object at the end of the hierarchy (which may
    // happen if we're not careful with the ordering of our API description in
    // cases like "favorites" and "favorites/create"), reattach that object's
    // properties to the new method.
    for (let [prop, val] in Iterator(currEndObj || {}))
      obj[pathFrag][prop] = val;
  }

  // Performs XHR.  aOpts is modified.
  function ajax(aUrl, aMethod, aOpts) {
    aOpts.dataType = "json";
    aOpts.url = aUrl;
    aOpts.type = aMethod;
    jQuery.ajax(aOpts);
  }

  // Returns an options object suitable for passing to jQuery.ajax().
  // aUserOpts can contain either a "data" property or properties to be
  // included in a data object.  aUserOpts is not modified.
  function userOptsToAjaxOpts(aUserOpts) {
    var dupe = {};
    for (let [prop, val] in Iterator(aUserOpts))
      dupe[prop] = val;
    return "data" in dupe ? dupe : {
      data: dupe,
      success: let (s = dupe.success) delete dupe.success && s,
      error: let (e = dupe.error) delete dupe.error && e
    };
  }


  // DEPRECATED ///////////////////////////////////////////////////////////////

  // PRIVATE HELPERS //////////////////////////////////////////////////////////

  function warnDeprecation(aFuncName) {
    Cc["@mozilla.org/consoleservice;1"].
      getService(Ci.nsIConsoleService).
      logStringMessage("WARNING: jetpack.lib.twitter." + aFuncName +
                       " is deprecated and will be removed in a future" +
                       " version of Jetpack.");
  }

  /**
   * Returns either "user_id" if aScreenNameOrID is a number or "screen_name"
   * if it's a string.
   *
   * @param aScreenNameOrID
   *        Either a user ID (number) or screen name (string)
   */
  function resolveScreenNameOrID(aScreenNameOrID)
  {
    switch (typeof(aScreenNameOrID))
    {
    case "number":
      return "user_id";
      break;
    case "string":
      return "screen_name";
      break;
    }
    throw "Invalid screen name or ID type " + typeof(aScreenNameOrID);
    return null;
  }

  function doAjax(options) {
    var callback = options.callback;
    var jQueryOptions = {};
    for (name in options)
      if (name != "callback")
        jQueryOptions[name] = options[name];

    jQueryOptions.dataType = "json";
    jQueryOptions.success = function(data) { callback(data, false); };
    jQueryOptions.error = function() { callback(null, true); };

    jQuery.ajax(jQueryOptions);
  }

  // TWITTER USER PROTOTYPE: Twitter.Twit /////////////////////////////////////

  //XXXadw Maybe instead of the Twitter.Twit methods delegating to the static
  // methods of Twitter and giving callers the option of using the static
  // methods, we ought to implement them directly in Twitter.Twit and force
  // callers to make new Twitter.Twit objects -- in the spirit of being
  // opinionated and keeping the API uncluttered.

  //XXXadw "getStatus" vs. "status" in method names?

  /**
   * A Twitter user.
   *
   * @param aScreenName
   *        The user's screen name
   * @param aPassword [optional]
   *        If specified, the twit can be used to tweet
   */
  function Twitter_Twit(aScreenName, aPassword)
  {
    warnDeprecation("Twit");
    this.screenName = aScreenName;
    this.password = aPassword;
  };

  Twitter_Twit.prototype =
  {
    /**
     * Gets the user's friends.
     *
     * @param aPage [optional]
     *        The page of friends to retrieve
     */
    getFriends:
    function Twitter_Twit_proto_getFriends(aPage, aCallback)
    {
      twitter.getTwitFriends(this.screenName, aPage, aCallback);
    },

    /**
     * Gets the user's info.
     */
    getInfo:
    function Twitter_Twit_proto_getInfo(aCallback)
    {
      twitter.getTwitInfo(this.screenName, aCallback);
    },

    /**
     * Gets the user's latest status.
     */
    getLatestStatus:
    function Twitter_Twit_proto_getLatestStatus(aCallback)
    {
      twitter.getTwitLatestStatus(this.screenName, aCallback);
    },

    /**
     * Gets the user's timeline.
     */
    getTimeline:
    function Twitter_Twit_proto_getTimeline(aCallback)
    {
      twitter.getTwitTimeline(this.screenName, aCallback);
    },

    /**
     * Tweets a tweet.  The tweeting twit must have a password.
     */
    tweet:
    function Twitter_Twit_proto_tweet(aTweet, aInReplyToStatusID, aCallback)
    {
      var data = {status: aTweet};

      if (aInReplyToStatusID)
        data.in_reply_to_status_id = aInReplyToStatusID;

      //XXXadw Actually if this is called from browser chrome, Firefox will put
      // up a prompt asking for user and pass, so maybe we don't want this.
      if (typeof(this.password) !== "string")
        throw "Password required to tweet, yo.";

      const that = this;
      doAjax(
        {type: "POST",
         url: "http://twitter.com/statuses/update.json",
         data: data,
         username: that.screenName,
         password: that.password,
         callback: aCallback
        });
    }
  };

  // TOP-LEVEL OBJECT AND STATIC METHODS: Twitter /////////////////////////////

  twitter.Twit = Twitter_Twit;

  /**
   * Gets the status with the given ID.
   *
   * @param aStatusID
   *        The ID of the status
   */
  twitter.getStatus =
  function Twitter_getStatus(aStatusID, aCallback)
  {
    warnDeprecation("getStatus");
    doAjax({url: "http://twitter.com/statuses/show/" + aStatusID + ".json",
            callback: aCallback});
  };

  /**
   * Gets a user's friends.
   *
   * @param aScreenNameOrID
   *        Either a user's screen name (string) or user ID (number)
   * @param aPage [optional]
   *        The page of friends to retrieve
   */
  twitter.getTwitFriends =
  function Twitter_getTwitFriends(aScreenNameOrID, aPage, aCallback)
  {
    warnDeprecation("getTwitFriends");
    var data = {};
    data[resolveScreenNameOrID(aScreenNameOrID)] = aScreenNameOrID;
    data.page = aPage;

    doAjax({url: "http://twitter.com/statuses/friends.json",
            data: data,
            callback: aCallback});
  };

  /**
   * Gets info about a user.
   *
   * @param aScreenNameOrID
   *        Either a user's screen name (string) or user ID (number)
   */
  twitter.getTwitInfo =
  function Twitter_getTwitInfo(aScreenNameOrID, aCallback)
  {
    warnDeprecation("getTwitInfo");
    var data = {};
    data[resolveScreenNameOrID(aScreenNameOrID)] = aScreenNameOrID;

    doAjax(
      {url: "http://twitter.com/users/show.json",
       data: data,
       callback: aCallback});
  };

  /**
   * Gets the latest status of a user.
   *
   * @param aScreenNameOrID
   *        Either a user's screen name (string) or user ID (number)
   */
  twitter.getTwitLatestStatus =
  function Twitter_getTwitLatestStatus(aScreenNameOrID, aCallback)
  {
    warnDeprecation("getTwitLatestStatus");
    twitter.getTwitInfo(aScreenNameOrID, function (stat)
    {
      if (aCallback)
        aCallback(stat.status);
    });
  };

  /**
   * Gets a user's timeline.
   *
   * @param aScreenNameOrID
   *        Either a user's screen name (string) or user ID (number)
   */
  twitter.getTwitTimeline =
  function Twitter_getTwitTimeline(aScreenNameOrID, aCallback)
  {
    warnDeprecation("getTwitTimeline");
    var data = {};
    data[resolveScreenNameOrID(aScreenNameOrID)] = aScreenNameOrID;

    doAjax({url: "http://twitter.com/statuses/user_timeline.json",
            data: data,
            callback: aCallback});
  };

  // END DEPRECATED ///////////////////////////////////////////////////////////


  return twitter;
};
