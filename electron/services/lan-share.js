'use strict';
/**
 * 局域网只读共享服务：零依赖（Node 内置 http/dgram/os/crypto）。
 * - HTTP 只读 JSON 服务：只连共享副本库（share.db），绝不连主 archive.db，绝不暴露 users/密码。
 * - UDP 广播信标：开启共享的主机每 5s 广播 {name,ip,port}（或含 token，见下），供同局域网客户端发现。
 * - discover：客户端临时监听收集信标，返回发现的共享源列表。
 *
 * 【安全模型（Beta.154 加固）】
 * 本软件定位是「单机文档录入软件」，局域共享只是附加便利功能，真正的安全边界是
 * share.db 与 archive.db 的物理隔离（即使令牌被绕过，暴露的也只是文档，无密码/账户）。
 * 因此**刻意不做 TLS/双向证书**（Node 内置无法生成 X.509，做 TLS 必须引入 node-forge，
 * 与「单机软件」定位不匹配）。加固只针对「同网段监听者」这一真实威胁：
 *   1) 认证开启时，令牌**不再随 UDP 明文广播**，必须由用户手工输入；
 *   2) 不再绑定 0.0.0.0，只绑 127.0.0.1 + 各局域网网卡，切断外网口 / 虚拟网卡暴露面；
 *   3) 移除 Access-Control-Allow-Origin: *，阻止任意网页跨域读取。
 * 注意：HTTP 是公开协议，服务端无法可靠区分请求来源（UA/Origin 均可伪造），
 * 所以「只能通过本程序查看」在协议层面无法 100% 保证，本模块只做可达性收敛 + 令牌保护。
 */
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const share = require('../db/share');
const db = require('../db');
const keystore = require('../keystore');
const { getLog } = require('../services/logger');
const timefmt = require('./timefmt');
const arp = require('./arp-lookup');
const i18n = require('../i18n');
const { DEFAULT_PORT, DISCOVER_PORT } = require('./lan-constants');

const VISITOR_CAP = 500; // 访客浏览记录最多保留条数
const COPY_CAP = 500; // 拷贝上报记录最多保留条数
const COPY_BODY_MAX = 8192; // /api/copy-report 请求体上限（字节），防内存耗尽

/** 令牌校验失败的统一文案：IPC 层捕获该字符串用于识别 401（见 ipc/lanshare.js），改动需同步 */
const ERR_BAD_TOKEN = '无效的访问令牌';

let servers = []; // http server 实例数组（多地址各一个，Node 单实例不能二次 listen）
let listenAddrs = []; // 实际发起监听的地址（诊断用）
let beacon = null; // 广播 socket
let sharePort = 0;
let token = '';
let authEnabledRuntime = true; // 认证开关运行时值（默认开，与 DB 侧 !== '0' 兜底口径一致）
let allowCopyRuntime = false; // 是否允许他人拷贝文档（默认关：新增的危险能力必须显式开启）

/* 访客浏览记录：被他人浏览时由 HTTP 服务写入（运行日志 + 操作记录 + 此列表） */
let visitorLog = [];
let visitorPath = null;
let lastVisitorSave = 0;
const auditThrottle = {}; // ip -> 上次写入操作记录的时间戳（节流，避免刷屏）

/* 拷贝上报记录：他人把本机共享的文档拷走时，由其回连上报（落 lan-copies.json）。
 * ★ 纯「告知」通道，绝不读写 share.db ★ 该文件只含文档标题/编号与拷贝者标识，无正文。 */
let copyLog = [];
let copyPath = null;

function loadVisitorLog() {
  if (!visitorPath) return;
  try {
    if (fs.existsSync(visitorPath)) visitorLog = JSON.parse(fs.readFileSync(visitorPath, 'utf8')) || [];
  } catch (e) {
    visitorLog = [];
  }
}
function saveVisitorLog() {
  if (!visitorPath) return;
  const now = Date.now();
  if (now - lastVisitorSave < 1000) return;
  lastVisitorSave = now;
  try {
    fs.writeFileSync(visitorPath, JSON.stringify(visitorLog.slice(-VISITOR_CAP)));
  } catch (e) {}
}
function regionNameOf(id) {
  if (!id) return null;
  try {
    const r = share.listRegions().find(x => x.id === Number(id));
    return r ? r.name : null;
  } catch (e) {
    return null;
  }
}
function describe(pathname, u) {
  let m = pathname.match(/^\/api\/post\/(\d+)$/);
  if (m) {
    let p = null;
    try {
      p = share.getPost(Number(m[1]));
    } catch (e) {}
    return {
      kind: 'post',
      postId: Number(m[1]),
      regionId: p ? p.region_id : null,
      regionName: p ? regionNameOf(p.region_id) : null,
      postTitle: p ? p.title : null
    };
  }
  if (pathname === '/api/regions') return { kind: 'regions' };
  if (pathname === '/api/posts') {
    const rid = u.searchParams.get('regionId');
    return { kind: 'posts', regionId: rid ? Number(rid) : null, regionName: rid ? regionNameOf(Number(rid)) : null };
  }
  if (pathname === '/api/stats') return { kind: 'stats' };
  return { kind: 'other' };
}
/**
 * 解析对端身份三要素：主机名 / IP / MAC。
 *
 * 【为什么要有这个函数】访客记录与拷贝记录都要「主机名 + IP + MAC」，
 * 而这两条链路的取值方式完全一致，若各写一遍必然漂移（本项目已多次吃过重复实现的亏）。
 * 统一收敛在此，任何一条记录想补字段只改这里。
 *
 * 【两条来源与可信度】HTTP 服务端拿不到对端 MAC（只有 socket 源 IP）。所以：
 *   - MAC：优先本机内核邻居表【实测 arp】，取不到才用对端请求头自报【自报 self】；
 *   - 主机名：优先对端自报（服务端无从得知跨网段主机名），退回本机邻居表的反查
 *     （同网段且系统配了 DNS/NetBIOS 时 hostname 可能可用），都没有则留空。
 * macFrom 的值（'arp' | 'self' | ''）是前端的可信度标注依据，**不可省**：
 * 自报值可被随意伪造，不能与实测值混为一谈。
 *
 * @param {string} ip 已剥离 ::ffff: 前缀的源 IP
 * @param {object} [peer] 对端自报信息 { host, mac }（取自请求头，等同不可信输入）
 * @returns {{host:string, mac:string, macFrom:''|'arp'|'self'}}
 */
function resolvePeer(ip, peer) {
  const p = peer && typeof peer === 'object' ? peer : {};
  const selfHost = arp.sanitizeHost(p.host);
  const selfMac = arp.sanitizeMac(p.mac);
  const arpMac = arp.lookupMac(ip); // 内部已吞异常，失败返回空串
  let mac = arpMac;
  let macFrom = arpMac ? 'arp' : '';
  if (!mac && selfMac) {
    mac = selfMac;
    macFrom = 'self';
  }
  // 主机名：自报优先，退回本机已知的本机主机名（仅当来源就是本机时才有意义）
  let host = selfHost;
  if (!host && isSelfIp(ip)) host = arp.localHost();
  return { host, mac, macFrom };
}

function recordVisitor(ip, ok, pathname, u, peer) {
  const d = describe(pathname, u);
  const id = resolvePeer(ip, peer);
  const entry = {
    // 本地时间字符串（与主库 nowIso 同源）：此前用 toISOString() 记的是 UTC，比本地慢 8 小时，
    // 且不同记录格式不一致会让字符串比较（下方 lastTs 取较大值）失真。
    ts: timefmt.localTime(),
    ip,
    ok,
    // 对端三要素：主机名 / MAC 均由 resolvePeer 统一收敛，macFrom 标明可信度来源
    host: id.host,
    mac: id.mac,
    macFrom: id.macFrom,
    kind: d.kind,
    regionId: d.regionId ?? null,
    regionName: d.regionName ?? null,
    postId: d.postId ?? null,
    postTitle: d.postTitle ?? null,
    path: pathname
  };
  visitorLog.push(entry);
  if (visitorLog.length > VISITOR_CAP) visitorLog = visitorLog.slice(-VISITOR_CAP);
  saveVisitorLog();
  return entry;
}
function auditIfNeeded(ip, entry) {
  // 仅对"浏览大区/文档"记操作记录，且同一 IP 30s 内只记一次，避免刷屏
  if (entry.kind !== 'posts' && entry.kind !== 'post') return;
  const now = Date.now();
  if (auditThrottle[ip] && now - auditThrottle[ip] < 30000) return;
  auditThrottle[ip] = now;
  const uid = db.getSetting('session.user_id');
  const target =
    entry.kind === 'post'
      ? entry.postTitle || '#' + entry.postId
      : entry.regionName || i18n.t('sys.regionFallback', { id: entry.regionId });
  const detail = {
    visitor_ip: ip,
    kind: entry.kind,
    // 对端三要素一并入审计：MAC 标注来源（arp 实测 / self 自报），避免事后把自报值当实测值
    visitor_host: entry.host || '',
    visitor_mac: entry.mac || '',
    mac_from: entry.macFrom || '',
    region: entry.regionName || '',
    regionId: entry.regionId ?? null,
    post: entry.postTitle || '',
    postId: entry.postId ?? null
  };
  // 复用统一的审计入口（db.safeAudit）：内部已吞异常并记 warn，不再自写 try/catch
  db.safeAudit(uid, '局域网共享被访问', 'lan', target, detail);
}
function getVisitorLog() {
  return visitorLog.slice();
}

/* ---------------- 拷贝上报（源主机侧） ---------------- */
function loadCopyLog() {
  if (!copyPath) return;
  try {
    if (fs.existsSync(copyPath)) copyLog = JSON.parse(fs.readFileSync(copyPath, 'utf8')) || [];
  } catch (e) {
    copyLog = [];
  }
}
function saveCopyLog() {
  if (!copyPath) return;
  try {
    fs.writeFileSync(copyPath, JSON.stringify(copyLog.slice(-COPY_CAP)));
  } catch (e) {}
}
/**
 * 记录一条「本机共享文档被拷贝」的上报。
 * 只认最小必要字段并逐项截断——该内容来自局域网，等同不可信输入。
 * @returns {object|null} 落库的记录；ok=false 的失败上报也保留（便于甄别异常客户端）
 */
function recordCopy(ip, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const num = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  };
  const str = (v, n) =>
    String(v == null ? '' : v)
      .trim()
      .slice(0, n);
  // 主机名/MAC 统一走 resolvePeer（与访客记录同源），实测优先于自报
  const id = resolvePeer(ip, { host: p.host, mac: p.mac });
  const entry = {
    // 与服务端同一时间源（timefmt.localTime），避免客户端本地时钟不准污染记录
    ts: timefmt.localTime(),
    ip,
    host: id.host, // 拷贝者自报的主机名（不可信，仅展示参考）
    mac: id.mac, // ARP 实测优先，取不到用自报
    macFrom: id.macFrom, // 'arp'=实测 / 'self'=自报 / ''=未知（前端据此标注）
    operator: str(p.operator, 100), // 拷贝者自报的操作者名（不可信，仅展示参考）
    postId: num(p.postId, null),
    postTitle: str(p.postTitle, 200),
    no: str(p.no, 100),
    regionId: num(p.regionId, null),
    regionName: str(p.regionName, 100) || regionNameOf(num(p.regionId, null)),
    ok: p.ok === false ? false : true
  };
  copyLog.push(entry);
  if (copyLog.length > COPY_CAP) copyLog = copyLog.slice(-COPY_CAP);
  saveCopyLog();
  return entry;
}
function getCopyLog() {
  return copyLog.slice();
}
/**
 * 文档被拷排行：按 postId 聚合（被拷次数 / 首次 / 最近 / 拷贝者集合）。
 *
 * ★ 与 visitorRank 口径**刻意不同**：这里**不排除本机 IP**。
 *   Beta.211 起本机也能拷自己的文档（此前禁止），自拷同样是有效业务动作——
 *   它确实产生了一份带 copied_at 标识、另分配编号的副本，理应计入「被拷次数」。
 *   而访客统计排除本机，是因为自浏览不等于「有客人来访」。
 *   两者口径不同是**有意为之**，不是漏改：改动本函数前请先确认产品口径。
 */
function copyRank(top = 20) {
  const m = new Map();
  for (const e of copyLog) {
    if (!e || e.ok === false || e.postId == null) continue;
    const cur = m.get(e.postId) || {
      postId: e.postId,
      postTitle: e.postTitle,
      no: e.no,
      regionName: e.regionName,
      count: 0,
      firstTs: e.ts,
      lastTs: e.ts,
      actors: [],
      macs: []
    };
    cur.count++;
    if (e.ts < cur.firstTs) cur.firstTs = e.ts;
    if (e.ts > cur.lastTs) cur.lastTs = e.ts;
    // 展示用标识：主机名优先，退回 IP（两者都不可信，仅作甄别线索）。
    // 单独再收一份 MAC 集合：同名不同机的情况靠 MAC 才能区分开。
    const who = e.host || e.ip;
    if (who && !cur.actors.includes(who)) cur.actors.push(who);
    if (e.mac && !cur.macs.includes(e.mac)) cur.macs.push(e.mac);
    if (!cur.postTitle && e.postTitle) cur.postTitle = e.postTitle;
    m.set(e.postId, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, top);
}

function getLanIps() {
  const nis = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nis)) {
    for (const ni of list || []) {
      if (!ni.internal && ni.family === 'IPv4') ips.push(ni.address);
    }
  }
  return ips;
}
function getLanIp() {
  return getLanIps()[0] || '';
}

/**
 * 判断某访客 IP 是否来自本机（自己浏览自己的共享）。
 *
 * 背景：共享源经 HTTP 回环（http://127.0.0.1:<端口>）自浏览时同样走完整校验并记入访客日志，
 * 故日志里必然混有本机条目。统计访客数 / 排行时须排除，否则会出现
 * 「今日访客 0」与「127.0.0.1 访问 37 次」自相矛盾的展示。
 *
 * 注意：getLanIps() 内部过滤了 ni.internal，**不含 127.0.0.1 / ::1**，
 * 因此回环地址必须在此显式列举，不能指望 getLanIps() 覆盖。
 */
function isSelfIp(ip) {
  const v = String(ip || '').replace(/^::ffff:/, ''); // 幂等：兼容调用方未剥离 IPv4-mapped 前缀
  if (!v) return false; // 空值保守判为「非自己」，宁可多算也不误杀真实访客
  if (v === '127.0.0.1' || v === '::1') return true;
  return getLanIps().includes(v);
}

/**
 * 局域共享访客统计（近 N 日）：访客数按 IP 去重（计名不计次）+ 文档浏览量计次。
 *
 * 【时区】日志 ts 为 UTC ISO 字符串，若按 ts.slice(0,10) 分桶会与本地日错位
 * （东八区 00:00–08:00 的访问会被记进前一天）。此处刻意不做「按日分桶」，
 * 只做「绝对时刻 ≥ 阈值」比较，天然免疫时区错位。
 */
function lanVisitorStats(days = 7) {
  const since = Date.now() - days * 86400000;
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const t0 = today0.getTime();
  const ips7 = new Set();
  const ipsToday = new Set();
  let postView7 = 0;
  let postViewToday = 0;
  for (const e of visitorLog) {
    if (!e || !e.ok || !e.ts) continue; // 排除令牌校验失败与脏数据
    if (isSelfIp(e.ip)) continue; // 排除自己
    const t = new Date(e.ts).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= since) ips7.add(e.ip);
    if (t >= t0) ipsToday.add(e.ip);
    if (e.kind === 'post') {
      if (t >= since) postView7++;
      if (t >= t0) postViewToday++;
    }
  }
  return { visitor7: ips7.size, visitorToday: ipsToday.size, postView7, postViewToday };
}

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 统一的响应出口。`type` 只为根路径那张 HTML 说明页开放——其余一律 JSON。
 *
 * ★ 函数名沿用 sendJson，但它现在也发 HTML，所以不能无条件 JSON.stringify ★
 *   stringify 会把 HTML 里的真实换行转义成字面 `\n`、并给整段套上引号，
 *   浏览器里就看到满屏 `\n` 和一个游离的双引号（实测踩到，别改回去）。
 *
 * 即便放行 text/html，也**不带** Access-Control-Allow-Origin：通配 CORS 会让任意网页
 * （用户浏览器里打开的任何站点）跨域读取共享内容；本机渲染层走 IPC 代理，不需要 CORS。
 */
function sendJson(res, code, obj, type = 'application/json; charset=utf-8') {
  // ★ 必须用 headers 对象形式，不能写 writeHead(code, type) ★
  //   Node 的重载是 writeHead(statusCode[, statusMessage][, headers])——第二个位置是
  //   状态消息。传字符串进去会被当成 statusMessage，Content-Type 直接丢失
  //   （实测：响应头里 Content-Type 为空，浏览器按 text/plain 猜）。
  const isJson = /^application\/json/.test(type);
  res.writeHead(code, { 'Content-Type': type });
  res.end(isJson ? JSON.stringify(obj) : String(obj));
}

/**
 * 根路径说明页。
 *
 * ★ 为什么要有它 ★
 *   局域共享是个**纯 API 服务，没有网页前端**——共享内容由「文档盒」客户端自己拉取，
 *   浏览器不在设计场景内。此前根路径直接落进 404 分支返回 `{"error":"not found"}`，
 *   任何人拿浏览器试一下都会以为服务坏了（实测反馈即是如此），而真相是这个 JSON
 *   恰恰证明服务活着。用它把「服务在跑、怎么用、为什么打不开」说清楚。
 *
 * ★ 认不出的路径仍然保持 404 JSON ★
 *   只有恰好是 `/` 才给说明页。其余未知路径维持原有的机器可读 404，
 *   免得给扫描器/工具造成「本端口有网页」的错觉，也避免把探测面撑大。
 */
function sendRootPage(res) {
  const port = db.getSetting('lan.port') || DEFAULT_PORT;
  // ★ 这个模板字符串把三个坑都踩过一遍，改之前请读完 ★
  //
  // 1) 不能出现裸双引号。反引号模板里一个裸 " 就会提前截断字符串，后面全变成
  //    JS 表达式拼接——页面上会冒出字面的 \n 和游离引号。所以属性一律用单引号。
  //
  // 2) 但 charset 的单引号**无效**，而且 &#39; 实体在这里也救不了：
  //    实体在属性值里会被展开成字面单引号，DOM 里变成 charset="'utf-8'"，
  //    浏览器照样不认 → 按 Latin-1 解码 → 中文乱码。
  //    唯一可行的写法是**不带引号**的 charset=utf-8 —— 它本身是合法 token，
  //    模板字符串里也安全。别"顺手"给它加引号。
  //
  // 3) ★ 不要写内联 <style> ★
  //    Electron 渲染进程带 CSP `default-src 'self'`，内联样式会被直接拒绝
  //    （控制台报 Refused to apply inline style），页面退化成白底黑字。
  //    这是产品既有的安全策略，不该为了一个提示页去放宽它。
  //    所以这里只用语义标签，样式交给浏览器默认值——够用，且零攻击面。
  const V = require('../../package.json').version;
  const html = `<!doctype html><html lang='${i18n.currentLang()}'><head><meta charset=utf-8>
<title>${i18n.t('sys.lanPageTitle')}</title>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<meta name='robots' content='noindex'>
</head><body>
<h1>${i18n.t('sys.lanPageH1')}</h1>
<p>${i18n.t('sys.lanPageMeta', { ver: V, port })}</p>
<hr>
<p>${i18n.t('sys.lanPageOk1')}</p>
<p>${i18n.t('sys.lanPageOk2')}</p>
<p>${i18n.t('sys.lanPageOk3')}</p>
<ul>
<li>${i18n.t('sys.lanPageLi1')}</li>
<li>${i18n.t('sys.lanPageLi2')}</li>
</ul>
<p>${i18n.t('sys.lanPageOk4')}</p>
</body></html>`;
  return sendJson(res, 200, html, 'text/html; charset=utf-8');
}

function checkToken(req) {
  const u = new URL(req.url, 'http://localhost');
  const q = u.searchParams.get('token');
  const h = req.headers['x-lan-token'];
  return q === token || h === token;
}

function route(pathname, u) {
  const qp = (k, d) => {
    const v = u.searchParams.get(k);
    return v == null ? d : v;
  };
  if (pathname === '/api/regions') return share.listRegions();
  if (pathname === '/api/categories') {
    const r = qp('regionId');
    return share.listCategories(r ? Number(r) : null);
  }
  if (pathname === '/api/tags') return share.listTags();
  if (pathname === '/api/fields') return share.listFieldDefs();
  if (pathname === '/api/posts') {
    const f = {
      regionId: qp('regionId') ? Number(qp('regionId')) : undefined,
      q: qp('q') || undefined,
      limit: qp('limit') ? Number(qp('limit')) : 50,
      offset: qp('offset') ? Number(qp('offset')) : 0
    };
    return { list: share.listPosts(f), total: share.countPosts(f) };
  }
  let m = pathname.match(/^\/api\/post\/(\d+)$/);
  if (m) return share.getPost(Number(m[1]));
  if (pathname === '/api/stats') return share.listRegions().map(r => share.regionStats(r.id));
  m = pathname.match(/^\/api\/stats\/(\d+)$/);
  if (m) return share.regionStats(Number(m[1]));
  throw new Error('no route: ' + pathname);
}

/**
 * 读取请求体（带上限）。用于 POST /api/copy-report——本服务唯一接受写入的路由。
 * 超限立即销毁连接，避免局域网内构造超大 body 打爆内存。
 */
function readBody(req, max = COPY_BODY_MAX) {
  return new Promise(resolve => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) {
        req.destroy();
        return resolve(null);
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/**
 * 从请求头抽取对端自报身份。
 *
 * 请求头是**自定义扩展**而非标准头，对端（本程序自己的拷贝链路）会带上；
 * 浏览器等其他客户端不带，此时返回空对象，由 ARP 实测兜底。
 * 头名刻意加 `x-archbox-` 前缀，避免与反向代理/框架的 X-Forwarded-* 混淆。
 *
 * ★ 必须 decodeURIComponent ★
 * HTTP 头只能用 Latin-1 字节，中文主机名（如「办公室电脑」）直接塞进头会让
 * 发送端 fetch 抛 `Cannot convert argument to a ByteString`——这是实测踩到的坑。
 * 因此约定**凡是非 ASCII 字符一律 percent-encode 后传输**，此处解码还原。
 * 解码失败（对端发了畸形百分号序列）原样使用，绝不抛错。
 */
function peerFromHeaders(req) {
  const h = (req && req.headers) || {};
  const dec = v => {
    if (!v) return '';
    try {
      return decodeURIComponent(String(v));
    } catch (e) {
      return String(v);
    }
  };
  return {
    host: dec(h['x-archbox-host']),
    mac: h['x-archbox-mac'] || '' // MAC 一定纯 ASCII，无需解码
  };
}

/**
 * 请求处理器工厂：从原 createServer 回调体原样抽出，供多个 server 实例共享。
 * Node 不能在同一 http.Server 实例上二次 listen（ERR_SERVER_ALREADY_LISTEN），
 * 同一 handler 挂到多个实例、各绑一个地址，是「多网卡监听」的唯一可行写法。
 *
 * 【写入口收敛】本服务整体只读，**唯一**的写路由是 `POST /api/copy-report`：
 * 纯上报「谁拷走了哪篇」，不触碰 share.db、不落正文，且要求 allowCopy 已开启。
 */
function makeHandler() {
  return async (req, res) => {
    let u;
    try {
      u = new URL(req.url, 'http://localhost');
    } catch (e) {
      return sendJson(res, 400, { error: 'bad url' });
    }
    const p = u.pathname;
    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const peer = peerFromHeaders(req);
    if (p === '/health' || p === '/api/version') {
      // 能力位：客户端据此提前禁用「拷贝到本机」按钮，而不是拷到一半被 403 拒绝。
      //
      // ★ 必须包在 data 里，与其它路由共用同一个响应信封 ★
      //   所有 /api/* 路由都是 `{ ok:true, data }`，客户端（ipc/lanshare.js 的 lan:request
      //   与 lan:copyPost 的 reqJson）统一解包 `json.data`。本路由曾把能力位平铺在顶层
      //   （ok/app/version/allowCopy），于是 json.data === undefined：
      //     · lan:copyPost 的 reqJson 读 `cap.allowCopy` → undefined → 误判「未开放拷贝」，
      //       拷贝被自己的能力位检查挡下；
      //     · 前端 probeAllowCopy 读 `v.allowCopy` → undefined → 按钮置灰。
      //   现象就是「明明开了拷贝权限，本机却显示『该共享源未开放拷贝』」（Beta.213 修复）。
      //   顶层同时保留 app/version：这是对外公开的版本探针，平铺字段便于 curl 自查，
      //   且老客户端若直接读顶层也能继续工作（新增 data 不破坏既有读取）。
      const info = {
        app: 'Archbox',
        version: require('../../package.json').version,
        allowCopy: allowCopyRuntime
      };
      return sendJson(res, 200, { ok: true, ...info, data: info });
    }
    // 根路径给一句人话，其余未知路径维持机器可读的 404（见 sendRootPage 注释）。
    if (p === '/') return sendRootPage(res);
    if (!p.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
    if (!checkToken(req)) {
      recordVisitor(ip, false, p, u, peer);
      getLog().warn(`[LAN访客] 令牌校验失败 ${ip} ${p}`);
      return sendJson(res, 401, { error: ERR_BAD_TOKEN });
    }
    // ---- 唯一写路由：拷贝上报 ----
    if (p === '/api/copy-report') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: '仅支持 POST' });
      if (!allowCopyRuntime) return sendJson(res, 403, { error: '未开放拷贝' });
      const raw = await readBody(req);
      if (raw == null) return sendJson(res, 413, { error: '请求体过大' });
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch (e) {
        return sendJson(res, 400, { error: '请求体不是合法 JSON' });
      }
      try {
        const entry = recordCopy(ip, body);
        getLog().info(
          `[LAN拷贝] ${ip}${entry.host ? '（' + entry.host + '）' : ''}${entry.mac ? ' ' + entry.mac + '(' + entry.macFrom + ')' : ''} 拷贝了「${entry.postTitle || '#' + entry.postId}」`
        );
        // 审计用当前登录用户（=共享者本人），detail 记录对方三要素与可信度来源
        db.safeAudit(
          db.getSetting('session.user_id'),
          '局域网共享文档被拷贝',
          'lan',
          entry.postTitle || '#' + entry.postId,
          {
            peer_ip: ip,
            peer_host: entry.host,
            peer_mac: entry.mac,
            mac_from: entry.macFrom,
            operator: entry.operator,
            postId: entry.postId,
            no: entry.no,
            region: entry.regionName
          }
        );
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: '仅支持 GET' });
    }
    if (!share.isReady()) return sendJson(res, 503, { error: '分享副本库未就绪' });
    // 注：认证开关只影响「令牌是否随广播分发」，不影响此处校验。
    // 关开关时客户端由发现结果直接拿到 token，仍然过这一关——即关开关是
    // 「凭证自动分发」而非「无认证」，这样不会出现真正意义上的裸奔接口。
    try {
      const data = route(p, u);
      const entry = recordVisitor(ip, true, p, u, peer);
      getLog().info(
        `[LAN访客] ${ip} ${p}${entry.regionName ? ' · ' + entry.regionName : ''}${entry.postTitle ? ' · ' + entry.postTitle : ''}${entry.mac ? ` · ${entry.mac}(${entry.macFrom})` : ''}`
      );
      auditIfNeeded(ip, entry);
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      if (e && typeof e.message === 'string' && e.message.startsWith('no route')) {
        return sendJson(res, 404, { error: e.message });
      }
      return sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
    }
  };
}

function stopServers() {
  for (const s of servers) {
    try {
      s.close();
    } catch (e) {}
  }
  servers = [];
  listenAddrs = [];
}

function startShare({ port, token: t, name, authEnabled = true, allowCopy = false }) {
  token = t || genToken();
  sharePort = port;
  authEnabledRuntime = !!authEnabled;
  allowCopyRuntime = !!allowCopy;
  try {
    visitorPath = path.join(keystore.readDataDir(), 'lan-visitors.json');
    loadVisitorLog();
  } catch (e) {
    visitorPath = null;
  }
  try {
    copyPath = path.join(keystore.readDataDir(), 'lan-copies.json');
    loadCopyLog();
  } catch (e) {
    copyPath = null;
  }

  // 先停旧实例：否则重复 startShare 会留下泄漏的旧监听 → EADDRINUSE（已实测）
  stopServers();

  const handler = makeHandler();
  // 必须含 127.0.0.1：本机自浏览（LanShare.vue localSrc）走 HTTP 回环，
  // 只绑局域网 IP 会让回环 ECONNREFUSED（已实测）→ 本机预览直接坏掉。
  // 也不能绑 0.0.0.0：那等于对所有网卡开放，含外网口与虚拟网卡。
  const hosts = [...new Set(['127.0.0.1', ...getLanIps()])];
  for (const host of hosts) {
    const s = http.createServer(handler);
    // 单个网卡监听失败不应拖垮整体：虚拟网卡（VMware/Hyper-V）常处于半死状态，
    // 回环是必需项、局域网各网卡尽力而为。
    s.on('error', e => getLog().warn(`局域网共享监听 ${host}:${port} 失败: ${e.code || e.message}`));
    s.listen(port, host, () => {
      listenAddrs.push({ host, port });
      getLog().info(`局域网共享监听 ${host}:${port}`);
    });
    servers.push(s);
  }
  startBeacon(name || os.hostname(), authEnabledRuntime);
  return { port, token };
}

/**
 * 启动 UDP 广播信标。
 * @param {string} name 共享源名称
 * @param {boolean} authEnabled 认证开关：开 → 广播**不带 token**（须手工输入）；
 *                              关 → 广播带 token，客户端一点即连。
 */
function startBeacon(name, authEnabled = true) {
  // 必须显式停掉旧信标：否则旧 socket 与它的 setInterval 会永远活着，
  // 造成「ON→OFF 切换后网络里仍有一个带 token 的广播在跑」——
  // 等于关掉认证后旧的明文广播还继续泄露令牌（已实测复现）。
  stopBeacon();
  beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  beacon.on('error', () => {});
  // 多网卡逐播：255.255.255.255 在部分系统只从默认网卡发出，多网卡环境下
  // 其他网段的客户端收不到信标；同时带上全部 IP 供客户端做「排除本机」判断。
  const ips = getLanIps();
  const base = { name, ip: ips[0] || '', ips, port: sharePort };
  const payload = Buffer.from(JSON.stringify(authEnabled ? base : { ...base, token }));
  beacon.bind(() => {
    try {
      beacon.setBroadcast(true);
    } catch (e) {}
    const send = () => {
      // 逐网卡定向广播：255.255.255.255 在部分系统只从默认路由网卡发出，
      // 多网卡（有线+无线/虚拟网卡）环境下别的网段客户端会收不到信标。
      // setMulticastInterface 对 udp4 不起作用，这里用「逐 IP 定向广播 + 全局广播」兜底。
      try {
        beacon.send(payload, 0, payload.length, DISCOVER_PORT, '255.255.255.255');
      } catch (e) {}
      for (const ip of ips) {
        const bcast = `${ip.slice(0, ip.lastIndexOf('.'))}.255`;
        try {
          beacon.send(payload, 0, payload.length, DISCOVER_PORT, bcast);
        } catch (e) {}
      }
    };
    send();
    beacon._bcTimer = setInterval(send, 5000);
  });
}

function stopBeacon() {
  if (!beacon) return;
  try {
    clearInterval(beacon._bcTimer);
  } catch (e) {}
  try {
    beacon.close();
  } catch (e) {}
  beacon = null;
}

function stopShare() {
  stopServers();
  stopBeacon();
  try {
    saveVisitorLog();
  } catch (e) {}
  try {
    saveCopyLog();
  } catch (e) {}
}

/** 运行时切换「允许他人拷贝」能力位（无需重启监听） */
function setAllowCopy(v) {
  allowCopyRuntime = !!v;
  return allowCopyRuntime;
}
function isAllowCopy() {
  return allowCopyRuntime;
}

/** 发现：临时监听收集信标，去重后返回共享源列表 */
function discover(timeoutMs = 3000) {
  return new Promise(resolve => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Map();
    sock.on('error', () => {});
    sock.on('message', msg => {
      try {
        const d = JSON.parse(msg.toString());
        if (d && d.ip && d.port) {
          const key = `${d.ip}:${d.port}`;
          if (!found.has(key)) {
            // token 归一为空串：认证开启时广播不再携带 token，下游统一按
            // 「token 为空 = 需要手工输入访问令牌」处理，避免 undefined 四处传递。
            found.set(key, { name: d.name, ip: d.ip, ips: d.ips || [d.ip], port: d.port, token: d.token || '' });
          }
        }
      } catch (e) {}
    });
    sock.bind(DISCOVER_PORT, () => {
      try {
        sock.setBroadcast(true);
      } catch (e) {}
    });
    setTimeout(() => {
      try {
        sock.close();
      } catch (e) {}
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}

function getSharePort() {
  return sharePort;
}

/* 访客 / 文档 排行：基于访客日志近 N 天聚合，取访问量前 top 名 */
function rankByField(list, key, days, top) {
  const since = Date.now() - days * 86400000;
  const m = new Map();
  for (const e of list) {
    if (!e.ts || new Date(e.ts).getTime() < since) continue;
    const k = e[key];
    if (k == null) continue;
    const cur = m.get(k) || { key: k, count: 0, lastTs: e.ts, title: e.postTitle };
    cur.count++;
    if (e.ts > cur.lastTs) {
      cur.lastTs = e.ts;
      if (e.postTitle) cur.title = e.postTitle;
    }
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, top);
}
function visitorRank(days = 7, top = 7) {
  // 排除本机自浏览（与 lanVisitorStats 口径一致），否则会出现
  // 「今日访客 0」却「127.0.0.1 访问 N 次」的矛盾展示。
  const list = visitorLog.filter(e => e.ok && !isSelfIp(e.ip));
  const rows = rankByField(list, 'ip', days, top).map(r => ({
    ip: r.key,
    count: r.count,
    lastTs: r.lastTs,
    host: '',
    mac: '',
    macFrom: ''
  }));
  // 补上主机名/MAC：同一次访问可能既有实测值又有自报值，取「最新且有值」的那条。
  // 实测（arp）优先于自报（self）——后者可被对端随意伪造，只在没实测时才用。
  for (const row of rows) {
    const mine = list.filter(e => e.ip === row.ip && (e.host || e.mac));
    const pick = key => {
      let best = '';
      for (const e of mine) {
        const v = e[key];
        if (!v) continue;
        if (!best) {
          best = v;
          continue;
        }
        // MAC 有 macFrom 可信度：实测值一旦出现就不再被自报值覆盖
        if (key === 'mac' && e.macFrom === 'arp') best = v;
      }
      return best;
    };
    row.host = pick('host');
    row.mac = pick('mac');
    // macFrom 跟着最终选中的那条走
    const hit = mine.filter(e => e.mac === row.mac).sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
    row.macFrom = hit ? hit.macFrom || '' : '';
  }
  return rows;
}
function postViewRank(days = 7, top = 7) {
  const posts = visitorLog.filter(e => e.kind === 'post');
  return rankByField(posts, 'postId', days, top).map(r => ({
    postId: r.key,
    postTitle: r.title,
    count: r.count,
    lastTs: r.lastTs
  }));
}

module.exports = {
  ERR_BAD_TOKEN,
  startShare,
  stopShare,
  discover,
  genToken,
  getLanIp,
  getLanIps,
  getSharePort,
  getListenAddrs: () => listenAddrs.slice(),
  getVisitorLog,
  recordVisitor,
  isSelfIp,
  lanVisitorStats,
  visitorRank,
  postViewRank,
  resolvePeer,
  // 拷贝能力与上报记录
  setAllowCopy,
  isAllowCopy,
  recordCopy,
  getCopyLog,
  copyRank,
  COPY_CAP
};
