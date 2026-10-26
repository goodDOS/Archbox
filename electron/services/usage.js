'use strict';
/**
 * 使用时长统计：仅累计「窗口聚焦时长」。
 * 数据库解锁后启动秒级计时，但只有窗口处于聚焦（focus）态时才累加；
 * 窗口失焦（blur / 切到别的程序 / 最小化）立即暂停，并将已累计的聚焦秒数落库。
 * 每满 15 个聚焦秒 flush 一次到 usage_stats 表并持久化；退出前 stop() 强制 flush。
 */
const db = require('../db');
const { getLog } = require('./logger');

let timer = null;
let focused = false;
let pendingSeconds = 0;

function tick() {
  if (!focused) return;
  pendingSeconds++;
  if (pendingSeconds >= 15) flush();
}

function start() {
  if (timer) return;
  if (!db || typeof db.incrementUsage !== 'function') return;
  focused = false;
  pendingSeconds = 0;
  timer = setInterval(tick, 1000);
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  flush();
  focused = false;
  pendingSeconds = 0;
}

// 窗口聚焦态变化：聚焦时恢复累加，失焦时暂停并落库已累计的聚焦秒数
function setFocused(v) {
  if (v === focused) return;
  focused = !!v;
  if (!focused) flush();
}

function flush() {
  if (!pendingSeconds) return;
  try {
    if (db && typeof db.incrementUsage === 'function') {
      db.incrementUsage(pendingSeconds);
      db.persist();
    }
  } catch (e) {
    getLog().warn('[usage] flush failed: ' + (e && e.message));
  }
  pendingSeconds = 0;
}

module.exports = { start, stop, flush, setFocused };
