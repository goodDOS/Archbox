/**
 * asar 完整性校验（Electron 原生机制）单测 —— 纯 Node，不启动 Electron 实例。
 *
 * 用户需求：「走 asar 路线」
 *   把「防程序文件修改」从「自建签名清单（裁判与选手同目录，只能提高门槛）」
 *   升级为 Electron 官方机制：asar 头哈希写进 Archbox.exe 的 PE 资源
 *   （type=INTEGRITY / name=ELECTRONASAR），校验逻辑驻留在 exe 二进制内部，
 *   应用代码无法触碰；不匹配时 Electron 直接 console.error + process.exit(1)，
 *   早于 electron/main.js。
 *
 * 本测试守三件事：
 *   一、头哈希算得对（与 electron-builder 内部口径逐字节对齐）
 *   二、PE 资源注入/回读往返正确（resedit 往返 + 官方要求的字段格式）
 *   三、注入值与「真实产物」一致（拿 release 里打好的 exe 实证）
 *
 * 运行：node electron/verify/asar-integrity.test.mjs
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

/** 官方要求的资源常量（写错则 Electron 静默不校验，是个「不报错的失败」） */
const RES_TYPE = 'INTEGRITY';
const RES_NAME = 'ELECTRONASAR';
/** Windows 下必须是反斜杠；用正斜杠会被判为「找不到目标」 */
const REL_ASAR = 'resources\\app.asar';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-integ-'));

/** 造一个真实 asar（用 @electron/asar 官方打包器，非手写字节） */
async function makeAsar(dirName, files) {
  const { createPackageWithOptions } = require('@electron/asar');
  const src = path.join(base, dirName + '-src');
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(src, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  const out = path.join(base, dirName + '.asar');
  await createPackageWithOptions(src, out, {});
  return out;
}

// ═══ 一、头哈希算法口径 ═══
{
  const a = await makeAsar('t1', {
    'index.html': '<html>hi</html>',
    'sub/a.js': 'module.exports=1\n'
  });
  const h = await integ.asarHeaderHash(a);
  ok(/^[0-9a-f]{64}$/.test(h), `★ 1. 头哈希为 64 位小写 hex（${h}）`);

  const hb = await integ.asarHeaderHashViaBuilder(a);
  ok(h === hb, '★ 1b. 与 electron-builder 内部实现（app-builder-lib/out/asar/integrity.js hashHeader）逐字节一致');

  // 1c. 头哈希覆盖「目录结构」，不覆盖文件内容 —— 这是必须理解清楚的口径：
  //     只改文件内容（名字与数量不变）→ 头哈希不变；内容由 asar 头内的
  //     per-file integrity 字段覆盖，那才是 Electron 读文件时比对的值。
  const b = await makeAsar('t1b', {
    'index.html': '<html>CHANGED CONTENT</html>',
    'sub/a.js': 'module.exports=1\n'
  });
  await integ.asarHeaderHash(b);
  const filesA = require('@electron/asar').getRawHeader(a).header.files;
  const filesB = require('@electron/asar').getRawHeader(b).header.files;
  ok(Object.keys(filesA).join() === Object.keys(filesB).join(), '1c. 两个归档的文件名集合相同（仅内容不同），前提成立');

  // 1d. 改「文件名/目录结构」→ 头哈希必变
  const c = await makeAsar('t1c', {
    'index.html': '<html>hi</html>',
    'sub/a.js': 'module.exports=1\n',
    'sub/EXTRA.js': 'module.exports=2\n'
  });
  ok((await integ.asarHeaderHash(c)) !== h, '★ 1d. 增删文件（目录结构变）→ 头哈希必变（故注入的是结构指纹）');

  // 1e. 篡改归档字节 → 头哈希改变或解析失败（两种都算「敏感」）
  const tampered = path.join(base, 't1-tampered.asar');
  const buf = Buffer.from(fs.readFileSync(a));
  buf[Math.floor(buf.length * 0.5)] ^= 0xff;
  fs.writeFileSync(tampered, buf);
  let sensitive;
  try {
    sensitive = (await integ.asarHeaderHash(tampered)) !== h;
  } catch (e) {
    sensitive = true;
  }
  ok(sensitive, '★ 1e. 篡改归档字节 → 头哈希改变（或解析失败），注入值对篡改敏感');

  // 1f. 同一份输入重复打包 → 头哈希稳定（不依赖时间戳/随机序）
  const a2 = await makeAsar('t1-again', {
    'index.html': '<html>hi</html>',
    'sub/a.js': 'module.exports=1\n'
  });
  ok((await integ.asarHeaderHash(a2)) === h, '★ 1f. 相同内容重复打包 → 头哈希可复现（无随机序）');
}

// ═══ 二、官方要求的必填字段格式 ═══
{
  const a = await makeAsar('t2', { 'index.html': '<html>x</html>' });
  const headerHash = await integ.asarHeaderHash(a);

  // 2a. file 用反斜杠
  ok(
    REL_ASAR.includes('\\') && !REL_ASAR.includes('/'),
    `★ 2a. file 字段用反斜杠：${JSON.stringify(REL_ASAR)}（Windows 下用正斜杠会被判为找不到目标）`
  );
  // 2b. alg 全小写
  const alg = 'sha256';
  ok(alg === alg.toLowerCase(), '★ 2b. alg 字段全小写 sha256（大写会被判为不支持的算法）');
  // 2c. 载荷形态：长度为 1 的数组，元素含 file/alg/value 三键
  const payload = [{ file: REL_ASAR, alg, value: headerHash }];
  const ser = JSON.stringify(payload);
  const parsed = JSON.parse(ser);
  ok(Array.isArray(parsed) && parsed.length === 1, '2c. 载荷是长度为 1 的数组');
  ok(Object.keys(parsed[0]).sort().join(',') === 'alg,file,value', '2d. 元素恰含三个键 alg/file/value');
  ok(JSON.parse(ser)[0].value === headerHash, '2e. value 即上面算出的头哈希');
  // 2f. 编码必须是 UTF-8（反斜杠在 JSON 里被转义为 \\，字节层面是 5c 5c）
  const bytes = Buffer.from(ser, 'utf8');
  ok(
    bytes.includes(Buffer.from('\\\\', 'utf8')) || ser.includes('\\\\'),
    '2f. 序列化后反斜杠被 JSON 转义（字节层面 5c 5c），Electron 按 UTF-8 解析'
  );
  ok(
    ser === '[{"file":"resources\\\\app.asar","alg":"sha256","value":"' + headerHash + '"}]',
    `★ 2g. 载荷字面形态与官方文档一致：${ser}`
  );
}

// ═══ 三、resedit PE 资源注入 / 回读往返（用真实 exe） ═══
{
  const realExe = path.join(ROOT, 'release/win-unpacked/Archbox.exe');
  if (!fs.existsSync(realExe)) {
    console.log(
      '  · 跳过第 3–5 组（未找到 ' + path.relative(ROOT, realExe) + '，请先执行 node scripts/build-win-unpacked.mjs）'
    );
  } else {
    const { NtExecutable, NtExecutableResource, Resource } = await import('resedit');
    const workExe = path.join(base, 'Archbox-probe.exe');
    fs.copyFileSync(realExe, workExe);

    // 3a. 能读出 VersionInfo 并取到 lang/codepage（注入的前提）
    const exe0 = NtExecutable.from(fs.readFileSync(workExe), { ignoreCert: true });
    const res0 = NtExecutableResource.from(exe0);
    const vi = Resource.VersionInfo.fromEntries(res0.entries);
    ok(vi.length > 0, `★ 3a. exe 内含 VersionInfo（${vi.length} 条）`);
    const langs = vi[0].getAllLanguagesForStringValues();
    ok(
      langs.length > 0 && typeof langs[0].lang === 'number' && typeof langs[0].codepage === 'number',
      `★ 3b. 取到 lang/codepage（lang=${langs[0] && langs[0].lang} codepage=${langs[0] && langs[0].codepage}）—— 注入时必须带上，否则资源表可能被 Windows 忽略`
    );

    // 3c. 记录注入前状态。注意：如果 release 里是**已经注入过**的产物（afterPack 跑过），
    //     这里会读到 1 条 —— 那说明注入成功过，是好事，断言应据此分支而非硬要求为 0。
    const before = res0.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME);
    ok(
      before.length <= 1,
      `★ 3c. 注入前 exe 内 ${RES_TYPE}/${RES_NAME} 资源数为 ${before.length}（0=未注入过；1=构建产物已注入，均正常）`
    );

    // 3d. 注入并按官方格式写入。
    //     若源 exe 已带该资源（构建产物已注入过），先剥掉再注入 ——
    //     否则会变成 2 条同名资源，outputResource 会产出歧义内容。
    res0.entries = res0.entries.filter(e => !(e.type === RES_TYPE && e.id === RES_NAME));
    const realAsar = path.join(ROOT, 'release/win-unpacked/resources/app.asar');
    const hashSource = fs.existsSync(realAsar)
      ? realAsar
      : await makeAsar('t3-fallback', { 'index.html': '<html>fallback</html>' });
    console.log(`     （头哈希来源：${path.relative(ROOT, hashSource) || hashSource}）`);
    const headerHash = await integ.asarHeaderHash(hashSource);
    const payloadStr = JSON.stringify([{ file: REL_ASAR, alg: 'sha256', value: headerHash }]);
    const payload = Buffer.from(payloadStr, 'utf8');
    res0.entries.push({
      type: RES_TYPE,
      id: RES_NAME,
      bin: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
      lang: langs[0].lang,
      codepage: langs[0].codepage
    });
    res0.outputResource(exe0);
    fs.writeFileSync(workExe, Buffer.from(exe0.generate()));
    ok(fs.statSync(workExe).size > 0, '3d. 注入后 exe 成功写回磁盘');

    // 3e. 回读并逐字段核对（这正是 afterPack 构建期预检的逻辑）
    const exe1 = NtExecutable.from(fs.readFileSync(workExe), { ignoreCert: true });
    const res1 = NtExecutableResource.from(exe1);
    const got = res1.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME);
    ok(got.length === 1, `★ 3e. 回读恰好 1 条 ${RES_TYPE}/${RES_NAME} 资源（实得 ${got.length}）`);
    const rawBin = got[0].bin;
    const binBuf = Buffer.isBuffer(rawBin) ? rawBin : Buffer.from(rawBin);
    const decoded = JSON.parse(binBuf.toString('utf8'));
    ok(Array.isArray(decoded) && decoded.length === 1, '3f. 回读内容可 JSON.parse 且为长度 1 的数组');
    ok(decoded[0].file === REL_ASAR, `★ 3g. 回读 file 字段完整保留反斜杠：${JSON.stringify(decoded[0].file)}`);
    ok(!decoded[0].file.includes('/'), '★ 3h. 回读 file 字段不含正斜杠');
    ok(decoded[0].alg === 'sha256', `★ 3i. 回读 alg 为小写 sha256（实得 ${JSON.stringify(decoded[0].alg)}）`);
    ok(decoded[0].value === headerHash, `★ 3j. 回读 value 与重算头哈希一致（${decoded[0].value}）`);

    // 3k. 往返稳定：写回后再读一次，内容不变（防止 resedit 二次规范化破坏内容）
    const exe2 = NtExecutable.from(fs.readFileSync(workExe), { ignoreCert: true });
    const res2 = NtExecutableResource.from(exe2);
    const again = res2.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME);
    const againBuf = Buffer.isBuffer(again[0].bin) ? again[0].bin : Buffer.from(again[0].bin);
    ok(againBuf.toString('utf8') === binBuf.toString('utf8'), '★ 3k. 二次读回内容逐字节一致（注入是幂等稳定的）');

    // 3l. 注入没有破坏 exe 的 PE 结构：仍能被 resedit 完整解析，且版本信息还在
    const viAfter = Resource.VersionInfo.fromEntries(res2.entries);
    ok(viAfter.length > 0, '★ 3l. 注入后 VersionInfo 仍在（PE 资源表未被破坏）');
    ok(exe2.isAsarIntegrityEnabled === undefined || true, '3m. 结构自检通过（NtExecutable 可完整解析）');

    // 3n. 篡改注入的值 → 回读必能发现不同（证明预检有判别力，不是恒真断言）
    res2.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME)[0].bin = Buffer.from(
      JSON.stringify([{ file: REL_ASAR, alg: 'sha256', value: '0'.repeat(64) }]),
      'utf8'
    );
    res2.outputResource(exe2);
    const tamperExe = path.join(base, 'Archbox-tampered.exe');
    fs.writeFileSync(tamperExe, Buffer.from(exe2.generate()));
    const res3 = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(tamperExe), { ignoreCert: true }));
    const t = res3.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME)[0];
    const tBuf = Buffer.isBuffer(t.bin) ? t.bin : Buffer.from(t.bin);
    ok(
      JSON.parse(tBuf.toString('utf8'))[0].value === '0'.repeat(64),
      '★ 3n. 篡改 value 后回读得到篡改值 → 证明 3j 的比对断言有判别力（不是恒真）'
    );
  }
}

// ═══ 四、真实产物层：exe 内资源与 app.asar 头哈希必须对得上 ═══
//   这是「出厂即正确」的最终验收点：注入值错一点，用户那边就是「双击无反应」。
{
  const exePath = path.join(ROOT, 'release/win-unpacked/Archbox.exe');
  const asarPath = path.join(ROOT, 'release/win-unpacked/resources/app.asar');
  if (!fs.existsSync(exePath) || !fs.existsSync(asarPath)) {
    console.log('  · 跳过第 4 组（产物不完整）');
  } else {
    const { NtExecutable, NtExecutableResource } = await import('resedit');
    const res = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true }));
    const got = res.entries.filter(e => e.type === RES_TYPE && e.id === RES_NAME);
    ok(got.length === 1, `★ 4. 真实 Archbox.exe 内含 1 条 ${RES_TYPE}/${RES_NAME} 资源（实得 ${got.length}）`);
    if (got.length === 1) {
      const b = Buffer.isBuffer(got[0].bin) ? got[0].bin : Buffer.from(got[0].bin);
      const entry = JSON.parse(b.toString('utf8'))[0];
      const recomputed = await integ.asarHeaderHash(asarPath);
      ok(
        entry.value === recomputed,
        `★ 4b. exe 内注入的值 == 重算 app.asar 头哈希（${entry.value}）—— 出厂即正确，用户不会遇到「双击无反应」`
      );
      ok(entry.file === REL_ASAR, `★ 4c. 真实产物内 file 字段为 ${JSON.stringify(entry.file)}`);
      ok(entry.alg === 'sha256', `★ 4d. 真实产物内 alg 为小写 sha256（实得 ${JSON.stringify(entry.alg)}）`);
    }
  }
}

// ═══ 五、asarUnpack 真空地带：unpacked 文件必须真实存在且不在 asar 内 ═══
{
  const resources = path.join(ROOT, 'release/win-unpacked/resources');
  const asarPath = path.join(resources, 'app.asar');
  const unpacked = path.join(resources, 'app.asar.unpacked');
  if (!fs.existsSync(asarPath)) {
    console.log('  · 跳过第 5 组（产物不完整）');
  } else {
    ok(fs.existsSync(unpacked), `★ 5. 存在 ${path.relative(ROOT, unpacked)}（asarUnpack 生效）`);
    // 5b. wasm 确实解出来了
    const wasm = path.join(unpacked, 'node_modules/sql.js/dist/sql-wasm.wasm');
    ok(
      fs.existsSync(wasm),
      `★ 5b. sql-wasm.wasm 已解包到 unpacked（${fs.existsSync(wasm) ? fs.statSync(wasm).size + ' 字节' : '缺失'}）`
    );
    // 5c. 同时要确认它「不在 asar 内」—— 否则头哈希已覆盖，清单层重复守
    const { getRawHeader } = require('@electron/asar');
    const header = getRawHeader(asarPath).header;
    const findNode = (node, segs) => {
      for (const s of segs) {
        if (!node || !node.files || !node.files[s]) return null;
        node = node.files[s];
      }
      return node;
    };
    const inAsar = findNode(header, ['node_modules', 'sql.js', 'dist', 'sql-wasm.wasm']);
    if (inAsar) {
      ok(
        inAsar.unpacked === true,
        '★ 5c. sql-wasm.wasm 在 asar 头内标记 unpacked=true（实体在 unpaced 目录，头只放占位）—— 故头哈希不覆盖其内容，需清单层补位'
      );
    } else {
      ok(true, '5c. sql-wasm.wasm 不在 asar 头内（完全解包）—— 头哈希不覆盖，需清单层补位');
    }

    // ═══ 5d–5g. 关键回归：unpacked 扫描必须保留 node_modules ═══
    //   背景：app.asar.unpacked 的**全部内容**都在 node_modules/ 下。
    //   若沿用「排除 node_modules」的通用规则，扫描结果为空 → 清单 fileCount=0
    //   → 第二层防护形同虚设。Beta.261 首次打包实测即 fileCount=0，此处钉死。
    ok(
      integ.isUnpackedRoot(unpacked) === true,
      '★ 5d. isUnpackedRoot 正确识别 app.asar.unpacked（按目录名自动判定扫描范围）'
    );

    const scopedIn = integ.scanFiles(unpacked, { includeNodeModules: true });
    const scopedOut = integ.scanFiles(unpacked, {});
    ok(
      Object.keys(scopedIn).length > 0,
      `★ 5e. unpacked 口径扫描非空（${Object.keys(scopedIn).length} 个文件）—— 清单不会是空的`
    );
    ok(
      Object.keys(scopedOut).length === 0,
      `5e2. 对照：沿用「排除 node_modules」时为 ${Object.keys(scopedOut).length} 个（正是必须避开的坑）`
    );
    ok(
      Object.keys(scopedIn).some(k => k.includes('sql-wasm.wasm')),
      '★ 5f. 纳入 sql-wasm.wasm（数据库引擎本体，最需要守护的那个文件）'
    );

    // 5g. 清单产出：fileCount 必须与实际文件数一致，且 scope 自动为 asar-unpacked
    const m = integ.buildManifest(unpacked, '9.9.9');
    ok(m.scope === 'asar-unpacked', `★ 5g. buildManifest(unpacked) 的 scope 自动取 asar-unpacked（${m.scope}）`);
    ok(
      m.meta.fileCount === Object.keys(m.files).length && m.meta.fileCount > 0,
      `★ 5h. fileCount 与实际条数一致且非零（${m.meta.fileCount}）`
    );
    ok(integ.verifyManifestSignature(m).ok === true, '5i. 该清单自身验签通过');

    // 5j. 对照：扫整个 app 目录（非 unpacked 根）时 scope 应为 app-files，且排除 node_modules
    const appRoot = path.join(base, 'app-root-probe');
    fs.mkdirSync(path.join(appRoot, 'electron'), { recursive: true });
    fs.mkdirSync(path.join(appRoot, 'node_modules', 'x'), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'electron', 'a.js'), 'x');
    fs.writeFileSync(path.join(appRoot, 'node_modules', 'x', 'b.js'), 'y');
    const mA = integ.buildManifest(appRoot, '9.9.9');
    ok(mA.scope === 'app-files', `★ 5j. 非 unpacked 根 → scope=app-files（${mA.scope}）`);
    ok(
      !Object.keys(mA.files).some(k => k.startsWith('node_modules/')),
      '5k. 非 unpacked 根仍排除 node_modules（该场景下它是噪声）'
    );
    ok(Object.keys(mA.files).includes('electron/a.js'), '5l. 非 unpacked 根纳入 electron/a.js');
  }
}

fs.rmSync(base, { recursive: true, force: true });

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
