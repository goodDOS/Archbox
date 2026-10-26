'use strict';
/**
 * IPC 公共封装层：供各业务域模块（electron/ipc/*.js）复用的工具与统一通道注册器。
 * 集中处理：参数清洗、当前用户注入、审计静默、流程日志标签、锁定守卫、错误回传。
 */
const { ipcMain } = require('electron');
const db = require('../db');
const state = require('../state');
const { getLog } = require('../services/logger');
const i18n = require('../i18n');

/* ---------- 通用工具 ---------- */
// 字符串参数：去空白并截断，防止超大载荷冲击数据库
const S = v => (typeof v === 'string' ? v.trim().slice(0, 20000) : '');
// 正整数 id：非法一律归 null，交由下层校验
const I = v => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
// 当前登录用户 id（无则 null，调用方据此拒绝需身份的操作）
function currentUser() {
  const id = db.getSetting('session.user_id');
  return id || null;
}
// 审计写入失败不应影响主流程（如导出已成功写盘），故吞掉异常仅记录。
// 实现收敛到 db.safeAudit（供 IPC 与 service 共用，见 db.js），此处仅透传。
const safeAudit = db.safeAudit;
// 业务操作 → 运行日志"流程"输出用的中文标签（仅写/业务类通道；只读/日志/窗口类不列，避免噪音）
const FLOW = {
  'users:register': '注册账户',
  'users:login': '登录',
  'users:changePass': '修改密码',
  'users:setSecurity': '设置安全问答',
  'users:recover': '找回密码',
  'settings:set': '更新设置',
  'region:save': '保存大区',
  'region:delete': '删除大区',
  'cat:save': '保存分类',
  'cat:delete': '删除分类',
  'tag:save': '保存标签',
  'tag:delete': '删除标签',
  'field:save': '保存字段',
  'field:delete': '删除字段',
  'post:save': '保存文档',
  'post:merge': '合并文档',
  'post:delete': '删除文档',
  'post:restore': '恢复文档版本',
  'post:transferMine': '移交我的文档',
  'notes:save': '保存便签',
  'notes:delete': '删除便签',
  'pack:importApply': '导入文档包',
  'img:upload': '插入图片（内联）'
  // 注：storage:choose / storage:backup / backup:run 由各自 handler 内部写"开始/完成+路径"，不在此统一记以免重复
};
// 重量级（耗时 / 用户最关心"在做什么"）操作：进入时额外记"开始"
const HEAVY = new Set([
  'pack:export',
  'md:export',
  'pdf:export',
  'pack:importApply',
  'storage:backup',
  'backup:run',
  'storage:choose'
]);
// 生成非敏感摘要（绝不记录明文密码 / 令牌 / 密钥 / 盐）
function flowSummary(ch, p, data) {
  p = p || {};
  switch (ch) {
    case 'post:save':
      return `标题「${S(p.title).slice(0, 30) || '（无标题）'}」` + (p.id ? ` id ${p.id}` : '（新建）');
    case 'post:delete':
      return `id ${p.id}`;
    case 'post:merge':
      return `目标 ${p.targetId}`;
    case 'post:restore':
      return `版本 ${p.versionId}`;
    case 'post:transferMine':
      return `移交给用户 ${S(p.toUserId)}`;
    case 'notes:save':
      return p.id ? `id ${p.id}` : '（新建）';
    case 'notes:delete':
      return `id ${p.id}`;
    case 'region:save':
      return `「${S(p.name).slice(0, 20)}」`;
    case 'region:delete':
      return `id ${p.id}`;
    case 'cat:save':
      return `「${S(p.name).slice(0, 20)}」`;
    case 'cat:delete':
      return `id ${p.id}`;
    case 'tag:save':
      return `「${S(p.name).slice(0, 20)}」`;
    case 'tag:delete':
      return `id ${p.id}`;
    case 'field:save':
      return `「${S(p.name).slice(0, 20)}」(${S(p.type)})`;
    case 'field:delete':
      return `id ${p.id}`;
    case 'settings:set': {
      const k = String(p.k || '');
      const hide = /pass|password|token|secret|salt/i.test(k);
      return `key=${k}` + (hide ? '（值已隐藏）' : p.v != null ? ` = ${JSON.stringify(p.v).slice(0, 50)}` : '');
    }
    case 'pack:importApply': {
      const s = data || {};
      return `新建 ${s.created == null ? '?' : s.created} / 合并 ${s.merged == null ? '?' : s.merged} / 跳过 ${s.skipped == null ? '?' : s.skipped}`;
    }
    case 'users:register':
      return `用户「${S(p.name).slice(0, 20)}」`;
    case 'users:login':
      return `用户「${S(p.name).slice(0, 20)}」`;
    // 安全相关操作不输出细节
    case 'users:changePass':
    case 'users:setSecurity':
    case 'users:recover':
    case 'security:enable':
    case 'security:disable':
    case 'security:change':
      return '';
    default:
      return '';
  }
}

/* ---------- 预期内错误的分级记录 ---------- */

/**
 * 「预期内的业务分支」错误码集合：这些不是程序故障，而是正常的业务结果，
 * 不应记为 ERROR。以 LAN_NEED_AUTH（令牌不正确/已失效）为例，它几乎总是
 * 用户手滑输错、或对方重新生成了令牌——记 ERROR 会刷屏，且在「调试模式」下
 * 每次都会追加一段堆栈，把真正的故障淹没掉（Beta.159 修复的真实困扰）。
 *
 * 命中此集合时默认降级为 WARN 且不记堆栈；但同一来源短时间内反复失败
 * 会被视为「有人在猜令牌」，升级回 ERROR 并带堆栈（见 shouldEscalate）。
 */
const EXPECTED_ERRORS = new Set(['LAN_NEED_AUTH']);

/** 疑似暴力猜测的判定参数：同一来源在窗口内失败达到阈值即升级记录 */
const AUTH_FAIL_WINDOW_MS = 60 * 1000;
const AUTH_FAIL_LIMIT = 5;
/** 上次累计次数达到 LIMIT 后，再隔多少次才重复告警一次（避免升级后又刷屏） */
const AUTH_FAIL_REPEAT = 20;
const authFailTrack = new Map(); // key: 来源标识 → { n, t0 }

/**
 * 记录一次预期内错误，并判断是否需要升级为 ERROR。
 * @returns {{ escalate: boolean }}
 */
function trackExpectedError(key) {
  const now = Date.now();
  let rec = authFailTrack.get(key);
  if (!rec || now - rec.t0 > AUTH_FAIL_WINDOW_MS) {
    rec = { n: 0, t0: now };
    authFailTrack.set(key, rec);
  }
  rec.n += 1;
  // 超阈值后按 REPEAT 间隔重复告警，而不是每一次都刷
  if (rec.n === AUTH_FAIL_LIMIT) return { escalate: true };
  if (rec.n > AUTH_FAIL_LIMIT && (rec.n - AUTH_FAIL_LIMIT) % AUTH_FAIL_REPEAT === 0) return { escalate: true };
  return { escalate: false };
}

/** 从 IPC 事件取来源标识：局域网共享为 HTTP 代理，事件里拿不到对端 IP，退化为固定键 */
function clientKey(e) {
  try {
    const url = (e && e.senderFrame && e.senderFrame.url) || '';
    const id = e && e.sender && e.sender.id;
    return `${id == null ? 'unknown' : id}|${url.slice(0, 60)}`;
  } catch (err) {
    return 'unknown';
  }
}

/* ---------- 统一通道注册器 ---------- */
function handle(ch, fn, opts = {}) {
  ipcMain.handle(ch, async (e, p) => {
    const t0 = Date.now();
    try {
      // 锁定守卫：未解锁时拒绝一切需要数据库的 IPC；noLockGuard=true 的通道绕过
      if (state.locked && !opts.noLockGuard) {
        throw new Error(i18n.errKey('settings.errDbLocked'));
      }
      if (HEAVY.has(ch)) getLog().info(`[操作] ${FLOW[ch] || ch} 开始`);
      const data = await fn(p || {}, e);
      const ms = Date.now() - t0;
      // 业务操作：每次成功都记一条"操作完成"流程日志（运行过程悬浮窗据此"流动"）
      if (FLOW[ch]) {
        const sum = flowSummary(ch, p, data);
        getLog().info(`[操作] ${FLOW[ch]} 完成（${ms}ms${sum ? ' · ' + sum : ''}）`);
      } else if (ms > 300) {
        getLog().info(`IPC ${ch} (${ms}ms)`);
      }
      return { ok: true, data };
    } catch (err) {
      const ms = Date.now() - t0;
      const code = err && err.code ? String(err.code) : '';
      // 预期内的业务分支（如令牌不正确）降级为 WARN 且**不传 err**（从而不写堆栈）；
      // 同一来源短时间反复失败则视为疑似猜测，升级回 ERROR 并保留堆栈。
      // message 为空时补兜底文案：否则日志行会出现「[ERROR] 后直接跟 at ...」的无文案堆栈，
      // 看上去像程序崩溃，实际无从定位（Beta.159 诊断的实际现象）。
      // ★ 日志用中文、界面用当前语言（Beta.271）★
      //   业务错误现在抛的是 i18n key（'settings.errPwdWrong' 或带参编码），
      //   直接落日志会变成看不懂的 key。logText 固定还原成 zh-CN 文案，理由见
      //   electron/i18n 的 logText 注释：日志要能跨语言、跨时间被读懂与 grep。
      const msg = i18n.logText(String((err && err.message) || '')) || '未知错误';
      if (EXPECTED_ERRORS.has(code)) {
        const { escalate } = trackExpectedError(clientKey(e) + '|' + ch);
        if (escalate) {
          getLog().error(`IPC ${ch} 连续失败（疑似猜测令牌）：${msg}`, err);
        } else {
          getLog().warn(`IPC ${ch} 被拒绝：${msg}（预期内的业务分支，非故障）`);
        }
      } else {
        getLog().error(`IPC ${ch} 失败 (${ms}ms): ${msg}`, err);
      }
      // 错误码随 IPC 边界丢失（只传 message），故以 [CODE] 前缀编码，由 preload 还原到 err.code。
      // 目前仅 lan:request 用 LAN_NEED_AUTH 让前端区分「需输入令牌」与「网络不通」。
      return { ok: false, error: (code ? `[${code}]` : '') + msg };
    }
  });
}

module.exports = { S, I, currentUser, safeAudit, FLOW, HEAVY, flowSummary, handle, getLog };
