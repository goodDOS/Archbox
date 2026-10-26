import { store } from './state';

/** 全局「未保存改动」标记：导航守卫与全局刷新据此决定是否询问用户 */
export function markDirty() {
  store.dirty = true;
}
export function clearDirty() {
  store.dirty = false;
}
