/**
 * 简体中文字典（聚合层）。
 *
 * 按域拆分为 parts/<domain>.zh-CN.js，此处统一合并 ——
 * 目的是让多人/多代理并行补译时写不同的文件，不产生同一文件的编辑冲突。
 * 新增域只需在 parts/ 建文件并在下方 import，无需改动其它语言文件的结构。
 */
import common from './parts/common.zh-CN';
import shell from './parts/shell.zh-CN';
import home from './parts/home.zh-CN';
import posts from './parts/posts.zh-CN';
import post from './parts/post.zh-CN';
import region from './parts/region.zh-CN';
import search from './parts/search.zh-CN';
import trash from './parts/trash.zh-CN';
import taxonomy from './parts/taxonomy.zh-CN';
import lanshare from './parts/lanshare.zh-CN';
import settings from './parts/settings.zh-CN';
import about from './parts/about.zh-CN';
import guide from './parts/guide.zh-CN';
import ui from './parts/ui.zh-CN';
import tray from './parts/tray.zh-CN';
import time from './parts/time.zh-CN';

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
