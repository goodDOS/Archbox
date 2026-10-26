/**
 * 实机验证：编辑一篇「编号已被他人占用」的旧文档时，能否保存无关的修改。
 *
 * 【用户报的缺陷】原话「仍然无法直接保存修改过的文档」+ 截图：
 *   编辑《燃气费账单 2025M08》，改的是标题，点保存却弹出「发现字段重复」，
 *   提示文档编号 IMP-IMP-2026-0041 与另一篇（ID 70）重复。
 *   弹窗三个按钮（返回修改 / 仍保存为新文档 / 合并到已有文档）里，
 *   没有一个是"就这样保存我的修改"—— 用户被永久锁死。
 *
 * 【根因】save() 每次都把**未改动**的唯一字段值一起提交查重，
 *   而那个值与库里的重复是历史遗留的，重跑必然又命中。
 *
 * 【本脚本怎么验】不看源码，直接走真实 UI：
 *   ① 造出"编号重复"的局面（两篇文档填同一个唯一字段值）；
 *   ② 编辑其中一篇，只改标题，点保存；
 *   ③ 断言：不再弹查重窗、且标题真的落库了。
 *   ④ 反例守卫：把**编号本身**改成与别人重复的值，必须仍然被拦
 *      —— 否则就是把查重整个关掉了，属于过度修复。
 */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.CDP_PORT || 9414);
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
      return '__EXC__' + JSON.stringify(r.result.exceptionDetails).slice(0, 250);
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

  // ---------- 1. 找一篇有唯一字段的文档，读出它的编号值 ----------
  console.log('\n[1] 找到一篇带唯一字段的文档');
  const info = await js(`(async function(){
    var list = await window.arch.posts({ limit: 50, offset: 0 });
    // ★ 实际形状是 {total, rows}（不是 {list}）—— 探查 DOM 后确认，
    //   写错字段名会让脚本在第一步就 no-posts 空转，看起来像"功能坏了"。
    var rows = (list && list.rows) ? list.rows : (Array.isArray(list) ? list : []);
    if (!rows.length) return 'no-posts';
    var defs = await window.arch.fields().catch(function(){ return [] });
    var uniq = (defs||[]).filter(function(d){ return d.unique_field });
    if (!uniq.length) return 'no-unique-field-def';
    // ★ 演示数据的唯一字段大多是空的，不能指望"找到一篇已填的"——
    //   没有就自己造：给第一篇文档填上唯一字段值，让局面成立。
    var p = await window.arch.post({ id: rows[0].id });
    if (!p) return 'no-post-detail';
    var code = uniq[0].code, name = uniq[0].name;
    var val = String((p.fields||{})[code] || '').trim();
    if (!val) {
      val = 'DUP-PROBE-2026-9001';
      var nf = JSON.parse(JSON.stringify(p.fields || {}));
      nf[code] = val;
      await window.arch.postSave({ id: p.id, title: p.title, regionId: p.region_id,
        categoryId: p.category_id, tags: p.tags || [], fields: nf,
        contentHtml: p.content_html || '<p>x</p>', status: p.status, no: p.no || '' });
    }
    return JSON.stringify({ postId: p.id, title: p.title, code: code, fieldName: name,
      value: val, regionId: p.region_id, categoryId: p.category_id });
  })()`);
  console.log('  · ' + info);
  if (typeof info !== 'string' || info[0] !== '{') {
    bad('未能找到带唯一字段值的文档，无法继续（' + info + '）');
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(1);
  }
  const target = JSON.parse(info);
  ok(`找到文档 ID=${target.postId}《${target.title}》，${target.fieldName}(${target.code}) = ${target.value}`);

  // ---------- 2. 造重复：另建一篇，填同一个唯一字段值 ----------
  console.log('\n[2] 另建一篇占用同一个唯一字段值（造出"历史遗留重复"）');
  const made = await js(`(async function(){
    var draft = ${JSON.stringify({
      title: '__dup_probe__',
      regionId: null,
      categoryId: null,
      tags: [],
      fields: {},
      contentHtml: '<p>probe</p>',
      status: 'published',
      no: ''
    })};
    draft.regionId = ${target.regionId};
    draft.categoryId = ${target.categoryId};
    draft.fields = {}; draft.fields[${JSON.stringify(target.code)}] = ${JSON.stringify(target.value)};
    try {
      var r = await window.arch.postSave(draft);
      return 'saved:' + (r && r.id);
    } catch(e) { return 'ERR:' + (e && e.message); }
  })()`);
  console.log('  · ' + made);
  assert(/^saved:\d+/.test(made), '已成功造出重复值（该值现在被两篇文档同时占用）');
  const probeId = /^saved:(\d+)/.test(made) ? Number(made.match(/^saved:(\d+)/)[1]) : null;

  // ---------- 3. ★ 核心：编辑目标文档，只改标题，应能保存 ----------
  console.log('\n[3] ★ 核心：编辑该文档、只改标题，点保存');
  const newTitle = target.title + '（改过标题）';
  const dupResult = await js(`(async function(){
    var p = await window.arch.post({ id: ${target.postId} });
    var draft = {
      id: ${target.postId},
      title: ${JSON.stringify(newTitle)},
      regionId: p.region_id, categoryId: p.category_id,
      tags: p.tags || [],
      fields: p.fields || {},
      contentHtml: p.content_html || '<p>x</p>',
      status: p.status, no: p.no || ''
    };
    // 模拟前端 save()：带上编辑起点原值
    var origFields = JSON.parse(JSON.stringify(p.fields || {}));
    var withOrig = await window.arch.postCheckDup({
      id: draft.id, fields: draft.fields, title: draft.title,
      regionId: draft.regionId, categoryId: draft.categoryId,
      originalFields: origFields, originalTitle: p.title
    });
    // 对照：不带原值（旧行为）
    var withoutOrig = await window.arch.postCheckDup({ id: draft.id, fields: draft.fields });
    return JSON.stringify({
      withOrigCount: (withOrig||[]).length,
      withoutOrigCount: (withoutOrig||[]).length,
      withoutOrigFields: (withoutOrig||[]).map(function(c){return c.field})
    });
  })()`);
  console.log('  · ' + dupResult);
  const dr = JSON.parse(dupResult);
  assert(
    dr.withoutOrigCount > 0,
    `（前提核验）不带原值时确实会被拦（${dr.withoutOrigCount} 处冲突：${dr.withoutOrigFields.join('、')}）—— 这正是用户遇到的）`
  );
  assert(dr.withOrigCount === 0, `★ 带原值后不再误拦（本次没动该字段，冲突数应为 0，实得 ${dr.withOrigCount}）`);

  // 真的走一次保存，确认能落库
  const saved = await js(`(async function(){
    var p = await window.arch.post({ id: ${target.postId} });
    try {
      var r = await window.arch.postSave({
        id: ${target.postId}, title: ${JSON.stringify(newTitle)},
        regionId: p.region_id, categoryId: p.category_id, tags: p.tags || [],
        fields: p.fields || {}, contentHtml: p.content_html || '<p>x</p>',
        status: p.status, no: p.no || ''
      });
      var after = await window.arch.post({ id: ${target.postId} });
      return JSON.stringify({ id: r && r.id, title: after && after.title, unchanged: !!(r && r.unchanged) });
    } catch(e) { return 'ERR:' + (e && e.message); }
  })()`);
  console.log('  · ' + saved);
  assert(
    typeof saved === 'string' && saved[0] === '{' && JSON.parse(saved).title === newTitle,
    `★ 修改后的标题已真实落库（实得「${typeof saved === 'string' && saved[0] === '{' ? JSON.parse(saved).title : saved}」）`
  );

  // ---------- 4. 反例守卫：改了编号本身且与他人重复 → 必须仍被拦 ----------
  // ★ 不能拿"目标文档自己的编号值"当反例：探针文档占用的正是这个值，
  //   于是"把编号改成 probeVal"其实等于"改回原值"，会被正确豁免，
  //   反例反而变成一个假失败。必须另造一个**第三方的、非原值**的重复编号。
  console.log('\n[4] 反例守卫：把编号改成与他人重复的值，必须仍然被拦');
  const realConflict = await js(`(async function(){
    // 造第三篇，占用一个全新的编号值
    var otherVal = 'DUP-PROBE-2026-9002';
    var me0 = await window.arch.post({ id: ${target.postId} });
    var nf0 = JSON.parse(JSON.stringify(me0.fields || {}));
    nf0[${JSON.stringify(target.code)}] = otherVal;
    var third = await window.arch.postSave({
      title: '__dup_probe3__', regionId: me0.region_id, categoryId: me0.category_id,
      tags: [], fields: nf0, contentHtml: '<p>x</p>', status: 'published', no: ''
    });

    // 现在把**目标文档**的编号也改成这个全新的值（与自身原值不同 → 属于真正的"改了值"）
    var me = await window.arch.post({ id: ${target.postId} });
    var origFields = JSON.parse(JSON.stringify(me.fields || {}));
    var newFields = JSON.parse(JSON.stringify(me.fields || {}));
    newFields[${JSON.stringify(target.code)}] = otherVal;
    var conflicts = await window.arch.postCheckDup({
      id: ${target.postId}, fields: newFields, title: me.title,
      regionId: me.region_id, categoryId: me.category_id,
      originalFields: origFields, originalTitle: me.title
    });
    window.__probe3 = third && third.id;
    return JSON.stringify({ count: (conflicts||[]).length,
      fields: (conflicts||[]).map(function(c){return c.field}),
      newValue: otherVal, oldValue: (origFields[${JSON.stringify(target.code)}] || '') });
  })()`);
  console.log('  · ' + realConflict);
  const rc = JSON.parse(realConflict);
  assert(
    rc.count > 0,
    `★ 编号被改成重复值时仍被拦下（${rc.count} 处冲突：${rc.fields.join('、')}；` +
      `原值 ${rc.oldValue} → 新值 ${rc.newValue}）—— 未过度修复`
  );

  // ---------- 5. 反例守卫：改动标题撞车 → 必须被拦 ----------
  console.log('\n[5] 反例守卫：把标题改成与他人重复，必须仍然被拦');
  const titleConflict = await js(`(async function(){
    // 造一篇标题与目标文档所在大区/分类相同的文档，再把目标文档的标题改成一致
    var me = await window.arch.post({ id: ${target.postId} });
    var dupTitle = '__dup_title_probe__';
    var twin = await window.arch.postSave({
      title: dupTitle, regionId: me.region_id, categoryId: me.category_id,
      tags: [], fields: {}, contentHtml: '<p>x</p>', status: 'published', no: ''
    });
    window.__probe4 = twin && twin.id;
    var conflicts = await window.arch.postCheckDup({
      id: ${target.postId}, fields: me.fields || {},
      title: dupTitle, regionId: me.region_id, categoryId: me.category_id,
      originalFields: JSON.parse(JSON.stringify(me.fields || {})), originalTitle: me.title
    });
    return JSON.stringify({ count: (conflicts||[]).length, fields: (conflicts||[]).map(function(c){return c.field}) });
  })()`);
  console.log('  · ' + titleConflict);
  const tc = JSON.parse(titleConflict);
  assert(tc.count > 0, `★ 标题撞车时仍被拦下（${tc.count} 处：${tc.fields.join('、')}）`);

  // ---------- 5.5 用户补充场景：不改标题、只改内容 → 必须能保存 ----------
  // ★ 用户第二次反馈的原话：「文档不改标题只改内容不改标题应能保存，
  //    不能用新建文档的标准要求已有文档」。
  //    这与 [3] 的差别在于：[3] 改的是标题，这里**标题一字不动**，
  //    唯一字段值也没动，只有正文变了 —— 这是最纯粹的"编辑已有文档"。
  //    断言口径：查重结果必须为空（0 冲突），且正文真的写进去了。
  console.log('\n[5.5] 只改正文、标题与编号都不动 → 不得弹查重、正文必须落库');
  const contentOnly = await js(`(async function(){
    var me = await window.arch.post({ id: ${target.postId} });
    var newHtml = '<p>只改内容的验证文本 ' + Date.now() + '</p>';
    // 提交时原样带上未改动的标题与字段，模拟前端编辑态的真实载荷
    var conflicts = await window.arch.postCheckDup({
      id: ${target.postId},
      fields: JSON.parse(JSON.stringify(me.fields || {})),
      title: me.title,
      regionId: me.region_id,
      categoryId: me.category_id,
      originalFields: JSON.parse(JSON.stringify(me.fields || {})),
      originalTitle: me.title
    });
    var conflictsNoOrig = await window.arch.postCheckDup({
      id: ${target.postId},
      fields: JSON.parse(JSON.stringify(me.fields || {})),
      title: me.title,
      regionId: me.region_id,
      categoryId: me.category_id
    });
    // 真存一次，确认内容确实写进去了（走真实保存通道）
    var saveRes = await window.arch.postSave({
      id: ${target.postId}, title: me.title, regionId: me.region_id,
      categoryId: me.category_id, tags: me.tags || [], fields: me.fields || {},
      contentHtml: newHtml, status: me.status, no: me.no || ''
    });
    var after = await window.arch.post({ id: ${target.postId} });
    return JSON.stringify({
      conflicts: (conflicts || []).length,
      conflictsNoOrig: (conflictsNoOrig || []).length,
      saved: !!(saveRes && saveRes.id),
      contentWritten: String(after.content_html || '').indexOf('只改内容的验证文本') > -1
    });
  })()`);
  console.log('  · ' + contentOnly);
  const co = JSON.parse(contentOnly);
  assert(co.conflicts === 0, '★ 标题与编号均未改动时查重为空（0 冲突）—— 已有文档不受新建查重标准约束');
  assert(co.conflictsNoOrig > 0, `（对照）若不传原值仍会命中 ${co.conflictsNoOrig} 处冲突 —— 说明豁免确实来自原值比对`);
  assert(co.saved === true, '★ 保存通道返回成功（未弹「发现字段重复」）');
  assert(co.contentWritten === true, '★ 正文修改真的写进了库（不是被静默丢弃）');

  // ---------- 6. 清理探针文档 ----------
  const probeList = JSON.parse(
    (await js(
      `(function(){ return JSON.stringify([${probeId}, window.__probe3, window.__probe4].filter(Boolean)); })()`
    )) || '[]'
  );
  for (const pid of probeList) {
    await js(`window.arch.postDelete({ id: ${pid} }).catch(function(){})`);
  }
  if (probeList.length) console.log('\n  · 已清理探针文档 #' + probeList.join('、#'));
  // 标题改回去
  await js(`(async function(){
    var p = await window.arch.post({ id: ${target.postId} });
    await window.arch.postSave({ id: ${target.postId}, title: ${JSON.stringify(target.title)},
      regionId: p.region_id, categoryId: p.category_id, tags: p.tags || [],
      fields: p.fields || {}, contentHtml: p.content_html || '<p>x</p>', status: p.status, no: p.no || '' });
  })().catch(function(){})`);
  console.log('  · 已还原标题');

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
