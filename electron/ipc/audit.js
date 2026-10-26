'use strict';
/**
 * 审计链通道：审计记录列表与防篡改校验。
 */
const db = require('../db');
const { S, handle } = require('./shared');

function registerAudit() {
  handle('audit:list', async p => db.listAudit({ page: p.page, q: S(p.q) }));
  handle('audit:verify', async () => db.verifyAuditChain());
}

module.exports = { registerAudit };
