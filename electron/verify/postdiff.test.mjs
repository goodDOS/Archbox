/**
 * postDiff 版本对比算法单测（jsdom 环境，不依赖 Electron 真机）。
 *
 * 覆盖 14 组，重点是三类「最容易写错」的语义：
 *  ① 段落边界不能被压平（并把「为什么不能用 core.htmlToText」钉进测试）
 *  ② 段落移位必须容忍 —— 这是选 LCS 而非按下标配对的决定性理由
 *  ③ 纯折行重排不得误报 —— 最毁信任的假阳性
 *
 * 运行：node electron/verify/postdiff.test.mjs
 */
import { JSDOM } from 'jsdom';
import { htmlToText } from '../../electron/db/core.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

const pd = await import('../../src/utils/postDiff.js');
const {
  htmlToParagraphs,
  tokenize,
  diffTokens,
  diffParagraphs,
  diffMeta,
  buildPostDiff,
  similarity,
  MAX_PARAS,
  CHANGE_RATIO
} = pd;

// 与 src/utils/postDiff.js 同一构造方式：不用正则字面量写 NUL，避开 no-control-regex
const NUL = String.fromCharCode(0);
const TOKEN_RE = new RegExp(`${NUL}IMG:[0-9a-f]{8}${NUL}`);

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

// ── 1. 段落边界不被压平；同时把「core.htmlToText 会压平」写成对照 ──
{
  const a = htmlToParagraphs('<p>甲段</p><p>乙段</p>');
  ok(a.length === 2 && a[0] === '甲段' && a[1] === '乙段', '1. <p> 各自成段：' + JSON.stringify(a));
  const flat = htmlToText('<p>甲段</p><p>乙段</p>');
  ok(
    flat === '甲段 乙段' && flat.indexOf('乙段') >= 0 && a.join(' ') !== flat.replace(/\s+/g, ''),
    `1b. ★ 对照：core.htmlToText 把两段压平为 ${JSON.stringify(flat)}（这正是本模块不复用它的原因）`
  );
}

// ── 2. 各类块级标签各自成段 ──
{
  const ps = htmlToParagraphs('<p>一</p><div>二</div><h3>三</h3><li>四</li><blockquote>五</blockquote><pre>六</pre>');
  ok(ps.length === 6, `2. 块级标签各成段（得 ${ps.length}，期望 6）：` + JSON.stringify(ps));
}

// ── 3. <br> 断段 ──
{
  const ps = htmlToParagraphs('<p>上<br>下</p>');
  ok(ps.length === 2 && ps[0] === '上' && ps[1] === '下', '3. <br> 断段：' + JSON.stringify(ps));
}

// ── 4. 图片不再退化为文字占位（Beta.322 用户要求「显示图片而不是占位符」）──
//   旧实现断言的是 '看图[图片]'；那是把图拍成文本的旧行为，现已废弃。
//   现在图片是一个带 id 的原子 token，图片本体在 images 表里。
{
  const IMG = 'data:image/png;base64,AAAA';
  const ps = htmlToParagraphs(`<p>看图<img src="${IMG}"></p>`);
  ok(
    ps.length === 1 && new RegExp(`^看图${NUL}IMG:[0-9a-f]{8}${NUL}$`).test(ps[0]),
    '4. 图片 → 段落里的原子 token（不再是「[图片]」文字）：' + JSON.stringify(ps)
  );
  const ex = pd.htmlToParagraphsEx(`<p>看图<img src="${IMG}"></p>`);
  // token 前面还有「看图」两个字，不能写死偏移量 —— 用正则取，避免再踩一次
  const id = new RegExp(`${NUL}IMG:([0-9a-f]{8})${NUL}`).exec(ps[0])[1];
  ok(ex.images[id] && ex.images[id].src === IMG, '4b. 图片本体进了 images 表，可直接喂给 <img src>');
  ok(ex.slots[0].length === 1 && ex.slots[0][0].src === IMG, '4c. 该段 slots 记到了这一张图（界面按段取图）');
}

// ── 5. 实体解码 + 空白归一 ──
{
  const ps = htmlToParagraphs('<p>A&amp;B &lt;x&gt; 空格&nbsp;合并</p>');
  ok(ps.length === 1 && ps[0] === 'A&B <x> 空格 合并', '5. 实体解码 + \\u00A0 折叠：' + JSON.stringify(ps[0]));
}

// ── 6. 完全一致快速路径（HTML 不同但归一化后相同）──
{
  const d = buildPostDiff('<p>一</p>\n<p>二</p>', '<p>一</p>   <p>二</p>');
  ok(
    d.identical === true && d.stats.change === 0 && d.stats.insert === 0,
    '6. 归一化后全等 → identical（空白差异不算改动）'
  );
}

// ── 7. 纯增 / 纯删 / 纯改 ──
{
  const ins = diffParagraphs(['a'], ['a', 'b']);
  ok(ins.stats.insert === 1 && ins.stats.delete === 0, '7a. 纯增：insert=1');
  const del = diffParagraphs(['a', 'b'], ['a']);
  ok(del.stats.delete === 1 && del.stats.insert === 0, '7b. 纯删：delete=1');
  // 改一段真实文本（相似度够高才配成 change —— 单字符 'b'→'X' 相似度为 0，本就该一删一增）
  const chg = diffParagraphs(
    ['合同金额 100 万元整', '付款方式：分三期支付'],
    ['合同金额 120 万元整', '付款方式：分四期支付']
  );
  ok(
    chg.stats.change === 2 && chg.stats.insert === 0 && chg.stats.delete === 0,
    `7c. 两段各改一处 → 配成 2 个 change（得 ${JSON.stringify(chg.stats)}，不得塌成 delete/insert 洪水）`
  );
  const chgOp = chg.ops.find(o => o.type === 'change');
  ok(
    chgOp && chgOp.oldText === '合同金额 100 万元整' && chgOp.newText === '合同金额 120 万元整',
    '7d. change 行同时携带旧/新文本'
  );
  // 相似度不够时必须老实判「一删一增」，不能硬凑成 change
  const lowSim = diffParagraphs(['违约责任：任何一方违约应赔偿全部损失'], ['争议解决：提交甲方所在地人民法院']);
  ok(
    lowSim.stats.delete === 1 && lowSim.stats.insert === 1 && lowSim.stats.change === 0,
    '7e. ★ 相似度低的两段不被硬凑成 change（那会造出整段删除线，噪音大于信息）'
  );
}

// ── 8. 中文段内切分：只标出真正变的那个词 ──
{
  const segs = diffTokens('合同金额 100 万', '合同金额 120 万');
  const delTxt = segs
    .filter(s => s.t === 'del')
    .map(s => s.text)
    .join('');
  const insTxt = segs
    .filter(s => s.t === 'ins')
    .map(s => s.text)
    .join('');
  // 数字按整词切（100→120），不逐位切：日期/编号逐位切会让「2026-09-24」被拆成 8 段，反而不可读
  ok(
    delTxt === '100' && insTxt === '120',
    `8. 段内只标出 del=${JSON.stringify(delTxt)} ins=${JSON.stringify(insTxt)}（「合同金额」「万」不应被连带高亮）`
  );
  ok(
    segs
      .filter(s => s.t === 'eq')
      .map(s => s.text)
      .join('')
      .includes('合同金额'),
    '8b. 未变部分保留为 eq 文本'
  );
  // 中文逐字：改一个字就只标一个字
  const cn = diffTokens('甲方名称', '乙方名称');
  ok(
    cn
      .filter(s => s.t === 'del')
      .map(s => s.text)
      .join('') === '甲' &&
      cn
        .filter(s => s.t === 'ins')
        .map(s => s.text)
        .join('') === '乙',
    '8c. 中文逐字切分（甲→乙 只标 1 字，不是整词）'
  );
}

// ── 9. ★ 段落移位容忍：顶部插入一段，其后全部 equal ──
{
  const oldP = ['第一', '第二', '第三'];
  const newP = ['新插入', '第一', '第二', '第三'];
  const d = diffParagraphs(oldP, newP);
  ok(
    d.stats.insert === 1 && d.stats.delete === 0 && d.stats.change === 0,
    `9. ★ 顶部插入一段 → 其后全 equal（ins=${d.stats.insert} del=${d.stats.delete} chg=${d.stats.change}）` +
      '；按下标配对的实现会让本用例得到 3 个 change'
  );
}

// ── 10. 段内纯空白重排不误报（假阳性防护）──
{
  // 注意：<br> 是段落边界，跨 <br> 断成两段本来就是「结构变了」，
  //   真正的假阳性来源是 contenteditable 在同一段内重排折行/缩进产生的纯空白差异。
  const d = buildPostDiff('<p>很长的一行文字   被折成两行</p>', '<p>很长的一行文字 被折成两行</p>');
  ok(d.identical === true, '10. 段内多空格 vs 单空格不误报（contenteditable 常重排折行）');
  const d2 = buildPostDiff('<p>甲</p>\n  <p>乙</p>', '<p>甲</p><p>乙</p>');
  ok(d2.identical === true, '10b. 段间源码缩进差异不误报');
}

// ── 11. 截断 ──
{
  const many = Array.from({ length: 2500 }, (_, i) => '段' + i);
  const d = diffParagraphs(many, many);
  ok(
    d.truncated === true && d.ops.length === MAX_PARAS,
    `11. 超限截断：truncated=true，ops 长度 ${d.ops.length} == MAX_PARAS(${MAX_PARAS})`
  );
}

// ── 12. 超长单段整体标记为 change ──
{
  const long = '字'.repeat(6000);
  const d = diffParagraphs(['短'], [long]);
  const op = d.ops.find(o => o.type === 'change' || o.type === 'delete');
  ok(d.truncated === false && !!op, '12. 超长单段：不炸、不截断，落为 change/delete');
  const segs = diffTokens('短', long);
  ok(
    segs.length === 2 && segs[0].t === 'del' && segs[1].t === 'ins',
    '12b. 超长段落段内 diff 退化为整体替换（del + ins）'
  );
}

// ── 13/14. 空输入 ──
{
  const both = diffParagraphs([], []);
  ok(both.ops.length === 0 && both.stats.equal === 0, '13. 两侧皆空 → 0 ops');
  const one = diffParagraphs([], ['新']);
  ok(one.stats.insert === 1, '14. 单侧为空串 → 全为 insert');
  const none = buildPostDiff('', '');
  ok(none.identical === true && none.newParaCount === 0, '14b. 两边都空 → identical');
}

// ── 15. 元信息 diff（只改标题不得显示「完全相同」）──
{
  const rows = diffMeta({ title: '旧标题', tags: ['乙'] }, { title: '新标题', tags: ['甲'] });
  ok(rows.length >= 1, `15. 标题/标签变化被元信息 diff 捕获（得 ${rows.length} 行）`);
  ok(
    rows.some(r => r.label === 'post.metaTitle' && r.old === '旧标题' && r.new === '新标题'),
    '15b. 标题行内容正确'
  );
  const full = buildPostDiff('<p>正文没动</p>', '<p>正文没动</p>', {
    oldSnap: { title: '旧', tags: [] },
    newSnap: { title: '新', tags: ['甲'] }
  });
  ok(full.identical === false, '15c. ★ 正文相同但标题/标签不同 → 不得判为 identical');
  const none = diffMeta({ title: 'A' }, { title: 'A' });
  ok(none.length === 0, '15d. 元信息相同 → 0 行');
}

// ── 15e. ★ 字段必须【逐项】展开对比（Beta.253 用户报「历史版本与快照没有包含字段数据」）──
// 旧实现把 fields 拼成一行字符串比对，只答「字段变了没有」，
// 答不了「哪个字段从什么变成了什么」—— 而字段正是文档最核心的信息。
// 本组断言把「逐字段成行」这件事钉死，防止将来又被合回一行。
{
  const oldSnap = { fields: { NO: 'HR-2026-0001', DT: '2026-01-01', LVL: '内部' } };
  const newSnap = { fields: { NO: 'HR-2026-0002', DT: '2026-01-01', LVL: '内部' } };
  const rows = diffMeta(oldSnap, newSnap, {
    fieldLabel: c => ({ NO: '文档编号', DT: '归档日期', LVL: '密级' })[c] || c
  });

  ok(
    rows.length === 1,
    `15e. ★ 只有一个字段变动 → 只产出 1 行（旧实现把整串字段拼成一行，多字段变动会混成一行；实得 ${rows.length} 行）`
  );
  ok(
    rows[0].old === 'HR-2026-0001' && rows[0].new === 'HR-2026-0002',
    `15e2. ★ 该行承载的是「这个字段」的旧值→新值，而不是整串字段（实得 ${rows[0].old} → ${rows[0].new}）`
  );
  ok(
    /文档编号/.test(rows[0].label) && /NO/.test(rows[0].label),
    `15e3. ★ 标签带可读字段名与 code，重名字段也能区分（实得「${rows[0].label}」）`
  );

  // 未变动的字段不得出现在对比结果里（否则每行都是噪音）
  ok(!rows.some(r => /DT|归档日期/.test(r.label)), '15e4. ★ 本次没动过的字段不进对比结果（DT 不变 → 不出现）');

  // 多字段同时变动 → 必须是多行，不是一行
  const multi = diffMeta({ fields: { NO: 'A', DT: 'X' } }, { fields: { NO: 'B', DT: 'Y' } }, { fieldLabel: c => c });
  ok(
    multi.length === 2,
    `15e5. ★ 两个字段同时变动 → 2 行（这正是旧实现做不到的：会被拼成 1 行 ${JSON.stringify(multi.map(r => r.label))}）`
  );

  // 新增字段（旧侧没有）+ 清空字段（新侧为空）都要被看见 —— 只看单侧 key 会漏掉
  const added = diffMeta({ fields: { A: '1' } }, { fields: { A: '1', B: '2' } }, { fieldLabel: c => c });
  ok(
    added.length === 1 && added[0].label === 'B' && added[0].old === '' && added[0].new === '2',
    `15e6. ★ 新增的字段有值 → 被看见（旧值为空，新值为 2；实得 ${JSON.stringify(added)}）`
  );
  const cleared = diffMeta({ fields: { A: '1', B: '2' } }, { fields: { A: '1' } }, { fieldLabel: c => c });
  ok(
    cleared.length === 1 && cleared[0].label === 'B' && cleared[0].old === '2' && cleared[0].new === '',
    `15e7. ★ 字段被清空 → 同样被看见（实得 ${JSON.stringify(cleared)}）`
  );

  // 字段不同但正文相同 → 不得判 identical（与 15c 同一考量）
  const full2 = buildPostDiff('<p>正文没动</p>', '<p>正文没动</p>', {
    oldSnap: { fields: { NO: 'A' }, title: 'T' },
    newSnap: { fields: { NO: 'B' }, title: 'T' }
  });
  ok(full2.identical === false, '15e8. ★ 正文相同、只有字段变了 → 不得判为 identical');
  ok(
    full2.meta.length === 1 && full2.meta[0].old === 'A' && full2.meta[0].new === 'B',
    `15e9. ★ buildPostDiff 把字段差异带进 meta（实得 ${JSON.stringify(full2.meta)}）`
  );

  // 无 fieldLabel 时兜底显示 code 本身，绝不静默丢弃
  const noLabel = diffMeta({ fields: { ZZ: '1' } }, { fields: { ZZ: '2' } });
  ok(
    noLabel.length === 1 && noLabel[0].label === 'ZZ',
    '15e10. ★ 字段定义缺失（查不到可读名）时兜底显示 code，不丢信息'
  );
}

// ── 16. buildPostDiff 端到端 + 计数 ──
{
  const d = buildPostDiff(
    '<p>甲方：华夏建筑工程有限公司</p><p>合同金额 100 万元整</p><p>本合同一式两份</p>',
    '<p>甲方：华夏建筑工程有限公司</p><p>合同金额 120 万元整</p><p>本合同一式两份</p><p>附件：施工图纸</p>'
  );
  ok(d.oldParaCount === 3 && d.newParaCount === 4, '16. buildPostDiff 段落计数正确');
  ok(
    d.stats.change === 1 && d.stats.insert === 1,
    `16b. 摘要统计正确：change=1 insert=1（得 ${JSON.stringify(d.stats)}）`
  );
  ok(
    Array.isArray(d.ops) && d.ops.every(o => ['equal', 'insert', 'delete', 'change'].includes(o.type)),
    '16c. 所有 op.type 都在约定枚举内'
  );
}

// ── 17. ★ Histogram 对齐（Beta.230 视觉复核后补）──
// 实测问题：纯段落级 LCS 把「整段全等」当唯一 equal 判据，
// 于是「每段都改一两个词」这种最常见的真实场景整篇塌成 delete 洪水 + insert 洪水，
// 用户看到「全删了 + 全加了」，段内删除线根本没机会标出来。
{
  const OLD = [
    '甲方：华夏建筑工程有限公司',
    '合同金额 100 万元整，期限自 2026-01-01 起至 2026-12-31 止。',
    '付款方式：分三期支付，每期结束后 30 日内付清。',
    '违约责任：任何一方违约，应赔偿对方全部直接损失。',
    '本合同一式两份，双方各执一份。',
    '附件：施工进度表、施工图纸一套。'
  ];
  const NEW = [
    '甲方：华夏建筑工程有限公司',
    '合同金额 120 万元整，期限自 2026-01-01 起至 2027-06-30 止。',
    '付款方式：分四期支付，每期结束后 30 日内付清。',
    '违约责任：任何一方违约，应赔偿对方全部直接损失。',
    '本合同一式两份，双方各执一份。',
    '附件：施工进度表、施工图纸一套。'
  ];
  const d = diffParagraphs(OLD, NEW);
  ok(d.stats.change === 2, `★ 17. 两段各改一处 → 恰好 2 个 change（得 ${JSON.stringify(d.stats)}）`);
  ok(
    d.stats.delete === 0 && d.stats.insert === 0,
    `17b. ★ 不产生 delete/insert 洪水（得 del=${d.stats.delete} ins=${d.stats.insert}）—— 这正是纯 LCS 的缺陷`
  );
  ok(d.stats.equal === 4, `17c. 未动的 4 段仍判 equal（得 ${d.stats.equal}）`);
  // 段内必须真的标出差异，而不是只说「这段改了」
  const first = d.ops.find(o => o.type === 'change');
  ok(
    first.tokens.some(t => t.t === 'ins' && t.text === '120') &&
      first.tokens.some(t => t.t === 'del' && t.text === '100'),
    '17d. ★ 段内标出 100→120（真实截图复核发现的能力缺口）'
  );
  ok(
    first.tokens.some(t => t.t === 'del' && t.text === '2026') &&
      first.tokens.some(t => t.t === 'ins' && t.text === '2027'),
    '17e. 段内同时标出日期改动 2026→2027'
  );
  // 「甲方出钱」→「乙方出钱」相似度 0.75，配成 change 是对的（确实只改了一个字）。
  // 真正该判一删一增的是完全不相干的两段。
  const unrelated = diffParagraphs(['甲方出钱'], ['附件：施工图纸一套']);
  ok(
    unrelated.stats.change === 0 && unrelated.stats.delete === 1 && unrelated.stats.insert === 1,
    `17f. 完全不同名的两段判一删一增（得 ${JSON.stringify(unrelated.stats)}）`
  );
  ok(
    similarity('甲方出钱', '乙方出钱') > 0.5 && similarity('甲方出钱', '附件：施工图纸一套') < 0.5,
    '17g. 阈值 0.5 能区分「改一个字」与「换一段话」'
  );
}

/** 20c 用的纯图片段判据（与组件同一入口，保证测的是真实现） */
function isImgOnly20(text) {
  return pd.isImgOnly(text);
}

// ── 18. ★ 图片：显示真图而不是占位符（用户明确要求）──
//   旧实现把 <img> 拍成 "[图片]"，于是「换图」「增删图」只能靠数文字，
//   改尺寸更是完全看不见。这一组把「图片作为原子 token 参与对比」钉死。
{
  const IMG1 = 'data:image/png;base64,AAAA1';
  const IMG2 = 'data:image/png;base64,BBBB2';
  const oldHtml = `<p>图一如下</p><p><img src="${IMG1}" alt="甲"></p><p>结尾</p>`;
  const newHtml = `<p>图一如下</p><p><img src="${IMG2}" alt="乙"></p><p>结尾</p>`;
  const d = buildPostDiff(oldHtml, newHtml);

  ok(Object.keys(d.images).length === 2, `18a. 两张不同的图各得一条 images 记录（得 ${Object.keys(d.images).length}）`);
  ok(
    Object.values(d.images).every(v => v.src && /^data:image/.test(v.src)),
    '18b. images 表里存的是可直接喂给 <img src> 的真 src，不是占位文本'
  );
  const chg = d.ops.find(o => o.type === 'change');
  ok(!!chg, '18c. 换图的那一段判为 change');
  ok(
    chg && chg.oldImgs.length === 1 && chg.newImgs.length === 1 && chg.oldImgs[0].id !== chg.newImgs[0].id,
    '18d. 该段左右各自挂到一张图，且两张图 id 不同'
  );
  ok(
    chg &&
      chg.tokens.some(t => t.t === 'img' && t.side === 'del') &&
      chg.tokens.some(t => t.t === 'img' && t.side === 'ins'),
    '18e. ★ tokens 里图片是独立片段（t:"img"）且带 side，界面才能左显旧图、右显新图'
  );
  ok(
    chg && !chg.tokens.some(t => t.t !== 'img' && t.text.indexOf(NUL) >= 0),
    '18f. ★ 控制字符绝不混进文字片段（否则界面上会露出一串 \\u0000IMG:…）'
  );
}

// ── 19. 同一张图未变 → 不算改动 ──
//   这是「id 由 src 派生」而非「按出现顺序编号」的核心收益：
//   否则每次保存都会因为序号漂移把没动的图报成「删一张 + 插一张」。
{
  const IMG = 'data:image/png;base64,SAMESAME';
  const html = `<p>前</p><p><img src="${IMG}"></p><p>后</p>`;
  const d = buildPostDiff(html, html);
  ok(d.identical === true, '19a. 正文一字未动 → identical');
  ok(
    !d.ops.some(o => o.type === 'change' || o.type === 'delete' || o.type === 'insert'),
    '19b. ★ 同一张图在不同版本里判等，不产生任何增删'
  );
  const moved = `<p><img src="${IMG}"></p><p>前</p><p>后</p>`;
  const d2 = buildPostDiff(html, moved);
  ok(Object.keys(d2.images).length === 1, '19c. ★ 图只是换了位置时，图片表仍只有一条（id 与顺序无关）');
}

// ── 20. 纯图片段不被整段丢弃 ──
//   旧实现在 textContent 为空时直接 skip，于是「单独插图」在对比里完全不可见。
{
  const IMG = 'data:image/png;base64,ONLYIMG';
  const d = buildPostDiff('<p>文字</p>', `<p>文字</p><p><img src="${IMG}"></p>`);
  ok(d.stats.insert === 1, `20a. ★ 新增一段纯图片 → 记 1 条 insert（得 ${JSON.stringify(d.stats)}）`);
  const ins = d.ops.find(o => o.type === 'insert');
  ok(ins && ins.newImgs.length === 1, '20b. 该 insert 行右侧带到了那张图');
  ok(ins && isImgOnly20(ins.newText), '20c. 该段被判为「纯图片段」，界面走格栅而不是套 <p>');
}

// ── 21. 图片 token 不会被切碎，也不会污染正则状态 ──
{
  const IMG = 'data:image/png;base64,TOKTOK';
  const [p] = htmlToParagraphs(`<p><img src="${IMG}"></p>`);
  const toks = tokenize(p);
  ok(
    toks.length === 1 && new RegExp(`^${NUL}IMG:[0-9a-f]{8}${NUL}$`).test(toks[0]),
    '21a. ★ 图片 token 整体作为一个切分单位，不被拆成 5 段碎屑'
  );
  ok(
    pd.isImgOnly(p) === true && pd.isImgOnly(p) === true,
    '21b. ★ isImgOnly 连调两次结果一致（带 g 的正则会在第二次调用时误判）'
  );
  ok(pd.isImgOnly('有字' + p) === false, '21c. 图文混排的段落不算纯图片段');
  const segs = pd.splitImgTokens(p, { [toks[0].slice(5, 13)]: { src: IMG, alt: '' } });
  ok(
    segs.some(s => s.t === 'img' && s.src === IMG),
    '21d. splitImgTokens 能把 token 换回 <img src>'
  );
  ok(segs.some(s => s.t === 'text') === false, '21e. 纯 token 段落不产生多余空文本片段');
}

// ── 22. 无 DOM 降级：仍返回 images/slots 结构，不崩 ──
{
  const ex = pd.htmlToParagraphsEx('<p>a</p><p><img src="data:x"></p>');
  ok(
    Array.isArray(ex.slots) && ex.slots.length === ex.paragraphs.length,
    '22a. slots 与 paragraphs 长度对齐（界面按索引查表）'
  );
  ok(typeof ex.images === 'object', '22b. images 恒为对象，界面无需判空');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
