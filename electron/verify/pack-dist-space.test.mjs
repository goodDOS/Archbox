/**
 * 打包产物落位契约（Beta.316 用户重申的硬规矩）。
 *
 * ============================ 守的是什么 ============================
 * 用户规矩原话：
 *   「每次打包都要改版本号做区别」
 *   「以后的打包产物都要复制一份进产物空间」
 *   「下载卡片用相对链接引用同目录 zip，必须与 zip 同处产物空间」
 *
 * 这条规矩此前只靠 `scripts/build-win-unpacked.mjs` 第 5 步「自觉」执行，
 * 一旦有人重构脚本删掉那几行，打包仍会成功、测试仍会全绿，但产物不会进产物空间
 * —— 直到用户点下载发现 404 才暴露（Beta.315 最初就是这么翻车的）。
 * 故这里把「脚本必须做到的三件事」变成断言。
 *
 * ============================ 为什么是静态断言，不真跑打包 ============================
 * 真跑一次打包要几十秒且产出上百 MB，不适合放进 `npm test` 常规回归。
 * 而这条规矩的本质是**构建脚本的接线**，不是产物内容 —— 接线断了用读源码就能发现，
 * 且能在改坏的那一刻立刻报红。产物本身的完整性由 pack-integrity-check.mjs 负责。
 *
 * 运行：node electron/verify/pack-dist-space.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const { ok, section, done } = createHarness();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

section('1. 打包产物必须复制一份到产物空间');

const build = read('scripts/build-win-unpacked.mjs');

ok(
  /const distSpace = path\.resolve\(root, '\.\.'\)/.test(build),
  '★ 产物空间解析为项目根的上一级（/workspace），与历史 Beta 产物同目录'
);
ok(/fs\.copyFileSync\(zipPath, distZip\)/.test(build), '★ 打包完成后把当次 zip 复制一份进产物空间（不依赖手工搬运）');
ok(
  /const distZip = path\.join\(distSpace, zipName\)/.test(build),
  '★ 产物空间里的文件名与 release 中的 zipName 同名（相对链接才点得通）'
);
ok(
  build.indexOf('fs.copyFileSync(zipPath, distZip)') > build.indexOf('zip 校验连续 3 次失败'),
  '★ 复制发生在 zip 完整性校验之后（不把校验未过的坏包搬进产物空间）'
);

section('2. 版本号每次打包递增');

ok(
  /Beta\\?\.|\+ 1|<N\+1>/.test(build) || /patchBase|nextBeta|bumpVersion/i.test(build),
  '★ 打包脚本内建版本号递增逻辑（0.9.0-Beta.N → Beta.N+1）'
);
ok(/package\.json/.test(build), '★ 版本号写回 package.json（产物名 / asar 内 package.json / 界面版本号三者同源）');
/* ★ Beta.322 的真事故：原实现 `pkg.version = next; JSON.stringify(pkg, null, 2)`，
 *   看着无损，实际把整份文件重新序列化。本仓库的 package.json 末尾**没有换行**，
 *   于是 `split('\n')` 的最后一段是 `}` 而不是空串，`pop()` 丢掉的是收尾大括号，
 *   再把 '' push 回去 —— 结果 scripts / devDependencies / build（含 afterPack 反篡改
 *   钩子配置）全部消失，而打包用的是内存对象，构建照样成功，直到下次谁读这个文件才炸。
 *
 *   现在要求：① 必须走「按行替换 version」而不是整体重排；② 必须有解析校验兜底。
 *   这两条任缺一条，同类事故就会以别的写法重演。 */
ok(
  /pkgSrc\.replace\(\s*verLine|replace\(verLine/.test(build),
  '★ 版本号按「version 那一行」原地替换（不整体重排 JSON，字段与排版原样保留）'
);
/* 必须在**剥掉注释**之后再断言，否则解释这条坑的注释本身就能满足/违反正则 —
 * 本仓库早先就吃过这个亏（注释里写了 `top:-20px`，把断言喂饱了而真实声明被删照样绿）。 */
const buildNoComment = build
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(l => !/^\s*\//.test(l))
  .join('\n');
ok(
  !/JSON\.stringify\(\s*pkg\s*,/.test(buildNoComment),
  '★ 不得对整份 pkg 做 JSON.stringify(pkg, null, 2) 写回（末尾无换行会丢掉收尾大括号 → 文件被截断）'
);
ok(
  /JSON\.parse\(pkgOut\)/.test(build) && /已中止/.test(build),
  '★ 写回前先 JSON.parse 自检，不一致就中止（不能等到下次打包才发现文件已坏）'
);
ok(
  /keysOf\(check\)\s*!==\s*keysOf\(pkg\)|serialize.*一致|内容不一致/.test(build),
  '★ 自检比对的是「除 version 外全部字段」而非只看能否解析（少字段也能解析通过）'
);
ok(
  !/Beta\.\d+\s*[；;]/.test(read('scripts/build-win-unpacked.mjs').split('\n').slice(0, 20).join('\n')),
  '★ 脚本头部没有把某个具体 Beta 号写死（版本号必须由运行时推导，不能手改常量）'
);

section('3. 产物空间与 release 中间产物的分工');

ok(
  /release[\\/]/.test(build) || /outDir|releaseDir/.test(build),
  '★ 中间产物仍落在项目内 release/（与产物空间区分开）'
);

section('4. 规矩本身写进了仓库文档');

/* ★ 为什么读 README 而不是读开发者的私人规则文件 ★
 *   规矩如果只写在仓库外的私有目录里，任何人 clone 下来都看不到，测试也守不住 ——
 *   而「产物空间」这条正是靠测试拦住的（Beta.315 出过「卡片在、点下载 404」）。
 *   所以规矩必须写进仓库内的 README.md，测试读它，CI 与本地行为一致。 */
const RULE_PATH = path.join(ROOT, 'README.md');
ok(fs.existsSync(RULE_PATH), '★ README.md 存在（规矩必须写进仓库内文件）');

const rule = fs.existsSync(RULE_PATH) ? fs.readFileSync(RULE_PATH, 'utf8') : '';
ok(/产物空间/.test(rule), '★ README 写明了「产物空间」这条');
ok(
  /复制一份进产物空间|都要复制一份进产物空间/.test(rule),
  '★ 规则原文保留「每次打包复制一份」的措辞（不被弱化成"建议"）'
);
ok(
  /下载卡片/.test(rule) && /同处产物空间|与 zip 同处/.test(rule),
  '★ 规则写明下载卡片必须与 zip 同处产物空间（防「卡片在、点下载 404」复现）'
);

done();
