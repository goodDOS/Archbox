/**
 * 测试统一入口（编排器）。
 *
 * 显式列出「纯 Node 可独立运行」的 verify 脚本清单，逐项顺序执行并汇总退出码。
 * 显式清单（而非 glob）是有意为之：verify 目录里还有一批 .e2e.cjs / .pixel.cjs /
 * .check.cjs 需要 electron 环境或浏览器/像素比对，不属于 `npm test` 的常规单元回归，
 * 冒然纳入会让 CI / 本地一键跑挂。新增独立可跑的 .mjs 单测时，显式追加到 TESTS。
 *
 * 用法：node scripts/run-tests.mjs [--filter <substr>]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// 显式清单：相对项目根。顺序即执行顺序（standardize 契约最重，放最后兜底）。
const TESTS = [
  'electron/verify/zip-read.test.mjs',
  'electron/verify/db-images.test.mjs',
  'electron/verify/dup-title.test.mjs',
  'electron/verify/postfind.test.mjs',
  'electron/verify/editfind.test.mjs',
  'electron/verify/postdiff.test.mjs',
  'electron/verify/post-editor-blocks.test.mjs',
  // 正文图片尺寸（Beta.322）：跨层口径一致性 + 放行边界 + 发布态落库全链路。
  // 这三条用户反馈（自定义像素 / 发布后变小 / 代码模式改坏）都属「只在某层生效且不报错」，
  // 单看任一层代码都像对的，必须横向盯住渲染层 ↔ 主进程 ↔ 落库三处同一份。
  'electron/verify/image-size.test.mjs',
  // 字体资产与字体栈（Beta.322 追加）：14 语自带字体 + emoji。
  // 风险全在「顺序与完整性」——emoji 分片含 U+30-39，排到文字字族前面会把数字吃成键帽表情；
  // 中文类字族若排在系统字体之后则自带字形同没装（界面看不出，包体积白涨）。
  'electron/verify/font-stack.test.mjs',
  // 编辑器 emoji 面板（Beta.322 追加）：字符表单一是唯一来源、每个格子带具体字符的
  // aria-label（一排卡通脸对读屏用户不可区分）、插入必须走 chainRun 才进撤销栈。
  'electron/verify/emoji-picker.test.mjs',
  // 设置页卡片间距（Beta.324 追加）：用户报「没做好间隔」，根因是**卡片套卡片** ——
  // FontSection 被塞进「每页条数」那张 .card 内部，两层边框只隔 8px。
  // 这个坑 CSS 本身完全正确，`.card-stack > .card + .card` 也没写错，
  // 错在嵌套的卡根本不在直接子元素链上，肉眼审 CSS 查不出来，必须回 DOM 结构。
  'electron/verify/settings-card-gap.test.mjs',
  // 图片文件板块（Beta.324 追加）：用户要求「独立在数据清洗板块之下 + 显示缩略图 +
  // 点击展开大图 + 去掉查看原图按钮」。Beta.322 刻意不做缩略图是怕原图拖死页面，
  // 本轮用「懒加载 + 渲染层缩到 88px + 串行解码 + 原图不缓存」把代价拆掉，
  // 这条测试盯住这四根柱子不被后人随手拆掉。
  'electron/verify/image-inventory-thumbs.test.mjs',
  // 导航栏主题按钮无障碍文字（Beta.325 追加）：用户要求「主题快捷切换到自定义主题时，
  // 无障碍文字应显示自定义主题名称」——此前非 STANDARD 主题一律回落笼统的「自定义」，
  // 切到 CS1.6/竹青时读屏与悬停都看不出是哪个主题。顺着四个纯图标按钮排查，
  // 一并锁死「aria-label 齐备 + 无硬编码英文 + title/aria-label 同源」。
  'electron/verify/nav-toolbar-a11y.test.mjs',
  // 保存时清除空标签（Beta.327 追加）：用户需求「保存时清除空标签」。根因是存量空关联
  // 撞上 sameSnapshot 的 normTags 归一化（['']≡[]）→ 判无改动跳过写库 → 手动删不掉。
  // 四层防线（前端入口/出口/基线 cleanTags + 后端读侧 TRIM 过滤 + 数据清洗「空标签」项
  // + 14 语文案）各有一个变异等着抓回退；第 5 节用真库复现「用户无感 + 清洗根除」边界。
  'electron/verify/empty-tags-cleanup.test.mjs',
  // 编辑工具栏重构（Beta.328 追加）：用户七点要求（移除页内查找/行内代码按钮、
  // emoji 前移、移除并**禁止**插入链接、WPS 样式色图标、主流工具重排、字号框显值+自定义）。
  // 「禁止插入链接」必须锁 schema 层（link:false）——只删按钮的话粘贴网页照样能造链接。
  'electron/verify/editor-toolbar.test.mjs',
  // 编辑态页头按钮（Beta.329 追加）：用户需求「另存为前加预览按钮、预览前加页内搜索按钮」。
  // 页内搜索是 Beta.328 从工具栏移除后的入口迁回（编辑态查找能力本身自 Beta.315 起就有）；
  // 预览渲染「正在编辑、尚未保存」的内容，与历史版本预览（previewVer 快照）是两份数据，
  // 必须独立弹层状态；净化链路与查看态同源（safeHtml+markSelectableMedia），防弹层成 XSS 旁路。
  'electron/verify/editor-head-buttons.test.mjs',
  // 自建文字右键面板（Beta.329 追加）：用户截图里系统原生右键是英文 Cut/Copy/Paste/Select All
  // 且跟随系统深色皮肤。原生 role 项由系统绘制，主进程 i18n 够不着 → 富文本编辑区改渲染层自绘。
  // 三个易退化点必须锁死：面板没挂上（右键无反应）、剪贴板没走主进程（沙盒下静默失败）、
  // 粘贴只给纯文本（从网页复制的富文本格式丢失＝能力回退）。
  'electron/verify/ctx-menu-selfdrawn.test.mjs',
  // 图片查看器「适应窗口」（Beta.324 追加）：用户报按钮点不了，根因是舞台用
  // display:grid —— 隐式行 auto 尺寸下 max-height:100% 无参照失效，fit 态照样溢出。
  // 这条只靠读源码锁「flex + margin:auto」的写法；真实浏览器量像素见
  // scripts/check-image-fit.mjs（需先 npm run build，人工跑）。
  'electron/verify/image-lightbox-fit.test.mjs',
  // 「另存为」下拉图标尺寸（Beta.324 追加）：用户报「另存为图标大小不一」，根因是
  // 保存组在页面动作区却误用了编辑器工具栏的 toolbar 皮肤（28px/图标15），
  // 与旁边 .btn.btn-icon（32×32/图标16）三种尺寸。锁 icon-btn 皮肤逐像素对齐。
  'electron/verify/dropdown-icon-btn.test.mjs',
  'electron/verify/lanshare-autorefresh.test.mjs',
  'electron/verify/meta-version.test.mjs',
  'electron/verify/tagcloud-region.test.mjs',
  'electron/verify/anti-tamper.test.mjs',
  'electron/verify/app-integrity.test.mjs',
  'electron/verify/asar-integrity.test.mjs',
  'electron/verify/datadir-backup.test.mjs',
  'electron/verify/focus-glow.test.mjs',
  'electron/verify/i18n-completeness.test.mjs',
  'electron/verify/i18n-reactivity.test.mjs',
  'electron/verify/mask-animation.test.mjs',
  'electron/verify/pack-integrity-check.mjs',
  'electron/verify/pack-password-e2e.mjs',
  // 打包产物落位契约（Beta.316）：产物必须复制一份进产物空间、版本号必须递增。
  // 这条规矩此前只靠脚本自觉，改坏了没人发现，直到用户点下载 404 才暴露。
  'electron/verify/pack-dist-space.test.mjs',
  'electron/verify/tw-han-map.mjs',
  'electron/verify/standardize.test.mjs'
];

const filter = (() => {
  const i = process.argv.indexOf('--filter');
  return i >= 0 ? process.argv[i + 1] : '';
})();

const list = filter ? TESTS.filter(t => t.includes(filter)) : TESTS;
if (!list.length) {
  console.error(`没有匹配「${filter}」的测试`);
  process.exit(2);
}

let failed = 0;
for (const t of list) {
  const label = path.relative(ROOT, t);
  const r = spawnSync(process.execPath, [path.join(ROOT, t)], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (r.status !== 0) {
    failed++;
    console.error(`\n✗ ${label} 退出码 ${r.status}`);
  }
}

console.log(`\n=== 测试编排完成：${list.length - failed} / ${list.length} 通过 ===`);
process.exit(failed ? 1 : 0);
