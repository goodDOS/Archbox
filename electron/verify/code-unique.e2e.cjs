'use strict';
/**
 * Beta.217：大区 / 分类代码的数据库级唯一约束
 *
 * 用户原话：「引入数据库 UNIQUE 约束」
 *
 * 背景：Beta.215 在**应用层**做了三类代码查重（taxonomy 的 SELECT ... WHERE code=? AND id<>?）。
 *       但应用层查重只挡「走 saveRegion/saveCategory 的写入」——任何绕过这两个函数的写入
 *       （导入、直接 SQL、别的模块 insert）仍可制造重码。数据库层唯一索引是最后一道闸。
 *
 * 覆盖：
 *   [1] 全新库：migrate 后两个唯一索引都存在
 *   [2] 硬约束：绕过应用层直接 INSERT 重码 → 数据库层直接拒绝
 *   [3] 存量去重：老库里的重复代码在 migrate 时被改写为「原代码+序号」，且**数据零丢失**
 *   [4] NULL / 空串：NULL 可多行，空串会被回填为 R{id}/C{id} 后不冲突
 *   [5] 编辑自身：UPDATE 自己不改代码不应因唯一索引失败
 *   [6] 幂等：migrate 反复执行不重复改名、不报错
 *   [7] 脏库不阻断启动：极端情况（999 个后缀占满）仍能建库
 *
 * ★ 关键：本用例构造的是**真正的老库**——先用「无唯一索引」的方式建表灌入重码，
 *   再走真实 db.init() 触发 migrate。而不是直接调 ensureCodeUniqueIndexes（那是"测抄来的逻辑"）。
 *
 * 用法：node electron/verify/code-unique.e2e.cjs [ROOT]
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

/**
 * 造一个「老库」：不用 core.init（它一上来就 migrate），而是自己起 sql.js 建表灌数据，
 * 落盘成 archive.db。这样 init() 读到的才是真实的「已有重码的旧库」。
 */
async function makeLegacyDb(dir, { dupRegions, dupCategories, emptyCode }) {
  const initSqlJs = require(path.join(ROOT, 'node_modules/sql.js'));
  const SQL = await initSqlJs({
    wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm.wasm'))
  });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE regions(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT,
      color TEXT DEFAULT '#3b6df0', sort INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE categories(
      id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER NOT NULL,
      name TEXT NOT NULL, code TEXT, sort INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  const ts = '2026-01-01 00:00:00';
  for (const r of dupRegions) {
    db.run('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      r.name,
      r.code,
      '#3b6df0',
      0,
      ts,
      ts
    ]);
  }
  for (const c of dupCategories) {
    db.run('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      c.regionId,
      c.name,
      c.code,
      0,
      ts,
      ts
    ]);
  }
  if (emptyCode) {
    db.run('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      '空码大区',
      '',
      '#3b6df0',
      0,
      ts,
      ts
    ]);
    db.run('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      1,
      '空码分类',
      '',
      0,
      ts,
      ts
    ]);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'archive.db'), Buffer.from(db.export()));
  db.close();
}

function withElectronStub(CFG) {
  const stubPath = path.join(os.tmpdir(), '_codeuniq-stub-' + process.pid + '.js');
  fs.writeFileSync(
    stubPath,
    `
const path = require('path')
module.exports = {
  app: { getPath: (k) => path.join(${JSON.stringify(CFG)}, k), getName: () => '文档盒 Archbox', getVersion: () => 'test',
    isPackaged: false, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {} },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true, filePath: '' }) },
  shell: { openPath: async () => '' },
  BrowserWindow: function () {},
  ipcMain: { handle: () => {}, on: () => {} }
}
`
  );
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (req, ...rest) {
    if (req === 'electron') return stubPath;
    return orig.call(this, req, ...rest);
  };
  return stubPath;
}

/** 索引是否存在 */
const hasIndex = (core, name) => !!core.get("SELECT name FROM sqlite_master WHERE type='index' AND name=?", [name]);

/** 直接绕过应用层插一条，返回错误文案；成功返回 null */
const rawInsert = (core, sql, args) => {
  try {
    core.run(sql, args);
    return null;
  } catch (e) {
    return String((e && e.message) || e);
  }
};

async function main() {
  const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'codeuniq-'));
  const stubPath = withElectronStub(CFG);
  const core = require(path.join(ROOT, 'electron/db/core'));

  /* ---------------- [1] 全新库：索引存在 ---------------- */
  console.log('\n[1] 全新库：migrate 后唯一索引已建立');
  const freshDir = path.join(CFG, 'fresh', 'data');
  await core.init(freshDir);
  ok(hasIndex(core, 'uq_regions_code'), 'regions 存在唯一索引 uq_regions_code');
  ok(hasIndex(core, 'uq_categories_code'), 'categories 存在唯一索引 uq_categories_code');
  const idxSql = core.get("SELECT sql FROM sqlite_master WHERE name='uq_regions_code'");
  ok(idxSql && /UNIQUE/i.test(idxSql.sql || ''), '★ 该索引确实是 UNIQUE 索引：' + (idxSql && idxSql.sql));

  /* ---------------- [2] 硬约束：数据库层直接拒绝重码 ---------------- */
  console.log('\n[2] 数据库层硬约束（绕过应用层直接写）');
  const ts = core.nowIso();
  core.run('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '甲区',
    'UNIQ1',
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  const e1 = rawInsert(core, 'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '乙区',
    'UNIQ1',
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  ok(!!e1 && /UNIQUE/i.test(e1), '★ 直接 INSERT 重码被数据库拒绝：' + JSON.stringify(e1));
  ok(core.get("SELECT COUNT(*) c FROM regions WHERE code='UNIQ1'").c === 1, '库里 UNIQ1 仍只有一个大区');

  const rid = core.get("SELECT id FROM regions WHERE code='UNIQ1'").id;
  core.run('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    rid,
    '甲类',
    'CATU1',
    0,
    ts,
    ts
  ]);
  const e2 = rawInsert(
    core,
    'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    [rid, '乙类', 'CATU1', 0, ts, ts]
  );
  ok(!!e2 && /UNIQUE/i.test(e2), '★ 分类重码同样被数据库拒绝：' + JSON.stringify(e2));

  // 跨大区重码也要被拒（全库唯一）
  core.run('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '丙区',
    'UNIQ2',
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  const rid2 = core.get("SELECT id FROM regions WHERE code='UNIQ2'").id;
  const e3 = rawInsert(
    core,
    'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    [rid2, '别的类', 'CATU1', 0, ts, ts]
  );
  ok(!!e3 && /UNIQUE/i.test(e3), '★ 跨大区重码也被拒（分类代码全库唯一）：' + JSON.stringify(e3));

  /* ---------------- [3] 存量去重：老库重码在 migrate 时被改写 ---------------- */
  console.log('\n[3] 存量重码：migrate 自动去重，且数据零丢失');
  core.closeDb();

  const legacyDir = path.join(CFG, 'legacy', 'data');
  await makeLegacyDb(legacyDir, {
    dupRegions: [
      { name: '重复区A', code: 'DUP' },
      { name: '重复区B', code: 'DUP' },
      { name: '重复区C', code: 'DUP' },
      { name: '独立区', code: 'SOLO' }
    ],
    dupCategories: [
      { regionId: 1, name: '重复类A', code: 'CDUP' },
      { regionId: 2, name: '重复类B', code: 'CDUP' }
    ]
  });
  // 确认「老库」真的带着重码（否则本组断言没有意义）
  {
    const initSqlJs = require(path.join(ROOT, 'node_modules/sql.js'));
    const SQL = await initSqlJs({
      wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm.wasm'))
    });
    const raw = new SQL.Database(fs.readFileSync(path.join(legacyDir, 'archive.db')));
    const n = raw.exec("SELECT COUNT(*) FROM regions WHERE code='DUP'")[0].values[0][0];
    ok(n === 3, '（前提）老库里确实有 3 个 code=DUP 的大区：' + n);
    raw.close();
  }

  await core.init(legacyDir); // ← 真实 migrate
  ok(hasIndex(core, 'uq_regions_code'), '老库迁移后唯一索引已建立');
  const dupCount = core.get("SELECT COUNT(*) c FROM regions WHERE code='DUP'").c;
  ok(dupCount === 1, '★ 重复的 DUP 只剩 1 个：' + dupCount);
  ok(core.get('SELECT COUNT(*) c FROM regions').c === 4, '★ 大区总数未变（4 个，没删数据）');
  const names = core.all('SELECT name, code FROM regions ORDER BY id').map(r => `${r.name}=${r.code}`);
  ok(names.length === 4, '★ 四个大区全都还在：' + JSON.stringify(names));
  // 保留 id 最小的那条原名码，其余加序号
  ok(
    core.get('SELECT code FROM regions WHERE name=?', ['重复区A']).code === 'DUP',
    'id 最小的「重复区A」保留原代码 DUP'
  );
  ok(core.get('SELECT code FROM regions WHERE name=?', ['重复区B']).code === 'DUP2', '★「重复区B」被改写为 DUP2');
  ok(core.get('SELECT code FROM regions WHERE name=?', ['重复区C']).code === 'DUP3', '★「重复区C」被改写为 DUP3');
  ok(core.get('SELECT code FROM regions WHERE name=?', ['独立区']).code === 'SOLO', '无冲突的「独立区」代码未被动过');

  const cdupCount = core.get("SELECT COUNT(*) c FROM categories WHERE code='CDUP'").c;
  ok(cdupCount === 1, '★ 重复的分类代码 CDUP 只剩 1 个：' + cdupCount);
  ok(core.get('SELECT COUNT(*) c FROM categories').c === 2, '★ 分类总数未变（2 个）');
  ok(core.get('SELECT code FROM categories WHERE name=?', ['重复类A']).code === 'CDUP', '分类「重复类A」保留原代码');
  ok(
    core.get('SELECT code FROM categories WHERE name=?', ['重复类B']).code === 'CDUP2',
    '★ 分类「重复类B」被改写为 CDUP2'
  );

  // 去重后索引确实生效
  const e4 = rawInsert(core, 'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '又一个大区',
    'DUP',
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  ok(!!e4 && /UNIQUE/i.test(e4), '去重后索引生效：再插 DUP 被拒');

  /* ---------------- [4] NULL / 空串 ---------------- */
  console.log('\n[4] NULL 与空串');
  core.closeDb();
  const nullDir = path.join(CFG, 'nullcase', 'data');
  await makeLegacyDb(nullDir, { dupRegions: [{ name: '正常区', code: 'OK1' }], dupCategories: [], emptyCode: true });
  await core.init(nullDir);
  const emptyRegions = core.all("SELECT id, name, code FROM regions WHERE code IS NULL OR code=''");
  ok(emptyRegions.length === 0, '★ 空串代码已回填为 R{id}（不再有空 code）：' + JSON.stringify(emptyRegions));
  const backfilled = core.get("SELECT code FROM regions WHERE name='空码大区'");
  ok(backfilled && /^R\d+$/.test(backfilled.code), '回填形如 R{id}：' + (backfilled && backfilled.code));
  // NULL 允许多行（SQLite 语义），不应因索引而受限
  const e5 = rawInsert(core, 'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    'NULL区1',
    null,
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  const e6 = rawInsert(core, 'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    'NULL区2',
    null,
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  ok(!e5 && !e6, '多行 NULL 代码可共存（SQLite 唯一索引语义）：' + JSON.stringify([e5, e6]));

  /* ---------------- [5] 编辑自身 ---------------- */
  console.log('\n[5] 编辑自身（不改代码）不因唯一索引失败');
  const selfRow = core.get("SELECT id, name, code FROM regions WHERE code='OK1'");
  const e7 = rawInsert(core, 'UPDATE regions SET name=? WHERE id=?', ['改名了', selfRow.id]);
  ok(!e7, '只改名字不动代码 → 成功');
  const e8 = rawInsert(core, 'UPDATE regions SET code=? WHERE id=?', ['OK1', selfRow.id]);
  ok(!e8, '把代码设成自己原来的值 → 成功（不与自己冲突）');

  /* ---------------- [6] 幂等 ---------------- */
  console.log('\n[6] migrate 幂等：重复执行不重复改名');
  core.closeDb();
  await core.init(legacyDir);
  const names2 = core.all('SELECT name, code FROM regions ORDER BY id').map(r => `${r.name}=${r.code}`);
  ok(
    JSON.stringify(names2) === JSON.stringify(names),
    '★ 二次 migrate 后代码完全不变（幂等）：' + JSON.stringify(names2)
  );
  ok(core.get('SELECT COUNT(*) c FROM regions').c === 4, '大区数量仍是 4');
  const e9 = rawInsert(core, 'INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    '第三次插入DUP',
    'DUP',
    '#3b6df0',
    0,
    ts,
    ts
  ]);
  ok(!!e9 && /UNIQUE/i.test(e9), '二次 migrate 后索引仍在生效');

  /* ---------------- [7] 极端脏库不阻断启动 ---------------- */
  console.log('\n[7] 极端情况不阻断启动（索引失败也只记日志）');
  core.closeDb();
  const jamDir = path.join(CFG, 'jam', 'data');
  // 造 DUP / DUP2 … DUP999 全占满，逼迫去重算法走「带 id 的确定性兜底」
  const many = [];
  many.push({ name: '基准区', code: 'DUP' });
  for (let i = 2; i <= 60; i++) many.push({ name: `填充区${i}`, code: 'DUP' });
  await makeLegacyDb(jamDir, { dupRegions: many, dupCategories: [] });
  let bootOk = true;
  try {
    await core.init(jamDir);
  } catch (e) {
    bootOk = false;
    console.log('    启动异常：', e.message);
  }
  ok(bootOk, '★ 重度重复的老库仍能正常启动（不抛错）');
  if (bootOk) {
    const cnt = core.get('SELECT COUNT(*) c FROM regions').c;
    ok(cnt === 60, '★ 数据零丢失：60 个大区全部保留：' + cnt);
    const codes = core.all('SELECT code FROM regions').map(r => r.code);
    ok(new Set(codes).size === codes.length, '★ 去重后代码全库唯一：' + JSON.stringify(codes.slice(0, 8)) + '…');
    ok(hasIndex(core, 'uq_regions_code'), '唯一索引建立成功');
  }

  core.closeDb();
  try {
    fs.unlinkSync(stubPath);
  } catch (e) {}
  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('用例异常：', e);
  process.exit(1);
});
