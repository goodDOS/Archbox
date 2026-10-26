'use strict';
/**
 * 局域网共享 IPC 通道（lan:*）。
 * 职责：编排"共享开关 / 共享大区集合 / 副本库同步 / 局域网发现"。
 * 安全边界：副本库（share.db）只含文档，server 只连 share.db，绝不连主 archive.db。
 * 写操作（setEnabled/addRegion/...）在未解锁时拒绝；getStatus/discover 允许未解锁查询（noLockGuard）。
 */
const i18n = require('../i18n');
const { handle, getLog, safeAudit, S, I } = require('./shared');
const db = require('../db');
const share = require('../db/share');
const lanShare = require('../services/lan-share');
const { DEFAULT_PORT } = require('../services/lan-constants');
const state = require('../state');
const keystore = require('../keystore');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { readJson, writeJson } = require('../services/userdata-store');

/** 大区/分类「代码」的最大长度，与 taxonomy.saveRegion/saveCategory 的 slice(0,20) 保持一致 */
const CODE_MAX = 20;

/**
 * 取一个在 `table` 里未被占用的代码。
 * ★ 为什么需要它 ★
 *   拷贝路径上的大区/分类以前把代码写死成 'LAN'（Beta.215 修复），
 *   于是本机无论新建多少个拷贝大区，代码列全是 LAN，用户无法区分。
 *   现在优先用用户在弹窗里填的代码；没填则按名称推导，且保证全库唯一
 *   （同名冲突时追加 2、3…，与 taxonomy 的「代码查重」语义一致，
 *    否则拷贝会因重码被 saveRegion/saveCategory 的校验直接拒掉）。
 * @param {(sql:string, args:any[])=>any} getQ 查询函数
 * @param {string} table 'regions' | 'categories'
 * @param {string} code 期望代码（调用方已 trim）
 */
function uniqueCode(getQ, table, code) {
  const root = String(code || '')
    .trim()
    .slice(0, CODE_MAX);
  if (!root) return '';
  for (let i = 1; i <= 500; i++) {
    const suffix = i === 1 ? '' : String(i);
    const cand = root.slice(0, CODE_MAX - suffix.length) + suffix;
    if (!getQ(`SELECT id FROM ${table} WHERE code=?`, [cand])) return cand;
  }
  return root;
}

/**
 * 按名称推导一个可读的兜底代码：取名称里的 ASCII 字母/数字并大写
 * （"HR文档" → "HR"、"Q3 报表" → "Q3"），一个都没有则退回 'LAN'（拷贝语义）。
 */
function deriveCode(name) {
  const ascii = String(name || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12);
  return ascii || 'LAN';
}

/* ---------- 远端源访问令牌缓存（客户端侧） ----------
 * 认证开启时远端不再随广播分发令牌，用户手工输入一次后记住，避免每次连接都要重输。
 *
 * 落地 userData/lan-tokens.json，不依赖 localStorage：打包版走 file://，
 * Chromium 存储分区限制下读写会抛「Access is denied for this document」。
 * 之前用 localStorage 且三处写入点各自 try/catch 静默吞异常，导致
 * 「输一次就记住」在打包版里从未真正生效过（Beta.160 修复）。
 * 与 search-history.json 同一套路，项目已验证。
 *
 * 注意：语义上是「客户端缓存」而非用户设置，故不放进 settings ——
 * settings 的 allSettings() 会整表下发到前端，令牌不该出现在那里。 */
const TOKEN_CACHE_FILE = path.join(app.getPath('userData'), 'lan-tokens.json');
/** 缓存条目上限：正常用不到几条，超出基本是脏数据，顺手兜住文件体积 */
const TOKEN_CACHE_LIMIT = 50;
/** 合法键形如 `192.168.1.7:47373` */
const TOKEN_KEY_RE = /^[^\s:]+:\d{1,5}$/;

function readTokenCache() {
  const raw = readJson(TOKEN_CACHE_FILE, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const k of Object.keys(raw)) {
    // 只留「合法 ip:port 键 + 字符串令牌」，脏数据一律丢弃（文件可能被手工改坏）
    if (Object.keys(out).length >= TOKEN_CACHE_LIMIT) break;
    if (TOKEN_KEY_RE.test(k) && typeof raw[k] === 'string' && raw[k]) out[k] = raw[k];
  }
  return out;
}
function writeTokenCache(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const k of Object.keys(map)) {
      if (Object.keys(out).length >= TOKEN_CACHE_LIMIT) break;
      if (TOKEN_KEY_RE.test(k) && typeof map[k] === 'string' && map[k]) out[k] = map[k];
    }
  }
  writeJson(TOKEN_CACHE_FILE, out);
  return out;
}

function getSharedRegions() {
  try {
    return JSON.parse(db.getSetting('lan.sharedRegions') || '[]');
  } catch (e) {
    return [];
  }
}
function setSharedRegions(ids) {
  db.setSetting('lan.sharedRegions', JSON.stringify(ids));
}
/** 本机在局域网广播中的显示名称（供其它终端识别），未设置时回退系统主机名 */
function getLanName() {
  const n = (db.getSetting('lan.name') || '').trim();
  return n || os.hostname();
}
/**
 * 认证开关是否开启（默认开启）。
 *
 * 兜底必须用 `!== '0'` 而非 `=== '1'`：老版本升级上来的库没有 lan.auth 这个键，
 * db.getSetting 返回 null，若用 `=== '1'` 会判成「关闭认证」→ 令牌重新随广播明文分发，
 * 等于静默把用户的安全等级降回加固前。用 !== '0' 才能保证「键不存在 = 默认开」。
 */
function isAuthEnabled() {
  return db.getSetting('lan.auth') !== '0';
}
/**
 * 是否允许他人把本机共享的文档拷贝走（默认**关闭**）。
 *
 * ★ 兜底方向与 isAuthEnabled 相反 ★
 * 「允许拷贝」是 Beta.206 新增的**危险能力**：开启后同网段任意持有令牌的终端都能
 * 把共享文档整篇搬走。因此必须用 `=== '1'`——老库没有该键 → 默认关，
 * 绝不能让升级用户静默获得一个他没同意过的能力。
 */
function isAllowCopy() {
  return db.getSetting('lan.allowCopy') === '1';
}
/**
 * 重启共享服务（唯一启动入口）。
 * 集中在此处读取 settings 并传入 authEnabled，避免 4 个调用点各写一遍导致漏传。
 * 内含 stopShare：lan-share 侧 startShare 自身也会 stopServers，双保险防监听泄漏。
 */
function restartShare() {
  const port = Number(db.getSetting('lan.port') || DEFAULT_PORT);
  const tk = db.getSetting('lan.token') || lanShare.genToken();
  lanShare.startShare({
    port,
    token: tk,
    name: getLanName(),
    authEnabled: isAuthEnabled(),
    allowCopy: isAllowCopy()
  });
}
function ensureReady() {
  if (state.locked) throw new Error(i18n.errKey('common.errLanDbLocked'));
  if (!share.isReady()) {
    return share.initShare(keystore.readDataDir());
  }
  return Promise.resolve();
}

function registerLanShare() {
  handle(
    'lan:getStatus',
    () => ({
      enabled: db.getSetting('lan.enabled') === '1',
      name: getLanName(),
      port: Number(db.getSetting('lan.port') || DEFAULT_PORT),
      token: db.getSetting('lan.token') || '',
      authEnabled: isAuthEnabled(),
      allowCopy: isAllowCopy(),
      /* ★ Beta.168：关闭态下发空数组。
       * 设置里的 lan.sharedRegions 是【为下次开启保留的勾选记录】（开启分支 122-123 行
       * 靠它恢复上次的大区，不能清），但它不是「当前正在共享」的实时值。
       * 前端 App.vue / SharePanel.vue 都执行 store.lanShared = sharedRegions，而
       * RegionNav / RegionView 的「已共享」徽标只查 store.lanShared —— 关闭后照样亮着。
       * 故此处按 enabled 收口：关闭即下发空，重开时自然恢复。 */
      sharedRegions: db.getSetting('lan.enabled') === '1' ? getSharedRegions() : [],
      lanIp: lanShare.getLanIp(),
      // 多网卡时 lanIp 只是第一张网卡，客户端排除「本机信标」须比对整个列表，
      // 否则第二张网卡发出的自身信标会被当远端源显示（原实现的 bug）。
      lanIps: lanShare.getLanIps()
    }),
    { noLockGuard: true }
  );

  handle(
    'lan:setEnabled',
    async p => {
      await ensureReady();
      const enabled = !!p.enabled;
      if (enabled) {
        const port = Number(p.port || db.getSetting('lan.port') || DEFAULT_PORT);
        let tk = db.getSetting('lan.token');
        if (!tk) {
          tk = lanShare.genToken();
          db.setSetting('lan.token', tk);
        }
        db.setSetting('lan.port', String(port));
        db.setSetting('lan.enabled', '1');
        const ids = getSharedRegions();
        if (ids.length) share.rebuild(ids);
        restartShare();
      } else {
        lanShare.stopShare();
        db.setSetting('lan.enabled', '0');
      }
      return {
        enabled,
        port: Number(db.getSetting('lan.port') || DEFAULT_PORT),
        token: db.getSetting('lan.token') || '',
        authEnabled: isAuthEnabled()
      };
    },
    { noLockGuard: true }
  );

  /**
   * 认证开关：开 = 需手工输入访问令牌；关 = 令牌公开广播（令牌随广播分发，一点即连）。
   * 关开关**不是关认证**——HTTP 侧仍校验令牌，只是令牌由广播自动送达。
   *
   * 【关 → 开 时重置令牌】
   * 重新进入「需手工输入令牌」模式即视为一次凭证轮换：旧的令牌可能已在关闭期间
   * 随广播明文扩散到同网段任意主机，继续沿用等于把关闭期间泄露的凭证带进安全模式。
   * 因此重新开启时换发新令牌，使关闭期间流出的旧令牌立即失效。
   * 已在连接的终端会因此需要重新输入新令牌——这是有意为之，不做额外确认。
   *
   * 开 → 关 不刷新：此时令牌本就即将随广播公开，换不换没有安全收益，反而白白
   * 让当前正在使用的终端断连。
   */
  handle(
    'lan:setAuth',
    p => {
      const on = !!p.enabled;
      const wasOn = isAuthEnabled();
      const rotated = on && !wasOn;
      db.setSetting('lan.auth', on ? '1' : '0');
      if (rotated) {
        db.setSetting('lan.token', lanShare.genToken());
        getLog().info('局域网共享重新开启认证，已换发新的访问令牌');
      }
      if (db.getSetting('lan.enabled') === '1') restartShare();
      getLog().info(`局域网共享认证已${on ? '开启' : '关闭'}`);
      return { authEnabled: on, tokenRotated: rotated, token: db.getSetting('lan.token') || '' };
    },
    { noLockGuard: true }
  );

  handle(
    'lan:regenerateToken',
    () => {
      const tk = lanShare.genToken();
      db.setSetting('lan.token', tk);
      if (db.getSetting('lan.enabled') === '1') restartShare();
      return { token: tk };
    },
    { noLockGuard: true }
  );

  /**
   * 允许他人拷贝文档开关（默认关）。
   * 开启后同网段持有令牌的终端可将共享文档整篇拷到自己本机。
   * 运行时切换走 lanShare.setAllowCopy（能力位即时生效），无需重启监听——
   * 但已开启共享时仍 restartShare 一次，让 UDP 广播与能力位口径完全一致。
   */
  handle(
    'lan:setAllowCopy',
    p => {
      if (state.locked) throw new Error(i18n.errKey('common.errLanDbLocked'));
      const on = !!p.enabled;
      db.setSetting('lan.allowCopy', on ? '1' : '0');
      lanShare.setAllowCopy(on);
      if (db.getSetting('lan.enabled') === '1') restartShare();
      getLog().info(`局域网共享「允许他人拷贝文档」已${on ? '开启' : '关闭'}`);
      return { allowCopy: on };
    },
    { noLockGuard: false }
  );

  handle(
    'lan:setName',
    async p => {
      if (state.locked) throw new Error(i18n.errKey('common.errLanDbLocked'));
      const name = S(p.name).slice(0, 64);
      if (!name) throw new Error(i18n.errKey('common.errLanHostEmpty'));
      db.setSetting('lan.name', name);
      // 已开启共享则重启服务，使新名称立即生效于 UDP 广播，便于其它终端识别
      if (db.getSetting('lan.enabled') === '1') restartShare();
      getLog().info(`局域网共享主机名已更新为：${name}`);
      return { name };
    },
    { noLockGuard: true }
  );

  handle('lan:listRegions', () => db.listRegions(), { noLockGuard: true });

  /**
   * 远端源访问令牌缓存：读写 userData/lan-tokens.json。
   * 未解锁时也允许（纯客户端缓存，不碰主库），故 noLockGuard。
   * 读不抛异常（文件缺失/损坏 → `{}`），写失败静默——令牌缓存属于尽力而为的体验优化，
   * 不该因为磁盘只读之类的问题阻断连接流程。
   */
  handle('lan:getTokenCache', () => readTokenCache(), { noLockGuard: true });
  handle(
    'lan:setTokenCache',
    p => {
      writeTokenCache(p && p.map);
      return true;
    },
    { noLockGuard: true }
  );

  handle(
    'lan:addRegion',
    async p => {
      await ensureReady();
      const id = I(p.regionId);
      if (!id) throw new Error(i18n.errKey('common.errLanNoRegion'));
      const ids = getSharedRegions();
      if (!ids.includes(id)) ids.push(id);
      setSharedRegions(ids);
      share.rebuild(ids);
      return { sharedRegions: ids };
    },
    { noLockGuard: true }
  );

  handle(
    'lan:removeRegion',
    async p => {
      await ensureReady();
      const id = I(p.regionId);
      let ids = getSharedRegions();
      ids = ids.filter(x => x !== id);
      setSharedRegions(ids);
      share.rebuild(ids);
      return { sharedRegions: ids };
    },
    { noLockGuard: true }
  );

  handle(
    'lan:syncNow',
    async _p => {
      await ensureReady();
      const ids = getSharedRegions();
      share.rebuild(ids);
      return { sharedRegions: ids, synced: true };
    },
    { noLockGuard: true }
  );

  handle(
    'lan:discover',
    async () => {
      const sources = await lanShare.discover(3000);
      return { sources };
    },
    { noLockGuard: true }
  );

  /**
   * 浏览他人：本机作为客户端访问某局域网共享源时，在主库写入运行日志 + 操作记录。
   * 由前端在"选中大区 / 打开文档"时调用（仅对远端源，本机自浏览不记录）。
   */
  handle('lan:audit', p => {
    const detail = { host: p.host || '', ip: p.ip || '', region: p.region || '', post: p.post || '' };
    safeAudit(db.getSetting('session.user_id'), '浏览局域网共享源', 'lan', p.host || '', detail);
    getLog().info(`[LAN浏览] 本机浏览共享源 ${p.host || '?'} · ${p.region || ''} ${p.post || ''}`.trim());
    return { ok: true };
  });

  /** 访客浏览记录：供"我的共享"主机页展示谁浏览过本机共享 */
  handle('lan:visitorLog', () => ({ list: lanShare.getVisitorLog() }), { noLockGuard: true });

  /** 访客排行（近 7 天 · 7 名）：按访客 IP 聚合访问次数 */
  handle('lan:visitorRank', () => ({ list: lanShare.visitorRank(7, 7) }), { noLockGuard: true });

  /** 文档查看排行（近 7 天 · 7 篇）：按被查看的文档聚合次数 */
  handle('lan:postViewRank', () => ({ list: lanShare.postViewRank(7, 7) }), { noLockGuard: true });

  /** 拷贝记录明细：谁、何时、拷走了哪篇（供「我的共享」抽屉展示） */
  handle('lan:copyLog', () => ({ list: lanShare.getCopyLog() }), { noLockGuard: true });

  /** 文档被拷排行：按 postId 聚合次数/首次/最近/拷贝者集合 */
  handle('lan:copyRank', () => ({ list: lanShare.copyRank(20) }), { noLockGuard: true });

  /**
   * 拷贝远端文档到本机主库。
   *
   * 【为什么这个通道默认 noLockGuard=false】它要写主库（新建文档），
   * 加密锁定状态下不得落盘，必须与其它写通道同口径。
   *
   * 【关键设计：上报失败不回滚】
   * 文档已在用户本机落库后，再回连源主机上报「被拷贝」。上报是「尽力而为的告知」，
   * 与令牌缓存同一哲学——网络抖动、对方已关共享、对方 403 都不该让用户白拷一次。
   * 故上报独立 try/catch，失败只 warn。
   */
  handle(
    'lan:copyPost',
    async p => {
      if (state.locked) throw new Error(i18n.errKey('common.errLanDbLocked'));
      const src = p && p.source ? p.source : {};
      const host = String(src.ip || '').trim();
      const port = Number(src.port);
      const tk = String(src.token || '');
      const remoteId = Number(p && p.remotePostId);
      const srcName = String(src.name || host)
        .trim()
        .slice(0, 64);
      if (!host || !port || !remoteId) throw new Error(i18n.errKey('common.errLanNoPeer'));
      const base = `http://${host}:${port}`;
      const withToken = u => {
        if (tk) u.searchParams.set('token', tk);
        return u;
      };

      /**
       * 本机自报身份请求头（主机名 + MAC）。
       *
       * 源主机只能从 TCP 拿到我们的 IP，MAC 属二层信息拿不到；同网段时对方可查自己的
       * ARP 表实测，**跨网段时只有我们自报这一条路**。故每个出站请求都带上，
       * 让对方侧 resolvePeer 有自报兜底。对方会用 macFrom='self' 标明这是自报值。
       *
       * ★ 主机名必须 encodeURIComponent ★
       * HTTP 头只允许 Latin-1 字节，中文主机名（默认回退 os.hostname() 时可能是中文，
       * 用户自定义的共享名更是常为中文）直接放进去会让 fetch 抛
       * `Cannot convert argument to a ByteString`（实测）。百分号编码后传输，
       * 源主机侧 peerFromHeaders 会解码还原。MAC 是纯 ASCII，无需编码。
       */
      const idHeaders = () => ({
        'X-Archbox-Host': encodeURIComponent(getLanName()),
        'X-Archbox-Mac': keystore.getMac()
      });

      /** 统一的源主机请求：8s 超时 + 401 归类为 LAN_NEED_AUTH（与 lan:request 同口径） */
      const reqJson = async path => {
        const u = withToken(new URL(base + path));
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const res = await fetch(u.toString(), { headers: idHeaders(), signal: ctrl.signal });
          const text = await res.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (e) {
            throw new Error(i18n.errKey('common.errLanNotJson'));
          }
          if (res.status === 401 || (json && json.error === lanShare.ERR_BAD_TOKEN)) {
            const err = new Error(lanShare.ERR_BAD_TOKEN);
            err.code = 'LAN_NEED_AUTH';
            throw err;
          }
          if (!res.ok || !json || !json.ok)
            throw new Error((json && json.error) || i18n.errKey('common.errLanHttpFail', { status: res.status }));
          return json;
        } finally {
          clearTimeout(timer);
        }
      };

      // 1) 先问能力位：源主机未开放拷贝则直接拒绝（避免把正文白拉一遍）
      let capOk;
      try {
        const cap = await reqJson('/api/version');
        capOk = !!(cap && cap.allowCopy);
      } catch (e) {
        if (e && e.code === 'LAN_NEED_AUTH') throw e;
        throw new Error(i18n.errKey('common.errLanConnect', { msg: e.message }));
      }
      if (!capOk) throw new Error(i18n.errKey('common.errLanNoCopy'));

      // 2) 取完整文档
      const r = await reqJson('/api/post/' + remoteId);
      const rp = r.data;
      if (!rp || !rp.title) throw new Error(i18n.errKey('common.errLanBadPost'));

      // 3) 在本机主库解析目标大区/分类
      //    ★ 归属优先由调用方（前端弹窗）指定；未指定才回退「跟随源文档」。★
      //    走 core 的低阶 helper：db 外观未导出 get/insert，而 archpack 导入器也是同一套路
      const core = require('../db/core');
      /**
       * 按名复用大区，不存在则新建（幂等；同名不重复建）。
       * ★ Beta.215：代码不再写死 'LAN' ★
       *   优先用用户填的 code，其次按名称推导，最后过一遍全库查重。
       *   原因：以前所有拷贝大区代码都是 LAN，聚合页「代码」列全一样，无法区分；
       *   且新加的代码查重会让「第二个拷贝大区」直接创建失败，必须走 uniqueCode。
       */
      const ensureRegion = (name, code) => {
        const n = String(name || '').trim() || '共享拷贝';
        const hit = core.get('SELECT id FROM regions WHERE name=?', [n]);
        if (hit) return hit.id;
        const finalCode = uniqueCode(
          (sql, a) => core.get(sql, a),
          'regions',
          String(code || '').trim() || deriveCode(n)
        );
        return core.insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
          n,
          finalCode,
          '#8a63d2',
          99,
          core.nowIso(),
          core.nowIso()
        ]);
      };
      /** 按名复用分类，不存在则新建（幂等）；代码同理不再写死 'LAN' */
      const ensureCategory = (regionId, name, code) => {
        const n = String(name || '').trim();
        if (!n) return null;
        const hit = core.get('SELECT id FROM categories WHERE region_id=? AND name=?', [regionId, n]);
        if (hit) return hit.id;
        const finalCode = uniqueCode(
          (sql, a) => core.get(sql, a),
          'categories',
          String(code || '').trim() || deriveCode(n)
        );
        return core.insert(
          'INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)',
          [regionId, n, finalCode, 99, core.nowIso(), core.nowIso()]
        );
      };
      /** 已存在的大区/分类：按 id 直查并校验归属，防跨区挂错分类 */
      const existingRegion = id => {
        const n = parseInt(id, 10);
        if (!Number.isFinite(n)) return null;
        return core.get('SELECT id FROM regions WHERE id=?', [n]);
      };
      const existingCategory = (regionId, id) => {
        const n = parseInt(id, 10);
        if (!Number.isFinite(n)) return null;
        return core.get('SELECT id FROM categories WHERE id=? AND region_id=?', [n, regionId]);
      };

      // target 由前端传入：{ mode:'follow'|'existing'|'new', regionId, categoryId,
      //                       regionName, categoryName, regionCode, categoryCode }
      // regionCode/categoryCode 是 Beta.215 新增：以前这里没有代码输入，
      // 落地代码被写死成 'LAN'，聚合页里所有拷贝大区/分类的代码完全一样。
      const target = p && p.target && typeof p.target === 'object' ? p.target : {};
      const mode = ['existing', 'new'].includes(target.mode) ? target.mode : 'follow'; // 缺省跟随源文档
      let regionId = null;
      let categoryId = null;
      if (mode === 'existing') {
        // 选已有大区：id 必须真实存在，否则回退跟随（不静默新建，避免用户以为选了 A 却落到 B）
        const rr = existingRegion(target.regionId);
        if (rr) {
          regionId = rr.id;
          const cc = existingCategory(regionId, target.categoryId);
          categoryId = cc ? cc.id : null;
        }
      } else if (mode === 'new') {
        // 新建（或复用同名）大区：这是「默认创建拷贝大区」的落地路径
        regionId = ensureRegion(target.regionName || '共享拷贝', target.regionCode);
        categoryId = ensureCategory(regionId, target.categoryName, target.categoryCode);
      }
      if (!regionId) {
        // 回退 / 跟随：沿用源文档的大区与分类名（源文档不带代码，故按名推导）
        regionId = ensureRegion(rp.rname || '共享拷贝', rp.rcode);
        categoryId = ensureCategory(regionId, rp.cname, rp.ccode);
      }

      // 4) 落本机主库：归属记本机当前用户（D2），原作者另存 origin_author 快照
      const fields = {};
      for (const f of rp.fields || []) {
        if (f && f.code) fields[f.code] = String(f.value == null ? '' : f.value).slice(0, 5000);
      }
      const tags = (rp.tags || [])
        .map(t => (t && t.name) || '')
        .filter(Boolean)
        .slice(0, 20);
      const draft = {
        title: String(rp.title).trim().slice(0, 200),
        regionId,
        categoryId,
        fields,
        tags,
        contentHtml: String(rp.content_html || '').slice(0, 200000),
        status: 'published'
      };
      const from = `${srcName}@${host}:${port}`;
      const originAuthor =
        String(rp.author_name || '')
          .trim()
          .slice(0, 100) || null;
      const userId = db.getSetting('session.user_id');
      const saved = db.savePost(draft, userId, {
        skipOwnerCheck: true,
        copied: { at: db.nowIso(), from, originAuthor }
      });
      // 归属落点回读真实名称，供前端 toast / 审计用（用户选了哪个大区必须能复核）
      const toRegion = core.get('SELECT name FROM regions WHERE id=?', [regionId]);
      const toCategory = categoryId ? core.get('SELECT name FROM categories WHERE id=?', [categoryId]) : null;
      safeAudit(userId, '拷贝局域网共享文档', 'post', saved.id, {
        title: draft.title,
        from,
        originAuthor: originAuthor || '',
        toRegion: toRegion ? toRegion.name : '',
        toCategory: toCategory ? toCategory.name : '',
        targetMode: mode
      });
      getLog().info(
        `[LAN拷贝] 已从 ${from} 拷贝文档「${draft.title}」到本机` +
          `${toRegion ? ` → ${toRegion.name}${toCategory ? ' / ' + toCategory.name : ''}` : ''}`
      );

      // 5) 回连上报「被拷贝」——尽力而为，失败绝不回滚（见本通道注释）
      //    上报里带上本机主机名与 MAC：源主机的 ARP 表只能覆盖同网段，
      //    跨网段时「自报」是对端唯一能拿到 MAC 的途径（源侧会标注为「自报」）。
      let reported = false;
      try {
        const u = withToken(new URL(base + '/api/copy-report'));
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
          const res = await fetch(u.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // 与请求体 host/mac 同一语义，双写便于源主机在不解包 body 时也能取到（例如日志）。
              // 主机名须 encodeURIComponent：HTTP 头只允许 Latin-1，中文会抛 ByteString 错（实测）。
              'X-Archbox-Host': encodeURIComponent(getLanName()),
              'X-Archbox-Mac': keystore.getMac()
            },
            signal: ctrl.signal,
            body: JSON.stringify({
              host: getLanName(),
              mac: keystore.getMac(),
              operator: getLanName(),
              postId: remoteId,
              postTitle: draft.title,
              no: String(rp.no || '').slice(0, 100),
              regionId: rp.region_id,
              regionName: rp.rname || ''
            })
          });
          reported = res.ok;
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        getLog().warn(`[LAN拷贝] 上报源主机失败（不影响本机拷贝结果）：${e.message}`);
      }
      return {
        id: saved.id,
        title: draft.title,
        regionId,
        originAuthor,
        from,
        reported,
        // 归属回执：前端据此提示「已拷到 X / Y」，用户能确认选项是否生效
        regionName: toRegion ? toRegion.name : '',
        categoryName: toCategory ? toCategory.name : '',
        targetMode: mode
      };
    },
    { noLockGuard: false }
  );

  /**
   * 我的共享概览：供首页"局域共享"卡片使用。
   * 访客数按 IP 去重（计名不计次）且排除本机自浏览；浏览量按文档查看计次。
   * 口径统一收口在 lanShare.lanVisitorStats()，此处不再自行聚合。
   *
   * ★ Beta.168：关闭态一律归零。
   * 关闭共享只做 stopShare() + lan.enabled='0'，【不】清 lan.sharedRegions、
   * 【不】unload 副本库、【不】清 visitorLog。于是原先直接读这三处，会把关闭前的
   * 旧数据当成现状返回：卡片上「共享状态」显示「未开启」，旁边的「共享大区 4」
   * 「共享文档 N」「近 7 日访客」却还是老数字，自相矛盾。
   *   · share.isReady() 是 !!sdb 单例判断，sdb 只有 initShare() 会赋值、从不置 null，
   *     所以「开过再关」的会话里它恒为 true，countPosts() 数的是没被清空的副本库。
   *   · lanVisitorStats() 只读内存 visitorLog，完全不看 enabled 与启动状态。
   */
  handle(
    'lan:myStats',
    () => {
      const enabled = db.getSetting('lan.enabled') === '1';
      if (!enabled) {
        return {
          enabled: false,
          sharedRegionCount: 0,
          postCount: 0,
          visitor7: 0,
          visitorToday: 0,
          postView7: 0,
          postViewToday: 0
        };
      }
      const sharedRegionCount = getSharedRegions().length;
      const postCount = share.isReady() ? share.countPosts() : 0;
      const st = lanShare.lanVisitorStats(7);
      return {
        enabled,
        sharedRegionCount,
        postCount,
        visitor7: st.visitor7,
        visitorToday: st.visitorToday,
        postView7: st.postView7,
        postViewToday: st.postViewToday
      };
    },
    { noLockGuard: true }
  );

  /**
   * 只读浏览代理：渲染进程经主进程发起 HTTP 请求，规避渲染进程 CSP 对局域网 IP 的 connect-src 限制。
   * 主进程只转发、只读取；URL 受 http(s) 协议白名单约束。返回服务端 JSON 的 data 字段（已解包）。
   */
  handle(
    'lan:request',
    async p => {
      const url = S(p.url);
      const token = p.token || '';
      if (!url) throw new Error(i18n.errKey('common.errLanNoUrl'));
      let u;
      try {
        u = new URL(url);
      } catch (e) {
        throw new Error(i18n.errKey('common.errLanBadUrl'));
      }
      if (!/^https?:$/.test(u.protocol)) throw new Error(i18n.errKey('common.errLanScheme'));
      if (token) u.searchParams.set('token', token);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        // 同样带自报身份：浏览共享内容也会被源主机记入访客日志，
        // 跨网段时源侧只能靠这个头拿到我们的主机名/MAC（同 lan:copyPost）。
        // 主机名须 encodeURIComponent：HTTP 头只允许 Latin-1，中文会抛 ByteString 错（实测）。
        const res = await fetch(u.toString(), {
          headers: { 'X-Archbox-Host': encodeURIComponent(getLanName()), 'X-Archbox-Mac': keystore.getMac() },
          signal: ctrl.signal
        });
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          if (!res.ok) throw new Error(i18n.errKey('common.errLanHttpFail', { status: res.status }));
          return { raw: text };
        }
        // 401 需给前端可识别的信号（前端据此弹「请输入访问令牌」而非「无法连接」）。
        // 文案常量与 lan-share.js 的 ERR_BAD_TOKEN 保持一致，改动须同步。
        if (res.status === 401 || (json && json.error === lanShare.ERR_BAD_TOKEN)) {
          // 兜底必须在 json 整体为空时也生效：message 为空会让日志出现
          // 「[ERROR] 后直接跟 at ...」的无文案堆栈，看上去像崩溃且无从定位（Beta.159 修复）。
          const msg = (json && json.error) || lanShare.ERR_BAD_TOKEN;
          const err = new Error(msg);
          err.code = 'LAN_NEED_AUTH';
          throw err;
        }
        if (!res.ok || !json.ok)
          throw new Error(json.error || i18n.errKey('common.errLanHttpFail', { status: res.status }));
        // ★ 信封校验：正常的 /api/* 路由都是 `{ ok:true, data }`。
        //   若服务端把结果平铺在顶层（历史上 /api/version 就是这样），这里会返回 undefined，
        //   而调用方 `v.allowCopy` / `r.list` 只是安静地拿到 undefined ——
        //   表现为「功能开关明明打开了却判定为关闭」，极难定位（Beta.213 踩过）。
        //   故此处显式报错，把「协议不一致」暴露在第一现场而不是让它退化成业务误判。
        if (json.data === undefined) {
          throw new Error(i18n.errKey('common.errLanBadEnvelope'));
        }
        return json.data;
      } finally {
        clearTimeout(timer);
      }
    },
    { noLockGuard: true }
  );
}

/** 若已开启共享，则初始化副本库并启动只读服务（解锁后 / 开机后调用） */
async function startIfEnabled() {
  if (state.locked) return;
  if (db.getSetting('lan.enabled') !== '1') return;
  try {
    await share.initShare(keystore.readDataDir());
    const port = Number(db.getSetting('lan.port') || DEFAULT_PORT);
    let tk = db.getSetting('lan.token');
    if (!tk) {
      tk = lanShare.genToken();
      db.setSetting('lan.token', tk);
    }
    const ids = getSharedRegions();
    if (ids.length) share.rebuild(ids);
    restartShare();
    getLog().info(
      `局域网共享服务已启动（端口 ${port} · 共享大区 ${ids.length} 个 · 主机名 ${getLanName()} · 认证 ${isAuthEnabled() ? '开' : '关'} · 允许拷贝 ${isAllowCopy() ? '开' : '关'}）`
    );
  } catch (e) {
    getLog().error('局域网共享启动失败: ' + e.message, e);
  }
}

/** 自动同步：仅当任一共享大区有更新时整体重建（每 30s 由主进程调度） */
function autoSyncIfNeeded() {
  if (state.locked) return;
  if (db.getSetting('lan.enabled') !== '1') return;
  if (!share.isReady()) return;
  const ids = getSharedRegions();
  if (!ids.length) return;
  try {
    if (share.needsSync(ids)) {
      share.rebuild(ids);
      getLog().info('局域网共享自动同步完成');
    }
  } catch (e) {
    getLog().error('局域网共享自动同步失败: ' + e.message, e);
  }
}

/** 退出前：持久化副本库并停止服务 */
function stopLan() {
  try {
    share.persistShare();
  } catch (e) {
    getLog().error('共享副本持久化失败: ' + e.message, e);
  }
  try {
    lanShare.stopShare();
  } catch (e) {}
}

module.exports = { registerLanShare, startIfEnabled, autoSyncIfNeeded, stopLan };
