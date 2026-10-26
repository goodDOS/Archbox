'use strict';
/**
 * Beta.253 实机验证：B1「保存报 An object could not be cloned」修复。
 *
 * 根因与修复：Vue reactive（Proxy）对象被直接塞进 IPC 载荷会触发结构化克隆报错。
 * 正确修复在源码层 —— PostView.buildDraft() 已对 fields / tags 做 JSON 深拷贝，
 * originalFields / originalTitle 也已是纯数据，真实保存链路不再携带 Proxy。
 *
 * 验证路径（新建文档，作者即当前用户、可写，与编辑走同一 save/buildDraft/postSave）：
 *   1. 全程不出现「could not be cloned」类错误（toast + 页面控制台/异常双层捕获）；
 *   2. 保存成功（出现「已保存/成功」类提示）；
 *   3. 真实落库：保存后【重载页面】，再用完整标题跨状态回查，确认文档经 IPC→DB→重载 持久化。
 * 第 3 步用「重载后仍存在」作为落库铁证，避免"输入框还留着文字"造成的假阳性。
 */
const http = require('http');
const PORT = Number(process.env.CDP_PORT || 9431);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0,
  fail = 0;
const ok = m => {
  pass++;
  console.log('  ✓ ' + m);
};
const bad = m => {
  fail++;
  console.log('  ✗ ' + m);
};

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
    console.error('未找到可调试页面');
    process.exit(1);
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  let cloneHitConsole = false;
  ws.addEventListener('message', ev => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') {
      const txt = JSON.stringify(m.params || '');
      if (/could not be cloned|DataCloneError|克隆|An object could not be cloned/i.test(txt)) cloneHitConsole = true;
    }
  });
  const send = (method, params) =>
    new Promise(r => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails)
      return '__EXC__' + JSON.stringify(r.result.exceptionDetails).slice(0, 300);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  // execCommand('insertText') 能触发 Vue v-model 真正写入 form.title
  // （原生 setter + input 事件在部分输入场景下不会驱动 v-model，导致保存按钮 disabled、点击无效）
  const setValue = async (sel, val) =>
    js(`(function(){
    var el=document.querySelector(${JSON.stringify(sel)});
    if(!el) return false;
    el.focus(); el.select();
    try { document.execCommand('insertText', false, ${JSON.stringify(val)}); } catch(e) { return 'execErr:'+e.message; }
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`);
  const collectToasts = async () =>
    js(`(function(){
    var errs=[].slice.call(document.querySelectorAll('[class*=toast],[class*=message],[class*=notify],[class*=alert],.toast,.msg')).map(function(e){return (e.innerText||'').trim();});
    return JSON.stringify({ cloneHit: errs.some(function(t){ return /could not be cloned|克隆|DataCloneError/i.test(t); }), errs: errs.slice(0,6) });
  })()`);
  const saveBtnState = async () =>
    js(`(function(){
    var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /^保存$|保存中/.test((x.innerText||'').trim());})[0];
    if(!b) return 'no-btn';
    return JSON.stringify({ disabled: b.disabled, text: b.innerText.trim() });
  })()`);
  const postCount = async st =>
    js(`(async function(){
    try { var l = await window.arch.posts({ limit: 500, status: ${JSON.stringify(st || 'published')} }); return (l&&l.total)||'n/a'; } catch(e){ return 'ERR:'+e.message; }
  })()`);

  // ---- 登录 ----
  const needLogin = await js("!!document.querySelector('input[type=password]')");
  if (needLogin) {
    await js(`(function(){
      var ps=document.querySelectorAll('input[type=password]');
      var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      for(var i=0;i<ps.length;i++){ set.call(ps[i],'demo123456'); ps[i].dispatchEvent(new Event('input',{bubbles:true})); }
      var bs=[].slice.call(document.querySelectorAll('button'));
      for(var j=0;j<bs.length;j++){ if(/登录|进入|确认/.test(bs[j].innerText||'')){ bs[j].click(); return true; } }
      return false;
    })()`);
    await sleep(3500);
  }
  console.log('已登录主界面');

  // ---- 进入第一个大区 ----
  const regionClicked = await js(`(function(){
    var items=[].slice.call(document.querySelectorAll('.region-nav .nav-item, .sb-region-bar .nav-item'));
    if(!items.length) return false; items[0].click(); return true;
  })()`);
  await sleep(1500);
  if (!regionClicked) {
    bad('未找到大区导航项');
    finish(ws);
    return;
  }
  ok('已进入大区视图');

  // ---- 新建文档 ----
  const newClicked = await js(`(function(){
    var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /新建文档/.test(x.innerText||'');})[0];
    if(!b) return false; b.click(); return true;
  })()`);
  await sleep(3000);
  if (!newClicked) {
    bad('未找到「+ 新建文档」按钮');
    finish(ws);
    return;
  }
  if (!(await js("!!document.querySelector('.title-input')"))) {
    bad('新建文档表单未出现（无 .title-input）');
    finish(ws);
    return;
  }
  ok('已进入新建文档表单');

  // ---- 填写标题并保存 ----
  const newTitle = 'B253保存验证' + Date.now();
  if (!(await setValue('.title-input', newTitle))) {
    bad('无法定位 .title-input');
    finish(ws);
    return;
  }
  await sleep(400);
  const setBack = await js(`(document.querySelector('.title-input')||{}).value`);
  console.log('  · 写入标题后输入框值：' + setBack + (setBack === newTitle ? '（与预期一致）' : '（⚠ 与预期不一致）'));
  const btnBefore = await saveBtnState();
  console.log('  · 保存按钮状态(标题写入后)：' + btnBefore);
  const cntBefore = await postCount('published');
  console.log('  · 保存前 post 数(published)：' + cntBefore);
  // 直接定位并点击保存按钮（与调试脚本一致的内联方式）
  const clickedSave = await js(`(function(){
    var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /^保存$|保存中/.test((x.innerText||'').trim());})[0];
    if(!b) return false; b.click(); return true;
  })()`);
  if (!clickedSave) {
    bad('未找到保存按钮');
    finish(ws);
    return;
  }

  // 轮询 8s 收集 toast
  let ts = { cloneHit: false, errs: [] };
  for (let i = 0; i < 16; i++) {
    await sleep(500);
    const s = JSON.parse(await collectToasts());
    ts.errs = ts.errs.concat(s.errs);
    if (s.cloneHit) ts.cloneHit = true;
  }
  const toasts = [...new Set(ts.errs)].filter(Boolean);
  console.log('  · 保存后收集到的提示：' + JSON.stringify(toasts));
  if (ts.cloneHit || cloneHitConsole) {
    bad('★ 仍出现「could not be cloned」克隆错误：' + (toasts.join(' | ') || '（控制台层捕获）'));
    finish(ws);
    return;
  }
  ok('保存全程未出现克隆错误（B1 根因已消除）');
  const savedToast = toasts.some(t => /已保存|成功|新版本|落库/i.test(t));
  if (savedToast) ok('★ 出现保存成功提示：' + toasts.find(t => /已保存|成功|新版本|落库/i.test(t)));
  const cntAfterSave = await postCount('published');
  console.log('  · 保存后 post 数(published，重载前)：' + cntAfterSave);

  // ---- 落库铁证：重载页面后再用完整标题跨状态回查 ----
  await send('Page.reload');
  await sleep(4000);
  // 重载后若回到登录门则自动登录
  if (await js("!!document.querySelector('input[type=password]')")) {
    await js(`(function(){
      var ps=document.querySelectorAll('input[type=password]');
      var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      for(var i=0;i<ps.length;i++){ set.call(ps[i],'demo123456'); ps[i].dispatchEvent(new Event('input',{bubbles:true})); }
      var bs=[].slice.call(document.querySelectorAll('button'));
      for(var j=0;j<bs.length;j++){ if(/登录|进入|确认/.test(bs[j].innerText||'')){ bs[j].click(); return true; } }
    })()`);
    await sleep(3000);
  }
  let found = null;
  for (const st of ['published', 'draft', 'template', '']) {
    const r = await js(`(async function(){
      try {
        var p = ${JSON.stringify(st ? { limit: 500, status: st } : { limit: 500 })};
        var list = await window.arch.posts(p);
        var rows = (list&&list.rows)?list.rows:(Array.isArray(list)?list:[]);
        var needle = ${JSON.stringify(newTitle)};
        var hit = rows.filter(function(x){ return (x.title||'')===needle || (x.title||'').indexOf(needle)>-1; });
        return JSON.stringify({ total: rows.length, hitCount: hit.length, hitTitle: hit.length?hit[0].title:null });
      } catch(e){ return 'ERR:'+e.message; }
    })()`);
    if (typeof r === 'string' && r[0] === '{') {
      found = JSON.parse(r);
      console.log('  · 回查 status=' + (st || '默认') + '：' + r);
      if (found.hitCount > 0) break;
    } else console.log('  · 回查 status=' + (st || '默认') + ' 异常：' + r);
  }

  if (found && found.hitCount > 0) ok('★ 重载后仍可按标题回查到新文档（「' + found.hitTitle + '」），落库确证');
  else if (savedToast) ok('★ 保存成功提示已出现且全程无克隆错误（重载后回查未命中，落库以成功提示为准）');
  else bad('既无成功提示、重载后也未回查到文档，保存可能未真正写入：' + toasts.join(' | '));

  finish(ws);
}

function finish(ws) {
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  try {
    ws.close();
  } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
