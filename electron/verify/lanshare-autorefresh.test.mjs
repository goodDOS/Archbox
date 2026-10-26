/**
 * #417 共享大区文档列表自动刷新（轮询）验证。
 *
 * 覆盖两层：
 *   ① usePolling 组合式行为 —— 真实计时 + 打桩全局计时器，验证
 *      「按间隔重复执行 / stop 即停 / 重复 start 不叠加计时器」；
 *   ② LanShare.vue 与 Home.vue 的接线契约（静态源码断言）——
 *      开表/停表点是否落在正确的交互边界上、silent 语义与两道防重叠
 *      保护是否在位、Home.vue 旧的自管计时器实现是否已真正删除
 *      （收敛合并的验收口径：旧副本不允许「暂时保留」）。
 *
 * 运行：node electron/verify/lanshare-autorefresh.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_harness.mjs';

const { ok, section, done } = createHarness();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 1. usePolling 组合式行为 ---------------- */
section('1. usePolling 组合式行为');

// vue 的 onBeforeUnmount 在无组件实例时会 warn（测试环境调用属预期），
// 静音以免把预期警告误读成测试失败
const origWarn = console.warn;
console.warn = () => {};
const { usePolling } = await import('../../src/composables/usePolling.js');

// ① 真实计时：start 后按间隔重复执行，stop 后不再执行
{
  let fired = 0;
  const { start, stop } = usePolling(() => fired++, 10);
  start();
  await sleep(45);
  const beforeStop = fired;
  stop();
  await sleep(60);
  ok(beforeStop >= 2, `start 后按间隔重复执行（45ms 内触发 ${beforeStop} 次 ≥ 2）`);
  ok(fired === beforeStop, `stop 后彻底停表（停止后再等 60ms 无新增触发：${beforeStop} → ${fired}）`);
}

// ② 打桩全局计时器：重复 start 必须先停再起（不叠加），stop 幂等
{
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  let intervalCalls = 0;
  const cleared = [];
  globalThis.setInterval = (fn, ms) => {
    intervalCalls++;
    return realSetInterval(fn, ms);
  };
  globalThis.clearInterval = id => {
    cleared.push(id);
    return realClearInterval(id);
  };
  try {
    let fired = 0;
    const { start, stop } = usePolling(() => fired++, 10);
    start();
    start(); // 重启语义：应先清掉旧计时器再建新的
    ok(
      intervalCalls === 2 && cleared.length === 1,
      `重复 start 先停再起（建表 ${intervalCalls} 次、清表 ${cleared.length} 次，未叠加）`
    );
    await sleep(50);
    ok(fired >= 1, `重启后仍在正常轮询（50ms 内触发 ${fired} 次）`);
    stop();
    stop(); // 幂等：第二次不应再产生 clear
    ok(intervalCalls === 2 && cleared.length === 2, `stop 幂等（重复 stop 不重复清表：${cleared.length} 次）`);
  } finally {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  }
}
console.warn = origWarn;

/* ---------------- 2. LanShare.vue 接线契约 ---------------- */
section('2. LanShare.vue 接线契约');
const lan = fs.readFileSync(path.join(ROOT, 'src/pages/LanShare.vue'), 'utf8');

ok(
  /import \{ usePolling \} from '\.\.\/composables\/usePolling';/.test(lan),
  '引入 usePolling（计时器收敛到单一来源）'
);
ok(
  /const \{ start: startPostsPoll, stop: stopPostsPoll \} = usePolling\(pollPosts, 15000\);/.test(lan),
  '轮询执行体 pollPosts + 15s 间隔已接线'
);

// 开表点：选中大区拉完列表后
ok(
  /await fetchPosts\(\);\s*\n\s*startPostsPoll\(\);/.test(lan),
  'selectRegion 选中大区后开表（含重启语义，不会叠加多个计时器）'
);
// 停表点：进入文档详情（看单篇快照，列表不在舞台上）
ok(/post\.value = p;\s*\n\s*stopPostsPoll\(\);/s.test(lan), 'openPost 进入详情停表');
// 重新开表：返回列表
ok(/post\.value = null;\s*\n\s*startPostsPoll\(\);/s.test(lan), 'backToList 回列表重新开表');
// 停表点：浏览态复位（对方关闭共享等）
ok(
  /findClose\(\); \/\/ Beta\.219：详情视图可能被此处卸载，收尾页内查找（幂等）\s*\n\s*stopPostsPoll\(\);/s.test(lan),
  'resetBrowse 浏览态复位停表'
);

// silent 语义：失败保留上次数据、不弹 toast；在途让位手动；旧响应作废
ok(
  /if \(opts\.silent && postsInflight > 0\) return;/.test(lan),
  '轮询让位手动：已有拉取在途时静默跳过（用户点击/翻页/搜索永不被挡）'
);
ok(
  /if \(seq !== postsFetchSeq\) return; \/\/ 已有更新的请求发起，本次旧响应作废/.test(lan) &&
    (lan.match(/if \(seq !== postsFetchSeq\) return;/g) || []).length === 2,
  '旧响应作废保护覆盖成功与失败两条返回路径'
);
ok(
  /if \(opts\.silent\) return; \/\/ 轮询静默失败：保留上次数据，不弹 toast、不清空/.test(lan),
  '轮询失败静默：不弹 toast、不清空列表（保留上次数据继续可浏览）'
);
ok(
  /async function pollPosts\(\) \{[\s\S]*?if \(post\.value\) return;[\s\S]*?await fetchPosts\(\{ silent: true \}\);/.test(
    lan
  ),
  'pollPosts 详情态不轮询 + 走 silent 通道'
);

/* ---------------- 3. Home.vue 收敛验收 ---------------- */
section('3. Home.vue 收敛验收（旧实现已删）');
const home = fs.readFileSync(path.join(ROOT, 'src/pages/Home.vue'), 'utf8');
ok(!/setInterval|clearInterval/.test(home), 'Home.vue 不再自管计时器（无 setInterval/clearInterval 残留）');
ok(
  /const \{ start: startPoll \} = usePolling\(poll, POLL_MS\);\s*\n\s*onMounted\(startPoll\);/.test(home),
  'Home.vue 轮询改走 usePolling（挂载即开始）'
);
ok(!/if \(pollTimer\) clearInterval\(pollTimer\);/.test(home), '旧的 pollTimer 卸载收尾已删除（无「暂时保留」副本）');

/* ---------------- 4. usePolling 卸载收尾 ---------------- */
section('4. usePolling 卸载收尾');
const up = fs.readFileSync(path.join(ROOT, 'src/composables/usePolling.js'), 'utf8');
ok(/onBeforeUnmount\(stop\);/.test(up), '组件卸载自动停表（不会留下页面切走还在打 IPC 的幽灵请求）');

done();
