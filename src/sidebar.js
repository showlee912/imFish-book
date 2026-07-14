const vscode = require('vscode');

/**
 * 侧边栏 Webview：提供打开设置等快捷入口
 */
class ImFishSidebarProvider {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'openSettings':
          await vscode.commands.executeCommand('imfish.showSettings');
          break;
        case 'startReading':
          await vscode.commands.executeCommand('imfish.startReading');
          break;
        case 'stopReading':
          await vscode.commands.executeCommand('imfish.stopReading');
          break;
        default:
          break;
      }
    });
  }

  /**
   * @returns {string}
   */
  getHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 16px 14px;
      margin: 0;
    }
    h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    p {
      margin: 0 0 16px;
      opacity: 0.8;
      line-height: 1.5;
      font-size: 12px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    button {
      width: 100%;
      border: none;
      border-radius: 4px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .tips {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.35));
      font-size: 11px;
      opacity: 0.75;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <h2>imFishBook</h2>
  <p>本地摸鱼阅读。点下方按钮打开设置，管理书库与字数显示。</p>
  <div class="actions">
    <button class="primary" id="open-settings">打开设置</button>
    <button class="secondary" id="start-reading">开始 / 继续阅读</button>
    <button class="secondary" id="stop-reading">停止阅读</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open-settings').addEventListener('click', () => {
      vscode.postMessage({ command: 'openSettings' });
    });
    document.getElementById('start-reading').addEventListener('click', () => {
      vscode.postMessage({ command: 'startReading' });
    });
    document.getElementById('stop-reading').addEventListener('click', () => {
      vscode.postMessage({ command: 'stopReading' });
    });
  </script>
</body>
</html>`;
  }
}

/**
 * 注册侧边栏视图
 * @param {vscode.ExtensionContext} context
 */
function registerSidebar(context) {
  const provider = new ImFishSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('imfish.sidebar', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

module.exports = {
  registerSidebar,
  ImFishSidebarProvider,
};
