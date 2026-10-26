#!/usr/bin/env node
/**
 * 打包 Windows 免安装版，并在打包前自动递增构建序号以区分每次产物。
 *
 * 版本号规则（基于 package.json 的 version）：
 *   - 已有 Beta 后缀：0.9.0-Beta.20 -> 0.9.0-Beta.21 -> 0.9.0-Beta.22 ...
 *   - 已有 test 后缀：0.9.0-test.5 -> 0.9.0-test.6 ...
 *   - 纯版本号：0.9.0 -> 0.9.0-test.1
 * 即保持主语义版本不变，按后缀自动选择 Beta / test 序列追加构建序号做区分（大小写不敏感）。
 * 该序号写入 package.json 后：
 *   - electron-builder 会把它注入 asar 内 package.json；
 *   - 应用内标题栏 / 关于页 / 运行日志 均通过 app.getVersion() 动态展示，自动同步；
 *   - 最终 zip 文件名也使用该版本号，便于区分。
 *
 * 用法：node scripts/build-win-unpacked.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');

// ---------- 1. 读取并递增版本号 ----------
/* ★ 只改 version 这一个字段，其余**按原文保留**（Beta.322 修的真 bug）★
 *
 * 原实现是 `pkg.version = next; JSON.stringify(pkg, null, 2)`，看似无损，实则把整份
 * package.json 重新序列化了一遍 —— 一旦文件末尾没有换行（本仓库历来如此），
 * `split('\n')` 之后最后一段就是 `"}"` 而不是 `""`，于是 `pop()` 丢掉的是**真正的
 * 收尾大括号**，再把 `''` push 回去，得到的是一个少了大括号的 JSON。
 * 后果：写着「版本号: Beta.321 -> Beta.322」一切正常，但 package.json 里 scripts、
 * devDependencies、build（含 afterPack 反篡改钩子配置！）全部消失，而打包流程用的是
 * 内存里的 pkg 对象，所以构建照样成功 —— 直到下一次任何工具读这个文件才炸。
 *
 * 正确做法：定位 `"version": "..."` 那一行做**行内替换**，不碰其余任何字节。
 * 这样既保留了字段顺序、注释式排版与缩进，也从根本上不可能丢字段。 */
const pkgSrc = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(pkgSrc);
const cur = pkg.version;

// 匹配：基础版本(1) + 可选的 -test.N 或 -Beta.N（保持现有 Beta/Test 序列递增）
// 注意：外层 -(?:test|beta)(?:\.(\d+))? 是非捕获组，内层 (\d+) 实际为第 2 组（非第 3 组）
const m = String(cur).match(/^(.+?)(?:-(?:test|beta)(?:\.(\d+))?)?$/i);
const base = m[1];
const seq = m[2] ? parseInt(m[2], 10) + 1 : 1;
const suffix = /beta/i.test(cur) ? 'Beta' : 'test';
const next = `${base}-${suffix}.${seq}`;

const verLine = /^(\s*)"version":(\s*)"[^"]*"(.*)$/m;
if (!verLine.test(pkgSrc)) throw new Error('package.json 里找不到 "version" 行，无法递增版本号');
const pkgOut = pkgSrc.replace(verLine, `$1"version":$2"${next}"$3`);
/* 硬性自检：替换后必须仍是合法 JSON，且除 version 外**字段集合完全一致**。
 * 没有这一步，上面提到的「静默丢字段」还会在别的写法下重演。 */
const check = JSON.parse(pkgOut);
const keysOf = o => Object.keys(o).sort().join(',');
if (keysOf(check) !== keysOf(pkg) || JSON.stringify({ ...check, version: cur }) !== JSON.stringify(pkg)) {
  throw new Error('package.json 版本号替换后内容不一致（除 version 外有字段变化），已中止');
}
fs.writeFileSync(pkgPath, pkgOut);
console.log(`[build] 版本号: ${cur} -> ${next}`);

// ---------- 2. 构建前端 ----------
/* 字体体检前置：字体是运行时才用到的资产，缺了不会让构建失败，
 * 只会让用户机器上所有文字回落到系统字体 —— 而设置里还显示「自带字体」，
 * 排查起来毫无线索。所以在这里直接卡死，宁可不打包也不要发出没有字体的包。 */
console.log('[build] 校验字体产物 ...');
execSync('node scripts/sync-fonts.mjs --check', { cwd: root, stdio: 'inherit' });

console.log('[build] 构建前端 dist ...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// 构建产物体检：繁体字典必须是简体字形转写，且包里不许残留旧译
// （打包器会把 parts/*.zh-TW.js 的模块体多内联一份，旧的台湾化译法因此会漏进产物）
console.log('[build] 校验产物内语言包 ...');
execSync('node scripts/check-dist-i18n.mjs dist', { cwd: root, stdio: 'inherit' });

/* 产物里字体必须真的被拷过去（public/ → dist/fonts/）。
 * vite 的 public 拷贝是隐式的：若哪天改 vite 配置或 publicDir，字体就静默消失，
 * 而 index.html 依然正常、测试依然全绿。这里按「数量 + 总体积」双重核对。 */
console.log('[build] 校验产物内字体 ...');
{
  const dFonts = path.join(root, 'dist', 'fonts');
  if (!fs.existsSync(dFonts)) throw new Error('dist/fonts 不存在：public/fonts 未被拷入产物');
  const woff = fs.readdirSync(dFonts).filter(f => f.endsWith('.woff2'));
  const srcWoff = fs.readdirSync(path.join(root, 'public', 'fonts')).filter(f => f.endsWith('.woff2'));
  if (woff.length !== srcWoff.length) {
    throw new Error(`dist/fonts 字体数不符：产物 ${woff.length} / 源 ${srcWoff.length}`);
  }
  const mb = (woff.reduce((s, f) => s + fs.statSync(path.join(dFonts, f)).size, 0) / 1048576).toFixed(1);
  console.log(`[build] 字体就位：${woff.length} 个分片，${mb} MB`);
}

// ---------- 3. 打包 win-unpacked（免安装目录）----------
const releaseDir = path.join(root, 'release');
const winUnpackedDir = path.join(releaseDir, 'win-unpacked');
const mirrors = [
  'ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/',
  'ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/'
].join(' ');

// 发布方私钥注入：从仓库外（release-private.pem）或环境变量读取，注入给
// afterPack 钩子（经 electron-builder 子进程继承）。私钥绝不写入仓库/产物。
const releaseKeyFile = path.join(root, 'release-private.pem');
let releaseKeyEnv;
if (process.env.ARCHBOX_RELEASE_PRIVATE_KEY) {
  releaseKeyEnv = process.env.ARCHBOX_RELEASE_PRIVATE_KEY;
  console.log('[build] 发布方私钥来自环境变量 ARCHBOX_RELEASE_PRIVATE_KEY');
} else if (fs.existsSync(releaseKeyFile)) {
  releaseKeyEnv = fs.readFileSync(releaseKeyFile, 'utf8').trim();
  console.log('[build] 发布方私钥来自 release-private.pem（本地文件，不入仓库）');
} else {
  // 首次打包：本地生成一对发布方密钥并落盘到 release-private.pem，
  // 打印公钥，提示开发者把公钥填进 electron/services/release-sign.js。
  const { generateKeyPairSync } = await import('node:crypto');
  const kp = generateKeyPairSync('ed25519');
  releaseKeyEnv = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
  fs.writeFileSync(releaseKeyFile, releaseKeyEnv);
  console.log('[build] 首次打包：已生成本地发布方密钥对 -> release-private.pem');
  console.log('[build] ★ 请把下面的公钥填入 electron/services/release-sign.js 的 RELEASE_PUBLIC_KEY_PEM：');
  console.log(kp.publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('[build] ★ release-private.pem 已加入 .gitignore，请妥善备份，丢失将无法重签旧版清单');
}

// 关键修复：打包前先彻底清理上一次的产物目录。
// 否则 electron-builder --dir 会在已存在的 win-unpacked 上做增量合并，
// 单文件内联的 index.html 存在「先截断为 0 字节再写入」的瞬态，
// 紧随其后的 zip -r 可能把 0 字节的 index.html 打进包（Beta.102~105 复现的竞态）。
fs.rmSync(winUnpackedDir, { recursive: true, force: true });

console.log('[build] 打包 win-unpacked ...');
const buildEnv = { ...process.env };
if (releaseKeyEnv) buildEnv.ARCHBOX_RELEASE_PRIVATE_KEY = releaseKeyEnv;
execSync(`${mirrors} npx electron-builder --win --dir --x64 --config.win.signAndEditExecutable=false`, {
  cwd: root,
  stdio: 'inherit',
  env: buildEnv
});

// 3.1 将本软件许可文件随附进成品（win-unpacked 根目录），与 Electron/Chromium 自带许可并存
const licenseSrc = path.join(root, 'LICENSE');
const licenseDst = path.join(winUnpackedDir, 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, licenseDst);
  console.log('[build] 已随附本软件 LICENSE ->', path.relative(root, licenseDst));
} else {
  console.warn('[build] 未找到项目根 LICENSE，跳过随附');
}

// ---------- 4. 压缩为 zip（带字节校验 + 失败重试，根治 0 字节竞态）----------
const zipName = `文档盒-win-unpacked-${next}.zip`;
const zipPath = path.join(releaseDir, zipName);
// ★ asar 迁移后锚点必须换 ★
//   旧路径 win-unpacked/resources/app/dist/index.html 是 asar:false 时代的真实目录；
//   asar:true 后该目录不存在（index.html 已进 resources/app.asar 归档），
//   unzip -p 取到 0 字节 → 旧的「竞态重试」逻辑会连续 3 次失败并抛错。
//   新的校验锚点用 resources/app.asar：它是归档文件，有稳定的字节数。
const asarInZip = 'win-unpacked/resources/app.asar';
const asarInWin = path.join(winUnpackedDir, 'resources', 'app.asar');
// 基准 = win-unpacked 内 app.asar 的实际字节数（zip 内应与之完全一致）
const expectBytes = fs.existsSync(asarInWin) ? fs.statSync(asarInWin).size : 0;

console.log(`[build] 打包 zip: ${zipName}`);

// 关键加固：zip 前等待 app.asar 在磁盘上稳定为期望字节数。
// electron-builder 存在「先截断为 0 再写入」的瞬态，execSync 返回后 overlayfs 上
// 仍可能短暂读到 0 字节（Beta.102~105、Beta.193 复现）。
// 旧逻辑「失败后仅重新 zip」无用——重试读到的仍是 0 字节；必须先等文件落稳。
for (let i = 0; i < 20; i++) {
  const sz = fs.existsSync(asarInWin) ? fs.statSync(asarInWin).size : 0;
  const stable = (expectBytes && sz === expectBytes) || (!expectBytes && sz > 1024);
  if (stable) break;
  if (i === 19)
    console.warn(`[build] 警告：win-unpacked 内 app.asar 未达期望（${sz}/${expectBytes} 字节），继续尝试打包`);
  execSync('sleep 0.5');
}

function runZip() {
  execSync(`rm -f "${zipName}" && zip -r "${zipName}" win-unpacked/ -x "*.DS_Store"`, {
    cwd: releaseDir,
    stdio: 'inherit'
  });
}
// 从 zip 内抽出 app.asar 的实际字节数（unzip -p 仅输出文件内容到 stdout）
function zipAsarBytes() {
  const out = execSync(`unzip -p "${zipName}" "${asarInZip}" | wc -c`, { cwd: releaseDir, encoding: 'utf8' });
  return parseInt((out || '').trim(), 10) || 0;
}

let gotBytes;
for (let attempt = 1; attempt <= 3; attempt++) {
  runZip();
  // 完整性自检（unzip -t 返回非 0 即损坏）
  const rc = execSync(`unzip -t "${zipName}" >/dev/null 2>&1; echo $?`, { cwd: releaseDir, encoding: 'utf8' }).trim();
  if (rc !== '0') console.warn(`[build] zip 完整性自检返回 ${rc}，第 ${attempt} 次`);
  gotBytes = zipAsarBytes();
  // 通过条件：与 win-unpacked 内 app.asar 字节一致；或基准缺失时退化为「显著大于 1KB」
  const ok = (expectBytes && gotBytes === expectBytes) || (!expectBytes && gotBytes > 1024);
  if (ok) {
    console.log(`[build] zip 校验通过：app.asar ${gotBytes} 字节（与 win-unpacked 一致，第 ${attempt} 次）`);
    break;
  }
  console.warn(`[build] zip 校验未通过（app.asar 实得 ${gotBytes} 字节，期望 ${expectBytes}），第 ${attempt} 次重试…`);
  if (attempt === 3) {
    throw new Error(`zip 校验连续 3 次失败：app.asar 实得 ${gotBytes} 字节，期望 ${expectBytes} 字节，疑似打包竞态`);
  }
}

console.log('[build] 完成 ->', zipPath);

// ---------- 5. 把 zip 复制一份到产物空间（项目根的上一级）----------
// 每次 Beta 产物（zip + 下载卡片）都落在项目根的上一级目录，与历史产物同目录。
// 下载卡片用相对链接引用同目录 zip，必须保证 zip 也在产物空间，
// 否则会出现「卡片在、点下载却 404」的情况（即当年 315 最初的根因）。
// 本步骤把当次 zip 自动复制一份进产物空间，固化该流程，不再依赖手工搬运。
// （下载卡片为人工生成物，直接写入产物空间，不在此自动产出。）
const distSpace = path.resolve(root, '..');
const distZip = path.join(distSpace, zipName);
fs.copyFileSync(zipPath, distZip);
console.log(`[build] 已复制产物到产物空间: ${path.relative(root, distZip)}`);
