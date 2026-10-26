'use strict';
/**
 * 演示数据：首次启动（--seed/--shot）写入示例大区/分类/标签/字段/文档/便签
 * 依赖 core（查询助手）、users（读取当前用户与设置）、posts（savePost）。
 */
const core = require('./core');
const users = require('./users');
const posts = require('./posts');

const { get, insert, persistNow, nowIso } = core;
const { getSetting, listUsers } = users;

function seed() {
  if (get('SELECT COUNT(*) n FROM posts').n > 0) return false;
  const userId = getSetting('session.user_id') || (listUsers()[0] || {}).id;
  const mkRegion = (name, code, color) =>
    insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      name,
      code,
      color,
      0,
      nowIso(),
      nowIso()
    ]);
  const r1 = mkRegion('人事文档区', 'HR', '#3b6df0');
  const r2 = mkRegion('项目文档区', 'PRJ', '#2da44e');
  const r3 = mkRegion('合同文档区', 'CT', '#d29922');
  const mkCat = (rid, name, code) =>
    insert('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
      rid,
      name,
      code,
      0,
      nowIso(),
      nowIso()
    ]);
  mkCat(r1, '入职文档', 'HIRE');
  mkCat(r1, '培训记录', 'TRAIN');
  mkCat(r2, '立项文档', 'INIT');
  mkCat(r2, '验收文档', 'ACC');
  mkCat(r3, '采购合同', 'BUY');
  mkCat(r3, '服务合同', 'SVC');
  const mkTag = n => insert('INSERT INTO tags(name,created_at) VALUES(?,?)', [n, nowIso()]);
  mkTag('2026');
  mkTag('重要');
  mkTag('待审');
  mkTag('已归档');
  mkTag('机密');
  mkTag('常规');
  mkTag('Q3');
  const mkField = (name, code, type, options, uniq, sort) =>
    insert(
      'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [name, code, type, options, 0, uniq, sort, nowIso(), nowIso()]
    );
  mkField('文档编号', 'NO', 'text', '', 1, 1);
  mkField('归档日期', 'DT', 'date', '', 0, 2);
  mkField('涉及金额', 'AMT', 'number', '', 0, 3);
  mkField('密级', 'LVL', 'select', '公开|内部|机密|绝密', 0, 4);
  mkField('经办人', 'OPR', 'text', '', 0, 5);
  mkField('摘要', 'ABS', 'textarea', '', 0, 6);
  const demo = [
    [
      r1,
      '入职文档',
      '张伟入职文档（2026 年度）',
      ['2026', '已归档'],
      {
        NO: 'HR-2026-0001',
        DT: '2026-03-12',
        LVL: '内部',
        OPR: '李静',
        ABS: '研发中心后端工程师岗位入职材料归档，含背调报告与学历证明扫描件。'
      },
      '<h2>基本信息</h2><p>张伟，男，2026 年 3 月入职研发中心，担任后端工程师，职级 P6。</p><p>入职材料清单：身份证复印件、学历学位证书、离职证明、体检报告、背调授权书。</p><h3>备注</h3><p>背调结论无异常，试用期 6 个月。</p>'
    ],
    [
      r1,
      '培训记录',
      '新员工融入培训记录（第 14 期）',
      ['常规', 'Q3'],
      { NO: 'HR-2026-0102', DT: '2026-07-08', LVL: '公开', OPR: '王芳', ABS: '第 14 期新员工融入培训签到与考核记录。' },
      '<p>培训时间：2026 年 7 月 8 日至 7 月 10 日，参训 32 人。</p><p>考核通过率 96.8%，两门课程评分 4.7 / 5.0。</p>'
    ],
    [
      r2,
      '立项文档',
      '文档数字化平台一期立项书',
      ['重要', '2026'],
      {
        NO: 'PRJ-2026-0007',
        DT: '2026-05-20',
        AMT: '480000',
        LVL: '内部',
        OPR: '陈默',
        ABS: '纸质文档数字化加工与检索平台建设一期立项材料。'
      },
      '<h2>项目背景</h2><p>存量纸质文档约 12 万页，数字化需求迫切。一期目标：完成 5 万页扫描入库与全文检索上线。</p><h3>里程碑</h3><ul><li>6 月：供应商招标</li><li>8 月：扫描进场</li><li>12 月：检索平台验收</li></ul>'
    ],
    [
      r2,
      '验收文档',
      '文档数字化平台一期验收报告',
      ['已归档'],
      {
        NO: 'PRJ-2026-0008',
        DT: '2026-08-02',
        AMT: '465000',
        LVL: '内部',
        OPR: '陈默',
        ABS: '一期项目终验通过，扫描 5.2 万页，验收得分 92。'
      },
      '<p>验收结论：通过。抽检合格率 99.2%，超出合同约定 97% 的标准。</p><p>遗留问题：3 卷破损文档待修复，已列入二期。</p>'
    ],
    [
      r3,
      '采购合同',
      '高速扫描仪采购合同（10 台）',
      ['机密', '2026'],
      {
        NO: 'CT-2026-0031',
        DT: '2026-06-15',
        AMT: '286000',
        LVL: '机密',
        OPR: '赵倩',
        ABS: '采购富士通 fi-8170 扫描仪 10 台，含三年质保。'
      },
      '<p>合同金额：¥286,000（含税），供应商：某科技发展有限公司。</p><p>付款方式：3-6-1（预付 30%、到货 60%、质保金 10%）。</p>'
    ],
    [
      r3,
      '服务合同',
      '文档库房恒温恒湿系统维保服务',
      ['常规'],
      {
        NO: 'CT-2026-0044',
        DT: '2026-07-30',
        AMT: '36000',
        LVL: '内部',
        OPR: '赵倩',
        ABS: '库房环境控制系统年度维保，响应时效 4 小时。'
      },
      '<p>服务期限：2026 年 8 月 1 日至 2027 年 7 月 31 日。</p>'
    ],
    [
      r2,
      '立项文档',
      '电子签章集成专项立项',
      ['待审', 'Q3'],
      {
        NO: 'PRJ-2026-0011',
        DT: '2026-08-12',
        AMT: '120000',
        LVL: '内部',
        OPR: '周航',
        ABS: '与电子签章服务商对接，实现归档文件自动盖章。'
      },
      '<p>目标：归档回执单自动加盖电子签章，减少人工用印。</p>'
    ],
    [
      r1,
      '入职文档',
      '刘洋入职文档（2026 年度）',
      ['2026', '已归档'],
      { NO: 'HR-2026-0002', DT: '2026-04-02', LVL: '内部', OPR: '李静', ABS: '设计中心视觉设计师岗位入职材料归档。' },
      '<p>刘洋，2026 年 4 月入职设计中心，视觉设计师，职级 P5。</p>'
    ]
  ];
  for (const [rid, cat, title, tags, fields, html] of demo) {
    posts.savePost(
      {
        regionId: rid,
        categoryId: get('SELECT id FROM categories WHERE region_id=? AND name=?', [rid, cat]).id,
        title,
        tags,
        fields,
        contentHtml: html,
        status: 'published'
      },
      userId
    );
  }
  const mkNote = (content, color, sort) =>
    insert('INSERT INTO notes(content,color,sort,created_at,updated_at) VALUES(?,?,?,?,?)', [
      content,
      color,
      sort,
      nowIso(),
      nowIso()
    ]);
  mkNote('提醒：9 月 10 日前完成 Q3 文档清点盘点', '#ffe58f', 1);
  mkNote('高速扫描仪到货验收预约在下周二上午', '#d3f9d8', 2);
  mkNote('电子签章专项待立项评审，材料已备齐', '#d0ebff', 3);
  mkNote('机密级文档借阅需双人在场登记', '#ffe3e3', 4);
  persistNow();
  return true;
}

module.exports = {
  seed
};
