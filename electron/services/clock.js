'use strict';
const i18n = require('../i18n');
/**
 * 系统时钟可信度检查。
 *
 * 背景：文档盒的审计日志、加密相关时间戳都依赖系统墙钟（Date.now()）。
 * 若用户手动回拨系统时间，审计记录会出现时间倒序，破坏时间戳可信度。
 *
 * 难点：纯 JS 无法获得「不受系统时间回拨影响」的时钟。这里用 process.uptime()
 * （进程已运行秒数，单调递增，不受系统时间修改影响）作为锚点，在启动时记录
 * 「墙钟锚点 = Date.now()」与「uptime 锚点 = process.uptime()」；之后任意时刻的
 * 「期望墙钟 = 墙钟锚点 + (当前 uptime - uptime 锚点) * 1000」，与真实 Date.now()
 * 比较即得漂移，从而检测回拨/大幅前跳。
 *
 * 另在 userData/clock.json 持久化「上次启动墙钟」，用于跨会话回拨检测。
 *
 * checkDrift(now, up) 的两个参数默认取 Date.now()/process.uptime()，可注入以便测试。
 */
const path = require('path');
const { readJson, writeJson } = require('./userdata-store');

const BACK_THRESHOLD_MS = 3000; // 会话内回拨超过 3 秒即告警
const FORWARD_THRESHOLD_MS = 300000; // 会话内前跳超过 5 分钟才告警（前跳对审计顺序影响较小）
const SESSION_BACK_THRESHOLD_MS = 1000; // 本次启动早于上次启动记录超过 1 秒即告警

let _dir = '';
let _anchorWall = 0;
let _anchorUp = 0;
let _lastBootWall = 0;
let _inited = false;

function readPersisted() {
  const j = readJson(path.join(_dir, 'clock.json'), {});
  if (j && typeof j.lastBootWall === 'number') return j;
  return { lastBootWall: 0 };
}

function persist() {
  writeJson(path.join(_dir, 'clock.json'), { lastBootWall: _anchorWall, updatedAt: Date.now() });
}

function initClock(app) {
  _dir = app.getPath('userData');
  const prev = readPersisted();
  _lastBootWall = prev.lastBootWall || 0;
  _anchorWall = Date.now();
  _anchorUp = process.uptime();
  _inited = true;
  persist();
}

/**
 * 检测时钟异常。
 * @returns {{ok:boolean, type:string, driftMs:number, reason?:string, now?:number, expected?:number, lastBootWall?:number}}
 */
function checkDrift(now = Date.now(), up = process.uptime()) {
  if (!_inited) return { ok: true, driftMs: 0, type: 'ok' };

  // 跨会话回拨：本次启动时间早于上次启动记录
  if (_lastBootWall && now < _lastBootWall - SESSION_BACK_THRESHOLD_MS) {
    return {
      ok: false,
      type: 'session-back',
      driftMs: now - _lastBootWall,
      now,
      lastBootWall: _lastBootWall,
      reason: i18n.errKey('sys.clockBackdrift')
    };
  }

  // 会话内漂移：期望墙钟 = 锚点墙钟 + (当前 uptime - 锚点 uptime)
  const expected = _anchorWall + (up - _anchorUp) * 1000;
  const drift = now - expected;
  if (drift < -BACK_THRESHOLD_MS) {
    return {
      ok: false,
      type: 'back',
      driftMs: drift,
      now,
      expected,
      reason: i18n.errKey('sys.clockRollback', { n: Math.abs(Math.round(drift / 1000)) })
    };
  }
  if (drift > FORWARD_THRESHOLD_MS) {
    return {
      ok: false,
      type: 'forward',
      driftMs: drift,
      now,
      expected,
      reason: i18n.errKey('sys.clockJump', { n: Math.round(drift / 60000) })
    };
  }
  return { ok: true, driftMs: drift, type: 'ok' };
}

module.exports = { initClock, checkDrift };
