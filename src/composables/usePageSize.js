import { ref } from 'vue';
import { store, bus } from '../store';
import { A } from '../api';

/**
 * 分页大小统一收敛层：文档每页显示数量（display.pageSize）的唯一数据源。
 *
 * 此前 PAGE_SIZE_KEY / 默认值 20 / localStorage 迁移逻辑散落在
 * PostsPage、LanShare、DisplaySection、SearchPage、TrashPage 五处，
 * 常量重复、迁移逻辑重复、部分页面（SearchPage/TrashPage）甚至硬编码 20 未接入设置。
 * 现全部收口到本模块，供各页面与设置项复用。
 */

/** 设置项 key（唯一常量，禁止在别处另写字面量） */
export const PAGE_SIZE_KEY = 'display.pageSize';
/** 默认每页数量 */
export const DEFAULT_PAGE_SIZE = 20;
/** 设置项可选档位 */
export const PAGE_SIZE_PRESETS = [10, 20, 50, 100];
/** 合法区间（防误输入极端值拖垮加载） */
export const PAGE_SIZE_MIN = 1;
export const PAGE_SIZE_MAX = 500;

/** 规范化任意输入为合法分页大小（越界钳制，非法回退默认） */
export function normalizePageSize(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, n));
}

/**
 * 读取当前分页大小：
 *   1. 优先读 store.settings（后端 settings 表）
 *   2. 兼容旧版 localStorage 残留（打包后 file:// 下 localStorage 被沙盒禁用，
 *      必须 try/catch 吞掉 SecurityError，否则运行日志出现红色错误行）
 *   3. 兜底默认值
 */
export function loadPageSize() {
  const s = store.settings && store.settings[PAGE_SIZE_KEY];
  if (s != null) return normalizePageSize(s);
  try {
    const legacy = Number(localStorage.getItem(PAGE_SIZE_KEY));
    if (legacy) return normalizePageSize(legacy);
  } catch (e) {
    /* file:// 协议下访问被拒，静默忽略 */
  }
  return DEFAULT_PAGE_SIZE;
}

/**
 * 持久化分页大小到后端 settings 表，并同步 store、广播 display:pageSize、
 * 清理旧 localStorage 残留。
 */
export async function savePageSize(v) {
  const n = normalizePageSize(v);
  try {
    await A.setSetting({ k: PAGE_SIZE_KEY, v: n });
    if (!store.settings) store.settings = {};
    store.settings[PAGE_SIZE_KEY] = n;
  } catch (e) {}
  try {
    localStorage.removeItem(PAGE_SIZE_KEY);
  } catch (e) {
    /* 忽略 */
  }
  return n;
}

/**
 * 组合式：返回响应式 pageSize 及初始化/应用外部变更的便捷方法。
 * 供列表页接入（页面切换回当前页时重新读取，监听设置页广播即时生效）。
 */
export function usePageSize() {
  const pageSize = ref(loadPageSize());

  /** 设置页广播了 display:pageSize 后调用，即时应用新值 */
  function applyPageSize(v) {
    pageSize.value = normalizePageSize(v);
  }

  return { pageSize, loadPageSize, savePageSize, applyPageSize };
}

/** 从设置页持久化并广播（供 DisplaySection 调用，含 toast 提示外的统一副作用） */
export async function persistPageSize(n) {
  const v = await savePageSize(n);
  bus.emit('display:pageSize', v);
  return v;
}
