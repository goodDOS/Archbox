// 统一的前端文字提示（反馈）模块
// 目的：把分散在各组件里的同类 toast 调用收拢到这里，避免「同类型提示重复写代码」。
//       - 错误提示统一用 toastErr()，不必再写 `toast(e.message, 'err')`
//       - 成功文案统一走 okMsg 常量，避免「已保存/已删除/已导出…」在多处硬编码
//       - 重复的 `try { … } catch(e){ toast(e.message,'err') } finally { busy=false }` 用 run() 收口
//
// 渲染状态仍在 store.toast（单一数据源），本模块只做类型化封装与复用。

import { toast as _toast } from './store';
import { t } from './i18n';

// 基础 toast 透传（保持与 store 同一状态源）
export const toast = _toast;

// 按类型调用的快捷方式
export const toastOk = msg => _toast(msg, 'ok');
export const toastInfo = msg => _toast(msg, 'info');
export const toastWarn = msg => _toast(msg, 'warn');
/**
 * 把异常翻成「当前界面语言」的可读文案。
 *
 * ---------- 它解决的是一类具体的错 ----------
 * 主进程里凡是**业务规则**类错误（密码不正确、第 2 组答案为空、口令至少 8 位…），
 * 都不再抛中文句子，而是抛 i18n key（或 `key|参数`，见 electron/i18n 的 errKey）。
 * 原因：这些文案最终显示在渲染层的表单里，若主进程提前翻成文字，同一句话就要在
 * 主进程字典和渲染层字典各存一份，改一处忘一处就是「中文界面上冒出英文句子」。
 * 让主进程只指出"是哪条错误"，翻译权交给正在显示它的这一层，两份字典就不会漂移。
 *
 * ---------- 为什么 t() 本身就能兜住 ----------
 * t() 对字典里查不到的 key **原样返回**。所以：
 *   · 主进程业务错误（'settings.errPwdWrong'）→ 查到译文，正确显示；
 *   · 内核/第三方错误（'ECONNREFUSED'、'SQLITE_CORRUPT'、文件系统原文）→ 原样显示，
 *     不会被洗成一句无信息的兜底文案（这类信息保留原文才有排查价值）。
 * 这也是本函数不需要再判断"是不是 key"的原因 —— 判断一次就够，判据在 t() 里。
 *
 * @param {any} err          catch 到的异常（或任意值）
 * @param {string} [fallback] 既无 key 又无 message 时的兜底文案
 */
export function errText(err, fallback = t('common.opFailedRetry')) {
  if (err === null || err === undefined) return fallback;
  const key = typeof err === 'string' ? err : String((err && err.message) || '');
  if (!key) return fallback;
  // 参数来自 preload 拆出的 err.params（主进程 key|{json} 的后半段）
  return t(key, (err && typeof err === 'object' && err.params) || undefined);
}

/**
 * 翻译一段**裸的**主进程错误编码串（不是 Error 对象）。
 *
 * preload 会把 `{ok:false, error}` 拆成 err.message + err.params，那条路走 errText。
 * 但有些数据是「成功返回里夹带的错误码」，例如时钟告警的 `{type:'back', reason:'sys.clockRollback|{"n":3}'}`
 * —— 没有 Error 壳，只能就地解析。判据与主进程 isErrKey 一致：`域.键` 或 `域.键|{json}`。
 * 不是编码串就原样返回（可能是内核原文，保留原文才有排查价值）。
 */
export function errRaw(raw) {
  const s = String(raw == null ? '' : raw);
  const m = /^([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)(?:\|([{[][\s\S]*))?$/.exec(s);
  if (!m) return s;
  let params;
  if (m[2]) {
    try {
      params = JSON.parse(m[2]);
    } catch (e) {}
  }
  return t(m[1], params);
}

/** 错误提示：统一从 Error 对象取 message，无 message 时使用兜底文案
 *  ★ 走 errText：主进程业务错误是 i18n key，必须经 t() 才能变成当前语言 ★ */
export const toastErr = (err, fallback = t('common.opFailedRetry')) => {
  _toast(errText(err, fallback), 'err');
};

/**
 * 把底层错误翻译成「用户能看懂的中文」。
 *
 * 为什么需要它：主进程的 IPC 错误序列化只传 `err.message`（见 electron/ipc/shared.js），
 * 而 Node 原生 fetch（undici）连接失败时抛的是 `TypeError: fetch failed`，
 * 真正的根因 ECONNREFUSED 挂在 `err.cause` 上、在这一层就已经被丢弃。
 * 于是前端拿到的 `e.message` 就是字面量字符串 `'fetch failed'`，
 * 直接拼进提示会变成「拉取文档失败：fetch failed」—— 用户看不懂，也无从下手。
 *
 * 原则：给用户的文案里不出现 `fetch failed` / `ECONNREFUSED` / `Aborted` 这类实现细节。
 *
 * @param {any} err              捕获到的异常（或任意值）
 * @param {string} [fallback]    识别不出特征时的兜底文案
 * @returns {string}             可直接展示的中文文案
 */
export function friendlyErr(err, fallback = t('common.opFailedRetry')) {
  if (err === null || err === undefined) return fallback;
  // 本来就是字符串时按字符串特征识别（调用方可能只传了个 message）
  const raw = typeof err === 'string' ? err : String((err && err.message) || '');
  const code = (err && typeof err === 'object' && err.code) || '';
  const low = raw.toLowerCase();

  // 归属错误：需要用户去输令牌，措辞与 LanShare 的 401 分支保持一致。
  // 「令牌」是匹配后端错误文案里的特征词（主进程无 i18n，错误可能是中文），
  // 写成 \u 转义而非字面量：让「模板/脚本零汉字」静态断言能覆盖本文件——
  // 匹配逻辑与界面语言无关，不该成为漏网中文的豁免口。
  if (code === 'LAN_NEED_AUTH' || /\u4ee4\u724c|token/i.test(raw)) {
    return t('common.tokenInvalid');
  }
  // 连接被拒 / 域名解析失败：服务已停或端口不通（用户报的「拉取失败: fetch failed」即此类）
  if (
    low.includes('fetch failed') ||
    low.includes('econnrefused') ||
    low.includes('enotfound') ||
    low.includes('ehostunreach') ||
    low.includes('network') ||
    low.includes('socket hang up')
  ) {
    return t('common.cannotConnectDetail');
  }
  // 超时：主进程 lan:request 的 AbortController 是 8s
  if (low.includes('abort') || low.includes('timeout') || low.includes('timed out')) {
    return t('common.connectTimeout');
  }
  // 认得出是中文的自定义文案（后端 json.error 一路透传上来的业务错误），原样用
  if (raw && /[\u4e00-\u9fa5]/.test(raw)) return raw;
  // 其余一律兜底，绝不把原生英文 message 抛给用户
  return fallback;
}

// 常用成功文案：集中维护，避免散落重复。
// 为什么用 getter 而不是字面量：读取时机即求值时机，切换语言后下一次读取就是新语言，
// 且所有调用点（okMsg.saved / okMsg.exported(p)）零改动——与「模板里调 t()」同一思路。
export const okMsg = {
  get saved() {
    return t('common.saved');
  },
  get fieldSaved() {
    return t('common.fieldSaved');
  },
  get deleted() {
    return t('common.deleted');
  },
  get imported() {
    return t('common.imported');
  },
  get passwordChanged() {
    return t('common.passwordChanged');
  },
  // 带参的成功文案用函数形式
  exported: path => t('common.exportedTo', { path })
};

/**
 * 异步任务包装器：自动捕获异常并以错误提示呈现，可选复位 busy 标志。
 * 取代各处散落的 `try { … } catch (e) { toast(e.message,'err') } finally { busy.value = false }`。
 *
 * @param {() => Promise} fn      要执行的异步任务
 * @param {Object}  [opts]
 * @param {string|Function} [opts.ok]     成功提示文案（字符串），或接收结果的 (result)=>string
 * @param {string} [opts.err]             异常无 message 时的兜底文案
 * @param {object} [opts.busy]            ref，自动在 finally 置为 false
 * @param {(r:any)=>void} [opts.then]    成功回调
 * @param {(e:Error)=>void} [opts.catch] 失败回调（错误提示已自动弹出，这里处理额外逻辑）
 * @param {()=>void} [opts.finally]      无论成败的收尾回调
 * @returns {Promise<any|undefined>}     任务结果；异常时返回 undefined
 */
export async function run(fn, opts = {}) {
  const { ok = false, err = t('common.opFailedRetry'), busy, then, catch: onCatch, finally: onFinally } = opts;
  if (busy) busy.value = true;
  try {
    const r = await fn();
    if (ok) _toast(typeof ok === 'function' ? ok(r) : ok, 'ok');
    if (then) await then(r);
    return r;
  } catch (e) {
    toastErr(e, err);
    if (onCatch) await onCatch(e);
    return undefined;
  } finally {
    if (busy) busy.value = false;
    if (onFinally) await onFinally();
  }
}
