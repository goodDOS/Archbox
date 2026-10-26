'use strict';
/**
 * 「提示拷贝失败，实则成功」缺陷回归（Beta.214）。
 *
 * 【现象】归属弹窗确认拷贝后，页面上同时出现两行提示：
 *   · 红色「拷贝失败」（.pr-err）
 *   · 绿色「已拷入「企业信息库」/ 制造类企业」（.pr-ok）
 *   两者不可能同时为真 —— 说明 copyCurrent 在**写完成功回执之后**又落进了 catch。
 *
 * 【为什么必须驱动真实组件】
 *   本 Bug 前两次尝试都在 Node 里复刻 copyCurrent 的控制流，**都复现不出来**。
 *   因为真凶不在那段源码本身，而在它调用的真实依赖上（真实 friendship / 真实 store
 *   的真实响应式副作用）。复刻的逻辑副本永远测不到 —— 只能把真实页面跑起来。
 *
 * 做法：用真 Chromium 加载构建产物 dist/index.html，注入与 preload 同名同形的
 * window.arch 替身让应用 boot 到主界面，再**真实点击**进入局域网页 → 打开文档 →
 * 点「拷贝到本机」→ 确认归属，最后读 DOM 上 .pr-err/.pr-ok 的实际文本。
 *
 * 用法：node electron/verify/copy-false-failure.e2e.cjs [ROOT] [CHROME]
 */
const path = require('path');
const fs = require('fs');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const CHROME = process.argv[3] || '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  ✓ ' + m);
  } else {
    fail++;
    console.log('  ✗ ' + m);
  }
};

const ENTRY = path.join(ROOT, 'dist/index.html');

/** 注入到页面里的 window.arch 替身（与 preload 白名单同名同形） */
const ARCH_STUB = `
(function () {
  var POST = {
    id: 7, title: '待拷文档', no: 'N-7',
    content_html: '<p>正文</p>', content_text: '正文',
    rname: '源大区', cname: '源分类',
    author_name: '原作者', fields: [], tags: []
  }
  var REGIONS = [{ id: 1, name: '本机大区', code: 'A', color: '#8a63d2', sort: 1 }]
  var okAsync = function (v) { return function () { return Promise.resolve(v) } }
  // 这些通道语义是布尔开关，兜底返回 false 更贴近未定义行为（返回 [] 会被当 truthy）
  var BOOL_LIKE = { setSetting: 1, securityUnlock: 1, usageTick: 1, clockCheck: 1, logOpen: 1, logWrite: 1, lanSetTokenCache: 1, lanAudit: 1, setSearchHistory: 1 }

  window.arch = {
    /* —— 启动链路 ——
     * boot() 的真实返回形状见 src/store/modules/boot.js：
     *   { mac, versions, writable, locked, dbError, settings, users, lastUserId }
     * 注意：boot 里**没有** user 字段 —— store.user 只能来自 A.login()，
     * 这是「密码保护账号不自动登录」的有意设计，测试也不能绕过它开后门，
     * 故下面用真实登录流程（login 通道）进入主界面。 */
    boot: okAsync({
      mac: 'aa-bb-cc-dd-ee-ff',
      versions: {},
      writable: true,
      locked: false,
      settings: {},
      users: [{ id: 1, name: '本机用户', mac: 'aa-bb-cc-dd-ee-ff' }],
      lastUserId: 1
    }),
    login: function (p) {
      window.__loginCalls = (window.__loginCalls || 0) + 1
      return Promise.resolve({ id: 1, name: '本机用户', mac: 'aa-bb-cc-dd-ee-ff' })
    },
    settingsAll: okAsync({}),
    users: okAsync([{ id: 1, name: '本机用户', mac: 'aa-bb-cc-dd-ee-ff' }]),
    usersList: okAsync([{ id: 1, name: '本机用户', mac: 'aa-bb-cc-dd-ee-ff' }]),
    auditVerify: okAsync({ ok: true }),
    usageTick: okAsync(true),
    clockCheck: okAsync({ ok: true }),
    logRead: okAsync([]),
    logOpen: okAsync(true),
    logWrite: okAsync(true),
    searchHistory: okAsync([]),
    setSearchHistory: okAsync(true),

    /* —— 首页/侧栏可能拉取的数据 —— */
    stats: okAsync({ posts: 1, regions: 1, cats: 1, tags: 0, fields: 0, users: 1, notes: 0, last7: [], recent: [],
      new7: 0, newPrev7: 0, uncat: 0, drafts: 0, trash: 0, abnormal7: 0, lastBackupAt: null, encrypted: false,
      storageBytes: 0, storagePath: 'D:\\\\文档盒 Archbox\\\\data', storageDrive: 'D:', onSystemDrive: false,
      usageToday: 0, usage7: [], usagePrev7: [], loginTodayUsers: 0, loginTodayTimes: 0, loginTodayList: [],
      loginRank7: [], loginUsers7: 0, loginFailToday: 0 }),
    regions: okAsync(REGIONS),
    cats: okAsync([{ id: 3, name: '制造类企业', regionId: 1 }]),
    tags: okAsync([]),
    fields: okAsync([]),

    /* —— 局域共享 —— */
    lanStatus: okAsync({
      enabled: true, name: '本机测试机', port: 47373, token: 'TK',
      authEnabled: false, allowCopy: true, sharedRegions: [1],
      lanIp: '127.0.0.1', lanIps: ['127.0.0.1']
    }),
    lanDiscover: okAsync({ sources: [] }),
    lanRequest: function (p) {
      var u = String((p && p.url) || '')
      if (u.indexOf('/api/version') >= 0) return Promise.resolve({ app: 'Archbox', version: '0.9.0-Beta.213', allowCopy: true })
      if (u.indexOf('/api/regions') >= 0) return Promise.resolve([{ id: 1, name: '本机大区' }])
      if (u.indexOf('/api/stats') >= 0) return Promise.resolve([{ regionId: 1, postCount: 1 }])
      if (u.indexOf('/api/posts') >= 0) return Promise.resolve({ list: [POST], total: 1 })
      if (u.indexOf('/api/post/') >= 0) return Promise.resolve(POST)
      return Promise.resolve(null)
    },
    /* ★ 拷贝成功（本事故中业务确实成功了） */
    lanCopyPost: function () {
      window.__copyCalls = (window.__copyCalls || 0) + 1
      return Promise.resolve({
        id: 101, title: '待拷文档',
        regionName: '企业信息库', categoryName: '制造类企业',
        originAuthor: '原作者', from: '本机测试机@127.0.0.1:47373',
        targetMode: 'existing', reported: true
      })
    },
    lanGetTokenCache: okAsync({}),
    lanSetTokenCache: okAsync(true),
    lanAudit: okAsync(true),
    lanMyStats: okAsync({ enabled: true, sharedRegionCount: 1, postCount: 1, visitor7: 0, visitorToday: 0, postView7: 0, postViewToday: 0 }),
    lanCopyLog: okAsync([]),
    lanCopyRank: okAsync([]),
    lanVisitorLog: okAsync([]),
    /* 其余通道一律兜底为「返回 null 的异步函数」，避免 not a function */
    __fallback: true
  }
  // 用 Proxy 兜住所有未显式定义的通道。
  // 兜底返回数组而非 null：很多组件直接 v-for / arr.length，
  // 拿到 null 会抛 Cannot read properties of null 并中断渲染，
  // 那样测的就不是拷贝链路而是替身自身的残缺。
  window.arch = new Proxy(window.arch, {
    get: function (t, k) {
      if (typeof k !== 'string') return t[k]
      if (k in t) return t[k]
      return function () { return Promise.resolve(Object.prototype.hasOwnProperty.call(BOOL_LIKE, k) ? false : []) }
    }
  })
})()
`;

async function main() {
  if (!fs.existsSync(ENTRY)) {
    console.error('未找到构建产物：' + ENTRY);
    process.exit(2);
  }
  let chromium;
  try {
    ({ chromium } = require('/tmp/node_modules/playwright-core'));
  } catch (e) {
    console.error('未找到 playwright-core');
    process.exit(2);
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.type();
    if (t === 'error') pageErrors.push('console: ' + m.text());
    if (t === 'warning' || t === 'warn') pageErrors.push('console.warn: ' + m.text());
  });

  await page.addInitScript(ARCH_STUB);

  // ★ 取证钩子：劫持 setTimeout，把 copyCurrent 的 catch 参数抓下来。
  //   实测 console.error 一路干净、无 unhandledrejection，说明异常是被同步 throw 并被
  //   catch 吃掉的。产物是压缩单文件，无法 require 组件，故用「函数名特征」定位：
  //   编译后的 copyCurrent 形如 `async function te(k){...catch(x){const q=Vt(x,"拷贝失败")...`
  //   但函数名被压缩不可预测。改用更稳的钩子：包一层 toBePushed 的 ref 写入不可行，
  //   于是直接监听「任何被创建的 Error」—— 本项目的 catch 里 friendlyErr 只读 message，
  //   若 catch 拿到的是 undefined，就不会有 Error 被创建，这本身就是结论。
  //   所以这里记录 toast 调用（失败提示必然走 toastErr → toast），把它的入参留档。
  await page.addInitScript(() => {
    window.__toasts = [];
    window.__caught = [];
    const origErr = console.error;
    console.error = function (...a) {
      try {
        window.__caught.push(
          a.map(x => (x && x.stack ? String(x.stack).split('\n').slice(0, 6).join(' | ') : String(x))).join(' ')
        );
      } catch (e) {}
      return origErr.apply(console, a);
    };
    window.addEventListener('unhandledrejection', e => {
      window.__caught.push(
        'unhandledrejection: ' +
          String((e.reason && e.reason.stack) || e.reason || '')
            .split('\n')
            .slice(0, 4)
            .join(' | ')
      );
    });
    // Vue 的全局错误处理（installErrorCapture 会把组件内异常上报到这里）
    window.addEventListener('error', e => {
      window.__caught.push(
        'error: ' + String(e.message || '') + ' @ ' + String(e.filename || '').slice(-60) + ':' + e.lineno
      );
    });
  });

  await page.goto('file://' + ENTRY, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);

  console.log('\n[1] 通过真实登录门进入主界面（不绕过 store.user 的设计）');
  let shell = await page.evaluate(() => !!document.querySelector('.app-shell'));
  if (!shell) {
    // 门禁页：点用户行 → 输密码 → 提交（与手工操作一致）
    const atGate = await page.evaluate(() => !!document.querySelector('.user-gate, .gate-card-wrap, .user-row'));
    ok(atGate, '已停在登录门（.user-gate/.user-row 存在）');
    await page.evaluate(() => {
      const rows = document.querySelectorAll('.user-row, .login-as, .pc');
      if (rows.length) rows[0].click();
      const ps = document.querySelectorAll('input[type=password]');
      const el = ps[ps.length - 1];
      if (el) {
        el.focus();
        el.value = 'demo123456';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(x => /进入|登录|确定/.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(1500);
    shell = await page.evaluate(() => !!document.querySelector('.app-shell'));
  }
  ok(shell, '已进入 .app-shell（替身让 App 正常 boot + 登录）');
  if (!shell) {
    const boot = await page.evaluate(() => (document.body.innerText || '').slice(0, 400));
    console.log('    当前页面文本：', JSON.stringify(boot));
    if (pageErrors.length) pageErrors.slice(0, 5).forEach(e => console.log('    ·', e));
    await browser.close();
    console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
    process.exit(1);
  }

  console.log('\n[2] 导航到局域网页');
  // 侧栏「局域网」入口
  const clicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const t = items.find(x => /局域|共享|局域网/.test(x.textContent || ''));
    if (t) {
      t.click();
      return t.textContent.trim();
    }
    return null;
  });
  ok(!!clicked, '已点击侧栏入口：' + JSON.stringify(clicked));
  await page.waitForTimeout(900);

  console.log('\n[3] 打开本机源下的大区 → 打开文档');
  // 大区按钮是 .src-region（见 LanShare.vue 模板），必须点它本身而不是含文本的父 div
  const regClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.src-region'));
    const b = btns.find(x => /本机大区/.test(x.textContent || ''));
    if (b) {
      b.click();
      return (b.textContent || '').trim();
    }
    return null;
  });
  ok(!!regClicked, '已点击大区按钮 .src-region：' + JSON.stringify(regClicked));
  await page.waitForTimeout(1600);

  const postOpened = await page.evaluate(() => {
    // 文档卡由 PostCard 渲染；优先用其内部标题节点点击
    const cards = Array.from(document.querySelectorAll('.post-card, .pc, .card.lift, [class*=post-card]'));
    const c = cards.find(x => /待拷文档/.test(x.textContent || ''));
    if (c) {
      c.click();
      return { how: 'post-card', text: (c.textContent || '').trim().slice(0, 40) };
    }
    const any = Array.from(document.querySelectorAll('div,li,a,button'))
      .filter(x => /待拷文档/.test(x.textContent || ''))
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    if (any.length) {
      any[0].click();
      return { how: 'fallback', text: (any[0].textContent || '').trim().slice(0, 40) };
    }
    return null;
  });
  ok(!!postOpened, '已打开文档「待拷文档」：' + JSON.stringify(postOpened));
  await page.waitForTimeout(1600);

  console.log('\n[4] 点「拷贝到本机」');
  const copyBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => /拷贝到本机/.test(x.textContent || ''));
    if (b) {
      b.click();
      return { disabled: b.disabled, title: b.title };
    }
    return null;
  });
  ok(!!copyBtn, '找到并点击「拷贝到本机」按钮：' + JSON.stringify(copyBtn));
  await page.waitForTimeout(700);

  console.log('\n[5] 归属弹窗：确认拷贝');
  const confirmed = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => /确认拷贝/.test(x.textContent || ''));
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  ok(confirmed, '已点击「确认拷贝」');

  // 等异步回执落定
  await page.waitForTimeout(1500);

  console.log('\n[6] ★ 读取页面上的两行提示');
  const shown = await page.evaluate(() => {
    const err = document.querySelector('.pr-err');
    const okEl = document.querySelector('.pr-ok');
    return {
      err: err ? err.textContent.trim() : '',
      ok: okEl ? okEl.textContent.trim() : '',
      both: !!(err && err.textContent.trim() && okEl && okEl.textContent.trim()),
      copyCalls: window.__copyCalls || 0,
      // 抓 catch 分支收到的原始异常（由 initScript 里的钩子记录）
      caught: window.__caughtRewrite || null
    };
  });
  console.log('    .pr-err =', JSON.stringify(shown.err));
  console.log('    .pr-ok  =', JSON.stringify(shown.ok));
  console.log('    lanCopyPost 调用次数 =', shown.copyCalls);
  if (shown.caught) console.log('    catch 捕获异常 =', JSON.stringify(shown.caught));

  ok(shown.copyCalls === 1, '拷贝只被调用一次（排除重复触发）');
  ok(
    !shown.both,
    shown.both ? '★ 复现「提示拷贝失败，实则成功」：红绿两行同时出现' : '★ 未复现：成功提示与失败提示不会同时出现'
  );
  ok(shown.ok.includes('已拷入'), '成功回执正常显示（业务确实成功）');
  ok(!shown.err, '★ 失败提示为空（业务成功时不得报「拷贝失败」）' + (shown.err ? '（实际：' + shown.err + '）' : ''));

  console.log('\n[7] 渲染进程未捕获异常');
  if (pageErrors.length) pageErrors.slice(0, 8).forEach(e => console.log('    ·', e));
  ok(
    pageErrors.length === 0,
    pageErrors.length ? '有 ' + pageErrors.length + ' 条错误' : '无 pageerror / console.error'
  );

  console.log('\n[8] 反向验证：真失败时仍须正确报错（不能为「不误报」而吞掉真错）');
  const realFail = await page.evaluate(async () => {
    const orig = window.arch.lanCopyPost;
    window.arch.lanCopyPost = function () {
      return Promise.reject(new Error('该共享源未开放文档拷贝'));
    };
    const btn = Array.from(document.querySelectorAll('button')).find(x => /拷贝到本机/.test(x.textContent || ''));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 400));
    const ok2 = Array.from(document.querySelectorAll('button')).find(x => /确认拷贝/.test(x.textContent || ''));
    if (ok2) ok2.click();
    await new Promise(r => setTimeout(r, 1000));
    const e2 = document.querySelector('.pr-err');
    const o2 = document.querySelector('.pr-ok');
    const res = { err: e2 ? e2.textContent.trim() : '', ok: o2 ? o2.textContent.trim() : '' };
    window.arch.lanCopyPost = orig;
    return res;
  });
  console.log('    真失败时 .pr-err =', JSON.stringify(realFail.err), '/ .pr-ok =', JSON.stringify(realFail.ok));
  ok(/未开放文档拷贝/.test(realFail.err), '★ 真失败仍正确显示原因：' + JSON.stringify(realFail.err));
  ok(!realFail.ok, '★ 真失败时不显示成功回执（状态未被污染）');

  console.log('\n[9] 源码契约：try 范围只包住真会失败的那一步');
  const srcDir = path.join(ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const vueSrc = fs.readFileSync(path.join(ROOT, 'src/pages/LanShare.vue'), 'utf8');
    ok(
      /import \{[^}]*\btoast\b[^}]*\} from '\.\.\/feedback'/.test(vueSrc),
      '★ toast 已从 feedback 正确导入（本次 ReferenceError 的根因）'
    );
    ok(/toastErr/.test(vueSrc), 'toastErr 仍在导入之列');
    const body = (vueSrc.match(/async function copyCurrent[\s\S]*?\n\}/) || [''])[0];
    ok(body.length > 0, 'copyCurrent 函数体已定位（断言前提）');
    // try 内应只有一次 await（调 IPC），回执/toast/emit 必须在 try 之外
    const tryBlock = (body.match(/try \{[\s\S]*?\} catch/) || [''])[0];
    ok((tryBlock.match(/await /g) || []).length === 1, '★ try 内只有 1 个 await（只包住 A.lanCopyPost）');
    ok(!/toast\(|bus\.emit/.test(tryBlock), '★ toast / bus.emit 已移出 try（纯通知动作不得左右业务结论）');
    ok(!/'data:changed'/.test(vueSrc), '★ 不再派发无人订阅的 data:changed，改用全项目通用的 refresh');
  } else {
    console.log('    · 未发现 src/（指向产物运行），跳过源码断言');
  }

  await browser.close();
  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('崩溃:', (e && e.stack) || e);
  process.exit(2);
});
