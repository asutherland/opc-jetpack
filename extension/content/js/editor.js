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
    var self = this;
    // Loads and configures the objects that the editor needs
    self._component = new bespin.editor.Component(divId, {
      language: "js",
      loadfromdiv: false
      });
    self._component.setContent(self.loadData());
    self._component.onchange(function() {
      self.saveData(self._component.getContent());
      });
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
