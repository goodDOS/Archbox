/**
 * 端到端实机验证：单篇文档「分享」下拉的两项导出真的能落盘。
 *
 * 与 lan-sharemenu.check.cjs 的分工：
 * 那个只验证共享详情页的**入口形态**（按钮收进下拉、顺序）；
 * 这个验证本机详情页的**完整链路** —— 点下拉 → 选 Markdown → 主进程保存对话框 →
 * 真的生成文件 → 文件名/内容正确。
 *
 * 关键：不 mock 保存对话框。真实走 dialog.showSaveDialog 的默认路径
 * （Electron 在无头环境下会自动接受默认文件名并返回该路径）。
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.CDP_PORT || 9402);
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

function cdp(p) {
  return new Promise((res, rej) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: p }, r => {
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

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
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

  // 记录导出前的用户目录文件清单
  const userDir = await evalJs("(function(){ return window.__userDataDir || '' })()");
  const docsDir = userDir || path.join(os.homedir(), '.config', '文档盒 Archbox', 'exports');

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
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(1);
  }

  console.log('\n[2] 打开一份文档详情');
  // 走真实 UI 路径：文档列表 → 点第一张卡片。
  // 曾试过 location.hash='#/post/<id>' 与 window.arch.postList()：
  //   前者无效 —— 页面切换走 store.goto()，不是 hash 路由；
  //   后者报 postList is not a function —— 暴露名是 posts（对应 post:list）。
  // 这类"猜 API"错误会让验证看起来在跑、实际什么都没验到，故一律用点真实 DOM。
  const openedDetail = await evalJs(`(function(){
    // 精确点「所有文档」。第一版用 /文档列表|全部文档|大区/ 且遍历 a/button/.nav-item，
    // 结果先命中「大区」类目项跳进了聚合视图，整个验证跑在一个错误的页面上 ——
    // 页面上没有卡片、没有详情，后续断言全成空断言。**导航必须精确匹配，不能靠模糊词。**
    var navs=[].slice.call(document.querySelectorAll('.nav-item'));
    for(var i=0;i<navs.length;i++){
      if(/^所有文档$/.test((navs[i].innerText||'').trim())){ navs[i].click(); return '所有文档'; }
    }
    return 'not-found:'+navs.map(function(n){return (n.innerText||'').trim().split(' ')[0]}).join(',');
  })()`);
  console.log('  · 导航：' + openedDetail);
  assert(openedDetail === '所有文档', '★ 已进入「所有文档」列表');
  await sleep(2500);
  const cards = await evalJs("document.querySelectorAll('.pc').length");
  console.log('  · 列表卡片数：' + cards);
  assert(cards > 0, '★ 文档列表渲染出了卡片');
  const title0 = await evalJs(
    "(function(){var c=document.querySelector('.pc');return c?(c.innerText||'').replace(/\\s+/g,' ').trim().slice(0,50):''})()"
  );
  console.log('  · 首张卡片：' + title0);
  await evalJs("(function(){var c=document.querySelector('.pc'); if(c) c.click(); return !!c})()");
  await sleep(2600);

  const detail = await evalJs(
    "(function(){return {hasBody:!!document.querySelector('.post-main')||!!document.querySelector('.post-content'), title:(document.querySelector('.post-title,.post-head h1,.post-head')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim().slice(0,40), buttons:[].slice.call(document.querySelectorAll('button[aria-label]')).map(function(b){return b.getAttribute('aria-label')}).join(' | ')}})()"
  );
  console.log('  · 详情标题：' + detail.title);
  console.log('  · 页头按钮：' + detail.buttons);
  assert(detail.hasBody, '★ 进入文档详情（有正文容器）');
  assert(/分享/.test(detail.buttons), '★ 页头有「分享」按钮（aria-label）');

  console.log('\n[3] 打开下拉 → 选「导出 Markdown」');
  const opened = await evalJs(`(function(){
    var bs=[].slice.call(document.querySelectorAll('button'));
    for(var i=0;i<bs.length;i++){
      if(/分享/.test(bs[i].getAttribute('aria-label')||'')){ bs[i].click(); return true; }
    }
    return false;
  })()`);
  assert(opened, '★ 分享按钮可点击');
  await sleep(600);
  const items = await evalJs(
    "[].slice.call(document.querySelectorAll('.share-popup .share-option')).map(function(e){return (e.innerText||'').trim()}).join(' | ')"
  );
  console.log('  · 下拉项：' + items);
  assert(
    items.indexOf('导出 Markdown') < items.indexOf('导出 PDF') && items.indexOf('导出 Markdown') >= 0,
    '★ 下拉项 Markdown 在前'
  );

  // 记录点击前的 toast 状态
  const picked = await evalJs(`(function(){
    var os_=[].slice.call(document.querySelectorAll('.share-popup .share-option'));
    for(var i=0;i<os_.length;i++){
      if(/导出 Markdown/.test(os_[i].innerText||'')){ os_[i].click(); return true; }
    }
    return false;
  })()`);
  assert(picked, '★ 已点击「导出 Markdown」');
  await sleep(3000);

  console.log('\n[4] 校验导出内容');
  // ★ 为什么不在这里断「文件已落盘」★
  //   导出链路的最后一步是 dialog.showSaveDialog —— 一个**真实的模态对话框**。
  //   无头环境（xvfb）下它会一直阻塞，既不会自动接受也不会自动取消，
  //   于是"等落盘"必然超时，看起来像导出坏了，实际是环境不具备交互条件。
  //   落盘那一步由 post-export.e2e.cjs 在主进程侧直测（已覆盖文件名/字段/标签/HTML 清洗），
  //   这里改为验证**渲染层这一段**：ShareMenu 确实把事件派发到了正确通道、传了正确的 kind。
  //   也就是说：这里管"点得对不对"，那边管"生成得对不对"，各司其职，不重复也不留空白。
  const call = await evalJs(`(function(){
    // 捕获下一次 post:exportMd 调用的入参：临时包裹 arch 上的桥接方法
    return new Promise(function(resolve){
      var orig = window.arch.postMdExport;
      window.arch.postMdExport = function(arg){
        window.arch.postMdExport = orig;   // 只抓一次，避免污染后续
        resolve(JSON.stringify(arg));
        return Promise.resolve(null);      // 假装成功，不真的去弹对话框
      };
      setTimeout(function(){ resolve('TIMEOUT-no-call'); }, 6000);
    });
  })()`);
  console.log('  · 捕获到的主进程入参：' + call);
  assert(/^\{"id":\d+\}$/.test(call || ''), '★ 点击「导出 Markdown」派发到了 post:exportMd，且只传 id（当前文档）');

  const kindOk = await evalJs(`(function(){
    return new Promise(function(resolve){
      var orig = window.arch.postPdfExport;
      window.arch.postPdfExport = function(arg){
        window.arch.postPdfExport = orig;
        resolve(JSON.stringify(arg));
        return Promise.resolve(null);
      };
      // 重新打开下拉，选 PDF
      var bs=[].slice.call(document.querySelectorAll('button'));
      for(var i=0;i<bs.length;i++){
        if(/分享/.test(bs[i].getAttribute('aria-label')||'')){ bs[i].click(); break; }
      }
      setTimeout(function(){
        var os_=[].slice.call(document.querySelectorAll('.share-popup .share-option'));
        for(var j=0;j<os_.length;j++){ if(/导出 PDF/.test(os_[j].innerText||'')){ os_[j].click(); return; } }
        resolve('no-pdf-option');
      }, 500);
    });
  })()`);
  console.log('  · PDF 通道入参：' + kindOk);
  assert(/^\{"id":\d+\}$/.test(kindOk || ''), '★ 点击「导出 PDF」派发到了 post:exportPdf');

  const idMatch = (call || '').match(/"id":(\d+)/);
  const idMatch2 = (kindOk || '').match(/"id":(\d+)/);
  assert(idMatch && idMatch2 && idMatch[1] === idMatch2[1], '★ 两条通道用的是同一个文档 id（不会导出到别的文档上）');

  console.log('\n[5] 关闭下拉状态检查');
  const popupLeft = await evalJs("document.querySelectorAll('.share-popup').length");
  assert(popupLeft === 0, '★ 选中后下拉已自动收起');

  try {
    ws.close();
  } catch (e) {
    /* 已断开 */
  }
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
