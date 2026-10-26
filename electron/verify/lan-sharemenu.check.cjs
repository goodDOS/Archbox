/**
 * 实机验证：局域共享详情页的导出入口是否已收进「分享」下拉。
 *
 * 走真实 UI 路径：登录 → 开启共享 → 选本机源大区 → 打开文档 → 检查详情条。
 * 不做静态断言 —— 静态断言只证明源码里写了 ShareMenu，证明不了它真的渲染出来。
 *
 * 用法：先在带 DISPLAY 的环境里启动
 *   xvfb-run -a ./node_modules/.bin/electron . --remote-debugging-port=9334 --no-sandbox &
 * 再运行本脚本（ATTACH=1）
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.CDP_PORT || 9334);
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0,
  fail = 0;
function ok(msg) {
  pass++;
  console.log('  ✓ ' + msg);
}
function bad(msg) {
  fail++;
  console.log('  ✗ ' + msg);
}
function assert(cond, msg) {
  cond ? ok(msg) : bad(msg);
}

async function cdp(path) {
  return new Promise((res, rej) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, r => {
        let d = '';
        r.on('data', c => {
          d += c;
        });
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on('error', rej);
  });
}

async function main() {
  let target = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const list = await cdp('/json/list');
      target = (list || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch (e) {}
  }
  if (!target) {
    console.log('无法连接 CDP（应用是否已启动？）');
    process.exit(1);
  }

  // Node 22 内置全局 WebSocket（WHATWG 事件模型），无需装 ws 依赖
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params) =>
    new Promise(res => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  console.log('\n[1] 登录');
  let inApp = false;
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    inApp = await evalJs("!!document.querySelector('.app-shell')").catch(() => false);
    if (inApp) break;
    await evalJs(`(function(){
      var rows=document.querySelectorAll('.user-row,.login-as,.pc');
      if(rows.length) rows[0].click();
      var ps=document.querySelectorAll('input[type=password]'); if(!ps.length) return;
      var el=ps[ps.length-1]; el.focus(); el.value='demo123456';
      el.dispatchEvent(new Event('input',{bubbles:true}));
      var bs=document.querySelectorAll('button');
      for(var i=0;i<bs.length;i++){ if(/进入|登录|确定/.test(bs[i].innerText||'')){ bs[i].click(); return; } }
    })()`).catch(() => {});
  }
  assert(inApp, '已进入主界面');
  if (!inApp) {
    process.exit(1);
  }

  console.log('\n[2] 开启局域共享并进入详情');
  await evalJs(`(function(){
    var nav=[].slice.call(document.querySelectorAll('a,button,.nav-item,.nav-row'));
    for(var i=0;i<nav.length;i++){
      var t=(nav[i].innerText||nav[i].title||'').trim();
      if(/局域共享/.test(t)){ nav[i].click(); return t; }
    }
    return null;
  })()`);
  await sleep(2500);

  // 开启共享面板 → 勾选「开启局域网共享」（SharePanel 的开关是 .switch 里的 checkbox，
  // 不是 button，按文字找按钮是找不到的 —— 这是第一版脚本卡住的原因）
  await evalJs(`(function(){
    var bs=[].slice.call(document.querySelectorAll('button'));
    for(var i=0;i<bs.length;i++){ if(/我的共享/.test(bs[i].innerText||'')){ bs[i].click(); return true; } }
    return false;
  })()`);
  await sleep(1200);
  const toggled = await evalJs(`(function(){
    var row=document.querySelector('.sp-switch');
    if(!row||!row.querySelector('input[type=checkbox]')) return 'no-switch';
    var cb=row.querySelector('input[type=checkbox]');
    if(cb.checked) return 'already-on';
    cb.click();
    return 'clicked';
  })()`);
  console.log('  · 共享开关：' + toggled);
  await sleep(2200);
  // 先确认开关真的生效了再往下走：第一版把「关闭共享」按钮也匹配成了 /^关闭$/，
  // 结果开启成功后又被自己关掉了，后面全部表现成「没有大区/没有文档」，
  // 排查成本极高。故此处显式读一次 checkbox 状态。
  const onNow = await evalJs(
    "(function(){var r=document.querySelector('.sp-switch');var c=r&&r.querySelector('input[type=checkbox]');return c?(c.checked?'on':'off'):'no-switch'})()"
  );
  console.log('  · 开关当前状态：' + onNow);
  assert(onNow === 'on', '★ 共享已真正开启（checkbox.checked=true）');

  // 勾选第一个共享大区（不开勾选的话本机源 regions 为空，列表拿不到文档）
  const regionChecked = await evalJs(`(function(){
    var cbs=[].slice.call(document.querySelectorAll('.sp-region input[type=checkbox], .sp-regions input[type=checkbox]'));
    if(!cbs.length) return 'no-region-checkbox:'+document.querySelectorAll('.sp-panel input[type=checkbox]').length;
    var n=0;
    for(var i=0;i<cbs.length;i++){ if(!cbs[i].checked){ cbs[i].click(); n++; } if(n>=2) break; }
    return 'checked-'+n;
  })()`);
  console.log('  · 大区勾选：' + regionChecked);
  await sleep(1800);

  // 关掉面板。注意：面板的关闭键是 .sp-x 图标按钮（只有 Icon、没有文字），
  // 按文案找按钮永远找不到 —— 结果面板没关、@close 没触发、onPanelClosed 里的
  // loadStatus() 也就没跑，页面 status 停在 false，看起来像"共享没开"。
  const closed = await evalJs(`(function(){
    var x=document.querySelector('.sp-x');
    if(x){ x.click(); return 'clicked .sp-x'; }
    return 'no .sp-x (面板可能已关)';
  })()`);
  console.log('  · 关闭面板：' + closed);
  await sleep(2500);
  // ★ 以主进程返回的共享状态为准 ★
  //   页面顶部那句「尚未开启共享」读的是 LanShare.vue 自己的 status，
  //   面板关闭后的刷新存在时序竞争（实测：主进程早已 enabled=true、
  //   3 个大区已勾选，页面却还显示「尚未开启」）。
  //   断言渲染层缓存的中间态会误报，所以这里直接问主进程这个唯一真相源，
  //   再手动触发一次「重新发现」让页面追上真实状态。
  const realState = await evalJs(
    "window.arch.lanStatus().then(function(s){return (s.enabled?'on':'off')+':'+((s.sharedRegions||[]).length)}).catch(function(e){return 'ERR:'+e.message})"
  );
  console.log('  · 主进程共享状态：' + realState);
  assert(/^on:\d+$/.test(realState), '★ 共享已开启且已勾选大区（主进程确认：' + realState + '）');
  // 触发「重新发现」刷新页面
  await evalJs(`(function(){
    var bs=[].slice.call(document.querySelectorAll('button'));
    for(var i=0;i<bs.length;i++){ if(/重新发现/.test(bs[i].innerText||'')){ bs[i].click(); return true; } }
    return false;
  })()`);
  await sleep(2500);
  const lanState = await evalJs(
    "(function(){var h=document.querySelector('.ls-toolbar');return h?h.innerText.replace(/\\s+/g,' ').trim():'(无工具条)'})()"
  );
  console.log('  · 共享页状态：' + lanState);
  assert(!/尚未开启共享/.test(lanState), '★ 页面已追上真实状态（不再显示「尚未开启共享」）');

  console.log('\n[3] 选大区 → 打开文档');
  // ★ 主动触发一次共享库同步并轮询 ★
  //   只读共享库（share.db）靠后台每 30 秒的自动同步 + needsSync 判定增量填充，
  //   刚勾完大区立刻拉 /api/regions 会拿到空列表（实测 share.db 仅 61KB）。
  //   这是产品的异步设计，不是缺陷 —— 脚本必须等它追上，而不是据此断言失败。
  const synced = await evalJs(`(function(){
    return window.arch.lanSyncNow().then(function(){ return 'synced' })
      .catch(function(e){ return 'ERR:'+e.message });
  })()`);
  console.log('  · 触发共享同步：' + synced);
  let regionInfo = { n: 0, list: [] };
  for (let i = 0; i < 8; i++) {
    await sleep(1200);
    regionInfo = await evalJs(`(function(){
      var rs=[].slice.call(document.querySelectorAll('.src-region'));
      return {n:rs.length,list:rs.map(function(e){return e.innerText.replace(/\\s+/g,' ').trim()}).slice(0,4)};
    })()`);
    if (regionInfo.n > 0) break;
    // 同步可能还没追上，让页面重新发现一次
    await evalJs(`(function(){
      var hs=[].slice.call(document.querySelectorAll('.src-head'));
      for(var i=0;i<hs.length;i++){ if(/本机/.test(hs[i].innerText||'')){ hs[i].click(); return true; } }
      return false;
    })()`);
    await sleep(900);
  }
  console.log('  · 大区：' + JSON.stringify(regionInfo));
  assert(regionInfo.n > 0, '★ 本机源下列出了可浏览的大区');
  await evalJs(`(function(){
    var rs=[].slice.call(document.querySelectorAll('.src-region'));
    if(rs.length) rs[0].click(); return rs.length;
  })()`);
  await sleep(2500);
  const cards = await evalJs("document.querySelectorAll('.ls-main .pc').length");
  console.log('  · 共享文档卡片数：' + cards);
  assert(cards > 0, '★ 该大区下有可浏览的共享文档');
  await evalJs(`(function(){
    var cs=[].slice.call(document.querySelectorAll('.ls-main .pc'));
    if(cs.length) cs[0].click(); return cs.length;
  })()`);
  await sleep(2200);

  const inDetail = await evalJs("!!document.querySelector('.post-read')");
  console.log('  · 进入详情：' + inDetail);

  console.log('\n[4] ★ 核心断言：详情条按钮构成');
  const barText = await evalJs(
    "[].slice.call(document.querySelectorAll('.pr-bar button')).map(function(b){return (b.innerText||b.title||'').trim()}).join(' | ')"
  );
  console.log('  · 按钮：' + barText);

  assert(inDetail, '进入共享文档详情');
  // ★ 前置守卫：没进详情时，「页面上没有导出按钮」是必然成立的空断言（假通过）。
  //   必须先确认确实渲染出了详情条，再往下断言按钮构成。
  if (!inDetail) {
    fail++;
    console.log('  ⛔ 未进入详情，后续按钮断言全部跳过（否则是空断言假通过）');
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(1);
  }
  assert(!/导出/.test(barText), '★ 详情条上没有独立的「导出」按钮（实测：' + barText + '）');
  assert(/分享/.test(barText), '★ 详情条上有「分享」按钮');

  console.log('\n[5] 点开分享下拉');
  await evalJs(`(function(){
    var bs=[].slice.call(document.querySelectorAll('.pr-bar button'));
    for(var i=0;i<bs.length;i++){ if(/分享/.test(bs[i].innerText||bs[i].title||'')){ bs[i].click(); return true; } }
    return false;
  })()`);
  await sleep(700);
  const popText = await evalJs(
    "[].slice.call(document.querySelectorAll('.share-popup .share-option')).map(function(e){return (e.innerText||'').trim()}).join(' | ')"
  );
  console.log('  · 下拉项：' + popText);
  assert(/导出 Markdown/.test(popText), '★ 下拉里有「导出 Markdown」');
  assert(/导出 PDF/.test(popText), '★ 下拉里有「导出 PDF」');
  const orderOk = popText.indexOf('导出 Markdown') < popText.indexOf('导出 PDF');
  assert(orderOk, '★ 顺序与设置页一致（Markdown 在前）');

  // 截图留证
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync(path.join(OUT, '局域共享-详情导出收进分享-Beta.246.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('  · 已截图：screenshots/局域共享-详情导出收进分享-Beta.246.png');
  }

  try {
    ws.close();
  } catch (e) {
    /* 已断开 */
  }
  // 不杀进程：由外层 shell 管理（避免连带杀掉 xvfb 会话）
  await sleep(400);
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
