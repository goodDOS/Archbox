'use strict';
/**
 * electron-builder afterPack 钩子：
 *   1) 对打包后的可执行文件「熔断」(flip fuses)
 *   2) 向 exe 注入 PE 资源 INTEGRITY/ELECTRONASAR —— Electron 原生 asar 完整性校验的基准
 *   3) 构建期预检：回读注入的资源，与重算的 asar 头哈希比对，不一致则**打包失败**
 *   4) 生成「程序文件签名清单」resources/app-integrity.json（守 asar 之外的 unpacked 文件）
 *
 * --- 关于 fuses ---
 * Electron Fuse 是写入到二进制末尾的一组开关位，运行时由 Electron 自身读取。
 * 熔断后，即使攻击者拿到 exe 也无法通过环境变量/命令行参数把 Node 注入回主进程，
 * 是「无 EV 证书签名」场景下提升分发安全性的关键一层（非替代签名，而是纵深防御）。
 *
 * --- 关于 asar 完整性（本层为什么比自建清单强）---
 * build.asar=true 后，应用主体打包为 resources/app.asar（归档文件，内含全部
 * electron/*.js、dist/index.html、package.json）。Electron 通过两个 fuse 强制：
 *   - EnableEmbeddedAsarIntegrityValidation = true
 *       → 启动时读 exe 内的 INTEGRITY/ELECTRONASAR 资源，重算 app.asar 头哈希比对，
 *         不匹配则 console.error('ASAR Integrity Violation: got a hash mismatch')
 *         + process.exit(1)。该校验发生在 Electron 运行时内部，**早于
 *         electron/main.js**，应用代码无法 catch、无法弹窗、无法写日志 —— 这正是
 *         它比「自建清单」强的地方：裁判（校验逻辑 + 期望值）住在 exe 二进制里，
 *         选手（app.asar）不在同一目录，攻击者改 asar 必然启动失败。
 *   - OnlyLoadAppFromAsar = true
 *       → 禁止 Electron 从 app.asar 之外的路径加载主进程，堵死「放一个同名
 *         目录 resources/app/ 抢先加载」的绕过手法。
 *
 * Windows 侧注入位置是 **PE 资源**（不是 macOS 的 Info.plist）：
 *   type = 'INTEGRITY'，name = 'ELECTRONASAR'
 *   值 = UTF-8 编码的 JSON 数组，形如
 *     [{"file":"resources\\app.asar","alg":"sha256","value":"<hex>"}]
 *   三个易错点：
 *     - file 必须用**反斜杠**（Windows 路径），用正斜杠会被判为「找不到目标」；
 *     - alg 必须**小写** 'sha256'，大写会被判为不支持的算法；
 *     - value 是 **asar 头部 JSON 字符串**的 sha256（不是整个文件的哈希！）。
 *   Electron 30 才在 Windows 上支持该校验（macOS 自 16 起）——本项目 30.5.1 可用。
 *
 * --- 关于程序文件签名清单 ---
 * 见 services/integrity.js 的模块注释。清单只覆盖 resources/app.asar.unpacked/
 * （asarUnpack 解出来的 sql.js wasm 等）——那是 asar 头哈希照不到的真空地带。
 * 清单必须放在 resources/ 下、被校验目录之外 —— 否则扫描自身会把清单写进清单，
 * 且清单位于被校验目录内时其哈希会随清单自身变化而永不稳定。
 *
 * 仅对 Windows 产物生效（本应用只发 Windows x64）。
 */
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');
const integrity = require('../electron/services/integrity');

/** PE 资源的类型名与资源名（Electron 只认这一对，写错则校验静默不生效） */
const INTEGRITY_RESOURCE_TYPE = 'INTEGRITY';
const INTEGRITY_RESOURCE_NAME = 'ELECTRONASAR';

/**
 * 向 exe 注入 asar 完整性校验资源，随后立刻回读做构建期预检。
 *
 * @param {string} exePath 打包后的可执行文件绝对路径
 * @param {string} asarPath app.asar 绝对路径
 * @param {string} relAsar 资源中记录的相对路径（必须用反斜杠）
 * @returns {Promise<{headerHash:string, payload:string}>}
 */
async function injectAsarIntegrity(exePath, asarPath, relAsar) {
  // resedit 是 ESM-only（package.json type: module），必须走动态 import
  const { NtExecutable, NtExecutableResource, Resource } = await import('resedit');

  const headerHash = await integrity.asarHeaderHash(asarPath);
  console.log('[afterPack] asar header hash ->', headerHash);

  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  // lang / codepage 必须取自 exe 已有的版本信息，否则资源表可能被 Windows 忽略
  const vi = Resource.VersionInfo.fromEntries(res.entries);
  if (!vi.length) {
    throw new Error('[afterPack] exe 内未找到 VersionInfo，无法确定资源语言/代码页 -> ' + exePath);
  }
  const langs = vi[0].getAllLanguagesForStringValues();
  if (!langs.length) {
    throw new Error('[afterPack] VersionInfo 内未找到可用的语言/代码页对');
  }
  const { lang, codepage } = langs[0];

  const payloadStr = JSON.stringify([{ file: relAsar, alg: 'sha256', value: headerHash }]);
  const payload = Buffer.from(payloadStr, 'utf8');
  res.entries.push({
    type: INTEGRITY_RESOURCE_TYPE,
    id: INTEGRITY_RESOURCE_NAME,
    bin: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
    lang,
    codepage
  });
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(
    `[afterPack] 已注入 PE 资源 ${INTEGRITY_RESOURCE_TYPE}/${INTEGRITY_RESOURCE_NAME}（lang=${lang} codepage=${codepage}）`
  );

  return { headerHash, payload: payloadStr };
}

/**
 * 构建期预检（方案 A「把问题挡在出厂前」）：
 * 重新读取 exe 里的资源，与期望值逐项比对。任一项不符 → 抛错 → 打包失败。
 * 这样「注入没生效 / 路径写错 / 算法名写错 / 哈希对不上」不可能溜到用户手上。
 *
 * @returns {{ok:true, entry:object}}
 */
async function precheckInjectedIntegrity(exePath, expectRelAsar, expectHeaderHash) {
  const { NtExecutable, NtExecutableResource } = await import('resedit');
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);
  const entries = res.entries.filter(e => e.type === INTEGRITY_RESOURCE_TYPE && e.id === INTEGRITY_RESOURCE_NAME);
  if (entries.length !== 1) {
    throw new Error(
      `[afterPack] 预检失败：exe 内 ${INTEGRITY_RESOURCE_TYPE}/${INTEGRITY_RESOURCE_NAME} 资源数量为 ${entries.length}，期望 1`
    );
  }
  const raw = entries[0].bin;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error('[afterPack] 预检失败：资源内容不是合法 JSON -> ' + buf.toString('utf8'));
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error('[afterPack] 预检失败：资源内容不是长度为 1 的数组 -> ' + buf.toString('utf8'));
  }
  const entry = parsed[0];
  if (entry.file !== expectRelAsar) {
    throw new Error(
      `[afterPack] 预检失败：file 字段为 ${JSON.stringify(entry.file)}，期望 ${JSON.stringify(expectRelAsar)}（必须用反斜杠）`
    );
  }
  if (entry.file.includes('/')) {
    throw new Error('[afterPack] 预检失败：file 字段含正斜杠，Windows 下必须是反斜杠 -> ' + entry.file);
  }
  if (entry.alg !== 'sha256') {
    throw new Error(`[afterPack] 预检失败：alg 字段为 ${JSON.stringify(entry.alg)}，必须是全小写 'sha256'`);
  }
  if (entry.value !== expectHeaderHash) {
    throw new Error(`[afterPack] 预检失败：value 字段 ${entry.value} != 重算头哈希 ${expectHeaderHash}`);
  }
  return { ok: true, entry };
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exeName = context.packager.appInfo.productFilename + '.exe';
  const exePath = path.join(context.appOutDir, exeName);
  const resourcesDir = path.join(context.appOutDir, 'resources');
  const asarPath = path.join(resourcesDir, integrity.ASAR_NAME);
  const unpackedDir = path.join(resourcesDir, integrity.UNPACKED_NAME);
  const version = context.packager.appInfo.version;

  // ---------- 1) flip fuses ----------
  console.log('[afterPack] flipFuses ->', exePath);
  await flipFuses(exePath, {
    version: FuseVersion.V1,
    // 禁止以 Node 方式运行（最重要：阻断 NODE_OPTIONS / --inspect 等注入途径）
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // 与 build.asar=true 配套：强制只从 resources/app.asar 加载主进程。
    // 置 true 后，攻击者无法通过投放同名目录 resources/app/ 抢先加载主进程；
    // 若产物里没有 app.asar（例如误把 build.asar 改回 false），exe 会直接退出，
    // 表现为「双击无反应、无窗口、无日志」——这是刻意的硬失败，不是 bug。
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // asar 完整性校验：读 exe 内 INTEGRITY/ELECTRONASAR 资源，重算头哈希比对，
    // 不匹配即 console.error + process.exit(1)（发生在 main.js 之前，应用无法捕获）。
    // 这是本项目「防程序文件修改」的最强一层——校验逻辑住在 exe 二进制内部。
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.LoadBrowserExtensionsSpecificURL]: false,
    // ★ 必须保持 true —— 这是 Beta.265 白屏的根因，别再关它 ★
    //
    // 官方默认值就是 Enabled。它的作用是：给 file:// 页面的"额外特权"，
    // 其中一条是「file:// 页面可以用 file:// 加载其它资源」。
    //
    // 本应用的页面正是用 loadFile() 从 file:// 提供的，而且页面在 asar 内部：
    //   file:///D:/.../resources/app.asar/dist/index.html
    // 关掉这个 fuse 后，Chromium 认为 asar 内的这个地址不是可读的本地资源，
    // 直接拒绝加载：
    //   Not allowed to load local resource: file:///.../app.asar/dist/index.html
    // 于是页面从未载入 → 纯白屏、无启动屏、无 [renderer] 日志，而主进程日志
    // 一切正常（窗口确实建了、数据库就绪）—— 极具迷惑性。
    //
    // 文档原话："If you aren't serving pages from file://, you should disable
    // this fuse." 反过来就是本项目的处境：**我们就是从 file:// 提供页面**，
    // 所以必须让它保持 enabled。
    //
    // 若将来改成用自定义协议（protocol.handle）提供页面，才可以考虑关掉它；
    // 两件事必须一起改，不能只关 fuse。
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
    // 注意：Electron 30 已默认开启 cookie 加密，此处显式置 true 以防回归
    [FuseV1Options.EnableCookieEncryption]: true
  });
  console.log('[afterPack] fuses flipped OK');

  // ---------- 2) 注入 asar 完整性资源 ----------
  if (!fs.existsSync(asarPath)) {
    throw new Error(
      '[afterPack] 未找到 ' +
        integrity.ASAR_NAME +
        '，无法注入 asar 完整性校验。' +
        '若刚把 build.asar 改回 false，请同步把 OnlyLoadAppFromAsar / EnableEmbeddedAsarIntegrityValidation 改回 false。'
    );
  }
  const relAsar = 'resources\\' + integrity.ASAR_NAME; // Electron 要求反斜杠
  const { payload } = await injectAsarIntegrity(exePath, asarPath, relAsar);

  // ---------- 3) 构建期预检（不一致则打包失败） ----------
  const pre = await precheckInjectedIntegrity(exePath, relAsar, await integrity.asarHeaderHash(asarPath));
  console.log('[afterPack] 预检通过：exe 内资源与重算头哈希一致 ->', pre.entry.value);

  // ---------- 4) 程序文件签名清单（只覆盖 asar 之外的 unpacked 文件） ----------
  //
  // ★ 为什么不在这里「目录不存在就静默跳过」★
  //   asarUnpack 配错（少写/写错 glob）时，resources/app.asar.unpacked 不会出现，
  //   旧写法仅 warn + return → 打出来的包**没有第二层防护**却一路成功出厂，
  //   直到用户机器上 sql.js 因读不到 wasm 而崩溃才暴露，且无从归因。
  //   正确判据来自 asar 头：头里若声明了 unpacked 实体，则目录必须存在，
  //   否则就是构建配置错误，应在**出厂前**让打包失败（fail fast）。
  const asarState = integrity.asarStateFor(unpackedDir);
  if (!fs.existsSync(unpackedDir)) {
    if (asarState.declaredUnpacked.length) {
      throw new Error(
        '[afterPack] 矛盾态：' +
          integrity.ASAR_NAME +
          ' 头部声明了 ' +
          asarState.declaredUnpacked.length +
          ' 个 unpacked 文件（如 ' +
          asarState.declaredUnpacked.slice(0, 3).join('、') +
          '），但 resources/' +
          integrity.UNPACKED_NAME +
          ' 目录不存在。' +
          '请检查 package.json 的 asarUnpack 配置是否与依赖实际布局一致。'
      );
    }
    console.warn('[afterPack] 无 unpacked 内容（asarUnpack 未命中任何文件），跳过 unpacked 签名清单生成');
    return;
  }
  const out = integrity.writeManifest(unpackedDir, version);
  const man = JSON.parse(fs.readFileSync(out, 'utf8'));
  console.log(
    `[afterPack] unpacked 签名清单已生成 -> ${path.relative(context.appOutDir, out)}（scope=${man.scope}，${man.meta.fileCount} 个文件，版本 ${man.meta.version}）`
  );
  // 即时自检一次：打包产物必须能通过自己的清单校验，否则说明清单口径有 bug
  const check = integrity.verifyAppFiles(unpackedDir);
  if (!check.ok) {
    throw new Error('[afterPack] 自检失败：刚生成的清单与产物不一致 -> ' + check.reason);
  }
  if (check.checked !== man.meta.fileCount) {
    throw new Error(`[afterPack] 自检失败：比对文件数 ${check.checked} != 清单声明 ${man.meta.fileCount}`);
  }
  console.log(`[afterPack] 清单自检通过（比对 ${check.checked} 个文件，全部一致）`);
  console.log(
    `[afterPack] 三层防护就位：${integrity.ASAR_NAME} 头哈希（exe 内） + ${man.meta.fileCount} 个 unpacked 文件签名 + ${payload.length} 字节 PE 资源`
  );
};
