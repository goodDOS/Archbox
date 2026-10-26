# 云端同步：预留接口规格

> 当前版本为**单机模式**，云端能力以接口形式预留，便于未来无缝接入自有云 / S3 / 阿里 OSS / WebDAV 等。

## 1. 接口定义

文件：`electron/services/cloud.js`

```javascript
class CloudAdapter {
  /**
   * @param {Object} cfg
   * @param {string} cfg.endpoint  服务端地址
   * @param {string} cfg.token     访问凭证
   * @param {boolean} cfg.enabled  是否启用
   */
  constructor (cfg = {}) { ... }

  get ready () { return this.enabled && !!this.endpoint }

  /** 上行：推送本地变更（文档/附件/数据库快照） */
  async push (payload) {
    // payload: { kind: 'snapshot' | 'post' | 'attachment', data: ... }
    return { ok: false, reserved: true, fn: 'push', message: '...' }
  }

  /** 下行：拉取远端变更 */
  async pull (since) {
    // since: ISO 时间戳或 lastSyncAt
    return { ok: false, reserved: true, fn: 'pull', message: '...' }
  }

  /** 连接测试 */
  async test () {
    return { ok: false, reserved: true, fn: 'test', message: '...' }
  }
}
```

## 2. 启用流程

1. **服务端实现**上述 `CloudAdapter` 的三个方法（push / pull / test），并替换 `module.exports`。
2. 用户在「设置 → 云端同步（预留）」中：
   - 填入 `Endpoint` 与 `Token`
   - 后端开放"启用云端同步"开关（当前灰置，需配套服务端后放开）
3. IPC 端 `cloud:test` 改为调用实际适配器，返回 `{ ok: true }` 即可视为连通。

## 3. 异步任务队列

主进程内置异步任务队列模式（可扩展）：

- 导入/导出已通过 `webContents.send('task:progress', { name, pct, msg })` 推送进度
- 云端 push/pull 可复用同一通道：
  ```javascript
  const { progress } = require('./task-queue');
  // ...
  await progress.emit({ name: 'cloud-push', pct: 30, msg: '上传附件...' });
  ```

## 4. 数据同步策略（建议实现时遵循）

### 4.1 推送（push）

- **快照式**：`db.export()` → gzip → 整库上传（适用于初次接入 / 离线恢复）
- **增量式**：基于 `audit_log` 中 `id > lastSyncAuditId` 的变更记录，序列化后分批上传
- **冲突策略**：服务端可保留多版本，客户端按 `post_versions` 选择性拉取

### 4.2 拉取（pull）

- 接收 `since` 时间戳，返回该时间点之后的所有变更
- 客户端写入前先在本地生成 `post_versions` 快照（已自动）

### 4.3 错误恢复

- 推送失败时记录到 `audit_log`，由用户手动重试
- 拉取失败时保持本地数据不变

## 5. 安全注意事项

- Token 仅存于 `settings` 表的 `cloud.token`（`getSetting` 返回 JSON.parse 后的字符串）
- 建议实现时：
  - HTTPS 强制
  - 客户端证书绑定
  - 端到端加密（推送前 AES 加密 `archive.db`）
  - 速率限制（防暴力拉取）

## 6. 接入示例（伪代码）

```javascript
// electron/services/cloud.js
class HttpCloudAdapter extends CloudAdapter {
  async test() {
    try {
      const r = await fetch(this.endpoint + '/ping', {
        headers: { Authorization: 'Bearer ' + this.token }
      });
      return { ok: r.ok, message: r.ok ? '已连接' : `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, message: '连接失败：' + e.message };
    }
  }

  async push(payload) {
    const r = await fetch(this.endpoint + '/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token },
      body: JSON.stringify(payload)
    });
    return { ok: r.ok, ...(await r.json()) };
  }

  async pull(since) {
    const url = this.endpoint + '/sync/pull?since=' + encodeURIComponent(since);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + this.token } });
    return { ok: r.ok, ...(await r.json()) };
  }
}

module.exports = { CloudAdapter: HttpCloudAdapter };
```

主进程 `handle('cloud:test')` 不需改动 —— 接口签名保持兼容。
