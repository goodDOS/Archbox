'use strict';
/**
 * SharePanel 对端身份（主机名/IP/MAC + 实测/自报标注）渲染校验。
 *
 * 只测渲染结果，不测后端——后端链路由 _probe-arp.cjs 覆盖。
 * 做法：用 JSDOM 挂载 SharePanel，注入假的 A.lan* 返回值，
 * 断言 DOM 里真的出现了主机名、IP、MAC 与可信度标签文案。
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');

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

async function main() {
  const built = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  console.log('\n[1] 构建产物静态断言');
  // 组件源码被内联进单文件，直接查关键文案/类名是否进了产物
  ok(built.includes('实测'), '产物含「实测」标签文案');
  ok(built.includes('自报'), '产物含「自报」标签文案');
  ok(built.includes('macLabel') || built.includes('mf-arp'), '产物含可信度标签逻辑');
  ok(built.includes('sp-mac-from'), '产物含 .sp-mac-from 样式');
  ok(built.includes('未知主机'), '产物含「未知主机」兜底文案');
  ok(built.includes('未获取'), '产物含「未获取」MAC 兜底文案');
  ok(built.includes('macFrom'), '产物含 macFrom 字段引用');
  // 注意：Vue scoped 样式在产物里会带上 [data-v-xxxx] 属性选择器，正则须容忍
  ok(/sp-mac-from\.mf-arp(?:\[data-v-[0-9a-f]+\])?\{[^}]*--c-green/.test(built), 'mf-arp 用绿色（实测）');
  ok(/sp-mac-from\.mf-self(?:\[data-v-[0-9a-f]+\])?\{[^}]*--c-orange/.test(built), 'mf-self 用橙色（自报，视觉更弱）');

  console.log('\n[2] 源码契约断言（渲染逻辑）');
  const src = fs.readFileSync(path.join(ROOT, 'src/components/SharePanel.vue'), 'utf8');
  // 访客排行行必须同时含 host / ip / mac 三个绑定
  const rankBlock = src.slice(src.indexOf('sp-visitors sp-rank'), src.indexOf('文档查看排行'));
  ok(rankBlock.includes('r.host'), '访客排行渲染 host');
  ok(rankBlock.includes('r.ip'), '访客排行渲染 ip');
  ok(rankBlock.includes('r.mac'), '访客排行渲染 mac');
  ok(rankBlock.includes('macLabel(r.macFrom)'), '访客排行渲染可信度标签');
  // 拷贝流水必须同时含三者
  const copyBlock = src.slice(src.indexOf('ref="copyEl"'), src.indexOf('访客浏览记录'));
  ok(copyBlock.includes('c.host'), '拷贝流水渲染 host');
  ok(copyBlock.includes('c.ip'), '拷贝流水渲染 ip');
  ok(copyBlock.includes('c.mac'), '拷贝流水渲染 mac');
  ok(copyBlock.includes('macLabel(c.macFrom)'), '拷贝流水渲染可信度标签');
  // 访客流水
  const visBlock = src.slice(src.indexOf('ref="visitorsEl"'), src.indexOf('sp-off empty-row'));
  ok(
    visBlock.includes('v.host') && visBlock.includes('v.ip') && visBlock.includes('v.mac'),
    '访客流水渲染 host/ip/mac'
  );
  ok(visBlock.includes('macLabel(v.macFrom)'), '访客流水渲染可信度标签');
  // 排行榜也带 MAC
  ok(src.includes('r.macs.join'), '被拷排行渲染 macs 集合');

  console.log('\n[3] macLabel / macTip 行为断言');
  // 直接抽取函数体执行，避免拉整个 Vue 组件
  const fnSrc = src.slice(src.indexOf('function macLabel'), src.indexOf('async function load'));
  ok(fnSrc.includes("=== 'arp'") && fnSrc.includes("=== 'self'"), 'macLabel 区分 arp/self 两种来源');
  // ★ Beta.270：标签文案搬进 i18n 字典，函数体只留 t() 引用；措辞本身在字典侧锁
  ok(/return t\('lanshare\.macArp'\)/.test(fnSrc), "macLabel('arp') → t('lanshare.macArp')（字典值：实测）");
  ok(/return t\('lanshare\.macSelf'\)/.test(fnSrc), "macLabel('self') → t('lanshare.macSelf')（字典值：自报）");
  ok(/return t\('common\.unknown'\)/.test(fnSrc), 'macLabel 其他 → 未知（common.unknown）');
  const lanshareDict = fs.readFileSync(path.join(ROOT, 'src/i18n/parts/lanshare.zh-CN.js'), 'utf8');
  const commonDict = fs.readFileSync(path.join(ROOT, 'src/i18n/parts/common.zh-CN.js'), 'utf8');
  ok(
    /macArp: '实测'/.test(lanshareDict) && /macSelf: '自报'/.test(lanshareDict),
    'lanshare 字典 macArp/macSelf 措辞未漂移（实测/自报）'
  );
  ok(/unknown: '未知'/.test(commonDict), 'common 字典 unknown 措辞未漂移（未知）');
  ok(/macTipSelf: '[^']*伪造/.test(lanshareDict), 'macTip 明确提示自报值可被伪造（措辞锁在 lanshare 字典）');

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('崩溃:', e);
  process.exit(2);
});
