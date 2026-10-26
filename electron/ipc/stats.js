'use strict';
/**
 * 统计通道：首页概览与单大区维度统计。
 */
const db = require('../db');
const { I, handle } = require('./shared');

function registerStats() {
  handle('stats:home', async () => db.homeStats());
  handle('stats:region', async p => db.regionStats(I(p.regionId)));
  // 使用时长摘要：供「运行日志」分区展示（今日聚焦时长 + 近 7 日分布）
  handle('usage:summary', async () => db.usageStats());
}

module.exports = { registerStats };
