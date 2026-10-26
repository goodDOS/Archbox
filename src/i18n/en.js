/**
 * English dictionary (aggregator).
 *
 * Same part-file layout as zh-CN so the three languages stay structurally identical.
 * Missing keys fall back to zh-CN at runtime (see index.js), so partial coverage
 * degrades to Chinese rather than blank text.
 */
import common from './parts/common.en';
import shell from './parts/shell.en';
import home from './parts/home.en';
import posts from './parts/posts.en';
import post from './parts/post.en';
import region from './parts/region.en';
import search from './parts/search.en';
import trash from './parts/trash.en';
import taxonomy from './parts/taxonomy.en';
import lanshare from './parts/lanshare.en';
import settings from './parts/settings.en';
import about from './parts/about.en';
import guide from './parts/guide.en';
import ui from './parts/ui.en';
import tray from './parts/tray.en';
import time from './parts/time.en';

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
