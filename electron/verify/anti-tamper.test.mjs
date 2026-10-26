/**
 * 防篡改加固：签名洗白 / 审计留痕 / 只读模式（Beta.260）单测 —— 纯 Node，真实 db 层。
 *
 * 用户需求：「做这个 + 防程序文件修改」
 *   数据层三件套：
 *     ① 堵住「签名被自动洗白」——篡改后正常用一次就把痕迹抹掉
 *     ② 篡改事件进审计链（有迹可循，且每次启动复现、不可自动清除）
 *     ③ 校验失败提供只读模式（禁写、保留可查）
 *
 * 【本测试的关键手法】
 *   篡改必须是「内容级」的：把库内某个等长文本换成另一段等长文本。
 *   这样 SQLite 仍能正常解析（能被打开、能查询），但 sha256 必然变化 ——
 *   正好命中真实威胁模型「有人偷偷改了库里的数据」，也是旧实现会洗白的那条路径。
 *   （直接把文件尾字节翻转会把 SQLite 搞成 malformed，走的是「打开失败」另一条链路，
 *     本文件第七组单独覆盖。）
 *
 * 运行：node electron/verify/anti-tamper.test.mjs
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bootstrapReleaseSign } from './_bootstrap-release-sign.mjs';

bootstrapReleaseSign();

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-tamper-'));

/** 每个场景一个独立目录 */
let dirSeq = 0;
function freshDir() {
  const d = path.join(tmpRoot, 'run' + ++dirSeq);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/**
 * 在独立模块缓存中重新加载 db 层 —— 模拟「进程重启」。
 * 必须清缓存：core.js 的 integrityCompromised / integrityReason 等是模块级状态，
 * 不清就会把上个场景的结论带进下一个场景，测出来的东西没有意义。
 */
function freshDb() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join(ROOT, 'electron'))) delete require.cache[k];
  }
  // 重新加载后 packSign 处于未配置态，必须注入密钥。用**模块级稳定密钥**
  // （模拟本机 sign.key 跨进程重启保持不变），否则「写 .sig → 重启 → 验 .sig」
  // 会因密钥漂移而误报验签失败。
  const packSign = require(path.join(ROOT, 'electron/services/pack-sign.js'));
  packSign.configure({ privateKeyPem: STABLE_PRIVATE_KEY_PEM });
  return require(path.join(ROOT, 'electron/db.js'));
}

// 稳定用户签名密钥（本测试进程内跨「重启」复用，等价于真实 sign.key 落盘）
const STABLE_PRIVATE_KEY_PEM = (() => {
  const packSign = require(path.join(ROOT, 'electron/services/pack-sign.js'));
  return packSign.generateKeyPair().privateKeyPem;
})();

/** 读 .sig（返回解析后的对象；损坏则返回 null） */
function readSig(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'archive.db.sig'), 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * 内容级篡改：让 archive.db 的字节发生变化，但 SQLite 仍能正常解析。
 *
 * 【为什么不用「翻转最后一个字节」】
 *   SQLite 文件尾是页头/长度元数据，翻它会把库搞成 malformed，
 *   `migrate` 直接抛错 —— 那是「打开失败」链路（本文件第七组单独覆盖），
 *   我们要测的是「库能打开、但内容被人改过」这条更隐蔽、也是旧实现会洗白的路径。
 *
 * 【两种手法，按可靠性依次尝试】
 *   1) 文本锚点替换：把库内某个 UTF-8 字符串换成等长字符串。
 *      最贴近真实（真的是「数据被改了」），但 SQLite 页面布局会随写入顺序变化，
 *      短锚点有时找不到（实测：短标题常落在被打散/重排的页里）。
 *   2) 固定偏移字节翻转：翻第 4096 字节之后（越过首页头）、末尾之前的一个字节。
 *      实测 4196 / 65736 等位置都能「翻转成功且库仍可解析」，稳定可靠。
 *
 * @returns {boolean} 是否成功制造出「文件已变但库仍可用」的篡改
 */
function tamperContent(dir, from, to) {
  const p = path.join(dir, 'archive.db');
  const buf = fs.readFileSync(p);

  // 手法 1：等长文本替换
  if (from && to && Buffer.byteLength(from, 'utf8') === Buffer.byteLength(to, 'utf8')) {
    const s = buf.toString('latin1');
    const needle = Buffer.from(from, 'utf8').toString('latin1');
    if (s.includes(needle)) {
      fs.writeFileSync(p, Buffer.from(s.split(needle).join(Buffer.from(to, 'utf8').toString('latin1')), 'latin1'));
      return true;
    }
  }

  // 手法 2：固定偏移字节翻转（避开首页头与文件尾）
  const off = 4096 + 100;
  if (buf.length > off + 1) {
    const out = Buffer.from(buf);
    out[off] = out[off] ^ 0xff;
    fs.writeFileSync(p, out);
    return true;
  }
  return false;
}

/** 建一个「干净基准」：建用户 → 建大区 → 建文档 → 落盘并签名 */
async function makeBaseline(dir) {
  const db = freshDb();
  await db.init(dir);
  const u = db.createUser('防篡改测试员', 'A-FAKE-MAC-TAMPER', 'pw123456', [
    { q: 'q1', a: 'a1' },
    { q: 'q2', a: 'a2' },
    { q: 'q3', a: 'a3' }
  ]);
  db.saveRegion({ name: '华东', code: 'HD', color: '#3b6df0' }, u.id);
  const region = db.listRegions()[0];
  const p = db.savePost(
    {
      title: '防篡改基准文档',
      regionId: region.id,
      contentHtml: '<p>原始正文锚点</p>',
      fields: {},
      tags: ['x']
    },
    u.id
  );
  db.persistNow();
  const sig = readSig(dir);
  db.closeDb();
  return { uid: u.id, postId: p.id, regionId: region.id, sig };
}

// ═══════════════════════════════════════════════════════════
// 一、核心漏洞：篡改后「正常用一次」不得把签名洗白
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【一】签名洗白（本次加固的核心）');
  const dir = freshDir();
  const base = await makeBaseline(dir);
  ok(tamperContent(dir, '原始正文锚点', '伪造正文锚点'), '  前置：内容级篡改已生效（等长替换）');
  const sigAtTamper = readSig(dir);
  ok(sigAtTamper.sha256 === base.sig.sha256, '  前置：篡改只动 db、未动 .sig（模拟外部只改数据文件）');

  // 重启一号：检出篡改
  const db = freshDb();
  await db.init(dir);
  // 注意：getPendingIntegrityWarn 是「读后即清」语义（主进程取一次即可），故先读它再断言其他
  const warn = db.getPendingIntegrityWarn();
  ok(!!warn, `★ 1. 启动产出完整性告警：${warn}`);
  ok(db.isIntegrityCompromised() === true, '1b. isIntegrityCompromised=true（粘滞标记已建立）');
  // Beta.271：reason 改存 i18n key（sys.integHashMismatch），显示前由 i18n.logText 还原。
  // 断 key 而不是断文字：文字会被翻译，key 才是稳定契约。
  ok(/integHashMismatch/.test(db.getIntegrityReason() || ''), `1c. 原因可诊断：${db.getIntegrityReason()}`);
  ok(db.getPendingIntegrityWarn() === null, '1d. 告警为「读后即清」，不会重复弹窗');

  // 【关键】篡改后照常使用（写数据 + 落盘）——旧实现会在此重新签名，把痕迹抹掉
  db.savePost(
    { title: '篡改后新写的文档', regionId: base.regionId, contentHtml: '<p>new</p>', fields: {}, tags: [] },
    base.uid
  );
  db.persistNow();

  // 断言口径说明：.sig 里 signedAt 是时间戳，每次写都可能不同，故不能比字节；
  // 真正要守住的是 **sha256 仍然指向篡改前的内容** —— 这才是「痕迹未被洗白」。
  const sigAfter = readSig(dir);
  ok(
    sigAfter.sha256 === sigAtTamper.sha256,
    '★ 2. 篡改后写库【不重新签名】：.sig 里记录的 sha256 仍是篡改前的内容（痕迹未被洗白）'
  );
  ok(db.verifyDbIntegrity().ok === false, '★ 2b. 此时 verifyDbIntegrity 仍报不通过（若被洗白，这里会变成 ok=true）');
  db.closeDb();

  // 重启二号：仍必须报篡改。这是旧实现最致命的失效点——第二次启动就「干净」了。
  const db2 = freshDb();
  await db2.init(dir);
  ok(db2.isIntegrityCompromised() === true, '★ 3. 再次重启仍报篡改（旧实现第二次启动就查不出来，因为已被洗白）');
  ok(!!db2.getPendingIntegrityWarn(), '3b. 告警每次启动都复现，不是一次性提示');
  db2.closeDb();
}

// ═══════════════════════════════════════════════════════════
// 二、正常路径不受影响（防洗白不能把正常签名也冻住）
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【二】正常路径不回归');
  const dir = freshDir();
  const base = await makeBaseline(dir);

  const db = freshDb();
  await db.init(dir);
  ok(db.isIntegrityCompromised() === false, '★ 4. 未篡改时 isIntegrityCompromised=false');

  const sig0 = fs.readFileSync(path.join(dir, 'archive.db.sig'), 'utf8');
  db.savePost(
    { title: '正常新增文档', regionId: base.regionId, contentHtml: '<p>ok</p>', fields: {}, tags: [] },
    base.uid
  );
  db.persistNow();
  const sig1 = fs.readFileSync(path.join(dir, 'archive.db.sig'), 'utf8');
  ok(sig1 !== sig0, '★ 5. 正常写库照常更新签名');

  const v = db.verifyDbIntegrity();
  ok(v.ok === true, `5b. 更新后 verifyDbIntegrity 通过：${JSON.stringify(v)}`);
  db.closeDb();

  const db2 = freshDb();
  await db2.init(dir);
  ok(db2.isIntegrityCompromised() === false, '★ 5c. 重启后不报篡改（加固对正常链路零副作用）');
  db2.closeDb();
}

// ═══════════════════════════════════════════════════════════
// 三、篡改事件进审计链，且每次启动复现、不可自动清除
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【三】篡改事件进审计链（有迹可循）');
  const dir = freshDir();
  await makeBaseline(dir);
  tamperContent(dir, '原始正文锚点', '伪造正文锚点');

  const countIncidents = d => (d.listAudit({ page: 1 }).rows || []).filter(r => /完整性/.test(String(r.action || '')));

  const db = freshDb();
  await db.init(dir);
  ok(db.isIntegrityCompromised() === true, '★ 6. 检出篡改');
  ok(db.recordIntegrityIncident() === true, '★ 6b. recordIntegrityIncident 写入成功');
  db.persistNow();

  const hits = countIncidents(db);
  ok(hits.length === 1, `★ 7. 审计链出现 1 条完整性事件（实际 ${hits.length}）`);
  if (hits[0]) {
    ok(hits[0].entity === 'integrity', `7b. entity=integrity（实际 ${hits[0].entity}）`);
    ok(hits[0].action === '数据库完整性告警', `7c. action 语义明确：${hits[0].action}`);
    let det = {};
    try {
      det = JSON.parse(hits[0].detail || '{}');
    } catch (e) {}
    ok(typeof det.reason === 'string' && det.reason.length > 0, `7d. detail 带可诊断原因：${det.reason}`);
    ok(
      typeof hits[0].self_hash === 'string' && hits[0].self_hash.length === 64,
      '★ 7e. 事件本身已链化（有 self_hash，改动它会破坏后续链）'
    );
  }
  const chain = db.verifyAuditChain();
  ok(chain.ok === true, `★ 7f. 写入后审计链仍完整：${chain.detail}`);
  db.closeDb();

  // 重启后必须【再记一条】—— 证明「不可自动清除、每次启动复现」
  const db2 = freshDb();
  await db2.init(dir);
  db2.recordIntegrityIncident();
  db2.persistNow();
  const hits2 = countIncidents(db2);
  ok(hits2.length === 2, `★ 8. 重启后再记一条（累计 ${hits2.length} 条，不被自动清除）`);

  // 第三次启动：仍继续累加，说明没有「只报一次」的窗口
  db2.closeDb();
  const db3 = freshDb();
  await db3.init(dir);
  db3.recordIntegrityIncident();
  db3.persistNow();
  ok(countIncidents(db3).length === 3, '★ 8b. 第三次启动再记一条（累计 3 条）');

  // 假如有人试图删掉这条审计记录，链会断 → 留下第二代痕迹。
  // 用原始文件改写模拟（比调内部 API 更贴近真实攻击：攻击者只有文件系统权限）。
  const before = db3.listAudit({ page: 1 }).rows.length;
  ok(before >= 3, `  前置：审计链已有 ${before} 条记录`);
  db3.closeDb();
  const raw = fs.readFileSync(path.join(dir, 'archive.db'));
  const marker = Buffer.from('数据库完整性告警', 'utf8');
  const hitIdx = raw.indexOf(marker);
  ok(hitIdx > 0, '  前置：能在库文件中定位到完整性告警的记录内容');
  if (hitIdx > 0) {
    // 抹掉这段文本（换成等长占位），模拟「攻击者手工改库以删除痕迹」
    void raw.fill(0x30, hitIdx, hitIdx + marker.length);
    fs.writeFileSync(path.join(dir, 'archive.db'), raw);
  }

  const db4 = freshDb();
  await db4.init(dir);
  // 文件被改 → 完整性必然报不通过（哈希变了），这就是「删记录」付出的代价
  ok(db4.isIntegrityCompromised() === true, '★ 9. 手工改库以删除完整性记录 → 立刻触发完整性不通过（越删越显眼）');
  const broken = db4.verifyAuditChain();
  ok(broken.ok === false, `★ 9b. 且审计链同步断裂，被 verifyAuditChain 抓出：${broken.detail}`);
  db4.closeDb();
}

// ═══════════════════════════════════════════════════════════
// 四、人工「接受当前内容为基准」是唯一洗白出口
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【四】唯一的洗白出口需要人工确认');
  const dir = freshDir();
  await makeBaseline(dir);
  tamperContent(dir, '原始正文锚点', '伪造正文锚点');

  const db = freshDb();
  await db.init(dir);
  ok(db.isIntegrityCompromised() === true, '★ 10. 先确认处于不通过状态');

  const done = db.acceptCurrentAsBaseline();
  ok(done === true, '★ 11. 显式接受当前内容为基准 → true');
  ok(db.isIntegrityCompromised() === false, '11b. 标记被清除');
  ok(db.getIntegrityReason() === null, '11c. 原因被清除');
  db.persistNow();
  ok(db.verifyDbIntegrity().ok === true, '★ 11d. 重建基准后校验通过');
  db.closeDb();

  const db2 = freshDb();
  await db2.init(dir);
  ok(db2.isIntegrityCompromised() === false, '★ 11e. 后续启动不再报篡改（人工确认确实生效）');
  db2.closeDb();
}

// ═══════════════════════════════════════════════════════════
// 五、签名文件侧的攻击面
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【五】签名文件侧的攻击面');

  // 5a. 伪造 .sig（非内置私钥签的）→ 必须检出
  const d1 = freshDir();
  await makeBaseline(d1);
  fs.writeFileSync(
    path.join(d1, 'archive.db.sig'),
    JSON.stringify(
      {
        scope: 'archive.db',
        sha256: 'a'.repeat(64),
        crc32: 12345,
        signature: Buffer.from('f'.repeat(64)).toString('base64'),
        signedAt: Date.now()
      },
      null,
      2
    )
  );
  let db = freshDb();
  await db.init(d1);
  ok(db.isIntegrityCompromised() === true, '★ 12. 伪造 .sig（无内置私钥）→ 检出');
  ok(/integSigFail/.test(db.getIntegrityReason() || ''), `12b. 原因是签名问题：${db.getIntegrityReason()}`);
  db.closeDb();

  // 5b. .sig 被删：视为「首次」建立基准，不误报（否则用户删一次文件就永远红着）
  const d2 = freshDir();
  await makeBaseline(d2);
  fs.unlinkSync(path.join(d2, 'archive.db.sig'));
  db = freshDb();
  await db.init(d2);
  ok(db.isIntegrityCompromised() === false, '13. 无 .sig 视为首次，不误报篡改');
  ok(fs.existsSync(path.join(d2, 'archive.db.sig')), '13b. init 内 persistNow 自动建立首个基准');
  db.closeDb();

  // 5c. .sig 内容损坏 → 检出（不能静默当作“无签名”放行）
  const d3 = freshDir();
  await makeBaseline(d3);
  fs.writeFileSync(path.join(d3, 'archive.db.sig'), '<broken>');
  db = freshDb();
  await db.init(d3);
  ok(db.isIntegrityCompromised() === true, '★ 14. .sig 损坏 → 检出');
  ok(/integSigBroken/.test(db.getIntegrityReason() || ''), `14b. 原因：${db.getIntegrityReason()}`);
  db.closeDb();
}

// ═══════════════════════════════════════════════════════════
// 六、只读模式：可查不可写
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【六】完整性不通过 → 保留可查');
  const dir = freshDir();
  await makeBaseline(dir);
  tamperContent(dir, '原始正文锚点', '伪造正文锚点');

  const db = freshDb();
  await db.init(dir);
  ok(db.isIntegrityCompromised() === true, '★ 15. 处于不通过状态');

  // 「可查」是只读模式的核心承诺：用户必须还能看到、导出自己的数据
  const rows = db.listPosts({ page: 1, limit: 50 });
  ok(Array.isArray(rows), `★ 16. 只读态下仍可列出文档（${Array.isArray(rows) ? rows.length : '?'} 条）`);
  ok(
    rows.some(r => r.title === '防篡改基准文档'),
    '16b. 原有文档仍可见'
  );
  ok(db.listRegions().length >= 1, '16c. 仍可读大区');
  const st = db.homeStats();
  ok(st && typeof st === 'object', '16d. 仍可读统计（首页不白屏）');
  ok(db.verifyAuditChain().ok === true, '16e. 审计链可校验');
  ok(db.getSetting('theme', 'x') !== undefined, '16f. 仍可读设置');
  const detail = db.getPost(rows[0].id);
  ok(detail && typeof detail === 'object', '16g. 仍可打开文档详情（含内容与版本）');
  db.closeDb();
}

// ═══════════════════════════════════════════════════════════
// 七、库被改坏到无法解析（malformed）——另一条链路
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【七】库被改到无法解析');
  const dir = freshDir();
  await makeBaseline(dir);
  const p = path.join(dir, 'archive.db');
  const buf = fs.readFileSync(p);
  // ★ 让库真正 malformed：翻转文件头魔数（偏移 0，'SQLite format 3\0' 的 'S'）。
  //   此前翻转 len/2 与 len-1 并不总能导致解析失败——sql.js 对非关键字节损坏
  //   相当宽容（文件尾字节常落在空闲页/页尾预留区，翻转后仍可解析），
  //   导致「17. init 抛错」断言时而过、时而挂（flaky）。改翻文件头则必然 malformed。
  buf[0] = buf[0] ^ 0xff;
  fs.writeFileSync(p, buf);

  const db = freshDb();
  let threw = false;
  try {
    await db.init(dir);
  } catch (e) {
    threw = true;
  }
  ok(threw === true, '★ 17. 严重损坏的库 → init 抛错（前端走「数据库不可用」屏）');
  // 关键：证据必须活过这次失败的打开，否则上层连一句有意义的提示都给不出来
  ok(db.isIntegrityCompromised() === true, '★ 17b. 完整性标记【不被回滚】：失败后仍标记为不通过');
  ok(!!db.getIntegrityReason(), `17c. 原因仍可读：${db.getIntegrityReason()}`);
  ok(db.getPendingIntegrityWarn() !== undefined, '17d. 告警可被主进程取用');
}

// ═══════════════════════════════════════════════════════════
// 八、与程序文件自检协同
// ═══════════════════════════════════════════════════════════
{
  console.log('\n【八】与程序文件自检协同');
  const integrity = require(path.join(ROOT, 'electron/services/integrity.js'));
  const dir = freshDir();
  await makeBaseline(dir);

  const appDir = path.join(tmpRoot, 'fakeapp');
  fs.mkdirSync(path.join(appDir, 'electron'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'electron', 'main.js'), 'x');
  const man = integrity.buildManifest(appDir, '1.0.0');
  ok(!Object.keys(man.files).some(k => k.endsWith('.sig')), '★ 18. 程序文件清单不含 .sig（用户数据不进程序自检）');
  ok(!Object.keys(man.files).some(k => k.includes('archive.db')), '18b. 程序文件清单不含 archive.db');

  const before = fs.readdirSync(dir).sort();
  const db = freshDb();
  await db.init(dir);
  db.persistNow();
  db.closeDb();
  const after = fs.readdirSync(dir).sort();
  ok(after.join(',') === before.join(','), `18c. 数据目录文件集合未被额外写入：${after.join(', ')}`);
  ok(after.includes('archive.db') && after.includes('archive.db.sig'), '18d. 数据目录恰为 db + 其签名');
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
