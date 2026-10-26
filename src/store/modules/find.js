import { reactive } from 'vue';
import { search, jump, clear } from '../../utils/postFind';

/**
 * 页面内查找（Ctrl+F）状态。
 *
 * Beta.184 起，查找逻辑已迁移到渲染进程端的 postFind 引擎（src/utils/postFind.js），
 * 只在 .post-main 子树内自建高亮 —— 不再经过主进程 findInPage，也不再订阅
 * 'find:result' 计数回传。本模块只负责把 UI 事件翻译成对 postFind 的调用，并维护
 * 一个受控的 open/close 流程（关闭时调用 clear 撤掉高亮）。
 */
export const findState = reactive({
  open: false,
  text: '',
  matchCase: false,
  matches: 0, // 命中总数
  active: 0 // 当前第几处（1-based；0 表示尚未定位）
});

/** 打开查找条；若保留有上次搜索词则自动触发一次搜索 */
export function findOpen() {
  findState.open = true;
  if (findState.text) {
    findSet(findState.text);
  }
}

/**
 * 关闭查找条并清除页面高亮，但保留搜索词与大小写设置。
 * 高亮是 postFind 直接注入到 DOM 内的 <mark>，关闭时必须 clear 撤掉，
 * 否则会残留在 DOM 上（Vue 下次 patch 可能保留异常结构）。
 */
export function findClose() {
  findState.open = false;
  findState.matches = 0;
  findState.active = 0;
  clear();
  // 注意：不再清空 findState.text / findState.matchCase，以便再次打开时保留搜索记录。
}

/** 输入框内容变化：从第一处重新查找 */
export function findSet(text) {
  findState.text = text;
  if (!text) {
    findState.matches = 0;
    findState.active = 0;
    clear();
    return;
  }
  const r = search(text, { matchCase: findState.matchCase });
  findState.matches = r.matches;
  findState.active = r.matches ? 1 : 0;
}

/** 下一处 / 上一处 */
export function findJump(backward) {
  if (!findState.text || !findState.matches) return;
  // ctx 快照给编辑态引擎用（它不反向依赖 store，避免 find.js → postFind → editFind → find.js 成环）；
  // 查看态的 postFind 自带 marks 状态，忽略该参数。
  const i = jump(backward, {
    active: findState.active,
    matches: findState.matches,
    text: findState.text,
    matchCase: findState.matchCase
  }); // postFind 返回 0-based
  findState.active = i + 1;
}

/** 切换大小写敏感：重新发起一次查询 */
export function findToggleCase(matchCase) {
  findState.matchCase = !!matchCase;
  if (!findState.text) return;
  findSet(findState.text);
}
