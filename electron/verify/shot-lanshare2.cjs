/**
 * 走到局域共享详情页并截图（验证按钮形态）。
 *
 * 【与第一版的差别】第一版卡在「大区数 0 / 卡片数 0」，但它从未验证
 *   请求本身是否成功 —— 只是反复点 DOM 然后断言「没有大区」。
 *   本版把链路拆开逐段取证：
 *     共享状态 → 主进程 token → /api/regions（直连） → /api/posts（直连）
 *     → 页面 DOM 是否渲染 → 进详情 → 截图
 *   哪一段断了立刻能看出来，不再「全流程走完却不知道哪一步空」。
 */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.CDP_PORT || 9405);
const OUT = path.join(__dirname, '..', '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdp(p) {
  return new Promise((res, rej) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: p }, r => {
        let d = '';
        r.on('data', c => (d += c));
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
  const list = await cdp('/json/list');
  const t = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
  if (!t) {
    console.log('无可用页面');
    process.exit(1);
  }

  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params) =>
    new Promise(r => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
  const ev = (p, m) => send(m || 'Runtime.evaluate', p);
  const js = async expr => {
    const r = await ev({ expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails)
      return '__EXC__' + JSON.stringify(r.result.exceptionDetails).slice(0, 300);
    return r.result && r.result.result ? r.result.result.value : null;
  };

  // ---------- 1. 登录 ----------
  console.log('\n[1] 登录');
  let inApp = await js("!!document.querySelector('.app-shell')");
  if (!inApp) {
    await js(`(function(){
      var ps=document.querySelectorAll('input[type=password]');
      var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      for(var i=0;i<ps.length;i++){ set.call(ps[i],'demo123456'); ps[i].dispatchEvent(new Event('input',{bubbles:true})); }
      var bs=[].slice.call(document.querySelectorAll('button'));
      for(var j=0;j<bs.length;j++){ if(/登录|进入|确认/.test(bs[j].innerText||'')){ bs[j].click(); return true; } }
      return false;
    })()`);
    await sleep(3500);
    inApp = await js("!!document.querySelector('.app-shell')");
  }
  console.log('  · 进入主界面：' + inApp);
  if (!inApp) {
    console.log('登录失败');
    process.exit(1);
  }

  // ---------- 2. 开启共享 + 勾大区（走真实面板） ----------
  // ★ 顺序陷阱：「我的共享」按钮只存在于「局域共享」页面内部，
  //   在首页找永远是 no-switch、后面全链路空转（第一版就栽在这）。
  //   必须先导航到该页，再开面板。
  console.log('\n[2] 开启共享');
  const navOk = await js(`(function(){
    var ns=[].slice.call(document.querySelectorAll('.nav-item'));
    for(var i=0;i<ns.length;i++){ if(/局域共享/.test(ns[i].innerText||'')){ ns[i].click(); return true; } }
    return false;
  })()`);
  console.log('  · 导航到局域共享页：' + navOk);
  await sleep(2200);
  const openPanel = await js(`(function(){
    var bs=[].slice.call(document.querySelectorAll('button'));
    for(var i=0;i<bs.length;i++){ if(/我的共享/.test(bs[i].innerText||'')){ bs[i].click(); return true; } }
    return false;
  })()`);
  console.log('  · 打开共享面板：' + openPanel);
  await sleep(1800);
  // ★ 幂等：SharePanel 是 v-if 挂载的，重跑脚本时面板 DOM 可能需要一帧才出现。
  //   先等它真的在 DOM 里，再去点开关 —— 否则 querySelector('.sp-switch') 拿到 null，
  //   会被误判成「没有开关」而整条链路空转（第一版重跑时正是如此）。
  for (let i = 0; i < 10; i++) {
    const has = await js("!!document.querySelector('.sp-switch')");
    if (has) break;
    await sleep(400);
  }
  const sw = await js(`(function(){
    var r=document.querySelector('.sp-switch');
    if(!r) return 'no-switch';
    var cb=r.querySelector('input[type=checkbox]');
    if(!cb) return 'no-cb';
    if(cb.checked) return 'already-on';
    cb.click(); return 'clicked';
  })()`);
  console.log('  · 开关：' + sw);
  await sleep(2500);
  const regionChk = await js(`(function(){
    var cbs=[].slice.call(document.querySelectorAll('.sp-rows input[type=checkbox], .sp-region input[type=checkbox], .sp-panel input[type=checkbox]'));
    var n=0; for(var i=0;i<cbs.length;i++){ if(!cbs[i].checked){ cbs[i].click(); n++; } }
    return cbs.length + ' 个复选框，勾选 ' + n;
  })()`);
  console.log('  · 大区勾选：' + regionChk);
  await sleep(2000);
  const closed = await js(
    `(function(){ var x=document.querySelector('.sp-x'); if(x){ x.click(); return 'clicked .sp-x'; } return 'no .sp-x（面板可能已关）'; })()`
  );
  console.log('  · 关闭面板：' + closed);
  await sleep(3000);
  // 面板关闭那一刻 loadLocal 会被重新调用；这里再确认本机源的大区有没有落地
  const afterClose = await js(`(function(){
    var rs=[].slice.call(document.querySelectorAll('.src-region'));
    return JSON.stringify({n:rs.length});
  })()`);
  console.log('  · 关面板后本机源大区：' + afterClose);

  // ---------- 3. ★ 关键：逐段验证共享链路 ----------
  console.log('\n[3] 共享链路逐段取证');
  const st = await js(
    `window.arch.lanStatus().then(function(s){return JSON.stringify({enabled:s.enabled,regions:(s.sharedRegions||[]).length,token:!!s.token,port:s.port,allowCopy:s.allowCopy})}).catch(function(e){return 'ERR:'+e.message})`
  );
  console.log('  (a) 主进程共享状态：' + st);

  const sync = await js(
    `window.arch.lanSyncNow().then(function(r){return JSON.stringify(r)}).catch(function(e){return 'ERR:'+e.message})`
  );
  console.log('  (b) 触发同步：' + sync);
  await sleep(2500);

  // 直连本机 HTTP 服务，确认服务端真有数据（绕开页面渲染）
  const direct = await js(`(async function(){
    var s = await window.arch.lanStatus();
    var base = 'http://127.0.0.1:' + (s.port||47373);
    async function get(p){ try { return await window.arch.lanRequest({url: base+p, token: s.token}); } catch(e){ return 'ERR:'+e.message; } }
    var regs = await get('/api/regions');
    var out = { regs: Array.isArray(regs) ? regs.length : regs };
    if (Array.isArray(regs) && regs.length) {
      var posts = await get('/api/posts?regionId=' + regs[0].id + '&limit=5&offset=0');
      out.rid = regs[0].id;
      out.regionName = regs[0].name;
      out.total = posts && posts.total;
      out.first = posts && posts.list && posts.list[0] ? {id: posts.list[0].id, title: String(posts.list[0].title||'').slice(0,20)} : null;
    }
    return JSON.stringify(out);
  })()`);
  console.log('  (c) 直连 /api/regions + /api/posts：' + direct);

  // ---------- 4. 走页面 UI ----------
  // （第 2 步已导航到本页，这里只需确认本机源展开）
  console.log('\n[4] 页面 UI 路径');
  const headState = await js(`(function(){
    var hs=[].slice.call(document.querySelectorAll('.src-head'));
    for(var i=0;i<hs.length;i++){ if(/本机/.test(hs[i].innerText||'')){ hs[i].click(); return 'clicked'; } }
    return 'no-local-head';
  })()`);
  console.log('  · 本机源展开：' + headState);
  await sleep(2800);

  const domRegions = await js(`(function(){
    var rs=[].slice.call(document.querySelectorAll('.src-region'));
    return JSON.stringify({n:rs.length, list:rs.map(function(e){return e.innerText.replace(/\\s+/g,' ').trim().slice(0,20)})});
  })()`);
  console.log('  · DOM 大区：' + domRegions);

  if (JSON.parse(domRegions).n > 0) {
    await js(
      `(function(){ var rs=[].slice.call(document.querySelectorAll('.src-region')); if(rs.length) rs[0].click(); return true; })()`
    );
    await sleep(2800);
    const cardN = await js("document.querySelectorAll('.ls-main .pc').length");
    console.log('  · DOM 卡片数：' + cardN);
    if (cardN > 0) {
      await js(
        `(function(){ var cs=[].slice.call(document.querySelectorAll('.ls-main .pc')); if(cs.length) cs[0].click(); return true; })()`
      );
      await sleep(2800);
    }
  }

  // ---------- 5. 详情条取证 + 截图 ----------
  const inDetail = await js("!!document.querySelector('.post-read')");
  const bar = await js(`(function(){
    var b=document.querySelector('.pr-bar');
    if(!b) return '(无详情条)';
    return [].slice.call(b.querySelectorAll('button')).map(function(x){
      var t=(x.innerText||'').trim();
      return t || ('[' + (x.getAttribute('aria-label')||x.getAttribute('title')||'?') + ']');
    }).join(' | ');
  })()`);
  console.log('\n[5] 详情页');
  console.log('  · 进入详情：' + inDetail);
  console.log('  · 详情条按钮：' + bar);

  const shot = await ev({ format: 'png', captureBeyondViewport: false }, 'Page.captureScreenshot');
  const name = inDetail ? '共享详情-按钮形态-Beta.247.png' : '共享详情-未进详情.png';
  fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.result.data, 'base64'));
  console.log('  · 截图：screenshots/' + name);

  try {
    ws.close();
  } catch (e) {}
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
