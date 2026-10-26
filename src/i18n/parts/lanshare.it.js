/** LAN Sharing (LanShare / SharePanel) — Italiano */
export default {
  // Header and toolbar
  title: 'Condivisione LAN',
  desc: 'Condividi i tuoi documenti in sola lettura sulla rete locale · Include solo i documenti pubblicati delle aree selezionate; esclude dati account, bozze e modelli',
  myShare: 'La mia condivisione',
  discovering: 'Ricerca in corso',
  rediscover: 'Ricerca di nuovo',
  notEnabledHint:
    'Condivisione disattivata: fai clic su «La mia condivisione» in alto a destra per attivarla e scegliere le aree da condividere',
  serviceOn: 'Servizio di condivisione locale attivo (porta {port})',
  readonlyHint: 'Consultazione in sola lettura · nessun dato account',

  // Sharing source list
  sourcesCount: 'Sorgenti di condivisione ({n})',
  self: 'Questo dispositivo',
  lan: 'LAN',
  unnamedSource: 'Sorgente di condivisione senza nome',
  emptyLocalOff:
    'Condivisione disattivata. Fai clic su «La mia condivisione» per attivarla — le aree condivise appariranno qui',
  loadingRegions: 'Caricamento aree…',
  authTip: 'Questa sorgente richiede un token di accesso. Chiedilo al proprietario e inseriscilo qui sotto',
  token: 'Token di accesso',
  connecting: 'Connessione in corso',
  connect: 'Connetti',
  noRegions: 'Questa sorgente non ha aree condivise',
  noSources:
    'Nessuna sorgente di condivisione trovata. Verifica che l’altro dispositivo abbia attivato «Condivisione LAN» e che il firewall consenta UDP 47471 e TCP {port}.',
  noSourcesAuth:
    'L’altro dispositivo ha attivato la verifica del token di accesso — chiedi il token prima di connetterti.',
  pickRegion: '← Scegli un’area sotto una sorgente a sinistra per consultarne i documenti in sola lettura',

  // Document list and details
  unnamed: 'Senza nome',
  readonly: 'Sola lettura',
  searchInRegion: 'Cerca nell’area…',
  postCount: '{n} documenti',
  listMetaPre: 'Totale ',
  listMetaPost: ' documenti · pagina {page} / {pages}',
  noPosts: 'Nessun documento corrisponde al filtro attuale',
  backToListTitle: 'Torna all’elenco dei documenti condivisi',
  backToList: 'Torna all’elenco',
  findTitle: 'Trova testo in questa pagina (Ctrl+F)',
  findHere: 'Trova nella pagina',
  copyTitleOk: 'Copia questo documento nell’archivio locale',
  copyTitleNo: 'Questa sorgente non consente la copia dei documenti',
  fieldsTitle: 'Dati dei campi',
  authorLine: 'Autore: {name}',

  // Runtime errors and receipts
  loadStatusFailed: 'Impossibile ottenere lo stato della condivisione',
  tokenExpired: 'Token scaduto (l’altra parte potrebbe averlo rigenerato) — inseriscilo di nuovo',
  tokenWrong: 'Token di accesso errato',
  cannotConnect: 'Impossibile connettersi a questa sorgente',
  tokenRequired: 'Inserisci il token di accesso',
  tokenWrongOrOff: 'Token di accesso errato, oppure l’altra parte non ha attivato la condivisione',
  discoverFailed: 'Impossibile individuare le sorgenti di condivisione',
  fetchPostsFailed: 'Impossibile caricare i documenti',
  postGone: 'Il documento non esiste o è stato rimosso',
  fetchPostFailed: 'Impossibile caricare i dettagli del documento',
  copyFailed: 'Copia non riuscita',
  localLibrary: 'Archivio locale',
  whereRegion: '«{region}»{category}',
  copiedTo: 'Copiato in {where}',
  copyToast: 'Copiato su questo dispositivo: {title}{where}{unreported}',
  notReported: ' (host di origine non notificato)',

  // Sharing panel: switches and descriptions
  enableSwitch: 'Attiva la condivisione LAN',
  enableDesc:
    'Una volta attiva, gli altri dispositivi sulla rete locale possono consultare in sola lettura i documenti delle aree selezionate (nessun dato account, nessuna bozza né modello).',
  authSwitch: 'Richiedi un token di accesso per connettersi',
  authDesc1:
    'Attivo: gli altri dispositivi devono inserire il token manualmente e questo non viene diffuso sulla rete; Disattivo: il token viene diffuso pubblicamente e chiunque può connettersi subito.',
  authDescRotate: 'Riattivando viene emesso un nuovo token',
  authDesc2: ', e i dispositivi già connessi devono reinserirlo.',
  copySwitch: 'Consenti ad altri di copiare i documenti',
  copyDesc1: 'Attivo: gli altri dispositivi possono copiare i documenti condivisi da questo dispositivo',
  copyDescTo: 'nei propri archivi',
  copyDesc2:
    ' (le copie sono loro, con l’istantanea dell’autore originale). Disattivo: possono solo consultare in sola lettura e non copiare nulla.',

  // Sharing panel: connection info
  hostNameLabel: 'Nome host',
  hostNamePlaceholder: 'Nome mostrato sulla rete locale',
  localAddr: 'Indirizzo locale',
  hide: 'Nascondi',
  show: 'Mostra',
  copyTokenTitle: 'Copia token',
  regenTokenTitle: 'Rigenera token',
  noteAuthOn:
    'Dopo che gli altri dispositivi vedono questo dispositivo nell’elenco «Condivisione LAN», devono inserire manualmente il token di accesso qui sopra prima di poter consultare in sola lettura.',
  clearCached: 'Cancella i token memorizzati su questo dispositivo',
  noteAuthOff1:
    'Modalità di individuazione automatica attiva: il token viene inviato insieme al broadcast di rete, così gli altri dispositivi si connettono subito senza inserire nulla — ',
  noteAuthOffWarn: 'chiunque sulla stessa sottorete può usarlo per connettersi',
  noteAuthOff2: '. Per limitare questo, attiva «Richiedi un token di accesso per connettersi» qui sopra.',

  // Sharing panel: region selection and stats
  pickRegionsTitle: 'Seleziona le aree da condividere',
  syncAllBtn: 'Aggiorna tutto',
  unshared: 'Non condivisa',
  noRegionsEmpty: 'Ancora nessuna area — creane una prima nella barra laterale sinistra.',
  visitorRankTitle: 'Classifica visitatori (ultimi 7 giorni · primi 7)',
  noVisitors: 'Nessun accesso di visitatori negli ultimi 7 giorni.',
  unknownHost: 'Host sconosciuto',
  macUnknown: 'Non disponibile',
  countTimes: '{n} volte',
  postRankTitle: 'Classifica visualizzazioni documenti (ultimi 7 giorni · primi 7)',
  noPostRank: 'Nessun documento è stato visualizzato negli ultimi 7 giorni.',
  copyRankTitle: 'Documenti più copiati ({n})',
  noCopyRank:
    'Ancora nessuna copia registrata. Dopo che altri avranno copiato documenti condivisi da questo dispositivo, compariranno qui ordinati per numero.',
  firstTime: 'Prima',
  lastTime: 'Ultima',
  copiers: 'Copiato da: {who}',
  copyLogTitle: 'Registro copie ({n})',
  noCopyLog: 'Ancora nessuna copia registrata.',
  tookAway: 'Ha copiato «{title}»',
  visitorLogTitle: 'Registro visitatori ({n})',
  noVisitorLog:
    'Ancora nessun registro visitatori. Comparirà qui dopo che altri dispositivi avranno individuato e consultato la condivisione di questo dispositivo.',
  offDesc:
    'Condivisione disattivata. Una volta attiva, questo dispositivo diventa una sorgente di documenti in sola lettura, individuabile dagli altri dispositivi sulla rete locale tramite broadcast UDP.',

  // Visitor log labels and MAC credibility
  browseRegion: 'Ha consultato l’area «{name}»',
  browseRegionPlain: 'Ha consultato un’area',
  viewPost: 'Ha visualizzato il documento «{title}»',
  viewPostNo: 'Ha visualizzato il documento #{id}',
  browseSourcesOverview: 'Ha visualizzato la panoramica delle sorgenti',
  viewStats: 'Ha visualizzato le statistiche',
  access: 'Accesso',
  macArp: 'Verificato',
  macSelf: 'Autodichiarato',
  macTipArp: 'Rilevato dalla tabella dei vicini di rete (ARP) di questo dispositivo; affidabile sulla stessa sottorete',
  macTipSelf:
    'Autodichiarato dalla controparte — l’unica fonte disponibile tra sottoreti diverse. Attenzione: questo valore può essere falsificato dalla controparte e non va usato come credenziale di identità',
  macTipUnknown: 'Impossibile determinare l’origine di questo MAC',

  // Switch feedback and confirmations
  enabledOn: 'Condivisione LAN attivata',
  enabledOff: 'Condivisione LAN disattivata',
  regionShared: '«{name}» è ora condivisa',
  regionUnshared: '«{name}» non è più condivisa',
  allUpdated: 'Tutte le aree condivise sono state aggiornate',
  confirmAuthOff:
    'Disattivandolo, il token di accesso verrà inviato in chiaro con i broadcast di rete e gli altri dispositivi sulla stessa sottorete potranno connettersi direttamente. Disattivare?',
  confirmAuthOn:
    'Riattivando la verifica del token di accesso verrà emesso un nuovo token. I dispositivi già connessi perderanno subito l’accesso e dovranno inserire il nuovo token. Attivare?',
  authOnRotated: 'Verifica del token attivata e nuovo token emesso (i dispositivi connessi devono reinserirlo)',
  authOn: 'Verifica del token di accesso attivata',
  authOffNote: 'Verifica del token di accesso disattivata (il token sarà distribuito via broadcast)',
  confirmCopyOn:
    'Una volta attivo, i dispositivi sulla stessa sottorete in possesso del token di accesso potranno copiare interi documenti condivisi da questo dispositivo nei propri archivi. Dopo la copia, questo dispositivo non può revocarli. Attivare?',
  copyOn: 'Ora gli altri possono copiare i documenti condivisi da questo dispositivo',
  copyOff: 'Copia dei documenti disattivata',
  confirmRegen:
    'Dopo la rigenerazione, i dispositivi connessi dovranno inserire il nuovo token per accedere. Rigenerare?',
  tokenRegenerated: 'Token di accesso rigenerato',
  clearedTokens: 'Cancellati {n} token di accesso memorizzati',
  noCachedTokens: 'Nessun token di accesso memorizzato su questo dispositivo',
  clearFailed: 'Cancellazione non riuscita',
  tokenCopied: 'Token copiato',
  copyTokenFailed: 'Copia non riuscita',
  hostNameRequired: 'Il nome host non può essere vuoto',
  nameSet: 'Nome del dispositivo impostato su «{name}»'
};
