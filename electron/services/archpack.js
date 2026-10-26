'use strict';
/**
 * 文档包（.archboxpack）：本程序专用的导入导出格式（自描述，v3）
 *
 * v3 设计（本次重构）：
 *   - 图片一律 base64 内联进正文 contentHtml（不再分储文件）
 *   - ZIP 包裹（STORE 模式，可被标准解压工具直接打开），内含：
 *       manifest.json   结构化数据（正文已全内联 base64 图）
 *       checksums.json  每个文件的 sha256 + crc32（L1 哈希）；
 *                       导出时若提供口令，则整体用口令加密成 PACKENC1 容器（L2 防伪造）
 *   - 导入时逐 entry 校验 ZIP 自带 CRC32（损坏检测），再校验 checksums（L1 哈希）；
 *     若 checksums 为加密容器，则要求口令解密（L2），任一失败拒绝导入
 *   - 仅支持 v3 ZIP 格式，不兼容任何旧版文档包
 */
const fsp = require('fs').promises;
const core = require('../db/core');
const { localTime, tzLabel } = require('./timefmt');
const zipBackup = require('./zip-backup');
const zipRead = require('./zip-read');
const i18n = require('../i18n');
const releaseSign = require('./release-sign');
const packProtect = require('./pack-protect');
const { APP_NAME } = require('./appinfo');

const MAGIC = 'ARCHBOX-PACK';
const VERSION = 3;
const { audit, persistNow, nowIso, rnd6, all, get, insert } = core;

/**
 * 单篇文档 → 文档包条目。
 * ★ 作者元信息必须随包走 ★ 接收方没有源主机的 users 表，不在此快照作者，
 *   导入/拷贝后的文档「作者」一栏将永久为空（本机 author_id 只能记导入者）。
 */
function postToPack(fullPost) {
  return {
    title: fullPost.title,
    region: fullPost.rname || '',
    category: fullPost.cname || '',
    tags: fullPost.tags || [],
    fields: fullPost.fields || {},
    contentHtml: fullPost.content_html || '',
    status: fullPost.status === 'draft' ? 'draft' : 'published',
    // 作者元信息：authorId 为源主机用户 id（仅溯源参考，导入方不得据此建账号）；
    // authorName 是导出那一刻的显示名快照，导入方写入 posts.origin_author
    author: fullPost.author_id || null,
    authorName: fullPost.author_name || null,
    createdAt: fullPost.created_at,
    updatedAt: fullPost.updated_at
  };
}

/**
 * 计算文档包来源标识（供导入方甄别 / 溯源）：
 *   形如 `AK-XXXXXXXXXXXX@2025-09-30 12:00:00`（导出者指纹@导出本地时间）
 * 写入 posts.imported_from，使「来自文档包」的文档可被识别且可追溯来源包。
 * 时间走 timefmt.localTime（本地时间，无 UTC 偏移 8 小时歧义）。
 */
function packOriginTag(manifest) {
  const pack = (manifest && manifest.pack) || {};
  const fp = pack.exporter || 'UNKNOWN';
  const ts = (manifest && manifest.exportedAt && manifest.exportedAt.ts) || Date.now();
  const iso = localTime(new Date(ts));
  return `${fp}@${iso}`;
}

/**
 * 导出为 ZIP 防篡改文档包（v3）：
 *   manifest.json（正文已全内联 base64 图）
 *   + checksums.json（manifest 的 sha256+crc32；提供 pass 时用口令加密为 PACKENC1 容器）
 * ZIP 采用 STORE 模式，且每个 entry 自带 CRC32，导入时校验。
 * @param {object} db 数据库实例
 * @param {object} [filter]
 * @param {string} [pass] 可选口令；提供则 checksums.json 用口令加密（L2 防伪造）
 * @returns {Buffer} ZIP 文件内容
 */
async function buildZipPack(db, filter = {}, pass) {
  const rows = db.postsWithFields(filter || {});
  const posts = rows.map(r => {
    const full = db.getPost(r.id) || { ...r, tags: [], fields: r.fields || {} };
    return postToPack(full);
  });
  // 作者快照表：id → 显示名。供导入方还原「原作者」展示（源主机 users 表不外传）
  const authors = {};
  for (const p of posts) {
    if (p.author && p.authorName) authors[p.author] = p.authorName;
  }
  const exportedTs = Date.now();
  const manifest = {
    magic: MAGIC,
    version: VERSION,
    // 应用名走单一数据源（services/appinfo），避免更名时此处漏改
    app: { name: APP_NAME },
    format: 'zip-inline',
    // 来源标识块：供导入方「甄别」文档包出处（指纹由来由公钥派生，非防伪证明）
    pack: {
      exporter: releaseSign.exporterFingerprint(),
      signatureAlgorithm: 'ed25519',
      scope: 'archboxpack',
      origin: null // 占位，下面回填完整标识
    },
    exportedAt: { ts: exportedTs, local: localTime(), tz: tzLabel() },
    data: {
      regions: db.listRegions(),
      categories: db.listCategories(),
      tags: db.listTags(),
      fieldDefs: db.listFieldDefs(),
      authors,
      posts,
      notes: db.listNotes()
    }
  };
  manifest.pack.origin = packOriginTag(manifest);
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  // L1 哈希摘要：sha256+crc32（不签名；口令保护由下面 checksums 加密承担 L2）
  const checksums = {
    algorithm: 'sha256+crc32',
    scope: 'archboxpack',
    protection: pass ? 'password' : 'hash',
    protectedAt: { ts: Date.now() },
    files: {
      'manifest.json': { sha256: releaseSign.sha256(manifestBuf), crc32: releaseSign.crc32(manifestBuf) }
    }
  };
  const checksumsPlain = JSON.stringify(checksums, null, 2);
  const checksumsBuf = pass ? packProtect.encryptChecksums(checksumsPlain, pass) : Buffer.from(checksumsPlain, 'utf8');
  const files = [
    { absPath: null, relPath: 'manifest.json', buffer: manifestBuf },
    { absPath: null, relPath: 'checksums.json', buffer: checksumsBuf }
  ];
  return zipBackup.buildZip(files);
}

/** 解析 STORE 模式 ZIP，返回 { relPath: Buffer } 并对每个 entry 校验 CRC32（method===0） */
function extractZipStore(buf) {
  return zipRead.extractStoreChecked(buf, i18n.t('sys.packZipLabel'));
}

/**
 * 从 ZIP 文档包 Buffer 解析出 manifest、checksums，并完成 L1 校验（+可选 L2 口令解密）。
 * @param {Buffer} buf ZIP 文档包内容
 * @param {string} [pass] 可选口令；checksums 为加密容器时必填，否则抛错
 * @returns {{ manifest:object, checksums:object }}
 */
function parseZipPackBuffer(buf, pass) {
  const files = extractZipStore(buf);
  const manifestRaw = files['manifest.json'];
  if (!manifestRaw) throw new Error(i18n.errKey('common.errPackNoManifest'));
  const checksumsRaw = files['checksums.json'];
  if (!checksumsRaw) throw new Error(i18n.errKey('common.errPackNoChecksums'));
  const manifest = JSON.parse(manifestRaw.toString('utf8'));

  // checksums 为口令加密容器时，必须提供口令解密（L2 防伪造）
  let checksums;
  if (packProtect.isEncrypted(checksumsRaw)) {
    checksums = JSON.parse(packProtect.decryptChecksums(checksumsRaw, pass));
  } else {
    checksums = JSON.parse(checksumsRaw.toString('utf8'));
  }

  // L1：比对 manifest 的 sha256 + crc32
  const entry = checksums.files && checksums.files['manifest.json'];
  if (!entry) throw new Error(i18n.errKey('common.errPackChecksumNoManifest'));
  const mSha = releaseSign.sha256(manifestRaw);
  const mCrc = releaseSign.crc32(manifestRaw);
  if (mSha !== entry.sha256) throw new Error(i18n.errKey('common.errPackHashMismatch'));
  if (mCrc !== entry.crc32) throw new Error(i18n.errKey('common.errPackCrcMismatch'));

  return { manifest, checksums };
}

/**
 * 打开文档包文件，仅接受 v3 ZIP（PK 头）格式，完成 L1+CRC32 校验（+可选 L2 口令解密）。
 * 任何非 v3 ZIP 的格式一律拒绝（不兼容旧版文档包）。
 * @param {string} filePath
 * @param {string} [pass] 可选口令；包内 checksums 为加密容器时必填
 * @returns {{ data: object, assetBuf: null, origin: object, encrypted: boolean }}
 */
async function openPackFile(filePath, pass) {
  const buf = await fsp.readFile(filePath);
  // ZIP 特征头：50 4B 03 04（PK\x03\x04）
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    throw new Error(i18n.errKey('common.errPackFormat'));
  }
  const encrypted = packEncrypted(buf);
  const { manifest } = parseZipPackBuffer(buf, pass);
  if (!manifest || manifest.magic !== MAGIC) throw new Error(i18n.errKey('common.errPackMagic'));
  if (manifest.version !== VERSION)
    throw new Error(i18n.errKey('common.errPackVersion', { want: VERSION, got: manifest.version || '?' }));
  if (!manifest.data || !Array.isArray(manifest.data.posts)) throw new Error(i18n.errKey('common.errPackDataInvalid'));
  return { data: manifest, assetBuf: null, origin: originOf(manifest, encrypted), encrypted };
}

/** 探测文档包内 checksums.json 是否为口令加密容器（无需口令即可判断） */
function packEncrypted(buf) {
  const files = extractZipStore(buf);
  const checksumsRaw = files['checksums.json'];
  return !!checksumsRaw && packProtect.isEncrypted(checksumsRaw);
}

/** 摘要：返回大区/分类/标签/字段/文档/便签的数量 */
function summaryOf(data) {
  const d = (data && data.data) || {};
  return {
    regions: (d.regions || []).length,
    categories: (d.categories || []).length,
    tags: (d.tags || []).length,
    fieldDefs: (d.fieldDefs || []).length,
    posts: (d.posts || []).length,
    notes: (d.notes || []).length
  };
}

/**
 * 文档包来源信息（供前端「甄别」展示）：
 *   { exporter, origin, exportedAt, protected, app }
 * 其中 protected 表示包内 checksums.json 已由口令加密（L2 防伪造）；否则为纯哈希（L1）。
 * exporter 指纹仍作「来源甄别」（出自同一发布方），不构成防伪证明。
 * @param {object} manifest
 * @param {boolean} [encrypted] 包内 checksums 是否口令加密（由 openPackFile 探测传入）
 */
function originOf(manifest, encrypted = false) {
  const pack = (manifest && manifest.pack) || {};
  const ea = (manifest && manifest.exportedAt) || {};
  return {
    exporter: pack.exporter || '',
    origin: pack.exporter ? packOriginTag(manifest) : '',
    exportedAt: ea.local || (ea.ts ? localTime(new Date(ea.ts)) : ''),
    tz: ea.tz || '',
    app: (manifest && manifest.app && manifest.app.name) || '',
    protected: !!encrypted
  };
}

/**
 * 导入：按文档包内容写入数据库（自描述：自动补齐字段定义）
 * v3：图片已内联进 contentHtml，无需处理独立资产文件。
 * @param {object} arg
 * @param {object} arg.data        文档包 manifest（含 data.posts 等）
 * @param {null}   [arg.assetBuf]  保留参数（v3 已无意义，固定传 null）
 * @param {string} [arg.strategy]  skip | merge | new | nodedup（不查重，全部新增）
 * @param {string} [arg.userId]
 */
/**
 * 导入预览（只读查重，不写库）：统计当前库中与文档包内文档重复的数量，
 * 供前端在真正写入前弹「询问式」确认框使用。
 * @returns {{ dupCount:number, postTotal:number }}
 */
async function previewPackImport({ data, strategy }) {
  const d = (data && data.data) || {};
  const posts = d.posts || [];
  const db = require('../db');
  const validFieldCodes = new Set(all('SELECT code FROM field_defs').map(r => r.code));
  let dupCount = 0;
  for (const p of posts) {
    const title = String(p.title || '')
      .trim()
      .slice(0, 200);
    if (!title || strategy === 'nodedup') continue; // 不查重策略无重复概念
    // 与导入时一致：按名复用已有大区/分类 id；包内大区在库中不存在时导入会新建，不会命中重复
    const regionRow = get('SELECT id FROM regions WHERE name=?', [String(p.region || '').trim()]);
    if (!regionRow) continue;
    const regionId = regionRow.id;
    let categoryId = null;
    if (p.category) {
      const cRow = get('SELECT id FROM categories WHERE region_id=? AND name=?', [regionId, String(p.category).trim()]);
      if (cRow) categoryId = cRow.id;
    }
    const fieldsMap = {};
    for (const [code, value] of Object.entries(p.fields || {})) {
      if (!validFieldCodes.has(code)) continue;
      fieldsMap[code] = String(value == null ? '' : value).slice(0, 5000);
    }
    const dup = db.checkDuplicates({ id: 0, fields: fieldsMap, title, regionId, categoryId });
    if (dup.length > 0) dupCount++;
  }
  return { dupCount, postTotal: posts.length };
}

async function applyPackImport({ data, strategy, userId }, onProgress) {
  const d = (data && data.data) || {};
  const posts = d.posts || [];
  const fields = d.fieldDefs || [];
  if (posts.length > 100000) throw new Error(i18n.errKey('common.errPackTooMany', { n: posts.length }));

  const summary = { total: posts.length, created: 0, merged: 0, skipped: 0, errors: [], details: [], assets: 0 };
  const db = require('../db');

  // 来源标记：本次导入的统一标识（导出者指纹@导出时间），写入每条受影响文档的 imported_at/imported_from
  const importedAt = nowIso();
  const importedFrom = packOriginTag(data);
  const imported = { at: importedAt, from: importedFrom };
  summary.importedFrom = importedFrom;
  // 作者快照表：manifest.data.authors = { 源用户id: 显示名 }，供还原原作者
  const authorMap = d && d.authors && typeof d.authors === 'object' ? d.authors : {};

  // 1) 补齐缺失的字段定义
  const VALID_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'url'];
  for (const f of fields) {
    if (!f || !f.code) continue;
    const code = String(f.code).trim();
    if (get('SELECT id FROM field_defs WHERE code=?', [code])) continue;
    try {
      const name =
        String(f.name || code)
          .trim()
          .slice(0, 30) || code;
      const type = VALID_TYPES.includes(f.type) ? f.type : 'text';
      const required = f.required ? 1 : 0;
      const unique_field = f.unique_field ? 1 : 0;
      const options = (Array.isArray(f.options) ? f.options : []).join('|');
      insert(
        'INSERT INTO field_defs(name,code,type,options,required,unique_field,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [name, code, type, options, required, unique_field, 0, nowIso(), nowIso()]
      );
    } catch (e) {
      summary.errors.push(i18n.t('sys.impFieldFail', { code, msg: e.message }));
    }
  }

  // 文档包记录的大区标识色（按名匹配）；导出时 listRegions 已含 color
  const regionColorByName = new Map();
  for (const r of d.regions || []) {
    if (r && r.name) regionColorByName.set(String(r.name).trim(), r.color);
  }
  // 导入时 code 必须唯一（core 已建 uq_regions_code/uq_categories_code 唯一索引）。
  // 文档包不携带 code，统一用 IMP 前缀 + 序号兜底，避免「多同名/多名大区」撞唯一约束。
  const nextImpCode = table => {
    let n = 1;
    while (get(`SELECT id FROM ${table} WHERE code=?`, [`IMP-${n}`])) n++;
    return `IMP-${n}`;
  };
  const ensureRegion = name => {
    const n = String(name || '').trim() || i18n.t('sys.importRegionName');
    let r = get('SELECT id FROM regions WHERE name=?', [n]);
    if (!r) {
      const color = /^#[0-9a-fA-F]{6}$/.test(regionColorByName.get(n) || '') ? regionColorByName.get(n) : '#8a63d2';
      r = {
        id: insert('INSERT INTO regions(name,code,color,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
          n,
          nextImpCode('regions'),
          color,
          99,
          nowIso(),
          nowIso()
        ])
      };
    }
    return r.id;
  };
  const ensureCategory = (regionId, name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    let c = get('SELECT id FROM categories WHERE region_id=? AND name=?', [regionId, n]);
    if (!c)
      c = {
        id: insert('INSERT INTO categories(region_id,name,code,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)', [
          regionId,
          n,
          nextImpCode('categories'),
          99,
          nowIso(),
          nowIso()
        ])
      };
    return c.id;
  };
  const validFieldCodes = new Set(all('SELECT code FROM field_defs').map(r => r.code));

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    let detail = null;
    let displayTitle =
      String((p && p.title) || '')
        .trim()
        .slice(0, 80) || i18n.t('sys.emptyTitle');
    try {
      const title = String(p.title || '')
        .trim()
        .slice(0, 200);
      if (!title) {
        summary.skipped++;
        summary.errors.push(i18n.t('sys.impSkipEmptyTitle', { n: i + 1 }));
        detail = { action: 'skipped', reason: i18n.t('sys.impReasonEmptyTitle') };
      } else {
        const regionId = ensureRegion(p.region);
        const categoryId = ensureCategory(regionId, p.category);
        const fieldsMap = {};
        for (const [code, value] of Object.entries(p.fields || {})) {
          if (!validFieldCodes.has(code)) continue;
          fieldsMap[code] = String(value == null ? '' : value).slice(0, 5000);
        }
        const tags = Array.isArray(p.tags)
          ? p.tags
              .map(t => String(t).trim())
              .filter(Boolean)
              .slice(0, 20)
          : [];
        const draft = {
          title,
          regionId,
          categoryId,
          fields: fieldsMap,
          tags,
          contentHtml: String(p.contentHtml || '').slice(0, 200000),
          status: p.status === 'draft' ? 'draft' : 'published'
        };
        // 查重（nodedup 策略除外）：除唯一字段外，额外按「标题+大区+分类」组合判定重复
        let dupInfo = null;
        if (strategy !== 'nodedup') {
          const dup = db.checkDuplicates({ id: 0, fields: fieldsMap, title, regionId, categoryId });
          if (dup.length > 0) dupInfo = dup[0];
        }
        // 原作者名：优先用条目自带 authorName，回退到 manifest.authors 快照表（兼容两种写法）
        const originAuthor = String(p.authorName || authorMap[p.author] || '')
          .trim()
          .slice(0, 100);
        const importedOne = originAuthor ? { ...imported, originAuthor } : imported;
        if (dupInfo) {
          if (strategy === 'skip') {
            summary.skipped++;
            summary.errors.push(i18n.t('sys.impSkipDup', { n: i + 1, title }));
            detail = {
              action: 'skipped',
              reason: i18n.t('sys.impReasonDup', { title: dupInfo.postTitle || i18n.t('sys.impExistingDoc') })
            };
          } else if (strategy === 'merge') {
            // 导入属跨归属写入（可能合并进他人文档），显式跳过归属校验；本操作由 pack:importApply 独立审计
            db.mergePost({ targetId: dupInfo.postId, draft }, userId, { skipOwnerCheck: true, imported: importedOne });
            summary.merged++;
            detail = {
              action: 'merged',
              reason: i18n.t('sys.impReasonMerged', { title: dupInfo.postTitle || i18n.t('sys.impExistingDoc') })
            };
          } else {
            draft.title = title + i18n.t('sys.impDupSuffix', { code: rnd6().toUpperCase() });
            displayTitle = draft.title;
            detail = { action: 'created-suffix', reason: i18n.t('sys.impReasonSuffix') };
          }
        }
        if (!detail) {
          // 非重复 或 nodedup 策略：直接 savePost（nodedup 也走这里）；导入新建不涉及归属校验
          db.savePost(draft, userId, { skipOwnerCheck: true, imported: importedOne });
          summary.created++;
          detail = {
            action: strategy === 'nodedup' ? 'created-nocheck' : 'created',
            reason: strategy === 'nodedup' ? i18n.t('sys.impReasonNoCheck') : i18n.t('sys.impReasonCreated')
          };
        } else if (detail.action === 'created-suffix') {
          // new 策略：构造出带后缀的 draft 后立即 savePost
          db.savePost(draft, userId, { skipOwnerCheck: true, imported: importedOne });
          summary.created++;
        }
      }
    } catch (e) {
      summary.errors.push(i18n.t('sys.impItemFail', { n: i + 1, msg: e.message }));
      if (!detail) detail = { action: 'error', reason: e.message };
    }
    // 每条处理明细（用于前端展示策略对每条文档的实际作用）
    if (detail) {
      summary.details.push({ index: i + 1, title: displayTitle, ...detail });
    }
    if (onProgress && i % 20 === 0) {
      onProgress({
        pct: Math.round(((i + 1) / posts.length) * 100),
        msg: i18n.t('sys.impProgress', { n: i + 1, total: posts.length })
      });
      await new Promise(res => setImmediate(res));
    }
  }
  // 2) 便签（办公琐事）：默认按内容+颜色去重，避免重复导入；「不查重」策略下全部新增
  const dedupNotes = strategy !== 'nodedup';
  const existingNotes = new Map(
    dedupNotes ? all('SELECT content, color FROM notes').map(r => [r.content + '\u0001' + (r.color || ''), true]) : []
  );
  for (const n of d.notes || []) {
    if (!n || !n.content) continue;
    if (dedupNotes && existingNotes.has(String(n.content) + '\u0001' + (n.color || ''))) continue;
    insert('INSERT INTO notes(content,color,sort,created_at,updated_at) VALUES(?,?,?,?,?)', [
      String(n.content).slice(0, 2000),
      n.color || '#ffe58f',
      parseInt(n.sort || 0, 10) || 0,
      nowIso(),
      nowIso()
    ]);
    summary.notes = (summary.notes || 0) + 1;
  }

  audit(userId, '文档包导入', 'archboxpack', '', { ...summary });
  persistNow();
  return summary;
}

module.exports = {
  MAGIC,
  VERSION,
  buildZipPack,
  openPackFile,
  parseZipPackBuffer,
  packEncrypted,
  summaryOf,
  originOf,
  packOriginTag,
  previewPackImport,
  applyPackImport
};
