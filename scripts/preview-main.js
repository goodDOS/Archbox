/**
 * 预览入口：注入 mock 的 window.arch（真实数据形状），挂载真实的 Home.vue。
 * 仅用于本地视觉/尺寸验证，不参与打包。
 *
 * 注意：src/api.js 在模块顶层执行 `export const A = window.arch || {}`，
 * 因此必须在 import 任何会间接引入 api.js 的模块之前先把 window.arch 装好。
 */
const now = new Date();
const p = n => String(n).padStart(2, '0');
const dayLabel = off => {
  const d = new Date(now);
  d.setDate(d.getDate() - off);
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const last7 = [4, 7, 3, 9, 6, 11, 5].map((c, i) => ({ label: dayLabel(6 - i), count: c }));
const usage7 = [1200, 2400, 900, 3100, 1800, 2600, 1500].map((s, i) => ({ label: dayLabel(6 - i), seconds: s }));

const homeStats = {
  posts: 128,
  regions: 6,
  cats: 14,
  tags: 37,
  fields: 22,
  users: 3,
  notes: 5,
  last7,
  recent: [],
  new7: 45,
  newPrev7: 38,
  uncat: 9,
  drafts: 3,
  trash: 2,
  abnormal7: 1,
  lastBackupAt: new Date(now - 86400000).toISOString(),
  encrypted: true,
  storageBytes: 15728640,
  storagePath: 'D:\\文档盒 Archbox\\data',
  storageDrive: 'D:',
  onSystemDrive: false,
  usageToday: 1500,
  usage7,
  usagePrev7: usage7,
  autoBackup: { enabled: true, schedule: 'daily' },
  // 登录统计（新）
  loginTodayUsers: 3,
  loginTodayTimes: 9,
  loginUsers7: 12,
  loginTodayList: [
    { user_id: 'A1', user_name: '张文档', times: 5, lastAt: '2026-09-13 11:20:00' },
    { user_id: 'A2', user_name: '李小档', times: 3, lastAt: '2026-09-13 10:05:00' },
    { user_id: 'A3', user_name: '王资料', times: 1, lastAt: '2026-09-13 09:12:00' }
  ],
  loginRank7: [
    { user_id: 'A1', user_name: '张文档', times: 22, lastAt: '2026-09-13 11:20:00' },
    { user_id: 'A2', user_name: '李小档', times: 15, lastAt: '2026-09-13 10:05:00' },
    { user_id: 'A3', user_name: '王资料', times: 8, lastAt: '2026-09-13 09:12:00' },
    { user_id: 'A4', user_name: '赵归档', times: 3, lastAt: '2026-09-12 17:40:00' }
  ],
  loginFailToday: 2
};

const lanStats = { enabled: true, sharedRegionCount: 2, postCount: 41, visitor7: 18, visitorToday: 4 };

const resp = {
  boot: {
    mac: 'AA:BB:CC:DD:EE:FF',
    writable: true,
    locked: false,
    versions: { app: '0.9.0-Beta.137' },
    settings: { theme: 'light' },
    users: [{ id: 'A1', name: '张文档' }],
    lastUserId: 'A1'
  },
  regions: [{ id: 1, name: '合同文档', code: 'R01', color: '#4a7' }],
  auditVerify: { ok: true, count: 42 },
  lanStatus: { enabled: true, sharedRegions: [1] }
};

window.arch = {
  invoke: async ch => {
    if (ch === 'stats:home') return homeStats;
    if (ch === 'lan:myStats') return lanStats;
    if (ch === 'stats:usageSummary' || ch === 'usage:summary') return { today: 1500, last7: usage7 };
    if (ch === 'region:list') return resp.regions;
    if (ch === 'note:list') return [];
    if (ch === 'post:list') return { items: [], total: 0 };
    if (ch === 'audit:verify') return resp.auditVerify;
    if (ch === 'lan:status') return resp.lanStatus;
    if (ch === 'boot:info' || ch === 'boot') return resp.boot;
    if (ch === 'settings:get') return { theme: 'light' };
    return null;
  },
  onE2e: () => {},
  onClockAlert: () => {},
  postCountMine: async () => 0,
  postTransferMine: async () => ({ moved: 0, to: '' }),
  // 让 A.xxx() 形式的调用也能命中
  homeStats: async () => homeStats,
  lanMyStats: async () => lanStats,
  usageSummary: async () => ({ today: 1500, last7: usage7 }),
  regions: async () => resp.regions,
  notes: async () => [],
  auditVerify: async () => resp.auditVerify,
  lanStatus: async () => resp.lanStatus,
  boot: async () => resp.boot
};

const { createApp, h } = await import('vue');
const { store } = await import('../src/store');
const Home = (await import('../src/pages/Home.vue')).default;

store.booted = true;
store.locked = false;
store.writable = true;
store.theme = 'light';
store.user = { id: 'A1', name: '张文档', mac: 'AA:BB:CC:DD:EE:FF' };
store.regions = resp.regions;
store.settings = { theme: 'light' };

const theme = new URLSearchParams(location.search).get('theme') || window.__PREVIEW_THEME__ || 'light';
{
  const { applyTheme } = await import('../src/store/modules/theme');
  store.theme = theme;
  applyTheme(); // 写 document.documentElement.dataset.theme
}
if (window.__PREVIEW_THEME__) {
  try {
    delete window.__PREVIEW_THEME__;
  } catch (e) {}
}

createApp({ render: () => h(Home) }).mount('#preview-main');
