'use strict';
/**
 * 密钥文件 + 数据目录指针 + 启动引导。
 * - 数据目录指针（storage.json）指向真实数据库所在目录，可自定义并迁移
 * - 密钥文件（safeStorage/DPAPI 包裹口令，实现「记住口令」自动解锁）
 * - tryBootDb：明文库直接打开；加密库先试密钥文件，失败则进入 locked 等待解锁
 * 依赖：electron(app/safeStorage)、db、crypto 服务、日志、共享状态。
 */
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const cryptoSvc = require('./services/crypto');
const packSign = require('./services/pack-sign');
const state = require('./state');
const { DATA_SUBDIR } = require('./services/appinfo');
const i18n = require('./i18n');
const { getLog } = require('./services/logger');

/* ---------- 数据目录指针（数据库文件单独存储，可在设置中自定义并迁移） ---------- */
function pointerFile() {
  return path.join(app.getPath('userData'), 'storage.json');
}
function readDataDir() {
  try {
    const j = JSON.parse(fs.readFileSync(pointerFile(), 'utf8'));
    if (j && j.dataDir && fs.existsSync(path.join(j.dataDir, 'archive.db'))) return j.dataDir;
  } catch (e) {}
  // 默认数据目录 = userData/<DATA_SUBDIR>（与迁移后的结构保持一致，见 appinfo.js）
  return path.join(app.getPath('userData'), DATA_SUBDIR);
}
function writeDataDir(dir) {
  fs.mkdirSync(path.dirname(pointerFile()), { recursive: true });
  fs.writeFileSync(pointerFile(), JSON.stringify({ dataDir: dir }, null, 2));
}

/* ---------- 本机 MAC（用户设备绑定） ---------- */
function getMac() {
  const nis = require('os').networkInterfaces();
  for (const list of Object.values(nis)) {
    for (const ni of list || []) {
      if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') return ni.mac.toUpperCase();
    }
  }
  return 'UNKNOWN-MAC';
}

/**
 * 重新指向数据目录并**在当前进程内重新打开数据库**（数据库不可用屏的修复通道）。
 *
 * ★ 为什么必须在这里重载，而不是只写指针让前端刷新 ★
 * `app:repairDataDir` 原先只调 `writeDataDir(dir)` 写指针文件（落盘），
 * 但当前进程的 `state.dbError` 仍非 null、`db` 仍为 null、`state.locked` 也没变。
 * 渲染层那句 `location.reload()` 只是**重载页面**——重载的是同一个损坏的进程，
 * `app:boot` 再次读到 `state.dbError`，用户看到的还是同一张「数据库不可用」屏，
 * 必须手动杀进程重启才生效。这里补上热重载：重置失败标记 → 重新跑启动流程，
 * 使 `db` / `state.locked` / `state.dbError` 与新的指针目录保持一致。
 *
 * @param {string} dir 含有效 archive.db 的数据目录
 * @returns {Promise<{ok:boolean, reason?:string, locked?:boolean}>} ok=false 时前端保持错误屏并展示 reason
 */
async function reloadDataDir(dir) {
  // 先关掉当前已打开的库（若存在）：否则 db.init 会被开头的 `if (db) return` 短路，
  // 指针换了、库却没换，且会误报成功（「修复成功后再修复」场景必踩）。
  // closeDb 内部会先 persistNow 落盘到旧目录，不会丢改动。
  db.closeDb();
  writeDataDir(dir);
  // 重置上一次的失败标记与共享状态，使 openDatabase 能以全新状态重跑
  state.dbError = null;
  state.locked = false;
  const r = await openDatabase(dir);
  // ★ 切换/重载数据库后强制重新登录：session.user_id 存在各库自身的 settings 表里，
  //   换库后旧库的 user_id 不能跨库继承（不同库的账号体系可能完全不同），
  //   必须清空会话，让前端 bootApp 回到登录门（UserGate）。
  //   - 明文库（ok && !locked）：db 已 init 完成，立即清。
  //   - 加密库（locked）：db 为 null 无法清，置 pendingClearSession 标记，
  //     待 security:unlock 成功后消费。
  if (r && r.ok && !r.locked && db) {
    try {
      db.clearSession();
    } catch (e) {
      getLog().warn('切库后清空会话失败：' + (e && e.message));
    }
  } else if (r && r.ok && r.locked) {
    state.pendingClearSession = true;
  }
  return r;
}

/* ---------- 数据库加密：密钥文件（safeStorage/DPAPI 包裹口令，实现「记住口令」） ---------- */
function keyFile() {
  return path.join(app.getPath('userData'), 'enc.key');
}
function readKeyFile() {
  try {
    const j = JSON.parse(fs.readFileSync(keyFile(), 'utf8'));
    if (j && j.v === 1 && j.wrappedPass) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return { pass: safeStorage.decryptString(Buffer.from(j.wrappedPass, 'base64')) };
    }
  } catch (e) {}
  return null;
}
function writeKeyFile(pass) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.writeFileSync(
    keyFile(),
    JSON.stringify(
      {
        v: 1,
        algo: 'AES-256-GCM + scrypt',
        wrappedPass: safeStorage.encryptString(String(pass)).toString('base64'),
        note: '口令经操作系统凭据保护（Windows DPAPI）包裹，仅本机当前系统账户可解'
      },
      null,
      2
    )
  );
  return true;
}
function removeKeyFile() {
  try {
    fs.unlinkSync(keyFile());
  } catch (e) {}
}

/* ---------- 用户数据签名密钥（文档包/备份/数据库 .sig 的 L2 签名） ----------
 *
 * 每个用户在本机首次使用时生成一对 Ed25519 密钥，私钥以 PEM 明文存于
 * userData/sign.key（它只用于「本机数据完整性自证」，不含任何机密信息；
 * 被拷走也不会泄露用户文档内容 —— 那由数据库加密口令另外守护）。
 * 私钥不落盘到仓库、不随源码分发，彻底移除此前「内置私钥」的公开泄露面。
 */
function signKeyFile() {
  return path.join(app.getPath('userData'), 'sign.key');
}

/**
 * 初始化用户数据签名密钥：读已有密钥，否则生成一对并落盘。
 * 必须在任何 packSign.sign/verify 调用（数据库 .sig 的写入/校验）之前执行。
 */
function initSigningKey() {
  const f = signKeyFile();
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j && j.v === 1 && typeof j.privateKeyPem === 'string' && j.privateKeyPem) {
      packSign.configure({ privateKeyPem: j.privateKeyPem });
      return;
    }
  } catch (e) {}
  // 生成新密钥对并落盘
  const kp = packSign.generateKeyPair();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ v: 1, algo: 'ed25519', privateKeyPem: kp.privateKeyPem }, null, 2));
  packSign.configure({ privateKeyPem: kp.privateKeyPem });
}

/** 探测磁盘上的数据库文件是否为加密格式（无需口令） */
function dbFileIsEncrypted() {
  try {
    const p = path.join(readDataDir(), 'archive.db');
    return fs.existsSync(p) && cryptoSvc.isEncrypted(fs.readFileSync(p));
  } catch (e) {
    return false;
  }
}

/**
 * 打开指定目录下的数据库：明文库直接打开；加密库先尝试密钥文件（DPAPI 自动解锁），
 * 失败则进入 locked 状态，等待渲染层 UnlockGate 输入口令。
 *
 * 启动（tryBootDb）与「修复重指目录」（reloadDataDir）共用这一条路径——
 * 保证「启动时怎么开库」与「修复后重开库」行为完全一致，不出现两套分叉逻辑。
 *
 * ★ 幂等前提：调用方必须确保当前没有已打开的数据库（`db.init` 内部 `if (db) return`
 *   会直接跳过）。修复场景下 `db` 恒为 null（init 失败时从未成功赋值），故成立。
 *
 * @returns {Promise<{ok:boolean, reason?:string, locked?:boolean}>}
 */
async function openDatabase(dir) {
  // 先初始化用户数据签名密钥 —— db.init 会在写 archive.db.sig 时调用 packSign.sign，
  // 若此时未配置密钥会抛错。幂等：已有密钥则直接复用，不会重复生成。
  initSigningKey();
  if (!dbFileIsEncrypted()) {
    try {
      await db.init(dir);
      state.locked = false;
      // ★ 完整性不通过 → 强制只读 ★
      //   即便数据目录物理可写（checkWritable=true），只要检出库被外部改过，
      //   也必须降级为只读：否则用户继续正常使用，改动会不断叠加在被篡改的内容上，
      //   既污染证据、又让「从备份恢复」变得更难判断该回到哪个状态。
      //   注意 persistNow 层已独立拒绝重新签名（防洗白），这里是第二道闸：
      //   直接从 state.writable 层面把写入口关掉，UI 会显示全局只读气泡。
      state.writable = db.checkWritable() && !db.isIntegrityCompromised();
      return { ok: true };
    } catch (e) {
      // 明文库打开失败（文件损坏 / 被云同步或杀软占用 / 拷贝中途损坏）：
      // 绝不能让 db 停在 null + locked=false 的不一致态——那会让 app:boot 在
      // db.allSettings() 处炸出 `Cannot read properties of null (reading 'prepare')`，
      // 前端卡死在启动屏、或误导向"重新注册"却注册不了。这里记一个可读错误，
      // 前端据此显示"数据库不可用"提示而非崩溃。
      //
      // ★ 若这次失败同时伴随「完整性不通过」（库里被改坏到 sql.js 都解析不了），
      //   把这一点追加进错误文案：用户看到的不该只是笼统的"打开失败"，
      //   而是"文件被改过"这个真正的原因，才能知道该从备份恢复而不是反复重试。
      // ★ 文案走主进程字典（Beta.271）★
      //   dbError 会经 app:boot 送到渲染层的「数据库不可用」屏。此处是整块链路里
      //   **唯一**知道失败细节的地方，而渲染层此刻连设置表都读不到，
      //   所以只能在这里翻好再传（语言由 main.js 在 tryBootDb 后 initFromSettings /
      //   initFromCache 定好；openDatabase 由 tryBootDb 调用，时序上必然在其后）。
      //   e.message 是内核异常原文（sql.js / fs），不翻译——它要能被人搜到。
      const integ = db.isIntegrityCompromised()
        ? '\n' + i18n.t('sys.dbTampered', { reason: i18n.logText(db.getIntegrityReason()) })
        : '';
      const reason = i18n.t('sys.dbOpenFailed', { dir, msg: e.message }) + integ;
      state.dbError = reason;
      state.locked = false;
      state.writable = false; // 库都没打开，一律视为不可写
      return { ok: false, reason };
    }
  }
  const kf = readKeyFile();
  if (kf && kf.pass) {
    try {
      const salt = cryptoSvc.readSalt(fs.readFileSync(path.join(dir, 'archive.db')));
      const key = cryptoSvc.deriveKey(kf.pass, salt);
      await db.init(dir, { key });
      state.locked = false;
      // 加密库同理：完整性不通过 → 只读（见明文分支的说明）
      state.writable = db.checkWritable() && !db.isIntegrityCompromised();
      return { ok: true };
    } catch (e) {
      /* 密钥文件失效（如系统账户变更），转手动解锁 */
    }
  }
  state.locked = true; // db.init 未完成：db 为 null，等待 security:unlock
  return { ok: true, locked: true };
}

/** 启动流程：按指针目录打开数据库 */
async function tryBootDb() {
  return openDatabase(readDataDir());
}

module.exports = {
  pointerFile,
  readDataDir,
  writeDataDir,
  getMac,
  keyFile,
  readKeyFile,
  writeKeyFile,
  removeKeyFile,
  initSigningKey,
  dbFileIsEncrypted,
  tryBootDb,
  reloadDataDir
};
