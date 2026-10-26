import { store } from './state';
import { A } from '../../api';

/* ───────── 全局搜索历史词（主进程 userData 本地文件持久化，重启仍记得） ─────────
 * 之前用 localStorage，但 file:// 协议下被浏览器沙盒禁用，持久化静默失败、重启即丢；
 * 现改由主进程写入 userData/search-history.json（按用户隔离）。 */
const HISTORY_LIMIT = 10;
export async function loadSearchHistory() {
  if (!store.user) return;
  try {
    const map = (await A.getSearchHistory()) || {};
    const arr = map[String(store.user.id)];
    if (Array.isArray(arr)) store.searchHistory = arr.filter(x => typeof x === 'string').slice(0, HISTORY_LIMIT);
  } catch (e) {
    /* 忽略 */
  }
}
export async function persistSearchHistory() {
  if (!store.user) return;
  try {
    await A.setSearchHistory({ userId: store.user.id, list: store.searchHistory.slice(0, HISTORY_LIMIT) });
  } catch (e) {
    /* 忽略 */
  }
}
