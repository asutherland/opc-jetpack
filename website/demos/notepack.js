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
 * The Original Code is the Notepack Jetpack feature.
 *
 * The Initial Developer of the Original Code is
 * Drew Willcoxon <adw@mozilla.com>
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

// Save simple, persistent notes in the slidebar.

jetpack.future.import("slideBar");
jetpack.future.import("storage.simple");

var storage = jetpack.storage.simple;

// We'll keep our notes in an array, jetpack.storage.simple.notes.  If there are
// no notes currently in it or it doesn't exist, make a new array with one note.
storage.notes = storage.notes && storage.notes.length > 0 ?
                storage.notes :
                [newNote("Type your notes here.")];

// Makes a new note with the current time and given text body.
function newNote(body) {
  return { body: body, time: new Date().toLocaleString() };
}

// Add our content to the slidebar.
jetpack.slideBar.append({
  onReady: function (slide) {

    // Adds a button for note.  You can click on it to view and edit it.
    function addNoteButton(note) {
      var li = $("<div />", slide.contentDocument);
      li.addClass("noteButton");
      var time = $("<div />", slide.contentDocument);
      time.addClass("noteButtonTime");
      time.text(new Date(note.time).toLocaleString());
      li.append(time);
      var summary = $("<div />", slide.contentDocument);
      summary.addClass("noteButtonSummary");
      summary.text(noteSummary(note));
      li.append(summary);
      li.click(function () showNote(note, li));
      $("#noteList", slide.contentDocument).append(li);
      return li;
    }

    // Makes a summary based on the given note's body.
    function noteSummary(note) {
      return note.body.length > 50 ?
             note.body.substr(0, 50) + "..." :
             note.body;
    }

    // Displays note in the edit area.
    function showNote(note, button) {
      shownNote = note;
      shownNoteButton = button;
      $("#noteTime", slide.contentDocument).text(note.time);
      $("#noteBody", slide.contentDocument)[0].value = note.body;
      $("#noteBody", slide.contentDocument)[0].focus();
    }

    // Initialize.
    var shownNote;
    var shownNoteButton;
    storage.notes.forEach(addNoteButton);
    showNote(storage.notes[0], $($(".noteButton", slide.contentDocument)[0]));

    // Append a note when the user clicks the new-note button.
    $("#newNoteButton", slide.contentDocument).click(function () {
      var note = newNote("");
      storage.notes.push(note);
      showNote(note, addNoteButton(note));
    });

    // Remove the shown note when the user clicks the remove-note button.
    $("#removeNoteButton", slide.contentDocument).click(function () {
      if (storage.notes.length > 1) {
        var idx = storage.notes.indexOf(shownNote);
        storage.notes.splice(idx, 1);
        shownNoteButton.remove();
        showNote(storage.notes[0],
                 $($(".noteButton", slide.contentDocument)[0]));
      }
    });

    // Save the shown note's body and update its summary when typing in the
    // textarea.
    $("#noteBody", slide.contentDocument).keyup(function () {
      shownNote.body = $("#noteBody", slide.contentDocument)[0].value;
      $(".noteButtonSummary", shownNoteButton).text(noteSummary(shownNote));
    });
  },

  width: 300,
  persist: true,

  // This automagically becomes our slidebar content.
  html: <>
    <style><![CDATA[
      body {
        background: #fff;
        color: #222;
        font-family: sans-serif;
        font-size: 10pt;
      }
      h1 {
        font-size: 10pt;
        text-align: center;
      }
      textarea {
        width: 100%;
      }
      #editArea {
        padding: 1em;
        -moz-border-radius: 5px;
        background: #ccf;
      }
      #noteTime {
        margin: 0;
        font-weight: bold;
      }
      #removeNoteButton {
        color: #833;
        padding-top: 1em;
        font-weight: bold;
        cursor: pointer;
      }
      #newNoteButton {
        background: #ffa;
        color: #330;
        margin: 1em 0;
        padding: 0.5em;
        -moz-border-radius: 5px;
        font-weight: bold;
        text-align: center;
        cursor: pointer;
      }
      .noteButton {
        background: #ddd;
        color: #333;
        margin: 1em 0;
        padding: 0.5em;
        -moz-border-radius: 5px;
        cursor: pointer;
      }
      .noteButtonTime {
         font-weight: bold;
      }
    ]]></style>
    <body>
      <h1>Notepack</h1>
      <div id="editArea">
        <p id="noteTime" />
        <div><textarea id="noteBody" rows="20"> </textarea></div>
        <div id="removeNoteButton">Delete</div>
      </div>
      <div id="newNoteButton">New Note</div>
      <div id="noteList" />
    </body>
  </>
});
