import { onBeforeUnmount } from 'vue';

/**
 * 通用轮询 composable：把「按间隔重复执行 + 卸载自动收尾」收敛为单一来源。
 *
 * 使用方式：
 *   const { start, stop } = usePolling(pollFn, 15000);
 *   start();  // 开始轮询（重启语义：重复调用先停再起，不会叠加多个计时器）
 *   stop();   // 停止轮询
 *
 * 注意：pollFn 必须自行兜错（内部 try/catch）——本模块不吞异常，
 * 免得把调用方的 bug 藏成无声无息。
 *
 * 现有使用方：
 *   - Home.vue   首页统计常驻轮询（挂载即开始）
 *   - LanShare.vue 共享大区文档列表条件轮询（选中大区才开始，进详情/复位/卸载即停）
 */

/**
 * @param {() => any} fn 轮询执行体（可返回 Promise，模块不等待其结果）
 * @param {number} ms 轮询间隔（毫秒）
 * @returns {{ start: () => void, stop: () => void }}
 */
export function usePolling(fn, ms) {
  let timer = null;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop(); // 重启语义：防止重复 start 叠加出多个计时器（间隔错乱、请求翻倍）
    timer = setInterval(fn, ms);
  }

  // 组件卸载即停表：此前各页面自管 setInterval，漏清一处就会留下
  // 「页面已切走、定时器还在打 IPC」的幽灵请求
  onBeforeUnmount(stop);

  return { start, stop };
}
