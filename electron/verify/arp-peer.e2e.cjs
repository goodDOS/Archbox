'use strict';
/**
 * 对端身份（主机名 / IP / MAC + 实测·自报标注）E2E 校验。
 *
 * 覆盖三层，且**全部针对真实代码路径**：
 *   [0] arp-lookup 解析层：Linux /proc/net/arp、Windows arp -a、macOS BSD arp、ip neigh
 *   [1-6] 记录层：recordVisitor / recordCopy / copyRank / visitorRank 真的带上三要素
 *   [7] 真实 HTTP 链路：起真监听 → 带自报头请求 → 落盘 JSON 里能查到 mac + macFrom
 *
 * 【为什么必须有这个套件】
 * 「服务端拿不到对端 MAC」是个容易被误解的约束——很容易写出一个看起来对、
 * 实则永远为空的实现（只在同网段局域网里手测一下就通过了）。这里用三种平台的
 * 真实输出文本 + 一条完整 HTTP 链路把它钉死。
 *
 * 用法：node electron/verify/arp-peer.e2e.cjs [ROOT]
 *   ROOT 缺省为仓库根；传打包产物解压目录可对**产物**跑同一套断言。
 */
const path = require('path');
const Module = require('module');
const os = require('os');
const fs = require('fs');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'electron') return path.join(__dirname, '_electron-stub.js');
  return origResolve.call(this, req, ...rest);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arpprobe-'));
fs.mkdirSync(tmp, { recursive: true });

const stub = path.join(__dirname, '_electron-stub.js');
fs.writeFileSync(
  stub,
  `
const path = require('path')
const os = require('os')
module.exports = {
  app: {
    getPath: (k) => path.join(${JSON.stringify(tmp)}, k),
    getName: () => 'Archbox',
    getVersion: () => 'test',
    isPackaged: false
  },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() }
}
`
);

const keystore = require(path.join(ROOT, 'electron/keystore'));
const db = require(path.join(ROOT, 'electron/db'));
const share = require(path.join(ROOT, 'electron/db/share'));
const lan = require(path.join(ROOT, 'electron/services/lan-share'));
const arp = require(path.join(ROOT, 'electron/services/arp-lookup'));

let pass = 0,
  fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.log('  ✗ ' + msg);
  }
}

async function main() {
  // 真实应用里 db.init 会创建数据目录；探针须显式补上，否则落盘静默失败（saveX 都吞异常）
  fs.mkdirSync(path.join(tmp, 'userData', 'data'), { recursive: true });
  await db.init(tmp);
  db.seed();

  console.log('\n[0] arp-lookup 解析层（三平台真实输出文本）');
  // sanitizeMac：归一 + 剔除非法
  ok(arp.sanitizeMac('AA-BB-CC-DD-EE-FF') === 'aa:bb:cc:dd:ee:ff', '连字符写法归一为冒号小写');
  ok(arp.sanitizeMac('aabbccddeeff') === 'aa:bb:cc:dd:ee:ff', '无分隔写法归一');
  ok(arp.sanitizeMac('00:00:00:00:00:00') === '', '全零 MAC 判非法');
  ok(arp.sanitizeMac('<incomplete>') === '', 'incomplete 判非法');
  ok(arp.sanitizeMac('aa:bb') === '', '长度不足判非法');
  ok(arp.sanitizeMac('1122:3344:5566:7788') === '', 'IPv6 形态（16 位）判非法，避免混入');
  ok(arp.sanitizeMac('') === '' && arp.sanitizeMac(null) === '', '空值不抛错');
  ok(arp.sanitizeMac('ff:ff:ff:ff:ff:ff') === 'ff:ff:ff:ff:ff:ff', '广播地址语法合法（是否可用由上层判断）');

  // Linux /proc/net/arp
  const proc =
    'IP address       HW type     Flags       HW address            Mask     Device\n' +
    '172.24.0.1       0x1         0x2         0a:41:34:5f:73:28     *        eth0\n' +
    '172.24.0.9       0x1         0x0         00:00:00:00:00:00     *        eth0';
  const p1 = arp._parseProcNetArp(proc);
  ok(p1['172.24.0.1'] === '0a:41:34:5f:73:28', '解析 /proc/net/arp 正常行');
  ok(p1['172.24.0.9'] === undefined, '★ Flags=0x0 的未完成探测行被跳过（否则会记录假 MAC）');
  ok(Object.keys(arp._parseProcNetArp('')).length === 0, '空文本不抛错');
  ok(
    Object.keys(arp._parseProcNetArp('IP address HW type Flags HW address Mask Device')).length === 0,
    '表头行不被误解析'
  );

  // Windows arp -a
  const win =
    '  192.168.1.1           aa-bb-cc-dd-ee-01     动态\n' +
    '  192.168.1.20          00-11-22-33-44-55     动态\n' +
    '  224.0.0.22            01-00-5e-00-00-16     静态';
  const w1 = arp._parseArpText(win);
  ok(w1['192.168.1.1'] === 'aa:bb:cc:dd:ee:01', '解析 Windows arp -a');

  // macOS BSD arp：单段无前导零是关键坑点
  const mac =
    '? (192.168.1.1) at 0:41:34:5f:73:28 on en0 ifscope [ethernet]\n' +
    '? (192.168.1.7) at (incomplete) on en0 ifscope [ethernet]\n' +
    '? (192.168.1.9) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]';
  const m1 = arp._parseArpText(mac);
  ok(m1['192.168.1.1'] === '00:41:34:5f:73:28', '★ macOS 单段无前导零已补零（不补则整条失效）');
  ok(m1['192.168.1.7'] === undefined, 'macOS (incomplete) 条目被跳过');
  ok(m1['192.168.1.9'] === 'aa:bb:cc:dd:ee:ff', 'macOS 标准写法正常');

  // Linux ip neigh show
  const ipn = '172.24.0.5 dev eth0 lladdr 0a:11:22:33:44:55 STALE';
  ok(arp._parseArpText(ipn)['172.24.0.5'] === '0a:11:22:33:44:55', '解析 ip neigh show');

  // lookupMac 的边界：软失败
  ok(
    arp.lookupMac('') === '' && arp.lookupMac(null) === '' && arp.lookupMac('::1') === '',
    'lookupMac 对空/IPv6/非法输入返回空串且不抛错'
  );
  ok(arp.lookupMac('10.255.255.254') === '', '查不到的 IP 返回空串（软失败，不阻断请求）');
  ok(arp.localHost().length > 0, '本机主机名可取: ' + arp.localHost());
  ok(arp.isLocalMac(arp.sanitizeMac([...arp.localMacs()][0] || '')) === true, 'isLocalMac 认出本机网卡');
  ok(arp.isLocalMac('') === false, 'isLocalMac 对空值保守返回 false');

  console.log('\n[1] recordVisitor 带 host/ip/mac/macFrom');
  // 模拟：源主机侧收到一次带自报头的访客请求
  const v1 = lan.recordVisitor('192.168.1.50', true, '/api/post/1', new URL('http://x/api/post/1'), {
    host: '访客电脑',
    mac: 'AA-BB-CC-DD-EE-11'
  });
  ok(v1.ip === '192.168.1.50', 'ip 记录正确: ' + v1.ip);
  ok(v1.host === '访客电脑', 'host 记录正确: ' + v1.host);
  ok(v1.mac === 'aa:bb:cc:dd:ee:11', 'mac 已归一: ' + v1.mac);
  ok(v1.macFrom === 'self', 'macFrom = self（自报兜底，因为 192.168.1.50 不在 ARP 表）');
  ok(Object.prototype.hasOwnProperty.call(v1, 'macFrom'), 'macFrom 字段存在');

  console.log('\n[2] recordVisitor 无自报头时也不炸');
  const v2 = lan.recordVisitor('10.0.0.9', false, '/api/regions', new URL('http://x/api/regions'), undefined);
  ok(v2.host === '' && v2.mac === '' && v2.macFrom === '', '三字段均为空串（不是 undefined）');
  ok(v2.ok === false, 'ok=false 保留');

  console.log('\n[3] ARP 实测优先于自报');
  const realMac = arp._parseProcNetArp(fs.readFileSync('/proc/net/arp', 'utf8'));
  const realIp = Object.keys(realMac)[0];
  if (realIp) {
    const v3 = lan.recordVisitor(realIp, true, '/api/posts', new URL('http://x/api/posts'), {
      host: '自报名',
      mac: 'DE-AD-BE-EF-00-01'
    });
    ok(v3.mac === realMac[realIp], `arp 实测值胜出: ${v3.mac} (表值 ${realMac[realIp]})`);
    ok(v3.macFrom === 'arp', 'macFrom = arp（实测）');
    ok(v3.mac !== 'de:ad:be:ef:00:01', '自报的假 MAC 未被采用');
    ok(v3.host === '自报名', 'host 仍用自报（服务端拿不到跨机主机名）');
  } else {
    console.log('  (跳过：本机 ARP 表为空)');
  }

  console.log('\n[4] recordCopy 带 host/ip/mac/macFrom');
  const c1 = lan.recordCopy('192.168.1.77', {
    host: '拷贝者机',
    mac: '11-22-33-44-55-66',
    operator: '张三',
    postId: 3,
    postTitle: '测试文档',
    no: 'A-001',
    regionId: 1,
    regionName: '大区一'
  });
  ok(c1.ip === '192.168.1.77', 'ip: ' + c1.ip);
  ok(c1.host === '拷贝者机', 'host: ' + c1.host);
  ok(c1.mac === '11:22:33:44:55:66', 'mac 归一: ' + c1.mac);
  ok(c1.macFrom === 'self', 'macFrom=self');
  ok(c1.operator === '张三', 'operator 保留');

  console.log('\n[5] copyRank 聚合带 macs');
  const rk = lan.copyRank(20);
  ok(rk.length >= 1, '排行非空: ' + rk.length);
  ok(Array.isArray(rk[0].macs), 'macs 是数组');
  ok(rk[0].macs.includes('11:22:33:44:55:66'), 'macs 含拷贝者 MAC: ' + JSON.stringify(rk[0].macs));
  ok(rk[0].actors.includes('拷贝者机'), 'actors 含主机名');

  console.log('\n[6] visitorRank 补 host/mac');
  const vr = lan.visitorRank(7, 7);
  const row = vr.find(r => r.ip === '192.168.1.50');
  ok(!!row, '找到 192.168.1.50 的行');
  if (row) {
    ok(row.host === '访客电脑', '排行行带 host: ' + row.host);
    ok(row.mac === 'aa:bb:cc:dd:ee:11', '排行行带 mac: ' + row.mac);
    ok(row.macFrom === 'self', '排行行带 macFrom: ' + row.macFrom);
  }

  console.log('\n[7] 真实 HTTP 链路：自报头 → 访客记录落盘');
  // share.db 必须先就绪，否则 /api/* 一律 503（isReady 守卫）
  await share.initShare(tmp);
  share.rebuild([]);

  // visitorPath 只在 startShare 里设置，故必须真的起一次监听才能验证落盘
  const PORT = 47300 + Math.floor(Math.random() * 200);
  lan.startShare({ port: PORT, token: 'probe-token', name: '探针机', authEnabled: true, allowCopy: true });
  await new Promise(r => setTimeout(r, 300));
  const base = `http://127.0.0.1:${PORT}`;
  // 头必须 percent-encode 中文：HTTP 头只允许 Latin-1 字节（真实链路同此约定）
  const H = {
    'X-Archbox-Host': encodeURIComponent('自报主机-甲'),
    'X-Archbox-Mac': 'AA-BB-CC-00-11-22',
    'x-lan-token': 'probe-token'
  };
  // 一次真实访客请求
  const r1 = await fetch(`${base}/api/regions`, { headers: H });
  ok(r1.status === 200, '访客请求成功 HTTP ' + r1.status);
  // 一次真实拷贝上报
  const r2 = await fetch(`${base}/api/copy-report`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: '自报主机-甲', mac: 'AA-BB-CC-00-11-22', postId: 7, postTitle: '落盘验证文档' })
  });
  ok(r2.status === 200, '拷贝上报成功 HTTP ' + r2.status);

  // 先抓内存态（stopShare 会清空 copyPath / visitorPath 的落盘句柄）
  // 注意落点：readDataDir() 返回 <tmp>/userData/data，不是 <tmp>/data
  const dataDir = keystore.readDataDir();
  const cfile = path.join(dataDir, 'lan-copies.json');
  const vfile = path.join(dataDir, 'lan-visitors.json');
  const memCopy = lan.getCopyLog().filter(e => e.postTitle === '落盘验证文档');
  const memVisit = lan.getVisitorLog().filter(e => e.path === '/api/regions');
  lan.stopShare(); // stopShare 内部 saveCopyLog()

  ok(fs.existsSync(cfile), 'lan-copies.json 已写: ' + cfile);
  ok(fs.existsSync(vfile), 'lan-visitors.json 已写: ' + vfile);
  if (fs.existsSync(cfile)) {
    const disk = JSON.parse(fs.readFileSync(cfile, 'utf8'));
    const dc = disk.filter(e => e.postTitle === '落盘验证文档').pop();
    ok(!!dc && dc.mac === 'aa:bb:cc:00:11:22' && dc.macFrom === 'self', '磁盘拷贝记录含 mac/macFrom');
  }
  ok(!!memCopy.length, '拷贝记录已入内存日志');
  const hc = memCopy[memCopy.length - 1];
  if (hc) {
    ok(hc.mac === 'aa:bb:cc:00:11:22', '落盘的 mac 正确: ' + hc.mac);
    ok(hc.macFrom === 'arp' || hc.macFrom === 'self', '落盘 macFrom 合法: ' + hc.macFrom);
    ok(hc.ip === '127.0.0.1', '落盘 ip = 127.0.0.1: ' + hc.ip);
  }
  const hv = memVisit[memVisit.length - 1];
  ok(!!hv, '访客内存记录存在');
  if (hv) {
    ok(hv.host === '自报主机-甲', '访客记录 host 来自自报头（中文已解码）: ' + hv.host);
    ok(hv.mac === 'aa:bb:cc:00:11:22', '访客记录 mac 来自自报头: ' + hv.mac);
    ok(hv.macFrom === 'self', '访客记录 macFrom=self（127.0.0.1 无 ARP 邻居）: ' + hv.macFrom);
    ok(hv.ip === '127.0.0.1', '访客记录 ip: ' + hv.ip);
  }

  console.log(`\n=========== ${pass} 通过 / ${fail} 失败 ===========`);
  try {
    fs.unlinkSync(stub);
  } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('探针崩溃:', e);
  process.exit(2);
});
