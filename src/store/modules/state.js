import { reactive } from 'vue';

/**
 * 全局响应式状态根。所有模块共享同一 reactive 实例（单例）。
 * 其余 store 模块通过 `import { store } from './state'` 复用本对象。
 */
export const store = reactive({
  booted: false,
  locked: false, // 数据库已加密但未解锁
  writable: true, // 数据目录是否可写（不可写时全局只读）
  dbError: false, // 数据库初始化失败：显示"数据库不可用"屏而非卡死/误导向注册
  dbErrorMessage: '', // 失败的可读原因
  user: null, // 当前登录用户
  users: [],
  lastUser: null, // 上次登录用户（用于登录门预选）
  mac: '',
  versions: {},
  settings: {},
  theme: 'light',
  themeCustom: '', // 记住上次选择的非标准（非 商务明亮/暗黑/线框）主题，供导航栏主题按钮「自定义」态使用
  language: 'zh-CN', // 界面语言（zh-CN / zh-TW / en），设置项 display.lang，见 src/i18n
  page: 'home',
  params: {},
  nav: { canBack: false, canForward: false, backKey: '', forwardKey: '' },
  regions: [],
  toast: null,
  auditChain: null, // 审计链校验结果 {ok,total,chained,brokenAt,detail}
  /* 完整性（防篡改）状态快照，来自主进程 app:boot 的 integrity 字段：
   *   { db: { compromised, reason },
   *     app: { ok, missingManifest, scope, asarGuarded, reason, checked, modified[], missing[], added[] } | null }
   *   db.compromised=true 时主进程已把 writable 置 false —— 前端据此显示只读横幅与处置入口。
   *   app.scope='asar-unpacked' + asarGuarded=true 表示：程序主体在 app.asar 内，
   *   由可执行文件内部嵌的 Electron 校验守护；此处自检只覆盖 asar 之外的 unpacked 文件。
   *   文案必须据此分层，否则用户会把「附带运行时文件被改」误读成「主程序被换」。 */
  integrity: null,
  /* 只读原因的展示文案（本地化后的字符串）。
   * 只读有两类互不相干的原因，混用同一句会误导用户：
   *   1) 物理不可写（U 盘只读、权限不足）—— 用户去改目录权限即可；
   *   2) 完整性不通过（文件被改过）—— 用户要处理的是「数据是否可信」，改权限无用。
   * 故由 boot.js 按主进程返回的实际原因写入这里，而不是在模板里写死。
   * 初值刻意留空字符串而不是 t('common.readonlyNotWritable')：本模块被 i18n 导入
   * （i18n → state），反向 import 会成环，模块加载期求值还会定格在默认语言；
   * 而 writable 初值为 true、只读横幅根本不渲染，bootApp 又必然在首帧前覆写它。 */
  writableReason: '',
  dirty: false, // 是否有未保存的录入内容（全局刷新时用于询问）
  searchCache: null, // 全局搜索上次状态缓存 { filters, rows, total, page, searched, q }，离开/返回时保持
  searchHistory: [], // 全局搜索历史词（最新在前，限制数量），跨页面返回保持，可清除
  /* 局域网共享（供导航栏/大区页面读取已共享大区 ID 列表，避免各组件各自拉 IPC） */
  lanEnabled: false, // 共享是否开启
  lanShared: [] // 已共享大区 ID 数组（来自 A.lanStatus().sharedRegions）
});
