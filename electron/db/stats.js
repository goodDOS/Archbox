'use strict';
/**
 * 统计：首页概览、大区维度统计（分类/标签/字段填充与分布）
 * 依赖 core（查询助手）、posts（列表）、taxonomy（字段定义）。
 */
const core = require('./core');
const posts = require('./posts');
const taxonomy = require('./taxonomy');
const i18n = require('../i18n');
const timefmt = require('../services/timefmt');
const sysdrive = require('../services/sysdrive');
const { dirSize } = require('../services/fs-utils');

const { all, get, run, todayStr } = core;
const { listFieldDefs } = taxonomy;

function homeStats() {
  const c = get(`SELECT
    (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) posts,
    (SELECT COUNT(*) FROM regions) regions,
    (SELECT COUNT(*) FROM categories) cats,
    (SELECT COUNT(*) FROM tags) tags,
    (SELECT COUNT(*) FROM field_defs) fields,
    (SELECT COUNT(*) FROM users) users,
    (SELECT COUNT(*) FROM notes) notes`);
  // 近 7 日新增 + 前 7 日（用于环比）
  const new7 = get(
    "SELECT COUNT(*) n FROM posts WHERE deleted_at IS NULL AND date(created_at)>=date('now','localtime','-6 days')"
  ).n;
  const newPrev7 = get(
    "SELECT COUNT(*) n FROM posts WHERE deleted_at IS NULL AND date(created_at)>=date('now','localtime','-13 days') AND date(created_at)<date('now','localtime','-6 days')"
  ).n;
  // 未分类文档（category_id 为空）
  const uncat = get(
    'SELECT COUNT(*) n FROM posts WHERE deleted_at IS NULL AND (category_id IS NULL OR category_id=0)'
  ).n;
  // 草稿 / 回收站待清理
  const drafts = get("SELECT COUNT(*) n FROM posts WHERE deleted_at IS NULL AND status='draft'").n;
  const trash = get('SELECT COUNT(*) n FROM posts WHERE deleted_at IS NOT NULL').n;
  // 近 7 日异常操作（审计日志中标记为失败/异常/错误的动作）
  const abnormal7 = get(
    "SELECT COUNT(*) n FROM audit_log WHERE date(created_at)>=date('now','localtime','-6 days') AND (action LIKE '%失败%' OR action LIKE '%异常%' OR action LIKE '%错误%')"
  ).n;
  // 上次备份时间（设置项，JSON 字符串存储）
  let lastBackupAt = null;
  try {
    const row = get("SELECT value FROM settings WHERE key='backup.lastAt'");
    if (row) lastBackupAt = JSON.parse(row.value);
  } catch (e) {}
  // 数据加密状态 + 本地存储占用
  const encrypted = core.isEncryptedMode();
  const storagePath = core.dataDirPath();
  const onSystemDrive = sysdrive.isOnSystemDrive(storagePath);
  // 所在盘符（如 "D:"）：首页「数据库位置」卡片直接展示它，不再展示完整路径（过长不好看）
  const storageDrive = sysdrive.driveOf(storagePath);
  const storageBytes = dirSize(storagePath);
  const last7 = [];
  const byDay = {};
  all(
    "SELECT date(created_at) d, COUNT(*) c FROM posts WHERE deleted_at IS NULL AND date(created_at)>=date('now','localtime','-6 days') GROUP BY d"
  ).forEach(r => {
    byDay[r.d] = r.c;
  });
  for (let i = 6; i >= 0; i--) {
    const key = timefmt.localDate(new Date(Date.now() - i * 86400000));
    last7.push({ label: key.slice(5), count: byDay[key] || 0 });
  }
  // 自动备份检测：schedule ∈ {daily,weekly} 且 targetDir 非空才算「已开启且已配置」
  // （与 services/auto-backup.js:maybe() 同源判断；settings 值经 JSON.stringify 存储，须 JSON.parse 还原）
  let autoBackup = { enabled: false, schedule: 'off' };
  try {
    const schedRow = get("SELECT value FROM settings WHERE key='backup.schedule'");
    const targetRow = get("SELECT value FROM settings WHERE key='backup.targetDir'");
    let schedule = 'off';
    let targetDir = '';
    try {
      schedule = schedRow ? JSON.parse(schedRow.value) : 'off';
    } catch (e) {}
    try {
      targetDir = targetRow ? JSON.parse(targetRow.value) : '';
    } catch (e) {}
    autoBackup = {
      enabled: (schedule === 'daily' || schedule === 'weekly') && !!targetDir,
      schedule: schedule || 'off'
    };
  } catch (e) {}
  const recent = posts.listPosts({ limit: 8 });
  const usage = usageStats();
  // ---- 登录统计（数据源：audit_log 中 action='登录'，即成功登录）----
  // 今日：登录次数 + 登录人数（同一用户多次登录只计 1 人）
  const loginToday = get(
    'SELECT COUNT(*) times, COUNT(DISTINCT user_id) users FROM audit_log ' +
      "WHERE action='登录' AND date(created_at)=date('now','localtime')"
  );
  // 近 7 日登录人数：同窗口下按 user_id 去重（同一用户多次登录只计 1 人）
  const loginUsers7 =
    get(
      'SELECT COUNT(DISTINCT user_id) n FROM audit_log ' +
        "WHERE action='登录' AND date(created_at)>=date('now','localtime','-6 days')"
    ).n || 0;
  // 近 7 日排行：按用户聚合次数（user_name 在审计中冗余存储，可直接展示，无需 JOIN users）
  const loginRank7 = all(
    'SELECT user_id, user_name, COUNT(*) times, MAX(created_at) lastAt FROM audit_log ' +
      "WHERE action='登录' AND date(created_at)>=date('now','localtime','-6 days') " +
      'GROUP BY user_id, user_name ORDER BY times DESC, user_name ASC'
  );
  // 今日登录名单：与 loginRank7 同构，窗口收窄为今日，供首页逐用户展示（含具体是谁）
  const loginTodayList = all(
    'SELECT user_id, user_name, COUNT(*) times, MAX(created_at) lastAt FROM audit_log ' +
      "WHERE action='登录' AND date(created_at)=date('now','localtime') " +
      'GROUP BY user_id, user_name ORDER BY times DESC, user_name ASC'
  );
  // 今日登录失败次数（安全审计：异常登录尝试，由 users.js failAudit 写入）
  const loginFailToday = get(
    "SELECT COUNT(*) n FROM audit_log WHERE action='登录失败' AND date(created_at)=date('now','localtime')"
  ).n;
  return {
    ...c,
    new7,
    newPrev7,
    uncat,
    drafts,
    trash,
    abnormal7,
    lastBackupAt,
    encrypted,
    storageBytes,
    storagePath,
    storageDrive,
    onSystemDrive,
    last7,
    recent,
    usageToday: usage.today,
    usage7: usage.last7,
    usagePrev7: usage.prev7,
    autoBackup,
    loginTodayUsers: loginToday.users || 0,
    loginTodayTimes: loginToday.times || 0,
    loginTodayList,
    loginRank7,
    loginUsers7,
    loginFailToday: loginFailToday || 0
  };
}

function incrementUsage(seconds) {
  const today = todayStr();
  const row = get('SELECT seconds FROM usage_stats WHERE date=?', [today]);
  if (row) {
    run('UPDATE usage_stats SET seconds = seconds + ? WHERE date=?', [seconds, today]);
  } else {
    run('INSERT INTO usage_stats(date, seconds) VALUES(?, ?)', [today, seconds]);
  }
}

function usageStats() {
  const today = todayStr();
  const row = get('SELECT seconds FROM usage_stats WHERE date=?', [today]);
  const todaySeconds = row ? row.seconds : 0;
  const byDay = {};
  // 取近 14 天，便于计算「近 7 日 vs 前 7 日」环比
  all("SELECT date, seconds FROM usage_stats WHERE date>=date('now','localtime','-13 days')").forEach(r => {
    byDay[r.date] = r.seconds;
  });
  const build = fromOffset => {
    const arr = [];
    for (let i = fromOffset + 6; i >= fromOffset; i--) {
      const key = timefmt.localDate(new Date(Date.now() - i * 86400000));
      arr.push({ label: key.slice(5), seconds: byDay[key] || 0 });
    }
    return arr;
  };
  const last7 = build(0); // 今日往前 0~6 天
  const prev7 = build(7); // 今日往前 7~13 天（前 7 日，用于环比）
  return { today: todaySeconds, last7, prev7 };
}
function regionStats(regionId) {
  const rid = parseInt(regionId, 10);
  const region = get('SELECT * FROM regions WHERE id=?', [rid]);
  if (!region) throw new Error(i18n.errKey('common.errRegionMissing'));
  const total = get('SELECT COUNT(*) n FROM posts WHERE region_id=? AND deleted_at IS NULL', [rid]).n;
  // name 留空给渲染层兜底：主进程不知道界面语言（前端按 common.unclassified 兜底显示）
  const byCategory = all(
    `SELECT COALESCE(c.name,'') name, COUNT(*) c FROM posts p
    LEFT JOIN categories c ON c.id=p.category_id WHERE p.region_id=? AND p.deleted_at IS NULL GROUP BY c.name ORDER BY c DESC`,
    [rid]
  );
  const byTag = all(
    `SELECT t.name, COUNT(*) c FROM post_tags pt JOIN posts p ON p.id=pt.post_id
    JOIN tags t ON t.id=pt.tag_id WHERE p.region_id=? AND p.deleted_at IS NULL AND TRIM(t.name)<>'' GROUP BY t.name ORDER BY c DESC LIMIT 12`,
    [rid]
  );
  const fieldStats = [];
  for (const d of listFieldDefs()) {
    const base = { code: d.code, name: d.name, type: d.type };
    const filled = get(
      'SELECT COUNT(*) n FROM post_fields pf JOIN posts p ON p.id=pf.post_id WHERE pf.field_def_id=? AND p.region_id=? AND p.deleted_at IS NULL AND pf.value<>""',
      [d.id, rid]
    ).n;
    const distinct = get(
      'SELECT COUNT(DISTINCT pf.value) n FROM post_fields pf JOIN posts p ON p.id=pf.post_id WHERE pf.field_def_id=? AND p.region_id=? AND p.deleted_at IS NULL AND pf.value<>""',
      [d.id, rid]
    ).n;
    base.filled = filled;
    base.distinct = distinct;
    if (d.type === 'number') {
      const agg = get(
        `SELECT MIN(CAST(pf.value AS REAL)) mn, MAX(CAST(pf.value AS REAL)) mx, AVG(CAST(pf.value AS REAL)) av, SUM(CAST(pf.value AS REAL)) sm
        FROM post_fields pf JOIN posts p ON p.id=pf.post_id WHERE pf.field_def_id=? AND p.region_id=? AND p.deleted_at IS NULL AND pf.value<>""`,
        [d.id, rid]
      );
      base.numeric =
        agg && agg.mn !== null
          ? {
              min: agg.mn,
              max: agg.mx,
              avg: Math.round((agg.av || 0) * 100) / 100,
              sum: Math.round((agg.sm || 0) * 100) / 100
            }
          : null;
    }
    const top = all(
      `SELECT pf.value v, COUNT(*) c FROM post_fields pf JOIN posts p ON p.id=pf.post_id
      WHERE pf.field_def_id=? AND p.region_id=? AND p.deleted_at IS NULL AND pf.value<>"" GROUP BY pf.value ORDER BY c DESC LIMIT 6`,
      [d.id, rid]
    );
    base.top = top;
    fieldStats.push(base);
  }
  return { region, total, byCategory, byTag, fieldStats };
}

module.exports = {
  homeStats,
  regionStats,
  usageStats,
  incrementUsage
};
