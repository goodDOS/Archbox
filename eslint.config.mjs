import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';

export default [
  // 全局忽略：产物、依赖、构建脚本里的第三方生成物
  {
    ignores: ['dist/**', 'node_modules/**', 'release/**', 'scripts/afterPack.js']
  },

  // 前端（Vue + ESM，浏览器环境）
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: vueParser,
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        console: 'readonly',
        location: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        getComputedStyle: 'readonly',
        NodeFilter: 'readonly',
        // 图片文件缩略图（Beta.324）：列表按需加载 + canvas 缩放。
        // 两处调用都有 typeof 守卫（非浏览器环境退化为整页加载/占位），
        // 登记为全局只是让 ESLint 认下这两个标准浏览器 API。
        IntersectionObserver: 'readonly',
        createImageBitmap: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    },
    plugins: { vue },
    rules: {
      ...js.configs.recommended.rules,
      ...vue.configs['flat/essential'].rules,
      ...prettier.rules,
      // 阶段 A「只报告不阻断」：这里保持 recommended 的 error 级别，
      // 但通过 package.json 的 lint 脚本 `--max-warnings` 之外不设 failOnError，
      // 实际收严在阶段 C 逐条做。
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'preserve-caught-error': 'off',
      // 本项目大量 `catch (e) { /* 静默容错 */ }` 是有意设计（userData 不可写等
      // 预期分支），空 catch 带注释是合法模式，不能当错误。
      'no-empty': ['error', { allowEmptyCatch: true }],
      'vue/multi-word-component-names': 'off'
    }
  },

  // 后端（Node CommonJS 环境）
  {
    files: ['electron/**/*.js', 'electron/**/*.mjs', 'electron/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettier.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'preserve-caught-error': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },

  // verify 脚本允许顶层 await / ESM
  {
    files: ['electron/verify/**/*.mjs', 'electron/verify/**/*.cjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        WebSocket: 'readonly',
        Event: 'readonly',
        Image: 'readonly',
        getComputedStyle: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettier.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'preserve-caught-error': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  // verify 测试脚本：断言辅助变量/函数常为「声明即意图」，不强制清理未使用项
  {
    files: ['electron/verify/**/*.mjs', 'electron/verify/**/*.cjs'],
    rules: {
      'no-unused-vars': 'off'
    }
  },

  /* 蒙古文正字法用字：传统蒙古文（U+1800–U+18AF）里
   *   · 元音后接 U+180E（MVS），标明「词中不分写」；
   *   · 词缀与词干之间用 U+202F（窄不换行空格）连接，竖排下不能断行。
   * 这两类字符**不是**手滑输入的「不规则空白」，报红只会逼人删掉，
   * 删了蒙古文就成了错字（词被劈成两截）。
   *
   * 本版 ESLint（10.x）的 no-irregular-whitespace 只提供
   * skipStrings/skipComments/skipTemplates/skipRegExps/skipJSXText 五个开关，
   * 没有 ignore 码位表，无法「只放行 U+202F、U+180E，其余照旧」。因此只能
   * 对**蒙古文专用文件**整体关掉这条规则，范围严格限定：
   *   · 只匹配 mn 术语表分片与 mn 字典产物；
   *   · 其它任何文件（含 zh-CN / en / ja…）仍按默认严格报红。
   * 若日后升级 ESLint 支持 ignore 码位，应改回按码位放行。 */
  {
    files: [
      'scripts/i18n-terms-src/mn-*.mjs',
      'scripts/i18n-terms-ug-bo-mn.mjs',
      'src/i18n/parts/*.mn.js',
      'electron/i18n/parts/*.mn.js'
    ],
    rules: {
      'no-irregular-whitespace': 'off'
    }
  }
];
