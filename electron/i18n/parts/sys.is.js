/** i18n orðabók aðalferlis · sys-svið (íslenska). Lyklaskrár verða að samræmast nákvæmlega sys.zh-CN.js. */
module.exports = {
  /* ---- Viðvörun um heild gagnagrunns ---- */
  dbIntegrityTitle: 'Viðvörun um heild gagnagrunns',
  dbIntegrityMsg: 'Greind var misheild gagnagrunns (hann kann að hafa verið breyttur eða skemmdur).',
  dbReadOnlyNote:
    '\n\nTil að skrifa ekki yfir sannanir hefur forritið skipt yfir í 【lestrarham】:\nÞú getur enn skoðað, leitað og flutt út gögnin, en ekki breytt þeim.\nEftir staðfestingu á villuviðvörun má endurgera undirritunargrunninn í stillingum til að endurheimta skrifun.',
  dbAuditNote:
    '\n\nÞetta atvik hefur verið skráð í endurskoðunarskrá (ein færsla við hverja ræsingu, má ekki eyða sjálfkrafa).',
  dbGotoSettings: 'Fara í stillingar',
  dbQuit: 'Loka forriti',

  /* ---- Viðvörun um heild forritsskráa ---- */
  appIntegrityTitle: 'Viðvörun um heild forritsskráa',
  appIntegrityMsg: 'Greind var misræmi milli meðfylgjandi keyrsluskráa forritsins og undirritunarlista útgáfunnar.',
  appIntegrityDetail:
    'Viðkomandi umfang: skrár undir app.asar.unpacked í uppsetningarmöppu forritsins ($scope={scope}).\n' +
    'Aðalhluti forritsins app.asar hefur passað Electron-athugun sem er innbyggð í keyrsluskrána — hefði aðalforritið verið breytt hefði þetta forrit ekki getað ræst yfirleitt.\n\n' +
    '{reason}\n\nÞetta atvik hefur verið skráð í endurskoðunarskrá (ein færsla við hverja ræsingu, má ekki eyða sjálfkrafa).' +
    'Ef þú hefur ekki sjálfur breytt þessum skrám er mælt með að sækja forritspakkann að nýju frá opinberum leiðum, eða vera varinn um uppruna þessarar keyrslu.',
  appIntegrityOk: 'Ég skil',

  /* ---- Ástæður misheildarathugana (db/core.js + services/integrity.js) ---- */
  integSigBroken: 'Undirritunarskráin er skemmd; ekki er hægt að athuga heild gagnagrunnsins',
  integSigFail: 'Athugun á undirritun gagnagrunns mistókst; hann kann að hafa verið breyttur',
  integHashMismatch: 'Tætill efnis gagnagrunns passar ekki; hann kann að hafa verið breyttur eða skemmdur',
  integCrcMismatch: 'CRC32 efnis gagnagrunns passar ekki; hann kann að vera skemmdur',
  integDefault: 'Heildarathugun gagnagrunns mistókst',
  appIntegrityDirMissing: 'Mappa meðfylgjandi keyrsluskráa forritsins app.asar.unpacked vantar algjörlega',
  appIntegrityDirMissingDetail:
    'en haus app.asar segir að {n} skrá(r) eigi að vera þar ({sample}{more}) — mappan var eytt eða ekki sett með pakkanum',
  andMore: ' o.fl.',
  diffModified: '{n} breyttar ({sample}{more})',
  diffMissing: '{n} eyddar ({sample}{more})',
  diffAdded: '{n} bættar við ({sample}{more})',
  appIntegrityNoDir: 'Forritsmappa er ekki til; sjálfsathugun sleppt',
  appIntegrityNoManifest:
    'Undirritunarlisti forritsskráa fannst ekki (þróunarhamur eða fyrsta keyrsla); sjálfsathugun sleppt',
  appIntegrityManifestBroken: 'Undirritunarlisti forritsskráa er skemmdur og ekki hægt að þátta',
  appIntegritySigFail: 'Athugun á undirritunarlista forritsskráa mistókst: ',
  appIntegrityMismatch: 'Forritsskrár passa ekki við undirritunarlistann: ',
  manifestMissing: 'Listahlut vantar',
  manifestNoSig: 'Listinn hefur enga undirritun',
  manifestSigInvalid:
    'Undirritun lista er ógild (listinn kann að hafa verið skipt út, breyttur eða myndaður af öðru forriti)',

  /* ---- Skjár þegar gagnagrunnur opnast ekki (keystore.js → state.dbError) ---- */
  dbOpenFailed: 'Ekki tókst að opna gagnagrunn ({dir}): {msg}',
  dbTampered: '【Breyting á gagnaskrá greind: {reason}】',
  dbStillCantOpen: 'Gagnagrunninn er enn óopnanlegur',
  dbLockedNeedPass: 'Gagnagrunnurinn er dulkrituður og þarfnast aðgangsorðs til aflæsingar',

  /* ---- Gluggi fyrir val á gagnamöppu (ipc/boot.js) ---- */
  pickDataDirTitle: 'Veldu gagnamöppu sem inniheldur archive.db (til viðgerðar/endurheimtar)',

  /* ---- Endurskoðunarfærslur (action/detail birtast beint í endurskoðunarlista stillinga) ---- */
  auditDbIntegrity: 'Heildarviðvörun gagnagrunns',
  auditAppIntegrity: 'Heildarviðvörun forritsskráa',
  auditIntegrityAction:
    'Þessi lota var skipt yfir í lestur og undirritunargrunnurinn verður ekki endurgerður sjálfkrafa',
  auditAppIntegrityReason: 'Forritsskrár passa ekki við undirritaðan lista',
  integNoSig: 'Engin undirritunarskrá; talið vera fyrsta keyrsla (persistNow mun búa til grunninn)',
  integNoDbFile: 'Engin gagnagrunnsskrá',
  chainDetailNone: 'Engar færslur',

  /* ---- Aðgerðanöfn endurskoðunar og ástæður misheppnaðrar innskráningar (skrifaðar í audit_log, birtast í endurskoðunarlista) ---- */
  actPackImport: 'Skjalapakki fluttur inn',
  actUserRegister: 'Notandi skráður',
  actLoginFail: 'Innskráning mistókst',
  actLogin: 'Innskráning',
  actResetPassword: 'Endurstillt lykilorð',
  actChangePassword: 'Breytt lykilorð',
  actSetQA: 'Öryggisspurningar stilltar',
  actRecoverByQA: 'Lykilorð endurheimt með öryggisspurningum',
  actChangeSetting: 'Breytt stilling',
  actRegionUpdate: 'Breytt svæði',
  actRegionCreate: 'Búið til svæði',
  actRegionDelete: 'Eytt svæði',
  actCatUpdate: 'Breytt flokkun',
  actCatCreate: 'Búin til flokkun',
  actCatDelete: 'Eydd flokkun',
  actTagAutoCreate: 'Tag sjálfkrafa stofnað',
  actTagUpdate: 'Breytt tag',
  actTagCreate: 'Búið til tag',
  actTagDelete: 'Eytt tagi',
  actFieldUpdate: 'Breytt reitaskilgreiningu',
  actFieldCreate: 'Búin til reitaskilgreining',
  actFieldDelete: 'Eydd reitaskilgreining',
  actPostUpdate: 'Breytt skjal',
  actPostCreate: 'Búið til skjal',
  actPostMerge: 'Skjöl sameinuð',
  actPostTrash: 'Skjal flutt í ruslatunnu',
  actPostRestore: 'Skjal endurheimt',
  actPostPurge: 'Skjal eytt endanlega',
  actPostVersionRestore: 'Eldri útgáfa endurheimt',
  actTransferPosts: 'Öll skjöl afhent',
  actNoteCreate: 'Minnispunktur búinn til',
  actNoteDelete: 'Minnispunktur eytt',
  sysUser: 'Kerfi',
  unknownUser: 'Óþekktur notandi',
  loginNoUser: 'Notandi er ekki til',
  loginMacMismatch: 'MAC-samsvörun vantar',
  loginBadPassword: 'Rangt lykilorð',
  chainBrokenPrev:
    'Færsla #{id}: prev_hash passar ekki við fyrri færslu (keðja rofin); raðir gætu hafa verið eyddar eða bættar inn',
  chainBrokenContent: 'Færsla #{id}: efni passar ekki við self_hash (reitir breyttir)',
  chainOkDetail: '{n} keðjaðar færslur athugaðar; keðjan heilstæð og óbreytt',
  mergeAppendMark: '[Bætt við með sameiningu {time}]',
  regionFallback: 'Svæði #{id}',
  categoryFallback: 'Flokkun #{id}',

  /* Texti útflutningsafurða (Markdown / PDF) */
  docFallbackName: 'Skjal',
  sharedDocTitle: 'Deilt skjal',
  uncategorized: 'Óflokkað',
  exportTitle: 'Útflutningur skjala',
  tagsLabel: 'tög',
  fieldsBlock: 'Reitaupplýsingar',
  statusDraft: 'Drög',
  statusPublished: 'Birt',
  metaStatus: 'staða',
  metaRegion: 'svæði',
  metaCategory: 'flokkun',
  metaCreated: 'stofnað',
  metaUpdated: 'uppfært',
  metaAuthor: 'höfundur',
  exportFooter: 'Flutt út {time} · samtals {n} skjöl · búið til af {app}',

  /* Skýrsla um innflutning skjalapakka */
  packZipLabel: 'ZIP skjalapakka ',
  importRegionName: 'Innflutt svæði',
  emptyTitle: '(án titils)',
  impFieldFail: 'Reitur {code}: {msg}',
  impItemFail: 'Raða {n}: {msg}',
  impSkipEmptyTitle: 'Raða {n}: titill tómur, sleppt',
  impSkipDup: 'Raða {n} „{title}“: reitagildi tvítíðni, sleppt',
  impReasonEmptyTitle: 'Titill tómur',
  impReasonDup: 'Reitagildi tvítíðni með „{title}“',
  impReasonMerged: 'Sameinað í „{title}“',
  impReasonSuffix: 'Tvítíðn innflutningur; viðmiðun „tvítíðn innflutningur“ bætt við titilinn',
  impReasonNoCheck: 'Engin tvítíðnisathugun · búið til að nýju',
  impReasonCreated: 'Tvítíðnisathugun stóðst · búið til að nýju',
  impExistingDoc: 'Skjal sem er til',
  impDupSuffix: '(tvítíðn innflutningur {code})',
  impProgress: '{n}/{total} meðhöndlað',

  /* Klukku- og skýjaþjónustuábendingar */
  clockBackdrift: 'Þessi ræsing er fyrr en fyrri ræsingarskráning; klukka kerfisins gæti hafa verið sett aftur',
  clockRollback: 'Greind afturhverfing klukku kerfis um u.þ.b. {n} sekúndur',
  clockJump: 'Greind stökklun klukku kerfis áfram um u.þ.b. {n} mínútur',

  /* Staðværrar nets lýsingarsíða (birt þegar vafra er beint á hana) */
  lanPageTitle: '文档盒 Archbox · staðvær deilingarþjónusta',
  lanPageH1: '文档盒 Archbox · staðvær deilingarþjónusta',
  lanPageMeta: 'Útgáfa {ver} · gátt {port} · í gangi',
  lanPageOk1: 'Ef þú sérð þessa síðu er <b>þjónustan í lagi</b> — hún hefur einfaldlega ekkert vefviðmót.',
  lanPageOk2:
    'Deilt efni á staðværu neti er sótt af <b>「文档盒」-biðlaranum</b> sjálfum: opnaðu 「staðværa deilingu」 á annarri vél með þessu forriti og þetta tæki birtist sjálfkrafa í listanum (útsending á 5 sekúna fresti á sama undarneti, ekki þarf að slá inn vistfang handvirkt).',
  lanPageOk3: 'Leiðin um að slá vistfang inn í vafra virkar ekki, af tveimur ástæðum:',
  lanPageLi1:
    'Þjónustan tekur aðeins við <code>/api/…</code> og krefst aðgangstákns — tákninu er náð af biðlara við uppgötvun og er ekki til í vafra.',
  lanPageLi2:
    'Tengið er af vilja ekki með krossþingjaheimild, því getur vafri ekki lesið deilt efni yfir þingjahreppi.',
  lanPageOk4:
    'Til að athuga hvort þjónustan er í gangi skaltu biðja um <code>/health</code> eða <code>/api/version</code>.'
};
