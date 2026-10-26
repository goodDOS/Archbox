/**
 * 编辑态页头按钮专项回归（Beta.325，对应用户需求「另存为前加预览按钮、预览前加页内搜索按钮」）。
 *
 * 【为什么单独一场】本轮是「在既有页头上加两枚按钮 + 一个弹层」的增量改动：
 *   · 页内搜索按钮从工具栏移除（Beta.325）后，编辑态入口一度只剩 Ctrl+F，
 *     用户明确要求把入口搬回页头（预览按钮之前）；
 *   · 预览按钮渲染的是「正在编辑、尚未保存」的内容，与历史版本预览
 *     （previewVer，落库快照）是两份数据，不能共用同一个弹层状态；
 *   · 净化链路必须与查看态同源（safeHtml + markSelectableMedia），
 *     否则弹层成了 XSS 旁路。这类回归不报编译错，只能靠静态断言盯住。
 *
 * 覆盖：
 *   [1] 编辑态页头：页内搜索按钮（findOpen + search 图标 + findInPage 双 key）
 *   [2] 编辑态页头：预览按钮（editPreviewOpen + eye 图标 + previewEditTip）
 *   [3] 顺序：搜索 → 预览 → 保存组（另存为/保存）
 *   [4] 编辑预览弹层：独立状态、title/icon、pv 形制、note、不带 data-find-scope
 *   [5] script：状态与净化链路声明齐全
 *   [6] i18n：新 key 14 语言同步 + 繁体逐字转写
 *   [7] 查看态注释已随 Beta.325 更新（旧注释声称「编辑态不设此按钮」）
 *
 * 运行：node electron/verify/editor-head-buttons.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { toTw } from './tw-han-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
}

const postView = read('src/pages/PostView.vue');
const tpl = postView.slice(0, postView.indexOf('<script setup>'));
const codeOnly = postView
  .slice(postView.indexOf('<script setup>'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* 编辑态页头段：v-else 分支的 .page-head（查看态那枚带 sticky-head 类，不会误命中）
   到保存组之前。按钮断言只在这段里比，避免与查看态页头（也有 search 按钮）串味。 */
const headStart = tpl.indexOf('<div class="page-head">');
const saveGroupPos = tpl.indexOf('<div class="save-group">');
const editHead = tpl.slice(headStart, saveGroupPos);
/* 编辑预览弹层段：Beta.325 注释锚点到版本对比注释之前 */
const modalStart = tpl.indexOf('<!-- 编辑内容预览（Beta.325');
const modalEnd = tpl.indexOf('<!-- 版本对比（只读并排）');
const previewModal = tpl.slice(modalStart, modalEnd);
/* 负向断言（「不碰 X」「不带 Y」）必须在剥掉注释的绑定段上测：
   注释里会字面提到被否定的对象（如「刻意不带 data-find-scope」），
   直接在原文上测会被自己的设计文档误伤（Beta.325 实测踩过）。 */
const modalBind = previewModal.replace(/<!--[\s\S]*?-->/g, '');

console.log('[1] 编辑态页头：页内搜索按钮（Beta.325 从工具栏移除后迁回此处）');
{
  ok(headStart > 0 && saveGroupPos > headStart, '编辑态页头段可定位（page-head → save-group）');
  ok(/@click="findOpen"/.test(editHead), '编辑态页头有 findOpen 按钮');
  ok(/name="search"/.test(editHead), '搜索图标为 search（与查看态同款）');
  ok(/:title="t\('post\.findInPageTitle'\)"/.test(editHead), 'title 走 post.findInPageTitle');
  ok(/:aria-label="t\('post\.findInPageAria'\)"/.test(editHead), 'aria-label 走 post.findInPageAria');
}

console.log('[2] 编辑态页头：预览按钮（另存为之前）');
{
  ok(/@click="editPreviewOpen = true"/.test(editHead), '编辑态页头有预览按钮，开编辑预览态');
  ok(/name="eye"/.test(editHead), '预览图标为 eye');
  ok(/:title="t\('post\.previewEditTip'\)"/.test(editHead), 'title 走 post.previewEditTip（悬停说明）');
  ok(/:aria-label="t\('common\.preview'\)"/.test(editHead), 'aria-label 复用 common.preview（名称不新造 key）');
  // 预览同为读操作，不绑 disabled
  ok(!/:disabled/.test(editHead), '编辑态页头两枚新按钮均不绑 disabled（读操作，只读态可用）');
  // 纯图标按钮双线索：standardize 全局扫描兜底，这里再盯一次编辑态局部
  const iconBtns = editHead.match(/class="btn btn-icon"[\s\S]*?<\/button>/g) || [];
  ok(
    iconBtns.every(b => /:title="t\(/.test(b) && /:aria-label="t\(/.test(b)),
    `编辑态页头 ${iconBtns.length} 个纯图标按钮 title/aria-label 全部走 t()`
  );
}

console.log('[3] 顺序：搜索 → 预览 → 保存组');
{
  const searchPos = editHead.indexOf('@click="findOpen"');
  const previewPos = editHead.indexOf('@click="editPreviewOpen = true"');
  ok(searchPos > 0 && previewPos > searchPos, `搜索在预览之前（search@${searchPos} < preview@${previewPos}）`);
  ok(previewPos < editHead.length, '预览在保存组之前（本段截到 save-group 即止）');
  // 保存组内部仍是「另存为 → 保存」（Beta.324 形制不因新增按钮而变）
  ok(/post\.saveAs/.test(tpl.slice(saveGroupPos, saveGroupPos + 2000)), '保存组仍含另存为下拉');
}

console.log('[4] 编辑预览弹层：独立状态 + 同源净化 + pv 形制');
{
  ok(modalStart > 0 && modalEnd > modalStart, '编辑预览弹层段可定位');
  ok(/v-if="editPreviewOpen"/.test(previewModal), '弹层开关是 editPreviewOpen（不复用 previewVer 快照态）');
  ok(!/previewVer/.test(modalBind), '弹层绑定不碰历史版本快照状态（两份数据互不污染）');
  ok(/:title="t\('common\.preview'\)"/.test(previewModal), '标题为「预览」');
  ok(/icon="eye"/.test(previewModal), '图标为 eye（与触发按钮一致）');
  ok(/v-html="editPreviewHtml"/.test(previewModal), '正文渲染 editPreviewHtml');
  ok(/class="pv-body post-content"/.test(previewModal), '正文容器复用 pv-body + post-content（与查看态正文同样式）');
  // 查找范围口径：编辑态查找恒为「正在编辑的内容」（editFind 扫 .edit-layout，
  // 不读 data-find-scope），弹层是正文静态副本，圈进去只会误导
  ok(!/data-find-scope/.test(modalBind), '弹层刻意不带 data-find-scope（编辑态查找不按容器圈范围）');
  ok(/t\('post\.editPreviewNote'\)/.test(previewModal), '底部说明走 post.editPreviewNote');
  ok(
    /requestClose/.test(previewModal) && /t\('common\.close'\)/.test(previewModal),
    '关闭走 requestClose（先播退场动画）'
  );
  // 元信息行 = 即将保存的值（表单当前选中），不是页头徽章口径
  ok(/editPreviewRegionName/.test(previewModal), '大区名按表单当前值（用户切了大区，预览必须跟着变）');
  ok(/editPreviewCatName/.test(previewModal), '分类名按表单当前值');
  ok(/editPreviewRegionColor/.test(previewModal), '大区色点按表单当前值');
  ok(!/regionName \|\|/.test(modalBind), '元信息行不直接用页头徽章的 regionName');
}

console.log('[5] script：状态与净化链路声明齐全');
{
  ok(/const editPreviewOpen = ref\(false\)/.test(codeOnly), 'editPreviewOpen 状态声明');
  ok(
    /const editPreviewHtml = computed\(\(\) => markSelectableMedia\(safeHtml\(contentHtml\.value\)\)\)/.test(codeOnly),
    'editPreviewHtml = safeHtml + markSelectableMedia（与查看态 renderedHtml 同源，防 XSS 旁路）'
  );
  ok(/function closeEditPreview\(\)/.test(codeOnly), 'closeEditPreview 存在（@close 接线）');
  ok(/const editPreviewRegionName = computed/.test(codeOnly), 'editPreviewRegionName computed');
  ok(/const editPreviewCatName = computed/.test(codeOnly), 'editPreviewCatName computed');
  ok(/const editPreviewRegionColor = computed/.test(codeOnly), 'editPreviewRegionColor computed');
  // 预览数据源必须实时跟随编辑器，不能是进入编辑时的静态副本
  ok(
    /contentHtml\.value = editor\.value \? editor\.value\.getHTML\(\) : ''/.test(codeOnly),
    'onUpdate 实时刷新 contentHtml（预览所见即所编）'
  );
}

console.log('[6] i18n：新 key 14 语言同步 + 繁体逐字转写');
{
  const fresh = ['previewEditTip', 'editPreviewNote'];
  /* 语言清单从 LANGS 派生（单一来源），不写死数量 —— 见 editor-toolbar 同名注释 */
  const LANGS = [
    ...read('src/i18n/index.js')
      .match(/export const LANGS = \[([\s\S]*?)\];/)[1]
      .matchAll(/key:\s*'([^']+)'/g)
  ].map(m => m[1]);
  const langs = readdirSync(path.join(ROOT, 'src/i18n/parts'))
    .map(f => /^post\.(.+)\.js$/.exec(f))
    .filter(Boolean)
    .map(m => m[1]);
  ok(
    LANGS.every(l => langs.includes(l)) && langs.length === LANGS.length,
    `post 域语言包与 LANGS 一致（${LANGS.length} 语，磁盘 ${langs.length} 个）`
  );
  /* Beta.324 时 it/es 走渐进补齐（standardize 的 PARTIAL_LANGS），post 域整块回退中文；
   * 现已补齐全部业务域，豁免取消，逐语核对。 */
  for (const lang of langs) {
    const txt = read(`src/i18n/parts/post.${lang}.js`);
    const miss = fresh.filter(k => !new RegExp(`\\b${k}:`).test(txt));
    ok(miss.length === 0, `${lang}：新 key 齐全${miss.length ? `（缺 ${miss}）` : ''}`);
  }
  const zhCN = (await import(path.join(ROOT, 'src/i18n/parts/post.zh-CN.js'))).default;
  const zhTW = (await import(path.join(ROOT, 'src/i18n/parts/post.zh-TW.js'))).default;
  for (const k of fresh) {
    ok(zhTW[k] === toTw(zhCN[k]), `${k}：繁体逐字转写一致（${zhTW[k]}）`);
  }
}

console.log('[7] 查看态注释已随 Beta.325 更新');
{
  // 旧注释声称「编辑态不设此按钮」，与 Beta.325 新决策矛盾，必须改写而非留着误导
  ok(!/编辑态不设此按钮/.test(postView), '「编辑态不设此按钮」旧注释已清除');
  ok(/Beta\.325（用户需求「预览前加页内搜索按钮」）/.test(postView), '查看态查找按钮注释已记录 Beta.325 决策变化');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
