import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件打包：把 JS / CSS 全部内联进 dist/index.html
// 根因修复：Electron 用 loadFile 加载 asar 内的 file:// 页面时，
// 页面内的 <script type="module" src="./assets/..."> 会被 Chromium 当作
// opaque origin —— 既不满足 CSP 的 script-src 'self'，又被 ES module 的
// CORS 拦截，导致脚本整段不执行、#app 永远空白（即“打开一片空白”）。
// 内联后不再有“外部 module 文件”，从根上消除该问题，asar 与否都能渲染。
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  base: './',
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    modulePreload: { polyfill: false }
  }
});
