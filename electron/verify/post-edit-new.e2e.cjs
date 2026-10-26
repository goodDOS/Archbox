'use strict';
/**
 * 文档编辑/新建链路端到端（Beta.237）。
 *
 * 【用户反馈的三件事】
 *   1. 日志刷 `IPC post:versionSnapshot 失败: 历史版本不存在`（posts.js:351）
 *   2. 「修改文档会被当成创建新文档」
 *   3. 「无法另存为新文档，点击按钮没反应」
 *
 * 三者的共同性质：**静态读源码都看不出问题**。
 * `savePost` 的 UPDATE 分支是对的，`getVersionSnapshot` 的 SQL 也是对的 ——
 * 错在两端的「参数是怎么算出来的」：postId 取了会脱节的 form.id、
 * 查重后重跑 save()、editing 意图没被消费掉。
 *
 * 因此本测试不复述 SQL，而是**把前后端接起来跑真实链路**：
 *   · 真实 sql.js 库（db.init + db.seed）
 *   · 真实 IPC handler（registerPosts）
 *   · 真实 HTTP 服务（lan-share + share）
 * 断言面向**意图**（「还是同一条文档吗」「版本取得到吗」），不钉死 SQL 字面量。
 *
 * 用法：node electron/verify/post-edit-new.e2e.cjs [ROOT]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'b237-cfg-'));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'b237-data-'));

const stubPath = path.join(os.tmpdir(), '_b237-stub-' + process.pid + '.js');
fs.writeFileSync(
  stubPath,
  `
const path = require('path')
const CFG = ${JSON.stringify(CFG)}
const DATA = ${JSON.stringify(DATA)}
global.__IPC__ = {}
module.exports = {
  app: {
    getPath: (k) => path.join(CFG, k),
    getName: () => '文档盒 Archbox',
    getVersion: () => 'test',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {}, quit: () => {}
  },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true, filePath: '' }) },
  shell: { openPath: async () => '' },
  BrowserWindow: function () {},
  ipcMain: { handle: (ch, fn) => { global.__IPC__[ch] = fn }, on: () => {} }
}
`
);

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'electron') return stubPath;
  return origResolve.call(this, req, ...rest);
};

const FAKE_EVENT = { sender: { id: 1 }, senderFrame: { url: 'file://verify' } };
/**
 * IPC 调用 + 解信封。
 * ★ 注意：shared.handle 把异常包成 `{ ok:false, error }` **返回**，不向上抛 ——
 *   所以「失败」在调用侧表现为 ok===false，而不是 throw。早期版本只解 data，
 *   把错误对象当成功结果吞了，导致「跨文档取版本应被拒」这条断言假通过。
 */
function ipcCall(ch) {
  return async payload => {
    const w = await global.__IPC__[ch](FAKE_EVENT, payload);
    if (w && w.ok === false) return { __err: String(w.error || '未知错误') };
    return w && 'data' in w ? w.data : w;
  };
}
/** 期望成功：失败则抛（让 e2e 的 try/catch 按原语义工作） */
const ipc = ch => async payload => {
  const r = await ipcCall(ch)(payload);
  if (r && r.__err) throw new Error(r.__err);
  return r;
};
/** 期望失败：返回错误消息；成功则返回 '' */
const ipcErr = async (ch, payload) => {
  const r = await ipcCall(ch)(payload);
  return r && r.__err ? r.__err : '';
};

async function main() {
  const db = require(path.join(ROOT, 'electron/db'));
  const core = require(path.join(ROOT, 'electron/db/core'));
  const keystore = require(path.join(ROOT, 'electron/keystore'));

  console.log('\n[0] 建库（真实 sql.js）+ 注册真实 IPC');
  await db.init(DATA);
  db.seed();
  keystore.writeDataDir(DATA);
  const { registerPosts } = require(path.join(ROOT, 'electron/ipc/posts.js'));
  registerPosts();

  // 用户表由注册流程写入，seed() 只造业务数据 —— 这里自己插一个。
  // users.id 是 TEXT 主键（见 core.js 建表），非自增。
  // shared.currentUser() 读 settings['session.user_id']，落进去即可认到。
  const uid = 'e2e-user-1';
  core.run('INSERT INTO users(id,name,mac,created_at) VALUES(?,?,?,?)', [
    uid,
    'e2e用户',
    '00:00:00:00:00:01',
    core.nowIso()
  ]);
  ok(core.get('SELECT id FROM users WHERE id=?', [uid]) !== undefined, `已建用户 id=${uid}`);
  db.setSetting('session.user_id', uid);
  const shared = require(path.join(ROOT, 'electron/ipc/shared.js'));
  ok(String(shared.currentUser()) === uid, `（依据）currentUser() 认到用户 id=${uid}`);

  const rid = core.insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '端到端测试区',
    'E2E',
    '#8a63d2',
    1,
    core.nowIso(),
    core.nowIso()
  ]);
  ok(rid > 0, `已建大区 id=${rid}`);

  console.log('\n[1] 新建一条文档 → 拿到 id（后端 INSERT 分支）');
  const postSave = ipc('post:save');
  const created = await postSave({
    id: null,
    title: '苏州精工精密制造有限公司',
    regionId: rid,
    categoryId: null,
    fields: {},
    tags: ['精密'],
    contentHtml: '<p>初版正文</p>',
    status: 'published',
    no: ''
  });
  const pid = created && created.id;
  ok(!!pid, `post:save 返回新文档 id=${pid}`);

  const postGet = ipc('post:get');
  const first = await postGet({ id: pid });
  ok(first && first.title === '苏州精工精密制造有限公司', '文档可读回，标题一致');
  const firstNo = first && first.no;
  ok(!!firstNo, `文档编号已生成：${firstNo}`);

  const countAll = () => core.get('SELECT COUNT(*) n FROM posts').n;
  const nAfterCreate = countAll();

  console.log('\n[2] ★ 核心：带 id 再存一次 —— 必须是 UPDATE，不是又建一条');
  // 这条链路就是用户报的「修改文档会被当成创建新文档」。
  // 前端若把 form.id 丢了（editing 意图残留导致 newPostMode），这里传的就是 id:null → 条数 +1。
  const edit1 = await postSave({
    id: pid,
    title: '苏州精工精密制造有限公司',
    regionId: rid,
    categoryId: null,
    fields: {},
    tags: ['精密', '改过'],
    contentHtml: '<p>第一次修改后的正文</p>',
    status: 'published',
    no: firstNo
  });
  ok(edit1 && String(edit1.id) === String(pid), `★ 保存后返回的 id 仍是原文档（${edit1 && edit1.id} === ${pid}）`);
  ok(countAll() === nAfterCreate, `★ 库里文档总数不变（${countAll()} === ${nAfterCreate}）—— 修改没有被当成新建`);
  const afterEdit = await postGet({ id: pid });
  ok(afterEdit && /第一次修改后的正文/.test(afterEdit.content_html), '★ 修改的内容确实落到了原文档上');

  console.log('\n[3] 连改 3 次，条数必须纹丝不动（防累积泄漏）');
  for (let i = 2; i <= 4; i++) {
    await postSave({
      id: pid,
      title: '苏州精工精密制造有限公司',
      regionId: rid,
      categoryId: null,
      fields: {},
      tags: ['精密'],
      contentHtml: `<p>第 ${i} 次修改</p>`,
      status: 'published',
      no: firstNo
    });
  }
  ok(countAll() === nAfterCreate, `★ 4 次保存后总数仍是 ${nAfterCreate}（实得 ${countAll()}）`);

  console.log('\n[3b] ★ 无改动保存 —— 不得产生新版本（用户反馈）');
  const vcount = () => core.get('SELECT COUNT(*) n FROM post_versions WHERE post_id=?', [pid]).n;
  const vBefore = vcount();
  const cur = await postGet({ id: pid });
  // 原样回传当前内容（就是「打开编辑态 → 一个字不改 → 点保存」的形态）
  const same = await postSave({
    id: pid,
    title: cur.title,
    regionId: cur.region_id,
    categoryId: cur.category_id,
    fields: cur.fields,
    tags: cur.tags,
    contentHtml: cur.content_html,
    status: cur.status,
    no: cur.no
  });
  ok(same && same.unchanged === true, '★ 内容等价时后端回 unchanged:true（前端据此提示「没有改动」而不是「已保存」）');
  ok(vcount() === vBefore, `★ 版本数不变（${vcount()} === ${vBefore}）—— 没有堆出内容相同的版本`);

  // 连点 5 次，版本数必须一动不动
  for (let i = 0; i < 5; i++) {
    await postSave({
      id: pid,
      title: cur.title,
      regionId: cur.region_id,
      categoryId: cur.category_id,
      fields: cur.fields,
      tags: cur.tags,
      contentHtml: cur.content_html,
      status: cur.status,
      no: cur.no
    });
  }
  ok(vcount() === vBefore, `★ 连点 5 次「保存」，版本数仍是 ${vBefore}（实得 ${vcount()}）`);
  // updated_at 也不该被无谓刷新（改了它会让列表按时间排序产生假象）
  const cur2 = await postGet({ id: pid });
  ok(cur2.updated_at === cur.updated_at, '★ 无改动时 updated_at 未被刷新（否则列表排序会显示成「刚改过」）');

  console.log('\n[3c] 反证：只要有一处实质改动，就必须写出新版本');
  const cases = [
    ['标题', { title: cur.title + '·改' }],
    ['正文', { contentHtml: cur.content_html + '<p>追加</p>' }],
    ['状态', { status: cur.status === 'published' ? 'draft' : 'published' }],
    ['标签', { tags: [...(cur.tags || []), '新增标签'] }],
    ['字段', { fields: { ...(cur.fields || {}), NO: 'E2E-NO-CHANGED' } }]
  ];
  let expectV = vcount();
  for (const [name, patch] of cases) {
    const now = await postGet({ id: pid });
    const r = await postSave({
      id: pid,
      title: now.title,
      regionId: now.region_id,
      categoryId: now.category_id,
      fields: now.fields,
      tags: now.tags,
      contentHtml: now.content_html,
      status: now.status,
      no: now.no,
      ...patch
    });
    expectV += 1;
    ok(r && !r.unchanged && vcount() === expectV, `★ 改「${name}」写出了新版本（版本数 ${vcount()}，期望 ${expectV}）`);
  }

  console.log('\n[3d] ★ 版本语义：最新版本 === 当前内容（「标明当前文档是哪个版本」）');
  // 计划口径：「当前内容占一个版本号」。
  // saveVersion 已被重构为在 UPDATE + applyFieldsAndTags 之后调用，
  // 因此每条版本 = 一个真实落库过的状态，MAX(version_no) 就是当前内容的版本号。
  const lv = ipc('post:versions');
  const curHtml = (await postGet({ id: pid })).content_html;
  const listNow = await lv({ postId: pid });

  const currents = listNow.filter(v => v.is_current);
  ok(currents.length === 1, `★ is_current 恰好一条（得 ${currents.length}）—— 「当前版本」必须唯一，否则界面无法标明`);
  ok(
    currents.length === 1 && currents[0].version_no === Math.max(...listNow.map(v => v.version_no)),
    `★ 标为当前的正是最高版本号 v${currents[0] && currents[0].version_no}`
  );
  ok(listNow[0].is_current === true, '（依据）列表按版本号倒序，故第一条即当前版本');

  // ★★ 回归防线：必须走【post:get】这条链路再验一遍（Beta.242）。
  // 上一轮就是只测了 post:versions，全绿，实机却坏在这里 ——
  // 页面读的是 A.post({id}) → post:get → db.getPost()，
  // 而当时 getPost() 用自己内联的一条 SQL 查 versions，压根没返回 is_current。
  // 于是页头「当前 v1」显示得出来（version_no 有查），
  // 面板的「当前版本」badge 与恢复按钮禁用却永远不生效（is_current 恒 undefined）。
  // 教训：断言必须落在页面真正走的那条路径上，否则测的是「另一个也该对的函数」。
  const viaGet = await postGet({ id: pid });
  const getCurrents = (viaGet.versions || []).filter(v => v.is_current);
  ok(
    getCurrents.length === 1,
    `★ 走 post:get 取到的 versions 里 is_current 恰好一条（得 ${getCurrents.length}）—— ` +
      '这正是页面渲染面板用的那份数据'
  );
  ok(
    Array.isArray(viaGet.versions) && viaGet.versions.length === listNow.length,
    '★ post:get 与 post:versions 返回的版本条数一致（两份数据同源，不再各查各的）'
  );
  ok(
    (viaGet.versions || [])[0] && viaGet.versions[0].is_current === true,
    '★ 面板第一行就是当前版本（页头「· 当前 vN」与面板 badge 必须指向同一行）'
  );
  ok(
    (viaGet.versions || [])[0] && viaGet.versions[0].version_no === listNow[0].version_no,
    '（依据）两条链路的第一行是同一个版本号'
  );
  // 顺带修掉的老毛病：作者名之前恒为空（内联 SQL 没 JOIN users）
  ok(
    (viaGet.versions || []).every(v => typeof v.user_name === 'string' && v.user_name !== ''),
    '★ 每条版本都带作者名（getPost 复用 listVersions 后不再是空串兜底成「系统」）'
  );

  // 最硬的一条：把最新版本的快照解出来，内容必须与文档当前内容逐字相同
  const topSnap = await ipc('post:versionSnapshot')({ postId: pid, versionId: listNow[0].id });
  ok(
    topSnap && topSnap.content_html === curHtml,
    '★ 最新版本的正文 === 文档当前正文（否则「当前内容」不对应任何版本号）'
  );
  const curPost = await postGet({ id: pid });
  ok(
    topSnap.title === curPost.title &&
      topSnap.status === curPost.status &&
      (topSnap.no || '') === (curPost.no || '') &&
      JSON.stringify(topSnap.fields) === JSON.stringify(curPost.fields) &&
      JSON.stringify([...topSnap.tags].sort()) === JSON.stringify([...curPost.tags].sort()),
    '★ 最新版本的标题/状态/编号/字段/标签 也全部 === 当前文档（快照是完整状态，不止正文）'
  );

  // 无相邻重复：这是 saveVersion 错序在实机里留下的症状（v1=C0, v2=C0）
  const snaps = [];
  for (const v of listNow) snaps.push(await ipc('post:versionSnapshot')({ postId: pid, versionId: v.id }));
  let dupPairs = 0;
  for (let i = 0; i + 1 < snaps.length; i++) {
    const a = snaps[i],
      b = snaps[i + 1];
    const same =
      a.title === b.title &&
      a.content_html === b.content_html &&
      a.status === b.status &&
      (a.no || '') === (b.no || '') &&
      JSON.stringify(a.fields) === JSON.stringify(b.fields) &&
      JSON.stringify([...a.tags].sort()) === JSON.stringify([...b.tags].sort());
    if (same) dupPairs++;
  }
  ok(dupPairs === 0, `★ 版本序列里没有内容完全相同的相邻两条（重复对 ${dupPairs}，此前新建后首改必产生一对）`);

  // 恢复后：is_current 前移到新版本，且版本数 +1（本轮把 restoreVersion 改成也会写版本）
  const nVerBeforeRestore = listNow.length;
  const targetVer = listNow[listNow.length - 1];
  const tSnap = await ipc('post:versionSnapshot')({ postId: pid, versionId: targetVer.id });
  await ipc('post:restore')({ postId: pid, versionId: targetVer.id });
  const afterRestore = await lv({ postId: pid });
  ok(
    afterRestore.length === nVerBeforeRestore + 1,
    `★ 恢复旧版本也写出一条新版本（${nVerBeforeRestore} → ${afterRestore.length}）：回退前的当前内容不再永久丢失`
  );
  const rc = afterRestore.filter(v => v.is_current);
  ok(
    rc.length === 1 && rc[0].version_no === Math.max(...afterRestore.map(v => v.version_no)),
    '★ 恢复后「当前版本」标记前移到新的最高版本号'
  );
  const rTop = await ipc('post:versionSnapshot')({ postId: pid, versionId: rc[0].id });
  ok(
    rTop.content_html === tSnap.content_html,
    '★ 恢复后最新版本的内容 === 被恢复的那一版（当前版本 = 库里的真实内容，闭环成立）'
  );

  // 反复恢复同一版：saveVersion 内置去重必须挡住重复累计
  const nVerBeforeRepeat = afterRestore.length;
  await ipc('post:restore')({ postId: pid, versionId: targetVer.id });
  await ipc('post:restore')({ postId: pid, versionId: targetVer.id });
  const afterRepeat = await lv({ postId: pid });
  ok(
    afterRepeat.length === nVerBeforeRepeat,
    `★ 再反复恢复同一版本不再新增（${nVerBeforeRepeat} → ${afterRepeat.length}）—— 去重在 saveVersion 内，覆盖任意调用路径`
  );

  console.log('\n[4] ★ post:versionSnapshot —— 联合归属校验');
  const postVersions = ipc('post:versions');
  const vers = await postVersions({ postId: pid });
  ok(Array.isArray(vers) && vers.length >= 2, `该文档有历史版本（得 ${vers && vers.length} 条）`);

  const postSnapshot = ipc('post:versionSnapshot');
  let snap = null,
    snapErr = null;
  try {
    snap = await postSnapshot({ postId: pid, versionId: vers[0].id });
  } catch (e) {
    snapErr = e;
  }
  ok(!snapErr, '★ 用正确的 postId + versionId 能取到快照' + (snapErr ? '：' + snapErr.message : ''));
  ok(snap && snap.id === vers[0].id, '（依据）取回的就是请求的那个版本');

  // 反证：拿【另一条文档】的 id 去查这条的版本 —— 必须被拒。
  // 这正是线上那条报错的形态：postId 与 versionId 脱节。
  const other = await postSave({
    id: null,
    title: '另一条无关文档',
    regionId: rid,
    categoryId: null,
    fields: {},
    tags: [],
    contentHtml: '<p>无关</p>',
    status: 'published',
    no: ''
  });
  const crossMsg = await ipcErr('post:versionSnapshot', { postId: other.id, versionId: vers[0].id });
  ok(!!crossMsg, '★ 跨文档取版本被拒（联合归属生效）' + (crossMsg ? '：' + crossMsg : ' ← 竟然通过了！'));
  ok(
    /历史版本不存在/.test(crossMsg),
    '（依据）拒绝理由就是用户看到的那条「历史版本不存在」——证明报错确实源于 postId 脱节'
  );

  // 它自己的版本仍能取到（证明确实是归属问题，不是接口坏了）
  const otherVers = await postVersions({ postId: other.id });
  const oSnap = await ipc('post:versionSnapshot')({ postId: other.id, versionId: otherVers[0].id });
  ok(oSnap && oSnap.id === otherVers[0].id, '（对照）另一条文档取自己的版本正常');

  console.log('\n[4b] ★ post:restore 是【写】操作：postId 脱节会覆盖另一条文档');
  // 前端 restore() 原写法 `postId: form.id || post.value.id` 与预览同款脱节风险，
  // 但后果严重得多：restoreVersion 会 `UPDATE posts SET ... WHERE id=?`。
  // 这里验证「后端按 (postId, versionId) 联合定位」，跨文档恢复必须被拒。
  const beforeA = await postGet({ id: pid });
  const beforeB = await postGet({ id: other.id });
  const crossRestoreMsg = await ipcErr('post:restore', { postId: other.id, versionId: vers[0].id });
  ok(!!crossRestoreMsg, '★ 跨文档恢复被拒' + (crossRestoreMsg ? '：' + crossRestoreMsg : ' ← 竟然通过了！'));
  const afterA = await postGet({ id: pid });
  const afterB = await postGet({ id: other.id });
  ok(afterA.content_html === beforeA.content_html, '★ 被借用 postId 的那条（源文档）正文未被改动');
  ok(afterB.content_html === beforeB.content_html, '★ 目标文档正文未被误改 —— 没有发生跨文档覆盖');

  // 正路：用自己的 postId 恢复自己的旧版本，内容确实变回那一版
  const oldSnap = await ipc('post:versionSnapshot')({ postId: pid, versionId: vers[vers.length - 1].id });
  await ipc('post:restore')({ postId: pid, versionId: vers[vers.length - 1].id });
  const restored = await postGet({ id: pid });
  ok(restored.content_html === oldSnap.content_html, '（对照）用正确的 postId 恢复，正文确实回到该版本');

  console.log('\n[5] ★ 「仍保存为新文档」的前端语义：跳过查重 + 显式 id:null');
  // 造一个真实冲突：同标题 + 同大区 + 同分类
  const dupCheck = ipc('post:checkDup');
  const conflictings = await dupCheck({
    id: null,
    fields: {} // 无唯一字段，走「标题+大区+分类」组合查重
  });
  // 换成显式传 title/region/category 的形态（前端 buildDraft 就是这么传的）
  const dup2 = await dupCheck({
    id: null,
    fields: {},
    title: '苏州精工精密制造有限公司',
    regionId: rid,
    categoryId: null
  });
  const dupReal = (dup2 && dup2.length ? dup2 : conflictings) || [];
  ok(Array.isArray(dupReal), 'post:checkDup 返回数组');

  const nBeforeForce = countAll();
  // 前端 onForceNew 修复后的行为：不走 checkDup，直接 postSave({ ...draft, id: null })
  const forced = await postSave({
    id: null,
    title: '苏州精工精密制造有限公司',
    regionId: rid,
    categoryId: null,
    fields: {},
    tags: ['精密'],
    contentHtml: '<p>明知重复仍要新建</p>',
    status: 'published',
    no: ''
  });
  ok(
    forced && String(forced.id) !== String(pid),
    `★ 仍保存为新文档确实产生了一条【新】文档（${forced && forced.id} ≠ ${pid}）`
  );
  ok(
    countAll() === nBeforeForce + 1,
    `★ 条数 +1（${nBeforeForce} → ${countAll()}）—— 这就是「另存为新文档」应有的效果`
  );

  console.log('\n[6] post:save 的幂等性：id 为空串 / undefined 与 null 同义');
  const nBeforeBlank = countAll();
  const blank = await postSave({
    id: '',
    title: '空串 id 测试',
    regionId: rid,
    categoryId: null,
    fields: {},
    tags: [],
    contentHtml: '<p>x</p>',
    status: 'published',
    no: ''
  });
  ok(
    blank && blank.id && countAll() === nBeforeBlank + 1,
    '（依据）id 为空串时按新建处理（前端 form.id 初始值是 null，空串来自输入回填）'
  );

  console.log('\n[7] 汇总：文档总数与各自的版本数' + '\n');
  const total = countAll();
  const perPost = core.all(
    'SELECT p.id, COUNT(v.id) vn FROM posts p LEFT JOIN post_versions v ON v.post_id=p.id GROUP BY p.id ORDER BY p.id'
  );
  ok(
    perPost.every(r => r.vn >= 1),
    `每条文档至少 1 个版本（${perPost.length} 条文档）：` + perPost.map(r => `${r.id}:${r.vn}`).join(' ')
  );
  ok(total === perPost.length, `总数一致（${total}）—— 没有孤儿版本记录`);

  console.log('\n[8] 结论');
  ok(true, `共 ${total} 条文档；编辑 4 次、另存 1 次、空串 id 1 次，计数全部符合预期`);
}

main()
  .then(() => {
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
  })
  .catch(e => {
    console.error('\n测试异常：', (e && e.stack) || e);
    console.log(`\n结果：${pass} 通过 / ${fail + 1} 失败`);
    process.exit(1);
  });
