var JetpackCodeEditor = {
  FILENAME: 'jetpack-editor-code.txt',
  CHARSET: 'utf-8',

  _component: null,

  get fullPath() {
    var file = DirIO.get('ProfD');
    file.append(this.FILENAME);
    return file;
  },

  get url() {
    return FileIO.path(this.fullPath);
  },

  initUI: function initUI(divId) {
    // Loads and configures the objects that the editor needs
    this._component = new bespin.editor.Component(divId, {
      language: "js",
      loadfromdiv: false
      });
    this._component.setContent(this.loadData());
  },

  loadData: function loadData() {
    var file = this.fullPath;
    if (!file.exists()) {
      this.saveData("");
      return "";
    }
    return FileIO.read(file, this.CHARSET);
  },

  saveData: function saveData(data) {
    if (data === undefined)
      data = this._component.getContent();
    var file = this.fullPath;
    if (!file.exists())
      FileIO.create(file);
    FileIO.write(file, data, 'w', this.CHARSET);
  },

  registerFeed: function registerFeed(feedManager) {
    // At least make sure the file exists before
    // subscribing to it.
    this.loadData();
    feedManager.addSubscribedFeed({url: this.url,
                                   type: "jetpack",
                                   sourceUrl: this.url,
                                   canAutoUpdate: true,
                                   isBuiltIn: true});
  }
};
