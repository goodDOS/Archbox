/**
 * 导航栏主题快捷切换：自定义主题显示具体名称 + 四按钮无障碍文字齐整（Beta.325）。
 *
 * 【为什么要有这一场】
 *   用户需求：「主题快捷切换到自定义主题时，无障碍文字应显示自定义主题名称」。
 *   此前 themeLabel 对非 STANDARD 主题一律回落笼统的「自定义」——切到 CS1.6 /
 *   竹青/檀褐/青空/半条命时，悬停提示与读屏标签都看不出具体是哪个主题，
 *   「切换主题」这个按钮在自定义态下对无障碍用户实际是坏的。
 *   THEME_LABEL_KEYS（theme.js 单一导出）早已覆盖全部 8 个主题 key，
 *   差的只是查表时不再分内置/自定义两路。
 *
 * 【同类排查（举一反三）】
 *   顺着 NavToolbar 四个纯图标按钮查了一圈无障碍文字，发现不止主题按钮一处：
 *   · 后退/前进按钮 aria-label 是硬编码英文 "Back"/"Forward"，不随语言切换；
 *   · 刷新、主题两个按钮干脆只有 title、没有 aria-label。
 *   按 UI 规矩第 8 条（纯图标按钮必须 aria-label + title 齐备且走 i18n）一并修掉，
 *   本场测试把这四条的契约全部锁死，防回归。
 *
 * 【本条测试锁什么】
 *   1. 主题显示名查表不区分内置/自定义（THEME_LABEL_KEYS 全覆盖，兜底才「自定义」）；
 *   2. 主题按钮 title 与 aria-label 同源（themeSwitchLabel），都带具体主题名；
 *   3. 四个按钮 aria-label 齐备、无硬编码字符串、title/aria-label 同源绑定；
 *   4. 图标逻辑（themeIconName 的 STANDARD 分支）不被显示名改动误伤；
 *   5. 切换后的 toast 反馈同样带具体主题名。
 *
 * 运行：node electron/verify/nav-toolbar-a11y.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ok, section, done } = createHarness();

const read = p => readFileSync(path.join(root, p), 'utf8');
const NAV = 'src/components/NavToolbar.vue';
const THEME_JS = 'src/store/modules/theme.js';

const navSrc = read(NAV);
const themeSrc = read(THEME_JS);

/** 取出 .vue 的 <template> 段 */
function tpl(src) {
  const m = /<template>([\s\S]*)<\/template>/.exec(src);
  return m ? m[1] : '';
}
/** 取出 .vue 的 <script setup> 段 */
function script(src) {
  const m = /<script setup>([\s\S]*)<\/script>/.exec(src);
  return m ? m[1] : '';
}
/** 剥掉行注释与块注释（静态断言只看代码，不看注释里的说明文字） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const navTpl = tpl(navSrc);
const navScript = stripComments(script(navSrc));
const navCode = stripComments(navSrc);

/* ── ① 主题显示名具体化（本次用户需求核心） ── */
section('主题显示名：自定义主题显示具体名称');

// 取出 const themeLabel = computed(...) 到配对的 );
const labelDef = /const themeLabel = computed\(\(\) =>([\s\S]*?)\n\);/.exec(navScript);
ok(!!labelDef, 'NavToolbar 定义 themeLabel computed');
if (labelDef) {
  const body = labelDef[1];
  ok(
    !/STANDARD\.includes/.test(body),
    'themeLabel 查表不区分内置/自定义（Beta.325：自定义态也要具体名称，不再回落笼统的「自定义」）'
  );
  ok(
    /THEME_LABEL_KEYS\[store\.theme\]/.test(body),
    'themeLabel 用 THEME_LABEL_KEYS[store.theme] 查表（单一数据源，见 theme.js）'
  );
  ok(/'themeCustom'/.test(body), 'themeLabel 保留 themeCustom 兜底（设置里存了表外 key 时不显示裸 key）');
  ok(
    !/: t\('shell\.themeCustom'\)/.test(body),
    'themeLabel 不存在「非 STANDARD 一律 themeCustom」的旧分支（回归即本场测试意义所在）'
  );
}

// THEME_KEYS ⊆ THEME_LABEL_KEYS：查表能覆盖全部主题，否则具体化会漏主题
const themeKeysBody = /export const THEME_KEYS = \[([\s\S]*?)\]/.exec(themeSrc);
const labelKeysBody = /export const THEME_LABEL_KEYS = \{([\s\S]*?)\n\}/.exec(themeSrc);
ok(!!themeKeysBody && !!labelKeysBody, 'theme.js 导出 THEME_KEYS 与 THEME_LABEL_KEYS');
if (themeKeysBody && labelKeysBody) {
  const keys = [...themeKeysBody[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  const mapped = [...labelKeysBody[1].matchAll(/^\s*(\w+):\s*'/gm)].map(x => x[1]);
  const miss = keys.filter(k => !mapped.includes(k));
  ok(
    miss.length === 0,
    `THEME_KEYS 全部有显示名映射（${keys.length} 个主题）` + (miss.length ? ' → 缺：' + miss.join(',') : '')
  );
}

// 主题按钮 title 与 aria-label 同源（themeSwitchLabel），不得一个带名一个不带
ok(
  /:title="themeSwitchLabel"[\s\S]*?:aria-label="themeSwitchLabel"/.test(navTpl) ||
    /:aria-label="themeSwitchLabel"[\s\S]*?:title="themeSwitchLabel"/.test(navTpl),
  '主题按钮 title 与 aria-label 同绑 themeSwitchLabel（同源，不各写一句）'
);
ok(
  /const themeSwitchLabel = computed\(\(\) => t\('shell\.navSwitchTheme', \{ theme: themeLabel\.value \}\)\)/.test(
    navScript
  ),
  'themeSwitchLabel 由 navSwitchTheme + 具体主题名组合'
);

/* ── ② 同类排查：四个按钮无障碍文字齐整 ── */
section('同类排查：NavToolbar 四按钮 aria-label 齐备');

// 模板里 <button 总数与 :aria-label 绑定数一致（含 disabled 态的后退/前进）
const btnCount = (navTpl.match(/<button\b/g) || []).length;
const ariaCount = (navTpl.match(/:aria-label=/g) || []).length;
ok(btnCount === 4 && ariaCount === 4, `四个按钮全部绑定 :aria-label（button=${btnCount}, aria-label=${ariaCount}）`);

// 不允许静态字符串 aria-label（硬编码英文/中文都不随语言切换）。
// 负向查值：:aria-label="xxx" 是动态绑定（前面带冒号），只有裸 aria-label="字面量" 才算硬编码
const staticAria = /(?<!:)\baria-label="[^"]+"/.exec(navTpl);
ok(
  !staticAria,
  '无硬编码字符串 aria-label（Back/Forward 类英文硬编码已清除，全部走 t()）' + (staticAria ? ' → ' + staticAria[0] : '')
);

// 后退/前进：title 与 aria-label 绑同一个 computed（backLabel/forwardLabel）
for (const [name, computedName] of [
  ['后退', 'backLabel'],
  ['前进', 'forwardLabel']
]) {
  ok(
    new RegExp(`const ${computedName} = computed`).test(navScript),
    `${name}按钮定义 ${computedName} computed（title/aria-label 单一来源）`
  );
  const titleBind = new RegExp(`:title="${computedName}"`).test(navTpl);
  const ariaBind = new RegExp(`:aria-label="${computedName}"`).test(navTpl);
  ok(titleBind && ariaBind, `${name}按钮 title 与 aria-label 同绑 ${computedName}`);
}
ok(
  /:title="t\('shell\.navRefresh'\)"[\s\S]*?:aria-label="t\('shell\.navRefresh'\)"/.test(navTpl) ||
    /:aria-label="t\('shell\.navRefresh'\)"[\s\S]*?:title="t\('shell\.navRefresh'\)"/.test(navTpl),
  "刷新按钮 title 与 aria-label 同为 t('shell.navRefresh')"
);

/* ── ③ 不误伤：图标逻辑与 toast 反馈 ── */
section('不误伤：图标逻辑保持 STANDARD 分支');

// themeIconName 仍按 STANDARD 分内置图标/palette，与显示名解耦——
// 显示名改了查表方式，图标不能跟着被「顺手统一」
ok(
  /const themeIconName = computed\(\(\) => \(STANDARD\.includes\(store\.theme\)/.test(navScript),
  'themeIconName 保持 STANDARD 分支（内置主题用专属图标，自定义用 palette，与显示名解耦）'
);

// 切换后的 toast 同样带具体主题名（两分支都用 themeLabel.value，不得写死文案）
const cycleFn = /async function cycleTheme\(\)([\s\S]*?)\n}/.exec(navScript);
ok(!!cycleFn, 'cycleTheme 函数存在');
if (cycleFn) {
  const body = cycleFn[1];
  const switched = body.match(/toastInfo\(t\('shell\.themeSwitched', \{ theme: themeLabel\.value \}\)\)/g) || [];
  ok(switched.length === 2, `cycleTheme 两分支 toast 均带 themeLabel 具体名称（实得 ${switched.length} 处）`);
  ok(!/themeSwitched', \{ theme: t\('shell\.themeCustom'\)/.test(body), 'toast 不得写死「自定义」（要随当前主题变化）');
}

done();
