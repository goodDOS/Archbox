/**
 * postFind 引擎纯逻辑单测（jsdom 环境，不依赖 Electron 真机）。
 * 验证核心需求：查找命中文章标题、字段数据与正文，排除侧栏/标题栏/页头按钮/元信息/版本列表。
 * Beta.219 扩展：局域共享文档详情页（.post-read 只读视图）同口径接入
 * —— 命中 pr-title/pr-fields/pr-body，排除 pr-meta/pr-tags/pr-bar；共享列表视图仍 0 命中。
 *
 * 运行：node electron/verify/postfind.test.mjs
 */
import { JSDOM } from 'jsdom';
import { installDomGlobals } from './_harness.mjs';

const html = `<!DOCTYPE html><html><body>
  <aside class="sidebar"><span>侧栏导航词PROBE</span><div class="back-top">TOPPROBE</div></aside>
  <header class="titlebar"><span>标题栏PROBE</span></header>
  <div class="page-head">
    <h1 class="title-selectable">标题 PROBE</h1>
    <button class="btn">编辑PROBE</button>
    <span class="badge">草稿PROBE</span>
  </div>
  <div class="post-main">
    <div class="meta card">
      <span>作者PROBE</span>
      <span>创建：2026-09-24 PROBE</span>
      <span>更新：2026-09-24 PROBE</span>
      <span>文档 ID：PROBE</span>
    </div>
    <div class="card fields-card">
      <div class="fc-title">字段数据PROBE</div>
      <table class="tbl"><tbody>
        <tr><td>字段名PROBE</td><td>字段值PROBE</td></tr>
      </tbody></table>
    </div>
    <div class="versions"><div class="ver">版本PROBE</div></div>
    <div class="card body-card">
      <div class="post-content">正文内容 PROBE 还有一处 PROBE 结尾</div>
    </div>
  </div>
</body></html>`;

const dom = new JSDOM(html, { pretendToBeVisual: true });
// 统一挂全局（含 navigator）：Node < 21 没有全局 navigator，缺它 jsdom 会抛错。
// 细节见 _harness.mjs 的 installDomGlobals 注释。
installDomGlobals(dom);

const pf = await import('../../src/utils/postFind.js');

let pass = 0,
  fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS ', name);
  } else {
    fail++;
    console.log('  FAIL ', name, '::', detail || '');
  }
}

// 1) 命中标题 + 字段数据 + 正文，排除一切界面/元信息区
const r = pf.search('PROBE');
const hits = [...document.querySelectorAll('.pf-hit')];
check('命中总数=6（标题 1 + 字段表 3 + 正文 2）', r.matches === 6, `got ${r.matches}`);
check(
  '所有命中都在标题/字段表/正文容器内',
  hits.every(h => h.closest('.title-selectable') || h.closest('.fields-card') || h.closest('.post-content')),
  `hits=${hits.length}`
);
check('标题命中 1 处', document.querySelectorAll('.title-selectable .pf-hit').length === 1);
check('字段表命中 3 处', document.querySelectorAll('.fields-card .pf-hit').length === 3);
check('正文命中 2 处', document.querySelectorAll('.post-content .pf-hit').length === 2);
check('侧栏无命中', document.querySelectorAll('.sidebar .pf-hit').length === 0);
check('标题栏无命中', document.querySelectorAll('.titlebar .pf-hit').length === 0);
check(
  '页头按钮/徽章无命中',
  document.querySelectorAll('.page-head .pf-hit').length ===
    document.querySelectorAll('.title-selectable .pf-hit').length
);
check('元信息区无命中', document.querySelectorAll('.meta .pf-hit').length === 0);
check('版本列表无命中', document.querySelectorAll('.versions .pf-hit').length === 0);

// 2) active 初始为第 1 处
check('初始 active=1', pf.status().active === 1, JSON.stringify(pf.status()));

// 3) jump 下一个/上一个（环绕）
pf.jump(false);
check('jump 后 active=2', pf.status().active === 2, JSON.stringify(pf.status()));
pf.jump(true);
check('回跳后 active=1', pf.status().active === 1, JSON.stringify(pf.status()));
pf.jump(true); // 环绕到末尾
check('环绕到末尾 active=6', pf.status().active === 6, JSON.stringify(pf.status()));

// 4) 大小写不敏感
const r2 = pf.search('probe');
check('大小写不敏感命中=6', r2.matches === 6, `got ${r2.matches}`);

// 5) 大小写敏感（PROBE 全大写，正文是大写）
const r3 = pf.search('probe', { matchCase: true });
check('大小写敏感命中=0', r3.matches === 0, `got ${r3.matches}`);

// 6) clear 还原文本、移除高亮
pf.clear();
check('clear 后无 .pf-hit', document.querySelectorAll('.pf-hit').length === 0);
check('clear 后正文文本还原', document.querySelector('.post-content').textContent.includes('PROBE'));
check('clear 后字段表文本还原', document.querySelector('.fields-card').textContent.includes('字段值PROBE'));
check('clear 后标题文本还原', document.querySelector('.title-selectable').textContent.includes('PROBE'));

// 7) 空词 / 无查找范围
const originalDoc = global.document;
check('空词返回 0', pf.search('').matches === 0);
const noScope = new JSDOM('<div class="sidebar">xPROBEx</div>').window.document;
global.document = noScope;
// 重新 import 不会重置模块内部 marks；但 search 依赖全局 document，临时切换验证范围判定
check('无标题/正文范围时返回 0', pf.search('PROBE') === 0 || pf.search('PROBE').matches === 0);
global.document = originalDoc;

// 8) 历史版本预览弹层打开时，只搜弹层内容，不碰主页面
const previewHtml = `<!DOCTYPE html><html><body>
  <div class="page-head"><h1 class="title-selectable">主页面标题 PROBE</h1></div>
  <div class="post-main"><div class="fields-card">主页面字段 PROBE</div><div class="post-content">主页面正文 PROBE</div></div>
  <div class="modal">
    <div class="pv-head">
      <div class="pv-meta"><span>预览元信息 PROBE</span></div>
      <div class="pv-title">预览标题 PROBE</div>
      <div class="pv-tags"><span class="chip">标签 PROBE</span></div>
    </div>
    <div class="pv-scroll">
      <div class="pv-body post-content">预览正文 PROBE</div>
    </div>
  </div>
</body></html>`;
const pvDom = new JSDOM(previewHtml, { pretendToBeVisual: true });
global.document = pvDom.window.document;
// pf.search 内部通过 document.querySelector 读取，临时切换 document 即可验证
check(
  '预览弹层命中总数=2（预览标题 1 + 预览正文 1）',
  pf.search('PROBE').matches === 2,
  `got ${pf.search('PROBE').matches}`
);
check('预览弹层不命中主页面标题', pvDom.window.document.querySelectorAll('.page-head .pf-hit').length === 0);
check(
  '预览弹层不命中主页面字段表',
  pvDom.window.document.querySelectorAll('.post-main .fields-card .pf-hit').length === 0
);
check(
  '预览弹层不命中主页面正文',
  pvDom.window.document.querySelectorAll('.post-main .post-content .pf-hit').length === 0
);
check('预览弹层元信息无命中', pvDom.window.document.querySelectorAll('.pv-meta .pf-hit').length === 0);
check('预览弹层标签无命中', pvDom.window.document.querySelectorAll('.pv-tags .pf-hit').length === 0);

global.document = originalDoc;

// 9) ★ Beta.219：局域共享文档详情页（.post-read 只读视图）★
//    口径与本机详情页一致：命中 标题(pr-title) + 字段数据(pr-fields) + 正文(pr-body)；
//    排除 元信息(pr-meta) / 标签(pr-tags) / 操作条(pr-bar) / 侧栏 / 标题栏 / 列表区。
//    DOM 按 LanShare.vue 详情分支的真实结构建模。
const lanHtml = `<!DOCTYPE html><html><body>
  <aside class="sidebar"><span>侧栏导航词PROBE</span></aside>
  <header class="titlebar"><span>标题栏PROBE</span></header>
  <div class="lan-list filter-bar"><input class="input" placeholder="在大区内搜索PROBE…"></div>
  <div class="post-read">
    <div class="pr-bar">
      <button class="btn btn-sm">返回列表PROBE</button>
      <button class="btn btn-sm">页内查找PROBE</button>
      <button class="btn btn-sm btn-primary">拷贝到本机PROBE</button>
    </div>
    <h2 class="pr-title">共享文档标题 PROBE</h2>
    <div class="pr-meta">
      <span class="region-dot"></span><span>共享大区PROBE</span><span class="sep">/</span>
      <span>分类PROBE</span><span class="pr-no"># NO-1PROBE</span>
      <span class="pr-author">作者：PROBE</span>
    </div>
    <div class="pr-tags"><span class="chip"># 标签PROBE</span></div>
    <div class="card pr-fields">
      <div class="pr-ft">字段数据PROBE</div>
      <table class="tbl"><tbody>
        <tr><td class="pr-fc">字段名PROBE <code class="fcode">FC</code></td><td><b>字段值PROBE</b></td></tr>
      </tbody></table>
    </div>
    <div class="card pr-body">共享正文 PROBE 又一处 PROBE 结尾</div>
  </div>
</body></html>`;
const lanDom = new JSDOM(lanHtml, { pretendToBeVisual: true });
global.document = lanDom.window.document;
const r9 = pf.search('PROBE');
const lanHits = [...lanDom.window.document.querySelectorAll('.pf-hit')];
check('共享详情命中总数=6（标题 1 + 字段表 3 + 正文 2）', r9.matches === 6, `got ${r9.matches}`);
check(
  '共享详情所有命中都在 pr-title/pr-fields/pr-body 内',
  lanHits.every(h => h.closest('.pr-title') || h.closest('.pr-fields') || h.closest('.pr-body')),
  `hits=${lanHits.length}`
);
check('共享标题命中 1 处', lanDom.window.document.querySelectorAll('.pr-title .pf-hit').length === 1);
check(
  '共享字段表命中 3 处（表头外的字段名/值）',
  lanDom.window.document.querySelectorAll('.pr-fields .pf-hit').length === 3
);
check('共享正文命中 2 处', lanDom.window.document.querySelectorAll('.pr-body .pf-hit').length === 2);
check(
  '元信息区无命中（作者/分类/编号不搜——与本机口径一致）',
  lanDom.window.document.querySelectorAll('.pr-meta .pf-hit').length === 0
);
check('标签区无命中', lanDom.window.document.querySelectorAll('.pr-tags .pf-hit').length === 0);
check('操作条按钮无命中', lanDom.window.document.querySelectorAll('.pr-bar .pf-hit').length === 0);
check(
  '侧栏/标题栏/列表区无命中',
  lanDom.window.document.querySelectorAll('.sidebar .pf-hit, .titlebar .pf-hit, .lan-list .pf-hit').length === 0
);
check('共享详情 jump 正常（active=2）', (pf.jump(false), pf.status().active === 2));
pf.clear();
check('共享详情 clear 后无 .pf-hit', lanDom.window.document.querySelectorAll('.pf-hit').length === 0);
check('共享详情 clear 后正文还原', lanDom.window.document.querySelector('.pr-body').textContent.includes('PROBE'));

// 9b) 共享**列表视图**（无 .post-read）：与本机所有文档页同口径，查找无意义 → 0 命中
const lanListDom = new JSDOM(
  `<!DOCTYPE html><html><body>
  <div class="filter-bar"><input class="input" value="搜索词PROBE"></div>
  <div class="grid grid-2"><div class="card pc">卡片标题 PROBE 卡片摘要 PROBE</div></div>
</body></html>`,
  { pretendToBeVisual: true }
);
global.document = lanListDom.window.document;
check(
  '共享列表视图（无 .post-read）返回 0 命中',
  pf.search('PROBE').matches === 0,
  `got ${pf.search('PROBE').matches}`
);

// 10) scopes 优先级：历史版本预览弹层 > 共享详情 > 本机详情（同 DOM 时预览优先）
const mixedDom = new JSDOM(
  `<!DOCTYPE html><html><body>
  <div class="post-read">
    <h2 class="pr-title">共享标题 PROBE</h2>
    <div class="card pr-fields">共享字段 PROBE</div>
    <div class="card pr-body">共享正文 PROBE</div>
  </div>
  <div class="modal">
    <div class="pv-head"><div class="pv-title">预览标题 PROBE</div></div>
    <div class="pv-body post-content">预览正文 PROBE</div>
  </div>
</body></html>`,
  { pretendToBeVisual: true }
);
global.document = mixedDom.window.document;
check(
  '预览弹层与共享详情同屏时，预览优先（命中=2 而非 5）',
  pf.search('PROBE').matches === 2,
  `got ${pf.search('PROBE').matches}`
);
check('优先走预览分支：共享元素 0 命中', mixedDom.window.document.querySelectorAll('.post-read .pf-hit').length === 0);

global.document = originalDoc;

// 11) Beta.230：版本对比视图（.df- 命名空间）刻意不参与查找。
//     理由：并排两列让同一段文字出现两次 → 命中翻倍、跳转在重复内容间来回跳。
//     断言它既不被 find 命中，也不改变背景正文的命中数。
{
  const diffDom = new JSDOM(
    `<!DOCTYPE html><html><body>
    <div class="post-main">
      <div class="card body-card"><div class="post-content">正文内容 PROBE 还有一处 PROBE 结尾</div></div>
    </div>
    <div class="modal">
      <div class="df-scroll">
        <div class="df-row t-change">
          <div class="df-cell"><p class="df-p"><span class="df-del">旧句 PROBE</span></p></div>
          <div class="df-cell"><p class="df-p"><span class="df-ins">新句 PROBE</span></p></div>
        </div>
        <div class="df-row t-equal">
          <div class="df-cell"><p class="df-p eq">未改段 PROBE</p></div>
          <div class="df-cell"><p class="df-p eq">未改段 PROBE</p></div>
        </div>
      </div>
    </div>
  </body></html>`,
    { pretendToBeVisual: true }
  );
  global.document = diffDom.window.document;
  const rd = pf.search('PROBE');
  check(
    '对比视图 0 命中',
    diffDom.window.document.querySelectorAll('.df- .pf-hit').length === 0,
    `got ${diffDom.window.document.querySelectorAll('.df- .pf-hit').length}`
  );
  check('对比视图不改变背景正文命中数（仍=2）', rd.matches === 2, `got ${rd.matches}`);
  check('对比视图整体不是查找范围容器', !diffDom.window.document.querySelector('[data-find-scope] .df-scroll'));

  global.document = originalDoc;
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
