'use strict';
/**
 * 预加载脚本：以白名单方式向渲染层暴露最小 API 面
 * - 所有调用走 ipcRenderer.invoke，主进程统一参数校验
 * - 结果解包：失败时抛出 Error，渲染层直接 try/catch
 *
 * ★ 关于「An object could not be cloned」★
 *   该错误的根因是渲染层把 Vue 的 reactive（Proxy）对象直接塞进 IPC 载荷。
 *   但此问题**不能在 preload 层兜底解决**：contextIsolation 会把页面世界传入的
 *   一切（含原始值）再包一层膜 Proxy，preload 侧任何深克隆都无法可靠拆膜，反而
 *   可能自身崩。正确的修复在源码层——各 SFC 在组装 IPC 载荷时深拷贝
 *   （如 PostView.buildDraft 已对 fields/tags 做 JSON 深克隆）。故此处保持最小职责。
 */
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, payload) {
  const r = await ipcRenderer.invoke(channel, payload);
  if (r && r.ok === false) {
    // 主进程没给 error 时也要给一个可翻译的 key，否则渲染层只能显示裸中文
    const raw = String(r.error || 'common.opFailedRetry');
    // 还原主进程写入的错误码：[LAN_NEED_AUTH]xxx → err.code='LAN_NEED_AUTH', message='xxx'
    // （IPC 只能传可序列化字段，自定义属性会丢，故走前缀编码；见 ipc/shared.js）
    const m = raw.match(/^\[([A-Z_]+)\]([\s\S]*)$/);
    if (m) {
      const err = new Error(m[2]);
      err.code = m[1];
      throw err;
    }
    /* i18n 错误：主进程抛的是 `key` 或 `key|{json参数}`（见 electron/i18n 的 errKey）。
     * 这里拆成 message=key、err.params={...}，渲染层的 errText() 用自己的 t() 翻。
     * ★ 参数为什么要在这里拆、而不是让渲染层自己 parse ★
     *   拆解规则必须只有一处实现：渲染层十几个 catch 点各写一遍正则，
     *   哪天格式微调就会有一半点位静默失配（显示成 raw key）。
     * 判据与主进程 isErrKey 同一形态：小写字母点号 key，可带 |{...} 后缀。
     * 不匹配则原样抛 —— 内核错误（ECONNREFUSED / 文件系统原文）必须保留，不能洗。 */
    const em = raw.match(/^([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)(?:\|([{[][\s\S]*))?$/);
    if (em) {
      const err = new Error(em[1]);
      if (em[2]) {
        try {
          err.params = JSON.parse(em[2]);
        } catch (e2) {
          /* 解析失败就当无参 */
        }
      }
      throw err;
    }
    throw new Error(raw);
  }
  return r ? r.data : r;
}

const api = {
  /* 应用 */
  boot: () => call('app:boot'),
  versionsInfo: () => call('app:boot'),
  /* 用户 */
  register: p => call('users:register', p),
  users: () => call('users:list'),
  login: p => call('users:login', p),
  changePassword: p => call('users:changePass', p),
  userVerify: p => call('user:verify', p),
  setSecurity: p => call('users:setSecurity', p),
  getSecurity: p => call('users:getSecurity', p),
  hasSecurity: p => call('users:hasSecurity', p),
  recover: p => call('users:recover', p),
  rebindMac: p => call('users:rebindMac', p),
  getMacHistory: p => call('users:getMacHistory', p),
  /* 设置 */
  settingsAll: () => call('settings:getAll'),
  setSetting: p => call('settings:set', p),
  /* 全局搜索历史（主进程 userData 本地文件持久化，重启不丢） */
  getSearchHistory: () => call('searchHistory:get'),
  setSearchHistory: p => call('searchHistory:set', p),
  /* 大区/分类/标签/字段 */
  regions: () => call('region:list'),
  regionSave: p => call('region:save', p),
  regionDelete: p => call('region:delete', p),
  cats: p => call('cat:list', p),
  catSave: p => call('cat:save', p),
  catDelete: p => call('cat:delete', p),
  tags: () => call('tag:list'),
  tagSave: p => call('tag:save', p),
  tagDelete: p => call('tag:delete', p),
  fields: () => call('field:list'),
  fieldSave: p => call('field:save', p),
  fieldDelete: p => call('field:delete', p),
  /* 文档 */
  posts: p => call('post:list', p),
  post: p => call('post:get', p),
  postSave: p => call('post:save', p),
  postCheckDup: p => call('post:checkDup', p),
  postMerge: p => call('post:merge', p),
  postDelete: p => call('post:delete', p),
  postTrash: p => call('post:listTrash', p),
  postRestoreTrash: p => call('post:restoreTrash', p),
  postPurge: p => call('post:purge', p),
  postVersions: p => call('post:versions', p),
  postVersionSnapshot: p => call('post:versionSnapshot', p),
  postRestore: p => call('post:restore', p),
  postCountMine: () => call('post:countMine'),
  postTransferMine: p => call('post:transferMine', p),
  /* 便签 */
  notes: () => call('notes:list'),
  noteSave: p => call('notes:save', p),
  noteDelete: p => call('notes:delete', p),
  /* 统计/日志 */
  homeStats: () => call('stats:home'),
  regionStats: p => call('stats:region', p),
  usageSummary: () => call('usage:summary'),
  auditList: p => call('audit:list', p),
  auditVerify: () => call('audit:verify'),
  /* 文档包（导入导出） */
  packExport: p => call('pack:export', p),
  mdExport: p => call('md:export', p),
  pdfExport: p => call('pdf:export', p),
  /* 单篇文档导出（分享用）：入参 { id }，与上面的批量导出分开走 */
  postMdExport: p => call('post:exportMd', p),
  postPdfExport: p => call('post:exportPdf', p),
  /* 局域共享文档导出：入参 { post, kind }。
     共享文档正文只存在于对方机器，本机库里没有，故由渲染进程把已取回的载荷传上来。 */
  shareExportDoc: p => call('share:exportDoc', p),
  packImportOpen: p => call('pack:importOpen', p),
  packImportApply: p => call('pack:importApply', p),
  packImportPreview: p => call('pack:importPreview', p),
  packIsEncrypted: p => call('pack:isEncrypted', p),
  /* 图片与存储 */
  imgUpload: () => call('img:upload'),
  storageChoose: () => call('storage:choose'),
  storageOpen: () => call('storage:open'),
  storageBackup: p => call('storage:backup', p),
  storageRestore: p => call('storage:restore', p),
  storageBackupEncrypted: p => call('storage:backupEncrypted', p),
  storageOpenDb: () => call('storage:openDb'),
  repairDataDir: () => call('app:repairDataDir'),
  appQuit: () => call('app:quit'),
  backupChooseTarget: () => call('backup:chooseTarget'),
  backupRun: () => call('backup:run'),
  /* 数据清洗（Beta.316）：只回收无引用的数据，不碰正文 */
  cleanupStats: p => call('cleanup:stats', p),
  cleanupRun: p => call('cleanup:run', p),
  /* 图片清单（Beta.322）：只读元数据 + 引用关系；本体按 id 单张取，不批量 */
  cleanupImageList: p => call('cleanup:imageList', p),
  cleanupImageData: p => call('cleanup:imageData', p),
  /* 数据库加密 */
  securityStatus: () => call('security:status'),
  securityUnlock: p => call('security:unlock', p),
  securityEnable: p => call('security:enable', p),
  securityDisable: p => call('security:disable', p),
  securityChange: p => call('security:change', p),
  /* 完整性（防篡改）：人工重建签名基准的唯一出口，调用本身会进审计链 */
  acceptIntegrityBaseline: userId => call('security:acceptIntegrityBaseline', userId),
  /* 窗口 */
  winMin: () => call('win:min'),
  winMax: () => call('win:max'),
  winClose: () => call('win:close'),
  winIsMax: () => call('win:isMax'),
  /* 右键菜单（Beta.169）：渲染层把点击处的上下文报给主进程，由主进程弹原生菜单。
   * 菜单里的"复制"走主进程 clipboard —— 沙盒 + file:// 下渲染层 navigator.clipboard
   * 可能被拒（SharePanel 的 copyToken 就吃过亏），主进程侧不受权限模型约束。 */
  menuContext: p => call('menu:context', p),
  /* 复制任意文本（绕开沙盒剪贴板权限），返回是否写入成功 */
  copyText: p => call('clipboard:writeText', p),
  /* Beta.329 自绘右键菜单：写图片到剪贴板（data: URI in，返回是否成功） */
  clipWriteImage: p => call('clipboard:writeImage', p),
  /* Beta.329 自绘右键菜单：读剪贴板三形态 { text, html, image }（image 为 data: URI 或空） */
  clipRead: () => call('clipboard:read'),
  /* 内联图片另存为（data: URI → 文件），返回落盘路径或 null（用户取消） */
  imageSaveAs: p => call('image:saveAs', p),
  /* 上报编辑脏状态（主进程「关闭窗口 / 退出」时据此弹应用内确认框） */
  setUnsaved: v => ipcRenderer.send('win:setUnsaved', !!v),
  /* 回执：前端确认框的结果。true = 继续关闭/退出，false = 取消 */
  confirmCloseResult: ok => ipcRenderer.send('win:confirmResult', !!ok),
  /* 局域网只读共享 */
  lanStatus: () => call('lan:getStatus'),
  lanSetEnabled: p => call('lan:setEnabled', p),
  lanSetAuth: p => call('lan:setAuth', p),
  /* 文档拷贝：开关 + 拷贝动作 + 被拷记录查询 */
  lanSetAllowCopy: p => call('lan:setAllowCopy', p),
  lanCopyPost: p => call('lan:copyPost', p),
  lanCopyLog: () => call('lan:copyLog'),
  lanCopyRank: () => call('lan:copyRank'),
  lanRegenToken: () => call('lan:regenerateToken'),
  lanSetName: p => call('lan:setName', p),
  lanListRegions: () => call('lan:listRegions'),
  lanGetTokenCache: () => call('lan:getTokenCache'),
  lanSetTokenCache: p => call('lan:setTokenCache', p),
  lanAddRegion: p => call('lan:addRegion', p),
  lanRemoveRegion: p => call('lan:removeRegion', p),
  lanSyncNow: p => call('lan:syncNow', p),
  lanDiscover: () => call('lan:discover'),
  lanAudit: p => call('lan:audit', p),
  lanVisitorLog: () => call('lan:visitorLog'),
  lanVisitorRank: () => call('lan:visitorRank'),
  lanPostViewRank: () => call('lan:postViewRank'),
  lanMyStats: () => call('lan:myStats'),
  lanRequest: p => call('lan:request', p),
  /* 运行日志 */
  logRead: () => call('log:read'),
  logOpen: () => call('log:open'),
  logWrite: p => call('log:write', p),
  /* 托盘自绘弹窗：数据 / 动作 / 尺寸回报（弹窗渲染进程专用） */
  trayData: () => call('tray:data'),
  trayAction: p => call('tray:action', p),
  trayResize: p => call('tray:resize', p),
  /* 浏览打点：打开一篇已存在文档时记一笔，供托盘「最近浏览」使用 */
  markView: p => call('view:mark', p),
  /* 托盘悬停提示：文案由渲染层按当前语言推过来（fire-and-forget） */
  setTrayTooltip: text => ipcRenderer.send('tray:tooltip', text),
  /* 界面语言同步给主进程：原生对话框/菜单/错误屏要用它（fire-and-forget，无需回执） */
  setLang: lang => ipcRenderer.send('lang:set', lang),
  /* 事件订阅 */
  onWinState: cb => ipcRenderer.on('win:state', (e, s) => cb(s)),
  onProgress: cb => ipcRenderer.on('task:progress', (e, d) => cb(d)),
  onE2e: cb => ipcRenderer.on('e2e:goto', (e, d) => cb(d)),
  onClockAlert: cb => ipcRenderer.on('clock:alert', (e, d) => cb(d)),
  onLogLine: cb => ipcRenderer.on('log:line', (e, d) => cb(d)),
  /* 托盘菜单导航意图（打开某篇文档 / 新建文档）：主窗口渲染层消费 */
  onTrayNavigate: cb => ipcRenderer.on('tray:navigate', (e, d) => cb(d)),
  /* 页面内查找的命中计数（每次 findInPage 结果更新都会推一次） */
  onFindResult: cb => ipcRenderer.on('find:result', (e, d) => cb(d)),
  /* 主进程请求「未保存修改」确认（关闭窗口 / 退出菜单），由前端弹应用内确认框后回执 */
  onConfirmClose: cb => ipcRenderer.on('win:confirmClose', (e, d) => cb(d))
};

contextBridge.exposeInMainWorld('arch', api);
