/**
 * ZIP STORE 解析器（services/zip-read.js）单测（纯 Node）。
 *
 * 背景：STORE ZIP 的 local-file-header 遍历此前在 zip-backup 与 archpack 各写一份。
 * 本测试锁死共用解析器与两个调用方（备份校验 verifyBackupZip / 文档包 extractStoreChecked）
 * 的行为一致性，防止将来两处再分叉。
 *
 * 运行：node electron/verify/zip-read.test.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const zipRead = require('../services/zip-read.js');
const zipBackup = require('../services/zip-backup.js');

let pass = 0,
  fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

function makeZip(entries) {
  return zipBackup.buildZip(entries.map(e => ({ absPath: null, relPath: e.name, buffer: e.buf })));
}

// ---------- 1. listStoreEntries 基础 ----------
console.log('[1] listStoreEntries');
const zip = makeZip([
  { name: 'a.txt', buf: Buffer.from('AAA') },
  { name: 'dir/b.bin', buf: Buffer.from([1, 2, 3, 4]) }
]);
const entries = zipRead.listStoreEntries(zip);
ok(entries.length === 2, '列出 2 个条目');
ok(entries[0].name === 'a.txt' && entries[0].data.toString() === 'AAA', '条目 a.txt 内容正确');
ok(entries[1].name === 'dir/b.bin' && entries[1].data.length === 4, '条目 dir/b.bin 内容正确');

// ---------- 2. extractStoreChecked：完好包通过，损坏包抛错 ----------
console.log('[2] extractStoreChecked');
const good = zipRead.extractStoreChecked(zip, '测试');
ok(Object.keys(good).length === 2 && good['a.txt'].toString() === 'AAA', '完好包解析成功');

const bad = Buffer.from(zip);
const pos = bad.indexOf(Buffer.from('AAA'));
bad[pos] = bad[pos] ^ 0xff; // 破坏内容不改 CRC → 应检出
let threw = false;
try {
  zipRead.extractStoreChecked(bad, '测试');
} catch (e) {
  threw = true;
  // Beta.271：错误改抛 i18n key，label/文件名作为参数带上（渲染层 errText 翻译）
  ok(
    /^common\.errZipCorrupt\|/.test(e.message) && e.message.includes('"label":"测试"'),
    '损坏包抛错且带 label 参数：' + e.message
  );
}
ok(threw, '损坏包必须抛错（不静默通过）');

// ---------- 3. 调用方一致性：verifyBackupZip 与共用解析器同源 ----------
console.log('[3] 调用方一致性');
// 备份 zip 交给 verifyBackupZip 与 listStoreEntries 应得到相同条目集合
const bkp = makeZip([{ name: 'archive.db', buf: Buffer.from('DB') }]);
const viaApi = zipRead
  .listStoreEntries(bkp)
  .map(e => e.name)
  .sort();
const viaVerify = (() => {
  // verifyBackupZip 因缺 checksums.json 会返回 not ok，但条目遍历逻辑来自同一解析器
  const r = zipBackup.verifyBackupZip(bkp);
  // Beta.271：reason 改抛 i18n key，正文（含 checksums.json 字样）在字典里
  return r.ok === false && r.reason === 'common.errBackupNoChecksums';
})();
ok(JSON.stringify(viaApi) === JSON.stringify(['archive.db']), 'listStoreEntries 拿到 archive.db');
ok(viaVerify, 'verifyBackupZip 走共用解析器后仍正确报告缺 checksums.json（common.errBackupNoChecksums）');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
