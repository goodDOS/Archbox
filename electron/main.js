'use strict';
/**
 * Electron 主进程入口（精简编排层）。
 * 职责边界已拆分到：
 *   - state.js            共享状态单例（win/tray/quitting/locked/writable）
 *   - services/logger.js  运行日志
 *   - keystore.js         数据目录指针 / 密钥文件 / 启动引导
 *   - window.js           窗口 + 托盘
 *   - ipc.js              IPC 通道注册（原 ~50 个 handler）
 *   - shots.js            截图模式
 * 本文件只负责按生命周期把这些模块串起来，安全加固与对外行为与原实现一致。
 */
const { app, session } = require('electron');
const path = require('path');

/* 产品数据根目录：%APPDATA%/文档盒 Archbox/
 *
 * ★ 必须在任何 require 之前执行，且必须「先改名、再解析 userData」★
 *
 * 两个坑叠在一起：
 *  1) Electron 的 userData 默认 = %APPDATA%/<app.name>，而 app.name 取自 package.json
 *     的 `name`（本项目为 archbox），**不是** productName。旧写法「先 getPath('userData')
 *     把旧路径 pin 住、再 setName」，会让 userData 永远停在 %APPDATA%/archbox。
 *  2) 子模块会在**模块作用域**立刻调 app.getPath('userData')（如 ipc/lanshare.js 的
 *     TOKEN_CACHE_FILE、ipc/settings.js 的 SEARCH_HISTORY_FILE）。一旦某个 require
 *     先跑了，那条路径就被钉死在旧根上，后设的名字再也修不回来。
 * 故本段必须位于所有业务 require 之上：先把 app.name 设成产品名，
 * 再让全进程依赖它解析 userData = %APPDATA%/文档盒 Archbox/，
 * 作为指针/密钥/日志/搜索历史/令牌/数据目录的统一根。
 *
 * ★ 老用户不做自动迁移（产品决定）★
 * 路径变更后，老装置的 storage.json 指针仍指向 %APPDATA%/archbox/data，
 * 但新进程再也读不到它 —— 用户会看到「数据库不可用」屏，需通过
 * 「选择其它数据目录」手动指回旧目录（或选择新目录）。这是预期行为，不是故障。
 * 手动指回后指针写入新根下的 storage.json，此后一切正常。
 */
// ★ 名字取自单一数据源（services/appinfo.js），不得在此另写字面量 ★
//   appinfo 是零依赖模块（只导出字符串常量，不碰 app/BrowserWindow），
//   故可在此最早期安全 require —— 它不会触发任何 userData 解析。
//   注意：这条 require 是**有意**排在最前的，风格检查里「setName 早于所有本地 require」
//   的断言已为它留白（它不解析 userData，不会把旧根钉死）。
try {
  app.setName(require('./services/appinfo').APP_NAME);
} catch (e) {}

const state = require('./state');
const logger = require('./services/logger');
const keystore = require('./keystore');
const windowMgr = require('./window');
const { registerIpc, lanStartIfEnabled, lanAutoSync, lanStop } = require('./ipc');
const { runShots } = require('./shots');
const db = require('./db');
const usage = require('./services/usage');
const zipBackup = require('./services/zip-backup');
const autoBackup = require('./services/auto-backup');
const clock = require('./services/clock');
const i18n = require('./i18n');

const isDev = process.argv.includes('--dev');
const isShot = process.argv.includes('--shot');
const isSeed = process.argv.includes('--seed');
/* 验证模式：--verify=find-scope 等在**真实主进程 + 真实 IPC** 里跑功能取证。
 * ★ 为什么单元测试不够：本项目最惨烈的两次事故（Beta.170 的范围限定失效、
 *   Beta.172 的"38/38 全绿但功能没生效"）都发生在"被测路径 ≠ 生产路径"上。
 *   验证必须打真通道、用真输入、看真像素，故把驱动器放进主进程。 */
const verifyArg = (process.argv.find(a => a.startsWith('--verify=')) || '').slice(9) || '';

/* 演示账号（仅 --seed / --shot 两个开发路径使用）。
 *
 * ★ 为什么是常量而不是就地写字面量 ★
 * 密码在【两个地方】必须完全一致：① 建号时写进库；② 自动登录时校验。
 * 分开写字面量迟早会漂移一个字符，而症状是「演示数据静默变成空的截图」，
 * 排查成本远高于这行常量。
 *
 * ★ 为什么必须有密码 ★
 * db/users.js 的 createUser 对空密码直接 throw「密码至少 6 位」，
 * login 对已设密码的账号也会强制校验。演示账号必须是个"能正常登录"的合法账号，
 * 否则 --shot 会卡在登录门（见下方 ensureDemoUser 注释）。 */
const DEMO_USER = '演示用户';
const DEMO_PASS = 'demo123456';

/* ★★ 安全问答也必须给，而且必须正好 3 组 ★★
 *
 * db/users.js 的 normalizeSecQa 对入参是**强校验**：
 *     if (!Array.isArray(qa) || qa.length !== 3) throw new Error(i18n.errKey('settings.errQANone'))
 * 所以 createUser(name, mac, password) 这种"少传最后一个参数"的写法会直接抛错。
 *
 * ★ 为什么这个参数被漏了这么久却没人发现 ★
 *   因为它排在 password 校验【之后】：修复前 password 为空时先炸在
 *   「密码至少 6 位」，第 4 个参数的问题被前一个异常完全掩盖。
 *   补上 password 之后才浮出水面 —— 这是"一次只暴露一个缺陷"的典型，
 *   也是为什么本轮必须真机跑一次 --seed，而不是只做完静态断言就收工：
 *   静态断言只看得见我想到要查的东西。 */
const DEMO_SECQA = [
  { q: '本项目的演示目的是什么', a: '功能演示' },
  { q: '演示数据的存放位置', a: '本地数据库' },
  { q: '演示账号由谁创建', a: '系统自动创建' }
];

/* 为 true 时窗口进入无头自动化模式：跳过「有未保存修改」的关闭确认。
 *
 * ★ 为什么必须跳过 ★
 * 那个确认走的是「主进程拦下 close → 发 win:confirmClose 给渲染层 → 前端弹
 * 应用内确认框 → 回执 win:confirmResult」的往返（见 window.js 的 askRendererThen）。
 * 截图模式的主循环在 runShots 里，界面上没有任何人来点那个确认框，
 * 于是 _closePending 会【永久保持 true】—— 它只在收到回执或真正关闭时才复位。
 * 后果不只是"关不掉"：用户随后手动关窗也会被 askRendererThen 开头的
 * if (_closePending) return 直接吞掉，表现为"点关闭按钮毫无反应"。
 * 截图模式本来就是短生命周期的无头进程，没有未保存修改可言，直接放行。 */
function headlessMode() {
  return isShot;
}

/**
 * 准备演示账号并写入演示数据（仅 --seed / --shot）。
 *
 * ★ 为什么必须做满三步，缺一步这条路径就是坏的 ★
 *
 * 1) 【建号 / 修号】必须补密码，且必须幂等。
 *    原实现是 db.createUser('演示用户', mac) —— 少传了 password 参数，
 *    db/users.js 的 `if (password.length < 6) throw new Error(i18n.errKey('settings.errPassMin6'))`
 *    直接在 whenReady 里抛出未处理拒绝，打断启动流程，createWindow 永不执行。
 *    症状极具迷惑性：DevTools 端口是通的，而 /json/list 恒空 —— 看着像 CDP 故障，
 *    实为根本没建过窗口。本轮首次把它修掉。
 *
 *    幂等的原因：第二次跑 --shot 时该 mac 已有用户，走的是 find() 命中的分支，
 *    不会再 createUser。但老库里可能存着"上一位开发者留下的、没密码的"演示账号，
 *    所以命中后还要把密码补回去 —— 否则自动登录会失败，问题只是从"建号炸"
 *    变成"登录炸"，症状还是空截图。这里显式写 password 列，不走 changePassword，
 *    因为后者要求先通过原密码校验（对空密码账号它放行，但语义上这是在"重置"，
 *    而我们要的是"确保这个演示账号可用"，直接写更符合意图且少一层分支）。
 *
 * 2) 【自动登录】写 session.user_id。
 *    App.vue 的门禁顺序是 booted → locked → !store.user 显示 UserGate。
 *    bootApp 只把 lastUserId 存成 store.lastUser（用于预选），**不会自动登录** ——
 *    "密码保护账号不自动登录，需手动输入密码"是有意设计，不能改。
 *    所以这里由主进程直接把会话写进设置；渲染层启动时 store.user 仍为 null，
 *    仍需走一次 users:login。但登录门会预选好本机用户，admin 手工跑 --shot
 *    （弹真窗口调试）时只需敲一次密码；而 runShots 的无头流程见 3)。
 *
 * 3) 【截图模式跳过登录门】见 shots.js 的 warmUpForShots —— 那里才是
 *    "让 e2e:goto 真的落到业务页"的关键。
 *
 * @returns {object|null} 演示用户（失败时为 null，绝不抛出：宁可没有演示数据，
 *                        也不能像原来那样把整个 whenReady 打断）
 */
function ensureDemoUser(log) {
  const mac = keystore.getMac();
  let u = db.listUsers().find(x => x.mac === mac);
  try {
    if (!u) {
      u = db.createUser(DEMO_USER, mac, DEMO_PASS, DEMO_SECQA);
      log.info(`演示账号已创建（${DEMO_USER}）`);
    } else if (!u.password) {
      // 老库里的无密码演示账号：补写密码，使它能被正常登录校验通过
      db.setUserPassword(u.id, DEMO_PASS);
      log.info(`演示账号 ${DEMO_USER} 缺少密码，已补齐`);
    }
  } catch (e) {
    // 用户名被占（库里已有一个叫「演示用户」但绑定别的 mac 的账号）：
    // 不阻断，退化为"没有演示账号"，后面 seed() 仍可用 author 为空的方式写入。
    log.warn(`演示账号准备失败，跳过：${e.message}`);
    u = null;
  }
  if (u) db.setSetting('session.user_id', u.id);
  try {
    const wrote = db.seed();
    log.info(wrote ? '演示数据已写入' : '演示数据已存在，跳过写入');
  } catch (e) {
    log.error(`演示数据写入失败: ${e.message}`, e);
  }
  return u;
}

if (isShot || isSeed) app.disableHardwareAcceleration();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // 重复启动：单实例锁已拒绝新进程（!gotLock 时直接 app.quit()），
  // 此处仅把已运行的实例（可能收在托盘）提到前台，绝不新建窗口
  app.on('second-instance', () => {
    logger.getLog().info('收到重复启动请求，已忽略并激活现有实例');
    windowMgr.showWindow();
  });

  app.whenReady().then(async () => {
    const log = logger.initLogger(app, isDev);
    clock.initClock(app);
    // 系统时钟检查：检测时间回拨/异常，影响审计与加密时间戳可信度时通知前端告警
    function maybeAlertClock() {
      const r = clock.checkDrift();
      if (!r.ok && state.win) state.win.webContents.send('clock:alert', r);
    }
    log.info(`======== 文档盒 Archbox 启动 v${app.getVersion()} ========`);
    log.info(
      `Electron ${process.versions.electron} / Chromium ${process.versions.chrome} / Node ${process.versions.node}`
    );
    log.info(`平台: ${process.platform} ${process.arch} / PID: ${process.pid}`);
    log.info(`UserData: ${app.getPath('userData')}`);
    log.info(`数据目录: ${keystore.readDataDir()}`);

    // ---------- 程序文件自检（防「程序自身被改」）----------
    // 放在数据库之前：这是纯文件比对，不依赖数据目录可写/加密状态，
    // 先行跑完可以让「程序被人换过」这件事在日志里出现在最靠前的位置，
    // 避免被后面的数据库告警淹没。结果通过 state.appIntegrity 传给渲染层展示。
    //
    // ★ 自检目标 = resources/app.asar.unpacked，不是 app.asar ★
    //   程序主体（electron/*.js、dist/index.html、package.json）全部在
    //   resources/app.asar 内，由 **Electron 原生 asar 完整性校验**守护：
    //   头哈希写进 Archbox.exe 的 PE 资源，校验逻辑在 exe 二进制内部，
    //   不匹配时 Electron 直接 process.exit(1) —— 那件事发生在 main.js 之前，
    //   本文件根本执行不到，也就不需要（也无法）在这里处理。
    //   所以这里要守的是 asar 照不到的真空地带：asarUnpack 解出来的文件
    //   （node_modules/sql.js/dist/* 等），它们在 app.asar 之外，头哈希不覆盖。
    //
    // 开发态/未走打包钩子时清单不存在，verifyAppFiles 会返回 missingManifest=true，
    // 视为「未启用」而非「被篡改」——绝不能因为开发环境没清单就报红。
    try {
      const integrity = require('./services/integrity');
      // app.getAppPath() 在 asar 下返回 .../resources/app.asar，其同级目录即 resources/
      const resourcesDir = path.dirname(app.getAppPath());
      const unpackedDir = path.join(resourcesDir, integrity.UNPACKED_NAME);
      const r = integrity.verifyAppFiles(unpackedDir);
      r.target = unpackedDir;
      state.appIntegrity = r;
      if (r.missingManifest) {
        log.info('程序文件自检：未启用（' + r.reason + '）');
      } else if (r.ok) {
        log.info(`程序文件自检通过（scope=${r.scope}，比对 ${r.checked} 个文件，全部与签名清单一致）`);
      } else if (r.dirMissing) {
        // 与「某个文件被改」区分开：这是整个 unpacked 目录不见了的矛盾态
        // （asar 头声明了实体应有，却找不到目录）——程序大概率也起不来，
        // 日志里直接点明，便于用户/支持人员一眼归因。
        log.warn('程序文件目录整体缺失：' + r.reason);
      } else {
        log.warn('程序文件自检未通过：' + r.reason);
        // 程序文件被改的事件同样要入审计链：这是「有迹可循」的核心承诺，
        // 而且必须在数据库可用时才写（此时 db 可能尚未初始化，故延后到就绪后）。
        // 这里只记录日志，落审计与弹窗统一放在数据库就绪之后。
      }
    } catch (e) {
      log.error('程序文件自检异常: ' + e.message, e);
      state.appIntegrity = { ok: true, missingManifest: true, reason: '自检异常，已跳过：' + e.message };
    }

    // 主进程 CSP 覆盖：file:// 协议下允许 ES module + asar 资源加载
    // 必须在 app.ready 之后执行（session.defaultSession 此时才可用）
    //
    // ★ Beta.178：只对应用自身的页面下发这份宽松策略 ★
    //   onHeadersReceived 是 session 级的，对**所有**请求生效 —— 包括
    //   用户拖进来 / 导航过去的外部本地文件。若不加区分地下发
    //   `script-src … 'unsafe-eval'`，那些外来页面也会拿到执行权限。
    //   它们本来就被 will-navigate 拦在外面（第一道闸），这里是纵深防御：
    //   万一将来某条路径漏过，外来页面拿不到我们的宽松策略，执行不了脚本。
    //   判据用 file:// 前缀 + 结尾 index.html 双重限定，避免误放行同目录其它文件。
    const _isAppPage = u => {
      const s = String(u || '');
      if (!s.startsWith('file://')) return false;
      const clean = s.split('#')[0].split('?')[0];
      return /\/index\.html$/.test(clean);
    };
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      if (_isAppPage(details.url)) {
        headers['Content-Security-Policy'] = [
          "default-src 'self' file: data: blob:; " +
            "script-src 'self' file: 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' file: 'unsafe-inline'; " +
            "img-src 'self' file: data: blob:; " +
            "font-src 'self' file: data:; " +
            "connect-src 'self' file: ws: http://127.0.0.1:5173 http://localhost:5173"
        ];
      } else {
        // 外来页面（非应用入口）：最严策略，禁脚本、禁远程资源
        headers['Content-Security-Policy'] = [
          "default-src 'self'; script-src 'none'; object-src 'none'; " + "frame-ancestors 'none'; base-uri 'none'"
        ];
      }
      callback({ responseHeaders: headers });
    });
    log.info('CSP 覆盖已注册');
    registerIpc();
    log.info('IPC 通道已注册');
    // 自动异地备份调度：每 60s 检查一次是否到备份时机（按 backup.schedule / backup.lastAt 判断）
    setInterval(() => {
      try {
        const r = autoBackup.maybe(db, zipBackup, { locked: state.locked });
        if (r) log.info(`自动异地备份完成：${r.file}（清理 ${r.pruned} 个旧备份）`);
      } catch (e) {
        log.error(`自动备份检查失败: ${e.message}`, e);
      }
    }, 60 * 1000);
    log.info('自动异地备份调度已启动');
    // 系统时钟检查：每 30 秒比对单调时钟锚点，异常则通知前端
    setInterval(maybeAlertClock, 30000);
    log.info('系统时钟检查已启动（每 30 秒）');
    // 局域网共享自动同步：每 30 秒比对共享大区 latest updated_at，有变更则重建副本库
    setInterval(() => {
      try {
        lanAutoSync();
      } catch (e) {
        log.error('局域共享自动同步异常: ' + e.message, e);
      }
    }, 30000);
    log.info('局域网共享自动同步已启动（每 30 秒）');
    try {
      await keystore.tryBootDb();
      /* ★ 界面语言必须在任何主进程文案之前定下来（Beta.271）★
       *
       * 位置只能是这里：库已打开时读设置表，打不开时读 userData 缓存。
       * 更早（app.whenReady 之前）库还没 init，db.getSetting 会抛 assertDb；
       * 更晚则下面两个完整性告警弹窗已经用错语言画出来了。
       *
       * 用 state.locked 区分：锁定态库虽已解密可读结构但业务表不可信，
       * 此时 initFromSettings 读不到 display.lang 会自动落回缓存，行为正确，
       * 故不必额外分支。 */
      try {
        if (!state.locked && db) i18n.initFromSettings(k => db.getSetting(k));
        else i18n.initFromCache();
      } catch (e) {
        i18n.initFromCache();
      }
      log.info(state.locked ? '数据库已加密锁定，等待解锁' : `数据库已就绪 (可写: ${state.writable})`);
      // 数据库完整性告警（L1+L2+CRC32 启动校验）
      if (!state.locked) {
        const integWarn = db.getPendingIntegrityWarn();
        if (integWarn) {
          log.warn('数据库完整性校验告警：' + integWarn);
          // ★ ① 先落审计链，再弹窗 ★
          //   顺序不能反：弹窗可能被用户直接杀掉进程（或攻击者脚本化结束），
          //   而审计链是「有迹可循」的唯一载体，必须最先写下去。
          //   recordIntegrityIncident 每次启动都会追加一条，因此「被改过」这件事
          //   不会因为用户点了一次「我知道了」就被清除。
          try {
            db.recordIntegrityIncident();
          } catch (e) {
            log.error('完整性事件入审计链失败: ' + e.message);
          }
          // 只读附注随 writable 是否成立决定取舍；文案本身走字典（语言在
          // tryBootDb 之后已由 initFromSettings 定好，见本文件下方）
          const readOnlyNote = state.writable ? '' : i18n.t('sys.dbReadOnlyNote');
          try {
            const { dialog } = require('electron');
            // ★ ② 阻断式告警：不再只给一个「继续」按钮 ★
            //   旧实现是 showMessageBoxSync + 单按钮 ['我知道了，继续']，
            //   用户唯一能做的就是继续 —— 等于没有选择，被改这件事被一笔带过。
            //   现在提供明确的两条路：去设置里处理 / 退出程序。
            //   默认项是「前往设置」而不是「继续使用」，让用户必须先做决定。
            const choice = dialog.showMessageBoxSync(null, {
              type: 'warning',
              noLink: true,
              title: i18n.t('sys.dbIntegrityTitle'),
              message: i18n.t('sys.dbIntegrityMsg'),
              detail: integWarn + readOnlyNote + i18n.t('sys.dbAuditNote'),
              buttons: [i18n.t('sys.dbGotoSettings'), i18n.t('sys.dbQuit')],
              defaultId: 0,
              cancelId: 1
            });
            if (choice === 1) {
              app.quit();
              return;
            }
            // 记下「用户已知悉」这一动作本身，避免后续只看到告警、看不到处置
            try {
              db.safeAudit(null, '完整性告警已确认', 'integrity', 'archive.db', {
                reason: integWarn,
                writable: state.writable
              });
            } catch (e) {}
          } catch (e) {
            log.error('完整性告警弹窗失败: ' + e.message);
          }
        }
      }
      // 启动后按设置初始化日志调试标志（调试模式下报错附带堆栈，便于定位代码）
      if (!state.locked) {
        try {
          logger.setDebug(!!db.getSetting('debug.captureStack'));
        } catch (e) {}
      }
      // ---------- 程序文件自检结果的后续处置 ----------
      // 数据库此时已就绪，可以把「程序文件被改」写进审计链了。
      // 与数据完整性告警的区别：程序文件被改通常意味着「换了程序」，
      // 这种情况更严重，但也不能直接把用户挡在门外（有可能是杀软静默改文件、
      // 或用户自己替换了文件想改行为）。所以策略是：
      //   一律记录（审计链 + 日志），一律提示，但写入能力不由它决定 ——
      //   决定只读的是「数据」完整性（state.writable），避免把两件事混淆。
      //
      // ★ 这里只可能报 unpacked 层 ★
      //   程序主体在 app.asar 内，由 exe 二进制里的 Electron 校验守护：
      //   被改则该进程根本起不来（无窗口、无日志、无弹窗，直接退出）。
      //   所以能走到这段代码，说明 app.asar 是原样的，出问题的只可能是
      //   app.asar.unpacked 下的文件。文案必须说清这个层级，避免用户误解
      //   成「主程序被换了」而白白恐慌。
      try {
        const ai = state.appIntegrity;
        if (ai && !ai.ok && !ai.missingManifest) {
          try {
            db.recordAppIntegrityIncident(ai);
          } catch (e) {
            log.error('程序文件事件入审计链失败: ' + e.message);
          }
          try {
            const { dialog } = require('electron');
            dialog.showMessageBoxSync(null, {
              type: 'warning',
              noLink: true,
              title: i18n.t('sys.appIntegrityTitle'),
              message: i18n.t('sys.appIntegrityMsg'),
              detail: i18n.t('sys.appIntegrityDetail', {
                scope: ai.scope || 'asar-unpacked',
                reason: ai.reason
              }),
              buttons: [i18n.t('sys.appIntegrityOk')],
              defaultId: 0
            });
          } catch (e) {
            log.error('程序文件告警弹窗失败: ' + e.message);
          }
        }
      } catch (e) {
        log.error('程序文件自检后续处置异常: ' + e.message);
      }
      // 若用户此前已开启局域共享，则在数据库就绪后自动拉起只读服务
      if (!state.locked) lanStartIfEnabled();
      // 数据库就绪后开始累计使用时长（仅统计解锁后的在线时长）
      if (!state.locked) {
        usage.start();
        log.info('使用时长统计已启动');
      }
    } catch (e) {
      // 启动链路整体失败（连 tryBootDb 都没能返回）：语言尚未初始化，
      // 补一次缓存回退，保证随后出现的 dbError 屏文案是用户上次选的语言。
      try {
        i18n.initFromCache();
      } catch (e2) {}
      log.error(`数据库启动失败: ${i18n.logText(e.message)}`, e);
    }
    if (!state.locked && (isSeed || isShot || verifyArg)) ensureDemoUser(log);
    if (isSeed) {
      log.info('演示数据已写入，退出');
      app.quit();
      return;
    }
    // 截图模式为无头运行：窗口的关闭确认无法得到渲染层回执，必须跳过（详见 window.js）
    windowMgr.setHeadless(headlessMode());
    windowMgr.createWindow({ isDev, isShot });
    log.info('主窗口已创建');
    maybeAlertClock();
    if (state.win) {
      state.win.on('focus', () => {
        usage.setFocused(true);
        maybeAlertClock();
      });
      state.win.on('blur', () => usage.setFocused(false));
      // 创建后按窗口真实聚焦态同步，避免"未真正聚焦却已计数"
      usage.setFocused(state.win.isFocused());
      // 实时日志推送：logger 每次写入都通过 webContents 推到渲染层，实现运行过程悬浮窗的"流动"输出
      const disposeLogSink = logger.onWrite(entry => {
        if (state.win && !state.win.isDestroyed()) {
          try {
            state.win.webContents.send('log:line', entry);
          } catch (e) {}
        }
      });
      state.win.on('closed', () => {
        try {
          disposeLogSink();
        } catch (e) {}
      });
    }
    if (isShot) {
      state.win.show();
      log.info('截图模式启动');
      runShots().catch(e => {
        log.error(`截图失败: ${e.message}`, e);
        app.quit();
      });
    }
    if (verifyArg) {
      state.win.show();
      log.info(`验证模式启动：${verifyArg}`);
      const runners = {
        // Beta.184 起，页面内查找已迁移到渲染端 postFind 引擎（src/utils/postFind.js），
        // 旧方案的 findInPage 取证脚本（electron/verify/*）随方案废弃一并归档删除；
        // 白屏根因与弱化强度（opacity .45）已固化于 src/styles/base.css 注释与验收清单。
        // 如需接入新的 Electron 级验证，在此注册入口即可。
      };
      const runner = runners[verifyArg];
      if (!runner) {
        log.error(`未知的验证项：${verifyArg}`);
        app.quit();
      } else
        runner().catch(e => {
          log.error(`验证失败: ${e.message}`, e);
          app.quit();
        });
    }
  });

  app.on('window-all-closed', () => {
    if (!state.quitting) return;
    logger.getLog().info('所有窗口关闭，退出应用');
    app.quit();
  });
  app.on('before-quit', () => {
    state.quitting = true;
    if (state.tray) {
      try {
        state.tray.destroy();
      } catch (e) {}
      state.tray = null;
    }
    try {
      usage.stop();
    } catch (e) {
      logger.getLog().error(`使用时长持久化失败: ${e.message}`, e);
    }
    logger.getLog().info('应用即将退出，持久化数据库');
    try {
      db.persistNow();
    } catch (e) {
      logger.getLog().error(`退出持久化失败: ${e.message}`, e);
    }
    // 退出前持久化共享副本库并停止只读服务（如在运行）
    try {
      lanStop();
    } catch (e) {
      logger.getLog().error(`局域网共享退出清理失败: ${e.message}`, e);
    }
    // 退出前自动异地备份（若用户开启了 backup.onExit 且已配置目标目录）
    try {
      if (!state.locked && db.getSetting('backup.onExit') && db.getSetting('backup.targetDir')) {
        const r = autoBackup.perform(db, zipBackup, {
          targetDir: db.getSetting('backup.targetDir'),
          retain: db.getSetting('backup.retain', 5)
        });
        logger.getLog().info(`退出前自动备份完成：${r.file}（清理 ${r.pruned} 个旧备份）`);
      }
    } catch (e) {
      logger.getLog().error(`退出前自动备份失败: ${e.message}`, e);
    }
  });

  // 全局未捕获异常写入日志
  process.on('uncaughtException', err => {
    logger.getLog().error(`未捕获异常: ${err.stack || err.message}`);
  });
  process.on('unhandledRejection', reason => {
    logger.getLog().error(`未处理 Promise 拒绝: ${reason}`, reason);
  });
}
