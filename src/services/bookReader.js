const fs = require('fs');
const vscode = require('vscode');
const {
  getLinesPerPage,
  getFontSize,
  getFontColor,
  getAutoWrap,
  getMaxCharsPerLine,
  getMaxCharsPerPage,
  addConfigChangeListener
} = require('../config');
const { saveReadingProgress } = require('./progress');
const {
  wrapText,
  wrapByCharCount,
  countChars,
  estimateMaxWidthUnits,
  estimateMaxCharsPerLine
} = require('../utils/textWrap');
const { resolveTargetEditor, ensureFocusedTextEditor, isReadableDocument } = require('../utils/editorFocus');

const REDRAW_CONFIG_KEYS = new Set([
  'linesPerPage',
  'fontSize',
  'fontColor',
  'autoWrap',
  'maxCharsPerLine',
  'maxCharsPerPage',
  'editorLayout'
]);

/**
 * 阅读器类
 * 负责处理文本阅读的核心功能（按字数预算翻页）
 */
class BookReader {
  constructor() {
    this.currentBookPath = null;
    this.currentBookLines = [];
    this.currentLineIndex = 0;
    this.currentCharOffset = 0;
    this.currentDecorationType = null;
    this._redrawTimer = null;
    /** @type {{ line: number, offset: number }[]} 下一页前压入的页起点，供上一页对称回退 */
    this.pageStartStack = [];

    addConfigChangeListener((key) => {
      if (REDRAW_CONFIG_KEYS.has(key) && this.isReading()) {
        this.scheduleSilentRedraw();
      }
    });
  }

  /**
   * 注册编辑器切换/可见性监听，阅读中换 tab 时把装饰重绘到当前编辑器
   * @param {import('vscode').ExtensionContext} context
   */
  registerEditorListeners(context) {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!this.isReading()) {
          return;
        }
        if (!editor || !isReadableDocument(editor.document)) {
          return;
        }
        this.scheduleSilentRedraw();
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => {
        if (!this.isReading()) {
          return;
        }
        if (!resolveTargetEditor()) {
          return;
        }
        this.scheduleSilentRedraw();
      })
    );
  }

  /**
   * 配置变更后延迟静默重绘（避免设置页抢焦点时误弹警告）
   */
  scheduleSilentRedraw() {
    if (this._redrawTimer) {
      clearTimeout(this._redrawTimer);
    }
    this._redrawTimer = setTimeout(() => {
      this._redrawTimer = null;
      if (!this.isReading()) {
        return;
      }
      // 设置 Webview 聚焦时往往没有文本编辑器，跳过即可；下次翻页/续读会用新配置
      if (!resolveTargetEditor()) {
        return;
      }
      this.showCurrentLine();
    }, 80);
  }

  /**
   * 检查是否正在阅读
   * @returns {boolean}
   */
  isReading() {
    return this.currentBookPath !== null && this.currentBookLines.length > 0;
  }

  /**
   * 持久化当前进度
   */
  persistProgress() {
    if (!this.currentBookPath || this.currentBookLines.length === 0) {
      return;
    }
    saveReadingProgress(
      this.currentBookPath,
      this.currentLineIndex,
      this.currentBookLines.length,
      this.currentCharOffset
    );
  }

  /**
   * 读取文本文件
   * @param {string} bookPath 书籍路径
   * @param {number} startLine 开始行数
   * @param {number} [charOffset=0] 行内字偏移
   * @returns {Promise<boolean>}
   */
  async readTxt(bookPath, startLine = 0, charOffset = 0) {
    this.currentBookPath = bookPath;
    const content = fs.readFileSync(bookPath, 'utf-8');
    this.currentBookLines = content.split('\n').filter(x => x !== '');
    const maxLine = Math.max(0, this.currentBookLines.length - 1);
    this.currentLineIndex = Math.max(0, Math.min(startLine, maxLine));
    const lineChars = countChars(this.currentBookLines[this.currentLineIndex] || '');
    this.currentCharOffset = Math.max(0, Math.min(charOffset || 0, lineChars));
    this.pageStartStack = [];
    this.persistProgress();

    // 设置页/侧边栏抢焦点后，先把可用文本编辑器拉回前台
    await ensureFocusedTextEditor();
    this.showCurrentLine();
    return true;
  }

  /**
   * 从当前位置按字数预算取出本页文本，并计算页末位置
   * @returns {{ text: string, endLine: number, endOffset: number, consumed: number }}
   */
  takePageContent() {
    const maxChars = Math.max(1, getMaxCharsPerPage() || 50);
    const maxLines = Math.max(1, getLinesPerPage() || 1);
    let remaining = maxChars;
    let line = this.currentLineIndex;
    let offset = this.currentCharOffset;
    let linesUsed = 0;
    const parts = [];

    while (
      remaining > 0 &&
      line < this.currentBookLines.length &&
      linesUsed < maxLines
    ) {
      const chars = Array.from(this.currentBookLines[line] || '');
      if (offset > chars.length) {
        offset = chars.length;
      }

      if (offset >= chars.length) {
        line += 1;
        offset = 0;
        linesUsed += 1;
        continue;
      }

      const available = chars.length - offset;
      const take = Math.min(remaining, available);
      parts.push(chars.slice(offset, offset + take).join(''));
      remaining -= take;
      offset += take;

      if (offset >= chars.length) {
        line += 1;
        offset = 0;
        linesUsed += 1;
      } else {
        break;
      }
    }

    return {
      text: parts.join(''),
      endLine: line,
      endOffset: offset,
      consumed: maxChars - remaining
    };
  }

  /**
   * 将本页文本折成装饰片段
   * @param {import('vscode').TextEditor} editor
   * @param {string} pageText
   * @returns {string[]}
   */
  wrapPageText(editor, pageText) {
    if (!pageText) {
      return [];
    }

    if (!getAutoWrap()) {
      return [pageText];
    }

    const maxPerLine = getMaxCharsPerLine();
    if (maxPerLine && maxPerLine > 0) {
      return wrapByCharCount(pageText, estimateMaxCharsPerLine(editor, getFontSize(), maxPerLine));
    }

    const widthUnits = estimateMaxWidthUnits(editor, getFontSize(), 0);
    return wrapText(pageText, widthUnits);
  }

  /**
   * 清除当前装饰（所有可见编辑器）
   */
  clearDecorations() {
    if (!this.currentDecorationType) {
      return;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      try {
        editor.setDecorations(this.currentDecorationType, []);
      } catch (_) {
        // ignore
      }
    }
    this.currentDecorationType.dispose();
    this.currentDecorationType = null;
  }

  /**
   * 显示当前页
   */
  showCurrentLine() {
    this.persistProgress();

    const editor = resolveTargetEditor();
    if (!editor) {
      vscode.window.showWarningMessage('请先打开并聚焦一个文本文件，再继续阅读（文字会显示在编辑器行尾）');
      return;
    }

    this.clearDecorations();

    const page = this.takePageContent();
    const startPosition = editor.selection.active;
    const displayChunks = this.wrapPageText(editor, page.text);
    const decorations = [];
    const fontSize = getFontSize();
    const fontColor = getFontColor();

    for (let i = 0; i < displayChunks.length; i++) {
      const lineNumber = startPosition.line + i;
      if (lineNumber >= editor.document.lineCount) {
        break;
      }

      const position = new vscode.Position(lineNumber, 0);
      decorations.push({
        range: new vscode.Range(position, position),
        renderOptions: {
          after: {
            contentText: displayChunks[i],
            fontStyle: 'normal',
            fontWeight: 'normal',
            fontSize: `${fontSize}px`,
            color: fontColor,
            margin: '0 0 0 2em',
          }
        }
      });
    }

    this.currentDecorationType = vscode.window.createTextEditorDecorationType({});
    editor.setDecorations(this.currentDecorationType, decorations);
  }

  /**
   * 下一页：跳到本页结束位置，并记录页起点供上一页回退
   */
  nextPage() {
    if (!this.isReading()) {
      return;
    }

    const page = this.takePageContent();
    if (page.consumed === 0) {
      return;
    }

    const nextLine = page.endLine;
    const nextOffset = page.endOffset;

    const savedLine = this.currentLineIndex;
    const savedOffset = this.currentCharOffset;
    this.currentLineIndex = nextLine;
    this.currentCharOffset = nextOffset;

    if (this.currentLineIndex >= this.currentBookLines.length) {
      this.currentLineIndex = savedLine;
      this.currentCharOffset = savedOffset;
      return;
    }

    const peek = this.takePageContent();
    if (peek.consumed === 0) {
      this.currentLineIndex = savedLine;
      this.currentCharOffset = savedOffset;
      return;
    }

    this.pageStartStack.push({ line: savedLine, offset: savedOffset });
    this.showCurrentLine();
  }

  /**
   * 上一页：优先弹出页起点栈（与下一页对称）；栈空则停在书首
   */
  previousPage() {
    if (!this.isReading()) {
      return;
    }

    if (this.pageStartStack.length > 0) {
      const prev = this.pageStartStack.pop();
      this.currentLineIndex = prev.line;
      this.currentCharOffset = prev.offset;
      this.showCurrentLine();
      return;
    }

    if (this.currentLineIndex <= 0 && this.currentCharOffset <= 0) {
      this.showCurrentLine();
      return;
    }

    // 续读进入中途时栈为空：按字数预算回退一次，作为兜底
    const maxChars = Math.max(1, getMaxCharsPerPage() || 50);
    let remaining = maxChars;
    let line = this.currentLineIndex;
    let offset = this.currentCharOffset;

    while (remaining > 0 && (line > 0 || offset > 0)) {
      if (offset > 0) {
        const take = Math.min(remaining, offset);
        offset -= take;
        remaining -= take;
      } else {
        line -= 1;
        offset = countChars(this.currentBookLines[line] || '');
      }
    }

    this.currentLineIndex = line;
    this.currentCharOffset = offset;
    this.showCurrentLine();
  }

  /**
   * 停止阅读
   */
  stop() {
    if (this.currentBookPath) {
      this.persistProgress();
    }

    this.clearDecorations();
    this.currentBookLines = [];
    this.currentLineIndex = 0;
    this.currentCharOffset = 0;
    this.pageStartStack = [];
    this.currentBookPath = null;
  }
}

module.exports = new BookReader();
