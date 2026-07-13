const vscode = require('vscode');

// 配置相关变量
let config;
let bookFolderPath;
let linesPerPage;
let fontSize;
let fontColor;
let autoWrap;
let maxCharsPerLine;
let maxCharsPerPage;
let configChangeListeners = [];

/**
 * 初始化配置
 * @param {vscode.ExtensionContext} context 扩展上下文
 */
function initializeConfig(context) {
  config = vscode.workspace.getConfiguration('imfish');
  // 未设置时保持空字符串，不回落到扩展目录（与「开始阅读」校验一致）
  bookFolderPath = config.get('bookFolder') || '';
  linesPerPage = config.get('linesPerPage') || 200;
  fontSize = config.get('fontSize') || 14;
  fontColor = config.get('fontColor') || '#A8A8A8';
  autoWrap = config.get('autoWrap') !== false;
  const lineChars = config.get('maxCharsPerLine');
  maxCharsPerLine = typeof lineChars === 'number' ? lineChars : 0;
  maxCharsPerPage = config.get('maxCharsPerPage') || 50;

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(handleConfigChange)
  );
}

/**
 * 处理配置变更
 * @param {vscode.ConfigurationChangeEvent} event 配置变更事件
 */
function handleConfigChange(event) {
  if (event.affectsConfiguration('imfish')) {
    config = vscode.workspace.getConfiguration('imfish');

    if (event.affectsConfiguration('imfish.bookFolder')) {
      bookFolderPath = config.get('bookFolder') || '';
    }

    if (event.affectsConfiguration('imfish.linesPerPage')) {
      linesPerPage = config.get('linesPerPage') || 200;
      notifyConfigChange('linesPerPage', linesPerPage);
    }

    if (event.affectsConfiguration('imfish.fontSize')) {
      fontSize = config.get('fontSize');
      notifyConfigChange('fontSize', fontSize);
    }

    if (event.affectsConfiguration('imfish.fontColor')) {
      fontColor = config.get('fontColor');
      notifyConfigChange('fontColor', fontColor);
    }

    if (event.affectsConfiguration('imfish.autoWrap')) {
      autoWrap = config.get('autoWrap') !== false;
      notifyConfigChange('autoWrap', autoWrap);
    }

    if (event.affectsConfiguration('imfish.maxCharsPerLine')) {
      const lineChars = config.get('maxCharsPerLine');
      maxCharsPerLine = typeof lineChars === 'number' ? lineChars : 0;
      notifyConfigChange('maxCharsPerLine', maxCharsPerLine);
    }

    if (event.affectsConfiguration('imfish.maxCharsPerPage')) {
      maxCharsPerPage = config.get('maxCharsPerPage') || 50;
      notifyConfigChange('maxCharsPerPage', maxCharsPerPage);
    }
  }

  if (
    event.affectsConfiguration('editor.wordWrapColumn') ||
    event.affectsConfiguration('editor.fontSize')
  ) {
    notifyConfigChange('editorLayout', null);
  }
}

/**
 * 添加配置变更监听器
 * @param {Function} listener 监听器函数
 */
function addConfigChangeListener(listener) {
  configChangeListeners.push(listener);
}

/**
 * 通知配置变更
 * @param {string} key 配置键
 * @param {any} value 配置值
 */
function notifyConfigChange(key, value) {
  configChangeListeners.forEach(listener => {
    listener(key, value);
  });
}

/**
 * 更新配置
 * @param {string} key 配置键
 * @param {any} value 配置值
 */
async function updateConfig(key, value) {
  config = vscode.workspace.getConfiguration('imfish');
  await config.update(key, value, true);
  return value;
}

module.exports = {
  initializeConfig,
  getConfig: () => config,
  getBookFolderPath: () => bookFolderPath,
  getLinesPerPage: () => linesPerPage,
  getFontSize: () => fontSize,
  getFontColor: () => fontColor,
  getAutoWrap: () => autoWrap,
  getMaxCharsPerLine: () => maxCharsPerLine,
  getMaxCharsPerPage: () => maxCharsPerPage,
  updateConfig,
  addConfigChangeListener
};
