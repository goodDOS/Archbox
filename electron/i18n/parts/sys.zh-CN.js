/**
 * 主进程 i18n 字典 · sys 域（简体中文，唯一「必须完整」的语言）。
 *
 * 覆盖主进程**自渲染面**的用户可见文案：
 *   - 数据库完整性警告弹窗（main.js）
 *   - 程序文件完整性警告弹窗（main.js）
 *   - 完整性校验失败的具体原因（db/core.js、services/integrity.js）
 *   - 数据库打开失败屏的原因串（keystore.js 的 state.dbError）
 *   - 「选择数据目录」对话框（ipc/boot.js 的 repairDataDir）
 *
 * 为什么不放进渲染层字典：这些场景发生在**库不可用/渲染层语言失效**时
 * （如 dbError 屏），渲染层连设置表都读不到，只能靠主进程侧
 * userData 缓存文件记住语言。语言三级来源见 index.js。
 */
module.exports = {
  /* ---- 数据库完整性警告弹窗 ---- */
  dbIntegrityTitle: '数据库完整性警告',
  dbIntegrityMsg: '检测到数据库完整性校验未通过（可能被篡改或损坏）。',
  dbReadOnlyNote:
    '\n\n为避免覆盖证据，程序已切换为【只读模式】：\n你可以照常浏览、检索、导出数据，但不能修改。\n确认为误报后，可在设置中重建签名基准以恢复写入。',
  dbAuditNote: '\n\n本次事件已写入审计日志（每条启动记录一次，无法自动清除）。',
  dbGotoSettings: '前往设置处理',
  dbQuit: '退出程序',

  /* ---- 程序文件完整性警告弹窗 ---- */
  appIntegrityTitle: '程序文件完整性警告',
  appIntegrityMsg: '检测到程序附带的运行时文件与发布时的签名清单不一致。',
  appIntegrityDetail:
    '受影响范围：程序安装目录下 app.asar.unpacked 内的文件（$scope={scope}）。\n' +
    '程序主体 app.asar 已由可执行文件内部的 Electron 校验通过——若主程序被改，本程序根本无法启动。\n\n' +
    '{reason}\n\n该事件已写入审计日志（每条启动记录一次，无法自动清除）。' +
    '若你未主动修改过这些文件，建议从官方渠道重新获取程序包，或对本次运行的来源保持警惕。',
  appIntegrityOk: '我知道了',

  /* ---- 完整性校验的具体原因（db/core.js + services/integrity.js）---- */
  integSigBroken: '签名文件损坏，无法校验数据库完整性',
  integSigFail: '数据库签名校验失败，可能被篡改',
  integHashMismatch: '数据库内容哈希不匹配，可能被篡改或损坏',
  integCrcMismatch: '数据库内容 CRC32 不匹配，可能损坏',
  integDefault: '数据库完整性校验未通过',
  appIntegrityDirMissing: '程序附带的运行时文件目录 app.asar.unpacked 整体缺失',
  appIntegrityDirMissingDetail: '但 app.asar 头部声明了其中应有 {n} 个文件（{sample}{more}）——目录被删除或未随包安装',
  andMore: ' 等',
  diffModified: '被修改 {n} 个（{sample}{more}）',
  diffMissing: '被删除 {n} 个（{sample}{more}）',
  diffAdded: '被新增 {n} 个（{sample}{more}）',
  appIntegrityNoDir: '程序目录不存在，跳过自检',
  appIntegrityNoManifest: '未找到程序文件签名清单（开发态或首次运行），跳过自检',
  appIntegrityManifestBroken: '程序文件签名清单损坏，无法解析',
  appIntegritySigFail: '程序文件签名清单校验失败：',
  appIntegrityMismatch: '程序文件与签名清单不一致：',
  manifestMissing: '清单对象缺失',
  manifestNoSig: '清单缺少签名',
  manifestSigInvalid: '清单签名无效（清单可能被替换、篡改或由非本程序生成）',

  /* ---- 数据库打开失败屏（keystore.js → state.dbError）---- */
  dbOpenFailed: '数据库打开失败（{dir}）：{msg}',
  dbTampered: '【已检测到数据文件被改动：{reason}】',
  dbStillCantOpen: '数据库仍无法打开',
  dbLockedNeedPass: '数据库已加密，需要口令解锁',

  /* ---- 选择数据目录对话框（ipc/boot.js）---- */
  pickDataDirTitle: '选择包含 archive.db 的数据目录（用于修复/恢复）',

  /* ---- 审计记录（action/detail 直接显示在设置页审计列表）---- */
  auditDbIntegrity: '数据库完整性告警',
  auditAppIntegrity: '程序文件完整性告警',
  auditIntegrityAction: '本会话已切换为只读，且不会自动重建签名基准',
  auditAppIntegrityReason: '程序文件与签名清单不一致',
  integNoSig: '无签名文件，视为首次（persistNow 将建立基准）',
  integNoDbFile: '无数据库文件',
  chainDetailNone: '无记录',

  /* ---- 审计动作名与登录失败原因（写入 audit_log，直接显示在审计列表）---- */
  actPackImport: '文档包导入',
  actUserRegister: '注册新用户',
  actLoginFail: '登录失败',
  actLogin: '登录',
  actResetPassword: '重置密码',
  actChangePassword: '修改密码',
  actSetQA: '设置安全问答',
  actRecoverByQA: '安全问答找回密码',
  actChangeSetting: '修改设置',
  actRegionUpdate: '修改大区',
  actRegionCreate: '新建大区',
  actRegionDelete: '删除大区',
  actCatUpdate: '修改分类',
  actCatCreate: '新建分类',
  actCatDelete: '删除分类',
  actTagAutoCreate: '自动新建标签',
  actTagUpdate: '修改标签',
  actTagCreate: '新建标签',
  actTagDelete: '删除标签',
  actFieldUpdate: '修改字段定义',
  actFieldCreate: '新建字段定义',
  actFieldDelete: '删除字段定义',
  actPostUpdate: '修改文档',
  actPostCreate: '新建文档',
  actPostMerge: '合并文档',
  actPostTrash: '删除文档（移入回收站）',
  actPostRestore: '恢复文档',
  actPostPurge: '彻底删除文档',
  actPostVersionRestore: '恢复历史版本',
  actTransferPosts: '移交全部文档',
  actNoteCreate: '新建便签',
  actNoteDelete: '删除便签',
  sysUser: '系统',
  unknownUser: '未知用户',
  loginNoUser: '用户不存在',
  loginMacMismatch: 'MAC 不匹配',
  loginBadPassword: '密码错误',
  chainBrokenPrev: '记录 #{id} 的 prev_hash 与前条不匹配（链断裂），可能存在删除或插入',
  chainBrokenContent: '记录 #{id} 的内容与 self_hash 不匹配（字段被篡改）',
  chainOkDetail: '已校验 {n} 条链化记录，链完整无篡改',
  mergeAppendMark: '[合并追加 {time}]',
  regionFallback: '大区 #{id}',
  categoryFallback: '分类 #{id}',

  /* 导出产物文本（Markdown / PDF） */
  docFallbackName: '文档',
  sharedDocTitle: '共享文档',
  uncategorized: '未分类',
  exportTitle: '文档导出',
  tagsLabel: '标签',
  fieldsBlock: '字段信息',
  statusDraft: '草稿',
  statusPublished: '已发布',
  metaStatus: '状态',
  metaRegion: '大区',
  metaCategory: '分类',
  metaCreated: '创建',
  metaUpdated: '更新',
  metaAuthor: '作者',
  exportFooter: '导出时间：{time} · 共 {n} 条文档 · 由 {app} 生成',

  /* 文档包导入报告 */
  packZipLabel: '文档包 ZIP ',
  importRegionName: '导入大区',
  emptyTitle: '（空标题）',
  impFieldFail: '字段 {code}：{msg}',
  impItemFail: '第 {n} 条：{msg}',
  impSkipEmptyTitle: '第 {n} 条：标题为空，已跳过',
  impSkipDup: '第 {n} 条「{title}」：字段值重复，已跳过',
  impReasonEmptyTitle: '标题为空',
  impReasonDup: '与「{title}」字段值重复',
  impReasonMerged: '合并到「{title}」',
  impReasonSuffix: '重复导入，标题加「重复导入」后缀',
  impReasonNoCheck: '不查重·全新创建',
  impReasonCreated: '查重通过·全新创建',
  impExistingDoc: '已存在文档',
  impDupSuffix: '（重复导入 {code}）',
  impProgress: '已处理 {n}/{total}',

  /* 时钟与云服务提示 */
  clockBackdrift: '本次启动时间早于上次启动记录，系统时钟可能被回拨',
  clockRollback: '检测到系统时间回拨约 {n} 秒',
  clockJump: '检测到系统时间前跳约 {n} 分钟',

  /* 局域网说明页（浏览器直接访问时展示） */
  lanPageTitle: '文档盒 Archbox · 局域共享服务',
  lanPageH1: '文档盒 Archbox · 局域共享服务',
  lanPageMeta: '版本 {ver} · 端口 {port} · 运行中',
  lanPageOk1: '你看到这页，说明 <b>服务是正常的</b>——它本来就没有网页界面。',
  lanPageOk2:
    '局域网里的共享内容由<b>「文档盒」客户端</b>自己拉取：在另一台装了本软件的机器上打开「局域共享」，本机会自动出现在列表里（同网段每 5 秒广播一次，不用手工输地址）。',
  lanPageOk3: '浏览器敲地址这条路走不通，两个原因：',
  lanPageLi1: '服务只认 <code>/api/…</code>，且需携带访问令牌——令牌由客户端在发现时取得，浏览器里没有。',
  lanPageLi2: '接口刻意不带跨域许可，浏览器无法跨域读取共享内容。',
  lanPageOk4: '想确认服务是否在跑，访问 <code>/health</code> 或 <code>/api/version</code> 即可。'
};
