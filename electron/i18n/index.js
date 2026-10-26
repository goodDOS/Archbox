'use strict';
/**
 * 主进程侧多语言基础设施（Beta.271）。
 *
 * ---------- 为什么主进程需要自己的一套字典 ----------
 * 渲染层已有 16 域字典（src/i18n/），但有一类文案渲染层**拿不到也翻不了**：
 *   · Electron 原生对话框（showMessageBoxSync / showSaveDialog / showOpenDialog）由系统
 *     进程绘制，文案在建对象那一刻就固定，渲染层无从插手；
 *   · 原生右键菜单（Menu.popup）同理，模板在主进程构造；
 *   · 「数据库打开失败屏」（state.dbError）——这张屏出现时库根本没打开，
 *     渲染层连设置表都读不到，无法知道自己该用哪种语言。
 * 这些就是本模块存在的理由。
 *
 * ---------- 为什么是 CJS 而不是复用 src/i18n ----------
 * src/ 是 ESM（浏览器目标、走 Vite 打包），主进程是 CJS（Node 直跑，不经打包）。
 * 直接 require ESM 需要 Node 的 ESM 互操作，在 Electron 主进程里会引入额外的加载
 * 时序与缓存问题；而主进程要翻译的量只有几十条，独立一份 CJS 字典代价极小。
 *
 * ---------- 顶层绝不 require('electron') ----------
 * ipc/contextmenu.js 的 buildTextTemplate / buildImageTemplate 是供验证脚本
 * **在纯 Node 下直接断言**的纯函数（见该文件头「关于 electron 模块的懒加载」）。
 * 它们要调 t()，若本模块顶层拉 electron，那些单测就会拿到一个字符串路径，
 * 一切 API 变成 undefined。故 userData 路径一律懒解析（见 cacheFile）。
 *
 * ---------- 两套 API：t() 与 errKey() ----------
 *   t(key, params)      主进程**自己渲染**的文案（弹窗、菜单、dbError）。
 *                       这些文字只在本进程里出现，翻错了本进程自己能兜。
 *   errKey(key, params) 主进程**抛给渲染层显示**的错误（IPC throw）。
 *                       这里不返回译文，而是返回一个编码串 `key|{json参数}`：
 *                       渲染层用自己的 t() 翻 —— 理由见 errKey 处注释。
 *
 * ---------- 语言从哪来（三级）----------
 *   ① settings 表的 display.lang：库已就绪时由 main.js 调 initFromSettings() 读入；
 *   ② userData 缓存文件（main-lang.json）：库打不开 / 未解锁时的唯一来源，
 *      由渲染层经 IPC lang:set 每次切换时写入；
 *   ③ 兜底 zh-CN：源码原生文案即中文，最坏情况退化为中文而不是空白或 raw key。
 *   ② 是 ① 的必要补充而非重复：dbError 屏场景下 ① 永远读不到。
 */
const fs = require('fs');
const path = require('path');

const LANGS = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'ru', 'fr', 'de', 'is', 'ar', 'it', 'es'];
const FALLBACK = 'zh-CN';

/* 按语言分文件、按域聚合。require 静态写死而非 readdirSync：
 * 打包进 asar 后 readdirSync 的排序不稳定，静态清单让「漏加载一个域」
 * 这种错误在 require 阶段就暴露成明确的 Cannot find module，而不是运行期缺词。 */
const DICTS = {
  'zh-CN': {
    sys: require('./parts/sys.zh-CN'),
    menu: require('./parts/menu.zh-CN')
  },
  'zh-TW': {
    sys: require('./parts/sys.zh-TW'),
    menu: require('./parts/menu.zh-TW')
  },
  en: {
    sys: require('./parts/sys.en'),
    menu: require('./parts/menu.en')
  },
  ja: {
    sys: require('./parts/sys.ja'),
    menu: require('./parts/menu.ja')
  },
  ko: {
    sys: require('./parts/sys.ko'),
    menu: require('./parts/menu.ko')
  },
  ru: {
    sys: require('./parts/sys.ru'),
    menu: require('./parts/menu.ru')
  },
  fr: {
    sys: require('./parts/sys.fr'),
    menu: require('./parts/menu.fr')
  },
  de: {
    sys: require('./parts/sys.de'),
    menu: require('./parts/menu.de')
  },
  is: {
    sys: require('./parts/sys.is'),
    menu: require('./parts/menu.is')
  },
  ar: {
    sys: require('./parts/sys.ar'),
    menu: require('./parts/menu.ar')
  },
  it: {
    sys: require('./parts/sys.it'),
    menu: require('./parts/menu.it')
  },
  es: {
    sys: require('./parts/sys.es'),
    menu: require('./parts/menu.es')
  }
};

/** 当前语言。模块级变量而非 state 字段：i18n 是被 state 依赖之外的独立小模块，
 *  放进 state 会让 state 反向依赖字典，且单测导入 state 时白拉一堆字典。 */
let lang = FALLBACK;

/** 缓存文件路径：懒解析。
 *  ★ 不能提到模块作用域：main.js 的 app.setName() 必须早于任何 getPath('userData')，
 *    否则 userData 会被钉死在 %APPDATA%/archbox（见 main.js 头部注释）。
 *    本模块可能在 setName 之前被 require（ipc/* 的依赖链），所以这里只能调用时算。 */
function cacheFile() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'main-lang.json');
  } catch (e) {
    return null;
  }
}

/** 取字典里的一层域对象（key 形如 `sys.dbIntegrityTitle`） */
function lookup(dict, key) {
  if (!dict) return undefined;
  const i = String(key).indexOf('.');
  if (i < 0) return undefined;
  const head = dict[String(key).slice(0, i)];
  if (!head || typeof head !== 'object') return undefined;
  return head[String(key).slice(i + 1)];
}

/** 插值：{name} 形式，与渲染层 t() 同一口径（两份字典的参数语法必须一致，
 *  否则同一个 key 在主进程和渲染层会拼出不同结果） */
function fill(s, params) {
  if (!params || typeof s !== 'string') return s;
  let v = s;
  for (const k of Object.keys(params)) v = v.split(`{${k}}`).join(String(params[k]));
  return v;
}

/**
 * 主进程自渲染文案翻译。
 * 回退链：当前语言 → zh-CN → key 本身（与渲染层一致：缺词时界面退化为中文，
 * 绝不出现空白；key 本身透出则是最后的调试线索）。
 */
function t(key, params) {
  let v = lookup(DICTS[lang], key);
  if (v === undefined) v = lookup(DICTS[FALLBACK], key);
  if (v === undefined) return String(key);
  return fill(v, params);
}

/* ---------- 错误码（B 类错误：主进程抛、渲染层显示） ---------- */

/**
 * 构造一条「由渲染层翻译」的错误文案。
 *
 * @param {string} key     i18n key（渲染层字典里必须存在，落在 settings / common 域）
 * @param {object} [params] 插值参数，如 { n: 2 }
 * @returns {string}      可直接 throw new Error(...) 的编码串
 *
 * ---------- 为什么不在主进程翻好再抛 ----------
 * B 类错误（密码错误、口令错误、第 N 组答案为空…）最终显示在渲染层的表单里。
 * 若主进程翻成文字再抛，会出现两个问题：
 *   ① 语言双份维护：同一句话在主进程字典和渲染层字典各存一份，改一处忘一处
 *      就是「中文界面上冒出英文句子」这类无法用 grep 一次查净的缺陷；
 *   ② 时序错：用户切语言的瞬间，主进程缓存可能还没更新（换库/重开场景），
 *      界面语言已经变了而错误文案仍是旧语言。
 * 让主进程只负责「指出是哪条错误」，语言判定权交给当前正在显示它的渲染层，
 * 两个问题同时消失。
 *
 * ---------- 编码格式 `key|{json}` ----------
 * IPC 只保证可序列化的原始值，自定义属性（err.params）会丢。故把参数编进
 * message 里，由 preload 的 call() 拆出来挂到 err.params 上（见 preload.js）。
 * 竖线不会出现在 key（只含 [a-z.]）里，解析是确定的。
 *   'settings.errPassMin8'                → 无参
 *   'settings.errQAEmpty|{"n":2}'         → 带参
 */
function errKey(key, params) {
  if (!params || !Object.keys(params).length) return String(key);
  let json;
  try {
    json = JSON.stringify(params);
  } catch (e) {
    return String(key);
  }
  return String(key) + '|' + json;
}

/** 是否为本模块产出的错误串（preload 与验证脚本共用的判据，避免两处正则漂移） */
const ERR_RE = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+(\|[{[][\s\S]*)?$/;
function isErrKey(s) {
  return ERR_RE.test(String(s == null ? '' : s));
}

/**
 * 日志用文本：把 errKey 的编码串还原成「中文可读文案」。
 *
 * 运行日志与界面语言无关（日志要能跨语言、跨时间被人读懂、被 grep 到，
 * 若日志跟着语言变，同一个故障在两种语言下是两行不同的字），
 * 所以这里**固定取 zh-CN**，而不是当前语言。
 * 非 errKey 串原样返回：内核异常（ECONNREFUSED 等）必须保留原文，不能洗成中文。
 */
function logText(s) {
  const raw = String(s == null ? '' : s);
  if (!isErrKey(raw)) return raw;
  const bar = raw.indexOf('|');
  const key = bar < 0 ? raw : raw.slice(0, bar);
  let params = null;
  if (bar >= 0) {
    try {
      params = JSON.parse(raw.slice(bar + 1));
    } catch (e) {
      params = null;
    }
  }
  let v = lookup(DICTS[FALLBACK], key);
  if (v === undefined) return key;
  return fill(v, params);
}

/* ---------- 语言设置 ---------- */

function currentLang() {
  return lang;
}

/**
 * 设置当前语言。持久化两份：
 *   ① userData/main-lang.json —— 库不可用时的唯一来源（见文件头三级来源②）；
 *   ② settings 表的 display.lang —— 由渲染层负责（它已有那条通路，见 src/i18n/setLang）。
 * 主进程只写自己的缓存文件，不去写库：写库要走 db + 审计链，而语言是纯界面偏好，
 * 不该因此产生一条「修改设置」审计记录（现有 renderer 的 setLang 走 settings:set，
 * 那里已经有了，重复写会造成两条记录）。
 *
 * @returns {boolean} 是否发生了变更（不变则不落盘，避免每次启动都写磁盘）
 */
function setLang(l) {
  const v = LANGS.includes(l) ? l : FALLBACK;
  const changed = v !== lang;
  lang = v;
  if (changed) writeCache(v);
  return changed;
}

function writeCache(l) {
  const f = cacheFile();
  if (!f) return false;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ lang: l }, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

function readCache() {
  const f = cacheFile();
  if (!f) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return LANGS.includes(j && j.lang) ? j.lang : null;
  } catch (e) {
    return null;
  }
}

/**
 * 启动时定语言：库已就绪用库里的设置，否则用缓存文件，再否则 zh-CN。
 * 必须在 tryBootDb() **之后**调用（库未打开时 db.getSetting 会抛 assertDb）。
 *
 * @param {function} getSetting  db.getSetting 注入（本模块不 require db，避免环依赖：
 *                               db/core.js → i18n，而 i18n → db 会成环）
 */
function initFromSettings(getSetting) {
  let fromDb = null;
  try {
    const v = getSetting('display.lang');
    if (LANGS.includes(v)) fromDb = v;
  } catch (e) {}
  if (fromDb) {
    lang = fromDb;
    writeCache(fromDb);
    return lang;
  }
  const cached = readCache();
  if (cached) {
    lang = cached;
    return lang;
  }
  lang = FALLBACK;
  return lang;
}

/** 库不可用时的启动语言（dbError 屏 / 解锁门）：只能靠缓存 */
function initFromCache() {
  const cached = readCache();
  lang = cached || FALLBACK;
  return lang;
}

module.exports = {
  LANGS,
  FALLBACK,
  t,
  errKey,
  isErrKey,
  logText,
  currentLang,
  setLang,
  initFromSettings,
  initFromCache,
  // 导出供单测直接验键集一致性（不经过 t 的回退链，才能发现"某语言缺词"）
  DICTS,
  cacheFile
};
