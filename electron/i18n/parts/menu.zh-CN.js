/**
 * 主进程 i18n 字典 · menu 域（简体中文）。
 *
 * 覆盖原生右键菜单与原生对话框上的文案（ipc/contextmenu.js）。
 * 系统 role 项（cut/copy/paste/selectAll）由操作系统本地化，不在此列。
 */
module.exports = {
  copySel: '复制「{text}」',
  noCopy: '没有可复制的内容',
  copyImage: '复制图片',
  saveImage: '图片另存为…',
  saveImageTitle: '图片另存为',
  imgFilter: '图片',
  errImageBroken: '图片数据无法解析',
  errInlineOnly: '仅支持内联图片',
  errNoWindow: '窗口未就绪',

  /* ---- 原生对话框（保存/选择目录、扩展名过滤器）---- */
  storagePickDir: '选择新的数据存储目录',
  storageBackupTitle: '全量备份（数据库 + 完整性校验）',
  storageRestoreTitle: '选择要恢复的备份文件',
  storageOpenDbTitle: '选择要加载的数据库所在文件夹',
  zipFilter: 'ZIP 压缩包',
  insertImage: '插入图片',
  imageFilter: '图片',
  packExportTitle: '导出文档包',
  packFileName: '文档包_{date}',
  packFilter: '文档包（ZIP）',
  packImportTitle: '选择要导入的文档包',
  packImportFilter: '文档包',
  backupPickDir: '选择异地备份目录（可指向 U 盘 / 局域网共享 / OneDrive 等云同步目录）',
  exportMdTitle: '导出 Markdown',
  exportPdfTitle: '导出 PDF',
  exportFileName: '文档导出_{date}',
  exportDefaultTitle: '文档导出',
  mdFilter: 'Markdown 文档',
  pdfFilter: 'PDF 文档',
  imgFileName: '文档图片_{date}'
};
