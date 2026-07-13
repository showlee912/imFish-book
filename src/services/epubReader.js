const vscode = require('vscode');
const EPub = require('epub2').EPub;
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const bookReader = require('./bookReader');

/**
 * EPUB 管理器类
 * 负责处理 EPUB 格式电子书的解析和转换
 */
class EpubManager {
  constructor() {
    this.epub = null;
  }

  /**
   * 由 epub 路径推导同名 txt 路径
   * @param {string} epubPath
   * @returns {string}
   */
  getTxtPath(epubPath) {
    const parsed = path.parse(epubPath);
    return path.join(parsed.dir, `${parsed.name}.txt`);
  }

  /**
   * 同名 txt 是否仍可复用（存在且不比 epub 旧）
   * @param {string} epubPath
   * @param {string} txtPath
   * @returns {boolean}
   */
  canReuseTxt(epubPath, txtPath) {
    if (!fs.existsSync(txtPath)) {
      return false;
    }
    try {
      const epubStat = fs.statSync(epubPath);
      const txtStat = fs.statSync(txtPath);
      return txtStat.mtimeMs >= epubStat.mtimeMs;
    } catch (_) {
      return false;
    }
  }

  /**
   * 处理 EPUB 文件
   * @param {string} bookPath EPUB 文件路径
   * @param {number} startLine 开始行
   * @param {number} [charOffset=0] 行内字偏移
   */
  async handleEpubFile(bookPath, startLine = 0, charOffset = 0) {
    try {
      const txtPath = this.getTxtPath(bookPath);

      if (this.canReuseTxt(bookPath, txtPath)) {
        await bookReader.readTxt(txtPath, startLine, charOffset);
        return;
      }

      this.epub = new EPub(bookPath, '/imagewebroot/', '/articlewebroot/');

      return new Promise((resolve, reject) => {
        this.epub.on('error', (err) => {
          console.error('ERROR\n-----', err);
          reject(err);
        });

        this.epub.on('end', async () => {
          try {
            const res = await this.saveEpub2Txt(bookPath);
            await bookReader.readTxt(res.bookPath, startLine, charOffset);
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        this.epub.parse();
      });
    } catch (error) {
      console.error('解析EPUB文件失败', error);
      vscode.window.showErrorMessage('解析EPUB文件失败');
      throw error;
    }
  }

  /**
   * 将 EPUB 按 spine 顺序转换为 TXT
   * @param {string} selectedBook EPUB 文件路径
   * @returns {Promise<{ bookPath: string }>}
   */
  async saveEpub2Txt(selectedBook) {
    const txtPath = this.getTxtPath(selectedBook);
    if (fs.existsSync(txtPath)) {
      fs.unlinkSync(txtPath);
    }

    const contents = this.epub.spine.contents;
    if (!contents || contents.length === 0) {
      fs.writeFileSync(txtPath, '', 'utf-8');
      return { bookPath: txtPath };
    }

    try {
      // 顺序写入，避免 forEach(async) 乱序与过早 resolve
      for (const item of contents) {
        const { text } = await this.getEpubChapter(item.id);
        fs.appendFileSync(txtPath, text, 'utf-8');
      }
      return { bookPath: txtPath };
    } catch (err) {
      if (fs.existsSync(txtPath)) {
        try {
          fs.unlinkSync(txtPath);
        } catch (_) {
          // ignore
        }
      }
      throw err;
    }
  }

  /**
   * 获取 EPUB 章节内容
   * @param {string} contentId 章节ID
   */
  async getEpubChapter(contentId) {
    return new Promise((resolve, reject) => {
      this.epub.getChapter(contentId, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        const $ = cheerio.load(data);
        const cleanText = $.text() + '\n';
        resolve({ text: cleanText });
      });
    });
  }
}

const epubManager = new EpubManager();

/**
 * 处理 EPUB 文件的入口函数
 * @param {string} bookPath EPUB 文件路径
 * @param {number} [startLine=0] 开始行
 * @param {number} [charOffset=0] 行内字偏移
 */
async function handleEpubFile(bookPath, startLine = 0, charOffset = 0) {
  try {
    await epubManager.handleEpubFile(bookPath, startLine, charOffset);
  } catch (error) {
    vscode.window.showErrorMessage(`处理EPUB文件失败: ${error.message}`);
  }
}

module.exports = {
  handleEpubFile,
};
