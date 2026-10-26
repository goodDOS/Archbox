# 需求实现对照表

> 原始需求编号 0–7 → 实际实现位置（路径均为 `ArchiveStudio/` 相对路径）

## 0. 必须注册新用户，随机分配 ID，绑定本机物理地址（记录用户所有操作记录）

| 子需求       | 实现位置                        | 关键逻辑                                                                                                                               |
| ------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 必须注册     | `src/components/UserGate.vue`   | 首次启动 `listUsers()` 为空 → 强制进入「注册」模式；后续启动展示用户选择列表                                                           |
| 随机分配 ID  | `electron/db.js` → `createUser` | `uid()` 生成 `A` + 10 位 base36（剔除 0/O/1/I），撞库自动重生；存表 `users.id`                                                         |
| 绑定本机 MAC | `electron/main.js` → `getMac()` | 遍历 `os.networkInterfaces()` 取首个非内部、mac 非全 0；`createUser` 写入 `users.mac`                                                  |
| 登录校验     | `electron/db.js` → `login`      | `user.mac !== currentMac` 抛错（防止用户文件被复制到其它设备登录）                                                                     |
| 记录所有操作 | `electron/db.js` → `audit()`    | 所有 IPC 处理函数调用 `audit(userId, action, entity, entityId, detail)`；写入 `audit_log` 表（含 user_name 快照、JSON detail、时间戳） |

**审计已覆盖的动作**（节选）：注册 / 登录 / 新建/修改/删除 大区/分类/标签/字段/文档/便签/附件 / 合并文档 / 恢复历史版本 / 文档包导入/导出 / 备份数据库 / 迁移存储路径 / 修改设置 / 上传图片。

---

## 1. 类似 WordPress 新建文章：插入图片、插入段落；自定义字段；层级结构；聚合管理

| 子需求                                   | 实现位置                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 类似 WordPress 编辑器                    | `src/pages/PostView.vue`（Tiptap/ProseMirror + 自建工具栏，Beta.328 起按主流文字工具分组：撤销/重做/字号(显当前值+自定义)/粗体/斜体/下划线/删除线/上下标/文字色/高亮/H1/H2/段落/列表/引用/代码块/分隔线/对齐/emoji/图片/清格式；**已移除行内代码按钮与插入链接（schema 层 link:false）**） |
| 插入图片                                 | `src/pages/PostView.vue::insertImage` → `arch.imgUpload()` → `dialog.showOpenDialog` → base64 内联（Beta.90 起不再落 attachments/）→ `editor.chain().insertContent({ type: 'image' })`                                                                                                     |
| 插入段落                                 | 工具栏「¶ 段落」按钮（`editor.chain().focus().splitBlock()`，Beta.315 起取代 `document.execCommand('insertParagraph')`）                                                                                                                                                                   |
| 自定义字段（名称 / 数据类型 / 字母代码） | `src/pages/Taxonomy.vue` 第四个 Tab + `electron/db.js` `saveFieldDef`（类型白名单：`text/textarea/number/date/select/url`；代码正则 `/^[A-Za-z][A-Za-z0-9_]{0,19}$/`）                                                                                                                     |
| 大区 → 分类 → 标签层级                   | `regions` / `categories`（外键 region_id）/ `tags`（多对多 via `post_tags`）                                                                                                                                                                                                               |
| 单独的聚合管理页面                       | `src/pages/Taxonomy.vue`（4 个 Tab：大区/分类/标签/自定义字段，每 Tab 一个 CRUD 表格 + 新建/编辑弹窗）                                                                                                                                                                                     |

---

## 2. 搜索高亮、文档包导入导出、字段查重、数据库单独储存、历史版本

| 子需求               | 实现位置                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 搜索高亮             | `src/utils/highlight.js`（**先转义再包裹 `<mark>`，防 XSS**） + `SearchPage.vue`                                               |
| 按日期筛选           | `SearchPage.vue`「日期范围」双日期选择；`db.buildWhere` → `date(p.created_at) BETWEEN ? AND ?`                                 |
| 按字段筛选           | `SearchPage.vue`「字段」下拉 + 字段值包含输入；`db.buildWhere` → EXISTS 子查询                                                 |
| 文档包导入导出       | `electron/services/archpack.js` + `src/components/ImportWizard.vue`（三步：选文件 → 字段策略 → 进度与结果）                    |
| 字段查重（询问合并） | `electron/db.js` `checkDuplicates` + `mergePost` + `src/components/MergeDialog.vue`（支持「合并 / 另存为新文档 / 取消」）      |
| 数据库单独储存       | `electron/main.js` `readDataDir` / `writeDataDir`（指针文件 `storage.json`），可在「设置」中一键切换路径并自动迁移             |
| 预留云端接口         | `electron/services/cloud.js` `CloudAdapter`（push/pull/test 全部 async，返回 `{ok:false, reserved:true, message}`）            |
| 异步处理             | 主进程所有 IO 走 `async/await`；导入通过 `webContents.send('task:progress')` 推送百分比；写入用 500ms 防抖                     |
| 历史操作记录         | `audit_log`（见 #0）；设置页提供查询界面（`SettingsPage.vue`「操作日志」Tab）                                                  |
| 历史数据版本         | `post_versions` 表（每次保存前快照 `JSON.stringify({title, fields, tags, html})`）+ `PostView.vue` 侧栏版本列表 + 「恢复」按钮 |

---

## 3. 内容同页编辑模式；大区字段统计；首页便签板/新建大区/统计

| 子需求           | 实现位置                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同页编辑模式     | `src/pages/PostView.vue` —— `editing` 标志在 `view` / `edit` 两种模板间切换（无路由跳转），保存/取消回到查看态                                                             |
| 编辑态页头按钮   | 页内搜索（Beta.329：在正在编辑的标题/字段/正文查找，复用 `findOpen` + `utils/editFind.js` 混合引擎）与预览（渲染 `contentHtml` 实时内容的只读弹层，净化链路与查看态同源）  |
| 大区字段数据统计 | `src/pages/RegionView.vue` 顶部「字段数据统计」卡片网格：每个字段展示 已填数 / 去重值数 / 数值字段的 min/max/avg/sum / 单选与文本的 Top 值；外加「分类分布」与「高频标签」 |
| 首页便签板       | `src/pages/Home.vue` 右下「便签板」卡片网格，6 种颜色，支持内联编辑（textarea 失焦自动保存）、换色、删除                                                                   |
| 首页新建大区按钮 | `Home.vue` 顶部右侧 `+ 新建大区` 按钮 + `src/components/RegionModal.vue`                                                                                                   |
| 首页数据统计     | `Home.vue` 顶部 8 张统计卡片（文档总数/大区/分类/标签/自定义字段/便签/注册用户/今日新增）+ 近 7 日录入柱状图 + 最近文档列表                                                |

---

## 4. （需求项空缺）

未提供需求描述，跳过。

---

## 5. 全方位代码安全

详见 [`SECURITY.md`](./SECURITY.md)。要点：

- `contextIsolation + sandbox + nodeIntegration: false`
- 自定义协议 `archimg://` 仅放行附件 ID；handler 内 `path.basename` + `startsWith` 双重防穿越
- 全部 SQL 走参数化；保存/渲染双层 XSS 净化（`sanitize-html` + `DOMPurify`）
- CSP meta 仅允许 `'self'` 资源，`archimg:` 显式放行
- 拦截 `window.open` / `will-navigate` 跳转到非白名单 URL
- 所有设置走白名单 key 校验
- 登录态与 MAC 绑定
- 全量操作进入 `audit_log`
- **数据库透明加密**（`electron/services/crypto.js`）：AES-256-GCM + scrypt 口令派生 + DPAPI 记住口令，替代 SQLCipher；锁定状态机守卫未解锁期间的一切业务 IPC
- **发布加固**（`scripts/afterPack.js`）：Electron Fuses 熔断 `RunAsNode` / `NODE_OPTIONS` / `--inspect`，防运行时 Node 注入；签名路线见 [`CODE-SIGNING.md`](./CODE-SIGNING.md)

---

## 6. 三种配色主题

| 主题                 | 实现                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 商务明亮             | `[data-theme='light']` 默认；白底、蓝色高亮 `#3b6df0`、圆角 12px                                                  |
| 商务暗黑             | `[data-theme='dark']`；深色面板 `#181b21`、柔和高亮 `#6c93ff`                                                     |
| 黑白线框（打印友好） | `[data-theme='wire']`；纯黑/白、边框 1.2px、阴影 none、按钮透明、`<img>` 转灰度、附 `@media print` 隐藏所有交互件 |
| 切换入口             | 标题栏"主题"按钮（循环切换）+「设置 → 外观主题」卡片选择                                                          |

---

## 7. 全局性设置集合在顶部设置按钮里；关于页面含资源/作者/工具/版本

| 子需求       | 实现位置                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 顶部设置按钮 | `src/components/TitleBar.vue` 齿轮按钮 → `goto('settings')`                                                                                                          |
| 设置页导航   | `src/pages/SettingsPage.vue` 左侧导航：外观主题 / 数据与存储 / 云端同步（预留）/ 文档包导入导出 / 操作日志 / 账户                                                    |
| 关于页       | `src/pages/AboutPage.vue`：作者、运行环境版本（Electron/Chromium/Node/Vue/应用 v0.1.0-test）、软件引用资源表格（开源组件 + 用途 + 许可证）、辅助工具、数据与隐私说明 |

---

## 附：自动数据校验

- 字段代码（字母代码）：`/^[A-Za-z][A-Za-z0-9_]{0,19}$/`，唯一性约束
- 用户名：1–30 字
- 标题：1–200 字
- 标签：≤ 20 字，每文档 ≤ 20 个
- 字段值：≤ 5000 字
- 图片：≤ 20MB，扩展名白名单（png/jpg/jpeg/gif/webp/bmp/svg）
- 必填字段：保存时前端校验 + 后端校验
- 删除保护：含文档的大区/分类、有引用的字段/标签禁止删除（带原因提示）
