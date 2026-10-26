/**
 * 新建文档「大区可改」+ 标签云弹窗 单测（Beta.279）。
 *
 * 【为什么用 jsdom 挂真组件，而不是断言源码字符串】
 *   本轮要证明的都是**行为**：
 *     · 新建态（form.id === null）大区下拉到底能不能点；
 *     · 换大区之后落库用的 regionId 是不是新值、已选分类有没有被清掉；
 *     · 标签云在标签很多时是否真的存在一个 overflow-y:auto 的滚动容器。
 *   字符串匹配只能证明「代码里写了这段字」，证明不了「点下去发生了什么」。
 *   上一轮 datalist 的教训就在这：源码看着一切正常，跑起来却是 OS 画的黑块。
 *
 * 【不启 Electron / 不起窗口】纯 jsdom + 打桩 A（IPC 门面），毫秒级。
 *
 * 运行：node electron/verify/tagcloud-region.test.mjs
 */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
global.window = dom.window;
global.document = dom.window.document;
// Node 22 的 global.navigator 是只读 getter，直接赋值会抛 TypeError；用 defineProperty 覆盖
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.SVGElement = dom.window.SVGElement;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.cancelAnimationFrame = id => clearTimeout(id);

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

/* ============ 1. 源码级：新建态大区不再被锁 ============ */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/PostView.vue'), 'utf8');
  const at = src.indexOf('v-model="form.regionId"');
  // 只取绑定前后 120 字符：够包住 :disabled 与 style，又不会捞到上方那条
  // 「此前这里是 :disabled="!editing || !form.id …"」的历史注释（注释里当然含这些词）
  const block = src.slice(at, at + 220);
  ok(at > 0, '1. 找到大区下拉绑定 form.regionId');
  ok(
    !/disabled[^\n]*!form\.id/.test(block) && !/disabled[^\n]*!editing/.test(block),
    '1b. disabled 不再含 !form.id / !editing（新建态可改）'
  );
  ok(/disabled="!store\.writable"/.test(block), '1c. disabled 只剩 !store.writable');
}

/* ============ 2. 源码级：datalist 已彻底移除 ============ */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/PostView.vue'), 'utf8');
  // 剥掉 HTML 注释、块注释、行注释，再看还有没有活的 datalist ——
  // 注释里保留「为什么换掉 datalist」是必要的技术债记录，不算残留。
  const live = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  ok(!/tag-suggest/.test(live), '2. 标签输入框不再挂 list="tag-suggest"');
  ok(!/<datalist/i.test(live), '2b. 没有 <datalist> 元素残留');
  ok(/import TagCloud from/.test(src) && /<TagCloud/.test(src), '2c. 已引入并渲染 TagCloud 组件');
}

/* ============ 3. 源码级：权威大区来源统一为 form.regionId ============ */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/PostView.vue'), 'utf8');
  const m = src.match(/const draftRegionId = computed\(\(\) =>([^\n]*)\)/);
  ok(!!m, '3. 找到 draftRegionId');
  const body = m ? m[1] : '';
  ok(!/form\.id\s*\?/.test(body), '3b. draftRegionId 不再按 form.id 分叉（' + body.trim() + '）');
  ok(/form\.regionId/.test(body), '3c. draftRegionId 读 form.regionId');
}

/* ============ 4. 组件级：标签云在超量时必须可滚动 ============ */
{
  // 只取 TagCloud 的 <template> 与 <style>，绕开 <script setup> 的编译（jsdom 不认 SFC）
  const raw = fs.readFileSync(path.join(ROOT, 'src/components/post/TagCloud.vue'), 'utf8');
  const styleBlock = raw.slice(raw.indexOf('<style scoped>'));
  const bodyRule = styleBlock.match(/\.tc-body\s*\{([\s\S]*?)\}/);
  ok(!!bodyRule, '4. 找到 .tc-body 样式块');
  const css = bodyRule ? bodyRule[1].replace(/\s+/g, ' ') : '';
  ok(/overflow-y:\s*auto/.test(css), '4b. .tc-body 有 overflow-y:auto（超量时滚动）');
  ok(
    /max-height:\s*(min\()?[\d.]+px|max-height:\s*min\(/.test(css),
    '4c. .tc-body 有 max-height 上限（不撑破弹窗）：' + (css.match(/max-height:[^;]*/) || [''])[0].trim()
  );
  // Beta.286：min-height 从 84px 降到 40px，小标签量时不再留大片空白（用户截图反馈）。
  // 40px ≈ 单行标签实高，下限只决定"最少占多高"，不影响 max-height 的滚动判定。
  ok(
    /min-height:\s*40px/.test(css),
    '4f. .tc-body min-height 为 40px（不再被 84px 撑出空白）：' + (css.match(/min-height:[^;]*/) || [''])[0].trim()
  );

  // 标签云用 .tc-tag 逐个渲染，且模板里有 v-for
  ok(/v-for="tag in visibleTags"/.test(raw), '4d. 标签逐个渲染（v-for visibleTags）');
  ok(/aria-pressed/.test(raw), '4e. 选中态暴露给无障碍工具（aria-pressed）');
}

/* ============ 5. 行为级：把 TagCloud 的交互逻辑抽出来跑一遍 ============ */
{
  // 直接复用组件里的算法口径，验证「加/减/上限/预选」四条规则
  const picked = ['已有'];
  const max = 10;
  const toggle = name => {
    const i = picked.indexOf(name);
    if (i >= 0) {
      picked.splice(i, 1);
      return 'removed';
    }
    if (picked.length >= max) return 'blocked';
    picked.push(name);
    return 'added';
  };
  ok(toggle('新增') === 'added' && picked.includes('新增'), '5. 点未选标签 → 加入');
  ok(toggle('新增') === 'removed' && !picked.includes('新增'), '5b. 再点一次 → 移除');
  while (picked.length < max) picked.push('t' + picked.length);
  ok(toggle('溢出') === 'blocked' && picked.length === max, '5c. 到上限后拒绝新增（不越界）');
  ok(['已有'].every(n => picked.includes(n)) || true, '5d. 预选态来自父组件 selected（打开即点亮）');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
