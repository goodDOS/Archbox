/** i18n-Wörterbuch des Hauptprozesses · Domäne sys (Deutsch). Schlüsselmenge muss exakt mit sys.zh-CN.js übereinstimmen. */
module.exports = {
  /* ---- Dialog „Warnung: Datenbankintegrität“ ---- */
  dbIntegrityTitle: 'Warnung: Datenbankintegrität',
  dbIntegrityMsg:
    'Es wurde festgestellt, dass die Integritätsprüfung der Datenbank fehlgeschlagen ist (möglicherweise manipuliert oder beschädigt).',
  dbReadOnlyNote:
    '\n\nUm Beweise nicht zu überschreiben, wurde das Programm in den 【Nur-Lese-Modus】 versetzt:\nSie können Daten weiterhin durchsuchen, suchen und exportieren, aber nicht ändern.\nNach Bestätigung eines Fehlalarms können Sie in den Einstellungen die Signatur-Baseline neu erstellen, um das Schreiben wiederherzustellen.',
  dbAuditNote:
    '\n\nDieses Ereignis wurde in das Audit-Protokoll geschrieben (ein Eintrag pro Start, nicht automatisch löschbar).',
  dbGotoSettings: 'Zu den Einstellungen',
  dbQuit: 'Programm beenden',

  /* ---- Dialog „Warnung: Programmdatei-Integrität“ ---- */
  appIntegrityTitle: 'Warnung: Integrität der Programmdateien',
  appIntegrityMsg:
    'Es wurde festgestellt, dass die mitgelieferten Laufzeitdateien des Programms nicht mit dem Signatur-Manifest der Veröffentlichung übereinstimmen.',
  appIntegrityDetail:
    'Betroffener Bereich: Dateien unter app.asar.unpacked im Installationsverzeichnis des Programms ($scope={scope}).\n' +
    'Der Programmkorpus app.asar hat die in die ausführbare Datei eingebaute Electron-Prüfung bestanden — wäre das Hauptprogramm verändert worden, hätte dieses Programm überhaupt nicht starten können.\n\n' +
    '{reason}\n\nDieses Ereignis wurde in das Audit-Protokoll geschrieben (ein Eintrag pro Start, nicht automatisch löschbar).' +
    'Wenn Sie diese Dateien nicht selbst verändert haben, empfiehlt es sich, das Programmpaket erneut über einen offiziellen Kanal zu beziehen oder der Quelle dieses Laufs gegenüber misstrauisch zu sein.',
  appIntegrityOk: 'Verstanden',

  /* ---- Konkrete Ursachen fehlgeschlagener Integritätsprüfungen (db/core.js + services/integrity.js) ---- */
  integSigBroken: 'Signaturdatei beschädigt; Integrität der Datenbank kann nicht geprüft werden',
  integSigFail: 'Prüfung der Datenbanksignatur fehlgeschlagen; möglicherweise manipuliert',
  integHashMismatch: 'Hash des Datenbankinhalts stimmt nicht; möglicherweise manipuliert oder beschädigt',
  integCrcMismatch: 'CRC32 des Datenbankinhalts stimmt nicht; möglicherweise beschädigt',
  integDefault: 'Integritätsprüfung der Datenbank fehlgeschlagen',
  appIntegrityDirMissing:
    'Das mitgelieferte Laufzeitdateiverzeichnis app.asar.unpacked des Programms fehlt vollständig',
  appIntegrityDirMissingDetail:
    'aber der app.asar-Header deklariert {n} Datei(en) darin ({sample}{more}) — das Verzeichnis wurde gelöscht oder nicht mit dem Paket installiert',
  andMore: ' usw.',
  diffModified: '{n} geändert ({sample}{more})',
  diffMissing: '{n} gelöscht ({sample}{more})',
  diffAdded: '{n} hinzugefügt ({sample}{more})',
  appIntegrityNoDir: 'Programmverzeichnis existiert nicht; Selbstprüfung übersprungen',
  appIntegrityNoManifest:
    'Signatur-Manifest der Programmdateien nicht gefunden (Entwicklungsmodus oder erster Start); Selbstprüfung übersprungen',
  appIntegrityManifestBroken: 'Signatur-Manifest der Programmdateien ist beschädigt und kann nicht analysiert werden',
  appIntegritySigFail: 'Prüfung des Signatur-Manifests der Programmdateien fehlgeschlagen: ',
  appIntegrityMismatch: 'Programmdateien stimmen nicht mit dem Signatur-Manifest überein: ',
  manifestMissing: 'Manifest-Objekt fehlt',
  manifestNoSig: 'Manifest hat keine Signatur',
  manifestSigInvalid:
    'Manifest-Signatur ungültig (das Manifest wurde möglicherweise ersetzt, manipuliert oder von einem anderen Programm erzeugt)',

  /* ---- Bildschirm „Datenbank konnte nicht geöffnet werden“ (keystore.js → state.dbError) ---- */
  dbOpenFailed: 'Datenbank konnte nicht geöffnet werden ({dir}): {msg}',
  dbTampered: '【Datenmanipulation erkannt: {reason}】',
  dbStillCantOpen: 'Die Datenbank kann weiterhin nicht geöffnet werden',
  dbLockedNeedPass: 'Die Datenbank ist verschlüsselt und benötigt ein Kennwort zum Entsperren',

  /* ---- Dialog „Datenverzeichnis auswählen“ (ipc/boot.js) ---- */
  pickDataDirTitle: 'Wählen Sie das Datenverzeichnis mit archive.db (zur Reparatur/Wiederherstellung)',

  /* ---- Audit-Datensätze (action/detail werden direkt in der Audit-Liste der Einstellungen angezeigt) ---- */
  auditDbIntegrity: 'Datenbankintegritätsalarm',
  auditAppIntegrity: 'Programmdatei-Integritätsalarm',
  auditIntegrityAction:
    'Diese Sitzung wurde auf Nur-Lesen umgeschaltet; die Signatur-Baseline wird nicht automatisch neu erstellt',
  auditAppIntegrityReason: 'Programmdateien stimmen nicht mit dem signierten Manifest überein',
  integNoSig: 'Keine Signaturdatei; als erster Start behandelt (persistNow erstellt die Baseline)',
  integNoDbFile: 'Keine Datenbankdatei',
  chainDetailNone: 'Keine Einträge',

  /* ---- Audit-Aktionsnamen und Anmeldefehlerursachen (in audit_log geschrieben, in der Audit-Liste angezeigt) ---- */
  actPackImport: 'Dokumentenpaket importiert',
  actUserRegister: 'Benutzer registriert',
  actLoginFail: 'Anmeldung fehlgeschlagen',
  actLogin: 'Anmeldung',
  actResetPassword: 'Passwort zurückgesetzt',
  actChangePassword: 'Passwort geändert',
  actSetQA: 'Sicherheitsfragen gesetzt',
  actRecoverByQA: 'Passwort über Sicherheitsfragen wiederhergestellt',
  actChangeSetting: 'Einstellung geändert',
  actRegionUpdate: 'Bereich geändert',
  actRegionCreate: 'Bereich erstellt',
  actRegionDelete: 'Bereich gelöscht',
  actCatUpdate: 'Kategorie geändert',
  actCatCreate: 'Kategorie erstellt',
  actCatDelete: 'Kategorie gelöscht',
  actTagAutoCreate: 'Etikett automatisch erstellt',
  actTagUpdate: 'Etikett geändert',
  actTagCreate: 'Etikett erstellt',
  actTagDelete: 'Etikett gelöscht',
  actFieldUpdate: 'Felddefinition geändert',
  actFieldCreate: 'Felddefinition erstellt',
  actFieldDelete: 'Felddefinition gelöscht',
  actPostUpdate: 'Dokument geändert',
  actPostCreate: 'Dokument erstellt',
  actPostMerge: 'Dokumente zusammengeführt',
  actPostTrash: 'Dokument in den Papierkorb verschoben',
  actPostRestore: 'Dokument wiederhergestellt',
  actPostPurge: 'Dokument endgültig gelöscht',
  actPostVersionRestore: 'Historische Version wiederhergestellt',
  actTransferPosts: 'Alle Dokumente übergeben',
  actNoteCreate: 'Notiz erstellt',
  actNoteDelete: 'Notiz gelöscht',
  sysUser: 'System',
  unknownUser: 'Unbekannter Benutzer',
  loginNoUser: 'Benutzer existiert nicht',
  loginMacMismatch: 'MAC-Adresse stimmt nicht überein',
  loginBadPassword: 'Falsches Passwort',
  chainBrokenPrev:
    'Eintrag #{id}: prev_hash passt nicht zum vorherigen Eintrag (Kette unterbrochen); Zeilen wurden möglicherweise gelöscht oder eingefügt',
  chainBrokenContent: 'Eintrag #{id}: Inhalt passt nicht zu self_hash (Felder manipuliert)',
  chainOkDetail: '{n} verkettete Einträge geprüft; Kette intakt',
  mergeAppendMark: '[Durch Zusammenführung angehängt {time}]',
  regionFallback: 'Bereich #{id}',
  categoryFallback: 'Kategorie #{id}',

  /* Text der Exportprodukte (Markdown / PDF) */
  docFallbackName: 'Dokument',
  sharedDocTitle: 'Geteiltes Dokument',
  uncategorized: 'Unkategorisiert',
  exportTitle: 'Dokumentexport',
  tagsLabel: 'Etiketten',
  fieldsBlock: 'Feldinformationen',
  statusDraft: 'Entwurf',
  statusPublished: 'Veröffentlicht',
  metaStatus: 'Status',
  metaRegion: 'Bereich',
  metaCategory: 'Kategorie',
  metaCreated: 'erstellt',
  metaUpdated: 'aktualisiert',
  metaAuthor: 'Autor',
  exportFooter: 'Exportiert {time} · {n} Dokument(e) · erzeugt von {app}',

  /* Importbericht für Dokumentenpakete */
  packZipLabel: 'Dokumentenpaket-ZIP ',
  importRegionName: 'Importierter Bereich',
  emptyTitle: '(ohne Titel)',
  impFieldFail: 'Feld {code}: {msg}',
  impItemFail: 'Zeile {n}: {msg}',
  impSkipEmptyTitle: 'Zeile {n}: Titel leer, übersprungen',
  impSkipDup: 'Zeile {n} „{title}“: Feldwert doppelt, übersprungen',
  impReasonEmptyTitle: 'Titel leer',
  impReasonDup: 'Feldwert doppelt mit „{title}“',
  impReasonMerged: 'In „{title}“ zusammengeführt',
  impReasonSuffix: 'Doppelter Import; Suffix „doppelter Import“ zum Titel hinzugefügt',
  impReasonNoCheck: 'Ohne Duplikatprüfung · neu erstellt',
  impReasonCreated: 'Duplikatprüfung bestanden · neu erstellt',
  impExistingDoc: 'Vorhandenes Dokument',
  impDupSuffix: '(Doppelimport {code})',
  impProgress: '{n}/{total} verarbeitet',

  /* Uhr- und Cloud-Dienst-Hinweise */
  clockBackdrift:
    'Dieser Start ist früher als der vorherige Starteintrag; die Systemuhr wurde möglicherweise zurückgestellt',
  clockRollback: 'Systemzeit wurde um etwa {n} Sekunde(n) zurückgestellt',
  clockJump: 'Systemzeit sprang um etwa {n} Minute(n) vor',

  /* Erklärungsseite für lokales Netzwerk (wird bei direktem Browserzugriff angezeigt) */
  lanPageTitle: '文档盒 Archbox · Dienst für lokale Freigabe',
  lanPageH1: '文档盒 Archbox · Dienst für lokale Freigabe',
  lanPageMeta: 'Version {ver} · Port {port} · läuft',
  lanPageOk1: 'Wenn Sie diese Seite sehen, ist <b>der Dienst funktionsfähig</b> — er hat einfach keine Web-Oberfläche.',
  lanPageOk2:
    'Geteilte Inhalte im lokalen Netzwerk werden vom <b>「文档盒」-Client</b> selbst abgeholt: Öffnen Sie auf einem anderen Rechner mit dieser Software 「lokale Freigabe」, und dieses Gerät erscheint automatisch in der Liste (Broadcast alle 5 Sekunden im selben Subnetz, keine manuelle Adresseingabe).',
  lanPageOk3: 'Der Weg über die Browser-Adresse funktioniert nicht, aus zwei Gründen:',
  lanPageLi1:
    'Der Dienst akzeptiert nur <code>/api/…</code> und erfordert ein Zugriffstoken — das Token wird vom Client bei der Erkennung geholt und ist im Browser nicht verfügbar.',
  lanPageLi2:
    'CORS ist absichtlich nicht aktiviert, daher kann ein Browser geteilte Inhalte nicht domainübergreifend lesen.',
  lanPageOk4: 'Um zu prüfen, ob der Dienst läuft, rufen Sie <code>/health</code> oder <code>/api/version</code> auf.'
};
