/**
 * 保存时清除空标签（Beta.325 · #429）单测 —— 静态契约 + 真库全链路。
 *
 * 【用户需求与原话】「保存时清除空标签」。
 *
 * 【根因链（为什么四层都要修）】
 *   现行写入链（resolveTagIds / saveTag）都拦空名，空标签只可能是旧版本存量。
 *   但存量空关联有一个**删不掉的悖论**：
 *     ① getPost 把空名读进 post.tags → 编辑页渲染出一个空 chip；
 *     ② 用户删掉空 chip → form.tags 变 [] → 保存；
 *     ③ 后端 sameSnapshot 用 normTags 归一化，[''] 与 [] **等价** →
 *        判「无实质改动」直接 return unchanged，applyFieldsAndTags 根本不执行；
 *     ④ 空关联永远留在 post_tags 里，下次打开又出现（用户视角的「删不掉」）。
 *   修复后的行为边界（测试第 5 节锁死）：
 *     · 读侧过滤让用户看不到空 chip，「删空 chip」这个动作不再存在；
 *     · 用户原样保存 → unchanged（不弹假改动、不产假版本）；
 *     · 用户动过标签 → 正常写库，空关联顺带被 resolveTagIds 清掉；
 *     · 完全没动过标签的保存不动库 → 存量空关联由「数据清洗 · 空标签」根除。
 *   单修任何一层都堵不死：只修读侧 → 界面干净但库里还在（标签管理/统计仍带出）；
 *   只修保存出口 → 存量 chip 照样显示且删了也没用。故本测试锁四层：
 *     ① 前端入口：载入（enterEdit / useTemplate）与标签云回写（applyTagCloud）过 cleanTags；
 *     ② 前端出口：buildDraft 与 snapshot 同走 cleanTags（脏检查基线与载荷口径一致）；
 *     ③ 后端读侧：getPost / listPosts(tnames) / listTags / regionStats(byTag) / mergedTags
 *        全部按 TRIM(t.name)<>'' 或 normTags 过滤；
 *     ④ 存量清洗：数据清洗新增「空标签」项（taxonomy.emptyTagStats/purgeEmptyTags
 *        + cleanup IPC + CleanupSection 界面 + 14 语 i18n）。
 *
 * 运行：node electron/verify/empty-tags-cleanup.test.mjs
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from './_harness.mjs';

const { ok, section, done } = createHarness();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

/* ============ 1. 前端四层契约（PostView.vue） ============ */
section('1. 前端：cleanTags 单一来源覆盖入口/出口/基线');
{
  const pv = read('src/pages/PostView.vue');
  const def = /function cleanTags\(list\) \{[\s\S]*?\n\}/.exec(pv);
  ok(!!def, 'cleanTags 函数已定义（入口/出口共用的唯一口径）');
  ok(
    def && /\.trim\(\)/.test(def[0]) && /\.filter\(Boolean\)/.test(def[0]),
    'cleanTags 先 trim 再滤空（纯空格标签一并清掉）'
  );
  ok(
    /tags: cleanTags\(JSON\.parse\(JSON\.stringify\(form\.tags \|\| \[\]\)\)\)/.test(pv),
    '★ 出口：buildDraft 的 tags 走 cleanTags（保存时清除空标签）'
  );
  ok(
    /tags: cleanTags\(form\.tags\)/.test(pv),
    '★ 基线：snapshot computed 的 tags 同走 cleanTags（删空 chip 后不会「表单≠基线」与「后端判无改动」打架）'
  );
  ok(
    /form\.tags = cleanTags\(post\.value\.tags\)/.test(pv),
    '★ 入口：enterEdit 载入存量文档过 cleanTags（界面不渲染空 chip）'
  );
  ok(/form\.tags = cleanTags\(tpl\.tags\)/.test(pv), '入口：useTemplate 载入模板过 cleanTags');
  ok(
    /form\.tags = cleanTags\(Array\.from\(list \|\| \[\]\)\)\.slice\(0, MAX_TAGS\)/.test(pv),
    '入口：applyTagCloud 回写过 cleanTags（弹窗勾选也不把空名带回表单）'
  );
  // 负向：buildDraft 不得再出现未过滤的裸 tags 深拷贝（防有人回退）
  ok(!/tags: JSON\.parse\(JSON\.stringify\(form\.tags/.test(pv), '负向：buildDraft 不存在未过滤的裸 tags 深拷贝');
  ok(
    /function addTag\(\)[\s\S]*?if \(!tag\) return;/.test(pv),
    '录入链 addTag 保持 trim + 空值拦截（不重复实现，靠既有防线）'
  );
}

/* ============ 2. 后端读侧契约 ============ */
section('2. 后端读侧：空名在每条读取路径都被过滤');
{
  const posts = read('electron/db/posts.js');
  ok(
    /WHERE pt\.post_id=\? AND TRIM\(t\.name\)<>/.test(posts),
    "★ getPost 的 tags 查询按 TRIM(t.name)<>'' 过滤（悖论链的第①步被拆掉）"
  );
  ok(
    /WHERE pt\.post_id=p\.id AND TRIM\(t\.name\)<>''\) tnames/.test(posts),
    'listPosts 的 tnames 子查询同口径过滤（列表/导出不带空段）'
  );
  ok(
    /const mergedTags = normTags\(\[\.\.\.\(old\.tags \|\| \[\]\), \.\.\.\(draft\.tags \|\| \[\]\)\]\)/.test(posts),
    '合并路径 mergedTags 走 normTags（入参脏数据进不了 applyFieldsAndTags）'
  );
  const tax = read('electron/db/taxonomy.js');
  ok(/FROM tags t WHERE NOT \$\{EMPTY_TAG_BARE\}/.test(tax), 'listTags 过滤空名（标签管理页 / 标签云弹窗不显示空行）');
  ok(
    /function emptyTagStats\(\)/.test(tax) && /function purgeEmptyTags\(\)/.test(tax),
    'taxonomy 暴露 emptyTagStats / purgeEmptyTags（清洗项的单一来源）'
  );
  ok(
    /DELETE FROM post_tags WHERE tag_id IN \(SELECT id FROM tags WHERE \$\{EMPTY_TAG_BARE\}\)/.test(tax),
    'purgeEmptyTags 先断 post_tags 关联再删 tags 行（只删 tags 会留孤儿关联，join 查询看不见但表里脏）'
  );
  ok(/emptyTagStats,\s+purgeEmptyTags/.test(tax), '两个新函数已挂到 taxonomy 的 module.exports');
  const stats = read('electron/db/stats.js');
  ok(/AND TRIM\(t\.name\)<>'' GROUP BY t\.name/.test(stats), 'regionStats 的 byTag 过滤空名（大区标签云不带空统计）');
}

/* ============ 3. 清洗项链路契约（后端 IPC + 前端卡片 + i18n） ============ */
section('3. 清洗项链路：IPC 白名单 / 界面列表 / 14 语文案');
{
  const cl = read('electron/ipc/cleanup.js');
  ok(
    /const ITEMS = \['images', 'emptyTags'\]/.test(cl),
    'cleanup ITEMS 白名单含 emptyTags（新增项必须两处同改的硬契约）'
  );
  ok(
    /item === 'emptyTags'[\s\S]*?removableDocs: s\.linked/.test(cl),
    'cleanup:stats 对 emptyTags 返回 removableDocs（统计口径是牵连文档数，不是字节）'
  );
  ok(
    /item === 'emptyTags'[\s\S]*?db\.purgeEmptyTags\(\)[\s\S]*?db\.persistNow\(\)[\s\S]*?safeAudit/.test(cl),
    'cleanup:run 对 emptyTags：purgeEmptyTags → persistNow → safeAudit（落盘与审计不丢）'
  );
  const cs = read('src/components/settings/CleanupSection.vue');
  ok(/key: 'emptyTags'/.test(cs), 'CleanupSection 的 CLEANUP_ITEMS 含 emptyTags 项（与后端白名单一一对应）');
  ok(
    cs.includes("it.key === 'emptyTags'") && cs.split("it.key === 'emptyTags'").length - 1 >= 3,
    '界面按 emptyTags 分支渲染 found / last / pwdMsg 三组文案（不套图片项的 {size} 模板）'
  );
  // i18n：10 语言 × 5 key 齐全，且三语键集合一致
  const KEYS = [
    'cleanupEmptyTagsTitle',
    'cleanupEmptyTagsDesc',
    'cleanupEmptyTagsFound',
    'cleanupEmptyTagsLast',
    'cleanupEmptyTagsPwdMsg'
  ];
  const LANGS = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'ru', 'fr', 'de', 'is', 'ar'];
  const loadDict = l => {
    const src = read(`src/i18n/parts/settings.${l}.js`);
    return new Function(`return (${src.replace('export default', '').replace(/;\s*$/, '')})`)();
  };
  const missing = [];
  for (const l of LANGS) {
    const d = loadDict(l);
    for (const k of KEYS) if (!(k in d)) missing.push(`${l}.${k}`);
  }
  ok(missing.length === 0, `10 语言 × 5 key 全部存在${missing.length ? ' → 缺 ' + missing.join(',') : ''}`);
  const kc = Object.keys(loadDict('zh-CN')).sort().join(',');
  const twSame = Object.keys(loadDict('zh-TW')).sort().join(',') === kc;
  const enSame = Object.keys(loadDict('en')).sort().join(',') === kc;
  ok(twSame && enSame, 'settings 域三语键集合一致（新 key 三语同步，i18n-completeness 同口径）');
}

/* ============ 4. 真库：写入链本来就干净 ============ */
section('4. 真库：现行写入链不产生空关联');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-tags-'));
const require = (await import('node:module')).createRequire(import.meta.url);
const db = require(path.join(root, 'electron/db.js'));
const core = require(path.join(root, 'electron/db/core.js'));
await db.init(dir);
const user = db.createUser('空标签测试员', 'A-FAKE-MAC-EMPTY01', 'pw123456', [
  { q: 'q1', a: 'a1' },
  { q: 'q2', a: 'a2' },
  { q: 'q3', a: 'a3' }
]);
const uid = user.id;
db.saveRegion({ name: '华东', code: 'HD', color: '#3b6df0' }, uid);
const R = db.listRegions().find(r => r.name === '华东').id;
{
  const p = db.savePost(
    {
      title: '写入链基线',
      regionId: R,
      categoryId: null,
      contentHtml: '<p>x</p>',
      fields: {},
      tags: ['甲', '', '  ', '甲']
    },
    uid
  );
  const full = db.getPost(p.id);
  ok(
    full.tags.length === 1 && full.tags[0] === '甲',
    `savePost 提交 ['甲','','  ','甲'] → 落库仅 ['甲']（resolveTagIds 拦空 + 去重）：${JSON.stringify(full.tags)}`
  );
}

/* ============ 5. 真库：存量脏数据的完整生命周期 ============ */
section('5. 真库：存量空标签 —— 读侧过滤 / 删除悖论 / 清洗根除');
{
  // 造存量脏数据：现行链路写不进去，直接驱底层 core 插（模拟旧版本残留）
  const p = db.savePost(
    { title: '存量脏文档', regionId: R, categoryId: null, contentHtml: '<p>y</p>', fields: {}, tags: ['甲'] },
    uid
  );
  core.run("INSERT INTO tags(name,created_at) VALUES('', '2020-01-01T00:00:00Z')");
  core.run("INSERT INTO tags(name,created_at) VALUES('   ', '2020-01-01T00:00:00Z')");
  const empties = core.all("SELECT id FROM tags WHERE TRIM(name)='' ORDER BY id").map(r => r.id);
  ok(empties.length === 2, `底层直插 2 个空名标签（存量脏数据就位）：${JSON.stringify(empties)}`);
  for (const tid of empties) core.run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [p.id, tid]);
  // 「甲」的关联由 savePost(tags:['甲']) 建立，不重复插（post_tags 主键会撞）
  db.persistNow();

  // 5a 读侧过滤
  const full = db.getPost(p.id);
  ok(
    full.tags.length === 1 && full.tags[0] === '甲',
    `★ 读侧：getPost 不再返回空名（['甲']，空 chip 不再出现）：${JSON.stringify(full.tags)}`
  );
  const row = db.listPosts({ limit: 10 }).find(r => r.id === p.id);
  const segs = (row.tnames || '').split('；');
  ok(
    segs.length === 1 && segs[0] === '甲',
    `读侧：listPosts 的 tnames 无空段（导出/列表不带「；；」）：${JSON.stringify(segs)}`
  );
  ok(
    db.listTags().every(t => t.name.trim() !== ''),
    '读侧：listTags 无空名行（标签管理页 / 标签云弹窗干净）'
  );

  // 5b 保存边界：用户视角（只看到 ['甲']）原样保存 → unchanged，不误伤不产假版本
  const r = db.savePost(
    {
      id: p.id,
      title: '存量脏文档',
      regionId: R,
      categoryId: null,
      contentHtml: '<p>y</p>',
      fields: {},
      tags: ['甲']
    },
    uid
  );
  ok(
    r && r.unchanged === true,
    "★ 用户原样保存（tags:['甲']）→ unchanged：读侧过滤后用户看不到空 chip，不该被弹「有改动」"
  );
  const stillThere = core.all(
    "SELECT COUNT(*) n FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=? AND TRIM(t.name)=''",
    [p.id]
  )[0].n;
  ok(stillThere === 2, `空关联仍在库里（${stillThere} 条）—— 读侧过滤只管「看不见」，根除必须靠清洗项`);
  // 5b-2 反向边界：用户确实动过标签（删甲）→ 必须真的写库，不能误判 unchanged
  const r2 = db.savePost(
    {
      id: p.id,
      title: '存量脏文档',
      regionId: R,
      categoryId: null,
      contentHtml: '<p>y</p>',
      fields: {},
      tags: []
    },
    uid
  );
  ok(r2 && !r2.unchanged, '反向：用户删掉唯一可见标签「甲」→ 正常写库（不误判无改动，甲关联真的被清掉）');
  // 恢复现场：5b-2 的写库把 post_tags 全清（含空关联——「动过标签就顺带清净」的证明），
  // 重插回完整存量态（甲 + 2 空关联），继续清洗项测试
  const jiaId = db.listTags().find(t => t.name === '甲').id;
  for (const tid of empties) core.run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [p.id, tid]);
  core.run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [p.id, jiaId]);
  db.persistNow();

  // 5c 清洗项
  const st = db.emptyTagStats();
  ok(st.empty === 2 && st.linked === 2, `emptyTagStats 如实报数：空标签 ${st.empty} 个、牵连文档关联 ${st.linked} 条`);
  const removed = db.purgeEmptyTags();
  ok(removed === 2, `purgeEmptyTags 删除 ${removed} 个空名标签`);
  // 直查 post_tags（不 JOIN）：M9 变异（只删 tags 不断关联）在这里现形 ——
  // JOIN 口径下孤儿关联天然不可见，但表里残留脏行
  const orphans = core.all(
    `SELECT COUNT(*) n FROM post_tags WHERE tag_id IN (${empties.map(() => '?').join(',')})`,
    empties
  )[0].n;
  ok(orphans === 0, `purge 后 post_tags 无残留关联（直查 ${orphans} 条，不 JOIN 才看得见孤儿）`);
  const after = db.emptyTagStats();
  ok(after.empty === 0 && after.linked === 0, '清洗后空名标签与关联双双归零');
  ok(
    db.listTags().some(t => t.name === '甲') && db.getPost(p.id).tags[0] === '甲',
    '正常标签「甲」及其关联不受影响（清洗只删空名，不误伤）'
  );

  // 5d regionStats 的 byTag 也不带空名
  core.run("INSERT INTO tags(name,created_at) VALUES('', '2020-01-01T00:00:00Z')");
  core.run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [
    p.id,
    core.all("SELECT id FROM tags WHERE TRIM(name)=''")[0].id
  ]);
  const rs = db.regionStats(R);
  ok(
    rs.byTag.every(t => t.name.trim() !== ''),
    `regionStats.byTag 过滤空名（${JSON.stringify(rs.byTag.map(t => t.name))}）`
  );
  db.purgeEmptyTags();
}

db.closeDb();
fs.rmSync(dir, { recursive: true, force: true });
done();
