# 字体许可与来源

本目录下的 `.woff2` 由 `scripts/sync-fonts.mjs` 从 [Fontsource](https://fontsource.org/) 的
`@fontsource/*` 包中抽取（这些包是 Google Noto 字体的分发版），**仅保留 400 常规字重**。

所有字体均为 SIL Open Font License 1.1（OFL-1.1），允许随软件一同分发。

| 字族 | 包 | 版本 | 语言 | 说明 |
| --- | --- | --- | --- | --- |
| Noto Sans | `@fontsource/noto-sans` | 5.3.0 | en, fr, de, is, ru | 拉丁 / 西里尔 / 希腊，覆盖英法德冰岛与俄语 |
| Noto Sans SC | `@fontsource/noto-sans-sc` | 5.3.1 | zh-CN | 简体中文，102 个 unicode-range 分片 |
| Noto Sans TC | `@fontsource/noto-sans-tc` | 5.3.1 | zh-TW | 繁体中文，109 个 unicode-range 分片 |
| Noto Sans JP | `@fontsource/noto-sans-jp` | 5.3.1 | ja | 日文，125 个 unicode-range 分片 |
| Noto Sans KR | `@fontsource/noto-sans-kr` | 5.3.1 | ko | 韩文，125 个 unicode-range 分片 |
| Noto Sans Arabic | `@fontsource/noto-sans-arabic` | 5.3.0 | ar | 阿拉伯文 |
| Noto Color Emoji | `@fontsource/noto-color-emoji` | 5.3.2 |  | 彩色 emoji，12 个 unicode-range 分片；必须排在文字字族之后，否则会抢走数字 |
