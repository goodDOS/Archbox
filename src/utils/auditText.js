/**
 * 审计记录的展示翻译（Beta.271）。
 *
 * ★ 为什么审计的 action 不能直接按语言写库
 *   action 是**查询条件**，不是界面文案：
 *     · stats.js 里「今日登录 / 近 7 日登录 / 今日登录失败」全靠 action='登录' /
 *       '登录失败' 精确匹配；
 *     · 近 7 日异常操作靠 action LIKE '%失败%' 等模糊匹配；
 *     · 审计记录一旦写下就不能改（链式哈希保护），若按当时的界面语言落库，
 *       同一个动作会以多种语言并存，历史数据的语义和统计口径就全乱了。
 *   故 action 落库始终是**固定中文原值**（即"数据库标识"），
 *   语言差异只在展示层由本模块翻译，读不到对应译文时原样显示——
 *   宁可显示旧标识，也不能显示空白让人以为记录缺失。
 */
import { t } from '../i18n';

/** 落库标识 → 字典键。新增审计动作时两处都要加，否则只会在界面露出原标识。 */
const ACTION_KEY = {
  文档包导入: 'auditAction_packImport',
  注册新用户: 'auditAction_userRegister',
  登录: 'auditAction_login',
  登录失败: 'auditAction_loginFail',
  重置密码: 'auditAction_resetPassword',
  修改密码: 'auditAction_changePassword',
  设置安全问答: 'auditAction_setQA',
  安全问答找回密码: 'auditAction_recoverByQA',
  修改设置: 'auditAction_changeSetting',
  新建大区: 'auditAction_regionCreate',
  修改大区: 'auditAction_regionUpdate',
  删除大区: 'auditAction_regionDelete',
  新建分类: 'auditAction_catCreate',
  修改分类: 'auditAction_catUpdate',
  删除分类: 'auditAction_catDelete',
  新建标签: 'auditAction_tagCreate',
  自动新建标签: 'auditAction_tagAutoCreate',
  修改标签: 'auditAction_tagUpdate',
  删除标签: 'auditAction_tagDelete',
  新建字段定义: 'auditAction_fieldCreate',
  修改字段定义: 'auditAction_fieldUpdate',
  删除字段定义: 'auditAction_fieldDelete',
  新建文档: 'auditAction_postCreate',
  修改文档: 'auditAction_postUpdate',
  合并文档: 'auditAction_postMerge',
  '删除文档（移入回收站）': 'auditAction_postTrash',
  恢复文档: 'auditAction_postRestore',
  彻底删除文档: 'auditAction_postPurge',
  恢复历史版本: 'auditAction_postVersionRestore',
  移交全部文档: 'auditAction_transferPosts',
  新建便签: 'auditAction_noteCreate',
  删除便签: 'auditAction_noteDelete',
  数据库完整性告警: 'auditAction_dbIntegrity',
  程序文件完整性告警: 'auditAction_appIntegrity',
  设备变更: 'auditAction_deviceChange',
  恢复前留底: 'auditAction_preRestore',
  从备份恢复: 'auditAction_restoreFromBackup',
  切换数据库: 'auditAction_switchDb'
};

/** 审计动作名 → 当前语言文本；未登记的标识原样返回（历史数据/未来新增都不致空白） */
export function auditAction(raw) {
  const s = String(raw || '');
  const key = ACTION_KEY[s];
  if (!key) return s;
  const v = t(key);
  return v === key ? s : v;
}

/** 登录失败原因（detail.reason）→ 当前语言文本；同样原样兜底 */
const REASON_KEY = {
  用户不存在: 'auditReason_noUser',
  'MAC 不匹配': 'auditReason_macMismatch',
  密码错误: 'auditReason_badPassword'
};
export function auditReason(raw) {
  const s = String(raw || '');
  const key = REASON_KEY[s];
  if (!key) return s;
  const v = t(key);
  return v === key ? s : v;
}
