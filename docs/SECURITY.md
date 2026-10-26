# 安全设计

## 1. 渲染层 ↔ 主进程隔离

```
┌───────────────────────────┐
│ 渲染进程 (Vue, sandbox)    │  ← contextIsolation=true, nodeIntegration=false
│  - 只能看到 contextBridge   │
│    暴露的白名单 window.arch │
└──────────┬────────────────┘
           │ ipcRenderer.invoke (单向)
┌──────────▼────────────────┐
│ 预加载 (preload.js)         │  ← 仅能 require('electron')
│  - 显式枚举每个 API 通道     │
│  - 解析 {ok, data, error} 包装 │
└──────────┬────────────────┘
           │ ipcRenderer.invoke (桥接)
┌──────────▼────────────────┐
│ 主进程 (main.js)            │  ← 完整 Node 权限
│  - 统一 try/catch 包装 handler │
│  - 严格参数类型校验（S/I/nv）│
│  - 操作审计 audit(userId,...) │
└───────────────────────────┘
```

## 2. 资源加载安全

### 2.1 自定义协议 `archimg://`

- 在 `app.whenReady()` 之前通过 `protocol.registerSchemesAsPrivileged` 标记为 `standard + secure + supportFetch`
- handler 内：
  1. 解析 `req.url` 的 host → 数字 ID
  2. 拒绝 ID ≤ 0 或非整数
  3. 查 `attachments` 表获取 `stored_name`
  4. `path.basename(stored_name)` 防止 `../` 穿越
  5. 验证最终路径以 `attachmentsDir()` 开头
  6. 通过 `net.fetch(pathToFileURL(fp))` 返回文件
- 路径泄露面：仅暴露 `archimg://{numericId}`，文件名不外露

### 2.2 CSP（Content-Security-Policy）

```html
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: archimg:; font-src
'self' data:; connect-src 'self' ws: http://127.0.0.1:5173 http://localhost:5173;
```

- 不允许任何外域脚本/样式
- 开发期允许 `ws://localhost` HMR；生产期该规则同样安全（无 ws 实际使用）
- `unsafe-inline` 仅限样式（Vue 组件内联样式需要）；脚本不允许 inline

## 3. XSS 防护（三层防御）

| 层            | 实现                                                                                                                    | 位置                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1. 保存净化   | `sanitize-html` 白名单（标签 + 属性 + scheme + CSS 属性白名单）；`a` 自动加 `rel='noopener noreferrer' target='_blank'` | `electron/db/core.js::cleanHtml` |
| 2. 字段值转义 | 高亮 util `highlight()` 先 `esc()` 转义再包裹 `<mark>`                                                                  | `utils/highlight.js`             |
| 3. 渲染净化   | `DOMPurify.sanitize()` + 显式 `ALLOWED_URI_REGEXP` 放行 `data:`（正文图片一律 base64 内联）                             | `utils/sanitize.js`              |

DOMPurify 默认会剥离 `data:`，必须显式声明。`FORBID_ATTR: onerror/onload/onclick` 进一步收紧；`style` 属性按 CSS 属性白名单（`text-align` / `color` / `background-color` / `font-size` + 值正则）逐条过滤——Beta.315 起正文排版样式随 Tiptap 书写工具落地，保存侧 `allowedStyles` 与渲染侧过滤 hook 同口径双层把关，任一层被绕过另一层仍兜底，均不放行任意 CSS。

## 4. SQL 注入防护

- 所有 SQL 走 `sql.js` 的 `stmt.bind(params)` 参数化
- 无任何字符串拼接
- 排序字段固定为白名单（`updated_at` / `version_no` / `count`），不接用户输入
- LIKE 通配符在用户输入里 escape（`%` / `_` 未在搜索字段中处理；如需严格 escape 可在 `buildWhere` 中加 `String(f.q).replace(/[\\%_]/g, c => '\\' + c)` —— 当前实现因字段值查找范围有限，暂未处理）

## 5. 文件系统路径安全

| 场景         | 防御                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| 图片上传     | `path.extname` + 扩展名白名单；读取后 base64 内联进正文（≤ 20MB），不再落 `attachments/` 分储（Beta.90 起） |
| 存储路径选择 | `dialog.showOpenDialog` + `writeFileSync(probe)` 探活；目标与当前路径不同时才执行                           |
| 临时文件     | 主进程不创建临时文件；文档包导入解析直接在内存中完成                                                        |

## 6. 身份与访问控制

- 登录态：`session.user_id` 存于 `settings` 表；登出直接清空
- MAC 绑定：用户创建时绑定；登录时校验
- 操作审计：所有 IPC handler 在执行操作前调用 `currentUser()` 取当前用户 ID，写入 `audit_log`
- **审计链防篡改**：每条记录追加 `prev_hash` + `self_hash`，形成 SHA-256 前向哈希链；首条锚定创世值 `H("ARCHAUDIT-GENESIS")`。启动时自动 `verifyAuditChain()` 全链重算校验；任何记录被篡改/删除/插入都会让链断裂，UI 弹红字告警并指向异常记录 ID。设置→操作日志可手动复检。
- 文件 IPC 全部白名单：仅有 `arch:users:register / users:login / settings:set / storage:choose / ...` 等显式枚举

## 7. 攻击面限制

- `setWindowOpenHandler` → `{ action: 'deny' }` 一律拒绝
- `will-navigate` 仅允许 `DEV_URL` 与 `file://` 自身
- `webSecurity: true`（默认）
- `spellcheck: false`（减少 IME 相关事件暴露面）
- 关闭 Chromium 自动更新：`app.commandLine.appendSwitch('disable-component-update', '1')`（如需）

## 8. 依赖安全

- 关键依赖锁定：
  - `sanitize-html@2.13.1`（避免 2.14+ 的 ESM 依赖问题）
  - `sql.js@1.11.x`（纯 JS）
- 建议定期 `npm audit`，可考虑接入 `npm audit signatures`

## 9. 已知限制与未来工作

| 限制          | 影响                                          | 建议                                                                                                                                                              |
| ------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未做代码签名  | 首次安装/运行弹 SmartScreen「未知发布者」警告 | **已接入 Electron Fuses 运行时加固**（`scripts/afterPack.js`）；签名证书路线见 `docs/CODE-SIGNING.md`（EV / Azure Trusted Signing / Certum 三选一，环境变量即签） |
| 未做自动更新  | 需用户手动下载                                | 集成 `electron-updater`（需先有签名）                                                                                                                             |
| 无密码/双因素 | 单机本地使用可接受                            | 已支持**数据库 AES-256-GCM 透明加密**（设置→数据加密）；PIN 锁可在后续迭代叠加                                                                                    |

> 注：**SQLCipher 不再纳入路线**。原限制「无文件加密」已由应用层 **AES-256-GCM + scrypt + DPAPI 记住口令** 方案等效替代，且无需引入原生编译依赖（`better-sqlite3`），保持 sql.js 纯 WASM 优势。详见 `electron/services/crypto.js` 与本文件 §8。

## 9.1 数据库透明加密（AES-256-GCM，替代 SQLCipher）

- **文件格式**：`ARCHENC1`(8B) + salt(16B) + iv(12B) + GCM tag(16B) + 密文
- **密钥派生**：`scrypt(N=16384, r=8, p=1)` 从用户口令派生 32 字节密钥，口令不落盘
- **认证加密**：AES-256-GCM 提供 confidentiality + 完整性/防篡改；口令错误或文件被改 → 认证失败抛错
- **记住口令**：勾选后口令经 `safeStorage`（Windows DPAPI，绑定当前系统账户）包裹存入 `userData/enc.key`；拷走 keyfile 或换账户均无法解出口令
- **锁定状态机**：启动探测加密文件 → 尝试 keyfile 自动解锁 → 失败则 `locked=true`，渲染层展示 `UnlockGate`，期间所有业务 IPC 被守卫拒绝（仅 `security:*` 与窗口控制可用）
- **口令遗失不可恢复**：未记住口令且遗忘 → 数据库不可解密，UI 明确警示并建议导出明文备份

| CSP 未启用 strict-dynamic | 与 Vite HMR 兼容折中 | 生产构建可进一步收紧 |
