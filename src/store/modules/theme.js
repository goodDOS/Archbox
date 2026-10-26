import { store } from './state';
import { A } from '../../api';

/** 当前有效主题 key 列表（新增 bamboo/sandalwood/sky 三套配色） */
export const THEME_KEYS = ['light', 'dark', 'wire', 'cs16', 'bamboo', 'sandalwood', 'sky', 'halflife'];

/**
 * 「标准主题」键集合——内置固定配色，其余（cs16/bamboo/...）视为可被主题按钮
 * 记忆为「自定义」态的配色。此前 theme.js 与 boot.js 各写了一遍 ['light','dark','wire']，
 * 收敛为单一导出，避免两处不同步。
 */
export const STANDARD = ['light', 'dark', 'wire'];

/**
 * 主题显示名 → i18n 字典 key 的映射（单一数据源）。
 * 此前 NavToolbar.vue 内联一份 THEME_LABEL_KEYS，与 SettingsPage 的 THEMES.nameKey
 * 各自维护、易不同步，现统一由本模块派生。
 */
export const THEME_LABEL_KEYS = {
  light: 'themeLight',
  dark: 'themeDark',
  wire: 'themeWire',
  cs16: 'themeCs16',
  bamboo: 'themeBamboo',
  sandalwood: 'themeSandalwood',
  sky: 'themeSky',
  halflife: 'themeHalflife'
};

/**
 * 主题元数据（名称/描述的 i18n 字典 key）——供设置页主题预览卡派生。
 * 顺序即设置页展示顺序；只放 key 不放译文，切换语言时预览卡随之更新。
 * 此前 SettingsPage.vue 内联一份 THEMES（nameKey/descKey），与 THEME_LABEL_KEYS
 * 各自维护、易不同步，现统一由本模块派生（显式字面量，便于契约静态校验）。
 */
export const THEME_META = [
  { key: 'light', nameKey: 'shell.themeLight', descKey: 'shell.themeDescLight' },
  { key: 'dark', nameKey: 'shell.themeDark', descKey: 'shell.themeDescDark' },
  { key: 'wire', nameKey: 'shell.themeWire', descKey: 'shell.themeDescWire' },
  { key: 'bamboo', nameKey: 'shell.themeBamboo', descKey: 'shell.themeDescBamboo' },
  { key: 'sandalwood', nameKey: 'shell.themeSandalwood', descKey: 'shell.themeDescSandalwood' },
  { key: 'sky', nameKey: 'shell.themeSky', descKey: 'shell.themeDescSky' },
  { key: 'halflife', nameKey: 'shell.themeHalflife', descKey: 'shell.themeDescHalflife' },
  { key: 'cs16', nameKey: 'shell.themeCs16', descKey: 'shell.themeDescCs16' }
];

/** 默认强调色（单一数据源）：RegionModal / ColorPicker / ThemeSection 预览引用，禁止另写字面量 */
export const DEFAULT_ACCENT = '#3b6df0';

/** 大区预设标识色盘（单一数据源）：RegionModal 引用 */
export const REGION_COLORS = [
  '#3b6df0',
  '#2da44e',
  '#d29922',
  '#e5484d',
  '#8a63d2',
  '#0f9b8e',
  '#9a86fd',
  '#c2571a',
  '#6b7383'
];

/** 应用当前主题到 <html data-theme>，供多套配色主题切换 */
export function applyTheme() {
  document.documentElement.dataset.theme = store.theme;
}

export async function setTheme(t) {
  // 防御：无效主题 key（如升级后旧设置残留）回退到 cs16，避免应用无效 data-theme 导致页面无样式
  if (!THEME_KEYS.includes(t)) t = 'cs16';
  store.theme = t;
  applyTheme();
  try {
    await A.setSetting({ k: 'theme', v: t });
  } catch (e) {
    /* 静默 */
  }
  // 记录最后选择的非标准主题，供导航栏主题按钮「自定义」态记住并切回
  if (!STANDARD.includes(t)) {
    store.themeCustom = t;
    try {
      await A.setSetting({ k: 'themeCustom', v: t });
    } catch (e) {
      /* 静默 */
    }
  }
}
