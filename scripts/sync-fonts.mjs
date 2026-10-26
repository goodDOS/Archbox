#!/usr/bin/env node
/**
 * 从 @fontsource 的各语言包中「精确挑出」本项目需要的分片，落到 src/assets/fonts/。
 *
 * 【为什么不直接 npm install 那些包】
 *   10 种语言合计的字体包原始体积约 300 MB（简中 71M / 繁中 65M / 日 79M / 韩 48M…），
 *   而本项目每个语种只用 400 常规一个字重、且中文类只需 unicode-range 分片文件。
 *   npm 依赖会把整个包塞进 node_modules 并进入 lockfile —— 体积翻十几倍，还拖慢安装。
 *   这里改成「脚本拉包 → 只取需要的文件 → 落地 → 包本身不进仓库」。
 *
 * 【产物】
 *   public/fonts/<family>-<subset>-400.woff2   实际字体文件
 *   public/fonts/fonts.css                     由本脚本生成的 @font-face 汇总
 *   public/fonts/LICENSES.md                   各字体许可与来源（随产物分发，必须留）
 *
 * 【为什么放 public/ 而不是 src/assets/】
 *   本项目用 vite-plugin-singlefile，src/ 下的资源会被 base64 内联进 dist/index.html。
 *   13 MB 字体内联进 HTML 会让首屏解析与内存暴涨，且失去 unicode-range 按需加载的意义。
 *   public/ 下的文件由 vite 原样拷到 dist/，不进 bundle —— 这才符合字体该有的加载方式。
 *
 * 【为什么不手工维护 fonts.css】
 *   中文类字体有 102–125 个 unicode-range 分片，手写等于抄一遍别人生成的 CSS，
 *   抄错一个 range 就表现为「某些汉字显示成方块」。全部由脚本从包内 CSS 里抽。
 *
 * 用法：node scripts/sync-fonts.mjs            只补缺失（幂等，日常用这个）
 *       node scripts/sync-fonts.mjs --force    强制重新拉取
 *       node scripts/sync-fonts.mjs --check    只校验产物完整性，不下载（CI / 测试用）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'fonts');
const cssFile = path.join(outDir, 'fonts.css');
const licFile = path.join(outDir, 'LICENSES.md');

/* ============ 字体清单：全项目唯一来源 ============
 * family  → CSS 里使用的 family 名（与 src/utils/fontFace.js 的 FONT_STACK 对应）
 * pkg     → @fontsource 包名
 * subset  → 取哪些 unicode-range 分片；'*' 表示该包全部 400 分片
 * scripts → 这族字体覆盖哪些界面语言（用于覆盖率测试）
 * note    → 落进 LICENSES.md 的补充说明 */
export const FONTS = [
  {
    family: 'Noto Sans',
    pkg: 'noto-sans',
    subset: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'vietnamese'],
    scripts: ['en', 'fr', 'de', 'is', 'ru'],
    note: '拉丁 / 西里尔 / 希腊，覆盖英法德冰岛与俄语'
  },
  {
    family: 'Noto Sans SC',
    pkg: 'noto-sans-sc',
    subset: '*',
    scripts: ['zh-CN'],
    note: '简体中文，102 个 unicode-range 分片'
  },
  {
    family: 'Noto Sans TC',
    pkg: 'noto-sans-tc',
    subset: '*',
    scripts: ['zh-TW'],
    note: '繁体中文，109 个 unicode-range 分片'
  },
  {
    family: 'Noto Sans JP',
    pkg: 'noto-sans-jp',
    subset: '*',
    scripts: ['ja'],
    note: '日文，125 个 unicode-range 分片'
  },
  {
    family: 'Noto Sans KR',
    pkg: 'noto-sans-kr',
    subset: '*',
    scripts: ['ko'],
    note: '韩文，125 个 unicode-range 分片'
  },
  {
    family: 'Noto Sans Arabic',
    pkg: 'noto-sans-arabic',
    subset: ['arabic', 'latin'],
    scripts: ['ar'],
    note: '阿拉伯文'
  },
  {
    /* emoji 用彩色版（用户选定）。★ 彩色字体的字族必须排在所有文字字族之后：
     * emoji 字体里也含数字与 # * 等键帽字符（U+0023、U+0030-0039），
     * 若排在前面，正文里的 0-9 会被拿去渲染成「键帽 emoji」，整篇文档的数字全变方块表情。
     * 它也不该抢普通字符，只该接住文字字体没有的 emoji 码位。 */
    family: 'Noto Color Emoji',
    pkg: 'noto-color-emoji',
    subset: '*',
    scripts: [],
    note: '彩色 emoji，12 个 unicode-range 分片；必须排在文字字族之后，否则会抢走数字'
  }
];

const MIRROR = 'https://registry.npmjs.org';
const UA = 'archbox-font-sync/1.0';

function get(url, redirect = 0) {
  return new Promise((resolve, reject) => {
    if (redirect > 5) return reject(new Error('重定向过多'));
    https
      .get(url, { headers: { 'user-agent': UA } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(get(new URL(res.headers.location, url).href, redirect + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} ${url}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function latestTarball(pkg) {
  const raw = await get(`${MIRROR}/@fontsource/${pkg}`);
  const meta = JSON.parse(raw.toString('utf8'));
  const ver = meta['dist-tags'].latest;
  return { version: ver, url: meta.versions[ver].dist.tarball };
}

/** 从包内 CSS 抽出指定 subset 的 @font-face 块，改写成指向本地文件 */
function buildFaceBlocks(cssText, family, subset, keepSet, prefix) {
  const blocks = [];
  const re = /@font-face\s*\{[^}]*\}/g;
  let m;
  while ((m = re.exec(cssText))) {
    const block = m[0];
    const weight = /font-weight:\s*(\d+)/.exec(block);
    if (!weight || weight[1] !== '400') continue;
    if (/font-style:\s*italic/.test(block)) continue;
    const urlM = /url\(\.?\/?files\/([^)]+\.woff2)\)/.exec(block);
    if (!urlM) continue;
    const fileName = urlM[1];
    if (!keepSet.has(fileName)) continue;
    const range = /unicode-range:\s*([^;}]+)/.exec(block);
    const lines = [
      '@font-face {',
      `  font-family: '${family}';`,
      '  font-style: normal;',
      '  font-weight: 400;',
      '  font-display: swap;',
      `  src: url('./${prefix}${fileName}') format('woff2');`
    ];
    if (range) lines.push(`  unicode-range: ${range[1].trim()};`);
    lines.push('}');
    blocks.push({ fileName, text: lines.join('\n') });
  }
  return blocks;
}

/** 决定要保留哪些分片文件名
 *
 * 分片名形如 noto-sans-greek-ext-400-normal.woff2 / noto-sans-latin-400-normal.woff2。
 * ★ 必须按「-分片名-」整段匹配，不能用 includes('latin')：
 *   那样 latin 会连带命中 latin-ext，greek 命中 greek-ext，多拉一倍文件。
 *   中文类分片是数字（noto-sans-sc-12-400-normal.woff2），subset: '*' 时全收。 */
function pickFiles(files, subset, pkg) {
  const all = files.filter(f => /-400-normal\.woff2$/.test(f));
  if (subset === '*') return new Set(all);
  const wanted = new Set(subset);
  return new Set(
    all.filter(f => {
      // 剥掉尾部 -400-normal.woff2，再剥掉「<包名>-」前缀，剩下的才是分片名
      // （包名本身含连字符，所以必须先去掉包名再取，不能简单地按最后一个 - 切）
      const body = f.replace(/-400-normal\.woff2$/, '');
      const rest = body.startsWith(pkg + '-') ? body.slice(pkg.length + 1) : body;
      return wanted.has(rest);
    })
  );
}

async function syncOne(spec) {
  const { version, url } = await latestTarball(spec.pkg);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archbox-font-'));
  const tgz = path.join(tmp, 'pkg.tgz');
  process.stdout.write(`  ${spec.family}  v${version} …`);
  const buf = await get(url);
  fs.writeFileSync(tgz, buf);

  // 只解出 css 与 woff2，避免 70 MB 的包全量落盘
  execFileSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'ignore' });
  const filesDir = path.join(tmp, 'package', 'files');
  const names = fs.readdirSync(filesDir).filter(f => f.endsWith('.woff2'));
  const keep = pickFiles(names, spec.subset, spec.pkg);
  if (!keep.size) throw new Error(`${spec.pkg}: 未匹配到任何 400 分片`);
  for (const n of keep) {
    fs.copyFileSync(path.join(filesDir, n), path.join(outDir, n));
  }

  // 依次尝试包内的分片 CSS，取并集（同一文件的 @font-face 只保留第一份）
  const cssCandidates = ['index.css', '400.css'].concat(
    fs.readdirSync(path.join(tmp, 'package')).filter(f => f.endsWith('.css') && !/^\d+\.css$/.test(f))
  );
  const seen = new Set();
  const blocks = [];
  for (const c of cssCandidates) {
    const p = path.join(tmp, 'package', c);
    if (!fs.existsSync(p)) continue;
    for (const b of buildFaceBlocks(fs.readFileSync(p, 'utf8'), spec.family, spec.subset, keep, '')) {
      if (seen.has(b.fileName)) continue;
      seen.add(b.fileName);
      blocks.push(b);
    }
  }
  if (blocks.length < keep.size) {
    throw new Error(`${spec.pkg}: @font-face 只抽到 ${blocks.length} 条，文件有 ${keep.size} 个`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(` ${keep.size} 个分片`);
  return { blocks, version };
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const force = args.includes('--force');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (checkOnly) {
    let bad = 0;
    if (!fs.existsSync(cssFile)) {
      console.error('✗ 缺少 public/fonts/fonts.css，请先运行 node scripts/sync-fonts.mjs');
      process.exit(1);
    }
    const css = fs.readFileSync(cssFile, 'utf8');
    const refs = [...css.matchAll(/url\('\.\/([^']+\.woff2)'\)/g)].map(m => m[1]);
    for (const r of refs) {
      if (!fs.existsSync(path.join(outDir, r))) {
        console.error(`✗ 引用了不存在的文件：${r}`);
        bad += 1;
      }
    }
    for (const spec of FONTS) {
      if (!css.includes(`font-family: '${spec.family}'`)) {
        console.error(`✗ fonts.css 缺少字族：${spec.family}`);
        bad += 1;
      }
    }
    const onDisk = fs.readdirSync(outDir).filter(f => f.endsWith('.woff2')).length;
    const orphan = onDisk - new Set(refs).size;
    if (orphan > 0) {
      console.error(`✗ 有 ${orphan} 个 woff2 未被 fonts.css 引用（残留文件）`);
      bad += 1;
    }
    if (bad) process.exit(1);
    console.log(`✓ 字体产物完整：${refs.length} 个分片、${FONTS.length} 个字族、0 悬空引用`);
    return;
  }

  const haveAll = fs.existsSync(cssFile) && !force;
  if (haveAll) {
    console.log('字体已存在，跳过下载（要重新生成请加 --force）');
    console.log('校验：node scripts/sync-fonts.mjs --check');
    return;
  }

  console.log('拉取字体分片…');
  const sections = [];
  const lic = [
    '# 字体许可与来源',
    '',
    '本目录下的 `.woff2` 由 `scripts/sync-fonts.mjs` 从 [Fontsource](https://fontsource.org/) 的',
    '`@fontsource/*` 包中抽取（这些包是 Google Noto 字体的分发版），**仅保留 400 常规字重**。',
    '',
    '所有字体均为 SIL Open Font License 1.1（OFL-1.1），允许随软件一同分发。',
    '',
    '| 字族 | 包 | 版本 | 语言 | 说明 |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const spec of FONTS) {
    const { blocks, version } = await syncOne(spec);
    sections.push(
      `/* ===== ${spec.family} 覆盖：${spec.scripts.join(', ')} ===== */\n` + blocks.map(b => b.text).join('\n')
    );
    lic.push(
      `| ${spec.family} | \`@fontsource/${spec.pkg}\` | ${version} | ${spec.scripts.join(', ')} | ${spec.note} |`
    );
  }

  const header = [
    '/* ★ 本文件由 scripts/sync-fonts.mjs 自动生成，请勿手改 ★',
    ' *',
    ' * 只含 400 常规字重，font-display: swap。中文类走 unicode-range 分片，',
    ' * 浏览器按实际用到的字符按需请求，不会一次拉全。',
    ' *',
    ' * 重新生成：node scripts/sync-fonts.mjs --force',
    ' */',
    ''
  ].join('\n');

  fs.writeFileSync(cssFile, header + sections.join('\n\n') + '\n');
  fs.writeFileSync(licFile, lic.join('\n') + '\n');

  const total = fs
    .readdirSync(outDir)
    .filter(f => f.endsWith('.woff2'))
    .reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`\n✓ 完成：${FONTS.length} 个字族，${(total / 1048576).toFixed(2)} MB`);
}

main().catch(e => {
  console.error('字体同步失败：', e.message);
  process.exit(1);
});
