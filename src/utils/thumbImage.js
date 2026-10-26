/**
 * 缩略图生成：把一张图的 data: URI 缩成列表里用的小图（Beta.324）。
 *
 * 【为什么在渲染层缩，而不是主进程预生成】
 *   主进程有硬约束：运行时依赖白名单只有 sanitize-html + sql.js，没有图片解码器，
 *   也不能为此引入 sharp 这类原生库。而渲染层的 Chromium 自带完整解码 + canvas，
 *   缩略图是纯展示需求，放在看得见它的那一层最顺。
 *
 * 【为什么不直接 <img src="原图"> 再靠 CSS 压小】
 *   浏览器按**原图像素**解码：一张 4K 截图解码后是 33MB 位图，列表里同时可见
 *   七八行就是两三百 MB，滚动几下必然卡顿甚至崩。缩成 ≤88px 的 data URI 后，
 *   每张常驻内存只有几十 KB —— 这是「敢在列表里显示图」的前提。
 *
 * 【为什么点击看大图时不复用刚取过的原图】
 *   缓存 N 张原图就是把上面那个内存问题原样搬回来。按 id 重取一张（cleanup:imageData）
 *   只是本地 SQLite 读 + 一次 IPC，几毫秒到几十毫秒，换「内存有界」是值得的取舍。
 *
 * 【纯函数与浏览器 API 分开】
 *   thumbBox 是纯数学（单测在 Node 下直接覆盖）；makeThumbSrc 依赖
 *   createImageBitmap / canvas，仅渲染层可跑，导入本身不碰 DOM，Node 下可安全 import。
 */

/** 缩略图最长边（px）：列表行高约 56px，留 2px 余量；再大就失去「缩略」的意义 */
export const THUMB_MAX = 88;

/**
 * 由原图尺寸算出缩略图尺寸（等比，最长边不超过 max；原图更小时不放大）。
 * @returns {{w:number,h:number}} 尺寸非法（0/负/非数字）时返回 {w:0,h:0}
 */
export function thumbBox(natW, natH, max = THUMB_MAX) {
  const w = Math.floor(Number(natW) || 0);
  const h = Math.floor(Number(natH) || 0);
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const lim = Math.max(1, Number(max) || THUMB_MAX);
  const s = Math.min(1, lim / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * 生成缩略图 data URI（PNG）。
 *
 * 串行调用方负责（见 ImageInventory 的加载队列）：本函数会完整解码一张原图，
 * 并发太多会把内存瞬间抬高，一次只跑一张最稳。
 *
 * @param {string} uri 原图 data: URI
 * @param {number} [max] 最长边上限
 * @returns {Promise<string|null>} 成功返回小图 data URI；任何一步失败返回 null
 *   （调用方回落到「扩展名占位」，不让列表出现裂图）
 */
export async function makeThumbSrc(uri, max = THUMB_MAX) {
  try {
    // data: URI 可直接 fetch（Chromium 原生支持），比自己 atob + 逐字节拷贝快
    const res = await fetch(uri);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || typeof createImageBitmap !== 'function') return null;
    const bmp = await createImageBitmap(blob);
    try {
      const { w, h } = thumbBox(bmp.width, bmp.height, max);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    } finally {
      // 原图位图可能几十 MB：画完立刻释放，不等 GC
      if (bmp.close) bmp.close();
    }
  } catch (e) {
    return null;
  }
}
