/**
 * 繁体中文字典（聚合层）。
 *
 * 与 zh-CN 的差异主要是用词与字形（软件→軟體 / 设置→設定 / 网络→網路 / 文档→文檔），
 * 由 parts/ 下同名域文件提供。字形转换规则见 electron/verify/tw-han-map.mjs：
 * 逐字转字形、不做台湾化意译，由 test:standardize 强制。
 * 16 域已全部提供；缺域时仍会回退 zh-CN（见 index.js 的回退链），但门禁不允许缺。
 */
import common from './parts/common.zh-TW';
import shell from './parts/shell.zh-TW';
import home from './parts/home.zh-TW';
import posts from './parts/posts.zh-TW';
import post from './parts/post.zh-TW';
import region from './parts/region.zh-TW';
import search from './parts/search.zh-TW';
import trash from './parts/trash.zh-TW';
import taxonomy from './parts/taxonomy.zh-TW';
import lanshare from './parts/lanshare.zh-TW';
import settings from './parts/settings.zh-TW';
import about from './parts/about.zh-TW';
import guide from './parts/guide.zh-TW';
import ui from './parts/ui.zh-TW';
import tray from './parts/tray.zh-TW';
import time from './parts/time.zh-TW';

export default {
  common,
  shell,
  home,
  posts,
  post,
  region,
  search,
  trash,
  taxonomy,
  lanshare,
  settings,
  about,
  guide,
  ui,
  tray,
  time
};
