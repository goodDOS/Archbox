'use strict';
/**
 * 统一时间格式化（主进程侧）。
 *
 * 背景：此前日志用 toISOString() 记 UTC，比本地时间（UTC+8）早 8 小时，
 * 造成「日志时间比系统时间慢 8 小时」的困惑。这里统一按
 *   「毫秒时间戳 | 本地时间 (时区)」
 * 输出，凡是自动获取的时间都显式标注时区，杜绝歧义。
 *
 * 注意：数据库存储字段（nowIso）保持纯净的 YYYY-MM-DD HH:MM:SS，
 * 因为它会被 SQLite 的 date() 解析；时区标注只发生在「显示 / 日志 / 导出」层，
 * 通过 withTz() 在展示时追加，不污染存储格式。
 */
function tzLabel(d = new Date()) {
  const off = -d.getTimezoneOffset(); // 分钟，东半球为正
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function localTime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 紧凑日期：YYYYMMDD（导出文件名用） */
function compactDate(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** 紧凑时间戳：YYYYMMDD_HHMMSS（导出文件名用，秒级唯一） */
function compactStamp(d = new Date()) {
  return `${compactDate(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 紧凑时间戳（分钟级）：YYYYMMDD_HHMM（全量备份文件名用） */
function compactStampMinute(d = new Date()) {
  return `${compactDate(d)}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// 完整时间戳：毫秒时间戳 | 本地时间 (时区)
function stamp(d = new Date()) {
  return `${d.getTime()} | ${localTime(d)} (${tzLabel(d)})`;
}

// 给已有时分秒字符串补时区（用于 DB 存取的展示字段 / 导出文件）。
// 仅带时间成分的字符串才补；纯日期、已带时区、或非字符串原样返回。
function withTz(s) {
  if (!s || typeof s !== 'string') return s;
  if (/\bUTC[+-]/.test(s)) return s;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return s;
  return `${s} (${tzLabel()})`;
}

module.exports = { tzLabel, localTime, localDate, compactDate, compactStamp, compactStampMinute, stamp, withTz };
