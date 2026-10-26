'use strict';
/**
 * 生成「全面验证文档包」脚本（覆盖 Beta.57~Beta.66 各功能点）
 * 产出：
 *   seed-verify/archive.db（+ 签名）：可直接作为 app 数据目录的完整验证库
 *   seed-verify/全面验证文档包.archboxpack：用于「导入文档包」验证查重（含 1 篇与既有文档同标题+大区+分类的重复文档）
 *
 * 覆盖点：标签上限、字段多选、模板（不存编号）、文档编号、查重唯一字段、草稿箱、内联图、便签
 * 用法：node scripts/seed-verify-pack.js
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const core = require(path.join(__dirname, '..', 'electron', 'db', 'core.js'));

const DATA_DIR = path.join(__dirname, '..', 'seed-verify');

/* ---------------- 工具：纯色 PNG（内联图） ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function makePng(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

const REGION_COLORS = [
  '#3b6df0',
  '#f08c2e',
  '#27ae60',
  '#e74c3c',
  '#9b59b6',
  '#16a2b8',
  '#e84393',
  '#6c5ce7',
  '#00b894',
  '#d63031',
  '#0984e3',
  '#fdcb6e',
  '#00cec9',
  '#a29bfe',
  '#ff7675',
  '#55efc4',
  '#74b9ff',
  '#fab1a0',
  '#81ecec',
  '#ffeaa7'
];
const NOTE_COLORS = ['#ffe58f', '#b7eb8f', '#91d5ff', '#ffadd2', '#ffd591', '#d3adf7', '#ffccc7', '#eaff8f'];
const BANNERS = [
  makePng(280, 150, [59, 109, 240]),
  makePng(280, 150, [240, 140, 46]),
  makePng(280, 150, [39, 174, 96]),
  makePng(280, 150, [231, 76, 60]),
  makePng(280, 150, [155, 89, 182]),
  makePng(280, 150, [22, 162, 184]),
  makePng(280, 150, [232, 67, 147]),
  makePng(280, 150, [108, 92, 231])
];
const PARAS = [
  '本文档用于全面功能验证，内容均为示例文本，不反映任何真实业务信息。',
  '记录该项目在规划阶段的关键决策、参与人员与里程碑安排，便于后续追溯与复盘。',
  '包含制度说明、执行口径与注意事项，供相关同事在操作中参照执行。',
  '会议纪要摘要：明确了分工、时间节点与交付标准，并约定了下一次评审方式。',
  '财务相关说明，含预算区间、报销路径与审批链，注意与年度规划保持一致。',
  '技术实现要点记录，涵盖方案选型、兼容性处理与上线风险预案。'
];
const TITLES = [
  '年度规划方案',
  '人事任免通知',
  '财务报销制度',
  '项目启动纪要',
  '会议纪要（Q1）',
  '产品需求文档',
  '运营复盘报告',
  '技术方案评审',
  '合规自查清单',
  '客户沟通记录',
  '培训材料汇编',
  '风险预案说明',
  '资产盘点表',
  '合同模板示例',
  '内部公告',
  '版本发布说明',
  '数据治理规范',
  '供应商评估',
  '保密管理细则',
  '知识库条目',
  '周报模板',
  '调研分析报告',
  '流程优化建议',
  '质量验收标准',
  '应急预案',
  '岗位说明书',
  '预算编制指引',
  '系统迁移方案',
  '用户访谈纪要',
  '对外宣传稿'
];
const TAG_POOL = ['合同', '人事', '财务', '项目', '会议纪要', '制度', '归档', '待审', '重要', '临时', '技术', '运营'];

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await core.init(DATA_DIR);
  const { all, get, run, insert, nowIso, uid, nextPostNo, cleanHtml } = core;

  const ts = nowIso();
  const userId = uid();
  const mac = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  ).join(':');
  insert('INSERT INTO users(id,name,mac,created_at,last_login,password,sec_qa) VALUES(?,?,?,?,?,?,?)', [
    userId,
    '验证账号',
    mac,
    ts,
    ts,
    null,
    null
  ]);

  // 20 大区
  const regions = [];
  for (let i = 1; i <= 20; i++) {
    regions.push(
      insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
        `大区${String(i).padStart(2, '0')}`,
        `R${String(i).padStart(2, '0')}`,
        REGION_COLORS[i - 1],
        i,
        ts,
        ts
      ])
    );
  }
  // 20 分类（1:1 归属大区）
  const cats = [];
  for (let i = 1; i <= 20; i++) {
    cats.push(
      insert('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
        regions[i - 1],
        `分类${String(i).padStart(2, '0')}`,
        `C${String(i).padStart(2, '0')}`,
        i,
        ts,
        ts
      ])
    );
  }
  // 标签池
  const tagIds = [];
  for (const name of TAG_POOL) tagIds.push(insert('INSERT INTO tags(name,created_at) VALUES(?,?)', [name, ts]));

  // 字段定义：负责人(必填)、密级(可选 select)、归档年限(可选)、文档编号(唯一字段，验证查重)
  const fOwner = insert(
    'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ['负责人', 'OWNER', 'text', '', 1, 0, 1, ts, ts]
  );
  const fLevel = insert(
    'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ['密级', 'LEVEL', 'select', '公开|内部|机密', 0, 0, 2, ts, ts]
  );
  const fRetain = insert(
    'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ['归档年限', 'RETAIN', 'text', '', 0, 0, 3, ts, ts]
  );
  const fDocNo = insert(
    'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ['文档编号-唯一', 'DOCNO', 'text', '', 0, 1, 4, ts, ts]
  );
  const OWNERS = ['张三', '李四', '王五', '赵六', '钱七', '孙八'];
  const LEVELS = ['公开', '内部', '机密'];

  const year = new Date().getFullYear();
  const setFields = (pid, idx, docNo) => {
    run('INSERT INTO post_fields(post_id,field_def_id,value) VALUES(?,?,?)', [
      pid,
      fOwner,
      OWNERS[idx % OWNERS.length]
    ]);
    run('INSERT INTO post_fields(post_id,field_def_id,value) VALUES(?,?,?)', [
      pid,
      fLevel,
      LEVELS[idx % LEVELS.length]
    ]);
    if (idx % 2 === 0)
      run('INSERT INTO post_fields(post_id,field_def_id,value) VALUES(?,?,?)', [
        pid,
        fRetain,
        String(3 + (idx % 5)) + ' 年'
      ]);
    if (docNo) run('INSERT INTO post_fields(post_id,field_def_id,value) VALUES(?,?,?)', [pid, fDocNo, docNo]);
  };

  // 30 已发布文章（含内联图；第 1 篇含 10 个标签用于验证上限；部分含唯一编号字段）
  for (let i = 1; i <= 30; i++) {
    const rIdx = (i - 1) % 20;
    const regionId = regions[rIdx],
      categoryId = cats[rIdx];
    const bannerCount = 1 + (i % 3);
    const imgs = [];
    for (let k = 0; k < bannerCount; k++)
      imgs.push(`<p><img src="${BANNERS[(i + k) % BANNERS.length]}" alt="示例图${k + 1}"/></p>`);
    const pText = PARAS[i % PARAS.length];
    const html =
      `<h2>${TITLES[i - 1]}</h2><p>${pText}</p>` +
      imgs.join('') +
      `<p>附录：本条目由全面验证脚本生成。负责人与密级见自定义字段区。</p>`;
    const no = nextPostNo(regionId, categoryId, year);
    const id = insert(
      'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [
        regionId,
        categoryId,
        `${TITLES[i - 1]}（验证${String(i).padStart(2, '0')}）`,
        cleanHtml(html),
        pText,
        'published',
        userId,
        ts,
        ts,
        no
      ]
    );
    // 标签：第 1 篇满 10 个（上限验证），其余 2~4 个
    if (i === 1) for (let t = 0; t < 10; t++) run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [id, tagIds[t]]);
    else {
      const sh = [...tagIds].sort(() => Math.random() - 0.5);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let t = 0; t < n; t++) run('INSERT INTO post_tags(post_id,tag_id) VALUES(?,?)', [id, sh[t]]);
    }
    setFields(id, i, 'DOC' + String(i).padStart(4, '0'));
  }

  // 3 草稿（验证草稿箱）
  for (let i = 1; i <= 3; i++) {
    const regionId = regions[i - 1],
      categoryId = cats[i - 1];
    const no = nextPostNo(regionId, categoryId, year);
    const id = insert(
      'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [
        regionId,
        categoryId,
        `草稿-${i} 待续写`,
        cleanHtml(`<p>这是第 ${i} 份草稿，尚未完成。</p>`),
        `草稿${i}`,
        'draft',
        userId,
        ts,
        ts,
        no
      ]
    );
    setFields(id, i, null);
  }

  // 3 模板（验证模板功能；模板不存编号，no 为空）
  for (let i = 1; i <= 3; i++) {
    const regionId = regions[i - 1],
      categoryId = cats[i - 1];
    const id = insert(
      'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [
        regionId,
        categoryId,
        `模板-${i} 标准结构`,
        cleanHtml(`<h2>${TITLES[i - 1]}（模板）</h2><p>此处填写正文…</p>`),
        '',
        'template',
        userId,
        ts,
        ts,
        ''
      ]
    );
    setFields(id, i, null);
  }

  // 1 篇重复文档（与第 1 篇「年度规划方案（验证01）」同标题+大区+分类），用于验证导入查重
  {
    const regionId = regions[0],
      categoryId = cats[0];
    const id = insert(
      'INSERT INTO posts(region_id,category_id,title,content_html,content_text,status,author_id,created_at,updated_at,no) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [
        regionId,
        categoryId,
        '年度规划方案（验证01）',
        cleanHtml('<p>这是一份与既有文档同标题+大区+分类的重复文档，用于导入查重验证。</p>'),
        '重复',
        'published',
        userId,
        ts,
        ts,
        nextPostNo(regionId, categoryId, year)
      ]
    );
    setFields(id, 1, 'DOC0001'); // 唯一字段值也重复，双重命中查重
  }

  // 20 便签
  for (let i = 0; i < 20; i++) {
    insert('INSERT INTO notes(content,color,sort,created_at,updated_at) VALUES(?,?,?,?,?)', [
      `便签 ${i + 1}：验证便签管理功能。`,
      NOTE_COLORS[i % NOTE_COLORS.length],
      i,
      ts,
      ts
    ]);
  }

  core.persistNow();

  // 回环校验
  const c = {
    users: get('SELECT COUNT(*) n FROM users').n,
    regions: get('SELECT COUNT(*) n FROM regions').n,
    categories: get('SELECT COUNT(*) n FROM categories').n,
    tags: get('SELECT COUNT(*) n FROM tags').n,
    fieldDefs: get('SELECT COUNT(*) n FROM field_defs').n,
    uniqueFields: get('SELECT COUNT(*) n FROM field_defs WHERE unique_field=1').n,
    posts: get('SELECT COUNT(*) n FROM posts').n,
    published: get("SELECT COUNT(*) n FROM posts WHERE status='published'").n,
    draft: get("SELECT COUNT(*) n FROM posts WHERE status='draft'").n,
    template: get("SELECT COUNT(*) n FROM posts WHERE status='template'").n,
    postsWithImg: get("SELECT COUNT(*) n FROM posts WHERE content_html LIKE '%data:image/png%'").n,
    postFields: get('SELECT COUNT(*) n FROM post_fields').n,
    postTags: get('SELECT COUNT(*) n FROM post_tags').n,
    notes: get('SELECT COUNT(*) n FROM notes').n,
    noDup: all('SELECT no, COUNT(*) c FROM posts WHERE no<>"" GROUP BY no HAVING c>1').length
  };
  console.log('=== 全面验证文档包生成完成 ===');
  console.log(JSON.stringify(c, null, 2));

  // 尝试导出 .archboxpack（用于导入查重验证）
  try {
    const db = require(path.join(__dirname, '..', 'electron', 'db'));
    const archpack = require(path.join(__dirname, '..', 'electron', 'services', 'archpack'));
    const zipBuf = await archpack.buildZipPack(db, {});
    const zipPath = path.join(DATA_DIR, '全面验证文档包.archboxpack');
    fs.writeFileSync(zipPath, zipBuf);
    console.log('文档包已导出：', zipPath, `（${zipBuf.length} 字节）`);
  } catch (e) {
    console.warn('（跳过）文档包 ZIP 导出失败，可改用 app 内「导出文档包」生成：', e.message);
  }
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
