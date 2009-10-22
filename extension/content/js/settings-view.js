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
 * The Original Code is Jetpack.
 *
 * The Initial Developer of the Original Code is Mozilla Labs.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Myk Melez <myk@mozilla.org>
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

/**
 * An interface for changing settings.
 */
function SettingsView(context) {
  this._context = context;

  // FIXME: make callers pass in the element within which to build the view,
  // so some callers can choose to create a dialog, while others create other
  // kinds of interfaces, and we build the same view within all of them.
  var dialog = $('#settings-dialog');
  dialog.empty();
  dialog.append(this._build(context.manifest.settings, this._store));

  var t = this;
  dialog.change(function(evt) t.onChange(evt));
  dialog.dialog({ title: context.feed.title + " Settings", width: 'auto' });
  dialog.dialog('open');
}

SettingsView.prototype = {
  _context: null,

  get _store() {
    var store = new SettingsStore(this._context);
    this.__defineGetter__("_store", function() store);
    return this._store;
  },

  _build: function _build(settings, store) {
    var table = $('<table class="setting-box"></table>');

    // Make label cells shrink to the minimum necessary size.
    var colgroup = $('<colgroup><col width="0*"><col></colgroup>');
    table.append(colgroup);

    for each (var setting in settings) {
      switch (setting.type) {
        case "group":
          table.append(this._buildGroup(setting, store));
          break;
        case "text":
          table.append(this._buildText(setting, store));
          break;
        case "password":
          table.append(this._buildPassword(setting, store));
          break;
        case "boolean":
          table.append(this._buildBoolean(setting, store));
          break;
        case "number":
          table.append(this._buildNumber(setting, store));
          break;
        case "range":
          table.append(this._buildRange(setting, store));
          break;
        case "member":
          table.append(this._buildMember(setting, store));
          break;
        default:
          Components.utils.reportError("unrecognized setting type " +
                                       setting.type);
      }
    }

    return table;
  },

  _buildGroup: function _buildGroup(setting, store) {
    var row = $('<tr class="setting-group"></tr>');
    row.attr('name', setting.name);

    var cell = $('<td colspan="2"></td>');
    row.append(cell);

    var captionText = $('<span class="setting-group-caption-text"></span>');
    captionText.append(setting.label);

    var captionBox = $('<div class="setting-group-caption-box"></div>');
    captionBox.append(captionText);
    cell.append(captionBox);

    // The object in the store into which settings for this group should be
    // written.  It might not exist if this is the first time the user is
    // changing settings, which is ok, as the build functions for the various
    // controls will ignore it if it's undefined.
    var substore = store ? store[setting.name] : undefined;

    var box = $('<div class="setting-group-box"></div>');
    box.append(this._build(setting.settings, substore));
    cell.append(box);

    return row;
  },

  _buildText: function _buildText(setting, store) {
    var row = $('<tr></tr>');

    var labelCell = $('<td></td>');
    row.append(labelCell);

    var label = $('<span class="setting-label"></span>');
    label.append(setting.label + ":");
    labelCell.append(label);

    var controlCell = $('<td></td>');
    row.append(controlCell);

    var control = $('<input>');
    control.attr('name', setting.name);
    if (store && setting.name in store)
      control.attr("value", store[setting.name]);
    controlCell.append(control);

    return row;
  },

  _buildPassword: function _buildPassword(setting, store) {
    var row = $('<tr></tr>');

    var labelCell = $('<td></td>');
    row.append(labelCell);

    var label = $('<span class="setting-label"></span>');
    label.append(setting.label + ":");
    labelCell.append(label);

    var controlCell = $('<td></td>');
    row.append(controlCell);

    var control = $('<input type="password">');
    control.attr('name', setting.name);
    if (store && setting.name in store)
      control.attr("value", store[setting.name]);
    controlCell.append(control);

    return row;
  },

  _buildBoolean: function _buildBoolean(setting, store) {
    var row = $('<tr></tr>');

    var cell = $('<td colspan="2"></td>');
    row.append(cell);

    var control = $('<input type="checkbox">');
    control.attr('name', setting.name);
    control.attr('value', 'true');
    if (store && setting.name in store) {
      if (store[setting.name])
        control.attr("checked", "checked");
    }
    cell.append(control);

    var label = $('<span class="setting-label"></span>');
    label.append(setting.label);
    cell.append(label);

    return row;
  },

  _buildNumber: function _buildNumber(setting, store) {
    var row = $('<tr></tr>');

    var labelCell = $('<td></td>');
    row.append(labelCell);

    var label = $('<span class="setting-label"></span>');
    label.append(setting.label + ":");
    labelCell.append(label);

    var controlCell = $('<td></td>');
    row.append(controlCell);

    var control = $('<input type="text" class="setting-control-number">');
    control.attr('name', setting.name);

    if (store && setting.name in store)
      control.attr("value", store[setting.name]);

    // Validate that characters entered into the control are part of a number.
    // Currently we consider digits and the period to be part of a number,
    // although commas and raised periods are used as decimal separators in some
    // parts of the world.
    // FIXME: figure out and support the locale-specific decimal separator.
    // FIXME: listen for the text event (from the DOM 3 events spec) instead of
    // the keypress event once jQuery/Mozilla start supporting it.
    control.keypress(
      function(evt) evt.ctrlKey || evt.altKey || evt.metaKey ||
                    evt.which <= 31 ||
                    /[\d.]/.test(String.fromCharCode(evt.which))
    );

    controlCell.append(control);

    return row;
  },

  _buildMember: function _buildMember(setting, store) {
    var row = $('<tr></tr>');

    var labelCell = $('<td></td>');
    row.append(labelCell);

    var label = $('<span class="setting-label"></span>');
    label.append(setting.label + ":");
    labelCell.append(label);

    var controlCell = $('<td></td>');
    row.append(controlCell);

    var control = $('<select></select>');
    control.attr('name', setting.name);
    for each (var element in setting.set) {
      var option = $('<option></option>');

      if (store && setting.name in store) {
        if (element == store[setting.name])
          option.attr("selected", "selected");
      }

      option.append(element);
      control.append(option);
    }
    controlCell.append(control);

    return row;
  },

  _buildRange: function _buildRange(setting, store) {
    var row = $('<tr></tr>');

    var labelCell = $('<td></td>');
    row.append(labelCell);

    var label = $('<span class="setting-label"></span>');
    label.append(setting.label + ":");
    labelCell.append(label);

    var controlCell = $('<td></td>');
    row.append(controlCell);

    var control = $('<div class="setting-control-slider"></div>');
    control.attr('name', setting.name);

    var options = {};

    // We have to register a separate change event handler for the slider,
    // as slider change events aren't caught by the normal jQuery change handler
    // (which is strange, since they are jQuery UI objects, so you'd think
    // they'd provide a jQuery-compatible API).
    // FIXME: file a bug on this incompatibility.
    var t = this;
    options.change = function(evt) t.onChange(evt);

    if ("min" in setting)
      options.min = setting.min;
    if ("max" in setting)
      options.max = setting.max;
    if ("step" in setting)
      options.step = setting.step;

    if (store && setting.name in store)
      options.value = store[setting.name];

    control.slider(options);
    controlCell.append(control);

    return row;
  },

  onChange: function onChange(evt) {
    var control = $(evt.target);
    var name = control.attr('name');

    // Get the value of the control.  In theory, this should be as simple
    // as calling control.val(), but in practice that doesn't always work,
    // since for checkboxes we want the checked state, and sliders don't have
    // a "val" accessor method (which is strange, since they are jQuery UI
    // objects, so you'd think they'd provide a jQuery-compatible API).
    // FIXME: file a bug on this incompatibility.
    var value;
    if (control.attr('type') == 'checkbox')
      value = control.is(':checked');
    else if (control.hasClass('setting-control-slider'))
      value = control.slider('value');
    else if (control.hasClass('setting-control-number'))
      value = new Number(control.val());
    // Other kinds of input fields (text, password, etc.).
    else
      value = control.val();

    // Derive the path to the setting from the structure of the dialog.
    // XXX Should we instead provide the entire path in the name attribute?
    // That would be more robust against changes to the dialog structure,
    // although it would also face the challenge of picking a path delimiter
    // and escaping instances of that character in the path parts.  I guess
    // we could just use "/" as the delimiter and encodeURIComponent each
    // part to make sure that character didn't appear in it.
    var path = [];
    for (var i = control; i.attr('id') != 'settings-dialog'; i = i.parent())
      if (i.hasClass('setting-group'))
        path.unshift(i.attr("name"));

    // Retrieve the object in which to set the setting.
    // Note: this may remove other settings in the process.  For example,
    // if there's a foo.bar setting storing some value, and the user sets
    // foo.bar.baz to a value, then foo.bar will be replaced by an object
    // with a "baz" property.  We trust the jetpack author's intention
    // in this case, i.e. that they used to have a foo.bar setting
    // but replaced it with a foo.bar object containing a baz setting.
    var obj = this._store;
    for each (var key in path) {
      if (!(key in obj) || obj[key] === null || typeof obj[key] != "object")
        obj[key] = {};
      obj = obj[key];
    }

    obj[name] = value;
  }

};
