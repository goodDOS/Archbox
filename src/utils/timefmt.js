/**
 * 统一时间格式化（渲染进程侧，与主进程 electron/services/timefmt.js 逻辑一致）。
 * 凡是自动获取并在界面上展示的时间，都通过 withTz() 显式标注时区。
 */
import { t } from '../i18n';

// 时区标签：UTC+8 / UTC+5:30 / UTC-3
export function tzLabel(d = new Date()) {
  const off = -d.getTimezoneOffset(); // 分钟，东半球为正
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

const pad = n => String(n).padStart(2, '0');

export function localTime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 本地时间（到分钟）+ 时区标签，用于「上次备份」等展示位。
// 传入毫秒时间戳 / Date / 可被 Date 解析的字符串皆可；空值返回 fallback。
export function localMinuteTz(t, fallback = '') {
  if (!t) return fallback;
  const d = t instanceof Date ? t : new Date(t);
  if (isNaN(d.getTime())) return fallback;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} (${tzLabel(d)})`;
}

// 紧凑日期时间（M-DD HH:mm，月不补零）：托盘弹窗等窄场景用。
// pad 只允许出现在本文件内（standardize [5] 前端无内联 pad 断言依赖此口径）。
export function compactDateTime(d = new Date()) {
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 完整时间戳：毫秒时间戳 | 本地时间 (时区)
export function stamp(d = new Date()) {
  return `${d.getTime()} | ${localTime(d)} (${tzLabel(d)})`;
}

// 给已有时分秒字符串补时区（用于 DB 存取的展示字段）。
// 仅带时间成分的字符串才补；纯日期、已带时区、或非字符串原样返回。
export function withTz(s) {
  if (!s || typeof s !== 'string') return s;
  if (/\bUTC[+-]/.test(s)) return s;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return s;
  return `${s} (${tzLabel()})`;
}

// 将秒数格式化为人类可读的时长（用于使用时长统计卡片），仅到分钟，不显示秒。
// 中文输出与字典化之前逐字一致（'不到1分' / '5分' / '2时30分' / '3天4时5分'），
// 只是改走 i18n——切换语言后时长卡不再定格在中文。
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return t('time.durUnderMin');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.durMin', { n: m });
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return t('time.durHourMin', { h, m: rm });
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return t('time.durDayHourMin', { d, h: rh, m: rm });
}

// 将字节格式化为人类可读的体积（用于「本地存储占用」卡片）
export function formatBytes(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

// 距今天数（用于「上次备份距今」）；传入 YYYY-MM-DD HH:MM:SS，返回整数天（0=今天）
export function daysAgo(iso) {
  if (!iso) return null;
  const t = new Date(String(iso).replace(' ', 'T')).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// 从存储的日期时间字符串中取日期部分（YYYY-MM-DD）。
// 存储口径统一为 YYYY-MM-DD HH:MM:SS，取前 10 位即日期；空值返回 ''。
export function dateOnly(s) {
  if (!s || typeof s !== 'string') return '';
  return s.slice(0, 10);
}
