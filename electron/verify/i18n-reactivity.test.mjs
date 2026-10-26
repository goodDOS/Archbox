/**
 * i18n 响应性单测（Beta.281）。
 *
 * 【用户反馈】「设置页导航栏文本不会及时更新」——切到英文后，右侧标题与主题卡已是英文，
 *   左侧导航仍是繁体（顯示設置 / 數據儲存 / 數據加密 …）。
 *
 * 【根因】导航项写成模块级常量数组：
 *     const SECTIONS = [{ label: t('settings.navDisplay') }, …]
 *   t() 在**模块求值那一刻**就执行完，label 被定格成当时的语言字符串。
 *   computed / 模板里都没有「读 lang」这个动作，语言切换因此传不到它身上。
 *
 * 【为什么这类 bug 值得单独立测】
 *   它不会报错、不会缺 key、类型也对 —— 只有"切了语言看界面"才暴露。
 *   而同类写法在项目里出现过多次（DisplaySection 的 langOptions、Taxonomy 的 TABS
 *   都曾是被修过的对象），所以这里做**全仓扫描**而不是只测这一个文件：
 *   任何人以后再写下 `const X = [{ label: t(...) }]` 都会被拦下。
 *
 * 运行：node electron/verify/i18n-reactivity.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

/** 从 lines[i] 的 `= [/{` 处起，按括号配对切出这段字面量的完整文本。
 *  跳过字符串与注释里的括号，避免 `'（'` 这种全角/半角混排把计数带偏。 */
function sliceLiteral(lines, startIdx, open) {
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = null;
  let out = '';
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // 起始行只从 `= [` / `= {` 之后开始计数
    const from = i === startIdx ? line.indexOf(open) : 0;
    if (from < 0) continue;
    out += line + '\n';
    for (let k = from; k < line.length; k++) {
      const ch = line[k];
      if (inStr) {
        if (ch === '\\') {
          k++;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === '/' && line[k + 1] === '/') break; // 行注释到行尾
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return out;
      }
    }
  }
  return out;
}

/** 递归收集 src 下的 vue/js 源文件 */
function collect(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) collect(p, out);
    else if (/\.(vue|js)$/.test(f)) out.push(p);
  }
  return out;
}

/**
 * 找出「模块级/顶层 const 定义，值里含 t(...) 但不是 computed/ref/reactive/函数」的写法。
 *
 * 判定要点：只看**能容纳多行元素**的数组/对象字面量（`= [` 或 `= {`）。
 * 单行字符串常量（`const K = t('x')`）不在其中 —— 那本来就是立即值，且不会有人
 * 把它当列表渲染；而列表的每一项都会在界面上出现，才是响应性问题的温床。
 */
function findStaticTConstants(src, file) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(\[|\{)/);
    if (!m) continue;
    /* 按括号配对取「这一段字面量本身」，不能按行数开窗 ——
     * 早先向下扫 40 行，会把紧跟其后的 `const typeOptions = computed(() => t(...))`
     * 一起圈进来，于是键映射表被误判成「静态译文表」。按配对切才准。 */
    const body = sliceLiteral(lines, i, m[2]);
    if (!body) continue;

    // ① 键映射表：值全是字典 key 字符串，本段内没有 t( 调用 → 渲染时才翻译，天然跟随语言
    if (!/\bt\(/.test(body)) continue;
    if (/computed\(|ref\(|reactive\(|\(\s*\)\s*=>/.test(line)) continue; // 已是响应式

    /* ② getter 表：`{ get saved () { return t('x') } }`。
     *    getter 每次读取都重新调 t()，读取时机即求值时机，是最正确的写法之一。
     *    这类表在 feedback.js 的 okMsg 里成规模存在，不排除会误报一片。
     *
     * 真正的问题写法只有一种：**普通属性值里直接调 t()**，求值一次就定死。
     */
    const hasGetter = /\bget\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*\{/.test(body);
    if (hasGetter) continue;
    // 普通属性 → 直接 t() 调用（`label: t(` 形式），且这段里没有任何 getter
    if (!/[A-Za-z_$'"]\s*:\s*t\(/.test(body)) continue;
    out.push({ file, line: i + 1, name: m[1] });
  }
  return out;
}

/* ============ 1. 全仓扫描：不应存在"静态 t() 列表" ============ */
console.log('[1] 全仓扫描静态 t() 列表');
{
  const bad = [];
  for (const f of collect(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    bad.push(...findStaticTConstants(src, path.relative(ROOT, f)));
  }
  ok(
    bad.length === 0,
    '没有「模块级常量数组里直接调 t()」的写法' +
      (bad.length ? ' → ' + bad.map(b => `${b.file}:${b.line} ${b.name}`).join(' | ') : '')
  );
}

/* ============ 2. 设置页导航必须是 computed ============ */
console.log('[2] 设置页导航');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/SettingsPage.vue'), 'utf8');
  ok(/const SECTIONS = computed\(/.test(src), 'SECTIONS 由 computed 产出');
  ok(!/const SECTIONS = \[\s*\n\s*\{ key: 'display'/.test(src), '没有退回静态数组写法');
  ok(/SECTIONS\.value\.some/.test(src), '脚本内引用改用 .value（否则 computed 对象上取不到 some）');
  ok(/<SettingsNav :sections="SECTIONS"/.test(src), '模板仍以 SECTIONS 传入（模板自动解包，不能写 .value）');
}

/* ============ 3. 同类已知点位全部为响应式 ============ */
console.log('[3] 其他同类点位');
{
  const cases = [
    ['src/pages/Taxonomy.vue', 'TABS'],
    ['src/components/settings/DisplaySection.vue', 'langOptions'],
    ['src/components/post/ShareMenu.vue', 'ACTIONS'],
    ['src/components/CopyTargetDialog.vue', 'MODES'],
    ['src/components/SearchFilters.vue', 'originOptions'],
    ['src/components/taxonomy/FieldModal.vue', 'typeOptions']
  ];
  for (const [rel, name] of cases) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      ok(false, `${rel} 不存在`);
      continue;
    }
    const src = fs.readFileSync(p, 'utf8');
    ok(new RegExp(`const ${name} = computed\\(`).test(src), `${rel} 的 ${name} 是 computed`);
  }
}

/* ============ 4. t() 的响应式依赖确实建立在 lang 上 ============ */
console.log('[4] t() 依赖 lang');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/i18n/index.js'), 'utf8');
  // t() 内必须读 lang.value（ref 解引用才会登记依赖）
  const tBody = src.slice(src.indexOf('export function t('), src.indexOf('export function t(') + 800);
  ok(/lang\.value/.test(tBody), 't() 内读取 lang.value（computed 才会随语言重算）');
  ok(/dictOf\(lang\.value\)/.test(tBody), '经由 dictOf 取字典，依赖链完整');
}

/* ============ 5. v-for 变量遮蔽 t()（Beta.282） ============ */
/**
 * 【用户反馈】「聚合管理标签页空白」—— 侧栏高亮在「聚合管理」，右侧整片是白的，
 *   连页头标题都没有。
 *
 * 【根因】Taxonomy.vue 的标签表格写的是：
 *     <tr v-for="t in tags" :key="t.id">
 *       …<button>{{ t('common.edit') }}</button>
 *
 *   模板里的 `t` 是 i18n 的翻译函数。但 `v-for="t in tags"` 把它变成了循环变量，
 *   于是循环体里的 `t(...)` 绑定到**标签对象**上。
 *   编译产物里看得最清楚：
 *     _renderList(_ctx.tags, (t) => … _toDisplayString(t('common.edit')))
 *                                    ^                                 ^
 *     同一行的 t 既是数据对象、又被当函数调。
 *   → 渲染每一行都抛 TypeError: t is not a function，
 *     Vue 中断整棵子树 → 页面一片空白。
 *
 * 【为什么症状这么刁钻】
 *   遮蔽只发生在**循环体内部**。页头标题、tabs、表头都在循环外，调用的是 _ctx.t，
 *   所以全部正常 —— 唯独列表行炸。而列表为空（没标签）时一行都不渲染，页面反而正常，
 *   属于典型的「数据一多就犯病」。
 *
 * 【怎么测】
 *   不靠正则猜源码，直接调 @vue/compiler-sfc 编译模板，看产物里有没有
 *   「未加 _ctx. 前缀的 t( 字符串调用」。编译器的判定就等于运行时行为，没有中间猜测。
 *   同时要求：只要某文件出现了 v-for 变量名叫 t，该项就必须通过 —— 哪怕当前没触发，
 *   也视为隐患（下次在循环体里加一行 t('…') 就会炸）。
 */
console.log('[5] v-for 变量遮蔽 t()');
{
  const { parse, compileTemplate } = await import('@vue/compiler-sfc');

  /** 编译一个 .vue 的模板，返回编译产物代码 */
  function compile(file) {
    const src = fs.readFileSync(file, 'utf8');
    const { descriptor } = parse(src, { filename: file });
    if (!descriptor.template) return '';
    const r = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: 'verify',
      compilerOptions: { prefixIdentifiers: true }
    });
    return r.code;
  }

  const offenders = []; // 真的把 t 当函数用、且被遮蔽
  const shadowers = []; // 用 t 当 v-for 变量（即使当前安全，也记下来）

  for (const f of collect(path.join(ROOT, 'src'))) {
    if (!f.endsWith('.vue')) continue;
    let code;
    try {
      code = compile(f);
    } catch (e) {
      continue;
    }
    if (!code) continue;

    // 收集 v-for 生成的渲染回调形参名：_renderList(x, (v) => …) 或 (v, k) => …
    const names = new Set();
    const reList = /_renderList\([^,]+,\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)/g;
    let m;
    while ((m = reList.exec(code))) {
      names.add(m[1]);
      if (m[2]) names.add(m[2]);
    }
    if (!names.has('t')) continue;

    shadowers.push(path.relative(ROOT, f));

    /* 找「裸 t('…')」：前面不是 _ctx. / $  / 标识符字符。
     * 编译产物里未解析的变量会原样输出成 t(...)，树内的上下文调用则是 _ctx.t(...)。
     * 用否定环视排除 _ctx.t / ctx.t / xxx.t 这类带前缀形式。 */
    const reBare = /(?<![\w$.])t\(\s*(['"`])/g;
    let hits = 0;
    while (reBare.exec(code)) hits++;
    if (hits > 0) offenders.push({ file: path.relative(ROOT, f), hits });
  }

  ok(
    shadowers.length === 0,
    '没有组件用 t 作 v-for 变量名（否则循环体内 t() 会被遮蔽）' +
      (shadowers.length ? ' → ' + shadowers.join(' | ') : '')
  );

  ok(
    offenders.length === 0,
    '编译产物中不存在被遮蔽的 t() 调用' +
      (offenders.length ? ' → ' + offenders.map(o => `${o.file}(${o.hits}处)`).join(' | ') : '')
  );

  // 定点回归：出过事的那个文件
  const tax = path.join(ROOT, 'src/pages/Taxonomy.vue');
  const taxSrc = fs.readFileSync(tax, 'utf8');
  const taxCode = compile(tax);
  /* 判据只看模板（descriptor.template.content），不看整份 .vue ——
   * 本文件头部有大量说明性注释，里面引用了 `v-for="t in tags"` 这段错误写法作为反例，
   * 拿整份文件跑正则会把注释也算命中，测试自己把自己判红。 */
  /* 判据只在「去掉注释后的模板」上跑。
   * 注意 HTML 注释 `<!-- … -->` 属于 descriptor.template.content 的一部分，
   * 而本文件头部正用 `v-for="t in tags"` 这段错误写法作反例，若不去注释会命中说明文字、
   * 把测试自己判红（第一次跑就是这么红的）。剥离注释只影响判据，不影响被测模板本身。 */
  const taxTpl = parse(taxSrc, { filename: 'Taxonomy.vue' }).descriptor.template.content.replace(
    /<!--[\s\S]*?-->/g,
    ''
  );
  ok(!/v-for="\s*t\s+(?:in|of)\s/.test(taxTpl), 'Taxonomy.vue 模板中无 t 作 v-for 变量（标签页曾因此整页白屏）');
  // 表格里必须用 tag 作变量，且 t() 仍是翻译函数
  ok(/v-for="tag in tags"/.test(taxSrc), '标签表格使用 tag 作循环变量');
  ok(/_ctx\.t\(\s*['"]common\.edit['"]/.test(taxCode), 'Taxonomy.vue 编辑按钮的 t() 编译为 _ctx.t（未被循环变量吃掉）');
  ok(/_ctx\.t\(\s*['"]common\.delete['"]/.test(taxCode), 'Taxonomy.vue 删除按钮的 t() 编译为 _ctx.t');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
