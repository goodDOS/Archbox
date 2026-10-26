/**
 * 打包产物防篡改实证 —— 直接对 release/win-unpacked/resources 动手。
 *
 * ★ 两层结构（Beta.261 起 asar 迁移后）★
 *   第一层：resources/app.asar —— 由 **Electron 原生 asar 完整性校验**守护。
 *           头哈希写进 Archbox.exe 的 PE 资源（type=INTEGRITY / name=ELECTRONASAR），
 *           校验逻辑在 exe 二进制内部，不匹配即 process.exit(1)。
 *           本脚本核对「exe 内注入值 == 重算头哈希」，这是出厂正确性的硬指标。
 *   第二层：resources/app.asar.unpacked —— 由自建签名清单
 *           （resources/app-integrity.json，scope=asar-unpacked）守护，
 *           补 asar 头哈希照不到的真空地带。
 *
 * 与 anti-tamper.test.mjs / app-integrity.test.mjs / asar-integrity.test.mjs 的区别：
 *   那三个是「算法级」单测（用临时目录造夹具）；
 *   本脚本是「产物级」实证 —— 拿真实打包产物来验。
 *
 * 全程只读取，不做任何破坏性修改（篡改在临时副本上进行）。
 *
 * 运行：node electron/verify/pack-integrity-check.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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

const RES_TYPE = 'INTEGRITY';
const RES_NAME = 'ELECTRONASAR';
const REL_ASAR = 'resources\\app.asar';

const unpackedRoot = path.join(ROOT, 'release/win-unpacked');
const resources = path.join(unpackedRoot, 'resources');
const asarPath = path.join(resources, integ.ASAR_NAME);
const unpackedDir = path.join(resources, integ.UNPACKED_NAME);
const manifestPath = path.join(resources, integ.MANIFEST_NAME);

/**
 * 定位主程序 exe。
 *
 * ★ 不能硬编码 'Archbox.exe'（Beta.316 修正）★
 *   electron-builder 出的 exe 名取自 package.json 的 `productName`，本项目是
 *   「文档盒 Archbox」，实际文件名是 `文档盒 Archbox.exe`。此前这里写死 `Archbox.exe`，
 *   于是 A4/A5 两条**安全关键断言**（exe 内注入值 == 重算头哈希）从来没真正跑过 ——
 *   永远走到 "未找到 exe" 的跳过分支，看起来是"跳过"，实际是这道防线形同虚设。
 *
 * 判据改为「win-unpacked 根目录下的唯一 .exe」，不依赖具体名字：
 *   该目录同时还有 electron.exe 之类的可能性为 0（electron-builder 会把
 *   electron 二进制重命名为 productName.exe），故取第一个 .exe 是确定的。
 *   若真有多个，按名字含 'archbox' 优先，再退化到第一个。
 */
function locateExe() {
  let names;
  try {
    names = fs.readdirSync(unpackedRoot).filter(n => /\.exe$/i.test(n));
  } catch (e) {
    return null;
  }
  if (!names.length) return null;
  const preferred = names.find(n => /archbox/i.test(n));
  return path.join(unpackedRoot, preferred || names[0]);
}
const exePath = locateExe();

console.log('产物目录:', path.relative(ROOT, resources));

// ── 前置：产物必须存在 ──
//
// ★ 缺产物时「跳过」而不是「失败」★
//   release/ 在 .gitignore 里，任何干净 clone 都不可能带着产物，
//   CI 的第一轮也不会先打包（打包会改版本号、属发布动作）。
//   这里判失败等于让所有没跑过 pack 的人都看到红叉，久而久之大家就学会无视它 ——
//   那才是真正危险的事。故打印原因与生成方式，退出码 0。
//   本地跑过 npm run pack 之后，本文件会真正执行全部断言。
if (!fs.existsSync(resources)) {
  console.log(
    '  · 跳过（未找到 ' +
      path.relative(ROOT, resources) +
      '；先执行 node scripts/build-win-unpacked.mjs 生成产物后本检查才会生效）'
  );
  process.exit(0);
}

// ═══════════════════════════════════════════════
//  第一层：asar 原生完整性
// ═══════════════════════════════════════════════
console.log('\n【第一层】resources/app.asar —— Electron 原生完整性校验');
{
  ok(fs.existsSync(asarPath), `★ A1. 产物含 ${integ.ASAR_NAME}（asar:true 生效，程序主体已归档）`);
  ok(
    !fs.existsSync(path.join(resources, 'app')),
    '★ A2. 不存在 resources/app 真实目录（确认已彻底切到 asar，无并行旧结构留下绕过口）'
  );

  if (fs.existsSync(asarPath)) {
    const headerHash = await integ.asarHeaderHash(asarPath);
    const viaBuilder = await integ.asarHeaderHashViaBuilder(asarPath);
    ok(/^[0-9a-f]{64}$/.test(headerHash), `★ A3. 头哈希算得 64 位 hex（${headerHash}）`);
    ok(headerHash === viaBuilder, '★ A3b. 两条独立实现口径一致（对齐 Electron 内部算法）');

    // A4. exe 内注入的资源必须与重算值一致 —— 不一致 = 用户那边「双击无反应」
    //   ★ exePath 为 null 表示 win-unpacked 根目录下一个 .exe 都没有：那是产物本身坏了，
    //     必须报红（而不是静默跳过），否则这道安全防线会以"跳过"的名义长期空转。
    if (!exePath || !fs.existsSync(exePath)) {
      ok(false, '★ A4. win-unpacked 根目录下未找到任何 .exe，无法核对 asar 完整性注入值');
    } else {
      const { NtExecutable, NtExecutableResource } = await import('resedit');
      const res = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true }));
      const got = res.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME);
      ok(got.length === 1, `★ A4. exe 内含恰好 1 条 ${RES_TYPE}/${RES_NAME} 资源（实得 ${got.length}）`);
      if (got.length === 1) {
        const b = Buffer.isBuffer(got[0].bin) ? got[0].bin : Buffer.from(got[0].bin);
        let entry = null;
        try {
          entry = JSON.parse(b.toString('utf8'))[0];
        } catch (e) {
          ok(false, 'A4x. 资源内容不是合法 JSON：' + e.message);
        }
        if (entry) {
          ok(
            entry.value === headerHash,
            `★ A5. 注入值 == 重算头哈希（${entry.value}）—— 出厂即正确，用户不会遇到「双击无反应」`
          );
          ok(entry.file === REL_ASAR, `★ A5b. file 字段为 ${JSON.stringify(entry.file)}（反斜杠，Windows 要求）`);
          ok(!entry.file.includes('/'), '★ A5c. file 字段不含正斜杠');
          ok(entry.alg === 'sha256', `★ A5d. alg 为全小写 sha256（实得 ${JSON.stringify(entry.alg)}）`);
          ok(
            b.toString('utf8') === JSON.stringify([{ file: REL_ASAR, alg: 'sha256', value: headerHash }]),
            '★ A5e. 资源字节与官方载荷字面形态完全一致'
          );
        }
      }
    }

    // A6. asar 内关键路径齐全（主进程/预加载/前端入口/包描述）
    const { getRawHeader } = require('@electron/asar');
    const header = getRawHeader(asarPath).header;
    const exists = segs => {
      let n = header;
      for (const s of segs) {
        if (!n || !n.files || !n.files[s]) return null;
        n = n.files[s];
      }
      return n;
    };
    for (const p of [['electron', 'main.js'], ['electron', 'preload.js'], ['dist', 'index.html'], ['package.json']]) {
      const n = exists(p);
      ok(!!n, `A6. asar 内含 ${p.join('/')}${n && n.size ? `（${n.size} 字节）` : ''}`);
    }
    // A7. asar 内不应含被排除的测试/校验脚本
    ok(!exists(['electron', 'verify']), '★ A7. asar 内不含 electron/verify（校验脚本未进生产包）');

    // A7b. node_modules 会随包进 asar（sql.js 是运行时依赖，electron-builder 会打进归档）。
    //      但被 asarUnpack 的条目在头里标记 unpacked=true —— 实体在 app.asar.unpacked，
    //      头内只放占位条目 + per-file integrity。这正是「第二层清单必须补位」的原因。
    const nm = exists(['node_modules']);
    ok(!!nm, 'A7b. node_modules 打进 asar（sql.js 等运行时依赖需随包，符合预期）');
    const unpackedNode = exists(['node_modules', 'sql.js', 'dist', 'sql-wasm.wasm']);
    if (unpackedNode) {
      ok(
        unpackedNode.unpacked === true,
        '★ A7c. sql-wasm.wasm 在 asar 头内标记 unpacked=true（实体在 app.asar.unpacked，头内仅占位）'
      );
      ok(
        !!(unpackedNode.integrity && unpackedNode.integrity.hash),
        '★ A7d. 该条目带 per-file integrity（Electron 读文件时用头部这个哈希校验内容 —— 与头哈希是两条互补链路）'
      );
      ok(
        unpackedNode.integrity.algorithm === 'SHA256',
        `A7e. per-file integrity 算法为 SHA256（实得 ${unpackedNode.integrity.algorithm}）`
      );
    }
  }
}

// ═══════════════════════════════════════════════
//  第二层：unpacked 自建签名清单
// ═══════════════════════════════════════════════
console.log('\n【第二层】resources/app.asar.unpacked —— 自建签名清单');
let man = null;
{
  ok(
    fs.existsSync(manifestPath),
    `★ B1. 产物含 ${integ.MANIFEST_NAME}（清单随 afterPack 钩子产出，位于 resources/ 而非 asar 内）`
  );
  ok(fs.existsSync(unpackedDir), `★ B2. 产物含 ${integ.UNPACKED_NAME}（asarUnpack 解出 asar 照不到的文件）`);

  if (fs.existsSync(manifestPath)) {
    man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    ok(man.scope === 'asar-unpacked', `★ B3. scope=asar-unpacked（实际 ${man.scope}）—— 明确只守 asar 之外那层`);
    ok(man.meta && man.meta.fileCount > 0, `★ B4. 记录了纳入文件数（${man.meta && man.meta.fileCount}）`);
    // 版本一致性：清单版本应从包内 package.json 读取（asar 内），二者必须一致
    let pkgVersion = null;
    if (fs.existsSync(asarPath)) {
      try {
        pkgVersion = JSON.parse(
          require('@electron/asar').extractFile(asarPath, 'package.json').toString('utf8')
        ).version;
      } catch (e) {}
    }
    if (!pkgVersion && fs.existsSync(path.join(unpackedDir, 'package.json'))) {
      pkgVersion = JSON.parse(fs.readFileSync(path.join(unpackedDir, 'package.json'), 'utf8')).version;
    }
    ok(
      pkgVersion ? man.meta.version === pkgVersion : true,
      `★ B5. 清单版本与包内版本一致（${man.meta.version} / ${pkgVersion || '（未取到，跳过）'}）`
    );
    ok(integ.verifyManifestSignature(man).ok === true, '★ B6. 清单自身验签通过（发布方公钥）');
    ok(
      Buffer.from(man.signature, 'base64').length === 64,
      `B7. 签名长度 64 字节（Ed25519，实际 ${Buffer.from(man.signature, 'base64').length}）`
    );
  }
}

// ═══ 三、unpacked 清单覆盖面符合设计 ═══
if (man) {
  const keys = Object.keys(man.files);
  // ★ unpacked 目录的内容全在 node_modules 下，必须纳入 ——
  //   若沿用「排除 node_modules」，清单会是空的（Beta.261 首包实测 fileCount=0），
  //   第二层防护形同虚设。这是一条关键回归断言。
  ok(
    keys.length > 0,
    `★ B8. 清单非空（${keys.length} 个文件）—— unpacked 内容全在 node_modules 下，必须纳入，否则第二层防护失效`
  );
  ok(
    keys.some(k => k.startsWith('node_modules/')),
    `★ B8a. 纳入 node_modules/**（${keys.filter(k => k.startsWith('node_modules/')).length} 个）`
  );
  ok(
    keys.some(k => k.endsWith('.wasm')),
    `★ B8b. 纳入 wasm（${keys.filter(k => k.endsWith('.wasm')).join('、') || '无'}）—— 数据库引擎本体，最需要守护`
  );
  ok(!keys.some(k => k.includes('/verify/')), 'B8c. 未纳入 electron/verify/（校验脚本不进生产包）');
  ok(!keys.some(k => k === integ.MANIFEST_NAME), '★ B8d. 清单自身不在清单内（否则哈希自我引用、永不收敛）');
  ok(!keys.some(k => k.endsWith('.sig') || k.endsWith('archive.db')), 'B8e. 未纳入用户数据文件');
  ok(
    !keys.includes('app.asar') && !keys.includes('app.asar.unpacked'),
    'B8f. 未把 asar 归档本身纳入清单（那由第一层负责，重复守无收益且哈希不稳）'
  );
  console.log(`     （纳入 ${keys.length} 个文件，例如：${keys.slice(0, 3).join('、')} …）`);
}

// ═══ 四、真实产物自检必须通过 ═══
{
  const r = integ.verifyAppFiles(unpackedDir);
  ok(r.ok === true, `★ B9. 未改动时自检通过（比对 ${r.checked} 个文件）${r.ok ? '' : '｜' + r.reason}`);
  ok(
    r.missing.length === 0 && r.modified.length === 0 && r.added.length === 0,
    '★ B9b. 三张差异表均为空（打包钩子生成的清单与产物严格一致）'
  );
  ok(r.scope === 'asar-unpacked', `B9c. 报告带 scope=asar-unpacked（供前端文案分层）`);
  // B9d. 只读模式下用户最关心的：这个自检不依赖 electron 运行时（纯 fs）
  ok(typeof r.checked === 'number', 'B9d. 报告结构完整（纯 Node 可驱动，便于 CI 与排障）');
}

// ═══ 五、在临时副本上实证「改 / 增 / 删」都能被抓到（第二层）═══
if (man) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-integ-'));
  const tmpResources = path.join(tmp, 'resources');
  fs.mkdirSync(tmpResources, { recursive: true });
  fs.cpSync(unpackedDir, path.join(tmpResources, integ.UNPACKED_NAME), { recursive: true });
  fs.copyFileSync(manifestPath, path.join(tmpResources, integ.MANIFEST_NAME));
  const tmpApp = path.join(tmpResources, integ.UNPACKED_NAME);

  // B10. 原样副本应通过（证明拷贝没引入差异、清单可移置）
  ok(integ.verifyAppFiles(tmpApp).ok === true, '★ B10. 清单与 unpacked 一同移置后仍通过（路径无关，便于备份比对）');

  // B11. 改一个被纳入的文件
  const keys = Object.keys(man.files);
  if (keys.length) {
    const victim = keys[0];
    const victimPath = path.join(tmpApp, victim);
    const orig = fs.readFileSync(victimPath);
    fs.appendFileSync(victimPath, '\n// injected\n');
    let r = integ.verifyAppFiles(tmpApp);
    ok(
      r.ok === false && r.modified.includes(victim),
      `★ B11. 改动 ${victim} → 检出 modified：${JSON.stringify(r.modified)}`
    );
    fs.writeFileSync(victimPath, orig);

    // B12. 删掉一个被纳入的文件
    fs.unlinkSync(victimPath);
    r = integ.verifyAppFiles(tmpApp);
    ok(
      r.ok === false && r.missing.includes(victim),
      `★ B12. 删除 ${victim} → 检出 missing：${JSON.stringify(r.missing)}`
    );
    fs.writeFileSync(victimPath, orig);

    // B13. 塞入后门文件
    const backdoor = path.join(tmpApp, 'zz-backdoor.js');
    fs.writeFileSync(backdoor, "module.exports = () => 'pwned'\n");
    r = integ.verifyAppFiles(tmpApp);
    ok(
      r.ok === false && r.added.includes('zz-backdoor.js'),
      `★ B13. 塞入后门模块 → 检出 added：${JSON.stringify(r.added)}`
    );
    fs.unlinkSync(backdoor);

    // B14. 改清单想掩盖（签名对不上）
    const fakeMan = JSON.parse(JSON.stringify(man));
    fakeMan.files[victim] = { sha256: '0'.repeat(64), crc32: 0, size: 1 };
    fs.writeFileSync(path.join(tmpResources, integ.MANIFEST_NAME), JSON.stringify(fakeMan, null, 2));
    r = integ.verifyAppFiles(tmpApp);
    ok(r.ok === false && r.signatureOk === false, '★ B14. 改清单想掩盖 → 验签失败被拦（假哈希无法洗白）');

    // B15. 恢复真实清单后应重新通过
    fs.copyFileSync(manifestPath, path.join(tmpResources, integ.MANIFEST_NAME));
    ok(integ.verifyAppFiles(tmpApp).ok === true, '★ B15. 换回真实清单 → 重新通过');
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('     （临时副本已清理，原始产物未被触碰）');
}

// ═══ 六、产物未被本次检查改动 ═══
{
  const r = integ.verifyAppFiles(unpackedDir);
  ok(r.ok === true, '★ C1. 检查结束后真实产物仍通过自检（本次检查全程只读）');
  if (fs.existsSync(asarPath)) {
    const h = await integ.asarHeaderHash(asarPath);
    ok(/^[0-9a-f]{64}$/.test(h), '★ C1b. asar 头哈希此刻仍可正常计算（第一层未被本次检查触碰）');
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
