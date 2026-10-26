'use strict';
/**
 * 存储管理通道：迁移数据存储目录、打开目录、全量备份（数据库 + 完整性签名）。
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { shell } = require('electron');
const db = require('../db');
const keystore = require('../keystore');
const zipBackup = require('../services/zip-backup');
const datadir = require('../services/datadir');
const { pickDirectory, pickFile, saveFile } = require('../services/dialog');
const { APP_DIR_NAME, DATA_SUBDIR } = require('../services/appinfo');
const { compactStampMinute, compactStamp } = require('../services/timefmt');
const { formatBytes } = require('../services/fs-utils');
const state = require('../state');
const i18n = require('../i18n');
const { handle, currentUser, safeAudit, getLog, S } = require('./shared');

function registerStorage() {
  handle('storage:choose', async () => {
    const selectedDir = await pickDirectory({ title: i18n.t('menu.storagePickDir'), create: true });
    if (!selectedDir) return null;
    // ★ 固定落在用户所选目录下的「文档盒 Archbox」子文件夹，避免把 archive.db 直接丢在盘符根目录；
    //   也避免原数据目录恰好是根目录时，整目录递归复制变成「拷贝整个硬盘」而卡死。
    // ★ 文件夹名必须与 app.setName('文档盒 Archbox') / productName 完全一致 ★
    //   此前这里硬编码为 'Archbox'（本应用更名前的旧名），导致「程序根目录叫『文档盒 Archbox』、
    //   用户迁移后的数据目录却叫『Archbox』」的名实不符——用户选 D:\ 迁移后看到的是 D:\Archbox。
    //   命名真相只有一个来源：services/appinfo.js 的 APP_DIR_NAME，不得在此另写字面量。
    // ★ 末尾再拼 DATA_SUBDIR（data）★
    //   默认数据目录是 <userData>/data（keystore.readDataDir 兜底），archive.db 在 data 这一层里。
    //   但迁移曾把 <所选目录>/文档盒 Archbox 直接当作数据目录，于是 archive.db 少了 data 这一层：
    //   迁移前 D:\…\文档盒 Archbox\data\archive.db  →  迁移后 D:\文档盒 Archbox\archive.db。
    //   同一个应用两种结构，用户实测反馈「正确路径应是 文档盒 Archbox/data/」。
    //   现统一为 <所选目录>/文档盒 Archbox/data，两种来源结构完全一致。
    const dir = path.join(selectedDir, APP_DIR_NAME, DATA_SUBDIR);
    const from = keystore.readDataDir();
    if (path.resolve(dir) === path.resolve(from)) throw new Error(i18n.errKey('common.errSameDir'));
    // 探测目标目录可写性（统一探针：datadir.assertWritable）
    datadir.assertWritable(dir, '目标数据目录');
    // 先把内存中的库落盘，保证拷贝的是最新状态
    db.persistNow();
    // 迁移策略（子目录上移优先，整目录优先，根目录兜底白名单）：
    // A. 目标在源目录**内部** → 原地移入。
    //    典型场景：旧结构 `D:\文档盒 Archbox`（archive.db 直接在这层）迁到同盘，
    //    新目标 = `D:\文档盒 Archbox\data`，恰好是源的子目录。
    //    `fsp.cp(from, dir, {recursive:true})` 在 Windows 会直接抛
    //    `EINVAL (cannot copy \\?\D:\文档盒 Archbox to a subdirectory of self …)`
    //    —— 把一个目录递归复制进它自己的子目录在语义上就不成立（会无限递归）。
    //    但用户意图完全正当（"把数据收进 data 子文件夹"），故不能报错了事：
    //    改为把源目录里的数据文件**逐个移入**子目录（同盘 rename，不产生副本、不占额外空间）。
    //    ★ 同一目录树下没必要再留一份「原目录备份」（那等于把数据翻倍），故这里是 move 不是 copy。
    // B. 常规数据目录 → 整目录递归复制。把现在及未来版本产生的所有数据文件
    //    （archive.db / archive.db.sig / share.db / lan-visitors.json / …）一并带走，
    //    不依赖白名单维护，新增数据文件天然不漏（Beta.191 白名单曾漏掉 share.db）。
    // C. 当前数据目录是盘符根目录（如 D:\）→ 「整个文件夹」=「整块磁盘」，
    //    递归复制会把全盘拖进子文件夹（假死 / 空间耗尽），退回白名单文件级复制。
    //    白名单来自 datadir.coreFileNames()（单一数据源，与备份同源，不再各写一遍）。
    const fromAbs = path.resolve(from);
    const dirAbs = path.resolve(dir);
    /** 目标是否位于源目录内部（含跨盘时 path.relative 返回绝对路径的情况） */
    const relFromToDest = path.relative(fromAbs, dirAbs);
    const destInsideSrc = relFromToDest !== '' && !relFromToDest.startsWith('..') && !path.isAbsolute(relFromToDest);

    if (destInsideSrc) {
      // A. 原地移入子目录：逐条 rename。用 listFiles 递归枚举（含 share.db 等全部数据文件），
      //    排除目标目录自身，避免把刚建出来的 data/ 又搬进 data/。
      const files = datadir.listFiles(from);
      for (const rel of files) {
        if (rel === DATA_SUBDIR || rel.startsWith(DATA_SUBDIR + '/')) continue;
        const src = path.join(from, rel);
        const dst = path.join(dir, rel);
        try {
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          await fsp.rename(src, dst);
        } catch (e) {
          // rename 跨设备会 EXDEV（同盘不会）；此时退回「复制 + 删源」，语义仍是移入
          if (e && e.code === 'EXDEV') {
            try {
              await fsp.cp(src, dst, { recursive: true });
              await fsp.rm(src, { recursive: true, force: true });
            } catch (e2) {
              throw new Error(i18n.errKey('common.errMoveInFailed', { rel, msg: e2.message }));
            }
          } else {
            throw new Error(i18n.errKey('common.errMoveInFailed', { rel, msg: e.message }));
          }
        }
      }
      getLog().info(`[操作] 迁移存储路径：原地移入子目录（${from} → ${dir}，共 ${files.length} 项）`);
    } else if (fromAbs === path.parse(fromAbs).root) {
      for (const f of datadir.coreFileNames()) {
        const src = path.join(from, f);
        if (fs.existsSync(src)) {
          try {
            await fsp.copyFile(src, path.join(dir, f));
          } catch (e) {
            throw new Error(i18n.errKey('common.errMigrateFileFailed', { file: f, msg: e.message }));
          }
        }
      }
    } else {
      try {
        await fsp.cp(from, dir, { recursive: true });
      } catch (e) {
        throw new Error(i18n.errKey('common.errCopyDirFailed', { msg: e.message }));
      }
    }
    keystore.writeDataDir(dir);
    db.setDataDir(dir);
    state.writable = db.checkWritable();
    safeAudit(currentUser(), '迁移存储路径', 'storage', '', { to: dir });
    getLog().info(`[操作] 迁移存储路径 完成 → ${dir}（可写: ${state.writable}）`);
    return { dataDir: dir, writable: state.writable };
  });
  handle('storage:open', async () => {
    shell.openPath(db.dataDirPath());
    return true;
  });
  handle('storage:backup', async p => {
    db.persistNow();
    const pass = p && p.pass ? String(p.pass) : '';
    const filePath = await saveFile({
      title: i18n.t('menu.storageBackupTitle'),
      defaultPath: `archive-full-backup_${compactStampMinute()}.zip`,
      filters: [{ name: i18n.t('menu.zipFilter'), extensions: ['zip'] }]
    });
    if (!filePath) return null;
    const zipBuf = zipBackup.backupAll(db.dataDirPath(), pass || undefined);
    await fsp.writeFile(filePath, zipBuf);
    const dbSize = fs.existsSync(path.join(db.dataDirPath(), 'archive.db'))
      ? fs.statSync(path.join(db.dataDirPath(), 'archive.db')).size
      : 0;
    // 全量备份（storage:backup）为手动操作，不更新 backup.lastAt——
    // 否则会与自动异地备份调度共用同一时间戳，且原覆盖写把数字改写成字符串（db.nowIso()）
    // 导致 auto-backup.maybe 的 now - last 得 NaN、自动备份调度失效。
    safeAudit(currentUser(), '全量备份', 'storage', '', {
      file: path.basename(filePath),
      dbBytes: dbSize,
      protected: !!pass
    });
    getLog().info(
      `[操作] 全量备份 完成 → ${path.basename(filePath)}（数据库 ${formatBytes(dbSize)}，口令保护：${!!pass}）`
    );
    return filePath;
  });

  // 从备份 zip 恢复：校验完整性 → 覆盖前先留底 → 解压覆盖数据目录 → 热重载数据库
  // ★ noLockGuard：dbError 屏（数据库损坏）与加密库未解锁（locked）态都需要能恢复，
  //   故绕过锁定守卫；身份安全靠「备份口令」+「覆盖前自动留底」保障。
  handle(
    'storage:restore',
    async p => {
      const pass = (p && p.pass) || '';
      const fp = await pickFile({
        title: i18n.t('menu.storageRestoreTitle'),
        filters: [{ name: i18n.t('menu.zipFilter'), extensions: ['zip'] }]
      });
      if (!fp) return null;
      const buf = await fsp.readFile(fp);

      // 1) 校验完整性（L1 哈希 + CRC32；口令加密则 L2 解密）
      const v = zipBackup.verifyBackupZip(buf, pass || undefined);
      if (!v.ok) throw new Error(v.reason || i18n.errKey('common.errBackupVerifyFail'));

      // 1.5) 覆盖前留底：先把当前数据目录打包一份，防误覆盖丢数据。
      //   存 <数据目录父级>/archbox-pre-restore/pre-restore_<秒级时间戳>.zip，不加密。
      const dir = keystore.readDataDir();
      try {
        const preDir = path.join(path.dirname(dir), 'archbox-pre-restore');
        await fsp.mkdir(preDir, { recursive: true });
        const preZip = path.join(preDir, `pre-restore_${compactStamp()}.zip`);
        await fsp.writeFile(preZip, zipBackup.backupAll(dir));
        safeAudit(currentUser(), '恢复前留底', 'storage', '', { file: path.basename(preZip) });
        getLog().info(`[操作] 从备份恢复 前留底 → ${path.basename(preZip)}`);
      } catch (e) {
        // 留底失败不应阻断恢复主流程，但记录警告
        getLog().warn(`[操作] 从备份恢复 前留底失败：${e.message}`);
      }

      // 2) 解压覆盖到数据目录
      const zipRead = require('../services/zip-read');
      for (const e of zipRead.listStoreEntries(buf)) {
        if (e.name === 'checksums.json') continue; // 校验摘要不落数据目录
        const target = path.join(dir, e.name);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, e.data);
      }

      // 3) 热重载数据库（关闭当前库 → 写指针 → 重新打开）
      const r = await keystore.reloadDataDir(dir);
      if (!r.ok) throw new Error(r.reason || i18n.errKey('common.errBackupRestoreFailed', { reason: '' }));

      safeAudit(currentUser(), '从备份恢复', 'storage', '', { file: path.basename(fp), locked: !!r.locked });
      getLog().info(`[操作] 从备份恢复 完成 → ${path.basename(fp)}（locked: ${!!r.locked}）`);
      return { ok: true, locked: !!r.locked, dataDir: dir };
    },
    { noLockGuard: true }
  );

  // 探测备份 zip 是否口令加密（无需口令，供前端决定是否弹口令框）
  handle('storage:backupEncrypted', async p => {
    const buf = await fsp.readFile(S(p.path));
    return zipBackup.backupEncrypted(buf);
  });

  // 加载另一个数据库：浏览目录 → 校验 archive.db 存在 → 热切换数据目录并重载库。
  // 场景：跨机迁移 / 打开历史留底（archbox-pre-restore）/ 打开任意已备份的库目录。
  // ★ 复用 keystore.reloadDataDir：它已内建「关旧库 → 写指针 → 重开新库 → 清 session」，
  //   换库后强制重新登录（不同库的账号体系 / mac 绑定各自独立），无需在此重复实现。
  handle('storage:openDb', async () => {
    const cur = keystore.readDataDir();
    const dir = await pickDirectory({ title: i18n.t('menu.storageOpenDbTitle'), defaultPath: cur });
    if (!dir) return null;
    const dbFile = path.join(dir, 'archive.db');
    if (!fs.existsSync(dbFile)) {
      throw new Error(i18n.errKey('settings.errOpenDbNoFile', { dir }));
    }
    if (path.resolve(dir) === path.resolve(cur)) {
      throw new Error(i18n.errKey('common.errSameDir'));
    }
    // 切换前把内存中的库落盘，保证旧目录留下最新状态（persistNow 内部已有 !db 守卫）
    db.persistNow();
    const r = await keystore.reloadDataDir(dir);
    if (!r.ok) throw new Error(r.reason || i18n.errKey('settings.errOpenDbFailed'));
    safeAudit(currentUser(), '切换数据库', 'storage', '', { to: dir, locked: !!r.locked });
    getLog().info(`[操作] 加载另一个数据库 → ${dir}（locked: ${!!r.locked}）`);
    return { ok: true, dataDir: dir, locked: !!r.locked };
  });
}

module.exports = { registerStorage };
