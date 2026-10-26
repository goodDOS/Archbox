# AGENTS.md — 给 AI 编码助手的项目上下文

> 本文件面向 ChatGPT / Claude / Cursor / Copilot / CodeBuddy 等 AI 编码助手。
> 人类贡献者请先读 [README.md](./README.md) 和 [CONTRIBUTING.md](./CONTRIBUTING.md)。
>
> **读这一份就够了。** 里面写了项目怎么分层、代码必须放哪、哪些坑踩过、改完怎么验。
> 不按这里的方式改，代码会在 `npm test` 里直接报红。

---

## 1. 这是什么项目

**文档盒 Archbox** —— 单机运行的 Windows 桌面文档管理软件。Electron + Vue 3，数据存本机 SQLite，不联网、不依赖服务端。

核心特征：无边框自绘窗口、类 WordPress 的文档录入体验、大区/分类两级归档 + 全局标签、富文本编辑、文档包导入导出、全文搜索、版本历史、操作审计、AES-256-GCM 数据库透明加密、8 套主题、12 种语言（16 域全量翻译）。

**技术栈固定，不要自行替换**：

| 层       | 选型                                      | 为什么不能换                                                                    |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| 桌面壳   | Electron 30                               | 无边框窗口、托盘、单实例锁、Fuses 熔断都已按它实现                              |
| 渲染框架 | Vue 3 + Vite 5                            | 全站 Composition API + `<script setup>`                                         |
| 数据层   | **sql.js（SQLite WASM）**                 | 零原生编译。换成 better-sqlite3 会让用户机器需要 VS Build Tools，产品级不可接受 |
| 富文本   | Tiptap / ProseMirror                      | 命令链、扩展注册都已按它写                                                      |
| 样式     | 原生 CSS + 主题变量                       | 不引入 UI 框架（会破坏 8 套主题的一致性）                                       |
| 图标     | `src/components/icon-antd.js`（静态数据） | 见 §4.5，**禁止手写 SVG**                                                       |

---

## 2. 跑起来

```bash
npm install          # 国内网络若 Electron 下载失败：set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev          # 开发模式（Vite HMR + Electron）
npm run start        # 生产模式（先 build 再启动）
npm run seed         # 灌演示数据
```

**改完代码必须自己跑**：

```bash
npm run lint      # 必须 0 warning
npm test          # 必须全绿
npm run build     # 必须通过
npm run format    # 提交前格式化
```

> **本仓库是内部开发仓库**，与公开仓库 `github.com/goodDOS/Archbox` 分离：
> 内部仓库可以有 `seed-data/`、`seed-verify/`、`验收清单-Beta.*.md`、`.codebuddy/`、构建产物；
> 但把它们推到公开仓库之前必须先剔除 —— 公开仓库有 `npm run guard:public` 拦截，
> 内部仓库没有这个脚本。往公开仓库同步时见 `docs/` 与公开仓库的 CONTRIBUTING。

`npm test` 跑的是 `scripts/run-tests.mjs` 编排的一批静态契约测试（`electron/verify/*.test.mjs`）。它们不启 Electron，直接读源码做断言，秒级完成。

---

## 3. 目录分层（新代码必须放对层）

```
electron/                  主进程
├── main.js                入口：应用生命周期
├── window.js              窗口创建、无边框、托盘窗口
├── preload.js             contextBridge 白名单（渲染层只能用这里暴露的 API）
├── ipc.js                 IPC 注册聚合
├── ipc/<域>.js            每个业务域一个文件：posts / taxonomy / storage / settings …
├── db.js                  数据层聚合
├── db/                    表与业务方法（users / posts / audit …）
├── keystore.js            数据目录指针 + 切换（唯一入口 reloadDataDir）
├── services/<域>.js       主进程能力（crypto / archpack / lan-share / logger …）
└── verify/*.test.mjs      静态契约测试

src/                       渲染进程
├── api.js                 IPC 封装（所有跨进程调用走这里）
├── feedback.js            toast / 确认 / 异步任务包装（run）
├── pages/                 页面级（PostView / SettingsPage / Home …）
├── components/            可复用 UI 组件
│   ├── settings/          设置页各分区
│   ├── post/              编辑器工具栏、扩展
│   ├── taxonomy/          大区/分类/标签/字段
│   └── home/              首页卡片
├── composables/           可复用逻辑（useRefresh / useConfirm / useExports …）
├── store/modules/         状态模块（state / theme / nav / auth …）
├── i18n/parts/            词典，每种语言每种域一个文件
└── styles/                base.css（组件与布局）/ themes.css（8 套配色）
```

**判断落点**：

- 主进程能力 → `electron/services/<域>.js`，IPC 通道另在 `electron/ipc/<域>.js` 注册
- 可复用前端逻辑 → `src/composables/use<X>.js`
- 可复用前端 UI → `src/components/<X>.vue`
- 只服务单个页面的 → 留在该页面文件里，不要为了「看起来整洁」硬抽

---

## 4. 六个必须遵守的硬规矩

违反这些会直接让 `npm test` 报红。**先看这里再动手。**

### 4.1 先查重，再写

写任何函数／组件／IPC 通道前，先全仓 grep 同名或近义实现。已有等价实现就复用，**不要另写一份**。

同一逻辑出现在 ≥2 处 → 抽成单一来源，并把旧副本**真删掉**（不留「暂时保留」）。

### 4.2 已封装的入口不得绕过

| 领域           | 唯一入口                                                               |
| -------------- | ---------------------------------------------------------------------- |
| 文件选择弹窗   | `electron/services/dialog.js`（`pickFile / pickDirectory / saveFile`） |
| 时间格式化     | `electron/services/timefmt.js`                                         |
| 日志           | `electron/services/logger.js`                                          |
| 数据目录切换   | `electron/keystore.js` 的 `reloadDataDir`                              |
| 前端刷新反馈   | `src/composables/useRefresh.js`                                        |
| 确认弹窗       | `src/composables/useConfirm.js`                                        |
| 导出动作       | `src/composables/useExports.js`                                        |
| 主进程错误返回 | `{ ok: true, data }` / `{ ok: false, error }`                          |

❌ 不要在业务模块里直接调 `dialog.showOpenDialog`、`window.confirm`、`toLocaleString`。

### 4.3 破坏性操作必须验密码

删除任何实体（文档、分类、大区、草稿、模板、用户、备份）都走统一的验密组件，不各写一套。

### 4.4 用户输入必须转义；SQL 必须参数绑定

- 渲染层 `v-html` 前用 DOMPurify 二次净化；保存时主进程用 `sanitize-html` 白名单再洗一遍。
- SQL 一律 `stmt.bind(params)`，**禁止字符串拼接 SQL**。

### 4.5 图标只用图标库，禁止手写 SVG

图标数据在 `src/components/icon-antd.js`，由 `scripts/gen-icons.mjs` 从两个开源库（Ant Design / Lucide）静态提取。

```bash
# 加一个图标：改 scripts/gen-icons.mjs 顶部的 ICONS 表，然后
node scripts/gen-icons.mjs
```

选型标准是**语义匹配**，不是固定用某一家。确实两库都没有时才进 `CUSTOM` 表手绘，且必须写 `why` 说明理由——脚本会强制校验。

**不要**直接编辑 `icon-antd.js`（自动生成）；**不要**在 `.vue` 里内联 `<svg>` 图标。

### 4.6 UI 与主题：只改色，不改结构

- 新主题只定义配色变量，**不得**改动布局、圆角、尺寸。
- 所有原生控件（下拉、复选、单选、滑杆、日历、滚动条）都必须随主题配色，不允许残留默认蓝。
- 页面边距、字体、卡片间隔、按钮尺寸走共享变量／类，不各页面硬编码。
- **按钮不做按下缩放动画**（明确否掉），保留 hover 变色反馈。
- 弹窗关闭必须有退场动画（先播完再兑现 Promise，不可瞬间卸载）。

---

## 5. 踩过的坑（改相关代码前必读）

这些都是真实发生过的 bug，测试里已有断言守着。

### 5.1 编辑器命令链不能交给 `feedback.run`

`src/pages/PostView.vue` 里有两个「run」：

- `feedback.js` 的 `run(fn)` —— **异步任务包装器**，负责 busy 态与错误提示，内部 `await fn()`
- `chainRun` —— **编辑器命令链**执行器

把 `c => c.setTextAlign(v)` 交给前者，`c` 会是 `undefined`，报 `Cannot read properties of undefined`。
编辑器格式命令**一律用 `chainRun`**。

### 5.2 RTL 语言不能让骨架镜像

阿拉伯语是 RTL，但**不能**给 `<html>` 设 `dir="rtl"` —— 那会把整棵布局树翻转（侧边栏跑到右边、关闭按钮跳到右上角、滚动条翻到左边）。

正确做法（已实现）：`<html>` 恒为 `ltr`，语言方向写到 `data-text-dir`，`base.css` 里只让「读的文字」（段落、标题、表格单元格、输入框）按 RTL 排，用 `unicode-bidi: plaintext` 保证混排的英文与数字各自正确。

### 5.3 编辑态与查看态样式必须同值

`.post-content`（查看态）和 `.editor-area`（编辑态）是两套容器。**查看态有的块级元素样式，编辑态也必须有一份，且数值相同**——否则发布出去排版会变。

已有先例：`ul/ol` 的 `padding-left` 两边都是 24px，改一边必须同步另一边。

### 5.4 生成脚本的字段名容易写错且静默失败

Ant Design 图标子元素的标签字段是 `c.tag`，**不是** `c.tagName`。写错不会报错，但产物会变成 `<undefined>`，界面上所有图标空白。

`scripts/gen-icons.mjs` 已加断言，拿不到 `tag` 直接抛错。

### 5.5 别用 prettier 格式化数据文件后再改断言

`icon-antd.js` 被 prettier 重排后，键的引号形式会变（`"copy"` → `copy`）。测试断言若是**匹配源码文本**，会一阵红一阵绿。

正确做法：断言直接 `import` 数据模块，断键存在性，不看文本形态。

### 5.6 文案在使用时求值

i18n 文案**不要**在模块加载时固化（`const T = t('x')` 在顶层），否则切语言后仍显示旧文案。在模板里或用 `computed` 求值。

---

## 6. 国际化

- 12 种语言：`zh-CN` `zh-TW` `en` `ja` `ko` `ru` `fr` `de` `is` `ar` `it` `es`
- 词典在 `src/i18n/parts/<域>.<lang>.js`，16 域 × 12 语。
  - **加词条必须 12 门语言同步**，键集与 `zh-CN` 完全一致，缺一个就露 raw key（`standardize.test.mjs` 逐域报红）。
  - `t()` 仍有回退链（本语言 → `zh-CN` → key 本身），但那是兜底：真回退到中文说明漏了键，门禁会先失败。
  - 新增语言若要分阶段落地，在 `standardize.test.mjs` 的 `PARTIAL_LANGS` 里临时登记 —— 该集合当前为空，登记项只校验「无多余键」，空值禁令仍然生效。
- 空值不允许（`key: ''`）—— 那会显示空白而不是退化中文，比缺键更糟。
- 产品名「文档盒 Archbox」是常量，**不翻译**。语言选项用各语言原生写法，不被二次翻译。
- 繁体是简体的逐字字形转换，不做台湾化意译（`载入`→`加載`、`登錄`→`登录` 这类属字形对应，由 `npm run test:standardize` 校验）。

---

## 7. 安全底线（不可妥协）

| 项                       | 要求                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| 进程隔离                 | `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`，不要放宽    |
| CSP                      | 不要为了让某个 CDN 资源加载而放宽 CSP，改为本地打包                                |
| 私钥                     | `release-private.pem` 绝不入仓库、不进产物；签名密钥只经环境变量注入               |
| 用户数据签名与发布方签名 | `pack-sign`（用户数据）与 `release-sign`（发布方）严格分离，不混用密钥             |
| 路径穿越                 | 附件 URL 只用自增 ID，不出现文件名；读取前 `path.basename` + `startsWith` 双重校验 |
| 审计                     | 所有用户操作写审计记录；审计链为 SHA-256 哈希链，改动结构会破坏校验                |

---

## 8. 提交前自检清单

- [ ] 全仓 grep 过，没有写出与既有实现重复的代码
- [ ] 新代码落在正确的分层目录，没有把大段逻辑塞进已有大文件
- [ ] 复用了 §4.2 表里的既有入口，没有绕过封装直调底层 API
- [ ] 新增文案：全量语言齐全；`it`/`es` 若未译需确认回退可接受
- [ ] 新增纯图标按钮同时有 `aria-label` 和 `title`
- [ ] 破坏性操作有验密
- [ ] 无未使用 import、无死代码、无「暂时保留」的旧实现
- [ ] `npm run lint` 0 warning
- [ ] `npm test` 全绿
- [ ] `npm run build` 通过
- [ ] 若改了 `icon-antd.js`，是跑生成脚本得到的，不是手改
- [ ] 若改了打包脚本，产物仍会复制一份进产物空间（见 `electron/verify/pack-dist-space.test.mjs`）

---

## 9. 常见误解

| 误解                           | 事实                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| 「用 better-sqlite3 性能更好」 | 本项目要求用户机器零编译依赖。sql.js 在数万条文档量级体感无差，**不要替换**          |
| 「加个 UI 框架省事」           | 会让 8 套主题失控，且与现有 `base.css` 变量体系冲突，**不要引入**                    |
| 「图标手写更快」               | 手写图标语义不准、不成体系，且已被测试禁止                                           |
| 「RTL 就设 dir=rtl」           | 会把骨架翻过来，见 §5.2                                                              |
| 「测试红了先改断言」           | 先判断是业务 bug 还是断言写错了。**属业务 bug 就修业务代码**，不要静默改断言让它变绿 |
| 「顺手打包看看」               | 打包耗时且产出上百 MB，只在明确需要时执行 `npm run pack`                             |
