/**
 * 测试断言统一骨架（单一来源）。
 *
 * 此前 43 个 verify 脚本各自复制 `let pass=0, fail=0` + `function ok(cond,msg)` +
 * 结尾 `console.log(结果)` + `process.exit(fail?1:0)` 四件套。现抽到此处，
 * 新脚本 / 迁移中的脚本 import 即可，避免断言口径分叉。
 *
 * 用法（ESM）：
 *   import { createHarness } from './_harness.mjs'
 *   const { ok, section, done } = createHarness()
 *   section('1. 基础')
 *   ok(a === b, '说明')
 *   done()
 *
 * `section` 打印 `[N] 标题`（可选，仅美化输出）；`done` 打印汇总并设置 exit code。
 * 保留 `ok` 的 `✓/✗` 输出格式与现有脚本逐字一致，避免打断依赖输出文案的上游。
 */
export function createHarness() {
  let pass = 0;
  let fail = 0;

  function ok(cond, msg) {
    if (cond) {
      pass++;
      console.log('  ✓ ' + msg);
    } else {
      fail++;
      console.error('  ✗ ' + msg);
    }
  }

  function section(title) {
    console.log(`[${title}]`);
  }

  function done() {
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail > 0) process.exitCode = 1;
  }

  return {
    ok,
    section,
    done,
    get pass() {
      return pass;
    },
    get fail() {
      return fail;
    }
  };
}

/** 便捷默认实例：单文件直接 `import { ok, done } from './_harness.mjs'` 使用 */
const def = createHarness();
export const ok = def.ok;
export const section = def.section;
export const done = def.done;

/**
 * 把 jsdom 的 window 挂成全局，供 ProseMirror / Tiptap 等浏览器端库在 Node 里运行。
 *
 * 【为什么必须由这里统一做，而不是各测试自己写四行】
 *   原先 `postfind` / `editfind` 各自复制一份 `global.window/document/NodeFilter/
 *   getComputedStyle`，**漏了 `navigator`**。这在 Node 22 上碰巧能跑 ——
 *   Node 21+ 自带全局 `navigator`（`typeof navigator === 'object'`），
 *   jsdom 26 与 ProseMirror 摸到全局 navigator 就成了。
 *   但 CI 用 Node 20、用户可能用 Node 18，那里**没有**全局 navigator，
 *   于是 jsdom 初始化直接抛 `ReferenceError: navigator is not defined`，
 *   测试整个文件红掉 —— 而代码本身没任何问题，是夹具对 Node 版本产生了隐式依赖。
 *
 * 【为什么要一起挂 MutationObserver / Element / HTMLElement / requestAnimationFrame】
 *   ProseMirror 在 Node 里读写这几项，缺哪个就在某个具体用例上莫名失败，
 *   一次补齐比等它一个个报错再补省事。`pretendToBeVisual: true` 已提供 rAF。
 *
 * @param {JSDOM} dom jsdom 实例
 */
export function installDomGlobals(dom) {
  const w = dom.window;
  const keys = [
    'window',
    'document',
    'navigator', // ★ 关键：Node < 21 没有全局 navigator，缺它 jsdom 26 直接抛错
    'NodeFilter',
    'Node',
    'Element',
    'HTMLElement',
    'DocumentFragment',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ];
  for (const k of keys) {
    if (w[k] === undefined) continue;
    // ★ 不能直接 `global[k] = w[k]`：Node 21+ 的全局 navigator 是**只读 getter**，
    //   直接赋值会抛 `TypeError: Cannot set property navigator of #<Object> which has only a getter`。
    //   （这个坑只在 Node 21+ 出现，模拟 Node 20 时反而看不到 —— 因为那里压根没这个属性。）
    //   用 defineProperty 重新定义即可覆盖只读 getter。
    try {
      Object.defineProperty(global, k, {
        value: w[k],
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch {
      // 极少数不可重定义的宿主属性：跳过即可，不让夹具因为一个属性把整个测试搞崩
    }
  }
  // `global.window` 必须指回 jsdom 的 window 本身，库常用 `window.document` 兜底
  try {
    Object.defineProperty(global, 'window', {
      value: w,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch {}
  return dom;
}
