'use strict';
/**
 * 托盘通道：自绘托盘弹窗的数据源（tray:data）、动作执行（tray:action）、
 * 尺寸回报（tray:resize），以及「最近浏览」打点（view:mark）。
 *
 * 为什么「最近浏览」不用 posts.updated_at 顶替：
 *   updated_at 只在保存时变，仅仅打开看过一篇文档并不会留下痕迹 ——
 *   托盘要的是「我刚才在看什么」，所以另存一份浏览历史。落地方式与
 *   search-history 完全一致（userData JSON，按用户隔离）：file:// 下
 *   localStorage 被沙盒禁用会静默丢失，不能碰。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const db = require('../db');
const state = require('../state');
const win = require('../window');
const i18n = require('../i18n');
const { localTime } = require('../services/timefmt');
const { S, I, handle, currentUser } = require('./shared');

const VIEW_FILE = path.join(app.getPath('userData'), 'view-history.json');
const MAX_VIEWS = 12; // 每用户保留条数：托盘只展示前 8 条，多留几条兜底切换用户后的回看
const TRAY_SHOW = 8; // 托盘弹窗展示条数

function readViews() {
  try {
    return JSON.parse(fs.readFileSync(VIEW_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}
function writeViews(map) {
  try {
    fs.writeFileSync(VIEW_FILE, JSON.stringify(map, null, 2));
  } catch (e) {
    /* userData 不可写时静默：仅是不记历史 */
  }
}

/** 当前用户的浏览历史（最新的在前）；未登录/无历史返回空数组 */
function userViews() {
  const userId = String(currentUser() || '0');
  const list = readViews()[userId];
  return Array.isArray(list) ? list.filter(x => x && typeof x.id === 'number') : [];
}

function registerTray() {
  /* 浏览打点：PostView 打开一篇已存在文档时调用（fire-and-forget，失败静默） */
  handle('view:mark', async p => {
    const id = I(p.id);
    if (!id) return false;
    const title = S(p.title).slice(0, 120) || `#${id}`;
    const userId = String(currentUser() || '0');
    const map = readViews();
    const list = (Array.isArray(map[userId]) ? map[userId] : []).filter(x => x && x.id !== id);
    list.unshift({ id, title, at: localTime() });
    map[userId] = list.slice(0, MAX_VIEWS);
    writeViews(map);
    return true;
  });

  /* 托盘弹窗数据。noLockGuard：锁定/数据库异常时也要能弹出菜单
   * （至少「打开文档盒」「退出」可用），只是不返回最近浏览。 */
  handle(
    'tray:data',
    async () => {
      if (state.locked || state.dbError) {
        // 锁定/异常态读不到设置表：主题给默认值，渲染层只渲染基础菜单。
        // 语言不能写死 zh-CN —— 主进程此时已由 initFromCache/initFromSettings 定好
        // 用户上次选的语言（Beta.271），弹窗文案才跟得上界面。
        return {
          locked: true,
          dbError: !!state.dbError,
          theme: 'light',
          lang: i18n.currentLang(),
          ver: app.getVersion(),
          recent: []
        };
      }
      const theme = db.getSetting('theme') || 'light';
      const lang = db.getSetting('display.lang') || 'zh-CN';
      let list = userViews();
      if (list.length) {
        // 洗掉已删除文档的死链，并顺手落盘（文件不会无限堆积）
        const alive = new Set(db.aliveIds(list.map(x => x.id)));
        list = list.filter(x => alive.has(x.id));
        const map = readViews();
        map[String(currentUser() || '0')] = list;
        writeViews(map);
      }
      return { locked: false, theme, lang, ver: app.getVersion(), recent: list.slice(0, TRAY_SHOW) };
    },
    { noLockGuard: true }
  );

  /* 弹窗内容挂载后回报真实高度 → 主进程校正尺寸与位置 */
  handle(
    'tray:resize',
    async p => {
      win.resizeTrayPopup(p && p.height);
      return true;
    },
    { noLockGuard: true }
  );

  /* 菜单项动作。全部 noLockGuard：锁定态下「打开文档盒」「退出」必须可用 */
  handle(
    'tray:action',
    async p => {
      const type = S(p && p.type);
      if (type === 'open') {
        win.showWindow();
      } else if (type === 'openPost') {
        const id = I(p.id);
        win.showWindow();
        // 锁定态不转发导航：主窗口此时停在解锁页，导航意图无人消费，纯属丢失
        if (id && !state.locked && !state.dbError) win.sendTrayNavigate({ page: 'post', id });
      } else if (type === 'newPost') {
        win.showWindow();
        if (!state.locked && !state.dbError) {
          // 落到第一个大区：新建态不带 regionId 时分类下拉为空，用户得手动选一遍
          let regionId = null;
          try {
            const rs = db.listRegions();
            regionId = rs && rs.length ? rs[0].id : null;
          } catch (e) {
            /* 取不到大区就让用户自己选 */
          }
          win.sendTrayNavigate({ page: 'post', editing: true, regionId });
        }
      } else if (type === 'quit') {
        win.requestQuit();
      } else {
        return false;
      }
      win.hideTrayPopup();
      return true;
    },
    { noLockGuard: true }
  );
}

module.exports = { registerTray };
