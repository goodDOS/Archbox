/**
 * Español 字典（聚合层）。
 *
 * 16 域全量已译，与 zh-CN 键集一致（standardize.test.mjs 逐域断言）。
 * 回退链（本语言 → zh-CN → key 本身）仍保留在 t() 里，但正常情况下不该被用到：
 * 真回退到中文时，说明这里漏了键，门禁会先报红。
 */
import common from './parts/common.es';
import shell from './parts/shell.es';
import home from './parts/home.es';
import posts from './parts/posts.es';
import post from './parts/post.es';
import region from './parts/region.es';
import search from './parts/search.es';
import trash from './parts/trash.es';
import taxonomy from './parts/taxonomy.es';
import lanshare from './parts/lanshare.es';
import settings from './parts/settings.es';
import about from './parts/about.es';
import guide from './parts/guide.es';
import ui from './parts/ui.es';
import tray from './parts/tray.es';
import time from './parts/time.es';

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
