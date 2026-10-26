/**
 * Italiano 字典（聚合层）。
 *
 * 16 域全量已译，与 zh-CN 键集一致（standardize.test.mjs 逐域断言）。
 * 回退链（本语言 → zh-CN → key 本身）仍保留在 t() 里，但正常情况下不该被用到：
 * 真回退到中文时，说明这里漏了键，门禁会先报红。
 */
import common from './parts/common.it';
import shell from './parts/shell.it';
import home from './parts/home.it';
import posts from './parts/posts.it';
import post from './parts/post.it';
import region from './parts/region.it';
import search from './parts/search.it';
import trash from './parts/trash.it';
import taxonomy from './parts/taxonomy.it';
import lanshare from './parts/lanshare.it';
import settings from './parts/settings.it';
import about from './parts/about.it';
import guide from './parts/guide.it';
import ui from './parts/ui.it';
import tray from './parts/tray.it';
import time from './parts/time.it';

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
