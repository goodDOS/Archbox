'use strict';
/**
 * 截图模式：用于生成运行预览图（--shot）。
 * 依赖共享状态（win）与日志。
 */
const path = require('path');
const fs = require('fs');
const state = require('./state');
const { getLog } = require('./services/logger');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * 等待渲染层进入"可接收 e2e:goto 的状态"，必要时替它走完登录门。
 *
 * ★ 这是 --shot 分支历史上第二个致命问题（第一个是 main.js 漏传密码）★
 *
 * App.vue 的门禁顺序是：booted → locked → !store.user 显示 UserGate。
 * 主进程的 ensureDemoUser 已经把 session.user_id 写好了，但渲染层的 store.user
 * 仍然只来自 store.modules.auth 的 users:login —— bootApp 明确注明
 * 「密码保护账号不自动登录，需手动输入密码」，这是有意设计，不能动它去开后门。
 *
 * 于是 --shot 的 13 条 e2e:goto 全部打在登录门上：截图不会报错，只会静静地
 * 输出 13 张一模一样的登录页。这是最坏的一类故障 —— 结果"看起来成功"。
 *
 * 正解是在这里（无头驱动器一侧）用真实 UI 路径把登录门走完：点用户行 → 输密码 → 提交。
 * 这与手工跑 --shot 时的操作完全一致，测的还是产品里真实存在的登录流程，
 * 而不是绕过它去改 store。密码取自 main.js 的 DEMO_PASS 同一常量来源。
 */
async function ensureLoggedIn() {
  const wc = state.win && state.win.webContents;
  if (!wc) return false;
  const evaluate = expr => wc.executeJavaScript(expr, true).catch(() => null);

  for (let i = 0; i < 30; i++) {
    await sleep(400);
    const at = await evaluate(
      "!!(document.querySelector('.app-shell') || document.querySelector('.gate-card-wrap') || document.querySelector('.user-gate'))"
    );
    if (!at) continue;
    // 已进主界面
    const inApp = await evaluate("!!document.querySelector('.app-shell')");
    if (inApp) return true;
    // 停在门禁：走真实登录流程
    const filled = await evaluate(`(function () {
      var rows = document.querySelectorAll('.user-row, .login-as, .pc')
      if (rows.length) { rows[0].click() }
      var ps = document.querySelectorAll('input[type=password]')
      var el = ps[ps.length - 1]
      if (!el) return false
      el.focus()
      el.value = ${JSON.stringify(process.env.SHOT_PASSWORD || 'demo123456')}
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      var btns = document.querySelectorAll('button')
      for (var i = 0; i < btns.length; i++) {
        if (/进入|登录|确定/.test(btns[i].innerText || '')) { btns[i].click(); return true }
      }
      return false
    })()`);
    if (filled) {
      await sleep(1200);
      getLog().info('[shot] 已通过登录门进入主界面');
      return true;
    }
  }
  getLog().warn('[shot] 未能在预期时间内进入主界面，截图可能落在门禁页');
  return false;
}

async function runShots() {
  // ★ 先过登录门：否则下面每一条 e2e:goto 都只在登录门上打转，产出一堆相同截图
  await ensureLoggedIn();
  const dir = process.env.SHOT_DIR || path.join(process.cwd(), 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const list = [
    ['home', '01-首页-商务明亮'],
    ['region:1', '02-大区-字段统计'],
    ['post:1', '03-文档查看'],
    ['post:new:1', '04-文档编辑器'],
    ['taxonomy', '05-聚合管理'],
    ['search:合同', '06-搜索高亮'],
    ['settings', '07-设置'],
    ['about', '08-关于']
  ];
  await sleep(2200);
  for (const [cmd, name] of list) {
    state.win.webContents.send('e2e:goto', cmd);
    await sleep(1300);
    const img = await state.win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
    getLog().info(`[shot] ${name}`);
  }
  // 第 11 张：设置-数据加密分区
  state.win.webContents.send('e2e:goto', 'settings:security');
  await sleep(2000);
  const secImg = await state.win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, '11-设置-数据加密.png'), secImg.toPNG());
  getLog().info('[shot] 11-设置-数据加密');
  // 第 12 张：设置-操作日志（审计链）
  state.win.webContents.send('e2e:goto', 'settings:audit');
  await sleep(2000);
  const auditImg = await state.win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, '12-设置-操作日志-审计链.png'), auditImg.toPNG());
  getLog().info('[shot] 12-设置-操作日志-审计链');
  // 第 13 张：设置-运行日志
  state.win.webContents.send('e2e:goto', 'settings:runlog');
  await sleep(2000);
  const runlogImg = await state.win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, '13-设置-运行日志.png'), runlogImg.toPNG());
  getLog().info('[shot] 13-设置-运行日志');
  for (const theme of ['dark', 'wire']) {
    state.win.webContents.send('e2e:goto', 'theme:' + theme);
    state.win.webContents.send('e2e:goto', 'home');
    await sleep(1300);
    const img = await state.win.webContents.capturePage();
    const label = theme === 'dark' ? '09-首页-商务暗黑' : '10-首页-黑白线框';
    fs.writeFileSync(path.join(dir, `${label}.png`), img.toPNG());
    getLog().info(`[shot] ${label}`);
  }
  await sleep(400);
  require('electron').app.quit();
}

module.exports = { runShots };
