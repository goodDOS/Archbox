/**
 * Dizionario i18n del processo principale · dominio sys (italiano).
 * L'insieme delle chiavi deve coincidere esattamente con sys.zh-CN.js (verificato da standardize).
 */
module.exports = {
  dbIntegrityTitle: 'Avviso di integrità del database',
  dbIntegrityMsg:
    'Il database non ha superato la verifica di integrità (potrebbe essere stato manomesso o danneggiato).',
  dbReadOnlyNote:
    "\n\nPer non sovrascrivere le prove, l'app è passata in modalità SOLA LETTURA:\npuoi ancora consultare, cercare ed esportare i dati, ma non modificarli.\nQuando confermi che è un falso allarme, ricostruisci la baseline delle firme nelle Impostazioni per ripristinare la scrittura.",
  dbAuditNote:
    "\n\nL'evento è stato registrato nel registro di controllo (una voce per avvio, non cancellabile automaticamente).",
  dbGotoSettings: 'Apri Impostazioni',
  dbQuit: 'Esci',

  appIntegrityTitle: 'Avviso di integrità dei file del programma',
  appIntegrityMsg: 'I file di runtime inclusi non corrispondono al manifest delle firme della build rilasciata.',
  appIntegrityDetail:
    'Ambito interessato: file sotto app.asar.unpacked nella cartella di installazione ($scope={scope}).\n' +
    "Il programma principale app.asar ha superato la verifica Electron incorporata nell'eseguibile: se fosse stato modificato, questo programma non potrebbe avviarsi.\n\n" +
    "{reason}\n\nL'evento è stato registrato nel registro di controllo (una voce per avvio, non cancellabile automaticamente)." +
    'Se non hai modificato tu questi file, valuta di procurarti il pacchetto da un canale ufficiale o diffida della fonte di questa esecuzione.',
  appIntegrityOk: 'Ho capito',

  integSigBroken: "Il file delle firme è danneggiato; impossibile verificare l'integrità del database",
  integSigFail: 'Verifica della firma del database non riuscita; il database potrebbe essere stato manomesso',
  integHashMismatch:
    'Hash del contenuto del database non corrispondente; il database potrebbe essere stato manomesso o danneggiato',
  integCrcMismatch: 'CRC32 del contenuto del database non corrispondente; il database potrebbe essere danneggiato',
  integDefault: 'Verifica di integrità del database non riuscita',
  appIntegrityDirMissing: 'La cartella di runtime inclusa app.asar.unpacked manca del tutto',
  appIntegrityDirMissingDetail:
    "ma l'intestazione di app.asar dichiara {n} file al suo interno ({sample}{more}) — la cartella è stata eliminata o non è stata installata con il pacchetto",
  andMore: ' ecc.',
  diffModified: '{n} modificati ({sample}{more})',
  diffMissing: '{n} eliminati ({sample}{more})',
  diffAdded: '{n} aggiunti ({sample}{more})',
  appIntegrityNoDir: 'La cartella del programma non esiste; autocontrollo saltato',
  appIntegrityNoManifest:
    'Manifest delle firme dei file non trovato (modalità sviluppo o primo avvio); autocontrollo saltato',
  appIntegrityManifestBroken: 'Il manifest delle firme dei file è danneggiato e non è analizzabile',
  appIntegritySigFail: 'Verifica del manifest delle firme dei file non riuscita: ',
  appIntegrityMismatch: 'I file del programma non corrispondono al manifest delle firme: ',
  manifestMissing: "Manca l'oggetto manifest",
  manifestNoSig: 'Il manifest non ha firma',
  manifestSigInvalid:
    'Firma del manifest non valida (il manifest potrebbe essere stato sostituito, manomesso o generato da un altro programma)',

  dbOpenFailed: 'Impossibile aprire il database ({dir}): {msg}',
  dbTampered: '[Rilevata manomissione del file dati: {reason}]',
  dbStillCantOpen: 'Il database continua a non aprirsi',
  dbLockedNeedPass: 'Il database è cifrato e richiede la passphrase per lo sblocco',

  pickDataDirTitle: 'Seleziona la cartella dati che contiene archive.db (per riparazione/recupero)',

  /* ---- Record di controllo (azione/dettaglio mostrati nell'elenco) ---- */
  auditDbIntegrity: 'Avviso di integrità del database',
  auditAppIntegrity: "Avviso di integrità dei file dell'applicazione",
  auditIntegrityAction:
    'Passato in sola lettura per questa sessione; la baseline delle firme non verrà ricostruita automaticamente',
  auditAppIntegrityReason: "I file dell'applicazione non corrispondono al manifest firmato",
  integNoSig: 'Nessun file di firma; trattato come primo avvio (persistNow creerà la baseline)',
  integNoDbFile: 'Nessun file di database',
  chainDetailNone: 'Nessun record',

  /* ---- Nomi delle azioni di controllo e motivi di accesso fallito ---- */
  actPackImport: 'Pacchetto archivio importato',
  actUserRegister: 'Utente registrato',
  actLoginFail: 'Accesso non riuscito',
  actLogin: 'Accesso',
  actResetPassword: 'Password reimpostata',
  actChangePassword: 'Password modificata',
  actSetQA: 'Domande di sicurezza impostate',
  actRecoverByQA: 'Password recuperata con domande di sicurezza',
  actChangeSetting: 'Impostazione modificata',
  actRegionUpdate: 'Area aggiornata',
  actRegionCreate: 'Area creata',
  actRegionDelete: 'Area eliminata',
  actCatUpdate: 'Categoria aggiornata',
  actCatCreate: 'Categoria creata',
  actCatDelete: 'Categoria eliminata',
  actTagAutoCreate: 'Tag creato automaticamente',
  actTagUpdate: 'Tag aggiornato',
  actTagCreate: 'Tag creato',
  actTagDelete: 'Tag eliminato',
  actFieldUpdate: 'Definizione campo aggiornata',
  actFieldCreate: 'Definizione campo creata',
  actFieldDelete: 'Definizione campo eliminata',
  actPostUpdate: 'Documento aggiornato',
  actPostCreate: 'Documento creato',
  actPostMerge: 'Documenti uniti',
  actPostTrash: 'Documento spostato nel cestino',
  actPostRestore: 'Documento ripristinato',
  actPostPurge: 'Documento eliminato definitivamente',
  actPostVersionRestore: 'Versione storica ripristinata',
  actTransferPosts: 'Tutti i documenti trasferiti',
  actNoteCreate: 'Nota creata',
  actNoteDelete: 'Nota eliminata',
  sysUser: 'Sistema',
  unknownUser: 'Utente sconosciuto',
  loginNoUser: "L'utente non esiste",
  loginMacMismatch: 'Indirizzo MAC non corrispondente',
  loginBadPassword: 'Password errata',
  chainBrokenPrev:
    'Record #{id}: prev_hash non corrisponde al record precedente (catena spezzata); righe potrebbero essere state eliminate o inserite',
  chainBrokenContent: 'Record #{id}: il contenuto non corrisponde a self_hash (campi manomessi)',
  chainOkDetail: 'Verificati {n} record concatenati; catena integra',
  mergeAppendMark: "[Aggiunto dall'unione {time}]",
  regionFallback: 'Area #{id}',
  categoryFallback: 'Categoria #{id}',

  /* Testi dei prodotti esportati (Markdown / PDF) */
  docFallbackName: 'Documento',
  sharedDocTitle: 'Documento condiviso',
  uncategorized: 'Senza categoria',
  exportTitle: 'Esportazione documento',
  tagsLabel: 'tag',
  fieldsBlock: 'Dettagli dei campi',
  statusDraft: 'Bozza',
  statusPublished: 'Pubblicato',
  metaStatus: 'stato',
  metaRegion: 'area',
  metaCategory: 'categoria',
  metaCreated: 'creato',
  metaUpdated: 'aggiornato',
  metaAuthor: 'autore',
  exportFooter: 'Esportato {time} · {n} documenti · generato da {app}',

  /* Rapporto di importazione del pacchetto */
  packZipLabel: 'ZIP del pacchetto archivio ',
  importRegionName: 'Area importata',
  emptyTitle: '(senza titolo)',
  impFieldFail: 'Campo {code}: {msg}',
  impItemFail: 'Riga {n}: {msg}',
  impSkipEmptyTitle: 'Riga {n}: titolo vuoto, saltata',
  impSkipDup: 'Riga {n} "{title}": valore di campo duplicato, saltata',
  impReasonEmptyTitle: 'Titolo vuoto',
  impReasonDup: 'Valore di campo duplicato con "{title}"',
  impReasonMerged: 'Unito a "{title}"',
  impReasonSuffix: 'Importazione duplicata; suffisso aggiunto al titolo',
  impReasonNoCheck: 'Creato come nuovo senza controllo duplicati',
  impReasonCreated: 'Creato come nuovo (controllo duplicati superato)',
  impExistingDoc: 'Documento esistente',
  impDupSuffix: '(importazione duplicata {code})',
  impProgress: 'Elaborati {n}/{total}',

  /* Avvisi orologio e servizi cloud */
  clockBackdrift:
    "Questo avvio è precedente al record di boot precedente; l'orologio di sistema potrebbe essere stato riportato indietro",
  clockRollback: 'Orologio di sistema riportato indietro di circa {n} secondi',
  clockJump: 'Orologio di sistema avanzato di circa {n} minuti',

  /* Pagina informativa LAN (mostrata quando si accede dal browser) */
  lanPageTitle: 'Archbox · Servizio di condivisione LAN',
  lanPageH1: 'Archbox · Servizio di condivisione LAN',
  lanPageMeta: 'Versione {ver} · porta {port} · in esecuzione',
  lanPageOk1: "Se vedi questa pagina, <b>il servizio funziona</b> — semplicemente non ha un'interfaccia web.",
  lanPageOk2:
    "Il contenuto condiviso viene scaricato dal <b>client Archbox</b> stesso: apri \"Condivisione LAN\" nell'app su un'altra macchina e questo dispositivo comparirà automaticamente nell'elenco (trasmissione ogni 5 secondi nella stessa sottorete, nessun indirizzo da inserire a mano).",
  lanPageOk3: 'Navigare verso questo indirizzo non può funzionare, per due motivi:',
  lanPageLi1:
    'Il servizio accetta solo <code>/api/…</code> con un token di accesso — il token viene ottenuto dal client durante la scoperta e non è disponibile in un browser.',
  lanPageLi2:
    'CORS non è abilitato di proposito, quindi un browser non può leggere contenuti condivisi tra origini diverse.',
  lanPageOk4: 'Per verificare che il servizio sia attivo, richiedi <code>/health</code> o <code>/api/version</code>.'
};
