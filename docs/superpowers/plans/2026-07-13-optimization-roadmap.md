# Local Workchill Reader 优化与功能路线图

> **性质：** 基于 0.2.4 代码库深度调查后的分阶段计划（非单功能实现清单）  
> **产品定位：** 编辑器行尾装饰「摸鱼阅读」——优先正确性、隐蔽性、本地书库体验  
> **For agentic workers：** 选定某一 Phase 后再拆成可执行的实现计划（`superpowers:writing-plans` / `subagent-driven-development`）

**Goal:** 在现有「字数翻页 + 装饰渲染 + 设置页进度」基础上，按价值/风险排序修掉硬伤，再补强摸鱼体验与书库易用性。

**Architecture（现状）：** `extension.js` → config / commands / sidebar；阅读核心为单例 `bookReader`（字数预算分页 + `after` 装饰）；epub 经 `epubReader` 转同名 txt；进度在 `globalStorage/reading-progress.json`；设置 UI 为 `src/webview/index.html`。

**Tech Stack:** VS Code Extension API、esbuild、epub2、cheerio、Webview HTML。

---

## 调查结论（摘要）

### 做得好的地方

- 字数预算翻页（`maxCharsPerPage`）比上游「按行」更适合摸鱼密度控制
- CJK 宽度折行（`textWrap.js`）+ 编辑器焦点恢复（`editorFocus.js`）已有基础
- 进度迁移到 globalStorage、设置页手动调进度、侧边栏入口，日常可用

### 最大风险（建议优先）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | EPUB 章节 `forEach(async)` 并发 append，顺序/完成时机不可靠 | `src/services/epubReader.js` `saveEpub2Txt` | 转出 txt 可能乱序/截断 |
| 2 | 配置默认值与 `package.json` 不一致 | `src/config.js` vs `package.json` | `linesPerPage` 100 vs 200；`maxCharsPerLine` 非数字时落到 50 而非 0 |
| 3 | `bookFolder` 空时 config 回落扩展目录，开始阅读却报「请先选目录」 | `config.js` / `reading.js` | 设置页与命令行为分裂 |
| 4 | 「上一页」不是「下一页」的逆操作 | `bookReader.previousPage` | 翻页心智模型错乱 |
| 5 | 文档/版本漂移 | CHANGELOG 停在 0.1.9，README 示例仍写旧 vsix | 维护与安装混乱 |
| 6 | 「开始阅读」信息提示 | `bookReader.readTxt` | **反摸鱼**（右下角弹窗） |

### 明确不建议（YAGNI）

- 云同步书架、TTS、社交、MOBI 全家桶、做成独立阅读器窗口  
- 这些偏离「编辑器里隐蔽阅读」核心

---

## 文件地图（后续改动会碰到）

| 文件 | 职责 |
|------|------|
| `src/services/bookReader.js` | 加载 txt、分页、装饰、停止 |
| `src/services/epubReader.js` | EPUB→TXT |
| `src/services/progress.js` | 进度读写与百分比 |
| `src/config.js` | 设置缓存与变更通知 |
| `src/commands/reading.js` | 开始/停止/翻页命令 |
| `src/webview/index.html` + `handler.js` | 设置页 |
| `src/sidebar.js` | 活动栏快捷入口 |
| `src/utils/textWrap.js` / `editorFocus.js` | 折行与焦点 |
| `package.json` | 配置 schema、快捷键、版本 |
| `changelog.md` / `readme.md` | 发布说明 |

---

## Phase A — 正确性与工程卫生（P0）

**目标：** 不引入大功能，先让现有路径可靠、可维护。预计 0.5–1 天。

### A1. 修复 EPUB 转换竞态

**Files:** `src/services/epubReader.js`

- [ ] 将 `contents.forEach(async …)` 改为顺序 `for…of` + `await getEpubChapter`
- [ ] 单章失败：记录章节 id、可继续或整本失败（需明确一种策略，推荐整本失败并删半成品 txt）
- [ ] 手动测：一本多章 epub → 生成 txt 章节顺序与目录一致

### A2. 对齐配置默认值与空目录语义

**Files:** `src/config.js`, `src/commands/reading.js`, `package.json`（核对）

- [ ] `linesPerPage` 初始化与 schema 一致（200）
- [ ] `maxCharsPerLine`：仅当类型为 number 时使用；否则用 schema 默认 **0**（自动跟窗口）
- [ ] `bookFolder` 为空时不要静默用 `extensionPath`；统一「未设置」；`getBookFolderPath()` 与开始阅读共用同一校验

### A3. EPUB 缓存失效

**Files:** `src/services/epubReader.js`

- [ ] 若同名 txt 存在但 epub `mtime` 更新，则重建 txt（或提示用户）
- [ ] 避免永久读到过期转换结果

### A4. 文档与依赖清理

**Files:** `changelog.md`, `readme.md`, `package.json`

- [ ] CHANGELOG 补齐 0.2.0–0.2.4（手动进度、UI、静默重绘、Cursor 安装注意等）
- [ ] README 安装命令改为当前版本；注明需装到 **正在使用的 IDE**（Cursor vs Code）
- [ ] 移除未使用的 `epubjs` 依赖（源码未引用）

### A5. 最小单测骨架

**Files:** `test/` 或抽纯函数到可测模块

- [ ] 优先测：`normalizeBookPath`、`getProgressPercent` / `setProgressByPercent` 换算、`takePageContent`（若可抽离）
- [ ] 不追求全覆盖，挡住回归即可

**验收：** 新 epub 转换稳定；空目录行为一致；装扩展后 README/CHANGELOG 与版本一致。

---

## Phase B — 摸鱼体验（P0/P1）

**目标：** 更隐蔽、更稳、按键语义正确。预计 1–2 天。

### B1. 降低存在感

**Files:** `bookReader.js`, `package.json`（可选配置）

- [ ] 「开始阅读 / 已到书末」等 toast：默认关闭或改为 StatusBar 一瞬（可配置 `workchill.showToasts`）
- [ ] `stop()`：清理**所有可见**编辑器上的 decoration，不只 `activeTextEditor`
- [ ] `setContext('workchill.isReading', true/false)`；快捷键 `when` 加上该 context，未阅读时 PageUp/Down 不误触

### B2. 对称翻页

**Files:** `bookReader.js`

- [ ] 维护「页起点栈」：`nextPage` push 当前 `(line, offset)`，`previousPage` pop 恢复
- [ ] 栈空时再回退到「按字数倒退」作为兜底（或停在书首）
- [ ] 去掉未使用的 `pageEndLine`/`pageEndOffset` 死字段，或真正用于栈

### B3. 装饰锚点与布局刷新

**Files:** `bookReader.js`, `extension.js` 订阅

- [ ] 可选策略（二选一，实现前确认）：
  - **B3a（推荐）：** 锚定视口固定区域（如可见区底部 N 行），少随光标跳
  - **B3b：** 仍跟光标，但监听选区变化时重绘
- [ ] 监听窗口/编辑器布局变化（`onDidChangeTextEditorVisibleRanges` 或相关）触发静默重绘，resize 后折行仍准

### B4. 主题色自适应（可选）

**Files:** `config.js`, `bookReader.js`, 设置页

- [ ] 默认色跟 `editorGhostText.foreground` 或注释色；保留手动色覆盖

**验收：** 阅读中几乎无弹窗；上一页能回到上一屏内容；改窗口宽度后一页内折行正常。

---

## Phase C — 书库与设置 UX（P1）

**目标：** 少点击、信息更准。预计 1 天。

### C1. 侧边栏「最近一本书」

**Files:** `sidebar.js`, `progress.js`, `reading.js`

- [ ] 展示最近阅读书名 + 进度；一键继续
- [ ] 与设置页列表共用 `resolveBookProgress`

### C2. 进度百分比含 charOffset

**Files:** `progress.js`, 设置页展示

- [ ] 百分比按「已读字符 / 总字符」或「行内偏移加权」，与字数翻页模型一致
- [ ] 手动设百分比仍写 `charOffset = 0`（可接受），但展示要诚实

### C3. 设置页小改进

**Files:** `index.html`, `handler.js`

- [ ] EPUB 首次转换：StatusBar「正在转换 epub…」
- [ ] 目录选择入口在侧边栏也可达（或设置页更显眼）
- [ ] 保存设置：未改动的项不反复 `update`（减少配置事件）

### C4. 编码

**Files:** `bookReader.js`（或新 `encoding.js`）

- [ ] 探测 UTF-8 / GBK（国内 txt 常见）；失败时提示用户
- [ ] 不默认改写原文件，仅内存解码

**验收：** 侧边栏两步内续读；GBK 小说可打开；epub 转换有进度反馈。

---

## Phase D — 差异化摸鱼能力（P2，可选）

**目标：** 真正拉开与上游差距。每项单独评估后再开实现计划。

| 功能 | 价值 | 复杂度 | 说明 |
|------|------|--------|------|
| D1. Boss Key | 高 | 中 | 一键清除装饰 + 可选切走标签；快捷键可配 |
| D2. 注释伪装模式 | 很高 | 高 | 按语言用 `//` / `#` 风格渲染（仍是 decoration），更像代码 |
| D3. 大文件流式/分块 | 中 | 高 | 避免整本进内存；改进度模型 |
| D4. 章节目录（txt/epub） | 中 | 中 | 跳章；依赖稳定 epub 转换 |

**建议：** 先做 D1；D2 需单独设计稿（装饰 vs 虚拟文档）。

---

## 推荐执行顺序

```text
A（正确性） → B（摸鱼体验） → C（书库 UX） → D（可选增强）
```

| 版本建议 | 内容 |
|----------|------|
| **0.2.5** | Phase A |
| **0.3.0** | Phase B |
| **0.3.x** | Phase C 拆分小版本 |
| **0.4.0** | Phase D 中选定的一项（如 Boss Key） |

---

## 明确排除本路线图的范围

- 发布到 Marketplace（可另开「发布清单」）
- 重写为独立 App / Web 阅读器
- 多书并行多标签阅读会话

---

## 下一步（需你选）

请选择下一份**可执行实现计划**要覆盖的范围：

1. **只做 Phase A**（修 epub/配置/文档，最稳）
2. **A + B**（正确性 + 摸鱼体验，推荐）
3. **指定单项**（例如只要 Boss Key / 只要对称翻页 / 只要 GBK）

选定后，再按 `writing-plans` 拆成带 checkbox 的逐步实现计划并开工。
