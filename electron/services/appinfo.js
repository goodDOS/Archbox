'use strict';
/**
 * 应用命名单一数据源。
 *
 * 【为什么需要这个模块】
 * 本应用同时以三种身份依赖「应用名」，且历史上三处各写一遍字面量、改一次漏两处：
 *   1) Electron 的 app.name / userData 根目录  →  electron/main.js  app.setName(...)
 *   2) 用户迁移存储路径时创建的子文件夹名      →  electron/ipc/storage.js
 *   3) 文档包 manifest / 导出文件落款          →  services/archpack.js、export-text.js
 * 曾经的真实事故：产品更名「文档盒 Archbox」后，main.js 改了 app.setName，
 * 但 storage.js 里 `path.join(selectedDir, 'Archbox')` 漏改，导致程序根目录叫
 * 「文档盒 Archbox」、用户迁移后的数据目录却叫「Archbox」——名实不符且用户难以理解。
 * 故把命名收敛到这里，任何需要「应用名 / 数据目录名」的地方一律引用本模块。
 *
 * 【为什么不用 require('electron').app.getName()】
 *  - 本模块会被 verify/ 的纯 Node 脚本（无 electron 运行时）加载，硬依赖 electron 会崩；
 *  - app.getName() 在 package.json 的 `name`（archbox）与 productName 之间有歧义，
 *    且 main.js 是**先 setName 再 require 业务模块**，取值时机敏感、易踩。
 *    静态常量最稳，且与 package.json 的 productName 有回归断言守着（不会悄悄漂移）。
 */

/** 产品全名（含空格）：用于窗口标题、导出落款、manifest */
const APP_NAME = '文档盒 Archbox';

/** 数据目录文件夹名（与 APP_NAME 同值）：%APPDATA%/<APP_DIR_NAME>/、迁移目标子目录名 */
const APP_DIR_NAME = APP_NAME;

/**
 * 业务数据子目录名。
 *
 * 【为什么需要它】
 * 数据目录有两种来源，此前结构不一致：
 *   1) 默认（未迁移）：keystore.readDataDir() 回退到 `<userData>/data`，
 *      即 `…/文档盒 Archbox/data/archive.db`；
 *   2) 迁移后：ipc/storage.js 用 `path.join(selectedDir, APP_DIR_NAME)` 当作数据目录本身，
 *      于是 `archive.db` 直接落在 `D:\文档盒 Archbox\` 下，**少了 data 这一层**。
 * 结果用户看到「迁移前是 …\data\、迁移后却没有 data」的怪异落差（用户实测反馈）。
 * 现统一为：所选目录 / APP_DIR_NAME / DATA_SUBDIR —— 两种来源结构完全一致。
 *
 * ★ 该字面量此前只存在于 keystore.readDataDir() 的兜底分支里（孤例），
 *   现收敛到此，keystore / storage 共用，不得再各写一遍。 */
const DATA_SUBDIR = 'data';

module.exports = { APP_NAME, APP_DIR_NAME, DATA_SUBDIR };
