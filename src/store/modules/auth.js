import { store } from './state';
import { A } from '../../api';
import { refreshRegions } from './boot';
import { loadSearchHistory } from './searchHistory';

/** 登录：写入当前用户并刷新大区列表与搜索历史 */
export async function doLogin(name, password) {
  store.user = await A.login({ name, password });
  await refreshRegions();
  await loadSearchHistory();
}

/** 直接进入（重新绑定设备后）：主进程已写 session 并验证身份，前端仅写入用户并刷新 */
export async function enterAs(user) {
  store.user = user;
  await refreshRegions();
  await loadSearchHistory();
}

export async function changePassword(oldPass, newPass) {
  return A.changePassword({ oldPass, newPass });
}

export function logout() {
  store.user = null;
}
