/**
 * 程序文件完整性自检（防程序自身被改）单测 —— 纯 Node，真实文件系统 + 真实 Ed25519 验签。
 *
 * 用户需求：「做这个 + 防程序文件修改」
 *   即：打包时对程序文件生成签名清单，运行时自检，任何「改 / 增 / 删」都要被检出
 *   并产出可诊断报告（哪个文件、什么类型的不一致）。
 *
 * ★ Beta.261 起口径变更（asar 迁移）★
 *   build.asar=true 后，程序主体（electron/*.js、dist/index.html、package.json）
 *   全部封进 resources/app.asar，由 **Electron 原生 asar 完整性校验**守护
 *   （头哈希写在 Archbox.exe 的 PE 资源里，校验在 exe 二进制内部，
 *   不匹配即 process.exit(1)，早于 main.js —— 见 asar-integrity.test.mjs）。
 *   本模块因此降级为「补充层」，只覆盖 asar 照不到的
 *   resources/app.asar.unpacked（asarUnpack 解出来的 sql.js wasm 等）。
 *   故本测试的夹具目录名与 scope 断言都随之改为 unpacked 口径。
 *
 * 运行：node electron/verify/app-integrity.test.mjs
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

const integ = require(path.join(ROOT, 'electron/services/integrity.js'));

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

/** 搭一个「仿真的打包产物目录」：base/app.asar.unpacked/... + base/app-integrity.json
 *  目录名刻意用 app.asar.unpacked —— 与生产一致，顺带证明含点号的目录名不影响扫描。 */
function makeFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'app-integ-'));
  const appDir = path.join(base, integ.UNPACKED_NAME);
  const put = (rel, content) => {
    const abs = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  // unpacked 目录的真实内容形态：node_modules 下被 asarUnpack 解出来的文件。
  // 注意：EXCLUDE_SEGMENTS 含 'node_modules'，故这些文件其实不会被纳入清单 ——
  // 这正是设计意图（依赖目录不做自检），故此处同时准备「会被纳入的」对照文件。
  put('node_modules/sql.js/dist/sql-wasm.wasm', 'BINARY-WASM');
  put('node_modules/sql.js/dist/sql-wasm.js', "'use strict'\nmodule.exports={}\n");
  // 会被纳入清单的补充文件（对应「asar 之外、又需要自检」的位置）
  put('package.json', JSON.stringify({ name: 'archbox', version: '0.9.0-Beta.261', main: 'electron/main.js' }));
  put('electron/main.js', "'use strict'\nconsole.log('main')\n");
  put('electron/db/core.js', "'use strict'\nmodule.exports = {}\n");
  put('electron/services/integrity.js', "'use strict'\nmodule.exports = {}\n");
  put('dist/index.html', '<html><body>app</body></html>');
  put('scripts/afterPack.js', "'use strict'\nmodule.exports = async () => {}\n");
  // 应被排除的：verify 目录 / LICENSE / version
  put('electron/verify/standardize.test.mjs', 'export default 1');
  put('LICENSE', 'MIT License');
  put('LICENSES.chromium.html', '<html>chromium licenses</html>');
  put('version', '1.2.3');
  return { base, appDir };
}

/** 深拷贝一个对象（用于「篡改清单」类用例，避免污染基准） */
const clone = o => JSON.parse(JSON.stringify(o));

const { base, appDir } = makeFixture();
const manifestPath = integ.writeManifest(appDir, '0.9.0-Beta.261');
const baseline = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// ═══ 一、清单产出本身 ═══
{
  ok(
    manifestPath === path.join(base, 'app-integrity.json'),
    `★ 1. 清单落在被校验目录【同级】（${path.relative(base, manifestPath)}），不在其内部 —— asar 下即 resources/ 而非 app.asar.unpacked/`
  );
  ok(
    baseline.scope === 'asar-unpacked',
    `★ 1b. scope=asar-unpacked（实际 ${baseline.scope}）—— 明确声明只守 asar 之外那层`
  );
  ok(baseline.algorithm === 'sha256+crc32/ed25519', `1c. 算法标注正确（${baseline.algorithm}）`);
  ok(baseline.meta.version === '0.9.0-Beta.261', `1d. 记录应用版本（${baseline.meta.version}）`);
  ok(typeof baseline.signature === 'string' && baseline.signature.length > 40, '1e. 带 Ed25519 签名');

  const keys = Object.keys(baseline.files);
  ok(keys.includes('electron/main.js'), '★ 1f. 纳入 electron/main.js');
  ok(keys.includes('dist/index.html'), '1g. 纳入 dist/index.html');
  ok(keys.includes('package.json'), '1h. 纳入 package.json');
  ok(keys.includes('scripts/afterPack.js'), '1i. 纳入 scripts/afterPack.js');
  ok(
    keys.some(k => k.startsWith('node_modules/')),
    `★ 1j. 纳入 node_modules/**（${keys.filter(k => k.startsWith('node_modules/')).length} 个）—— asar 部署下 unpacked 的内容全在 node_modules 里，排除它就等于清单为空、第二层彻底失效（Beta.261 首包实测 fileCount=0 之坑）`
  );
  ok(!keys.some(k => k.includes('/verify/')), `★ 1k. 排除 electron/verify/（校验脚本不进生产包自检）`);
  ok(
    !keys.includes('LICENSE') && !keys.includes('version') && !keys.includes('LICENSES.chromium.html'),
    '1l. 排除 LICENSE / version / chromium 许可（随 Electron 版本变，不参与代码自检）'
  );
  ok(!keys.includes(integ.MANIFEST_NAME), '★ 1m. 清单自身不进清单（否则哈希自我引用、永不收敛）');

  const f = baseline.files['electron/main.js'];
  ok(f && /^[0-9a-f]{64}$/.test(f.sha256), '1n. 每项含 64 位 hex sha256');
  ok(
    f && typeof f.crc32 === 'number' && f.size === fs.statSync(path.join(appDir, 'electron/main.js')).size,
    `1o. 每项含 crc32 与 size（size=${f && f.size}）`
  );

  ok(
    baseline.meta.fileCount === keys.length,
    `1p. fileCount 与实际条数一致（${baseline.meta.fileCount} / ${keys.length}）`
  );
  ok(integ.verifyManifestSignature(baseline).ok === true, '★ 1q. 刚生成的清单自身验签通过');
  ok(
    integ.verifyAppFiles(appDir).scope === 'asar-unpacked',
    '★ 1r. verifyAppFiles 的报告里带 scope=asar-unpacked（供前端文案分层）'
  );
}

// ═══ 二、清单稳定性（同目录两次生成，除时间戳外必须逐字节一致）═══
{
  const again = integ.buildManifest(appDir, '0.9.0-Beta.261');
  const strip = m => {
    const c = clone(m);
    c.signedAt = null;
    delete c.signature;
    return JSON.stringify(c);
  };
  ok(strip(again) === strip(baseline), '★ 2. 两次扫描同一目录产出的文件哈希完全一致（清单可复现，无随机序）');
  ok(Object.keys(again.files).join(',') === Object.keys(baseline.files).join(','), '2b. 文件顺序稳定（按路径排序）');
}

// ═══ 三、原样自检必须通过 ═══
{
  const r = integ.verifyAppFiles(appDir);
  ok(r.ok === true, `★ 3. 未改动时自检 ok=true（实得 ${r.ok}，原因 ${r.reason || '无'}）`);
  ok(r.signatureOk === true, '3b. 标记 signatureOk=true');
  ok(r.checked === baseline.meta.fileCount, `3c. checked 等于清单条数（${r.checked}）`);
  ok(r.missing.length === 0 && r.modified.length === 0 && r.added.length === 0, '3d. 三张差异表均为空');
}

// ═══ 四、改文件 → 检出 modified ═══
{
  const target = path.join(appDir, 'electron', 'db', 'core.js');
  const orig = fs.readFileSync(target);
  fs.writeFileSync(target, "'use strict'\n// 被改：偷偷加了一行 backdoor\nmodule.exports = { hacked: true }\n");
  const r = integ.verifyAppFiles(appDir);
  ok(r.ok === false, '★ 4. 改动程序文件后自检 ok=false');
  ok(r.signatureOk === true, '★ 4b. 清单签名仍然有效（证明检出的是文件差异，而非清单问题）');
  ok(
    r.modified.length === 1 && r.modified[0] === 'electron/db/core.js',
    `★ 4c. 精确定位被改文件：${JSON.stringify(r.modified)}`
  );
  ok(/被修改 1 个/.test(r.reason) && r.reason.includes('electron/db/core.js'), `★ 4d. 报告含可诊断原因：${r.reason}`);
  ok(r.missing.length === 0 && r.added.length === 0, '4e. 未误报删除/新增');

  fs.writeFileSync(target, orig);
  ok(integ.verifyAppFiles(appDir).ok === true, '★ 4f. 改回原样后自检恢复通过（哈希敏感、非状态机）');
}

// ═══ 五、删文件 → 检出 missing ═══
{
  const target = path.join(appDir, 'dist', 'index.html');
  const orig = fs.readFileSync(target);
  fs.unlinkSync(target);
  const r = integ.verifyAppFiles(appDir);
  ok(
    r.ok === false && r.missing.length === 1 && r.missing[0] === 'dist/index.html',
    `★ 5. 删除程序文件被检出：${JSON.stringify(r.missing)}`
  );
  ok(/被删除 1 个/.test(r.reason), `5b. 报告含「被删除」：${r.reason}`);
  fs.writeFileSync(target, orig);
  ok(integ.verifyAppFiles(appDir).ok === true, '5c. 恢复文件后自检通过');
}

// ═══ 六、加文件 → 检出 added ═══
{
  const evil = path.join(appDir, 'electron', 'services', 'backdoor.js');
  fs.writeFileSync(evil, "'use strict'\nmodule.exports = () => 'pwned'\n");
  const r = integ.verifyAppFiles(appDir);
  ok(
    r.ok === false && r.added.length === 1 && r.added[0] === 'electron/services/backdoor.js',
    `★ 6. 新增程序文件被检出：${JSON.stringify(r.added)}`
  );
  ok(/被新增 1 个/.test(r.reason), `6b. 报告含「被新增」：${r.reason}`);
  fs.unlinkSync(evil);
  ok(integ.verifyAppFiles(appDir).ok === true, '6c. 删除新增文件后自检通过');
}

// ═══ 七、改 dist/index.html（前端主入口被换）——最高危场景 ═══
{
  const target = path.join(appDir, 'dist', 'index.html');
  const orig = fs.readFileSync(target);
  fs.writeFileSync(target, '<html><body><script src="http://evil.example/x.js"></script></body></html>');
  const r = integ.verifyAppFiles(appDir);
  ok(r.ok === false && r.modified.includes('dist/index.html'), '★ 7. 前端入口 index.html 被替换 → 检出');
  fs.writeFileSync(target, orig);
}

// ═══ 八、篡改清单想骗过自检 ═══
{
  // 8a. 只改清单里的哈希（签名未同步）→ 验签失败
  const bad = clone(baseline);
  bad.files['electron/main.js'].sha256 = 'f'.repeat(64);
  const r1 = integ.verifyAppFiles(appDir, bad);
  ok(
    r1.ok === false && r1.signatureOk === false,
    '★ 8a. 改清单内的哈希而不同步签名 → 验签失败被拦（无法用假哈希洗白）'
  );
  ok(/清单(签名无效|校验失败)/.test(r1.reason), `8a2. 原因为清单签名问题：${r1.reason}`);

  // 8b. 往清单里塞一个文件（想掩盖新增）→ 同样验签失败
  const bad2 = clone(baseline);
  bad2.files['electron/evil.js'] = { sha256: '0'.repeat(64), crc32: 0, size: 1 };
  const r2 = integ.verifyAppFiles(appDir, bad2);
  ok(r2.ok === false && r2.signatureOk === false, '★ 8b. 往清单塞入条目（想掩盖同一文件的新增）→ 验签失败被拦');

  // 8c. 改 meta（版本号）→ 也在签名覆盖范围内
  const bad3 = clone(baseline);
  bad3.meta.version = '0.0.1-fake';
  const r3 = integ.verifyAppFiles(appDir, bad3);
  ok(
    r3.ok === false && r3.signatureOk === false,
    '★ 8c. 改 meta.version 也在签名保护范围内（早期实现漏保，本组为回归防线）'
  );

  // 8d. 删掉 signature 字段 → 明确报缺签名
  const bad4 = clone(baseline);
  delete bad4.signature;
  const r4 = integ.verifyAppFiles(appDir, bad4);
  ok(r4.ok === false && /缺少签名/.test(r4.reason), `8d. 清单被删签名 → 明确报错：${r4.reason}`);

  // 8e. 换一份伪造清单（用别人的签名/另一套密钥）
  const bad5 = clone(baseline);
  bad5.signature = Buffer.from('x'.repeat(64)).toString('base64');
  const r5 = integ.verifyAppFiles(appDir, bad5);
  ok(r5.ok === false && r5.signatureOk === false, '★ 8e. 伪造签名（非本程序私钥）→ 验签失败');
}

// ═══ 九、清单缺失 = 未启用自检，不误报为篡改 ═══
{
  fs.unlinkSync(manifestPath);
  const r = integ.verifyAppFiles(appDir);
  ok(r.ok === true, '★ 9. 清单不存在时 ok=true（开发态/首次运行，不误报篡改）');
  ok(r.missingManifest === true, '9b. 明确标记 missingManifest=true，前端可据此不显示告警');
  ok(/开发态|首次运行/.test(r.reason), `9c. 原因说明清楚：${r.reason}`);
}

// ═══ 十、清单文件损坏 ═══
{
  fs.writeFileSync(manifestPath, '{ this is not json');
  const r = integ.verifyAppFiles(appDir);
  ok(r.ok === false && /损坏/.test(r.reason), `★ 10. 清单文件损坏 → 报错而非静默通过：${r.reason}`);
}

// ═══ 十一、与其他模块的口径一致性 ═══
{
  const releaseSign = require(path.join(ROOT, 'electron/services/release-sign.js'));
  const man = integ.buildManifest(appDir, '1.0.0');
  // 本模块的验签口径必须与 releaseSign 的原始能力一致（去掉自定义包装后验签通过）
  const { signature, ...payload } = man;
  ok(
    releaseSign.verify(JSON.stringify(payload), signature),
    '★ 11. 清单签名口径与 releaseSign.verify 完全一致（同一把发布方公钥）'
  );
  ok(
    releaseSign.verify(JSON.stringify({ ...payload, meta: { version: 'TAMPER', fileCount: 1 } }), signature) === false,
    '★ 11b. 用 releaseSign.verify 直接改 meta 后复验 → false（证明 meta 确在签名内）'
  );
}

// ═══ 十二、asar 兼容性加固：Dirent 类型不可信时必须回退 statSync ═══
//   背景：Electron 给 fs 打 asar 补丁后，app.asar 内目录的 readdirSync
//   ({withFileTypes:true}) 可能对虚拟路径给出「既非目录也非文件」的 Dirent。
//   若此时直接 continue，会把 asar 内全部文件漏掉 → 误报「被删除 N 个」→
//   假告警 + 审计链被污染。故 classifyEntry 必须能回退到 statSync 判定。
{
  // 12a. 正常真实文件：走 Dirent 快路径，判定正确
  const realDir = path.join(appDir, 'electron');
  const ents = fs.readdirSync(realDir, { withFileTypes: true });
  const mainEnt = ents.find(e => e.name === 'main.js');
  ok(integ.classifyEntry(path.join(realDir, 'main.js'), mainEnt) === 'file', '★ 12a. 真实文件 → classifyEntry=file');

  // 12b. 关键回归：传入一个「类型不可信」的假 Dirent（两个 is* 都返回 false），
  //      模拟 Electron asar 补丁退化的情形 → 必须回退 statSync 并仍判为 file
  const fakeDirent = { name: 'main.js', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => false };
  ok(
    integ.classifyEntry(path.join(realDir, 'main.js'), fakeDirent) === 'file',
    '★ 12b. Dirent 类型不可信（is* 全 false）→ 回退 statSync，仍正确判为 file（防 asar 误报「被删除」）'
  );

  // 12c. 目录同理：假 Dirent 但真实是目录 → 回退后判为 dir（否则会把目录当文件读，白白丢掉整棵子树）
  const fakeDirEnt = { name: 'db', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => false };
  ok(
    integ.classifyEntry(path.join(realDir, 'db'), fakeDirEnt) === 'dir',
    '★ 12c. 目录遇假 Dirent → 回退 statSync 判为 dir（不会漏扫子树）'
  );

  // 12d. 不存在的路径 → other（不参与比对，避免凭空造出「被删除」）
  const ghost = { name: 'nope.js', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => false };
  ok(
    integ.classifyEntry(path.join(realDir, 'nope.js'), ghost) === 'other',
    '★ 12d. 路径不存在 → other，不参与比对（不会凭空造出「被删除」条目）'
  );

  // 12e. 端到端：即使把 readdirSync 换成「全部 Dirent 类型不可信」，
  //      扫描结果也必须与正常路径完全一致 —— 这是本次加固的最终验收点
  const fakeEnts = fs.readdirSync(realDir, { withFileTypes: true }).map(e => ({
    name: e.name,
    isDirectory: () => false,
    isFile: () => false,
    isSymbolicLink: () => false
  }));
  const origReaddir = fs.readdirSync;
  let patched = false;
  fs.readdirSync = function (dir, _opts) {
    if (path.resolve(String(dir)) === path.resolve(realDir)) {
      patched = true;
      return fakeEnts;
    }
    return origReaddir.apply(fs, arguments);
  };
  let degraded;
  try {
    // 口径必须与建清单时一致（appDir 是 app.asar.unpacked → includeNodeModules）
    degraded = integ.scanFiles(appDir, { includeNodeModules: true });
  } finally {
    fs.readdirSync = origReaddir;
  }
  ok(patched, '12e0. 已成功注入「类型不可信」的 readdirSync（确认测试真的生效）');
  const expectedKeys = Object.keys(baseline.files).sort().join(',');
  const degradedKeys = Object.keys(degraded).sort().join(',');
  ok(degradedKeys === expectedKeys, '★ 12e. Dirent 全不可信时扫描结果与正常路径逐项一致（加固生效，asar 下不会误报）');
}

// ═══ 十三、asar 头哈希：两条独立实现必须给出同一个值 ═══
//   Electron 校验的是「asar 头部 JSON 字符串的 sha256」，不是整个文件的哈希。
//   afterPack 注入 PE 资源时用本模块计算；Electron 运行时用另一套实现重算。
//   两者必须一致，否则真实产物会「注入成功但启动即退出」。
{
  // 造一个最小 asar：用 electron-builder 自带的 asar 打包器产一个真归档
  let asarPath = null;
  try {
    const { createPackageWithOptions } = require('@electron/asar');
    const src = path.join(base, 'asar-src');
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src, 'index.html'), '<html>hi</html>');
    fs.writeFileSync(path.join(src, 'sub', 'a.js'), 'module.exports=1\n');
    asarPath = path.join(base, 'app.asar');
    await createPackageWithOptions(src, asarPath, {});
  } catch (e) {
    console.log('  · 跳过 13 组（@electron/asar 不可用：' + e.message + '）');
  }
  if (asarPath && fs.existsSync(asarPath)) {
    const h1 = await integ.asarHeaderHash(asarPath);
    const h2 = await integ.asarHeaderHashViaBuilder(asarPath);
    ok(/^[0-9a-f]{64}$/.test(h1), `★ 13. 头哈希为 64 位 hex（${h1}）`);
    ok(
      h1 === h2,
      `★ 13b. @electron/asar 与 app-builder-lib 两条实现给出相同头哈希（${h1} == ${h2}）—— 与 Electron 内部口径对齐`
    );

    // 13c. 归档确实落盘
    const beforeLen = fs.statSync(asarPath).size;
    const hBefore = await integ.asarHeaderHash(asarPath);
    // 13d. 增删文件（改动目录结构）→ 头哈希必变
    const src2 = path.join(base, 'asar-src2');
    fs.mkdirSync(path.join(src2, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src2, 'index.html'), '<html>hi</html>');
    fs.writeFileSync(path.join(src2, 'sub', 'a.js'), 'module.exports=1\n');
    fs.writeFileSync(path.join(src2, 'sub', 'b.js'), 'module.exports=2\n');
    const asarPath2 = path.join(base, 'app2.asar');
    const { createPackageWithOptions } = require('@electron/asar');
    await createPackageWithOptions(src2, asarPath2, {});
    const hAfter = await integ.asarHeaderHash(asarPath2);
    ok(hBefore !== hAfter, '★ 13d. 多一个文件 → 头哈希必变（目录结构在头里，故注入的是「结构指纹」）');
    ok(beforeLen > 0, `13e. 归档确实落盘（${beforeLen} 字节）`);

    // 13f. 篡改归档字节 → 头哈希必变（或解析失败）→ 证明注入值对篡改敏感
    const tampered = path.join(base, 'app-tampered.asar');
    const buf = Buffer.from(fs.readFileSync(asarPath));
    buf[Math.floor(buf.length * 0.6)] ^= 0xff;
    fs.writeFileSync(tampered, buf);
    let changed;
    try {
      changed = (await integ.asarHeaderHash(tampered)) !== h1;
    } catch (e) {
      changed = true;
    }
    ok(changed, '★ 13f. 篡改归档字节后头哈希改变（或解析失败）→ 注入值对篡改敏感');
  }
}

fs.rmSync(base, { recursive: true, force: true });

// ═══ 十四、asar 与 unpacked 共存状态（Beta.265 修复的真实漏洞）═══
//   漏洞回顾：verifyAppFiles 原先把两种情况压成同一个 ok:true 分支 ——
//     A. 目录在、清单不在 → 开发态，合理；
//     B. 目录本身不存在   → 却也报「跳过自检」，**静默放行**。
//   而 asar 头对 sql.js 的 wasm 等条目明确标了 unpacked:true，这是 Electron
//   官方的「实体应在 app.asar.unpacked」声明。于是「asar 在 + unpacked 不在」
//   是可判定的矛盾态：程序读 wasm 必然失败，绝不是「未启用自检」。
//   把 unpacked 目录整体删掉就能让第二层防护消失且无痕 —— 必须报出来。
{
  const base14 = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-state-'));

  // 14a. 纯开发态：既无 asar 也无 unpacked → not-packaged，不误报
  const devDir = path.join(base14, 'devroot');
  fs.mkdirSync(devDir, { recursive: true });
  const devUnpacked = path.join(devDir, 'resources', integ.UNPACKED_NAME);
  const st1 = integ.asarStateFor(devUnpacked);
  ok(st1.state === 'not-packaged', `★ 14a. 未打包 → not-packaged（${st1.state}）`);
  const r1 = integ.verifyAppFiles(devUnpacked);
  ok(r1.ok === true && r1.asarState === 'not-packaged', '★ 14b. 未打包时 ok=true（开发态本就不该自检，不误报篡改）');

  // 造一个真实 asar（内含 node_modules 依赖），复刻生产布局
  const src14 = path.join(base14, 'src');
  fs.mkdirSync(path.join(src14, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(path.join(src14, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(src14, 'node_modules', 'dep', 'a.wasm'), 'WASM-BYTES');
  const res14 = path.join(base14, 'resources');
  fs.mkdirSync(res14, { recursive: true });
  const asarPath14 = path.join(res14, integ.ASAR_NAME);
  const { createPackageWithOptions } = require('@electron/asar');
  await createPackageWithOptions(src14, asarPath14, { unpack: '*.wasm' });
  const unpacked14 = path.join(res14, integ.UNPACKED_NAME);

  // 14c. asar 头里确实带 unpacked 声明（判据存在性的证明）
  const st2 = integ.asarStateFor(unpacked14);
  ok(
    st2.declaredUnpacked.length > 0,
    `★ 14c. asar 头内含 unpacked 声明（${st2.declaredUnpacked.length} 条）——判据存在`
  );
  ok(
    st2.declaredUnpacked.some(p => p.endsWith('a.wasm')),
    '★ 14d. 声明的正是被 asarUnpack 命中的 wasm 文件'
  );

  // 14e. 先删掉 asar 打包时自动落盘的 unpacked 目录，制造矛盾态
  ok(fs.existsSync(unpacked14), '（前置）asar 打包时自动落盘了 unpacked 目录');
  // 备份解出来的 wasm 内容 —— 后面 14k/14m 要用「有真实文件」的目录，
  // 否则 14m 会退化成「空清单通过」，失去判别力。
  const unpackedBackup = fs.mkdtempSync(path.join(base14, 'unpacked-bak-'));
  fs.cpSync(unpacked14, unpackedBackup, { recursive: true });
  fs.rmSync(unpacked14, { recursive: true, force: true });
  const st2b = integ.asarStateFor(unpacked14);
  ok(st2b.state === 'unpacked-missing', `★ 14e. 矛盾态被识别为 unpacked-missing（${st2b.state}）`);
  const r2 = integ.verifyAppFiles(unpacked14);
  ok(r2.ok === false, '★ 14f. 【漏洞修复】目录整体缺失 → ok=false（修复前为 ok=true 静默放行）');
  ok(r2.dirMissing === true, '★ 14g. 明确标记 dirMissing=true（可与其他失败形态区分）');
  ok(
    Array.isArray(r2.missing) && r2.missing.length === st2b.declaredUnpacked.length,
    `★ 14h. missing 明细取自头声明（${r2.missing.length} 条），可诊断`
  );
  ok(
    /整体缺失/.test(r2.reason) && /头部声明了其中应有/.test(r2.reason),
    `14i. 原因说明可读：${r2.reason.slice(0, 60)}…`
  );
  ok(r2.scope === 'asar-unpacked', '14j. 报告仍带正确 scope，前端文案分层不受影响');

  // 14k. 把目录补回来（含真实 wasm 内容，无清单）→ 回到「目录在、清单不在」的开发态语义
  fs.cpSync(unpackedBackup, unpacked14, { recursive: true });
  const r3 = integ.verifyAppFiles(unpacked14);
  ok(
    r3.ok === true && r3.missingManifest === true,
    '★ 14k. 目录回来了但无清单 → 回到开发态语义（ok=true, missingManifest=true）'
  );
  ok(r3.dirMissing === undefined, '14l. 此时不该带 dirMissing 标记');

  // 14m. 反向验证：目录真存在且清单齐备 → 正常通过。比对数必须 >0，
  //   否则（空清单）这条断言会毫无判别力 —— 说明夹具没复刻出真实内容。
  const man14 = integ.buildManifest(unpacked14, '9.9.9');
  const manCount = Object.keys(man14.files).length;
  ok(manCount > 0, `（前置）夹具确实含纳入自检的文件（${manCount} 个）`);
  integ.writeManifest(unpacked14, '9.9.9');
  const r4 = integ.verifyAppFiles(unpacked14);
  ok(r4.ok === true && r4.checked === manCount, `★ 14m. 目录+清单齐备 → 正常通过（比对 ${r4.checked} 个文件）`);

  // 14m2. 在「有内容」的前提下改一个字 → 必须被检出（证明 14m 的通过不是空转）
  const wasmRel = Object.keys(man14.files)[0];
  fs.appendFileSync(path.join(unpacked14, wasmRel), 'X');
  const r5 = integ.verifyAppFiles(unpacked14);
  ok(
    r5.ok === false && r5.modified.includes(wasmRel),
    `★ 14m2. 改一个字节 → 被检出（modified: ${r5.modified.join('、')}）`
  );

  // 14n. 无构建期依赖时的降级：asar 路径指向损坏文件 → unknown，交清单判据把关
  const brokenRes = path.join(base14, 'broken', 'resources');
  fs.mkdirSync(brokenRes, { recursive: true });
  fs.writeFileSync(path.join(brokenRes, integ.ASAR_NAME), 'not-an-asar');
  const st3 = integ.asarStateFor(path.join(brokenRes, integ.UNPACKED_NAME));
  ok(st3.state === 'unknown', `★ 14n. asar 无法解析 → unknown（不因「解析不了」把好程序判成篡改）`);

  fs.rmSync(base14, { recursive: true, force: true });
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
