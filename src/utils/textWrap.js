const MIN_WIDTH_UNITS = 12;
const DEFAULT_WRAP_COLUMN = 80;

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
 * 按最大宽度单位硬折行（不按标点/空格优先断行）
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

  for (const char of text) {
    const charWidth = isWideChar(char) ? 2 : 1;
    if (currentWidth + charWidth > limit && current.length > 0) {
      chunks.push(current);
      current = char;
      currentWidth = charWidth;
      continue;
    }

    current += char;
    currentWidth += charWidth;
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
  const estimated = Math.floor(wrapColumn * ratio);

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
 * 从锚点列起估算可用宽度单位（扣掉行前缀已占用宽度）
 * @param {import('vscode').TextEditor|undefined} editor
 * @param {number} readingFontSize
 * @param {number} prefixWidth 锚点前缀的显示宽度单位
 * @param {number} maxCharsPerLine 手动覆盖；0 表示自动
 * @returns {number}
 */
function estimateAvailableWidthUnits(editor, readingFontSize, prefixWidth = 0, maxCharsPerLine = 0) {
  const base = estimateMaxWidthUnits(editor, readingFontSize, maxCharsPerLine);
  return Math.max(MIN_WIDTH_UNITS, base - Math.max(0, prefixWidth || 0));
}

/**
 * 从锚点列起估算可用字数（码点）
 * @param {import('vscode').TextEditor|undefined} editor
 * @param {number} readingFontSize
 * @param {number} prefixCharCount 锚点前缀码点数
 * @param {number} maxCharsPerLine 手动覆盖；0 表示自动
 * @returns {number}
 */
function estimateAvailableCharsPerLine(editor, readingFontSize, prefixCharCount = 0, maxCharsPerLine = 0) {
  const base = estimateMaxCharsPerLine(editor, readingFontSize, maxCharsPerLine);
  return Math.max(1, base - Math.max(0, prefixCharCount || 0));
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
 * 按最大字数硬折行（一个汉字算 1；不按标点优先断行）
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
  for (let i = 0; i < chars.length; i += limit) {
    chunks.push(chars.slice(i, i + limit).join(''));
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
  estimateAvailableWidthUnits,
  estimateAvailableCharsPerLine,
  MIN_WIDTH_UNITS
};
