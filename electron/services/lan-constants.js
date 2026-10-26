'use strict';
/**
 * 局域网共享常量：端口号等散落多处的魔法数字的单一来源。
 * 此前 DEFAULT_PORT=47373 在 ipc/lanshare.js 定义、DISCOVER_PORT=47471 在
 * services/lan-share.js 定义，且 lan-share.js 内部有一处漏定义直接引用 DEFAULT_PORT。
 * 现统一收敛到本模块，两处引用方各自 import。
 */
module.exports = {
  /** 共享 HTTP 服务默认监听端口（可被设置项 lan.port 覆盖） */
  DEFAULT_PORT: 47373,
  /** 局域网发现端口（UDP 广播 + 监听） */
  DISCOVER_PORT: 47471
};
