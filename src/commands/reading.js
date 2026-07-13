const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { handleEpubFile } = require('../services/epubReader');
const bookReader = require('../services/bookReader');
const { resolveBookProgress } = require('../services/progress');
const { getBookFolderPath } = require('../config');

/**
 * 有进度则续读，无进度则从头开始（不再弹确认）
 * @param {string} bookPath
 * @returns {{ startLine: number, charOffset: number }}
 */
function resolveStartPosition(bookPath) {
  const progress = resolveBookProgress(bookPath);
  if (typeof progress.currentLine !== 'number') {
    return { startLine: 0, charOffset: 0 };
  }
  return {
    startLine: progress.currentLine,
    charOffset: progress.charOffset || 0,
  };
}

function registerReadingCommands() {
  const commands = [];

  commands.push(
    vscode.commands.registerCommand('imfish.startReading', async () => {
      const bookFolderPath = getBookFolderPath();
      if (!bookFolderPath) {
        vscode.window.showErrorMessage('请先选择书籍目录');
        return;
      }

      if (!fs.existsSync(bookFolderPath)) {
        vscode.window.showErrorMessage('书籍目录不存在，请重新选择');
        return;
      }

      const bookFiles = fs.readdirSync(bookFolderPath)
        .filter(file => ['.txt', '.epub'].includes(path.extname(file).toLowerCase()));

      if (bookFiles.length === 0) {
        vscode.window.showErrorMessage('书籍目录中没有找到可用的书籍文件');
        return;
      }

      const selectedBook = await vscode.window.showQuickPick(bookFiles, {
        placeHolder: '选择要阅读的书籍',
        ignoreFocusOut: true,
      });
      if (!selectedBook) {
        return;
      }

      const bookPath = path.join(bookFolderPath, selectedBook);
      const position = resolveStartPosition(bookPath);

      const ext = path.extname(selectedBook).toLowerCase();
      if (ext === '.epub') {
        await handleEpubFile(bookPath, position.startLine, position.charOffset);
      } else {
        await bookReader.readTxt(bookPath, position.startLine, position.charOffset);
      }
    })
  );

  commands.push(
    vscode.commands.registerCommand('imfish.stopReading', () => {
      bookReader.stop();
    })
  );

  commands.push(
    vscode.commands.registerCommand('imfish.nextLine', () => {
      bookReader.nextPage();
    })
  );

  commands.push(
    vscode.commands.registerCommand('imfish.previousLine', () => {
      bookReader.previousPage();
    })
  );

  return commands;
}

module.exports = {
  registerReadingCommands
};
