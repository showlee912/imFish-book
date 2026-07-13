const MIN_WIDTH_UNITS = 12;
const DEFAULT_WRAP_COLUMN = 80;
/** 装饰左边距约 2em，按宽度单位扣除 */
const MARGIN_WIDTH_UNITS = 4;

/**
 * 判断字符是否按全角宽度计量（CJK / 全角符号等）
 * @param {string} char 单个字符
 * @returns {boolean}
 */
function isWideChar(char) {
  const code = char.codePointAt(0);
  if (code === undefined) {
    return false;
  }
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  );
}

/**
 * 计算字符串显示宽度（CJK/全角=2，ASCII=1）
 * @param {string} text 文本
 * @returns {number}
 */
function measureWidth(text) {
  let width = 0;
  for (const char of text) {
    width += isWideChar(char) ? 2 : 1;
  }
  return width;
}

/**
 * 是否适合作为优先断行点
 * @param {string} char 字符
 * @returns {boolean}
 */
function isBreakOpportunity(char) {
  return /\s/.test(char) || /[，。！？；：、,.!?;:\-—…」』》】）\])]/.test(char);
}

/**
 * 按最大宽度单位软折行；优先在空格/标点处断开，否则硬切
 * @param {string} text 原始文本
 * @param {number} maxWidthUnits 最大宽度单位
 * @returns {string[]}
 */
function wrapText(text, maxWidthUnits) {
  if (!text) {
    return [''];
  }
  const limit = Math.max(MIN_WIDTH_UNITS, maxWidthUnits);
  if (measureWidth(text) <= limit) {
    return [text];
  }

  const chunks = [];
  let current = '';
  let currentWidth = 0;
  let lastBreakIndex = -1;

  for (const char of text) {
    const charWidth = isWideChar(char) ? 2 : 1;
    if (currentWidth + charWidth > limit && current.length > 0) {
      if (lastBreakIndex >= 0) {
        chunks.push(current.slice(0, lastBreakIndex + 1).trimEnd());
        current = current.slice(lastBreakIndex + 1) + char;
        currentWidth = measureWidth(current);
      } else {
        chunks.push(current);
        current = char;
        currentWidth = charWidth;
      }
      lastBreakIndex = -1;
      if (isBreakOpportunity(char)) {
        lastBreakIndex = current.length - 1;
      }
      continue;
    }

    current += char;
    currentWidth += charWidth;
    if (isBreakOpportunity(char)) {
      lastBreakIndex = current.length - 1;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [''];
}

/**
 * 估算编辑器中装饰文本可用的最大宽度单位
 * @param {import('vscode').TextEditor|undefined} editor 当前编辑器
 * @param {number} readingFontSize 阅读字号
 * @param {number} maxCharsPerLine 手动覆盖；0 表示自动
 * @returns {number}
 */
function estimateMaxWidthUnits(editor, readingFontSize, maxCharsPerLine = 0) {
  if (maxCharsPerLine && maxCharsPerLine > 0) {
    return Math.max(MIN_WIDTH_UNITS, Math.floor(maxCharsPerLine));
  }

  const vscode = require('vscode');
  const editorConfig = vscode.workspace.getConfiguration('editor');
  const wrapColumn = editorConfig.get('wordWrapColumn') || DEFAULT_WRAP_COLUMN;
  const editorFontSize = editorConfig.get('fontSize') || 14;
  const fontSize = readingFontSize || 14;
  const ratio = editorFontSize / fontSize;
  const estimated = Math.floor(wrapColumn * ratio) - MARGIN_WIDTH_UNITS;

  // 若文档行较短，略收紧估算，减少横向溢出观感
  if (editor && editor.document.lineCount > 0) {
    const sampleLine = editor.document.lineAt(
      Math.min(editor.selection.active.line, editor.document.lineCount - 1)
    ).text;
    const sampleWidth = measureWidth(sampleLine);
    if (sampleWidth > 20) {
      return Math.max(MIN_WIDTH_UNITS, Math.min(estimated, sampleWidth + 20));
    }
  }

  return Math.max(MIN_WIDTH_UNITS, estimated);
}

/**
 * 按 Unicode 码点计字数
 * @param {string} text
 * @returns {number}
 */
function countChars(text) {
  if (!text) {
    return 0;
  }
  return Array.from(text).length;
}

/**
 * 按最大字数软折行（一个汉字算 1）
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function wrapByCharCount(text, maxChars) {
  if (!text) {
    return [''];
  }
  const limit = Math.max(1, maxChars);
  const chars = Array.from(text);
  if (chars.length <= limit) {
    return [text];
  }

  const chunks = [];
  let current = [];
  let lastBreak = -1;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    current.push(char);
    if (isBreakOpportunity(char)) {
      lastBreak = current.length - 1;
    }

    if (current.length >= limit) {
      if (lastBreak >= 0 && lastBreak < current.length - 1) {
        chunks.push(current.slice(0, lastBreak + 1).join('').trimEnd());
        current = current.slice(lastBreak + 1);
      } else {
        chunks.push(current.join(''));
        current = [];
      }
      lastBreak = -1;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(''));
  }

  return chunks.length > 0 ? chunks : [''];
}

/**
 * 估算编辑器中每行可用字数（码点）
 * @param {import('vscode').TextEditor|undefined} editor
 * @param {number} readingFontSize
 * @param {number} maxCharsPerLine 手动覆盖；0 表示自动
 * @returns {number}
 */
function estimateMaxCharsPerLine(editor, readingFontSize, maxCharsPerLine = 0) {
  if (maxCharsPerLine && maxCharsPerLine > 0) {
    return Math.max(1, Math.floor(maxCharsPerLine));
  }

  // 自动：宽度单位约按「汉字宽度」折算为字数
  const widthUnits = estimateMaxWidthUnits(editor, readingFontSize, 0);
  return Math.max(1, Math.floor(widthUnits / 2));
}

module.exports = {
  measureWidth,
  wrapText,
  wrapByCharCount,
  countChars,
  estimateMaxWidthUnits,
  estimateMaxCharsPerLine,
  MIN_WIDTH_UNITS
};
