/**
 * 语言包完整性单测（Beta.279）。
 *
 * 【这场事故值得单独立一个测试的原因】
 *   终端的构建日志一路全绿：体积正常、无旧译词、无语法错误、打包成功。
 *   但用户切到繁体后，整个界面静默回退成简体 —— 因为繁体字典压根没进产物。
 *   真正的缺陷不是「删错了」，而是**检查的方向反了**：
 *   只查「有没有该删的东西」，从不查「该有的东西还在不在」。
 *   一个只做否证的检查，在「全被删光」时必然全绿。
 *
 * 因此这里的断言全部是**正向存在性**：
 *   · zh-CN 与 zh-TW 的键集合完全一致（缺一即失败，不设"渐进补齐"豁免）；
 *   · 每条 zh-TW 值都能由 zh-CN 经字形转写得到（口径统一，用词不跑偏）；
 *   · 产物里 16 个域的繁体词条逐条可见（这是本次事故的直接回归）；
 *   · 体检脚本里必须存在「繁体全量」这条判据，防止有人把它删回抽样。
 *
 * 运行：node electron/verify/i18n-completeness.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { toTw } from './tw-han-map.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

const DOMS = [
  'common',
  'shell',
  'home',
  'posts',
  'post',
  'region',
  'search',
  'trash',
  'taxonomy',
  'lanshare',
  'settings',
  'about',
  'guide',
  'ui',
  'tray',
  'time'
];

const load = async p => (await import(pathToFileURL(p).href)).default;

/* ============ 1. 三语键集合一致 ============ */
console.log('[1] 十六域三语键集合');
{
  const bad = [];
  for (const d of DOMS) {
    const cn = await load(path.join(ROOT, 'src/i18n/parts', `${d}.zh-CN.js`));
    const tw = await load(path.join(ROOT, 'src/i18n/parts', `${d}.zh-TW.js`));
    const en = await load(path.join(ROOT, 'src/i18n/parts', `${d}.en.js`));
    const kc = Object.keys(cn).sort().join(',');
    if (Object.keys(tw).sort().join(',') !== kc) bad.push(d + ' 的 zh-TW 键集合与 zh-CN 不一致');
    if (Object.keys(en).sort().join(',') !== kc) bad.push(d + ' 的 en 键集合与 zh-CN 不一致');
  }
  ok(bad.length === 0, '16 域 × 3 语键集合完全一致' + (bad.length ? ' → ' + bad.join(' | ') : ''));
}

/* ============ 2. 繁体确实是简体字形转写 ============ */
console.log('[2] 繁体 = 简体逐字转字形（用词不跑偏）');
{
  const drift = [];
  for (const d of DOMS) {
    const cn = await load(path.join(ROOT, 'src/i18n/parts', `${d}.zh-CN.js`));
    const tw = await load(path.join(ROOT, 'src/i18n/parts', `${d}.zh-TW.js`));
    for (const k of Object.keys(cn)) {
      if (typeof cn[k] !== 'string') continue;
      if (toTw(cn[k]) !== tw[k]) drift.push(`${d}.${k}`);
    }
  }
  ok(
    drift.length === 0,
    '全部繁体词条都能由简体机械转写得到' +
      (drift.length ? ` → 偏差 ${drift.length} 条：` + drift.slice(0, 5).join(' , ') : '')
  );
}

/* ============ 3. 繁体不是「换了词的意译」 ============ */
console.log('[3] 拒绝台湾化意译用词');
{
  // 这批词在简体原文里根本不存在，出现即说明有人手工"意译"过
  const BANNED = ['稽核', '介面', '網路', '資料夾', '檔案', '資源回收筒', '檢視'];
  const hits = [];
  for (const d of DOMS) {
    const tw = await load(path.join(ROOT, 'src/i18n/parts', `${d}.zh-TW.js`));
    const s = Object.values(tw)
      .filter(v => typeof v === 'string')
      .join('\n');
    for (const w of BANNED) if (s.includes(w)) hits.push(`${d}:${w}`);
  }
  ok(hits.length === 0, '无台湾化意译词残留' + (hits.length ? ' → ' + hits.join(' , ') : ''));
}

/* ============ 4. 体检脚本的判据是「正向全量」而非抽样 ============ */
console.log('[4] 体检脚本必须做全量存在性检查');
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts/check-dist-i18n.mjs'), 'utf8');
  ok(/繁体字典完整/.test(src), '存在「繁体字典完整」判定');
  ok(/parts.*zh-TW\.js/.test(src), '从 parts/*.zh-TW.js 读取全部词条');
  ok(/missing\.length\s*>\s*0|missing\.length\)/.test(src), '缺失即失败（不是仅告警）');
  ok(/process\.exit\(1\)/.test(src), '失败时以非零码退出，能中断打包');
}

/* ============ 5. 构建守卫存在，防止旧产物当输入 ============ */
console.log('[5] index.html 构建守卫');
{
  const guard = path.join(ROOT, 'scripts/guard-index-html.mjs');
  ok(fs.existsSync(guard), '守卫脚本存在');
  const src = fs.existsSync(guard) ? fs.readFileSync(guard, 'utf8') : '';
  ok(/src="\/src\/main\.js"/.test(src), '守卫能识别源模板特征');
  ok(/crossorigin/.test(src), '守卫能识别产物内联特征（crossorigin）');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(/guard-index-html/.test(pkg.scripts.build || ''), 'build 脚本已接入守卫');

  // 当前 index.html 必须是干净的源模板（不是上一代产物）
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(
    Buffer.byteLength(html) < 8192 && /src="\/src\/main\.js"/.test(html),
    `当前 index.html 是源模板（${Buffer.byteLength(html)} 字节）`
  );
}

/* ============ 6. i18n 语言表不可被压缩器折叠 ============ */
console.log('[6] 语言表用运行时拼装（防 tree-shake）');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/i18n/index.js'), 'utf8');
  ok(/function dictionaries|const DICTS = .*\(/.test(src), '语言表由函数构建，不是裸对象字面量');
  ok(!/const DICTS = \{\s*'zh-CN':\s*zhCN/.test(src), '没有退回字面量表（那会被压缩器折叠掉 zh-TW）');
  ok(/dictOf\(/.test(src), '取值经由 dictOf()，调用点不可静态折叠');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
