/** 主进程 i18n 字典 · sys 域（日本語）。键集合必须与 sys.zh-CN.js 完全一致。 */
module.exports = {
  /* ---- データベース完全性警告ポップアップ ---- */
  dbIntegrityTitle: 'データベース完全性警告',
  dbIntegrityMsg: 'データベース完全性検証の不通過を検出しました（改変または破損の可能性があります）。',
  dbReadOnlyNote:
    '\n\n証拠を上書きしないため、プログラムは【読み取り専用モード】に切り替わりました：\n通常どおり閲覧・検索・データ書き出しはできますが、変更はできません。\n誤検出と確認後、設定で署名基準を再構築して書き込みを復元できます。',
  dbAuditNote: '\n\n本イベントは監査ログに記録されました（起動ごとに1件記録され、自動削除できません）。',
  dbGotoSettings: '設定で処理する',
  dbQuit: 'プログラムを終了',

  /* ---- プログラムファイル完全性警告ポップアップ ---- */
  appIntegrityTitle: 'プログラムファイル完全性警告',
  appIntegrityMsg: 'プログラム付帯のランタイムファイルがリリース時の署名マニフェストと一致しないことを検出しました。',
  appIntegrityDetail:
    '影響範囲：プログラムインストールディレクトリ配下の app.asar.unpacked 内のファイル（$scope={scope}）。\n' +
    'プログラム主体 app.asar は実行ファイル内部の Electron 検証を通過しています——主プログラムが改変されていた場合、本プログラムは起動できません。\n\n' +
    '{reason}\n\n本イベントは監査ログに記録されました（起動ごとに1件記録され、自動削除できません）。' +
    'これらのファイルを自分で変更した覚えがない場合、公式チャネルからプログラムパックを再取得するか、今回の実行の出所に警戒することをお勧めします。',
  appIntegrityOk: '了解しました',

  /* ---- 完全性検証の具体的な理由（db/core.js + services/integrity.js）---- */
  integSigBroken: '署名ファイルが破損しており、データベース完全性を検証できません',
  integSigFail: 'データベース署名検証に失敗しました。改変された可能性があります',
  integHashMismatch: 'データベース内容ハッシュが一致しません。改変または破損された可能性があります',
  integCrcMismatch: 'データベース内容 CRC32 が一致しません。破損している可能性があります',
  integDefault: 'データベース完全性検証を通過しませんでした',
  appIntegrityDirMissing: 'プログラム付帯のランタイムファイルディレクトリ app.asar.unpacked が丸ごと見つかりません',
  appIntegrityDirMissingDetail:
    'しかし app.asar ヘッダーはその中に {n} 個のファイルがあると宣言しています（{sample}{more}）——ディレクトリが削除されたかパックと一緒にインストールされていません',
  andMore: ' など',
  diffModified: '{n} 個が変更されました（{sample}{more}）',
  diffMissing: '{n} 個が削除されました（{sample}{more}）',
  diffAdded: '{n} 個が追加されました（{sample}{more}）',
  appIntegrityNoDir: 'プログラムディレクトリが存在しないため、自己検証をスキップします',
  appIntegrityNoManifest:
    'プログラムファイル署名マニフェストが見つかりません（開発モードまたは初回実行）。自己検証をスキップします',
  appIntegrityManifestBroken: 'プログラムファイル署名マニフェストが破損しており解析できません',
  appIntegritySigFail: 'プログラムファイル署名マニフェストの検証に失敗しました：',
  appIntegrityMismatch: 'プログラムファイルが署名マニフェストと一致しません：',
  manifestMissing: 'マニフェストオブジェクトが見つかりません',
  manifestNoSig: 'マニフェストに署名がありません',
  manifestSigInvalid:
    'マニフェスト署名が無効です（マニフェストが置き換えられた、改変された、または本プログラム以外で生成された可能性があります）',

  /* ---- データベースオープン失敗画面（keystore.js → state.dbError）---- */
  dbOpenFailed: 'データベースを開けませんでした（{dir}）：{msg}',
  dbTampered: '【データファイルの改変を検出しました：{reason}】',
  dbStillCantOpen: 'データベースをまだ開けません',
  dbLockedNeedPass: 'データベースは暗号化されており、ロック解除にパスフレーズが必要です',

  /* ---- データディレクトリ選択ダイアログ（ipc/boot.js）---- */
  pickDataDirTitle: 'archive.db を含むデータディレクトリを選択（修復・復帰用）',

  /* ---- 監査記録（action/detail は設定ページの監査リストに直接表示）---- */
  auditDbIntegrity: 'データベース完全性警報',
  auditAppIntegrity: 'プログラムファイル完全性警報',
  auditIntegrityAction: '本セッションは読み取り専用に切り替わり、署名基準は自動再構築されません',
  auditAppIntegrityReason: 'プログラムファイルが署名マニフェストと一致しません',
  integNoSig: '署名ファイルがありません。初回として扱います（persistNow が基準を作成します）',
  integNoDbFile: 'データベースファイルがありません',
  chainDetailNone: '記録がありません',

  /* ---- 監査アクション名とログイン失敗理由（audit_log に書き込み、監査リストに直接表示）---- */
  actPackImport: 'ドキュメントパックインポート',
  actUserRegister: '新規ユーザー登録',
  actLoginFail: 'ログイン失敗',
  actLogin: 'ログイン',
  actResetPassword: 'パスワード再設定',
  actChangePassword: 'パスワード変更',
  actSetQA: 'セキュリティ質問設定',
  actRecoverByQA: 'セキュリティ質問でパスワード再取得',
  actChangeSetting: '設定変更',
  actRegionUpdate: '大域変更',
  actRegionCreate: '新規大域',
  actRegionDelete: '大域削除',
  actCatUpdate: '分類変更',
  actCatCreate: '新規分類',
  actCatDelete: '分類削除',
  actTagAutoCreate: 'タグ自動作成',
  actTagUpdate: 'タグ変更',
  actTagCreate: '新規タグ',
  actTagDelete: 'タグ削除',
  actFieldUpdate: 'フィールド定義変更',
  actFieldCreate: '新規フィールド定義',
  actFieldDelete: 'フィールド定義削除',
  actPostUpdate: 'ドキュメント変更',
  actPostCreate: '新規ドキュメント',
  actPostMerge: 'ドキュメント結合',
  actPostTrash: 'ドキュメント削除（トラッシュへ移動）',
  actPostRestore: 'ドキュメント復帰',
  actPostPurge: 'ドキュメント完全削除',
  actPostVersionRestore: '履歴バージョン復帰',
  actTransferPosts: '全ドキュメント引き渡し',
  actNoteCreate: '新規メモ',
  actNoteDelete: 'メモ削除',
  sysUser: 'システム',
  unknownUser: '不明なユーザー',
  loginNoUser: 'ユーザーが存在しません',
  loginMacMismatch: 'MAC アドレスが一致しません',
  loginBadPassword: 'パスワードが間違っています',
  chainBrokenPrev: '記録 #{id} の prev_hash が前の記録と一致しません（鎖断裂）。削除または挿入された可能性があります',
  chainBrokenContent: '記録 #{id} の内容が self_hash と一致しません（フィールドが改変されました）',
  chainOkDetail: '{n} 件の鎖化記録を検証しました。鎖は完全で改変されていません',
  mergeAppendMark: '[結合追加 {time}]',
  regionFallback: '大域 #{id}',
  categoryFallback: '分類 #{id}',

  /* エクスポート成果物テキスト（Markdown / PDF） */
  docFallbackName: 'ドキュメント',
  sharedDocTitle: '共有ドキュメント',
  uncategorized: '未分類',
  exportTitle: 'ドキュメント書き出し',
  tagsLabel: 'タグ',
  fieldsBlock: 'フィールド情報',
  statusDraft: '下書き',
  statusPublished: '公開済み',
  metaStatus: '状態',
  metaRegion: '大域',
  metaCategory: '分類',
  metaCreated: '作成',
  metaUpdated: '更新',
  metaAuthor: '作成者',
  exportFooter: '書き出し日時：{time} · 全 {n} 件のドキュメント · {app} が生成',

  /* ドキュメントパックインポートレポート */
  packZipLabel: 'ドキュメントパック ZIP ',
  importRegionName: 'インポート大域',
  emptyTitle: '（無題）',
  impFieldFail: 'フィールド {code}：{msg}',
  impItemFail: '第 {n} 条：{msg}',
  impSkipEmptyTitle: '第 {n} 条：タイトルが空のためスキップしました',
  impSkipDup: '第 {n} 条「{title}」：フィールド値が重複するためスキップしました',
  impReasonEmptyTitle: 'タイトルが空',
  impReasonDup: '「{title}」とフィールド値が重複',
  impReasonMerged: '「{title}」に結合',
  impReasonSuffix: '重複インポート、タイトルに「重複インポート」接尾辞を追加',
  impReasonNoCheck: '重複検索なし・新規作成',
  impReasonCreated: '重複検索通過・新規作成',
  impExistingDoc: '既存ドキュメント',
  impDupSuffix: '（重複インポート {code}）',
  impProgress: '{n}/{total} 件処理済み',

  /* クロックとクラウドサービスのヒント */
  clockBackdrift: '今回の起動時刻が前回の起動記録より早いです。システムクロックが戻された可能性があります',
  clockRollback: 'システム時刻が約 {n} 秒戻されたことを検出しました',
  clockJump: 'システム時刻が約 {n} 分前方に飛んだことを検出しました',

  /* ローカルネットワーク説明ページ（ブラウザから直接アクセス時に表示） */
  lanPageTitle: '文档盒 Archbox · ローカル共有サービス',
  lanPageH1: '文档盒 Archbox · ローカル共有サービス',
  lanPageMeta: 'バージョン {ver} · ポート {port} · 実行中',
  lanPageOk1: 'このページが表示されていれば、<b>サービスは正常</b>です——元々ウェブインターフェースはありません。',
  lanPageOk2:
    'ローカルネットワーク内の共有内容は<b>「文档盒」クライアント</b>自身が取得します：本ソフトウェアをインストールした別のマシンで「ローカル共有」を開くと、本機が自動的にリストに現れます（同一網段で5秒ごとにブロードキャスト、アドレスの手動入力は不要です）。',
  lanPageOk3: 'ブラウザでアドレスを叩く方法は通りません。理由は2つ：',
  lanPageLi1:
    'サービスは <code>/api/…</code> のみを受け付け、かつアクセストークンの携帯が必要です——トークンはクライアントが発見時に取得するため、ブラウザにはありません。',
  lanPageLi2:
    'インターフェースは意図的にクロスオリジン許可を付けていないため、ブラウザは共有内容をクロスオリジンで読み取れません。',
  lanPageOk4:
    'サービスが動いているか確認するには、<code>/health</code> または <code>/api/version</code> にアクセスしてください。'
};
