'use strict';
/**
 * 启动引导通道：app:boot 在锁定态与解锁态分别返回最小/完整上下文，
 * 渲染层据此决定展示 UnlockGate 还是主界面。锁定守卫绕过（noLockGuard）。
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const keystore = require('../keystore');
const state = require('../state');
const datadir = require('../services/datadir');
const { pickDirectory } = require('../services/dialog');
const i18n = require('../i18n');
const { handle } = require('./shared');

/**
 * 从 package.json 读取某个依赖的**已安装**版本。
 *
 * 为什么不写死在渲染层：关于页要展示「引用了哪些开源组件」，
 * 手工维护的版本号一定会过期（Beta.318 时就出现过 README 还写着 0.1.0 的情况）。
 * 这里直接读锁文件里解析后的版本；读不到就返回 ''（渲染层不显示该行），
 * 不猜、不编。
 *
 * @param {string} name 包名
 * @returns {string} 形如 '3.6.5'；未安装时为空串
 */
function depVersion(name) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    const raw = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }[name];
    // manifest 里是 '^3.6.5' 这种范围写法，去掉前缀只留版本号
    return String(raw || '').replace(/^[\^~>=<\s]+/, '');
  } catch {
    return '';
  }
}

function versions() {
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    // 关于页「开源组件」用：编辑器内核与两个图标库
    tiptap: depVersion('@tiptap/vue-3'),
    antdIcons: depVersion('@ant-design/icons-svg'),
    lucide: depVersion('lucide-static')
  };
}

/**
 * 完整性状态快照（供渲染层展示）。
 *
 * 【为什么要拆成 db / app 两块，而不是一个布尔】
 *   两者后果完全不同，前端的提示文案与处置建议也不同：
 *     - db 不通过 → 数据被改过：已强制只读，建议从备份恢复；
 *     - app 不通过 → 程序被改过：数据仍可写，但「这份程序是否可信」存疑。
 *   混成一个 integrityOk 会让前端说不出「哪里不对」。
 *
 * 【为什么 db 侧要读 getIntegrityReason 而不是 getPendingIntegrityWarn】
 *   后者是「读后即清」的一次性弹窗载体，主进程启动时已消费掉（用于弹窗）。
 *   这里要的是常驻状态，故必须用 reason + isIntegrityCompromised 组合。
 *   （db 为 null 时——锁定态/打开失败——调用会抛错，故全部包在 try 里。）
 */
function integritySnapshot() {
  const out = {
    db: { compromised: false, reason: null },
    app: null
  };
  try {
    out.db.compromised = !!db.isIntegrityCompromised();
    out.db.reason = out.db.compromised ? db.getIntegrityReason() : null;
  } catch (e) {
    /* db 未就绪：保持默认的「无问题」，避免把「没打开」误报成「被篡改」 */
  }
  const ai = state.appIntegrity;
  if (ai) {
    out.app = {
      ok: ai.ok !== false,
      missingManifest: !!ai.missingManifest,
      // scope 标注本次自检覆盖的是哪一层：
      //   'asar-unpacked' = 只守 app.asar 之外的文件（asar 本体由 exe 内 Electron 校验守护）
      //   'app-files'     = 全量守 app 目录（asar:false 的旧部署方式）
      // 前端据此把文案说准，避免用户把「附带运行时文件被改」误读成「主程序被换」。
      scope: ai.scope || 'asar-unpacked',
      // 程序主体是否由 exe 内部的 Electron 校验守护（asar 部署恒为 true）。
      // 供前端在文案里声明「主程序那一层由可执行文件自身保证，被改则根本起不来」。
      asarGuarded: ai.scope !== 'app-files',
      reason: ai.reason || null,
      checked: ai.checked || 0,
      modified: ai.modified || [],
      missing: ai.missing || [],
      added: ai.added || []
    };
  }
  return out;
}

function registerBoot() {
  handle(
    'app:boot',
    async () => {
      if (state.locked) {
        // 锁定态：仅返回最小信息，渲染层据此展示 UnlockGate
        return {
          locked: true,
          mac: keystore.getMac(),
          encrypted: false,
          writable: state.writable,
          versions: versions(),
          integrity: integritySnapshot()
        };
      }
      if (state.dbError) {
        // 数据库初始化失败（损坏/被占用）：直接返回错误，绝不调用 db.* 查询
        // （否则 db 为 null 会炸出 `Cannot read properties of null (reading 'prepare')`）。
        // 前端据此显示"数据库不可用"屏，引导用户从备份恢复或重指目录。
        return {
          locked: false,
          dbError: true,
          dbErrorMessage: state.dbError,
          mac: keystore.getMac(),
          writable: state.writable,
          versions: versions(),
          integrity: integritySnapshot()
        };
      }
      const settings = db.allSettings();
      return {
        settings,
        users: db.listUsers(),
        lastUserId: db.getSetting('session.user_id'),
        mac: keystore.getMac(),
        locked: false,
        writable: state.writable,
        encrypted: db.isEncryptedMode(),
        versions: versions(),
        dataDir: db.dataDirPath(),
        integrity: integritySnapshot()
      };
    },
    { noLockGuard: true }
  );

  /**
   * 人工确认「接受当前数据内容为签名基准」——唯一的洗白出口。
   *
   * 场景：用户确认那次「不一致」是自己造成的（如手工修过库、或从别处拷来了
   * 一个内容正确但签名对不上的库），愿意以现状为新基准。
   * 该动作本身会进审计链（action='重建完整性基准'），因此「谁在什么时候把基准挪了」
   * 同样有迹可循 —— 这是唯一允许主动清除告警的路径，绝不做静默自动清除。
   */
  handle('security:acceptIntegrityBaseline', async userId => {
    const okDone = db.acceptCurrentAsBaseline();
    if (!okDone) throw new Error(i18n.errKey('common.errBaselineNoDb'));
    state.writable = db.checkWritable() && !db.isIntegrityCompromised();
    try {
      db.safeAudit(userId || null, '重建完整性基准', 'integrity', 'archive.db', { writable: state.writable });
    } catch (e) {}
    // 直接返回纯数据：shared.handle 统一包 {ok:true,data}，避免双层 {ok}；
    // 失败路径走 throw（前端 catch），成功路径前端判 `if (r)` 即可。
    return { writable: state.writable };
  });

  /**
   * 数据库不可用时的修复通道：仅让用户重新指向一个「含有效 archive.db 的目录」
   * （例如从备份恢复后的目录）。写指针后**在当前进程内重新打开数据库**
   * （keystore.reloadDataDir），前端拿到 ok 后重载即可直接进入业务界面，无需手动重启。
   * 不做任何文件复制，以免把损坏的当前库覆盖到用户选中的好目录。锁定态/损坏态均可调用。
   *
   * ★ 返回结构：{ ok, dataDir?, reason? }
   *   - ok=true            重载成功（可能仍需输口令解锁，由后续 app:boot 的 locked 决定）
   *   - ok=false + reason  重载失败（如选中目录的库同样损坏/被占用），前端留在错误屏并展示原因
   *   用户取消选择返回 null（前端静默，不改动现有错误屏）。
   */
  handle(
    'app:repairDataDir',
    async () => {
      const dir = await pickDirectory({ title: i18n.t('sys.pickDataDirTitle'), create: true });
      if (!dir) return null;
      datadir.assertWritable(dir);
      if (!fs.existsSync(path.join(dir, 'archive.db'))) {
        throw new Error(i18n.errKey('settings.errNoArchiveDb', {}));
      }
      const r = await keystore.reloadDataDir(dir);
      if (!r.ok) return { ok: false, dataDir: dir, reason: r.reason || i18n.t('sys.dbStillCantOpen') };
      return { ok: true, dataDir: dir, locked: !!r.locked };
    },
    { noLockGuard: true }
  );

  /** 退出应用（数据库不可用屏等场景，绕过锁定守卫） */
  handle(
    'app:quit',
    async () => {
      app.quit();
    },
    { noLockGuard: true }
  );
}

module.exports = { registerBoot };
