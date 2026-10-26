/**
 * 实机验证：文档详情页悬浮栏的几何关系。
 *
 * ① 吸顶页头背景 = 卡片底色（--surface），且**栏下留白 = 卡片间距**
 *    （Beta.247 用户反馈：原先 margin-bottom:0 导致正文首卡直接贴住页头，
 *      而卡片之间是 16px，视觉上首卡明显"没跟下方卡片对齐"）；
 * ② 右侧「历史版本」侧栏 sticky 让开「页头 + 那段留白」，滚动时既不与页头重叠，
 *    也不会裂出比卡片间距更大的空洞。
 *
 * 走真实 UI 路径（登录 → 导航 → 开卡片 → 展开历史版本 → 滚动）。
 * 不做源码静态断言 —— 静态断言证明不了渲染出来的几何关系。
 *
 * ★ 注意 [a] 的语义在 Beta.247 发生过反转：上一版断言"栏下无灰缝、无空隙"，
 *   那是把缺陷固化成规格。改动此类断言前先确认用户要的到底是"贴合"还是"留白"。
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
    return r.result && r.result.result ? r.result.result.value : null;
  };

  console.log('\n[1] 过门禁 + 进入文档详情');
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
    await sleep(3000);
    inApp = await js("!!document.querySelector('.app-shell')");
  }
  assert(inApp, '进入主界面');

  await js(`(function(){
    var navs=[].slice.call(document.querySelectorAll('.nav-item,button,a'));
    for(var i=0;i<navs.length;i++){ var t=(navs[i].innerText||'').replace(/\\s+/g,' ').trim(); if(t==='所有文档'||t==='全部文档'){ navs[i].click(); return t; } }
    return null;
  })()`);
  await sleep(1800);
  await js(`(function(){
    var cs=[].slice.call(document.querySelectorAll('.pc,.post-card')).filter(function(e){return /文档|有限公司|库/.test(e.innerText||'')});
    if(cs.length){ cs[0].click(); return cs.length; } return 0;
  })()`);
  await sleep(2400);

  let inDetail = await js("!!document.querySelector('.page-head.sticky-head')");
  if (!inDetail) {
    bad('未能进入文档详情页');
    console.log(`\n结果：${pass}/${fail}`);
    process.exit(2);
  }
  ok('进入文档详情页');

  // 准备工作（只做一次，避免多主题循环里反复切换折叠态）：
  //   ① 展开历史版本侧栏；② 注入长内容把页面撑高。
  // ★ 演示文档正文很短（39 字符），页面根本不滚动 —— 不滚动的"贴顶/不重叠"
  //   断言全是假通过（元素本来就在原位）。必须先把页面撑到可滚动。
  await js(`(function(){
    var bs=[].slice.call(document.querySelectorAll('button'));
    for(var i=0;i<bs.length;i++){ if(bs[i].getAttribute('aria-label')==='历史版本'){ bs[i].click(); return true; } }
    return false;
  })()`);
  await sleep(1500);
  await js(`(function(){
    var pc=document.querySelector('.post-content');
    if(pc){ pc.innerHTML = Array.from({length:60}).map(function(_,i){return '<p>段落 '+(i+1)+'：用于撑高页面以触发吸顶滚动验证。</p>'}).join(''); }
    return true;
  })()`);
  await sleep(400);

  // 逐个主题验证：用户两次反馈分别出现在 竹青 与 暗色，且这两套主题下
  // --bg/--surface/--border 差异最大，最能暴露"没贴顶 / 背景不同底"。
  // 逐个跑而不是只跑一个 —— 只验一套主题无法保证其余主题不回归。
  const THEMES = ['bamboo', 'dark', 'light'];
  for (const th of THEMES) {
    await verifyTheme(th);
  }

  console.log(`\n结果：${pass}/${fail} 通过`);
  try {
    ws.close();
  } catch (e) {}
  process.exit(fail === 0 ? 0 : 1);

  // ---- 单主题校验 ----
  async function verifyTheme(themeName) {
    await js(`document.documentElement.setAttribute('data-theme','${themeName}')`);
    // ★ [a] 量的是「静止态」的几何关系（页头与首卡的间距），必须先让滚动复位。
    //   上一轮循环的 [b] 会把 .main 滚到底，若不复位，本轮 [a] 量到的首卡
    //   已在视口上方（firstCardTop 为负），gap 会算出 -1879 这种巨大负值，
    //   把一个正确的实现判成失败。分主题循环时尤其容易漏 —— 单跑某一主题反而正常。
    await js(`(function(){ var m=document.querySelector('.main'); if(m) m.scrollTop = 0; })()`);
    await sleep(500);

    console.log(`\n===== 主题：${themeName} =====`);

    console.log('  [a] 吸顶栏背景 = 卡片底色、栏下留白 = 卡片间距');
    const geom = await js(`(function(){
    var h=document.querySelector('.page-head.sticky-head');
    var cs=getComputedStyle(h);
    var first=document.querySelector('.post-layout .post-main .card');
    var second=document.querySelector('.post-layout .post-main .card + .card');
    var root=getComputedStyle(document.documentElement);
    return {
      theme:document.documentElement.getAttribute('data-theme'),
      headBg:cs.backgroundColor,
      headMarginBottom:cs.marginBottom,
      headBorderBottom:cs.borderBottomColor,
      surfaceVar:root.getPropertyValue('--surface').trim(),
      bgVar:root.getPropertyValue('--bg').trim(),
      firstCardBg: first?getComputedStyle(first).backgroundColor:null,
      headBottom:h.getBoundingClientRect().bottom,
      firstCardTop: first?first.getBoundingClientRect().top:null,
      gap: first? Math.round(first.getBoundingClientRect().top - h.getBoundingClientRect().bottom):null,
      // 卡片之间的间距（"应与下方卡片间距一样"的基准）
      cardGap: (first && second)
        ? Math.round(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom)
        : null
    };
  })()`);
    console.log('  · ' + JSON.stringify(geom));

    assert(
      geom.headBg === geom.firstCardBg,
      '★ 吸顶栏背景 = 卡片底色（' + geom.headBg + ' === ' + geom.firstCardBg + '）'
    );
    assert(
      geom.headBg !== geom.bgVar || geom.bgVar === geom.surfaceVar,
      '★ 吸顶栏未使用外层底色 --bg（bg=' + geom.bgVar + '，surface=' + geom.surfaceVar + '）'
    );
    // ★ 语义已反转（Beta.247 用户需求）：吸顶栏下方**必须**留出与卡片间距等值的空白。
    //   上一版断言 margin-bottom 必须是 0、栏底与首卡之间不能有空隙 ——
    //   那是把「首卡贴住页头」这个缺陷固化成了规格，用户实测反馈后才纠正过来。
    assert(
      geom.gap !== null && geom.cardGap !== null && geom.gap === geom.cardGap,
      '★ 栏底与首块卡片之间的空白 = 卡片间距（' + geom.gap + ' === ' + geom.cardGap + '）'
    );

    /* [a2] Beta.251：左侧导航栏图标必须「上下居中」（用户需求 + 截图佐证）。
     *
     * 判据 = 图标墨迹中心与工具栏**盒中心**之差 ≤ 0.5px。
     * 注意分母是"盒中心"而非"内容区中心"：
     *   若拿内容区算，只要上下 padding 相等就必然成立（同义反复）；
     *   拿盒中心算才有意义 —— 它能同时验出"上下 padding 不等"这种真问题。
     * 回归背景：Beta.250 前是 padding 6/8，图标中心 75、盒中心 76，偏上 1px
     *   （用户截图能看出上紧下松）。本断言就是拦住它再退回去。
     * ★ 顺带守住与之耦合的另一条不变量：工具栏底边必须仍在 y=99，
     *   否则右侧悬浮栏好不容易对齐的分割线会跟着歪（两者的关系见 base.css 注释）。 */
    const nav = await js(`(function(){
    var tb = document.querySelector('.nav-toolbar');
    if (!tb) return null;
    var cs = getComputedStyle(tb);
    var box = tb.getBoundingClientRect();
    var btn = tb.querySelector('.tb-btn');
    if (!btn) return null;
    var bb = btn.getBoundingClientRect();
    var head = document.querySelector('.page-head.sticky-head');
    return {
      toolbarTop: +box.top.toFixed(2),
      toolbarBottom: +box.bottom.toFixed(2),
      borderW: parseFloat(cs.borderBottomWidth || '0'),
      padTop: cs.paddingTop,
      padBottom: cs.paddingBottom,
      btnTop: +bb.top.toFixed(2),
      btnBottom: +bb.bottom.toFixed(2),
      btnCenterY: +((bb.top + bb.bottom) / 2).toFixed(2),
      boxCenterY: +((box.top + (box.bottom - parseFloat(cs.borderBottomWidth || '0'))) / 2).toFixed(2),
      headBottom: head ? +head.getBoundingClientRect().bottom.toFixed(2) : null
    };
  })()`);
    console.log('  · ' + JSON.stringify(nav));
    if (nav) {
      const skew = Math.abs(nav.btnCenterY - nav.boxCenterY);
      console.log(
        '  · 工具栏盒 [' +
          nav.toolbarTop +
          ', ' +
          nav.toolbarBottom +
          ']（padding ' +
          nav.padTop +
          ' / ' +
          nav.padBottom +
          '），图标中心 ' +
          nav.btnCenterY +
          '，盒中心 ' +
          nav.boxCenterY
      );
      assert(
        nav.padTop === nav.padBottom,
        '★ NavToolbar 上下内边距对称（' + nav.padTop + ' vs ' + nav.padBottom + '）—— 不对称就不可能居中'
      );
      assert(
        skew <= 0.5,
        '★ 左侧导航图标上下居中（图标中心 ' +
          nav.btnCenterY +
          ' vs 盒中心 ' +
          nav.boxCenterY +
          '，偏斜 ' +
          skew.toFixed(2) +
          'px 应 ≤ 0.5px）'
      );
      // 底边必须仍与右侧悬浮栏分割线同线（Beta.248 的既有约束，不能被本次对称化破坏）
      assert(
        nav.headBottom === null || nav.toolbarBottom === nav.headBottom,
        '★ 左栏工具栏底 = 右栏悬浮栏底（' +
          nav.toolbarBottom +
          ' vs ' +
          nav.headBottom +
          '）—— 对称化不得破坏这条既有对齐'
      );
    } else {
      bad('未取到 .nav-toolbar 量测，无法判定左侧导航图标是否居中');
    }

    console.log('  [b] 历史版本侧栏滚动时不与吸顶栏重叠');
    const hasVer = await js("!!document.querySelector('.versions')");
    assert(hasVer, '历史版本侧栏已展开');

    // 滚动 .main，逼出两个 sticky 同时生效。
    // ★ 不要滚到底：历史版本栏可能有 7 个版本、高达 1200+px，比滚动容器还高。
    //   这种"比剩余空间还高的 sticky 元素"在滚到底时必然被浏览器放开
    //   （CSS 规范行为，sticky 只能贴着自身活动范围，不能凭空悬浮），
    //   于是版本栏整体滚出视口、verTop 变成负数。
    //   那不是"版本栏钻进了页头"，而是它已经离开了 —— 拿它判"重叠"等于误报。
    //   本用例真正要验的是"两个 sticky 一起生效时，版本栏不会叠在页头底下"，
    //   故滚动量取 120px（足以越过吸附线、又不足以把高版本栏推出视口）。
    const scrolled = await js(`(function(){
    var m=document.querySelector('.main');
    m.scrollTop = 120;
    return {scrollTop:m.scrollTop, max:m.scrollHeight-m.clientHeight};
  })()`);
    console.log('  · 滚动：' + JSON.stringify(scrolled));
    // ★ 前置守卫：滚动必须真的发生，否则后面的"不重叠"无从谈起
    assert(
      scrolled && scrolled.scrollTop > 50,
      '页面确实滚动起来了（scrollTop=' + (scrolled && scrolled.scrollTop) + '）'
    );
    await sleep(900);

    const overlap = await js(`(function(){
    var h=document.querySelector('.page-head.sticky-head');
    var v=document.querySelector('.versions');
    if(!v) return {err:'no versions'};
    var hr=h.getBoundingClientRect(), vr=v.getBoundingClientRect();
    var vcs=getComputedStyle(v);
    var m=document.querySelector('.main'), rc=m.getBoundingClientRect();
    return {
      headTop:Math.round(hr.top), headBottom:Math.round(hr.bottom),
      mainTop:Math.round(rc.top),
      // ★ 贴顶量：滚动后页头顶应与滚动容器顶重合（gapAbove=0）
      gapAbove: Math.round(hr.top - rc.top),
      verTop:Math.round(vr.top), verBottom:Math.round(vr.bottom),
      // 重叠量：>0 表示版本栏顶部钻进了页头内部
      overlapPx: Math.round(hr.bottom - vr.top),
      verBg: vcs.backgroundColor,
      verPosition: vcs.position,
      verTopCss: vcs.top,
      vertScrollTop: Math.round(document.querySelector('.main').scrollTop)
    };
  })()`);
    console.log('  · ' + JSON.stringify(overlap));

    if (overlap && !overlap.err) {
      assert(overlap.vertScrollTop > 50, '检查时页面确已滚动（scrollTop=' + overlap.vertScrollTop + '）');
      assert(overlap.gapAbove === 0, '★ 吸顶栏贴到容器最顶、上方不留缝（gapAbove=' + overlap.gapAbove + 'px，应 = 0）');
      assert(overlap.verPosition === 'sticky', '历史版本栏处于 sticky 定位');
      // ★ 前提守卫：只有版本栏仍被吸住时，才谈得上"是否与页头重叠"。
      //   版本栏高度 > 视口可用高度时，滚过一定距离后浏览器会放开它（规范行为），
      //   此时 verTop 上移是本分，不是缺陷 —— 跳过而非误报。
      if (overlap.verTop < overlap.mainTop) {
        console.log('  · 版本栏在本次滚动量下已脱离吸附（sticky 固有行为）—— 跳过重叠断言');
      } else {
        assert(overlap.overlapPx <= 0, '★ 滚动后版本栏未与页头重叠（overlapPx=' + overlap.overlapPx + '，应 ≤ 0）');
      }
      assert(
        overlap.headTop === overlap.mainTop,
        '★ 页头顶 = 容器顶（headTop=' + overlap.headTop + ' = mainTop=' + overlap.mainTop + '）'
      );
      // 背景必须不透明：透明会让下方内容透上来叠字。取 rgba 的 alpha 判断，而非写死白色
      //（暗色/竹青主题下卡片底不是白色）。
      const alpha = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/.exec(overlap.verBg);
      const a = alpha ? (alpha[1] === undefined ? 1 : parseFloat(alpha[1])) : 1;
      assert(a >= 1, '历史版本栏背景不透明（' + overlap.verBg + '，alpha=' + a + '）');
      assert(
        overlap.verTop >= overlap.headBottom - 1 || overlap.verTop < overlap.mainTop,
        '版本栏顶部位于页头下沿之下，或已整体滚出视口（verTop=' +
          overlap.verTop +
          '，headBottom=' +
          overlap.headBottom +
          '）'
      );
    }

    // 截图存证（按主题命名，便于人工比对）
    const shot = await ev({ format: 'png', captureBeyondViewport: false }, 'Page.captureScreenshot');
    fs.writeFileSync(path.join(OUT, `悬浮栏-修复后-${themeName}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log('  · 截图：screenshots/悬浮栏-修复后-' + themeName + '.png');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
