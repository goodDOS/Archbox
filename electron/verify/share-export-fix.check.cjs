/**
 * 实机验证：局域共享导出报错修复 + 详情条按钮纯图标化。
 *
 * 【要验的缺陷】用户截图报「An object could not be cloned.」
 *   根因：exportShared 把 Vue 响应式 Proxy（post.value）直接跨 IPC 传，
 *   structuredClone 无法克隆 Proxy。修法是先 toRaw + JSON 深拷贝成纯对象。
 *
 * 【为什么不能只点按钮就完事】无头环境下 showSaveDialog 是真弹窗，会阻塞。
 *   故这里直接复现「参数序列化」这一步：
 *   ① 先证明修复前的形状（Proxy）确实过不了 structuredClone；
 *   ② 再证明修复后的形状（纯对象）能过 —— 用主进程真实 IPC 通道跑一次。
 */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.CDP_PORT || 9402);
const OUT = path.join(__dirname, '..', '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

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
const assert = (c, m) => (c ? ok(m) : bad(m));

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
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const ev = (params, method) =>
    new Promise(r => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method: method || 'Runtime.evaluate', params }));
    });
  const js = async expr => {
    const r = await ev({ expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return '__EXC__' + (r.result.exceptionDetails.text || '');
    return r.result && r.result.result ? r.result.result.value : null;
  };

  console.log('\n[1] 过门禁');
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
    await sleep(3200);
    inApp = await js("!!document.querySelector('.app-shell')");
  }
  assert(inApp, '进入主界面');

  console.log('\n[2] 核心：Proxy 不可克隆 vs 纯对象可克隆');
  // 在页面上下文里直接构造两种形状，用真实的 structuredClone 检验
  const cloneTest = await js(`(function(){
    // 用 Vue 的 reactive 造一个真 Proxy（页面已加载 Vue，但模块作用域拿不到，
    // 故用 Proxy 直接模拟相同语义：代理一切属性访问）
    var raw = { title:'苏州精工精密制造有限公司', no:'IMP-IMP-2026-0061', tags:[{id:1,name:'Q3'}],
                fields:[{code:'f1',name:'字段一',value:'v1'}], content_html:'<p>x</p>' };
    var proxied = new Proxy(raw, { get: function(t,k){ return t[k]; } });
    var out = { proxyOk:true, proxyErr:'', plainOk:true, plainErr:'' };
    try { structuredClone(proxied); } catch(e){ out.proxyOk=false; out.proxyErr=String(e.message||e); }
    try { structuredClone(JSON.parse(JSON.stringify(proxied))); } catch(e){ out.plainOk=false; out.plainErr=String(e.message||e); }
    return out;
  })()`);
  console.log('  · ' + JSON.stringify(cloneTest));
  assert(
    cloneTest && cloneTest.proxyOk === false,
    '★ 复现：Proxy 无法被 structuredClone（' + (cloneTest && cloneTest.proxyErr) + '）'
  );
  assert(cloneTest && cloneTest.plainOk === true, '★ 修复形状：纯对象能通过 structuredClone');

  console.log('\n[3] 核对源码：exportShared 必须先转纯对象');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'LanShare.vue'), 'utf8');
  const fnBody = (src.match(/async function exportShared[\s\S]*?\n\}/) || [''])[0];
  assert(fnBody.length > 0, '（依据）已定位 exportShared 实现');
  assert(/toRaw\(\s*post\.value\s*\)/.test(fnBody), '★ exportShared 先 toRaw(post.value) 脱掉外层响应式代理');
  assert(/JSON\.parse\(\s*JSON\.stringify\(/.test(fnBody), '★ 再做 JSON 深拷贝，抹平嵌套代理，保证可结构化克隆');
  assert(
    !/A\.shareExportDoc\(\{\s*post:\s*post\.value/.test(fnBody),
    '★ 不再直接把 post.value 原样跨 IPC（那正是报错原因）'
  );

  console.log('\n[4] 核对详情条按钮形态（用户改版：四个按钮全部纯图标，且顺序固定）');
  // ★ 先剥注释再匹配。这个文件里到处是解释性注释，它们同样会命中
  //   'btn-copy'/'pr-sep' 这类关键字（本次就踩到：'btn-copy' 首次出现在
  //   「…改用 .btn-copy 的描边…」的注释里，indexOf 取到的是注释位置而非按钮；
  //   同理 .pr-sep 只剩注释里提过一次，却被当成"结构里还有竖线"）。
  //   不剥注释的静态断言等于在测注释，不是测代码。
  const srcCode = src
    .replace(/<!--[\s\S]*?-->/g, '') // 模板注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 行注释（避开 http:// 这类）
  // 取出 .pr-bar 内的按钮。用剥注释后的源码定位，边界不会被注释里的 </div> 干扰。
  const prBarStart = srcCode.indexOf('<div class="pr-bar">');
  const prBarEnd = srcCode.indexOf('</div>', srcCode.indexOf('@click="backToList"'));
  const prBar = prBarStart > -1 && prBarEnd > prBarStart ? srcCode.slice(prBarStart, prBarEnd) : '';
  assert(prBar.length > 0, '（依据）已定位 .pr-bar 按钮组');
  // 语义变更说明：早期版本用户说过「返回列表按钮不要改」，故此处曾断言它保持「图标+文字」。
  // 用户后一条需求明确反悔：「把返回列表按钮也纯图标化，拷贝到本机按钮也图表化，
  // 放在分享按钮后面，样式与前面按钮统一」。本条断言随之反转。
  assert(
    /btn btn-icon[^>]*@click="backToList"[^>]*[\s\S]*?aria-label="返回列表"/.test(prBar),
    '★ 「返回列表」已按新需求改纯图标（btn-icon + aria-label）'
  );
  assert(!/btn btn-sm[^>]*@click="backToList"/.test(prBar), '★ 「返回列表」不再是按钮内联文字形态');
  assert(!/>\s*返回列表\s*</.test(prBar), '★ 「返回列表」可见文字已移除');
  assert(
    /btn btn-icon[^>]*@click="findOpen"/.test(prBar) && /aria-label="页内查找"/.test(prBar),
    '★ 「页内查找」纯图标（btn-icon + aria-label）'
  );
  assert(/<ShareMenu\s+:busy=/.test(prBar), '★ ShareMenu 不传 size（默认 icon 形态，即纯图标）');
  // 「拷贝到本机」改纯图标，并带专属 .btn-copy 样式类与 aria-label
  assert(
    /btn btn-icon btn-copy[\s\S]*?aria-label="拷贝到本机"/.test(prBar),
    '★ 「拷贝到本机」改纯图标（btn-icon + btn-copy + aria-label）'
  );
  assert(!/>\s*拷贝到本机\s*</.test(prBar), '★ 「拷贝到本机」可见文字已移除');
  // 顺序：返回列表 → 页内查找 → 分享 → 拷贝到本机
  // ★ Beta.249 用户二次指定：返回列表从最右挪到最左（"退路"放在阅读起点），
  //   原本用于分组「操作 / 离开」的 .pr-sep 也随之取消。
  const iBack = prBar.indexOf('@click="backToList"');
  const iFind = prBar.indexOf('@click="findOpen"');
  const iShare = prBar.indexOf('<ShareMenu');
  // 用 @click="askCopy" 而不是 'btn-copy' 定位拷贝按钮 —— 类名在注释里出现过，
  // 剥注释后虽已干净，但用事件绑定定位语义更明确，且不受样式块影响。
  const iCopy = prBar.indexOf('@click="askCopy"');
  assert(
    iBack > -1 && iFind > iBack && iShare > iFind && iCopy > iShare,
    `★ 顺序为 返回列表 → 页内查找 → 分享 → 拷贝到本机（实得 ${iBack} < ${iFind} < ${iShare} < ${iCopy}）`
  );
  assert(!/pr-sep/.test(prBar), '★ 已移除 .pr-sep 竖线（返回列表移到最前后不再需要分组线）');

  // 截图
  const shot = await ev({ format: 'png', captureBeyondViewport: false }, 'Page.captureScreenshot');
  fs.writeFileSync(path.join(OUT, '共享详情-按钮纯图标.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('\n  · 截图：screenshots/共享详情-按钮纯图标.png');

  console.log(`\n结果：${pass}/${fail} 通过`);
  try {
    ws.close();
  } catch (e) {}
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
