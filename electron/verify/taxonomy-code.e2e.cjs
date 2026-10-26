'use strict';
/**
 * Beta.215：大区 / 分类 / 自定义字段「代码」查重 + 拷贝归属代码不再写死 'LAN'
 *
 * 用户原话：「自定义字段的"字母代码"改为"代码"，且大区、分类、自定义字段的代码要查重，
 *           拷贝文档时的新建大区与分类缺少填写代码，目前无论新建什么，都是默认代码"LAN"」
 *
 * 覆盖：
 *   [1] saveRegion 代码查重（新建撞码 / 编辑自己不算撞 / 编辑改成别人的码要拦）
 *   [2] saveCategory 代码查重（同上三态）
 *   [3] saveFieldDef 代码查重（既有行为不得回归）+ 文案已改「代码」
 *   [4] copy target.mode='new'：用户填的代码被真正采用，不再是 'LAN'
 *   [5] 留空时的推导：名称里有无 ASCII 决定是 HR 还是 LAN
 *   [6] 代码自动加序号：两个都叫「共享拷贝」的拷贝大区不会因重码创建失败
 *   [7] follow 跟随源文档时沿用源代码（share.js 的 rcode/ccode 生效）
 *   [8] 前端契约：CopyTargetDialog 采集并上送 regionCode/categoryCode；无「字母代码」字样
 *
 * ★ 本用例走生产实现（taxonomy + lanshare 通道 + 真实 HTTP 共享源），
 *   不复制一份业务逻辑到测试里 —— 项目已经三次栽在「测的是抄来的逻辑」上。
 *
 * 用法：node electron/verify/taxonomy-code.e2e.cjs [ROOT]
 */
const path = require('path');
const Module = require('module');
const os = require('os');
const fs = require('fs');

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

const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'taxcode-cfg-'));
/*
 * ★ 通道调用签名陷阱（沿用 copy-target.e2e.cjs 的说明，务必保留）★
 * Electron 主进程侧签名是 ipcMain.handle(ch, (event, payload) => …)，
 * 即第一个参数是 event、第二个才是 renderer 的 payload。shared.js 的 handle()
 * 原样透传该签名，所以从 global.__IPC__[ch] 取到的函数必须按 (event, payload) 调。
 * 这里用假 event 包一层，让用例可以 fn(payload)。
 */
const FAKE_EVENT = { sender: { id: 1 }, senderFrame: { url: 'file://verify' } };
const toRendererCall = fn => payload => fn(FAKE_EVENT, payload);

const stubPath = path.join(os.tmpdir(), '_taxcode-stub-' + process.pid + '.js');
fs.writeFileSync(
  stubPath,
  `
const path = require('path')
const CFG = ${JSON.stringify(CFG)}
global.__IPC__ = {}
module.exports = {
  app: { getPath: (k) => path.join(CFG, k), getName: () => '文档盒 Archbox', getVersion: () => 'test',
    isPackaged: false, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {} },
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
const unwrap = w => (w && 'data' in w ? w.data : w);
/** 取出 handle() 结果里的业务错误文案；成功则返回 null */
const errText = w => (w && w.ok === false ? String(w.error || '') : null);

async function main() {
  const db = require(path.join(ROOT, 'electron/db'));
  const core = require(path.join(ROOT, 'electron/db/core'));
  const share = require(path.join(ROOT, 'electron/db/share'));
  const lanShare = require(path.join(ROOT, 'electron/services/lan-share'));
  const taxonomy = require(path.join(ROOT, 'electron/db/taxonomy'));

  const dataDir = path.join(CFG, 'userData', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  await db.init(dataDir);
  db.seed();

  // 生产实现：拿注册好的通道函数
  require(path.join(ROOT, 'electron/ipc/taxonomy.js')).registerTaxonomy();
  const regionSave = toRendererCall(global.__IPC__['region:save']);
  const catSave = toRendererCall(global.__IPC__['cat:save']);
  const fieldSave = toRendererCall(global.__IPC__['field:save']);
  ok(typeof regionSave === 'function', 'region:save 已注册（生产实现）');
  ok(typeof catSave === 'function', 'cat:save 已注册（生产实现）');
  ok(typeof fieldSave === 'function', 'field:save 已注册（生产实现）');

  const regionByCode = c => core.get('SELECT * FROM regions WHERE code=?', [c]);
  const catByCode = c => core.get('SELECT * FROM categories WHERE code=?', [c]);

  /* ---------------- [1] 大区代码查重 ---------------- */
  console.log('\n[1] saveRegion 代码查重');
  const r1 = unwrap(await regionSave({ name: '人事文档区', code: 'HR', color: '#3b6df0' }));
  ok(!!r1, '首个大区（代码 HR）创建成功');
  const dupR = errText(await regionSave({ name: '另一个区', code: 'HR', color: '#3b6df0' }));
  ok(!!dupR && /HR/.test(dupR), '重复代码被拦下，且报错里点明冲突代码：' + JSON.stringify(dupR));
  ok(core.get("SELECT COUNT(*) c FROM regions WHERE code='HR'").c === 1, '库里 HR 仍只有一个大区');
  // 编辑自己：带上自己的 id，不应自撞
  const selfId = core.get("SELECT id FROM regions WHERE code='HR'").id;
  const selfOk = unwrap(await regionSave({ id: selfId, name: '人事文档区（改名）', code: 'HR', color: '#3b6df0' }));
  ok(!!selfOk, '★ 编辑自己（id 相同、代码不变）不算冲突，可正常保存');
  ok(
    core.get('SELECT name FROM regions WHERE id=?', [selfId]).name === '人事文档区（改名）',
    '改名已生效（确为真保存）'
  );
  // 编辑改成别人的代码：应拦
  await regionSave({ name: '财务区', code: 'FIN', color: '#3b6df0' });
  const stealR = errText(await regionSave({ id: selfId, name: '人事文档区', code: 'FIN', color: '#3b6df0' }));
  ok(!!stealR && /FIN/.test(stealR), '★ 把自己的代码改成别人已用代码 → 被拦下：' + JSON.stringify(stealR));
  ok(core.get('SELECT code FROM regions WHERE id=?', [selfId]).code === 'HR', '被拦后原代码未被改动（HR）');

  /* ---------------- [2] 分类代码查重 ---------------- */
  console.log('\n[2] saveCategory 代码查重');
  const hrId = core.get("SELECT id FROM regions WHERE code='HR'").id;
  const c1 = unwrap(await catSave({ regionId: hrId, name: '入职材料', code: 'CJOIN' }));
  ok(!!c1, '首个分类（代码 CJOIN）创建成功');
  // 跨大区也要查重（代码是全库标识，不按大区隔离）
  const finId = core.get("SELECT id FROM regions WHERE code='FIN'").id;
  const dupC = errText(await catSave({ regionId: finId, name: '报销单', code: 'CJOIN' }));
  ok(!!dupC && /CJOIN/.test(dupC), '★ 跨大区重码同样被拦（分类代码全库唯一）：' + JSON.stringify(dupC));
  ok(core.get("SELECT COUNT(*) c FROM categories WHERE code='CJOIN'").c === 1, '库里 CJOIN 仍只有一个分类');
  const catSelfId = core.get("SELECT id FROM categories WHERE code='CJOIN'").id;
  const catSelfOk = unwrap(await catSave({ id: catSelfId, regionId: hrId, name: '入职材料（改）', code: 'CJOIN' }));
  ok(!!catSelfOk, '★ 编辑分类自己（id 相同、代码不变）不算冲突');
  // 先造一个占用 CFIN 的其它分类，再让当前分类去抢这个代码。
  // ★ 顺序很重要 ★：必须先把「别人的码」建出来，抢码动作才真的会撞；
  //   初版把这两步写反了（先抢后建），于是抢码时 CFIN 还没被占用，
  //   保存成功、断言落空 —— 属于用例写错，不是产品缺陷。
  const cfinOk = unwrap(await catSave({ regionId: finId, name: '报销单', code: 'CFIN' }));
  ok(!!cfinOk, '（夹具）另建一个占用 CFIN 的分类');
  const catSteal2 = errText(await catSave({ id: catSelfId, regionId: hrId, name: '入职材料', code: 'CFIN' }));
  ok(!!catSteal2 && /CFIN/.test(catSteal2), '★ 分类改成别人已用代码 → 被拦下：' + JSON.stringify(catSteal2));
  ok(
    core.get('SELECT code FROM categories WHERE id=?', [catSelfId]).code === 'CJOIN',
    '被拦后原分类代码未被改动（CJOIN）'
  );

  /* ---------------- [3] 自定义字段代码查重 ---------------- */
  console.log('\n[3] saveFieldDef 代码查重 + 文案已改「代码」');
  const f1 = unwrap(await fieldSave({ name: '文档编号', code: 'NO', type: 'text' }));
  ok(!!f1, '首个字段（代码 NO）创建成功');
  const dupF = errText(await fieldSave({ name: '文件号', code: 'NO', type: 'text' }));
  ok(!!dupF && /NO/.test(dupF), '字段代码重复被拦：' + JSON.stringify(dupF));
  ok(!/字母/.test(dupF || ''), '★ 报错文案已去掉「字母」二字（与 UI 的「代码」一致）');
  const badF = errText(await fieldSave({ name: '坏字段', code: '1ABC', type: 'text' }));
  ok(!!badF && /代码/.test(badF), '字段代码格式校验仍在（须字母开头的报错含「代码」）：' + JSON.stringify(badF));
  // ★ 「字母」二字在格式规则描述里是必须的 ★
  //   规则本身要求「以字母开头」且只能含字母/数字/下划线，校验对象是"抽象代码"而非"字母代码"这个字段名。
  //   用户要求改的是字段标签（字母代码 → 代码），不是把规则描述里的"字母"抠掉——
  //   真抠掉反而看不懂。这里断言的是「措辞以『代码』起头」，不是「不含『字母』」。
  ok(/^代码须以字母开头/.test(badF), '★ 格式报错以「代码须以字母开头」起头（字段名已改，规则描述保留）');
  const fSelf = unwrap(
    await fieldSave({
      id: core.get("SELECT id FROM field_defs WHERE code='NO'").id,
      name: '文档编号',
      code: 'NO',
      type: 'text'
    })
  );
  ok(!!fSelf, '编辑字段自己不算冲突（既有行为未回归）');

  /* ---------------- [4]-[7] 拷贝归属代码 ---------------- */
  console.log('\n[4] 拷贝 target.mode="new"：用户填的代码被真正采用');
  // 造源文档
  const srcRegionId = core.insert(
    'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ['源大区X', 'SRC', '#8a63d2', 2, core.nowIso(), core.nowIso()]
  );
  const srcCatId = core.insert(
    'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    [srcRegionId, '源分类Y', 'SRCY', 2, core.nowIso(), core.nowIso()]
  );
  const srcPostId = core.insert(
    'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [
      srcRegionId,
      srcCatId,
      '待拷贝的文档',
      '<p>正文</p>',
      '正文',
      'published',
      null,
      core.nowIso(),
      core.nowIso(),
      'SRC-001'
    ]
  );
  await share.initShare(CFG);
  share.rebuild([srcRegionId]);
  const PORT = 47800 + Math.floor(Math.random() * 150);
  lanShare.startShare({ port: PORT, token: 'e2e-token', name: 'E2E源', authEnabled: true, allowCopy: true });
  await new Promise(r => setTimeout(r, 300));
  require(path.join(ROOT, 'electron/ipc/lanshare.js')).registerLanShare();
  const copy = toRendererCall(global.__IPC__['lan:copyPost']);
  ok(typeof copy === 'function', 'lan:copyPost 已注册（生产实现）');

  const src = { name: 'E2E源', ip: '127.0.0.1', port: PORT, token: 'e2e-token' };
  const base = { source: src, remotePostId: srcPostId };

  const cNew = unwrap(
    await copy({
      ...base,
      target: {
        mode: 'new',
        regionName: '共享拷贝',
        regionCode: 'SHARE',
        categoryName: '外部来件',
        categoryCode: 'EXT'
      }
    })
  );
  ok(!!cNew.id, '拷贝成功，新文档 id=' + cNew.id);
  const nr = core.get("SELECT * FROM regions WHERE name='共享拷贝'");
  ok(!!nr, '「共享拷贝」大区已创建');
  ok(nr.code === 'SHARE', '★ 大区代码 = 用户填的 SHARE（不再是 LAN）：' + nr.code);
  ok(nr.code !== 'LAN', '★ 明确不是 LAN');
  const nc = core.get("SELECT * FROM categories WHERE name='外部来件'");
  ok(!!nc, '「外部来件」分类已创建');
  ok(nc.code === 'EXT', '★ 分类代码 = 用户填的 EXT（不再是 LAN）：' + nc.code);

  console.log('\n[5] 代码留空 → 按名称推导（ASCII 优先，否则回退 LAN）');
  const cDer = unwrap(
    await copy({
      ...base,
      target: { mode: 'new', regionName: 'HR文档区', regionCode: '', categoryName: '入职材料C', categoryCode: '' }
    })
  );
  ok(!!cDer.id, '留空代码的拷贝成功');
  const dr = core.get("SELECT * FROM regions WHERE name='HR文档区'");
  // ★ 不硬断言 'HR'：本用例前面已经造过一个 HR 大区（[1] 的「人事文档区」），
  //   deriveCode 推导出 HR 后 uniqueCode 发现撞码，会按设计加序号变成 HR2。
  //   这里要证明的是「推导对了且唯一」，不是「恰好等于 HR」。
  ok(/^HR/.test(dr.code), '★ 名称含 ASCII → 推导出以 HR 为根的代码：' + dr.code);
  ok(dr.code !== 'LAN', '★ 不是 LAN（推导确实生效了）');
  const dc = core.get("SELECT * FROM categories WHERE name='入职材料C'");
  ok(dc.code === 'C', '★ 分类推导取 ASCII 字母 C：' + dc.code);
  // 纯中文名 → 回退 LAN（这是唯一还会出现 LAN 的场合，且是「代码」而非硬编码常量）
  const cZh = unwrap(
    await copy({ ...base, target: { mode: 'new', regionName: '纯中文大区', regionCode: '', categoryName: '' } })
  );
  ok(!!cZh.id, '纯中文名拷贝成功');
  const zh = core.get("SELECT * FROM regions WHERE name='纯中文大区'");
  ok(zh.code === 'LAN', '纯中文名无 ASCII 可推导 → 回退 LAN：' + zh.code);

  console.log('\n[6] 重码自动加序号：同名代码不再导致创建失败');
  const before = core.get("SELECT COUNT(*) c FROM regions WHERE code='LAN'").c;
  const cDup = unwrap(
    await copy({ ...base, target: { mode: 'new', regionName: '纯中文大区2', regionCode: 'LAN', categoryName: '' } })
  );
  ok(!!cDup.id, '★ 指定一个已被占用的代码（LAN）仍能拷贝成功（自动加序号）');
  const d2 = core.get("SELECT * FROM regions WHERE name='纯中文大区2'");
  ok(!!d2 && d2.code !== 'LAN' && /^LAN\d+$/.test(d2.code), '★ 实际落地代码被改为 LAN+序号：' + (d2 && d2.code));
  ok(core.get("SELECT COUNT(*) c FROM regions WHERE code='LAN'").c === before, '原 LAN 大区未被覆盖（数量不变）');
  const codes = core.all('SELECT code FROM regions ORDER BY id').map(r => r.code);
  ok(new Set(codes).size === codes.length, '★ 全库大区代码无重复：' + JSON.stringify(codes));

  console.log('\n[7] follow：沿用源文档的大区/分类代码（share.js 的 rcode/ccode）');
  const shared = share.getPost(srcPostId);
  ok(shared && shared.rcode === 'SRC', '共享源已带出源代码 rcode=SRC：' + (shared && shared.rcode));
  ok(shared && shared.ccode === 'SRCY', '共享源已带出源代码 ccode=SRCY：' + (shared && shared.ccode));
  // 新建一个本机源没有的同名大区场景：改名源文档的大区/分类，使本机需要自动创建。
  // ★ 两处必须分别改各自的表 ★
  //   初版把分类那行也写成了 UPDATE regions（复制粘贴手误），于是分类名压根没改，
  //   拷贝仍然复用了本机已存在的「源分类Y」，断言去查一个不存在的名字自然为 null。
  //   这是用例写错，不是产品缺陷 —— 但正因为它，才证明了「按名复用」这条路径确实在工作。
  core.run('UPDATE regions SET name=? WHERE id=?', ['仅存在于源的大区Z', srcRegionId]);
  core.run('UPDATE categories SET name=? WHERE id=?', ['仅存在于源的分类Z', srcCatId]);
  await share.initShare(CFG);
  share.rebuild([srcRegionId]);
  lanShare.stopShare();
  lanShare.startShare({ port: PORT, token: 'e2e-token', name: 'E2E源', authEnabled: true, allowCopy: true });
  await new Promise(r => setTimeout(r, 300));
  const cFollow = unwrap(await copy({ ...base, target: { mode: 'follow' } }));
  ok(!!cFollow.id, 'follow 拷贝成功');
  const fz = core.get("SELECT * FROM regions WHERE name='仅存在于源的大区Z'");
  ok(!!fz, '本机按名新建了源大区');
  ok(fz.code === 'SRC', '★ 跟随创建的代码沿用源（SRC），而非硬编码 LAN：' + fz.code);
  const fzc = core.get("SELECT * FROM categories WHERE name='仅存在于源的分类Z'");
  // ★ 查分类必须带 region_id ★
  //   「仅存在于源的分类Z」这个名字在本机可能已存在多个（每次 follow 都会为本机已有同名大区
  //   各建一个），只按 name 查会随机拿到别的大区下的那条，断言就飘了。
  //   这里锁定「刚随源新建的那个大区」之下的分类。
  const fzcScoped = fz
    ? core.get("SELECT * FROM categories WHERE name='仅存在于源的分类Z' AND region_id=?", [fz.id])
    : null;
  ok(!!fzcScoped && fzcScoped.code === 'SRCY', '★ 跟随创建的分类代码沿用源（SRCY）：' + (fzcScoped && fzcScoped.code));

  lanShare.stopShare();

  /* ---------------- [8] 前端契约 ---------------- */
  console.log('\n[8] 前端契约（源码 + 产物）');
  const srcDir = path.join(ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const dlg = fs.readFileSync(path.join(ROOT, 'src/components/CopyTargetDialog.vue'), 'utf8');
    ok(/newRegionCode/.test(dlg), 'CopyTargetDialog 有 newRegionCode 状态');
    ok(/newCategoryCode/.test(dlg), 'CopyTargetDialog 有 newCategoryCode 状态');
    ok(/regionCode:\s*newRegionCode\.value/.test(dlg), '★ confirm 上送 regionCode');
    ok(/categoryCode:\s*newCategoryCode\.value/.test(dlg), '★ confirm 上送 categoryCode');
    ok(/v-model\.trim="newRegionCode"/.test(dlg), '模板里有大区代码输入框');

    const taxSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Taxonomy.vue'), 'utf8');
    ok(!/字母代码/.test(taxSrc), '★ Taxonomy.vue 已无「字母代码」字样');
    ok(/<th>代码<\/th>/.test(taxSrc), '★ 自定义字段表头为「代码」');
    const fldSrc = fs.readFileSync(path.join(ROOT, 'src/components/taxonomy/FieldModal.vue'), 'utf8');
    ok(!/字母代码/.test(fldSrc), '★ FieldModal.vue 已无「字母代码」字样');
    ok(/field-label">代码<span/.test(fldSrc), '★ FieldModal 标签为「代码」');

    const taxBack = fs.readFileSync(path.join(ROOT, 'electron/db/taxonomy.js'), 'utf8');
    ok(!/字母代码/.test(taxBack), '★ 后端文案已无「字母代码」');
    ok(/FROM regions WHERE code=\?/.test(taxBack), '★ saveRegion 有查重 SELECT');
    ok(/FROM categories WHERE code=\?/.test(taxBack), '★ saveCategory 有查重 SELECT');
  } else {
    console.log('    · 未发现 src/（指向产物运行），跳过源码断言');
  }

  // 产物断言：最终交付物，也是「改了源码没重新打包」的唯一防线
  const builtPath = path.join(ROOT, 'dist/index.html');
  ok(fs.existsSync(builtPath), '构建产物 dist/index.html 存在');
  if (fs.existsSync(builtPath)) {
    const built = fs.readFileSync(builtPath, 'utf8');
    ok(!built.includes('字母代码'), '★ 产物已无「字母代码」（UI 重命名已打包）');
    ok(built.includes('大区代码'), '产物含「大区代码」输入提示');
    ok(built.includes('分类代码'), '产物含「分类代码」输入提示');
    ok(built.includes('代码留空将按名称自动生成'), '产物含留空自动生成的说明文案');
    // 主进程侧硬编码 'LAN' 只能作为 deriveCode 的兜底出现，不能出现在 INSERT 参数里
    const lanIpc = fs.readFileSync(path.join(ROOT, 'electron/ipc/lanshare.js'), 'utf8');
    ok(!/\[n,\s*'LAN'/.test(lanIpc), "★ lanshare 不再把 'LAN' 直接写进 INSERT 参数");
    ok(/uniqueCode\(/.test(lanIpc), 'lanshare 有 uniqueCode 查重辅助');
    ok(/deriveCode\(/.test(lanIpc), 'lanshare 有 deriveCode 推导辅助');
  }

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  try {
    fs.unlinkSync(stubPath);
  } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('用例异常：', e);
  process.exit(1);
});
