/**
 * 量测详情页「吸顶页头 → 正文卡片 / 历史版本卡片」的实际间距。
 *
 * 【为什么单独量】用户反馈「正文卡片没与吸顶栏拉开距离，应与下方卡片间距一样」。
 *   这句话要落实成数字，就必须同时拿到三个值：
 *     ① 页头下沿 → 正文首块卡片上沿的间隙（期望 = 卡片间距 16px）
 *     ② 正文首块卡片 → 第二块卡片的间隙（这就是「与下方卡片间距一样」的基准）
 *     ③ 页头下沿 → 历史版本卡片上沿的间隙（期望同上）
 *   只改不量 = 凭感觉调像素，改完还是不知道对不对。
 */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.CDP_PORT || 9407);
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
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails)
      return '__EXC__' + JSON.stringify(r.result.exceptionDetails).slice(0, 200);
    return r.result && r.result.result ? r.result.result.value : null;
  };

  // ---------- 登录 ----------
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
  console.log('进入主界面：' + inApp);
  if (!inApp) process.exit(1);

  // ---------- 打开任意一篇文档 ----------
  // 首页是仪表盘（mini-grid 统计卡），没有文档卡片墙 —— 须先导航到「所有文档」列表页。
  const navTo = await js(`(function(){
    var ns=[].slice.call(document.querySelectorAll('.nav-item'));
    for(var i=0;i<ns.length;i++){ if(/所有文档/.test(ns[i].innerText||'')){ ns[i].click(); return true; } }
    return false;
  })()`);
  console.log('导航到所有文档：' + navTo);
  await sleep(2500);

  const opened = await js(`(function(){
    var cs=[].slice.call(document.querySelectorAll('.pc'));
    if(!cs.length) return 'no-card';
    cs[0].click(); return 'clicked(' + cs.length + ')';
  })()`);
  console.log('打开文档：' + opened);
  await sleep(3200);
  const inDetail = await js("!!document.querySelector('.post-layout')");
  console.log('进入详情：' + inDetail);
  if (!inDetail) {
    console.log('未进详情');
    process.exit(1);
  }

  // 展开历史版本栏（右侧卡片要一起量）
  await js(`(function(){
    var bs=[].slice.call(document.querySelectorAll('.sticky-head button'));
    for(var i=0;i<bs.length;i++){ if(bs[i].getAttribute('aria-label')==='历史版本'){ bs[i].click(); return true; } }
    return false;
  })()`);
  await sleep(1600);
  const hasVer = await js("!!document.querySelector('.versions')");
  console.log('历史版本栏展开：' + hasVer);

  // ---------- 量测（未滚动，即吸顶栏处于静止位） ----------
  // ★ 口径说明：getBoundingClientRect().bottom 已经包含 border-bottom（边框盒），
  //   不能再加一次 borderBottomWidth —— 上一版就是多加 1px，把 16px 的间距量成 15px，
  //   于是一个正确的实现被断言判成失败。
  const m = await js(`(function(){
    var head = document.querySelector('.page-head.sticky-head');
    var headCs = getComputedStyle(head);
    var headBox = head.getBoundingClientRect();
    var headBottom = headBox.bottom;
    var layout = document.querySelector('.post-layout');
    var layoutCs = getComputedStyle(layout);
    var cards = [].slice.call(document.querySelectorAll('.post-main > .card'));
    var ver = document.querySelector('.versions');
    function topOf(el){ return el ? el.getBoundingClientRect().top : null; }
    var out = {
      mainTop: Math.round(document.querySelector('.main').getBoundingClientRect().top),
      headBottom: Math.round(headBottom),
      headMarginBottom: headCs.marginBottom,
      layoutGap: layoutCs.gap,
      cardCount: cards.length,
      firstCardTop: topOf(cards[0]),
      secondCardTop: topOf(cards[1]),
      verTop: ver ? Math.round(ver.getBoundingClientRect().top) : null,
      verPosition: ver ? getComputedStyle(ver).position : null,
      verTopCss: ver ? getComputedStyle(ver).top : null
    };
    if (cards.length >= 2) {
      out.gapHeadToFirstCard = Math.round(out.firstCardTop - headBottom);
      out.gapCardToCard = Math.round(out.secondCardTop - (out.firstCardTop + cards[0].getBoundingClientRect().height));
    }
    if (ver) out.gapHeadToVersions = Math.round(out.verTop - headBottom);
    /* ★ Beta.251：悬浮栏内容「上下居中」量测（用户需求）。
     *
     * 定义（都取页头 border box 的坐标）：
     *   感知区顶 = headBox.top（栏体上沿，也是吸附线）
     *   感知区底 = headBox.bottom − borderBottomWidth（底部分割线所在处）
     *   内容墨迹 = 所有可见子元素的并集（最高者通常是 32px 的 btn-icon；标题只有 26px，
     *              故不能用标题算，否则会得到"偏上"的假象）
     *   上留白 = 墨迹顶 − 感知区顶
     *   下留白 = 感知区底 − 墨迹底
     * 居中 ⇒ 上留白 === 下留白（允许 1px：栏体高 55px 为奇数，两侧各半像素无法消除）。
     *
     * ★ 为什么必须用"墨迹并集"而不是"padding box"：
     *   若只算 padding box 的中心，只要上下 padding 相等就必然居中 —— 那是同义反复，
     *   哪怕内容整体浮在栏外也照样通过。取真实子元素的并集才是有意义的断言。 */
    var kids = [].slice.call(head.children).filter(function (el) {
      var s = getComputedStyle(el);
      return s.display !== 'none' && el.getBoundingClientRect().height > 0;
    });
    if (kids.length) {
      var inkTop = Infinity, inkBottom = -Infinity;
      kids.forEach(function (el) {
        var b = el.getBoundingClientRect();
        if (b.top < inkTop) inkTop = b.top;
        if (b.bottom > inkBottom) inkBottom = b.bottom;
      });
      var innerTop = headBox.top;
      var innerBottom = headBox.bottom - parseFloat(headCs.borderBottomWidth || '0');
      out.inkTop = Math.round(inkTop);
      out.inkBottom = Math.round(inkBottom);
      out.spaceAbove = Math.round(inkTop - innerTop);
      out.spaceBelow = Math.round(innerBottom - inkBottom);
      out.spaceSkew = Math.abs(out.spaceAbove - out.spaceBelow);
      out.padTopCss = headCs.paddingTop;
      out.padBottomCss = headCs.paddingBottom;
      out.headHeight = Math.round(headBox.height);
    }
    return out;
  })()`);
  console.log('\n量测结果：');
  console.log(JSON.stringify(m, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, '间距-静止态.png'), Buffer.from(shot.result.data, 'base64'));

  // ---------- 滚动后复量：吸附态的间距不能比静止态大 ----------
  // 用户实际是在滚动中看这个界面的。若吸附线取得过低，滚动后版本栏与页头之间
  // 会裂开一道明显大于 16px 的缝 —— 静止态量着对、一滚就露馅。
  //
  // ★ 必须先让页面真的能滚：演示文档的正文很短，scrollHeight === clientHeight，
  //   此时 scrollTop 恒为 0、"滚动后仍不重叠"是必然成立的空断言（假通过）。
  //   故注入足够长的正文把高度撑开，滚动才有意义。
  console.log('\n滚动后复量：');
  const injected = await js(`(function(){
    var c = document.querySelector('.post-content');
    if (!c) return 'no-content';
    var n = 0;
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('p');
      p.textContent = '占位段落 ' + (i + 1) + '：' + new Array(40).join('用于撑高页面以便验证滚动吸附行为。');
      c.appendChild(p); n++;
    }
    return 'injected ' + n;
  })()`);
  console.log('  · ' + injected);
  await sleep(600);

  // ★ 滚到"刚好越过吸附线"，而不是滚到底。
  //   原因：历史版本栏可能有 7 个版本、高达 1200+px，比滚动容器还高。
  //   这种"比容器还高的 sticky 元素"在滚到容器底部时必然被浏览器放开
  //   （CSS 规范行为：sticky 只能在自身盒子的活动范围内贴着，不能凭空悬浮），
  //   于是 verTop 变成负数、gap 变成 -585px。
  //   那不是错位，是 sticky 的固有语义 —— 拿它当失败判据属于断言写错了。
  //   用户实际关心的是"往下滚一点，版本栏跟页头之间不会裂开缝"，
  //   故把滚动量取为「刚越过吸附线一点点」（60px），此时 rail 若还够高就应仍被吸住。
  const scrollWant = 60;
  const scrolled = await js(`(function(){
    var main = document.querySelector('.main');
    main.scrollTop = ${scrollWant};
    return Math.round(main.scrollTop);
  })()`);
  console.log('  · scrollTop=' + scrolled);
  await sleep(900);
  const m2 = await js(`(function(){
    var head = document.querySelector('.page-head.sticky-head').getBoundingClientRect();
    var ver = document.querySelector('.versions');
    var main = document.querySelector('.main');
    var vb = ver ? ver.getBoundingClientRect() : null;
    return {
      mainScrollTop: Math.round(main.scrollTop),
      mainScrollMax: Math.round(main.scrollHeight - main.clientHeight),
      headTop: Math.round(head.top),
      headBottom: Math.round(head.bottom),
      verTop: vb ? Math.round(vb.top) : null,
      verHeight: vb ? Math.round(vb.height) : null
    };
  })()`);
  console.log(JSON.stringify(m2, null, 2));
  assert(m2.mainScrollTop > 0, '页面确实滚动起来了（scrollTop=' + m2.mainScrollTop + '）');
  if (m2.verTop != null && typeof m.gapHeadToVersions === 'number') {
    const gapScrolled = m2.verTop - m2.headBottom;
    const want = m.gapHeadToVersions;
    // ★ 断言改成"两态必须相等"，而不是"≤20px 就算过"。
    //   旧断言的问题是：它只挡住"间隙变得更大"，挡不住"间隙变小"，
    //   而且 16↔21 这种 5px 的偏差会被 <=20 的余量放过去（21 看似"接近16"）。
    //   真实需求是：静止态量到 16px，滚动吸附后**仍然是** 16px，一滚不能变形。
    //   （实测教训：--sticky-rail-top 取 56px 时，静止态 21px、吸附态 21px，
    //     两态虽然一致但都错了；取 51px 才两态都等于 16px。
    //     故这里再加一条与卡片间距的严格相等断言。）
    //
    // ★ 前提守卫：只有当版本栏"还能被吸住"时，才谈得上间距是否保持。
    //   若版本栏比剩余滚动空间还高（版本多时可达 1200+px），滚到某个点之后
    //   浏览器必然放开 sticky（规范行为，不是缺陷），此时 verTop 会继续上移。
    //   本脚本已把滚动量控制在"刚越过吸附线"的 60px，正常情况下版本栏仍被吸住；
    //   但若演示数据的版本数多到 60px 处就无法吸附，则跳过而非误报失败。
    const railPinned = Math.abs(gapScrolled - want) <= 1;
    const railReleased = gapScrolled < 0;
    if (railReleased) {
      console.log(
        `  · 版本栏过高（${m2.verHeight}px），在本次滚动量下已被迫脱离吸附` + `（sticky 的固有行为）—— 跳过间距断言`
      );
    } else {
      assert(railPinned, `★ 滚动吸附后版本栏间距与静止态一致（吸附 ${gapScrolled}px === 静止 ${want}px）`);
      assert(
        gapScrolled === m.gapCardToCard,
        `★ 滚动吸附后版本栏间距 === 卡片间距（${gapScrolled} vs ${m.gapCardToCard}）`
      );
    }
  }
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, '间距-滚动后.png'), Buffer.from(shot2.result.data, 'base64'));

  console.log('\n判定（静止态）：');
  if (m && typeof m.gapHeadToFirstCard === 'number' && typeof m.gapCardToCard === 'number') {
    assert(m.gapHeadToFirstCard > 0, `页头下沿到正文首卡有间距（实得 ${m.gapHeadToFirstCard}px）`);
    assert(
      m.gapHeadToFirstCard === m.gapCardToCard,
      `页头↔首卡间距 === 卡片间距（${m.gapHeadToFirstCard} vs ${m.gapCardToCard}）`
    );
  } else {
    bad('量测数据不足，无法判定');
  }
  if (m && typeof m.gapHeadToVersions === 'number') {
    assert(
      m.gapHeadToVersions === m.gapCardToCard,
      `页头↔历史版本卡间距 === 卡片间距（${m.gapHeadToVersions} vs ${m.gapCardToCard}）`
    );
  }

  /* ★ Beta.251：悬浮栏内容必须上下居中（用户需求「主要是要悬浮栏内容上下居中」）。
   * 判据 = 内容墨迹的上留白与下留白之差 ≤ 1px（1px 容差见上方注释：55px 奇数高的半像素）。
   * 回归背景：Beta.248~250 期间 padding 是 20/2，上留白 20px、下留白仅 2px、偏斜 18px ——
   *   肉眼一眼就能看出"内容沉在栏底"。本断言就是拦住它再退回去。 */
  console.log('\n判定（悬浮栏内容垂直居中）：');
  if (m && typeof m.spaceAbove === 'number' && typeof m.spaceBelow === 'number') {
    console.log(`  · 栏体高 ${m.headHeight}px，上下 padding ${m.padTopCss} / ${m.padBottomCss}`);
    console.log(`  · 内容墨迹 y=[${m.inkTop}, ${m.inkBottom}]，上留白 ${m.spaceAbove}px，下留白 ${m.spaceBelow}px`);
    assert(
      m.padTopCss === m.padBottomCss,
      `★ 上下 padding 对称（${m.padTopCss} vs ${m.padBottomCss}）—— 不对称就不可能居中`
    );
    assert(
      m.spaceSkew <= 1,
      `★ 悬浮栏内容上下居中（上留白 ${m.spaceAbove}px vs 下留白 ${m.spaceBelow}px，偏斜 ${m.spaceSkew}px 应 ≤ 1px）`
    );
  } else {
    bad('未取到悬浮栏内容墨迹量测，无法判定是否居中');
  }

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
