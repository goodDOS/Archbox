#!/usr/bin/env node
/**
 * 构建前置守卫：确保 index.html 仍是**源模板**，而不是上一次的构建产物。
 *
 * 【为什么需要这一步】
 *   本项目用 vite-plugin-singlefile 把 JS/CSS 全内联进 dist/index.html。
 *   排查过程中反复出现过同一个坑：源模板 `index.html` 被 665 KB 的自包含产物覆盖，
 *   于是「源码改对了、产物还是旧的」——下一次构建读到的输入本身就是旧产物，
 *   改任何代码都像没生效，且构建日志一切正常。Beta.278、Beta.279 各踩过一次，
 *   每次都要从「为什么产物里是旧文案」倒查半小时。
 *
 * 【判据】源模板必须满足两条，缺一即视为被污染：
 *   1. 大小 < 8 KB（正常 600 余字节，留足余量）；
 *   2. 存在 `<script type="module" src="/src/main.js">` 引用，且**没有**内联的
 *      `<script type="module" crossorigin>`（那是产物特征）。
 *
 * 【污染后怎么办】自动从内置的规范模板重写，并打印醒目警告。
 *   之所以敢自动修：这个文件的内容是固定的、不含任何业务逻辑或用户数据，
 *   恢复它不可能丢东西。宁可静默修好，也不要让「旧产物当输入」继续传播一代。
 *
 * 用法：node scripts/guard-index-html.mjs   （由 npm run build 前置调用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'index.html');

const TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self' file:; script-src 'self' file: 'unsafe-inline'; style-src 'self' file: 'unsafe-inline'; img-src 'self' file: data: blob:; font-src 'self' file: data:; connect-src 'self' file: ws: http://127.0.0.1:5173 http://localhost:5173;"
    />
    <title>文档盒 Archbox</title>
    <script type="module" src="/src/main.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

const MAX_SOURCE_BYTES = 8 * 1024;

function main() {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, TEMPLATE);
    console.log('[guard] index.html 缺失，已按规范模板重建');
    return;
  }
  const html = fs.readFileSync(file, 'utf8');
  const contaminated =
    Buffer.byteLength(html) > MAX_SOURCE_BYTES ||
    !/src="\/src\/main\.js"/.test(html) ||
    /<script type="module" crossorigin>/.test(html);

  if (!contaminated) {
    console.log('[guard] index.html 为源模板（' + Buffer.byteLength(html) + ' 字节），通过');
    return;
  }

  fs.writeFileSync(file, TEMPLATE);
  console.warn('');
  console.warn('[guard] ★★ 检测到 index.html 被构建产物覆盖，已自动恢复为源模板 ★★');
  console.warn('[guard]    原文件 ' + Buffer.byteLength(html) + ' 字节，含内联脚本——那是上一代产物。');
  console.warn('[guard]    若不修正，本次构建会把旧产物当输入，表现为「改了代码产物还是旧的」。');
  console.warn('');
}

main();
