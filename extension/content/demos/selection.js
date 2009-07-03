jetpack.future.import("selection");

// Take a selected number and bump it up by one
jetpack.selection.onSelection(function() {
  let plusOne = Number(jetpack.selection.text) + 1;
  if (!isNaN(plusOne))
    jetpack.selection.text = plusOne;
});

// A list of rainbow colors in order
let colors = "red,orangered,orange,gold,yellow,yellowgreen,green,teal,blue,slateblue,purple".split(/,/);
// Color selected text with the next rainbow color
jetpack.selection.onSelection(function colorer() {
  jetpack.selection.html = "<span style='color: " + colors.shift() + "'>" +
    jetpack.selection.html + "</span>";

  // Remove the selection listener if there's no more colors
  if (colors.length == 0)
    jetpack.selection.onSelection.unbind(colorer);
});
