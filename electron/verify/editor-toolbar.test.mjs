/**
 * 编辑工具栏重构专项回归（Beta.325，对应用户七点要求）。
 *
 * 【为什么单独一场】工具栏是「删功能 + 改顺序 + 换图标 + 加能力」的混合改动，
 *   且其中「禁止插入链接」必须从 schema 层根除——只删按钮的话，
 *   粘贴网页里的 <a> 照样能在正文里造出链接标记。这类回归不报编译错，
 *   只能靠静态断言盯住。
 *
 * 覆盖：
 *   [1] 页内查找按钮已从工具栏移除（查看态页头入口仍在）
 *   [2] 行内代码按钮已移除（Code 标记保留在 schema，存量内容照常渲染）
 *   [3] 禁止插入链接：StarterKit link:false，且无任何链接命令/浮层/图标残留
 *   [4] emoji 位于插入图片之前
 *   [5] 分组顺序符合主流文字工具（撤销 → 字号/行内 → 字色高亮 → 段落 → 插入 → 清除）
 *   [6] 颜色/高亮图标为 WPS/Office 样式（FontColorsOutlined + 荧光笔）
 *   [7] 字号框显示当前字号且可自定义（Dropdown triggerLabel + #extra 插槽）
 *   [8] 失效 i18n key 已从 14 语言全部移除，新 key 三语同增
 *
 * 运行：node electron/verify/editor-toolbar.test.mjs
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
const dropdown = read('src/components/Dropdown.vue');
const colorPicker = read('src/components/ColorPicker.vue');
const icons = read('scripts/gen-icons.mjs');

/* 工具栏模板段（editor-toolbar 开 div 到紧随其后的 EditorContent 之前）——
   顺序断言只在这段里比，避免与查看态页头（也有查找/保存等按钮）串味。
   不能按 </div> 配对截取：下拉的 #extra 插槽里也有 div，第一个 </div>
   会把工具栏拦腰截断（Beta.325 实测踩过）。 */
const tbStart = tpl.indexOf('<div class="editor-toolbar">');
const toolbar = tpl.slice(tbStart, tpl.indexOf('<EditorContent'));

console.log('[1] 页内查找按钮：工具栏已移除，查看态入口保留');
{
  ok(!/@click="findOpen"/.test(toolbar), '工具栏内不再有 findOpen 按钮');
  ok(!/name="search"/.test(toolbar), '工具栏内不再有 search 图标');
  // 查看态页头（v-if="!editing" 分支）仍保留查找按钮，Ctrl+F 之外的点击路径不断
  ok(/@click="findOpen"/.test(tpl), '查看态页头仍保留页内查找按钮（点击路径）');
  ok(/findOpen/.test(codeOnly), 'findOpen 函数仍在（编辑态 Ctrl+F 与查看态共用）');
}

console.log('[2] 行内代码按钮：已移除，Code 标记保留在 schema');
{
  ok(!/isOn\('code'\)/.test(toolbar), '工具栏无行内代码按下态');
  ok(!/TB\.code\b/.test(toolbar), '工具栏无行内代码命令');
  ok(!/^\s*code:/.test(codeOnly), 'TB 对象无 code 命令');
  ok(!/name="code"/.test(tpl), '模板无 code 图标引用');
  // StarterKit 的 Code 标记不摘：存量正文的行内代码要照常渲染（清除格式可去标记）
  ok(!/code:\s*false/.test(codeOnly), 'StarterKit 未摘 Code 标记（存量内容兼容）');
  ok(/toggleCodeBlock\(/.test(codeOnly), '代码块按钮保留（块级代码不受影响）');
}

console.log('[3] 禁止插入链接：schema 层根除 + 零残留');
{
  ok(/StarterKit\.configure\(\{\s*link:\s*false/.test(codeOnly), 'StarterKit 显式 link:false（扩展不注册）');
  ok(!/setLink\(/.test(codeOnly), '无 setLink 调用');
  ok(!/unsetLink\(/.test(codeOnly), '无 unsetLink 调用');
  ok(!/isOn\('link'\)/.test(tpl), '模板无 link 按下态');
  ok(!/onLinkBtn|applyLink|linkPop|linkUrl/.test(codeOnly), '链接按钮/浮层状态与函数整段移除');
  ok(!/tb-link-pop|tb-link-input/.test(postView), '链接浮层样式已删');
  ok(!/computeFixedPosition/.test(codeOnly), '随浮层移除的定位 import 已清（本文件不再自算弹层坐标）');
  // 图标也不留死数据
  ok(!/^\s*link:/m.test(icons) && !/^\s*unlink:/m.test(icons), 'link/unlink 图标已从生成清单下架');
  const iconData = (await import(path.join(ROOT, 'src/components/icon-antd.js'))).ICONS;
  ok(!iconData.link && !iconData.unlink, '产物 icon-antd.js 无 link/unlink');
}

console.log('[4] emoji 在插入图片之前');
{
  const emojiPos = toolbar.indexOf('<EmojiPicker');
  const imgPos = toolbar.indexOf('name="image"');
  ok(emojiPos > 0 && imgPos > 0, '工具栏同时含 emoji 与图片按钮');
  ok(emojiPos < imgPos, `emoji 位于图片之前（emoji@${emojiPos} < image@${imgPos}）`);
}

console.log('[5] 分组顺序符合主流文字工具（Word「开始」tab 同构）');
{
  /* 顺序：撤销/重做 → 字号 → 行内格式 → 字色/高亮 → 段落块级 → 对齐 → 插入 → 清除格式 */
  const at = s => toolbar.indexOf(s);
  const order = [
    ['撤销', at('TB.undo')],
    ['字号', at('curFontSize')],
    ['行内-粗', at('TB.bold')],
    ['字色', at('purpose="text"')],
    ['段落-H1', at('TB.h1')],
    ['段落-列表', at('TB.ul')],
    ['对齐', at('curAlign')],
    ['插入-emoji', at('<EmojiPicker')],
    ['插入-图片', at('name="image"')],
    ['清除格式', at('TB.clearFormat')]
  ];
  const allFound = order.every(([, pos]) => pos > 0);
  ok(allFound, `十个锚点全部找到（${order.map(([n, p]) => `${n}:${p}`).join(' ')}）`);
  let mono = true;
  for (let i = 1; i < order.length; i++) if (order[i][1] < order[i - 1][1]) mono = false;
  ok(mono, '按撤销→字号→行内→字色→段落→对齐→插入→清除 单调排列');
  // 分组竖线数量 = 组数 - 1（撤销 │ 字号+行内 │ 字色高亮 │ 段落+对齐 │ 插入 │ 清除 = 5 条）
  const seps = (toolbar.match(/class="tb-sep"/g) || []).length;
  ok(seps === 5, `分组竖线 5 条（实际 ${seps}）`);
}

console.log('[6] 颜色/高亮图标为 WPS / Office 样式');
{
  ok(
    /'text-color':\s*\['antd',\s*'FontColorsOutlined'\]/.test(icons),
    '文字颜色用 AntD FontColorsOutlined（Office 原形：A+厚色条）'
  );
  ok(/(^|\n)\s*highlight: \['lucide', 'highlighter'\]/.test(icons), '高亮用 Lucide 荧光笔（WPS 突出显示笔形）');
  const iconData = (await import(path.join(ROOT, 'src/components/icon-antd.js'))).ICONS;
  const baseline = iconData['text-color'];
  ok(baseline && baseline.s === 'fill', 'text-color 为填充形（AntD 系）');
  // 图形不得与任何其它图标重复（生成期已断言，这里再盯一次防回归）
  const sig = JSON.stringify(baseline.ch);
  const dup = Object.entries(iconData).filter(([k, v]) => k !== 'text-color' && JSON.stringify(v.ch) === sig);
  ok(dup.length === 0, `FontColorsOutlined 不与其它图标同图（撞：${dup.map(d => d[0]).join('、') || '无'}）`);
  // 文字颜色不再另接色条（图标自带），高亮仍接色条（棋盘格表「无」）
  ok(/compact && purpose === 'highlight'/.test(colorPicker), '色条只挂在 highlight 用途上');
  ok(/cp-bar-unset/.test(colorPicker), '高亮未设置时棋盘格表示透明');
  ok(!/cp-bar-text/.test(colorPicker), '文字颜色的旧「下划线形」色条类已删（不再双条）');
}

console.log('[7] 字号框：显示当前字号 + 可自定义');
{
  ok(/triggerLabel:\s*\{\s*type:\s*String/.test(dropdown), 'Dropdown 新增 triggerLabel 属性');
  ok(/v-else-if="triggerLabel"/.test(dropdown), '触发器渲染 triggerLabel 覆盖层');
  ok(/:trigger-label="fontSizeTriggerLabel"/.test(tpl), '字号下拉传入当前字号');
  ok(
    /const fontSizeTriggerLabel = computed\(\(\) => curFontSize\.value \|\| t\('post\.fontSizeDefault'\)\)/.test(
      codeOnly
    ),
    '触发器文字 = 当前字号或「默认字号」'
  );
  // 选项改数字（不再是小号/正常/大号语义名）
  ok(/\{ value: '12px' \}/.test(codeOnly) && /\{ value: '20px' \}/.test(codeOnly), '预设选项标像素值');
  ok(!/fontSizeSmall|fontSizeNormal|fontSizeLarge|fontSizeXLarge/.test(codeOnly), '代码不再引用四档语义名 key');
  // 自定义行：#extra 插槽 + 钳制
  ok(/<slot name="extra" \/>/.test(dropdown), 'Dropdown 弹出层提供 #extra 插槽');
  ok(/<template #extra>/.test(tpl), '字号下拉挂自定义像素行');
  ok(/applyCustomFontSize/.test(codeOnly), '自定义提交函数存在');
  ok(/FONT_SIZE_MIN = 8/.test(codeOnly) && /FONT_SIZE_MAX = 96/.test(codeOnly), '自定义字号钳制在 8–96 px');
  ok(/clamped !== n/.test(codeOnly), '越界时提示（不静默丢用户输入）');
  ok(/@mousedown\.stop/.test(toolbar), '自定义行截停 mousedown（否则 .dd-popup 的 prevent 会让输入框无法聚焦）');
  // 外部改值即收起弹层（自定义提交后 modelValue 变化 → 关闭）
  ok(/if \(open\.value\) closePopup\(\);/.test(dropdown), 'Dropdown 值被外部改掉时收起弹层');
}

console.log('[8] i18n：失效 key 全清 + 新 key 14 语言同步');
{
  const dead = [
    'tbCode',
    'tbLink',
    'tbUnlink',
    'linkPlaceholder',
    'linkEmpty',
    'tbLinkHint',
    'fontSizeSmall',
    'fontSizeNormal',
    'fontSizeLarge',
    'fontSizeXLarge'
  ];
  const fresh = ['fontSizeCustom', 'fontSizeRange'];
  /* 语言清单从 src/i18n/index.js 的 LANGS 派生（单一来源）：
   * 原先这里写死数量，每加/删一门语言就得回来改一次，且改漏了报错信息还会误导。
   * 实际存在的文件仍单独核对 —— 派生清单与磁盘文件必须对得上。 */
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
  /* Beta.324 时 it/es 曾走「渐进补齐」（standardize 的 PARTIAL_LANGS），
   * post 域整块回退中文，故当时豁免了这两门语言。
   * 现在 9 个业务域均已补齐，豁免随之取消 —— 全语言逐语核对，缺一个就会露 raw key。 */
  for (const lang of langs) {
    const txt = read(`src/i18n/parts/post.${lang}.js`);
    const left = dead.filter(k => new RegExp(`\\b${k}:`).test(txt));
    const miss = fresh.filter(k => !new RegExp(`\\b${k}:`).test(txt));
    ok(
      left.length === 0 && miss.length === 0,
      `${lang}：失效 key 已清、新 key 齐全${left.length ? `（残留 ${left}）` : ''}${miss.length ? `（缺 ${miss}）` : ''}`
    );
  }
  // 繁体逐字转写口径：新 key 也必须满足 zh-TW = toTw(zh-CN)
  const zhCN = (await import(path.join(ROOT, 'src/i18n/parts/post.zh-CN.js'))).default;
  const zhTW = (await import(path.join(ROOT, 'src/i18n/parts/post.zh-TW.js'))).default;
  for (const k of fresh) {
    ok(zhTW[k] === toTw(zhCN[k]), `${k}：繁体逐字转写一致（${zhTW[k]}）`);
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
