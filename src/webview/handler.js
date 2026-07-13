const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getBookFolderPath, updateConfig } = require('../config');
const bookReader = require('../services/bookReader');
const { handleEpubFile } = require('../services/epubReader');
const { resolveBookProgress, setProgressByPercent } = require('../services/progress');

function handleWebviewMessage(message, panel) {
  switch (message.command) {
    case 'selectDirectory':
      handleSelectDirectory(panel);
      break;
    case 'saveSettings':
      handleSaveSettings(message);
      break;
    case 'selectFile':
      handleSelectFile(message, panel);
      break;
    case 'setProgress':
      handleSetProgress(message, panel);
      break;
  }
}

/**
 * 手动设置书籍进度百分比
 * @param {{ file: string, percent: number }} message
 * @param {import('vscode').WebviewPanel} panel
 */
function handleSetProgress(message, panel) {
  const result = setProgressByPercent(message.file, message.percent);
  if (!result.ok) {
    vscode.window.showWarningMessage(result.message || '进度更新失败');
    return;
  }
  updateFileList(panel);
  vscode.window.showInformationMessage(`进度已更新为 ${result.percent}%`);
}

async function handleSelectDirectory(panel) {
  const folderUri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });

  if (folderUri && folderUri[0]) {
    await updateConfig('bookFolder', folderUri[0].fsPath);
    updateFileList(panel);
  }
}

function updateFileList(panel) {
  const bookFolderPath = getBookFolderPath();
  if (!bookFolderPath || !fs.existsSync(bookFolderPath)) {
    panel.webview.postMessage({
      command: 'updateFileList',
      currentFolder: bookFolderPath || '未设置书籍目录',
      files: []
    });
    return;
  }

  const files = fs.readdirSync(bookFolderPath)
    .filter(file => ['.txt', '.epub'].includes(path.extname(file).toLowerCase()))
    .map(file => {
      const filePath = path.join(bookFolderPath, file);
      return {
        name: file,
        path: filePath,
        progress: resolveBookProgress(filePath)
      };
    });

  panel.webview.postMessage({
    command: 'updateFileList',
    currentFolder: bookFolderPath,
    files: files
  });
}

async function handleSaveSettings(message) {
  try {
    await updateConfig('fontSize', parseInt(message.fontSize));
    await updateConfig('fontColor', message.fontColor);
    await updateConfig('autoWrap', message.autoWrap !== false);
    await updateConfig('maxCharsPerPage', parseInt(message.maxCharsPerPage) || 50);
    // 设置页简化后：折行跟窗口；跨行上限用内部默认
    await updateConfig(
      'maxCharsPerLine',
      Number.isFinite(parseInt(message.maxCharsPerLine)) ? parseInt(message.maxCharsPerLine) : 0
    );
    await updateConfig('linesPerPage', parseInt(message.linesPerPage) || 200);
    vscode.window.showInformationMessage('设置已保存并生效');
  } catch (error) {
    vscode.window.showErrorMessage('保存设置失败: ' + error.message);
  }
}

async function handleSelectFile(message, panel) {
  const startLine = typeof message.startLine === 'number' ? message.startLine : 0;
  const charOffset = typeof message.charOffset === 'number' ? message.charOffset : 0;
  const ext = path.extname(message.file).toLowerCase();

  // 先关闭设置页，让焦点回到编辑器组，再开始阅读
  panel.dispose();
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (ext === '.epub') {
    await handleEpubFile(message.file, startLine, charOffset);
  } else {
    await bookReader.readTxt(message.file, startLine, charOffset);
  }
}

module.exports = {
  handleWebviewMessage,
  updateFileList
};
