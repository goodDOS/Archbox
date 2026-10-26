/**
 * 图标数据生成：从两个开源图标库提取本项目用到的图标，产出 src/components/icon-antd.js。
 *
 * ★ 为什么是两个库 ★
 *   用户原话：「其实图标不是必须局限阿里的，最重要是匹配」。
 *   Ant Design（阿里，MIT）覆盖面广，但**缺**一批编辑器专用语义形
 *   （H1/H2 区分、正文 pilcrow、引号、吸管、上下标、行内代码 vs 代码块…）。
 *   这些缺位上一版用「形近替代」硬顶，结果 heading-1 与 heading-2 长得一模一样、
 *   code 与 code-block 完全同图、eraser 与 broom 共用同一把刷子 —— 用户一眼看出不对。
 *   结论：以**语义匹配**为唯一标准，Ant Design 命中就用它，缺的从 Lucide（ISC）补。
 *
 * ★ 为什么不直接 import 图标包 ★
 *   运行时依赖白名单严格限定为 sanitize-html + sql.js（用户定下的规矩）；
 *   Electron file:// 离线运行也不该为一个图标背整包。
 *   本脚本只在清单变化时手动跑：node scripts/gen-icons.mjs，产物提交进仓库。
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 图标清单：本项目图标名 → [来源, 库内名称]
 * 来源 'antd' = @ant-design/icons-svg（MIT，填充形，viewBox 64 64 896 896）
 *      'lucide' = lucide-static（ISC，线条形，viewBox 0 0 24 24）
 *
 * 选型原则：**语义匹配优先**。同一概念的多个候选里，取「不看文字也能认出」的那个。
 * 下面带 ★ 的，都是上一版替代错、这次专门换掉的。
 */
const ICONS = {
  /* ── 编辑器：块级格式 ★ 这些是上一版错得最明显的一批 ── */
  'heading-1': ['lucide', 'heading-1'], // ★ 原为 AntD FontSize（H1/H2 同图）→ Lucide H1/H2 可区分
  'heading-2': ['lucide', 'heading-2'], // ★
  pilcrow: ['lucide', 'pilcrow'], // ★ 原为 AntD Profile（竟是列表方框）→ Lucide 真正的 ¶
  quote: ['lucide', 'text-quote'], // ★ 原为对话气泡 → Lucide 引号形
  superscript: ['lucide', 'superscript'], // ★ 原为 VertAlignTop（向上箭头）→ 真正的 x²
  subscript: ['lucide', 'subscript'], // ★ 原为 VertAlignBottom（向下箭头）→ 真正的 x₂
  // Beta.328：行内代码按钮随「工具栏重构」移除（用户要求），Code 标记仍留在
  // StarterKit schema 里（存量正文的行内代码照常渲染、清除格式可去掉标记），
  // 但工具栏不再提供入口，故 code 图标一并下架，避免留死数据。
  'code-block': ['lucide', 'square-code'], // ★ 方框包尖括号，与行内区分（行内按钮已移除，此形保留给代码块）
  eraser: ['lucide', 'eraser'], // ★ 原与 broom 同图 → 真正的橡皮
  broom: ['lucide', 'brush-cleaning'], // ★ 原与 eraser 同图 → 清洁刷
  bold: ['antd', 'BoldOutlined'],
  italic: ['antd', 'ItalicOutlined'],
  underline: ['antd', 'UnderlineOutlined'],
  strikethrough: ['antd', 'StrikethroughOutlined'],
  'list-ul': ['antd', 'UnorderedListOutlined'],
  'list-ol': ['antd', 'OrderedListOutlined'],
  minus: ['antd', 'MinusOutlined'],
  'corner-down-left': ['antd', 'EnterOutlined'],
  'text-size': ['lucide', 'a-large-small'], // 大小两个 A，就是字号的通行画法
  // 文字颜色与高亮原先共用 ColorPicker 里的 ✦ 字符，两个按钮长得一模一样，
  // 用户分不清哪个改字色、哪个刷底色。各给一个语义明确的图标。
  'save-as': ['lucide', 'save-plus'], // 软盘 + 加号 = 另存为（save 是无加号的保存）
  // ★ Beta.328：文字颜色图标改 WPS / Office 样式 —— 粗体 A 下压一条厚色条，
  //   即 Office「字体颜色」按钮的原形（AntD FontColorsOutlined）。
  //   原先用 Lucide baseline（A + 细基线），与工具栏下方另接的色条形成双线，不像 WPS。
  'text-color': ['antd', 'FontColorsOutlined'],
  highlight: ['lucide', 'highlighter'], // 荧光笔 = 高亮（WPS「突出显示」的笔形）
  'face-smile': ['lucide', 'smile'], // emoji 面板入口：笑脸本义（不是「微笑表情」某个具体 emoji）
  'rotate-ccw': ['lucide', 'undo-2'], // 撤销：带箭头的回退（纯半圆弧看不出「撤销」）
  'rotate-cw': ['lucide', 'redo-2'], // 重做：与撤销成对，方向明确
  // Beta.328：link / unlink 随「禁止插入链接」一起下架（StarterKit link:false，
  // 工具栏按钮与地址浮层整段移除，无其它使用点）。

  /* ── 对齐下拉四项：用 Lucide 的 text-align-*（文本对齐专用）。
     注意别用 align-left/center/right/justify —— 那是「对象的对齐」图标（横线长度渐变），
     在文本对齐场景里看不出方向，放大才勉强能分辨。 */
  'align-left': ['lucide', 'text-align-start'],
  'align-center': ['lucide', 'text-align-center'],
  'align-right': ['lucide', 'text-align-end'],
  'align-justify': ['lucide', 'text-align-justify'],

  /* ── 全局导航与常用动作 ── */
  palette: ['lucide', 'palette'], // 调色盘本义（AntD BgColors 是「背景色」方形）
  database: ['antd', 'DatabaseOutlined'],
  lock: ['antd', 'LockOutlined'],
  chart: ['lucide', 'chart-column'], // 三根高低柱，一眼是「统计图表」
  clock: ['antd', 'HistoryOutlined'],
  calendar: ['antd', 'CalendarOutlined'],
  user: ['antd', 'UserOutlined'],
  download: ['antd', 'DownloadOutlined'],
  upload: ['antd', 'UploadOutlined'],
  copy: ['antd', 'CopyOutlined'],
  folder: ['antd', 'FolderOutlined'],
  'folder-open': ['antd', 'FolderOpenOutlined'],
  save: ['antd', 'SaveOutlined'],
  warn: ['antd', 'WarningOutlined'],
  search: ['antd', 'SearchOutlined'],
  plus: ['antd', 'PlusOutlined'],
  settings: ['antd', 'SettingOutlined'],
  image: ['antd', 'PictureOutlined'],
  tag: ['antd', 'TagOutlined'],
  layers: ['lucide', 'layers-3'], // 叠层本义。AntD ClusterOutlined 画的是组织架构图，语义不符
  home: ['antd', 'HomeOutlined'],
  list: ['lucide', 'folder-tree'], // 分类图标（分类挂在某大区下，是层级结构）。
  // ★ 不要用 AntD BarsOutlined —— 它的路径数据与 UnorderedListOutlined 完全相同，
  //   会与编辑器的 list-ul 变成同一个图标。
  display: ['antd', 'DesktopOutlined'],
  eye: ['antd', 'EyeOutlined'],
  'eye-off': ['antd', 'EyeInvisibleOutlined'],
  check: ['antd', 'CheckOutlined'],
  x: ['antd', 'CloseOutlined'],
  info: ['antd', 'InfoCircleOutlined'],
  edit: ['antd', 'EditOutlined'],
  moon: ['antd', 'MoonOutlined'],
  sun: ['antd', 'SunOutlined'],
  refresh: ['antd', 'ReloadOutlined'],
  'arrow-up': ['antd', 'ArrowUpOutlined'],
  'chevron-left': ['antd', 'LeftOutlined'],
  'chevron-right': ['antd', 'RightOutlined'],
  'chevron-down': ['antd', 'DownOutlined'],
  'chevron-up': ['antd', 'UpOutlined'],
  stack: ['antd', 'AppstoreOutlined'],
  file: ['antd', 'FileOutlined'],
  'file-text': ['antd', 'FileTextOutlined'],
  trash: ['antd', 'DeleteOutlined'],
  share: ['antd', 'ShareAltOutlined'],

  /* ★ 局域共享三件套：语义要能一眼区分「广播 / 本机提供 / 屏幕取色」 */
  'lan-share': ['antd', 'WifiOutlined'], // 向外发散 = 向局域网广播
  'lan-host': ['antd', 'CloudServerOutlined'], // 本机作为服务端提供
  dropper: ['lucide', 'pipette'], // ★ 原为 AntD Aim（靶心，完全不对）→ 真正的吸管
  'half-circle': ['lucide', 'contrast'], // ★ 原为 Border（空心方框）→ 真正的半黑圆
  terminal: ['lucide', 'square-terminal'], // 终端窗口

  /* ★ Beta.322：图片尺寸条新增两枚
   *   lock-open：锁定比例关闭态（lock 本身上面已有 AntD LockOutlined，直接复用，
   *     不另起 Lucide 同名键 —— 同义图标各写一份就是重复来源）。
   *   maximize：用户原话「查看原图应当是一个全屏符号」——
   *     Lucide 的 maximize 是四条边向外的角括号，正是全屏/放大的通用符号；
   *     eye（原图标）语义是「看一眼」，与「铺满屏幕地看」不是一回事。 */
  'lock-open': ['lucide', 'lock-open'],
  maximize: ['lucide', 'maximize']
};

/**
 * 手绘图标（仅限「两库都确实没有」时使用）。
 *
 * ★ 用户原话：「实在没有匹配图标才手搓」★
 * 这是**最后手段**，不是随便可用的通道。加之前必须先做完这三步：
 *   1. 在本文件的 ICONS 清单里找同义/近义项，看能否复用（先查重）；
 *   2. 确认 Ant Design 与 Lucide 都没有语义匹配的形（缺 ≠ 不好看，而是语义不对）；
 *   3. 在上面写清「为什么只能用自绘」，让人一眼能复核这个决定。
 * 图形统一用 24×24 网格、只用线条（stroke），与 Lucide 同规格，混排时不突兀。
 * 当前 **0 项** —— 74 个图标全部来自图标库。
 */
const CUSTOM = {
  // 'some-icon': { d: 'M...', circle: [cx, cy, r] ... }  ← 需要时按此扩展
};

/** 从 Ant Design 取图标：填充形，viewBox 是 64 64 896 896 */
function fromAntd(name) {
  const mod = require(`@ant-design/icons-svg/es/asn/${name}.js`);
  const def = mod.default || mod;
  const { attrs = {}, children = [] } = def.icon;
  if (def.theme !== 'outlined') throw new Error(`${name}: 不是 outlined 主题`);
  if (!children.length) throw new Error(`${name}: 子元素为空`);
  for (const c of children) {
    /* ★ 字段名是 tag 不是 tagName ★ 写成 c.tagName 会得到 undefined，
       产物里变成 <undefined>，页面图标整片空白又不报错 —— 上一版就是这么翻车的。 */
    if (!c.tag) throw new Error(`${name}: 子元素缺少 tag 字段`);
  }
  return {
    s: 'fill',
    vb: attrs.viewBox,
    ch: children.map(c => ({ t: c.tag, a: c.attrs || {} }))
  };
}

/** 从 Lucide 取图标：线条形（stroke），viewBox 固定 0 0 24 24 */
function fromLucide(name) {
  const file = path.join(ROOT, `node_modules/lucide-static/icons/${name}.svg`);
  let svg;
  try {
    svg = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`lucide 没有 ${name}.svg`);
  }
  const vb = /viewBox="([^"]+)"/.exec(svg);
  if (!vb) throw new Error(`${name}: 缺少 viewBox`);
  /* 解析成与 antd 同构的 { t, a } 结构：只保留几何属性，
     颜色/描边由 Icon.vue 统一按 style 施加（否则两库混用时粗细不一致）。 */
  const ch = [];
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)\/?>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) {
      const k = a[1];
      if (k === 'fill' || k === 'stroke' || k === 'stroke-width' || k === 'stroke-linecap' || k === 'stroke-linejoin') {
        continue; // 统一由容器施加
      }
      attrs[k] = a[2];
    }
    ch.push({ t: m[1], a: attrs });
  }
  if (!ch.length) throw new Error(`${name}: 没解析出任何图元`);
  return { s: 'stroke', vb: vb[1], ch };
}

const out = {};
/** 手绘项：转成与 Lucide 同构的 stroke 数据（24×24 网格、线条形） */
function fromCustom(key, spec) {
  if (!spec.why) throw new Error(`${key}: 手绘图标必须写明 why（为什么两库都没有）`);
  if (!spec.ch || !spec.ch.length) throw new Error(`${key}: 手绘图标缺少 ch 图元`);
  return { s: 'stroke', vb: '0 0 24 24', ch: spec.ch.filter(c => c.t && c.a) };
}

for (const [key, [lib, name]] of Object.entries(ICONS)) {
  out[key] = lib === 'antd' ? fromAntd(name) : fromLucide(name);
}
/* 手绘项并入。★ 与 ICONS 撞名直接报错 ★ 否则库里已有匹配却偷偷手搓，规矩就失效了。 */
for (const [key, spec] of Object.entries(CUSTOM)) {
  if (out[key]) throw new Error(`${key}: 图标库里已有同名项，不得手绘覆盖`);
  out[key] = fromCustom(key, spec);
}

const banner = `/**
 * ★ 本文件由 scripts/gen-icons.mjs 自动生成，请勿手改 ★
 *
 * 图标来源（均为开源许可，运行时零依赖、离线可用）：
 *   - s: 'fill'   → @ant-design/icons-svg（阿里 Ant Design，MIT），viewBox 64 64 896 896
 *   - s: 'stroke' → lucide-static（Lucide，ISC），viewBox 0 0 24 24
 *   - 手绘项同样标记为 s: 'stroke'，来源见生成脚本的 CUSTOM 表（每项必须写明理由）
 * 选型以「语义匹配」为唯一标准：库里有匹配就用库，确实没有才手绘。
 * 重新生成：node scripts/gen-icons.mjs（先改脚本顶部的 ICONS / CUSTOM）。
 */
export const ICONS = ${JSON.stringify(out, null, 2)};
`;
writeFileSync(path.join(ROOT, 'src/components/icon-antd.js'), banner);

const counts = Object.values(out).reduce((acc, v) => ((acc[v.s] = (acc[v.s] || 0) + 1), acc), {});
const customCount = Object.keys(CUSTOM).length;
console.log(
  `已生成 src/components/icon-antd.js，共 ${Object.keys(out).length} 个图标` +
    `（fill ${counts.fill || 0} / stroke ${counts.stroke || 0}，其中手绘 ${customCount}）`
);
if (customCount) {
  console.log('手绘项（请复核是否真的两库都没有）：');
  for (const [k, v] of Object.entries(CUSTOM)) console.log(`  - ${k}: ${v.why}`);
}
