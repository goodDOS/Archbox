'use strict';
/**
 * 生成一份演示 / 导入测试数据：输出为 v3 文档包（.archboxpack，ZIP 包裹）。
 *
 * 设计：6 大区 × 每大区 6 篇 = 36 篇 + 1 合作单位文档区 × 6 家公司 = 6 篇，共 42 篇。
 * 覆盖「大区 / 分类 / 标签 / 字段 / 字段类型（含 select）」五个维度。
 *
 * v3 约定（本次重构）：
 *   - 正文图片一律 data:image/png;base64 内联，不再使用 archimg:// 协议、不再分储文件；
 *   - 文档包为 ZIP 包裹，含 manifest.json + 经 Ed25519 签名的 checksums.json（L1+L2+CRC32 防篡改）；
 *   - 不兼容 v1/v2 旧版（旧 .archpack 文件请删除，用本脚本重新生成）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../electron/db/core');
const db = require('../electron/db');
const archpack = require('../electron/services/archpack');

const REGIONS = [
  { name: '人事文档区', cat: '入职与异动', code: 'HR', color: '#3b6df0' },
  { name: '项目文档区', cat: '立项与验收', code: 'PRJ', color: '#22c55e' },
  { name: '合同文档区', cat: '采购与服务', code: 'CT', color: '#f59e0b' },
  { name: '财务文档区', cat: '预算与决算', code: 'FIN', color: '#8a63d2' },
  { name: '法务文档区', cat: '诉讼与合规', code: 'LEG', color: '#ef4444' },
  { name: '行政文档区', cat: '印章与文书', code: 'ADM', color: '#0ea5e9' }
];
const COOP_REGION = { name: '合作单位文档区', code: 'COOP', color: '#14b8a6' };

const TAGS = ['2026', '重要', '待审', '已归档', '机密', '常规'];
const COOP_TAG = '合作方';
const LVL_OPTS = ['公开', '内部', '机密', '绝密'];
const OPR = ['李静', '王芳', '陈默', '赵倩', '周航', '孙磊', '吴敏', '郑昊'];
const MONTHS = ['03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

const TITLES = [
  '年度入职材料归档',
  '员工异动审批单',
  '培训签到与考核表',
  '试用期转正评估',
  '项目立项建议书',
  '项目里程碑报告',
  '验收与决算材料',
  '专项可行性分析',
  '采购合同正本',
  '服务外包协议',
  '框架采购清单',
  '维保服务记录',
  '预算编制说明',
  '费用报销凭证',
  '决算审计报告',
  '专项资金台账',
  '诉讼案件卷宗',
  '合规自查报告',
  '知识产权保护',
  '风险排查台账',
  '印章使用登记',
  '会议纪要汇编',
  '制度发文稿',
  '文书清归档目'
];

// 各家公司的信息资料（作为「合作单位文档区」下每个公司一个分类、各一篇）
const COMPANIES = [
  {
    name: '鼎信科技发展有限公司',
    short: '鼎信科技',
    code: '91110108MA01ABCD1X',
    industry: '办公设备 / 影像扫描',
    scale: '中型（200-500 人）',
    addr: '北京市海淀区中关村南大街 18 号',
    contact: '联系人：王经理 138-0000-0001',
    since: '2024-03',
    coop: '高速扫描仪及零配件供应，提供三年质保与上门维护',
    level: '重要合作方',
    note: '多家政府文档单位入围供应商，供货及时、口碑良好。'
  },
  {
    name: '云档信息技术股份有限公司',
    short: '云档信息',
    code: '91310115MA1KEFG2Y',
    industry: '文档数字化 / 软件平台',
    scale: '大型（1000 人以上）',
    addr: '上海市浦东新区张江高科技园区',
    contact: '联系人：李总监 139-0000-0002',
    since: '2023-09',
    coop: '文档数字化加工平台与全文检索系统建设',
    level: '核心合作方',
    note: '具备涉密资质，承担多期数字化平台项目。'
  },
  {
    name: '中安信息安全研究院',
    short: '中安信安',
    code: '91110108MA01HIJ3Z',
    industry: '信息安全 / 合规咨询',
    scale: '中型（100-300 人）',
    addr: '北京市西城区金融街 7 号',
    contact: '联系人：赵工 137-0000-0003',
    since: '2025-01',
    coop: '等保测评、数据脱敏与合规咨询',
    level: '重要合作方',
    note: '为文档系统提供等保二级测评与整改建议。'
  },
  {
    name: '华文文档装具制造厂',
    short: '华文装具',
    code: '91320583MA1MKLM4A',
    industry: '文档装具 / 耗材制造',
    scale: '小型（50-200 人）',
    addr: '江苏省昆山市玉山镇园区路 9 号',
    contact: '联系人：陈厂长 136-0000-0004',
    since: '2022-06',
    coop: '密集架、防磁柜、文档盒等装具供应',
    level: '常规合作方',
    note: '性价比高，适合大批量装具采购。'
  },
  {
    name: '智运物流有限公司',
    short: '智运物流',
    code: '91440300MA5NOPQ5B',
    industry: '文档运输 / 仓储',
    scale: '中型（200-500 人）',
    addr: '广东省深圳市福田区保税区',
    contact: '联系人：孙调度 135-0000-0005',
    since: '2024-11',
    coop: '涉密文档异地转运与恒温仓储',
    level: '重要合作方',
    note: '自有押运车辆，支持双人双锁转运。'
  },
  {
    name: '方正律师事务所',
    short: '方正律所',
    code: '31110000MD012RS6C',
    industry: '法律服务',
    scale: '中型（100-300 人）',
    addr: '北京市朝阳区建国路 88 号',
    contact: '联系人：周律师 134-0000-0006',
    since: '2023-04',
    coop: '合同审查、知识产权与诉讼代理',
    level: '常规合作方',
    note: '常年法律顾问，响应及时。'
  }
];

// v3：正文图片内联为 base64（1x1 蓝点占位 PNG，仅用于演示图文混排结构）
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
function inlineImg(alt) {
  return `<img src="data:image/png;base64,${PNG_B64}" alt="${String(alt || '图片').replace(/"/g, '')}">`;
}

function companyBody(c, i) {
  const hasImg = i % 2 === 0;
  return (
    `<h2>公司信息资料：${c.name}</h2><ul>` +
    `<li>统一社会信用代码：${c.code}</li>` +
    `<li>所属行业：${c.industry}</li>` +
    `<li>企业规模：${c.scale}</li>` +
    `<li>注册地址：${c.addr}</li>` +
    `<li>对接人 / 联系方式：${c.contact}</li>` +
    `<li>合作起始：${c.since}</li>` +
    `<li>合作内容：${c.coop}</li>` +
    `<li>合作级别：${c.level}</li>` +
    `</ul>${hasImg ? inlineImg(c.short + ' 企业标识') : ''}<p>${c.note}</p>`
  );
}

function body(i) {
  const hasImg = i % 3 === 0;
  return (
    `<h2>${TITLES[i % TITLES.length]}（样本 ${i + 1}）</h2>` +
    `<p>本篇为导入测试演示数据，覆盖文档归档、检索与字段筛选场景。</p>` +
    (hasImg ? inlineImg('示意图片 ' + (i + 1)) : '') +
    `<p>关联大区与分类用于验证维度聚合；标签与自定义字段用于验证筛选与导出。</p>`
  );
}

// === 组装并导出 v3 文档包 ===
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-demo-'));
  await db.init(tmp);
  const now = core.nowIso();
  const ins = (sql, params) => {
    core.run(sql, params);
    return core.get('SELECT last_insert_rowid() id').id;
  };

  // 演示用户
  core.run(
    "INSERT OR IGNORE INTO users(id,name,mac,created_at,last_login) VALUES('U1','演示员','00:00:00:00:00:01',?,null)",
    [now]
  );

  // 大区
  const regionIds = {};
  REGIONS.forEach((r, i) => {
    regionIds[r.name] = ins('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      r.name,
      r.code,
      r.color,
      i,
      now,
      now
    ]);
  });
  const coopRid = ins('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
    COOP_REGION.name,
    COOP_REGION.code,
    COOP_REGION.color,
    REGIONS.length,
    now,
    now
  ]);

  // 分类
  const catIds = {};
  REGIONS.forEach(r => {
    catIds[r.name] = ins('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      regionIds[r.name],
      r.cat,
      'IMP',
      0,
      now,
      now
    ]);
  });
  COMPANIES.forEach(c => {
    catIds[c.short] = ins(
      'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      [coopRid, c.short, 'COOP', 0, now, now]
    );
  });

  // 标签
  TAGS.forEach(t => core.run('INSERT INTO tags(name,created_at) VALUES(?,?)', [t, now]));
  core.run('INSERT INTO tags(name,created_at) VALUES(?,?)', [COOP_TAG, now]);

  // 字段定义
  const fieldDefs = [
    { name: '编号', code: 'NO', type: 'text', required: true, unique_field: true, options: [], sort: 0 },
    { name: '日期', code: 'DT', type: 'date', required: false, unique_field: false, options: [], sort: 1 },
    { name: '金额', code: 'AMT', type: 'number', required: false, unique_field: false, options: [], sort: 2 },
    { name: '密级', code: 'LVL', type: 'select', required: false, unique_field: false, options: LVL_OPTS, sort: 3 },
    { name: '经办人', code: 'OPR', type: 'text', required: false, unique_field: false, options: [], sort: 4 },
    { name: '摘要', code: 'ABS', type: 'textarea', required: false, unique_field: false, options: [], sort: 5 }
  ];
  fieldDefs.forEach((f, i) =>
    core.run(
      'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [f.name, f.code, f.type, f.options.join('|'), f.required ? 1 : 0, f.unique_field ? 1 : 0, i, now, now]
    )
  );

  // 文档（大区 × 每区 6 篇）
  for (let i = 0; i < 36; i++) {
    const r = REGIONS[Math.floor(i / 6)];
    const no = `${r.code}-2026-${String(i + 1).padStart(4, '0')}`;
    const dt = `2026-${MONTHS[i % MONTHS.length]}-${String((i % 27) + 1).padStart(2, '0')}`;
    const amt = i % 2 === 0 ? String((((i + 1) * 13751) % 900000) + 10000) : '';
    const abs = i % 3 === 1 ? `第 ${i + 1} 篇归档摘要，含关键要素与处置意见。` : '';
    db.savePost(
      {
        title: `${TITLES[i % TITLES.length]}（${r.name}·${i + 1}）`,
        regionId: regionIds[r.name],
        categoryId: catIds[r.name],
        tags: [TAGS[i % 6]],
        fields: { NO: no, DT: dt, AMT: amt, LVL: LVL_OPTS[i % LVL_OPTS.length], OPR: OPR[i % OPR.length], ABS: abs },
        contentHtml: body(i),
        status: 'published'
      },
      'U1'
    );
  }
  // 合作单位文档（每公司一篇）
  COMPANIES.forEach((c, i) => {
    const no = `PART-2026-${String(i + 1).padStart(4, '0')}`;
    const dt = `2026-${String(((i * 2) % 12) + 1).padStart(2, '0')}-15`;
    const opr = (c.contact.split('：')[1] || '').split(' ')[0] || '招商部';
    db.savePost(
      {
        title: `公司信息资料：${c.name}`,
        regionId: coopRid,
        categoryId: catIds[c.short],
        tags: [COOP_TAG],
        fields: { NO: no, DT: dt, AMT: '', LVL: '', OPR: opr, ABS: c.note },
        contentHtml: companyBody(c, i),
        status: 'published'
      },
      'U1'
    );
  });

  // 导出 v3 ZIP 文档包
  const zipBuf = await archpack.buildZipPack(db, {});
  const out = path.resolve(__dirname, '..', '演示数据-导入测试.archboxpack');
  fs.writeFileSync(out, zipBuf);

  // 顺手清理已废止的旧版 v1 .archpack（无法被 v3 导入）
  const oldPath = path.resolve(__dirname, '..', '演示数据-导入测试.archpack');
  if (fs.existsSync(oldPath)) {
    fs.unlinkSync(oldPath);
    console.log('（已删除不可兼容的旧版 .archpack 演示文件）');
  }

  // 校验并统计
  const summarized = archpack.summaryOf(archpack.parseZipPackBuffer(zipBuf).manifest);
  console.log('输出文件:', out);
  console.log('格式: v3 ZIP 文档包（.archboxpack，图片 base64 内联 + L1+L2+CRC32 防篡改）');
  console.log('摘要:', JSON.stringify(summarized));
})().catch(e => {
  console.error('生成失败:', e);
  process.exit(1);
});
