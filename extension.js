const { registerCommands } = require('./src/commands');
const { initializeConfig } = require('./src/config');
const { setExtensionContext } = require('./src/utils/extensionState');
const { registerSidebar } = require('./src/sidebar');
const bookReader = require('./src/services/bookReader');

function activate(context) {
  setExtensionContext(context);
  initializeConfig(context);
  registerCommands(context);
  registerSidebar(context);
  bookReader.registerEditorListeners(context);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
