'use strict';
/**
 * 程序文件完整性自检（防「程序自身被改」）
 *
 * 【它解决什么】
 *   打包时对 resources/app.asar.unpacked/ 下的程序文件（sql.js 的 wasm 等
 *   无法打进 asar 的二进制/资源）逐文件算 sha256+crc32，汇总成一份清单并用
 *   内置 Ed25519 私钥签名，落盘为 resources/app-integrity.json。
 *   每次启动时重新扫描同一批文件、比对清单，任何「改 / 增 / 删」都能被检出，
 *   产出一份可诊断报告（哪个文件、原来什么哈希、现在什么哈希）。
 *
 * 【为什么现在只覆盖 app.asar.unpacked】
 *   程序主体（electron/*.js、dist/index.html、package.json）已全部打进
 *   resources/app.asar，由 **Electron 原生 asar 完整性校验**守护：
 *   头哈希写进 Archbox.exe 的 PE 资源（type=INTEGRITY / name=ELECTRONASAR），
 *   校验逻辑驻留在 exe 二进制内部，应用代码无法触碰；不匹配时 Electron 直接
 *   console.error + process.exit(1)，**早于 electron/main.js**。
 *   因此主程序文件不再需要本模块重复覆盖，既省启动开销，也避免「裁判与选手
 *   同目录」的自证弱点。
 *   剩下的真空地带是 asarUnpack 解出来的文件——它们在 app.asar 之外、
 *   不被 asar 头哈希覆盖，正是本模块要补的位置。
 *
 * 【边界（必须如实告知用户）】
 *   unpacked 层仍是「自建签名清单」路线：裁判（公钥 + 清单）与选手（被校验的
 *   文件）都在 resources/ 下，攻击者若同时改掉文件与清单、甚至换掉内嵌公钥
 *   重签，理论上可绕过。它提供的是「有迹可循」而非「绝对不可改」：
 *     - 挡住绝大多数无意改动 / 杀软静默改文件 / 第三方工具顺手的替换；
 *     - 任何改动都会留下可复现的记录（审计链落痕，且不可自动清除）；
 *     - asar 层由 exe 内部的 Electron fuse 硬保证，不在此弱化范围内。
 *
 * 【为什么本模块不 require('electron')】
 *   verify/ 下的纯 Node 单测要直接驱动它（生成清单、制造篡改、跑自检），
 *   一旦硬依赖 electron 运行时就会崩。文件遍历全部走注入的目录参数，
 *   调用方（main.js / afterPack.js）负责传入真实路径。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const releaseSign = require('./release-sign');
const i18n = require('../i18n');

/** SHA-256 十六进制摘要（纯工具，无状态，供清单文件哈希使用） */
function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* CRC32（标准多项式 0xEDB88320），与 pack-sign 同口径，纯工具无状态 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32Of(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 清单文件名（与 app 目录同级，放在 resources/ 下，不进 asar 内部） */
const MANIFEST_NAME = 'app-integrity.json';

/** 清单覆盖范围的标识值 */
const SCOPE_UNPACKED = 'asar-unpacked';
const SCOPE_APP = 'app-files';

/** asar 归档文件名与解包目录名 */
const ASAR_NAME = 'app.asar';
const UNPACKED_NAME = 'app.asar.unpacked';

/**
 * 纳入自检的文件后缀白名单。
 * 只覆盖「代码与静态资源」，刻意排除：
 *   - 用户数据（数据目录在 userData 下，根本不在 resources/ 内）
 *   - 日志、备份、临时文件
 *   - 原生二进制（*.node / *.dll / *.exe）——体积大且每次打包哈希不稳，
 *     且 Electron 自身文件由 fuse 与签名机制覆盖，重复校验收益低
 */
const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.vue', '.json', '.html', '.htm', '.css', '.wasm']);

/** 自检时永不纳入的路径片段（相对根目录）：构建中间产物、依赖目录、缓存 */
const EXCLUDE_SEGMENTS = [
  'node_modules',
  '.vite',
  '.cache',
  'verify', // 校验脚本与测试夹具，不参与生产包自检（已在构建时排除出包）
  'release'
];

/** 自检时永不纳入的文件名（精确匹配） */
const EXCLUDE_NAMES = new Set([
  MANIFEST_NAME,
  '.DS_Store',
  'LICENSE',
  'LICENSES.chromium.html', // Electron 自带，体积大且随 Electron 版本变
  'version', // Electron 自带
  'package-lock.json' // 打包后可能被重写，且对代码完整性无意义
]);

/**
 * 判断相对路径是否纳入自检。
 * @param {string} rel 相对扫描根的路径（用 / 分隔）
 * @param {{includeNodeModules?:boolean}} [opts]
 *   includeNodeModules=true 时放行 node_modules/** —— 专供 app.asar.unpacked 范围
 *   （该目录的全部内容都在 node_modules 下，排除它就等于清单为空、防护失效）。
 */
function shouldInclude(rel, opts = {}) {
  const segs = rel.split(/[\\/]/);
  const excluded = opts.includeNodeModules ? EXCLUDE_SEGMENTS.filter(s => s !== 'node_modules') : EXCLUDE_SEGMENTS;
  if (segs.some(s => excluded.includes(s))) return false;
  const base = segs[segs.length - 1];
  if (EXCLUDE_NAMES.has(base)) return false;
  // package.json 需要保留（版本号与入口声明关键），故在此之前不排除
  const ext = path.extname(base).toLowerCase();
  return CODE_EXTS.has(ext);
}

/**
 * 判定一个目录项是「目录 / 文件 / 都不是」。
 *
 * 【为什么需要回退】
 *   Electron 给 Node 的 fs 打了 asar 补丁，使 app.asar 可被当目录读。
 *   但该补丁对 `readdirSync(dir,{withFileTypes:true})` 返回的 Dirent
 *   在部分版本上 `isDirectory()/isFile()` 会双双返回 false（虚拟路径无法
 *   映射到真实 inode 类型）。若此时直接 `continue`，会把**所有** asar 内
 *   文件都漏掉，导致自检把「读不到」误判成「文件被删除」→ 假告警 + 审计链
 *   被污染。故此处对 Dirent 类型不可信的条目回退一次 statSync 判定。
 *
 * @returns {'dir'|'file'|'other'}
 */
function classifyEntry(abs, ent) {
  if (ent) {
    if (ent.isDirectory()) return 'dir';
    if (ent.isFile()) return 'file';
    if (ent.isSymbolicLink && ent.isSymbolicLink()) return 'other';
  }
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) return 'dir';
    if (st.isFile()) return 'file';
  } catch (e) {
    // 读不到（权限/afs 边界）——视作 other，不参与比对，避免误报
  }
  return 'other';
}

/**
 * 递归扫描目录，返回「相对路径 -> { sha256, crc32, size }」映射。
 * 结果按 key 排序，保证同一份代码两次生成完全一致的清单（便于 diff 与断言）。
 *
 * ★ opts.includeNodeModules：asar 部署下必须为 true ★
 *   app.asar.unpacked 的**全部内容**都在 node_modules/ 下（asarUnpack 解出来的
 *   就是依赖文件）。若沿用 EXCLUDE_SEGMENTS 里的 'node_modules' 排除规则，
 *   扫描结果会是空 {"": 0 个文件} —— 清单形同虚设，第二层防护完全失效
 *   （Beta.261 首次打包实测 fileCount=0，正是这个坑）。
 *   故按「扫描范围」区分语义：
 *     - 扫整个 app 目录（旧 asar:false 部署）：node_modules 是噪声，排除；
 *     - 扫 app.asar.unpacked（asar 部署）：node_modules 是被保护对象，保留。
 *   同理保留 verify 的排除（校验脚本永不自检），但 unpacked 里本来也没有它。
 *
 * @param {string} rootDir 扫描根
 * @param {{includeNodeModules?:boolean}} [opts]
 */
function scanFiles(rootDir, opts = {}) {
  const out = {};
  if (!rootDir || !fs.existsSync(rootDir)) return out;
  const includeNodeModules = !!opts.includeNodeModules;
  const excluded = includeNodeModules ? EXCLUDE_SEGMENTS.filter(s => s !== 'node_modules') : EXCLUDE_SEGMENTS;
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      const kind = classifyEntry(abs, ent);
      if (kind === 'dir') {
        if (excluded.includes(ent.name)) continue;
        walk(abs);
        continue;
      }
      if (kind !== 'file') continue;
      if (!shouldInclude(rel, { includeNodeModules })) continue;
      let buf;
      try {
        buf = fs.readFileSync(abs);
      } catch (e) {
        continue;
      }
      out[rel] = { sha256: sha256Hex(buf), crc32: crc32Of(buf), size: buf.length };
    }
  };
  walk(rootDir);
  // 排序输出（对象 key 顺序，保证清单稳定）
  const sorted = {};
  Object.keys(out)
    .sort()
    .forEach(k => {
      sorted[k] = out[k];
    });
  return sorted;
}

/**
 * 判断一个扫描根是否属于「asar unpacked 范围」。
 * 依据目录名而非外部标志位 —— 这样 afterPack / main.js / 单测三处
 * 只要传对目录，语义就自动正确，不会因为某个调用点漏传 opts 而静默失效。
 */
function isUnpackedRoot(rootDir) {
  return path.basename(String(rootDir || '')) === UNPACKED_NAME;
}

/**
 * 判定「asar 归档 与 unpacked 目录」的共存状态。
 *
 * 【它解决什么 —— 一个曾被静默放行的真实漏洞】
 *   verifyAppFiles 原先把两种情况合并为同一个 ok:true 分支：
 *     A. 目录在、清单不在  → 开发态（没走打包钩子），跳过自检，合理；
 *     B. 目录本身不存在    → 却也报「跳过自检」，**静默放行**。
 *   而 asar 头里对 sql-wasm.wasm 等条目明确标了 `unpacked: true`，
 *   这是 Electron 官方的「实体文件应位于 app.asar.unpacked」的声明。
 *   于是「app.asar 在 + app.asar.unpacked 不在」是一个**可判定的矛盾态**：
 *   程序读取该 wasm 时必然失败（sql.js 起不来），根本不是「未启用自检」。
 *   把 unpacked 目录整体删掉，就能让第二层防护彻底消失而无任何痕迹 ——
 *   这正是攻击者最容易走的一步（比逐个改文件省事），必须报出来。
 *
 * 【为什么需要看 asar 头而不是只看目录名】
 *   只看「目录不存在」无法区分「开发态（根本没打包）」与「被打包过、
 *   但 unpacked 被整体删除」。asar 头里的 unpacked 声明提供了外部锚点：
 *     - asar 不存在           → 开发态 / 未启用         → 'not-packaged'
 *     - asar 在，声明了 unpacked，但目录缺失 → 矛盾态     → 'unpacked-missing'
 *     - asar 在，目录也在      → 正常                     → 'ok'
 *   若 asar 里根本没有 unpacked 声明（未被 asarUnpack 命中任何文件），
 *   则 unpacked 目录缺失也不构成矛盾 → 回归 'not-packaged'（不误报）。
 *
 * 【为什么头解析失败要容忍】
 *   头解析走本文件的 readAsarHeaderString（纯 Node 读文件，不依赖任何
 *   构建期包）。只有归档本身损坏/非 asar 时才解析失败 —— 此时不能因为
 *   「解析不了头」就把好程序判成篡改，故降级为 'unknown' 并放行，
 *   由「清单存在与否」这条独立判据继续把关。
 *
 * @param {string} appDir 被校验的目录（打包后为 resources/app.asar.unpacked）
 * @returns {{state:'ok'|'not-packaged'|'unpacked-missing'|'unknown', asarPath:string, declaredUnpacked:string[]}}
 */
function asarStateFor(appDir) {
  const root = path.dirname(String(appDir || ''));
  const asarPath = path.join(root, ASAR_NAME);
  const empty = { asarPath, declaredUnpacked: [] };

  if (!fs.existsSync(asarPath)) return { state: 'not-packaged', ...empty };

  let entries;
  try {
    entries = JSON.parse(readAsarHeaderStringSync(asarPath)).files || {};
  } catch (e) {
    // 归档损坏 / 非 asar —— 无从判定，交由清单判据把关
    return { state: 'unknown', ...empty };
  }

  // 收集头里所有 unpacked 声明（递归，含子目录）
  const declared = [];
  const walk = (nodes, prefix) => {
    for (const name of Object.keys(nodes || {})) {
      const n = nodes[name] || {};
      const rel = prefix ? prefix + '/' + name : name;
      if (n.unpacked) declared.push(rel);
      if (n.files) walk(n.files, rel);
    }
  };
  walk(entries, '');

  if (!declared.length) return { state: 'not-packaged', asarPath, declaredUnpacked: [] };

  const unpackedDir = path.join(root, UNPACKED_NAME);
  return {
    state: fs.existsSync(unpackedDir) ? 'ok' : 'unpacked-missing',
    asarPath,
    declaredUnpacked: declared
  };
}

/**
 * 生成程序文件签名清单对象（供打包钩子写入磁盘）。
 *
 * ★ 签名的覆盖范围 = 除 signature 外的**全部顶层字段** ★
 *   验签的做法是「删掉 signature 后把其余字段重新序列化再验签」，因此任何在
 *   签名之后追加的顶层字段都会让验签失败。早期写法是「先 buildSignedChecksums
 *   (...) 再展开补 version/fileCount」，逐个补的字段落在签名之外 → 验签必失败
 *   （首版冒烟即复现，见测试第 1 组）。故这里改为：先把**完整**载荷拼好（含
 *   version / fileCount / scope），只留一个空位给签名，最后一次性对完整载荷
 *   签名（发布方私钥）。此后新增任何字段都必须加进 payload。
 *
 * ★ scope 的取值决定清单语义，且参与签名 ★
 *   app.asar.unpacked 这类根 → SCOPE_UNPACKED（node_modules 是保护对象，不排除）
 *   其它（整个 app 目录）    → SCOPE_APP（node_modules 是噪声，排除）
 *   试图把 asar 内文件混进 unpacked 清单必须重签，而重签需要发布方私钥
 *   （仅打包机持有，见 release-sign.js）。
 *
 * @param {string} appDir 被校验的根目录（打包后为 resources/app.asar.unpacked）
 * @param {string} [version] 应用版本号，仅作文档用途（便于人眼对照）
 * @returns {{algorithm:string, scope:string, meta:object, files:object, signature:string}}
 */
function buildManifest(appDir, version) {
  const unpacked = isUnpackedRoot(appDir);
  const files = scanFiles(appDir, { includeNodeModules: unpacked });
  const fileCount = Object.keys(files).length;
  // 载荷（签名对象）：所有需要防篡改的字段都在这里，顺序一经确定不得随意调整
  // —— JSON.stringify 对同序对象产生同串，验签依赖这一点。
  const payload = {
    algorithm: 'sha256+crc32/ed25519',
    scope: unpacked ? SCOPE_UNPACKED : SCOPE_APP,
    signedAt: { ts: Date.now() },
    meta: { version: String(version || ''), fileCount },
    files
  };
  return { ...payload, signature: releaseSign.sign(JSON.stringify(payload)) };
}

/**
 * 校验程序文件清单自身的签名（与 buildManifest 的载荷口径严格对应）。
 *
 * 【为什么不用 packSign.verifySignedChecksums】
 *   该函数是给文档包/备份用的（用户本机密钥），语义与错误文案
 *   （「文档包/备份可能被篡改」）都不适合程序自检场景，且它不校验 meta。
 *   这里改用 releaseSign（发布方密钥）验签，并把附加字段（meta / scope）
 *   一并纳入校验范围，避免「meta 可被随意改而无人发现」。
 *
 * @returns {{ok:boolean, reason?:string}}
 */
function verifyManifestSignature(man) {
  if (!man || typeof man !== 'object') return { ok: false, reason: i18n.logText(i18n.errKey('sys.manifestMissing')) };
  const { signature, ...payload } = man;
  if (!signature) return { ok: false, reason: i18n.logText(i18n.errKey('sys.manifestNoSig')) };
  if (!releaseSign.verify(JSON.stringify(payload), signature)) {
    return { ok: false, reason: i18n.logText(i18n.errKey('sys.manifestSigInvalid')) };
  }
  return { ok: true };
}

/** 清单落盘路径（与 app 目录同级）。
 *  传 resources/app.asar.unpacked 或 resources/app 都落在 resources/ —— 同一个文件，
 *  便于 asar / 非 asar 两种部署共用一份清单。 */
function manifestPathFor(appDir) {
  return path.join(path.dirname(appDir), MANIFEST_NAME);
}

/**
 * 把清单写入磁盘。
 * @returns {string} 写入的清单文件路径
 */
function writeManifest(appDir, version) {
  const manifest = buildManifest(appDir, version);
  const out = manifestPathFor(appDir);
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
  return out;
}

/**
 * 运行时自检：重新扫描 appDir，与清单逐项比对，产出**可诊断报告**。
 *
 * @param {string} appDir 被校验根目录
 * @param {object} [manifest] 已解析的清单对象；不传则从 manifestPathFor(appDir) 读取
 * @returns {{
 *   ok: boolean,
 *   reason?: string,          // ok=false 时的人类可读原因
 *   scope?: string,           // 本报告覆盖的范围（来自清单，标注它守的是哪一层）
 *   signatureOk?: boolean,    // 清单自身签名是否通过
 *   checked?: number,         // 实际比对的文件数
 *   missing?: string[],       // 清单有、磁盘没有（被删）
 *   modified?: string[],      // 哈希不一致（被改）
 *   added?: string[],         // 磁盘有、清单没有（被新增）
 *   missingManifest?: boolean // 清单不存在（未启用自检，而非被篡改）
 * }}
 */
function verifyAppFiles(appDir, manifest) {
  if (!appDir || !fs.existsSync(appDir)) {
    // 目录不存在有两种性质完全不同的原因，必须分开（否则真故障会被静默放行）：
    //   - 开发态：压根没打包，asar 与 unpacked 都不在 —— 合理，跳过自检。
    //   - 矛盾态：asar 在，且头里声明了 unpacked 实体，但目录被整体删掉 ——
    //     这是**真实故障**（sql.js 的 wasm 读不到，程序根本起不来），
    //     也是最省事的绕过手段（一次删除就让第二层防护彻底消失）。
    // 详见 asarStateFor 的注释。
    const st = asarStateFor(appDir);
    if (st.state === 'unpacked-missing') {
      return {
        ok: false,
        scope: SCOPE_UNPACKED,
        signatureOk: false,
        dirMissing: true,
        declaredUnpacked: st.declaredUnpacked,
        missing: st.declaredUnpacked,
        modified: [],
        added: [],
        reason:
          i18n.logText(i18n.errKey('sys.appIntegrityDirMissing')) +
          '，' +
          i18n.t('sys.appIntegrityDirMissingDetail', {
            n: st.declaredUnpacked.length,
            sample: st.declaredUnpacked.slice(0, 3).join('、'),
            more: st.declaredUnpacked.length > 3 ? i18n.t('sys.andMore') : ''
          })
      };
    }
    // shouldBlockedDirMissing：调用方若期望「内部一致性」而非「外部可读性」，
    // 可据此区分（当前 UI 只用 ok，故不影响既有行为）。
    return {
      ok: true,
      scope: SCOPE_UNPACKED,
      missingManifest: true,
      asarState: st.state,
      reason: i18n.logText(i18n.errKey('sys.appIntegrityNoDir'))
    };
  }
  let man = manifest;
  if (!man) {
    const mp = manifestPathFor(appDir);
    if (!fs.existsSync(mp)) {
      // 首次运行 / 开发态（未走打包钩子）—— 视为「未启用」，不报篡改
      return {
        ok: true,
        scope: SCOPE_UNPACKED,
        missingManifest: true,
        reason: i18n.logText(i18n.errKey('sys.appIntegrityNoManifest'))
      };
    }
    try {
      man = JSON.parse(fs.readFileSync(mp, 'utf8'));
    } catch (e) {
      return {
        ok: false,
        scope: SCOPE_UNPACKED,
        signatureOk: false,
        reason: i18n.logText(i18n.errKey('sys.appIntegrityManifestBroken'))
      };
    }
  }
  const scope = man.scope || SCOPE_UNPACKED;

  // 第一步：清单自身的签名必须成立（防止清单被随手改掉再骗过逐文件比对）
  const sig = verifyManifestSignature(man);
  if (!sig.ok) {
    return {
      ok: false,
      scope,
      signatureOk: false,
      reason: i18n.logText(i18n.errKey('sys.appIntegritySigFail')) + sig.reason
    };
  }

  const expected = man.files || {};
  // 扫描口径必须与生成清单时一致：unpacked 根要保留 node_modules，
  // 否则比对时会「清单里有、扫描结果里没有」→ 把一堆文件误报成「被删除」。
  const actual = scanFiles(appDir, { includeNodeModules: isUnpackedRoot(appDir) });
  const missing = [];
  const modified = [];
  const added = [];

  for (const rel of Object.keys(expected)) {
    const a = actual[rel];
    if (!a) {
      missing.push(rel);
      continue;
    }
    if (a.sha256 !== expected[rel].sha256) modified.push(rel);
  }
  for (const rel of Object.keys(actual)) {
    if (!expected[rel]) added.push(rel);
  }

  if (missing.length || modified.length || added.length) {
    // 明细三项走 dict：本文件的 reason 会原样进 main.js 的告警弹窗，
    // 是用户直接看到的正文，不能留中文硬编码（与文件头「不 require electron」无关——
    // i18n 模块本身顶层零 electron 依赖，纯 Node 可加载）。
    const parts = [];
    const fmt = (key, arr) =>
      i18n.t(key, {
        n: arr.length,
        sample: arr.slice(0, 5).join('、'),
        more: arr.length > 5 ? i18n.t('sys.andMore') : ''
      });
    if (modified.length) parts.push(fmt('sys.diffModified', modified));
    if (missing.length) parts.push(fmt('sys.diffMissing', missing));
    if (added.length) parts.push(fmt('sys.diffAdded', added));
    return {
      ok: false,
      scope,
      signatureOk: true,
      checked: Object.keys(expected).length,
      missing,
      modified,
      added,
      reason: i18n.logText(i18n.errKey('sys.appIntegrityMismatch')) + parts.join('；')
    };
  }

  return {
    ok: true,
    scope,
    signatureOk: true,
    checked: Object.keys(expected).length,
    missing: [],
    modified: [],
    added: []
  };
}

/**
 * 计算 asar 归档的「头哈希」——即 Electron 原生 asar 完整性校验所比对的值。
 *
 * 算法（与 Electron 内部一致）：
 *   value = sha256( UTF-8 编码的 asar header JSON 字符串 )
 * 头部只描述归档目录结构（文件路径、偏移、大小、每文件 integrity），不覆盖
 * 文件内容本身；Electron 在读取每个文件时用头部里的 per-file integrity 校验
 * 内容，因此「头哈希 + per-file integrity」共同构成对 asar 整体的保护。
 *
 * 本函数不再依赖 @electron/asar / app-builder-lib —— 见 readAsarHeaderString
 * 的方向说明（生产包内没有这些构建期依赖）。
 *
 * ★ 必须是 async ★
 *   调用方（main.js 启动链）await 它；内部实现是同步读文件，但保留 async
 *   签名可让未来切换实现（如超大 asar 分片异步读）不破坏调用方。
 *   asarHeaderHashViaBuilder 仍保留 app-builder-lib 路径，仅测试交叉验证用。
 *
 * @param {string} asarPath app.asar 的绝对路径
 * @returns {Promise<string>} 64 位小写十六进制 sha256
 */
async function asarHeaderHash(asarPath) {
  const headerString = readAsarHeaderStringSync(asarPath);
  return sha256Hex(Buffer.from(headerString, 'utf8'));
}

/**
 * 同步读取 asar 头部 JSON 原文（唯一实现，生产与测试共用）。
 *
 * ★ 方向修正：由「靠构建期包解析」改为「自己按格式读」★
 *   原实现优先 require('@electron/asar')、回退 require('app-builder-lib/...')，
 *   两者都**不在生产包里**（package.json 的 dependencies 只有 sanitize-html 与
 *   sql.js）。生产环境下这条 require 必然抛 MODULE_NOT_FOUND → asarStateFor
 *   恒返回 'unknown'、asarHeaderHash 恒抛错 —— 也就是说「asar 与 unpacked 不
 *   一致」这条判据在成品里其实是哑的（只是被回退逻辑掩盖成了「放行」）。
 *
 * ★ asar 头部格式（electron-builder / @electron/asar 产物）★
 *   偏移 0  uint32 LE  头长度（不含前 8 字节时 = 4 + jsonLen，即 headerSize）
 *   偏移 4  uint32 LE  headerSize（同上口径）
 *   偏移 8  uint32 LE  头部区总字节数（含 8 字节前缀与 4 字节对齐填充）
 *   偏移 12 uint32 LE  头 JSON 的真实字节长度
 *   偏移 16 起         UTF-8 的 JSON 原文，末尾可能带 0~3 字节 0x00 对齐填充
 *   实测样例：4 / 90148 / 90144 / 90138 —— 可见「偏移 12」才是 JSON 净长，
 *   若按偏移 8 截断会把 6 个填充字节当成 JSON 尾巴，sha256 随之出错。
 *   口径核对见 verify/asar-integrity.test.mjs 的「与 builder 逐字节一致」断言。
 *   头里的 per-file integrity 覆盖文件内容，故「头 + integrity」共同保护归档。
 *
 * @param {string} asarPath app.asar 的绝对路径
 * @returns {string} 去掉对齐填充的 UTF-8 JSON 原文
 */
function readAsarHeaderStringSync(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    if (fs.readSync(fd, head, 0, 16, 0) < 16) throw new Error('asar header truncated');
    const jsonLen = head.readUInt32LE(12);
    if (!jsonLen || jsonLen > 64 * 1024 * 1024) throw new Error('asar header size implausible');
    const jsonBuf = Buffer.alloc(jsonLen);
    if (fs.readSync(fd, jsonBuf, 0, jsonLen, 16) < jsonLen) throw new Error('asar header truncated');
    return jsonBuf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 取 asar 头部 JSON 字符串（async 包装，供沿用旧签名的调用方）。
 * @param {string} asarPath app.asar 的绝对路径
 * @returns {Promise<string>}
 */
async function readAsarHeaderString(asarPath) {
  return readAsarHeaderStringSync(asarPath);
}

/**
 * 计算 asar 头部哈希的第三方实现（仅用于交叉验证，生产不调用）。
 * 口径完全对齐 electron-builder 的 hashHeader：sha256(<header 字符串>, utf8)。
 */
async function asarHeaderHashViaBuilder(asarPath) {
  const { readAsarHeader } = require('app-builder-lib/out/asar/asar');
  const { header } = await readAsarHeader(asarPath);
  return sha256Hex(Buffer.from(header, 'utf8'));
}

module.exports = {
  MANIFEST_NAME,
  SCOPE_UNPACKED,
  SCOPE_APP,
  ASAR_NAME,
  UNPACKED_NAME,
  CODE_EXTS,
  EXCLUDE_SEGMENTS,
  EXCLUDE_NAMES,
  shouldInclude,
  classifyEntry,
  isUnpackedRoot,
  asarStateFor,
  scanFiles,
  buildManifest,
  verifyManifestSignature,
  writeManifest,
  manifestPathFor,
  verifyAppFiles,
  readAsarHeaderString,
  readAsarHeaderStringSync,
  asarHeaderHash,
  asarHeaderHashViaBuilder
};
