const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getExtensionContext } = require('../utils/extensionState');

const PROGRESS_FILE = 'reading-progress.json';
let migrated = false;

/**
 * 规范化书籍路径，消除 Windows 盘符大小写与斜杠差异
 * @param {string} bookPath 原始路径
 * @returns {string}
 */
function normalizeBookPath(bookPath) {
  if (!bookPath || typeof bookPath !== 'string') {
    return '';
  }
  let normalized = path.resolve(bookPath);
  normalized = normalized.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

/**
 * 获取 globalStorage 中的进度文件路径
 * @param {import('vscode').ExtensionContext} context
 * @returns {string}
 */
function getGlobalProgressPath(context) {
  return path.join(context.globalStorageUri.fsPath, PROGRESS_FILE);
}

/**
 * 获取扩展目录中的旧进度文件路径
 * @param {import('vscode').ExtensionContext} context
 * @returns {string}
 */
function getLegacyProgressPath(context) {
  return path.join(context.extensionPath, PROGRESS_FILE);
}

/**
 * 安全读取 JSON 进度文件
 * @param {string} filePath
 * @returns {Record<string, any>}
 */
function readProgressFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    console.error('读取阅读进度失败:', error);
    return {};
  }
}

/**
 * 将进度对象的 key 统一为规范化路径
 * @param {Record<string, any>} progress
 * @returns {Record<string, any>}
 */
function normalizeProgressMap(progress) {
  const result = {};
  for (const [key, value] of Object.entries(progress || {})) {
    const normalizedKey = normalizeBookPath(key);
    if (!normalizedKey) {
      continue;
    }
    const existing = result[normalizedKey];
    if (!existing || (value && value.timestamp > (existing.timestamp || 0))) {
      result[normalizedKey] = value;
    }
  }
  return result;
}

/**
 * 将旧 extensionPath 进度合并迁移到 globalStorage（只执行一次）
 * @param {import('vscode').ExtensionContext} context
 */
function migrateLegacyProgress(context) {
  if (migrated) {
    return;
  }
  migrated = true;

  const globalPath = getGlobalProgressPath(context);
  const legacyPath = getLegacyProgressPath(context);
  const globalProgress = normalizeProgressMap(readProgressFile(globalPath));
  const legacyProgress = normalizeProgressMap(readProgressFile(legacyPath));

  if (Object.keys(legacyProgress).length === 0) {
    return;
  }

  const merged = { ...legacyProgress, ...globalProgress };
  // 对冲突 key 取更新时间更大的
  for (const key of Object.keys(legacyProgress)) {
    const legacy = legacyProgress[key];
    const current = globalProgress[key];
    if (!current || (legacy.timestamp || 0) > (current.timestamp || 0)) {
      merged[key] = legacy;
    }
  }

  try {
    fs.mkdirSync(path.dirname(globalPath), { recursive: true });
    fs.writeFileSync(globalPath, JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error('迁移阅读进度失败:', error);
  }
}

/**
 * 读取全部阅读进度
 * @returns {Record<string, any>}
 */
function getReadingProgress() {
  const context = getExtensionContext();
  if (!context) {
    console.error('Extension context not available');
    return {};
  }

  migrateLegacyProgress(context);
  return normalizeProgressMap(readProgressFile(getGlobalProgressPath(context)));
}

/**
 * 按书籍路径查找进度（兼容路径写法差异）
 * @param {string} bookPath
 * @returns {{ currentLine?: number, totalLines?: number, timestamp?: number }}
 */
function getProgressForBook(bookPath) {
  const progress = getReadingProgress();
  const key = normalizeBookPath(bookPath);
  if (progress[key]) {
    return progress[key];
  }

  for (const [storedKey, value] of Object.entries(progress)) {
    if (normalizeBookPath(storedKey) === key) {
      return value;
    }
  }
  return {};
}

/**
 * 解析书籍展示/续读用进度（epub 同时参考同名 txt，取更新的一条）
 * @param {string} bookPath
 * @returns {{ currentLine?: number, totalLines?: number, timestamp?: number }}
 */
function resolveBookProgress(bookPath) {
  const direct = getProgressForBook(bookPath);
  const ext = path.extname(bookPath).toLowerCase();

  if (ext !== '.epub') {
    return direct;
  }

  const parsed = path.parse(bookPath);
  const txtPath = path.join(parsed.dir, `${parsed.name}.txt`);
  const txtProgress = getProgressForBook(txtPath);

  const hasDirect = typeof direct.currentLine === 'number';
  const hasTxt = typeof txtProgress.currentLine === 'number';

  if (hasDirect && hasTxt) {
    return (txtProgress.timestamp || 0) >= (direct.timestamp || 0) ? txtProgress : direct;
  }
  if (hasTxt) {
    return txtProgress;
  }
  return direct;
}

/**
 * 计算进度百分比（0-100）
 * @param {{ currentLine?: number, totalLines?: number }} progress
 * @returns {number}
 */
function getProgressPercent(progress) {
  if (!progress || typeof progress.currentLine !== 'number') {
    return 0;
  }
  return Math.min(
    100,
    Math.round((progress.currentLine / Math.max(1, (progress.totalLines || 1) - 1)) * 100)
  );
}

/**
 * 解析实际用于存进度的文本路径（epub 优先同名 txt）
 * @param {string} bookPath
 * @returns {string}
 */
function resolveProgressTargetPath(bookPath) {
  const ext = path.extname(bookPath).toLowerCase();
  if (ext !== '.epub') {
    return bookPath;
  }
  const parsed = path.parse(bookPath);
  const txtPath = path.join(parsed.dir, `${parsed.name}.txt`);
  return fs.existsSync(txtPath) ? txtPath : bookPath;
}

/**
 * 统计文本非空行数（与阅读器切分一致）
 * @param {string} filePath
 * @returns {number}
 */
function countBookLines(filePath) {
  if (!fs.existsSync(filePath) || path.extname(filePath).toLowerCase() === '.epub') {
    return 0;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').filter((line) => line !== '').length;
}

/**
 * 按百分比手动设置阅读进度
 * @param {string} bookPath 书籍路径（可为 epub）
 * @param {number} percent 0-100
 * @returns {{ ok: boolean, percent: number, message?: string }}
 */
function setProgressByPercent(bookPath, percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent)));
  if (!Number.isFinite(clamped)) {
    return { ok: false, percent: 0, message: '进度百分比无效' };
  }

  const targetPath = resolveProgressTargetPath(bookPath);
  const existing = resolveBookProgress(bookPath);
  let totalLines = existing.totalLines;

  if (!totalLines || totalLines <= 0) {
    totalLines = countBookLines(targetPath);
  }

  if (!totalLines || totalLines <= 0) {
    return {
      ok: false,
      percent: clamped,
      message: '无法读取书籍行数（若是 epub，请先开始阅读生成 txt）',
    };
  }

  const currentLine = Math.round((clamped / 100) * Math.max(0, totalLines - 1));
  saveReadingProgress(targetPath, currentLine, totalLines, 0);

  return {
    ok: true,
    percent: getProgressPercent({ currentLine, totalLines }),
  };
}

/**
 * 保存阅读进度到 globalStorage
 * @param {string} bookPath
 * @param {number} currentLine
 * @param {number} totalLines
 * @param {number} [charOffset=0] 行内字偏移
 */
function saveReadingProgress(bookPath, currentLine, totalLines, charOffset = 0) {
  const context = getExtensionContext();
  if (!context) {
    console.error('Extension context not available');
    return;
  }

  try {
    migrateLegacyProgress(context);
    const progressFilePath = getGlobalProgressPath(context);
    fs.mkdirSync(path.dirname(progressFilePath), { recursive: true });

    const progress = normalizeProgressMap(readProgressFile(progressFilePath));
    const key = normalizeBookPath(bookPath);
    if (!key) {
      return;
    }

    progress[key] = {
      currentLine,
      charOffset: Math.max(0, charOffset || 0),
      timestamp: Date.now(),
      totalLines,
    };

    fs.writeFileSync(progressFilePath, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error('保存阅读进度失败:', error);
    vscode.window.showWarningMessage(`保存阅读进度失败: ${error.message}`);
  }
}

module.exports = {
  normalizeBookPath,
  saveReadingProgress,
  getReadingProgress,
  getProgressForBook,
  resolveBookProgress,
  getProgressPercent,
  setProgressByPercent,
};
