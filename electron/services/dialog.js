'use strict';
/**
 * 原生文件对话框统一封装（单一来源）。
 *
 * ★ 为什么收敛 ★
 *   此前 8 个 IPC 模块里散落着约 17 处
 *   `const { canceled, filePaths } = await dialog.showOpenDialog(state.win, {...});
 *    if (canceled || !filePaths.length) return null;`
 *   与 `showSaveDialog` 的孪生样板。这段逻辑唯一的变化只有 title / defaultPath /
 *   filters / properties，却每处各写一遍「取第一个结果 + 取消判空 + 父窗口」。
 *   任一处在未来改「取消语义」或「多选取值」时都会漏改，行为漂移。
 *   这里收敛为三个函数：pickFile / pickDirectory / saveFile，调用点只关心业务参数。
 *
 * ★ 懒加载 electron（沿用 contextmenu.js 的 el() 约定）★
 *   不在文件顶部 require('electron')：纯函数/验证脚本 import 本模块时，
 *   顶层 require('electron') 会拿到字符串而非真模块。故统一按需取用，
 *   只有真正走到「弹对话框」这一步才 require。
 */
const state = require('../state');

function el() {
  return require('electron');
}

/** 打开单个文件：返回选中的文件路径，取消返回 null。 */
async function pickFile({ title, defaultPath, filters }) {
  const { canceled, filePaths } = await el().dialog.showOpenDialog(state.win, {
    title,
    defaultPath,
    filters,
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
}

/** 打开目录：返回选中的目录路径，取消返回 null。可传 createDirectory 允许新建。 */
async function pickDirectory({ title, defaultPath, create = false }) {
  const properties = create ? ['openDirectory', 'createDirectory'] : ['openDirectory'];
  const { canceled, filePaths } = await el().dialog.showOpenDialog(state.win, {
    title,
    defaultPath,
    properties
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
}

/** 保存文件：返回选中的保存路径，取消返回 null。 */
async function saveFile({ title, defaultPath, filters }) {
  const { canceled, filePath } = await el().dialog.showSaveDialog(state.win, {
    title,
    defaultPath,
    filters
  });
  if (canceled || !filePath) return null;
  return filePath;
}

module.exports = { pickFile, pickDirectory, saveFile };
