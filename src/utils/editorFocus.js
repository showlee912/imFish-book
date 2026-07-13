const vscode = require('vscode');

/**
 * 判断文档是否适合作为阅读装饰载体
 * @param {vscode.TextDocument} document
 * @returns {boolean}
 */
function isReadableDocument(document) {
  if (!document || document.isClosed) {
    return false;
  }
  const scheme = document.uri.scheme;
  return scheme === 'file' || scheme === 'untitled';
}

/**
 * 解析可用于显示阅读装饰的编辑器
 * 设置 Webview 聚焦时 activeTextEditor 可能为空，需回退到可见文本编辑器
 * @returns {vscode.TextEditor|undefined}
 */
function resolveTargetEditor() {
  const active = vscode.window.activeTextEditor;
  if (active && isReadableDocument(active.document)) {
    return active;
  }

  const visible = vscode.window.visibleTextEditors.find(
    (editor) => isReadableDocument(editor.document)
  );
  if (visible) {
    return visible;
  }

  return undefined;
}

/**
 * 尽量聚焦一个已打开的文本编辑器；若没有则新建 untitled
 * @returns {Promise<vscode.TextEditor|undefined>}
 */
async function ensureFocusedTextEditor() {
  let editor = resolveTargetEditor();
  if (editor) {
    try {
      return await vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn || vscode.ViewColumn.One,
        preserveFocus: false,
        preview: false,
      });
    } catch (error) {
      console.error('聚焦已有编辑器失败:', error);
    }
  }

  // 没有可用文本编辑器时，打开一个空白文档作为阅读载体
  try {
    const doc = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: '\n'.repeat(40),
    });
    return await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
      preview: false,
    });
  } catch (error) {
    console.error('创建阅读载体文档失败:', error);
    return undefined;
  }
}

module.exports = {
  resolveTargetEditor,
  ensureFocusedTextEditor,
  isReadableDocument,
};
