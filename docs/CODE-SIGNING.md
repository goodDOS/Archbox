# 代码签名指南

> 本应用当前分发**不携带数字签名证书**（EV/标准证书均未购买）。
> 未签名状态下 Windows SmartScreen 会首次弹出「未知发布者」警告，属正常现象。
>
> 本文档给出三条办证路线与集成步骤；证书就绪后无需改代码，仅设置环境变量即可完成签名。

## 一、为什么现在没有签名

| 项                 | 现状                                                  | 影响                                                     |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| 代码签名证书       | 未购买                                                | 首次安装/运行弹 SmartScreen 警告                         |
| SQLCipher 原生依赖 | 已用 **AES-256-GCM 应用层加密**等效替代，无需原生编译 | 无影响（见 `SECURITY.md §8`）                            |
| 运行时加固         | **Electron Fuses 已熔断**（`scripts/afterPack.js`）   | 阻断 `NODE_OPTIONS` / `--inspect` / `RunAsNode` 注入途径 |

即便如此，**签名仍是消除 SmartScreen 警告、建立发布者身份的唯一官方途径**，建议正式分发前办理。

## 二、三条办证路线对比

| 路线                         | 证书类型                 | 成本（年）       | SmartScreen 信誉                              | 硬件令牌                   | 适用                            |
| ---------------------------- | ------------------------ | ---------------- | --------------------------------------------- | -------------------------- | ------------------------------- |
| **A. EV 代码签名证书**       | EV Code Signing          | ¥3,000–6,000     | ⭐ 最高（EV 签名立即获得信誉，不弹窗）        | 是（私钥在物理 USB Token） | 企业正式产品首选                |
| **B. Azure Trusted Signing** | 云端签名服务             | ~$9.99/月 或按量 | ⭐⭐ 高（微软背书，需积累信誉但比标准证书快） | 否（云端 HSM 托管）        | 已有 Azure 账号、不便保管 Token |
| **C. Certum 开源项目证书**   | Open Source Code Signing | 免费或低价       | ⭐ 标准（需积累下载量建立信誉）               | 否（可软证书）             | 个人/开源项目                   |

> SmartScreen 信誉的建立：标准证书需通过一定下载量积累；**EV 证书与 Azure Trusted Signing 信誉积累更快**。

## 三、集成到打包流水线

electron-builder 原生支持通过环境变量自动签名，**无需改代码**：

### 路线 A/B：使用 PFX 文件（含私钥）

```bash
# 证书文件 cert.pfx 与密码就绪后：
$env:CSC_LINK = "C:\certs\archive-studio.pfx"
$env:CSC_KEY_PASSWORD = "你的证书密码"
npm run dist
```

electron-builder 检测到 `CSC_LINK` 会自动对 exe 与安装包签名。

### 路线 A（EV USB Token 硬件签名）

EV 证书私钥不可导出，需用 SafeNet / EToken 客户端 + Azure Trusted Signing 或签名工具手动二次签名。推荐：

1. 用 `npm run dist` 先打出未签名包；
2. 用 signtool.exe（Windows SDK 自带）二次签名：
   ```cmd
   signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /sha1 <证书SHA1指纹> release\文档工坊 Setup 0.2.0.exe
   ```

### 路线 B：Azure Trusted Signing（云端）

1. 在 Azure Portal 申请 Trusted Signing 账户，创建证书 profile；
2. 安装 [Trusted Signing CMAPI 客户端](https://learn.microsoft.com/azure/trusted-signing/) ；
3. 配置环境变量指向 profile，electron-builder 通过 `azure-trusted-signing` 集成签名；
4. 运行 `npm run dist`，签名在云端完成，无需本地 Token。

> Azure Trusted Signing 仍需在 SmartScreen 中积累信誉，但首次积累速度显著快于普通 OV 证书。

## 四、签名验证（用户侧）

签发后，右键 exe → 属性 → 数字签名，可见发布者名称与有效期。

## 五、为何 Fuses 不可替代签名

| 措施                     | 防御对象                                             | 是否消除 SmartScreen |
| ------------------------ | ---------------------------------------------------- | -------------------- |
| Electron Fuses（已实现） | 阻止**运行时** Node 注入、脚本替换、调试器附加       | ❌                   |
| 数字签名（待办）         | 确立**发布者身份**、防**分发篡改**、满足 SmartScreen | ✅                   |

二者是纵深防御的两层：Fuses 防运行时提权，签名防分发链篡改。**Fuses 已就位，签名请尽快办理。**
