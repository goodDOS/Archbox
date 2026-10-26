/**
 * 多语言基础设施。
 *
 * 设计约束（与全站其它模块一致：注释写清「为什么」，不写「是什么」）：
 *
 * 1. 字典 key 用结构化点号命名（domain.snake_case），不用自然语言原文做 key ——
 *    自然 key 在 zh-TW/en 下会让「翻译到一半」的缺失不可见，且 grep 无法统计覆盖率。
 *
 * 2. 缺 key 回退链：当前语言 → zh-CN → key 本身。
 *    12 门语言目前都是全量翻译（门禁逐域断言键集一致），回退链是兜底而非常态 ——
 *    真回退到中文即说明漏了键，`test:standardize` 会先报红。
 *    新增语言若要分阶段落地，可在 standardize 的 PARTIAL_LANGS 里临时登记。
 *
 * 3. 语言选择持久化在 settings 表的 display.lang（与 display.pageSize / theme 同一机制），
 *    不单独用 localStorage —— 储存位置必须单一，否则「改了设置没生效」类问题无法排查。
 *
 * 4. 生效范围含 <html lang>：屏幕阅读器与输入法会读它，切了英文界面而 lang 还是 zh
 *    对无障碍是错的。
 */
import { ref, computed } from 'vue';
import { store } from '../store/modules/state';
import { A } from '../api';
import zhCN from './zh-CN';
import zhTW from './zh-TW';
import en from './en';
import ja from './ja';
import ko from './ko';
import ru from './ru';
import fr from './fr';
import de from './de';
import is from './is';
import ar from './ar';
import it from './it';
import es from './es';

/* 语言表：name 是该语言**自名**（原生写法），不随界面语言翻译。
 * 语言选项显示「自名 + (当前界面语言对它的称呼)」，称呼由各语言字典里的
 * langNames.* 提供（见 DisplaySection.vue），这里只存自名。 */
export const LANGS = [
  { key: 'zh-CN', name: '简体中文' },
  { key: 'zh-TW', name: '繁體中文' },
  { key: 'en', name: 'English' },
  { key: 'ja', name: '日本語' },
  { key: 'ko', name: '한국어' },
  { key: 'ru', name: 'Русский' },
  { key: 'fr', name: 'Français' },
  { key: 'de', name: 'Deutsch' },
  { key: 'is', name: 'Íslenska' },
  { key: 'ar', name: 'العربية' },
  { key: 'it', name: 'Italiano' },
  { key: 'es', name: 'Español' }
];

/* ★★ Beta.279 事故：繁体整份从产物里消失 ★★
 *
 * 现象：切繁体后所有词条静默回退成简体，包里搜不到任何繁体字形。
 *
 * 根因：这张语言表原来写成对象字面量 `{ 'zh-CN': zhCN, 'zh-TW': zhTW, en }`。
 *   esbuild 压缩阶段的 tree-shaking 看到 `zhTW` 只作为字面量表的属性值出现一次、
 *   而键又是编译期常量，就把它当成「没人按这个键取值」的冗余绑定，
 *   连同整条 zh-TW 模块图（16 个 parts/*.zh-TW.js）一起裁掉。
 *   构建日志毫无异常，界面上表现为「切了繁体没反应」——最难查的一类问题。
 *
 * 对策（两层，缺一不可）：
 *   ① 字典表改为**运行时函数拼装**（dictionaries()）：键在数组里、赋值在循环里，
 *      静态分析无法枚举「谁会被取到」，三个字典都必须保留；
 *   ② 打包后体检**正面抽查**繁体词条（见 check-dist-i18n.mjs）。
 *      旧版只查「有没有台湾化旧译」，把繁体删光了反而全绿 —— 这是最危险的假通过。
 *
 * 另外：`t()` 里也不能直接写 `DICTS[lang.value]`，得经由 dictOf() 取值，
 *   否则压缩器又能在调用点把表折叠回字面量。绕一层函数是最省事的固化手段。
 */
function dictionaries() {
  const out = {};
  const pairs = [
    ['zh-CN', zhCN],
    ['zh-TW', zhTW],
    ['en', en],
    ['ja', ja],
    ['ko', ko],
    ['ru', ru],
    ['fr', fr],
    ['de', de],
    ['is', is],
    ['ar', ar],
    ['it', it],
    ['es', es]
  ];
  for (const [k, d] of pairs) out[k] = d;
  return out;
}
const DICTS = dictionaries();

/** 按当前语言取字典；语言缺失时回退到简体 */
function dictOf(key) {
  return DICTS[key] || zhCN;
}

export const LANG_KEYS = LANGS.map(l => l.key);

/* ★ 品牌名「文档盒」是产品名称的一部分，不参与翻译（Beta.288 用户要求）。
 * 否则繁体界面会把它译成「文档盒」——名称变了就不是同一个产品了。
 * 标题栏（BrandMark）与托盘悬停提示（syncTrayTooltip）统一从这里取，
 * 而不是走 t('shell.brandShort')。 */
export const BRAND_NAME = '文档盒';

/* ★ 完整产品名「文档盒 Archbox」（Beta.291）：托盘弹窗头部标题用。
 *   与 BRAND_NAME 同理不参与翻译；托盘悬浮提示则相反，走 t('shell.appName') 随语言。 */
export const BRAND_FULL = '文档盒 Archbox';

/* ★ 人名「阿叶」不参与翻译（Beta.316 用户要求）。
 *   人名是专有名词，翻成别的语言就不是这个人了 —— 原先各语言字典里被逐语「处理」过：
 *   韩语音译成「아예」、俄语拆成「А Е」、英语作「A-Ye」、繁体转成「阿葉」，
 *   同一个署名在四种界面下成了四个名字。
 *   与 BRAND_NAME 同一把尺子：名称类文本提为常量，不随语言变化。
 *   关于页（AboutPage.vue）的引导人署名统一从这里取；旁边那句职责描述
 *   （about.leadDesc）是普通文案，仍走 t() 随语言切换。 */
export const LEAD_NAME = '阿叶';

/** 当前语言（响应式）。初始取 store.language，由 boot 时 applyLang 校准。 */
export const lang = ref(store.language || 'zh-CN');

function lookup(dict, key) {
  if (!dict) return undefined;
  // 支持任意层点号寻路（如 common.langNames.zh-CN 这类二级/三级 key）。
  // 曾经限制「只切一层」，但 langNames 作为语言元数据天然是 common 下的二级对象，
  // 一层假设与真实 key 空间冲突，会让 t('common.langNames.*') 静默回退成原始 key 串
  // （界面表现为语言选项显示「简体中文 (common.langNames.zh-CN)」，Beta.316 修复）。
  // 逐段下行，任一段缺失即返回 undefined 交上层回退链，不会掩盖拼写错误。
  let cur = dict;
  for (const seg of key.split('.')) {
    if (!cur || typeof cur !== 'object' || !(seg in cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** 翻译：支持 {name} 占位符替换 */
export function t(key, params) {
  const dict = dictOf(lang.value);
  let v = lookup(dict, key);
  if (v === undefined) v = lookup(zhCN, key);
  if (v === undefined) return key;
  if (params) {
    for (const k of Object.keys(params)) {
      v = v.split(`{${k}}`).join(String(params[k]));
    }
  }
  return v;
}

/** 当前语言下取一个本地化数组/对象（如语言自身的显示名） */
export function pick(key) {
  const dict = dictOf(lang.value);
  const v = lookup(dict, key);
  return v === undefined ? lookup(zhCN, key) : v;
}

/* 书写方向：阿拉伯语用阿拉伯字母，是 RTL。
 * 这里与 LANGS 分开维护：方向是「文字系统属性」，不是「语言选项属性」，
 * 且必须同时供应给 <html dir> 与组件布局判断。 */
const RTL_LANGS = new Set(['ar']);

/** 当前语言是否为从右往左书写 */
export const isRtl = computed(() => RTL_LANGS.has(lang.value));

/** 把语言写进 <html lang>：屏幕阅读器 / 输入法 / 浏览器翻译提示都读它。
 *
 *  ★ 为什么不是 el.dir = 'rtl'（Beta.318 的做法，用户反馈「把页面旋转过来了」）★
 *  `dir="rtl"` 是「整棵布局树镜像」：不仅文字从右排到左，flex 主轴、margin、
 *  scrollbar 位置、图标与文字的前后关系、弹层锚定边……全部跟着翻。
 *  本项目的骨架是按 LTR 设计的（侧边栏在左、按钮图标在前、弹层向右展开），
 *  整树镜像后就得到用户截图里「整个界面被翻过来」的破图。
 *  正确分工：<html> 恒为 dir="ltr" 保住骨架；语言方向写进 data-text-dir，
 *  由 styles/base.css 的 [data-text-dir='rtl'] 规则只作用于「读的文字」
 *  （段落、标题、单元格、输入框内容），CSS 用 unicode-bidi: plaintext
 *  让每段文字按自身首强字符定方向，中英混排、数字、标点各自正确。 */
function syncHtmlLang() {
  const el = document.documentElement;
  el.lang = lang.value;
  el.dir = 'ltr';
  el.setAttribute('data-text-dir', RTL_LANGS.has(lang.value) ? 'rtl' : 'ltr');
}

/** 托盘悬停提示随语言走（Beta.291 应用户要求：悬浮名称文字随翻译改动）。
 *  文案取渲染层 shell.appName（zh-CN「文档盒 Archbox」/ zh-TW「文档盒 Archbox」/ en「Archbox」），
 *  经 IPC 推给主进程；早于托盘创建到达的消息（启动竞态）由 window.js 暂存，
 *  建托盘时再应用，不会丢。注意：托盘弹窗头部的标题则相反，走 BRAND_FULL 常量不翻译。 */
function syncTrayTooltip() {
  try {
    if (A.setTrayTooltip) A.setTrayTooltip(t('shell.appName'));
  } catch (e) {
    /* 静默：非 Electron 环境（单测）没有这座桥 */
  }
}

/** 把界面语言告诉主进程（Beta.271）。
 *
 *  ★ 为什么必须推这一下 ★
 *    主进程有自己的字典（electron/i18n），管的是渲染层够不着的地方：原生对话框
 *    （完整性告警、「图片另存为…」）、原生右键菜单、以及「数据库打开失败屏」。
 *    这些文案在**用户切语言的那一刻之后**才可能出现，主进程若不知道切了，
 *    就会用启动时的旧语言弹窗 —— 界面上明明是英文，弹窗是中文。
 *
 *  ★ 主进程侧不落库 ★
 *    持久化仍只由下面的 A.setSetting 负责（单一写入点）。主进程收到后只更新内存
 *    与 userData 缓存文件（那份缓存是「库都打不开」时的唯一语言来源）。
 *    若这里也写库，一次切换会产生两条「修改设置」审计记录。 */
function syncMainLang() {
  try {
    if (A.setLang) A.setLang(lang.value);
  } catch (e) {
    /* 静默：非 Electron 环境（单测）没有这座桥 */
  }
}

/* 托盘弹窗（TrayMenu.vue）也会调 applyLang，但它是**读者**不是写者：
 * 它的语言来自主进程 tray:data 的返回值，再推回去只会绕一圈。
 * 判据是 location.hash === '#tray'：托盘弹窗与主窗口加载的是**同一个**
 * dist/index.html，靠 loadFile 的 hash 参数区分（见 window.js 的 trayPopup）。
 * 早先想用文件名区分（tray.html）是错的——根本没有这个文件。
 * 让同步只发生在主窗口：单一写入点，避免两个渲染进程互相纠正。 */
function isTrayPopup() {
  try {
    return location.hash === '#tray';
  } catch (e) {
    return false;
  }
}

/** 立即生效（不落库）：启动时由 boot 调用 */
export function applyLang(l) {
  if (!LANG_KEYS.includes(l)) l = 'zh-CN';
  lang.value = l;
  store.language = l;
  syncHtmlLang();
  if (isTrayPopup()) return;
  syncTrayTooltip();
  syncMainLang();
}

/** 切换语言并持久化（设置页调用） */
export async function setLang(l) {
  if (!LANG_KEYS.includes(l)) l = 'zh-CN';
  applyLang(l);
  try {
    await A.setSetting({ k: 'display.lang', v: l });
  } catch (e) {
    /* 静默：内存态已生效 */
  }
  return l;
}

/** 该 key 在当前语言是否有译文（供设置页展示「已完整翻译」标记） */
export const coverage = computed(() => {
  const total = countKeys(zhCN);
  const cur = dictOf(lang.value);
  const done = countKeys(cur);
  return { total, done };
});

function countKeys(dict) {
  let n = 0;
  for (const k of Object.keys(dict)) {
    const v = dict[k];
    if (v && typeof v === 'object') n += Object.keys(v).length;
    else n += 1;
  }
  return n;
}

export default { t, lang, setLang, applyLang, LANGS, LANG_KEYS };
