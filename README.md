# 文档盒 Archbox

> 单机文档管理软件（Windows 桌面端）· `0.9.0-Beta.324`
>
> Electron 30 + Vue 3 · 大区/分类两级归档 · 全局标签 · 自定义字段 · 富文本编辑 · 文档包导入导出 · 全文搜索 · 版本历史 · 回收站 · 操作审计链 · AES-256-GCM 透明加密 · 局域只读共享 · 8 套主题 · 12 种语言

**数据全部存在本机，不联网、不上传、不依赖任何服务端。**

公开源码仓库：<https://github.com/goodDOS/Archbox>（只含源文件，开发中改动先落本仓库）

---

## 目录

- [这是什么](#这是什么)
- [功能](#功能)
- [快速开始](#快速开始)
- [技术选型](#技术选型)
- [项目结构](#项目结构)
- [数据与安全](#数据与安全)
- [开发](#开发)
- [打包与产物](#打包与产物)
- [交付流程](#交付流程)
- [文档](#文档)
- [常见问题](#常见问题)
- [许可](#许可)

---

## 这是什么

一个给个人或小团队用的**本地文档库**。

文档按「**大区 → 分类 → 标签**」组织：大区是最大的归属（比如「产品资料」），分类是大区下的细分（比如「需求文档」），标签可以横跨所有大区（比如「待评审」）。每个大区可挂自己的**自定义字段**，字段既能用来填表，也能用来筛选和查重。

编辑体验参照 WordPress：标题下就是正文，工具栏在顶部，写完直接保存，不需要「打开文件 → 另存为」。

**适合**：个人资料归档、小团队内部文档、需要离线保存的敏感资料。
**不适合**：多人实时协作（无服务端，局域共享是**只读**的）、海量文件管理。

---

## 功能

### 组织与检索

| 功能        | 说明                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 大区 / 分类 | 两级归属。大区可自定义**名称、编码与配色**（不支持自定义图标）                                                                                                |
| 全局标签    | 跨大区通用，提供标签云，可按标签筛选                                                                                                                          |
| 自定义字段  | 每个大区可挂自己的字段定义，**6 种类型**：`text` 单行、`textarea` 多行、`number` 数字、`date` 日期、`select` 下拉、`url` 链接；支持「必填」与「唯一（查重）」 |
| 全文搜索    | 覆盖标题、正文纯文本层、自定义字段值、作者名，子串匹配（`LIKE`），可按日期区间 / 大区 / 分类 / 标签 / 字段 / 作者 / 来源组合筛选；选完筛选项即自动加载        |
| 版本历史    | 每次保存留快照，可查看任一版本并回滚                                                                                                                          |
| 回收站      | 删除为软删除（`deleted_at` 标记），可还原                                                                                                                     |

### 编辑

- 富文本编辑器（Tiptap 3 / ProseMirror），工具栏按主流文字工具（Word / WPS）分组排列：撤销 / 重做、字号（显示当前字号、可自定义像素值）、加粗、斜体、下划线、删除线、上下标、文字颜色、背景高亮、标题层级、段落、有序 / 无序列表、引用、代码块、水平线、对齐方式、插入表情符号 / 图片、清除格式。**不支持插入链接**（Beta.328 起从 schema 层移除）
- **图片以 base64 直接内联进正文**，不产生散落附件，导出与备份时图片随内容一起走
- 同页编辑：查看与编辑在同一页面切换，不弹新窗口
- 草稿箱与模板：未写完的可存草稿，常用结构可存模板；两者都收在「另存为」下拉里，主按钮仍是「保存」
- 编辑态页头：**页内搜索**按钮（在正在编辑的标题 / 字段 / 正文里查找高亮，与 `Ctrl+F` 同一能力）与**预览**按钮（保存前查看当前编辑内容的渲染效果，所见即所存；Beta.329 起）
- 编辑页内可快捷新建大区 / 分类 / 字段，不需要离开当前文档
- 多语言下 RTL（阿拉伯语）只让文字方向从右到左，**布局骨架不镜像**

### 数据进出

- **文档包**（`.archboxpack`）：自描述导入导出格式（v3），含图片与字段，用于整批迁移
- 导入字段查重合并向导：三步走完「选文件 → 字段策略 → 进度与结果」
- 导出为 Markdown / PDF，或导出文档包
- 数据库整库备份与恢复（zip）
- 数据库存储路径可自定义并一键迁移，原目录保留作备份

### 安全

- **AES-256-GCM 数据库透明加密**：启用后整个库文件为密文，口令经 scrypt 派生密钥，**口令不落盘**
- L1 + L2 双层完整性校验：`archive.db.sig` 记录 SHA-256 与 Ed25519 签名，附 CRC32
- 用户注册随机分配 ID，绑定本机物理地址（MAC），换机器无法登录
- 每次启动必须登录；多用户时进入用户选择页，不自动预选
- **操作审计**：所有操作留痕，记录以 SHA-256 哈希链串联（`prev_hash` + `self_hash`）
- 防程序篡改三层：asar 头哈希 + unpacked 文件签名清单 + Electron Fuses 熔断

### 局域网共享

- 同网段内可开启**只读**共享：其他设备用浏览器访问，浏览共享副本库
- 共享服务只连 `share.db` **副本库**，绝不连主库 `archive.db`，也不暴露用户表与密码
- 唯一写入口是 `POST /api/copy-report`（上报访问情况）
- 关闭共享后立即清空共享状态与已拉取的共享数据

### 外观

- **8 套主题**：`light` 商务明亮、`dark` 商务暗黑、`wire` 黑白线框、`cs16` CS1.6、`bamboo` 竹青、`sandalwood` 檀褐、`sky` 青空、`halflife` 半条命
- **12 种语言**：简体中文、繁體中文、English、日本語、한국어、Русский、Français、Deutsch、Íslenska、العربية（RTL）、Italiano、Español
  - 12 门语言均为全量翻译（16 域、约 1400 条词条，逐域键集与中文一致），由 `npm run test:standardize` 强制
- 无边框自绘窗口，托盘常驻，关闭窗口不退出程序（单实例锁，禁止重复启动）

---

## 快速开始

### 环境要求

- Node.js ≥ 18（推荐 LTS）
- npm ≥ 9
- Windows 10/11（64 位）—— 唯一正式目标平台
- macOS / Linux 仅供开发调试

### 安装与启动

```bash
npm install
npm run dev        # 开发模式（Vite 热更新 + Electron）
```

国内网络若 Electron 二进制下载失败：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
```

首次启动没有账号，进入注册流程创建本地用户；想先看效果可用 `npm run seed` 灌演示数据。

### 全部脚本

| 命令                       | 实际作用                                                        |
| -------------------------- | --------------------------------------------------------------- |
| `npm run dev`              | 开发模式：并行起 Vite 与 Electron，热更新                       |
| `npm run start`            | 直接 `electron .` 启动（**不构建**，需 `dist/` 已存在）         |
| `npm run build`            | 只构建渲染层到 `dist/`（含 `index.html` 源模板校验）            |
| `npm run seed`             | 灌入演示数据（`electron . --seed`）                             |
| `npm run shot`             | 截图模式（`electron . --shot`）                                 |
| `npm run lint`             | ESLint，要求 0 warning                                          |
| `npm test`                 | 编排执行全部契约测试（当前 24 条）                              |
| `npm run test:standardize` | 只跑规范与契约测试（i18n 同步、繁体字形、图标、无障碍、主题）   |
| `npm run format`           | Prettier 格式化全仓                                             |
| `npm run format:check`     | 只检查格式，不改文件                                            |
| `npm run pack`             | 打包为 Windows 免安装 zip，**版本号自动递增**，并复制进产物空间 |
| `npm run dist`             | 构建 + `electron-builder --win` 打 NSIS 安装包                  |

---

## 技术选型

| 维度     | 选择                                                   | 理由                                                 |
| -------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 桌面壳   | **Electron 30**                                        | 无边框窗口、托盘、单实例锁、Fuses 熔断体系成熟       |
| 渲染框架 | **Vue 3 + Vite 5**                                     | Composition API 便于复杂页；Vite 启动快、HMR 即时    |
| 数据层   | **sql.js（SQLite WASM）**                              | **零原生编译依赖**；单文件数据库天然满足「独立存储」 |
| 富文本   | **Tiptap 3（ProseMirror）+ sanitize-html + DOMPurify** | headless 内核 + 自建工具栏；保存与渲染双重 XSS 净化  |
| 样式     | **原生 CSS + 主题变量**                                | 8 套主题通过 `[data-theme]` 切换；不引入 UI 框架     |
| 图标     | **Ant Design Icons + Lucide（静态提取）**              | 按语义匹配选型；运行时零依赖、离线可用               |

### 为什么是 sql.js 而不是 better-sqlite3

`better-sqlite3` 需要 node-gyp 与 Visual Studio Build Tools 在用户机器上原生编译——对交付给非开发者的桌面软件是不可接受的环境门槛。

`sql.js` 是 SQLite 的 WASM 编译版，纯 JS 加载。通过 `db.export() → fs.writeFile` 实现单文件数据库。

代价是加密需在 WASM 之外自行实现（用 Node 的 `crypto` 做 AES-256-GCM 包裹整个库文件），而不依赖 SQLCipher。

---

## 项目结构

```
ArchiveStudio/
├── electron/                    主进程
│   ├── main.js                  应用生命周期入口
│   ├── window.js                窗口创建、无边框、托盘窗口、CSP
│   ├── preload.js               contextBridge 白名单（渲染层唯一出入口）
│   ├── ipc.js / ipc/<域>.js     IPC 通道注册，按业务域拆分（20 个域文件）
│   ├── db.js / db/              数据表与业务方法
│   ├── keystore.js              数据目录指针与切换（reloadDataDir 唯一入口）
│   ├── services/                主进程能力：加密、文档包、局域共享、日志、时间格式…（25 个模块）
│   └── verify/                  静态契约测试（不启 Electron，读源码断言）
│
├── src/                         渲染进程
│   ├── api.js                   IPC 封装
│   ├── feedback.js              Toast / 错误文案 / 异步任务包装（run）
│   ├── pages/                   页面级组件（12 个，含托盘菜单）
│   ├── components/              可复用 UI（含 settings / post / taxonomy / home 子目录）
│   ├── composables/             可复用逻辑（useRefresh / useConfirm / useExports…）
│   ├── store.js + store/        状态与状态模块
│   ├── i18n/parts/              12 种语言 × 16 个域 = 192 个词典文件
│   └── styles/                  base.css（布局与组件）/ themes.css（8 套配色）
│
├── scripts/                     构建、生成、校验脚本
├── docs/                        设计文档
├── 验收清单-Beta.<N>.md         每版交付验收清单（内部，不入公开仓库）
├── AGENTS.md                    给 AI 编码助手的项目上下文
└── README.md                    本文件
```

---

## 数据与安全

### 数据存在哪

| 项         | 位置                                                    |
| ---------- | ------------------------------------------------------- |
| 数据目录   | `%APPDATA%\archbox\data\`（可在设置中自定义并一键迁移） |
| 数据库     | `archive.db`（SQLite 单文件；启用加密后为密文）         |
| 完整性签名 | `archive.db.sig`（L1 SHA-256 + L2 Ed25519 + CRC32）     |
| 目录指针   | `%APPDATA%\archbox\storage.json`                        |
| 密钥文件   | `enc.key`（「记住口令」时由 safeStorage 包裹）          |
| 日志       | 与数据目录**同级**的 `logs/`，不是数据目录内部          |

### 加密

- 算法：**AES-256-GCM**，文件格式 `ARCHENC1` + salt + iv + tag + 密文
- 密钥派生：**scrypt**（N=16384, r=8, p=1），口令不落盘
- 「记住口令」由 Windows DPAPI（Electron `safeStorage`）包裹，绑定当前 Windows 账户，拷走 keyfile 无法解密
- **口令遗失不可恢复**——这是加密的设计前提

### 进程与代码安全

| 维度       | 实现                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 进程隔离   | `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`                           |
| 导航拦截   | `setWindowOpenHandler` 一律 deny；`will-navigate` 仅允许 dev 服务器与本应用 origin              |
| CSP        | 主窗口 `default-src 'self' file: data: blob:`；仅允许图片来源 data/blob（正文图片 base64 内联） |
| XSS        | 保存时主进程 `sanitize-html` 白名单；渲染层 `v-html` 前 DOMPurify 二次净化                      |
| SQL 注入   | 全部参数化查询，无字符串拼接                                                                    |
| 路径穿越   | 附件与图片只走自增 ID / data URL；读取前 `path.basename` + `startsWith` 双重校验                |
| 审计防篡改 | 每条记录含 `prev_hash` + `self_hash` 构成 SHA-256 哈希链，启动自动校验                          |
| 防程序篡改 | asar 头哈希 + unpacked 文件签名清单 + Fuses 熔断（`scripts/afterPack.js`）                      |

详见 [docs/SECURITY.md](./docs/SECURITY.md)。

---

## 开发

### 校验

```bash
npm run lint      # ESLint，要求 0 warning
npm test          # 编排执行契约测试
npm run build     # 构建
```

`npm test` 由 `scripts/run-tests.mjs` 编排，**不启动 Electron**，直接读源码做断言，秒级完成。守的是那些「界面上看不出来、但坏了会出事」的东西：

- i18n 各语言词条集合与中文一致、繁体逐字转字形、不允许空值
- 图标不得手写 SVG、不得两个图标撞同一份路径数据
- 纯图标按钮必须有 `aria-label` 与 `title`
- 编辑器命令必须走 `chainRun`（不能交给 `feedback.run`）
- 编辑态与查看态的块级元素样式必须同值
- 打包产物必须复制一份进产物空间、版本号必须递增

### 修改图标

图标不是手写的，也不是运行时引用的库，而是由脚本从两个开源图标库**静态提取**成数据文件。

```bash
# 1. 改 scripts/gen-icons.mjs 顶部的 ICONS 表（图标名 → [库, 图标名]）
# 2. 重新生成
node scripts/gen-icons.mjs
```

- **不要**直接编辑 `src/components/icon-antd.js`（自动生成）
- **不要**在 `.vue` 里内联 `<svg>` 图标
- 两库都没有精确匹配时才进 `CUSTOM` 表，且必须写 `why`——脚本强制校验

### 增加语言

1. 在 `src/i18n/parts/` 下为 16 个域各补一个该语言的 `.js`
2. 在 `src/i18n/index.js` 的 `LANGS` 注册语言代码
3. 纯 RTL 语言**不要**设 `<html dir="rtl">`，改用 `data-text-dir`，见 [AGENTS.md](./AGENTS.md)

---

## 打包与产物

`npm run pack`（`scripts/build-win-unpacked.mjs`）会：

1. 自动把版本号从 `0.9.0-Beta.N` 递增为 `Beta.N+1`（`package.json`、asar 内 `package.json`、界面版本号三者同源）
2. 构建并打包为免安装 zip：`文档盒-win-unpacked-<版本>.zip`
3. 校验 zip 内 `app.asar` 与 `win-unpacked` 一致
4. **把当次 zip 复制一份进产物空间**（项目根的上一级目录，即仓库目录的父目录）

产物空间例（假设仓库 clone 在 `~/dev/ArchiveStudio`）：

```
~/dev/文档盒-win-unpacked-0.9.0-Beta.319.zip
~/dev/下载卡片-Beta.319.html
```

> 下载卡片用相对链接引用同目录 zip，**必须与 zip 同处产物空间**，否则会出现「卡片在、点下载 404」。
> 这条约定由 `electron/verify/pack-dist-space.test.mjs` 自动校验，接入 `npm test`。

---

## 交付流程

本仓库的交付约定（长期有效）：

| #   | 约定                                                                        |
| --- | --------------------------------------------------------------------------- |
| 1   | **只在用户说「打包」时才打包**，改完代码最多报告 lint / test / build 结果   |
| 2   | 每次打包**必须递增版本号**，由脚本自动完成，不手改                          |
| 3   | 每次功能交付生成 `验收清单-Beta.<N>.md`，含改动点、逐条「怎么验」、已知限制 |
| 4   | 不做主动实机验证，以静态校验为准，实机验证交给用户                          |
| 5   | 不改测试断言样板，测试红先判断是业务 bug 还是脚本问题                       |
| 6   | 不为旧数据背包袱，结构调整不写迁移兼容层                                    |
| 7   | 打包产物自动复制一份进产物空间                                              |

---

## 文档

| 文件                                                           | 内容                                         |
| -------------------------------------------------------------- | -------------------------------------------- |
| [AGENTS.md](./AGENTS.md)                                       | 给 AI 的项目上下文：分层、硬规矩、踩过的坑   |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                           | 如何贡献、AI 协作方式、PR 要求               |
| [docs/SECURITY.md](./docs/SECURITY.md)                         | 安全设计细节：加密、审计链、进程隔离、防篡改 |
| [docs/REQUIREMENTS-MAPPING.md](./docs/REQUIREMENTS-MAPPING.md) | 需求逐条实现对照                             |
| [docs/CLOUD-API.md](./docs/CLOUD-API.md)                       | 云端接口预留规格                             |
| [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md)                 | Windows 代码签名三条路线                     |

---

## 常见问题

**Q：首次启动打不开？**
A：检查 `node_modules` 是否完整。走 `npm run start` 前需先 `npm run build` 生成 `dist/`。

**Q：SmartScreen 警告 / 杀软误报？**
A：分发包未携带代码签名证书，首次运行弹「未知发布者」属正常。详见 [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md)。

**Q：数据库真的加密了吗？**
A：需在设置中主动启用。启用后整个库文件为 AES-256-GCM 密文，口令遗失无法恢复。

**Q：能多人同时编辑吗？**
A：不能。局域共享是**只读**的，读的也是副本库 `share.db`。

**Q：搜索是全文索引吗？**
A：不是 FTS5 倒排索引，是对「标题 + 正文纯文本层 + 字段值 + 作者名」做 `LIKE` 子串匹配。几万条量级流畅。

**Q：数据能导出迁移吗？**
A：能。导出为 `.archboxpack`（含图片与字段）、Markdown、PDF，或在设置里整库备份。

---

## 许可

本项目源码遵循 [CC BY-NC-SA 4.0](./LICENSE)：署名、非商业、相同方式共享。

内置图标来自 [Ant Design Icons](https://github.com/ant-design/ant-design-icons)（MIT）与 [Lucide](https://github.com/lucide-icons/lucide)（ISC）。

Copyright (c) 2026 文档盒项目组
