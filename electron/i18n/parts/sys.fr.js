/** Dictionnaire i18n du processus principal · domaine sys (français). L'ensemble des clés doit correspondre exactement à sys.zh-CN.js. */
module.exports = {
  /* ---- Boîte d'avertissement d'intégrité de la base de données ---- */
  dbIntegrityTitle: "Avertissement d'intégrité de la base de données",
  dbIntegrityMsg:
    "Échec détecté de la vérification d'intégrité de la base de données (elle peut avoir été altérée ou corrompue).",
  dbReadOnlyNote:
    "\n\nPour éviter d'écraser les preuves, le programme est passé en 【mode lecture seule】 :\nVous pouvez toujours parcourir, rechercher et exporter vos données, mais pas les modifier.\nAprès confirmation d'une fausse alerte, reconstruisez la base de signature dans les paramètres pour rétablir l'écriture.",
  dbAuditNote:
    "\n\nCet incident a été enregistré dans le journal d'audit (une entrée par lancement, ne peut pas être effacée automatiquement).",
  dbGotoSettings: 'Aller dans les paramètres',
  dbQuit: 'Quitter le programme',

  /* ---- Boîte d'avertissement d'intégrité des fichiers du programme ---- */
  appIntegrityTitle: "Avertissement d'intégrité des fichiers du programme",
  appIntegrityMsg:
    "Les fichiers d'exécution fournis avec le programme ne correspondent pas au manifeste de signature de la version publiée.",
  appIntegrityDetail:
    "Portée concernée : fichiers sous app.asar.unpacked dans le répertoire d'installation du programme ($scope={scope}).\n" +
    "Le corps principal du programme app.asar a passé la vérification Electron intégrée à l'exécutable — si le programme principal avait été modifié, ce programme n'aurait pas pu démarrer du tout.\n\n" +
    "{reason}\n\nCet incident a été enregistré dans le journal d'audit (une entrée par lancement, ne peut pas être effacée automatiquement)." +
    "Si vous n'avez pas modifié vous-même ces fichiers, il est conseillé d'obtenir à nouveau le paquet du programme depuis un canal officiel, ou de se méfier de la source de cette exécution.",
  appIntegrityOk: "J'ai compris",

  /* ---- Causes concrètes de l'échec de vérification d'intégrité (db/core.js + services/integrity.js) ---- */
  integSigBroken: "Le fichier de signature est corrompu ; l'intégrité de la base de données ne peut pas être vérifiée",
  integSigFail: 'Échec de la vérification de la signature de la base de données ; elle peut avoir été altérée',
  integHashMismatch:
    'Le hachage du contenu de la base de données ne correspond pas ; elle peut avoir été altérée ou corrompue',
  integCrcMismatch: 'Le CRC32 du contenu de la base de données ne correspond pas ; elle peut être corrompue',
  integDefault: "La vérification d'intégrité de la base de données a échoué",
  appIntegrityDirMissing:
    "Le répertoire des fichiers d'exécution app.asar.unpacked fourni avec le programme est entièrement manquant",
  appIntegrityDirMissingDetail:
    "mais l'en-tête d'app.asar déclare qu'il devrait contenir {n} fichier(s) ({sample}{more}) — le répertoire a été supprimé ou n'a pas été installé avec le paquet",
  andMore: ', etc.',
  diffModified: '{n} modifié(s) ({sample}{more})',
  diffMissing: '{n} supprimé(s) ({sample}{more})',
  diffAdded: '{n} ajouté(s) ({sample}{more})',
  appIntegrityNoDir: "Le répertoire du programme n'existe pas ; auto-vérification ignorée",
  appIntegrityNoManifest:
    'Manifeste de signature des fichiers du programme introuvable (mode développement ou première exécution) ; auto-vérification ignorée',
  appIntegrityManifestBroken:
    'Le manifeste de signature des fichiers du programme est corrompu et ne peut pas être analysé',
  appIntegritySigFail: 'Échec de la vérification du manifeste de signature des fichiers du programme : ',
  appIntegrityMismatch: 'Les fichiers du programme ne correspondent pas au manifeste de signature : ',
  manifestMissing: "L'objet manifeste est manquant",
  manifestNoSig: "Le manifeste n'a pas de signature",
  manifestSigInvalid:
    'Signature du manifeste invalide (le manifeste a peut-être été remplacé, altéré ou généré par un autre programme)',

  /* ---- Écran d'échec d'ouverture de la base de données (keystore.js → state.dbError) ---- */
  dbOpenFailed: "Échec de l'ouverture de la base de données ({dir}) : {msg}",
  dbTampered: '【Altération du fichier de données détectée : {reason}】',
  dbStillCantOpen: 'La base de données ne peut toujours pas être ouverte',
  dbLockedNeedPass: 'La base de données est chiffrée ; une phrase de passe est nécessaire pour la déverrouiller',

  /* ---- Boîte de sélection du répertoire de données (ipc/boot.js) ---- */
  pickDataDirTitle: 'Sélectionner le répertoire de données contenant archive.db (pour réparation/récupération)',

  /* ---- Enregistrements d'audit (action/détail affichés directement dans la liste d'audit des paramètres) ---- */
  auditDbIntegrity: "Alerte d'intégrité de la base de données",
  auditAppIntegrity: "Alerte d'intégrité des fichiers de l'application",
  auditIntegrityAction:
    'Cette session est passée en lecture seule et la base de signature ne sera pas reconstruite automatiquement',
  auditAppIntegrityReason: "Les fichiers de l'application ne correspondent pas au manifeste signé",
  integNoSig: 'Aucun fichier de signature ; considéré comme première exécution (persistNow établira la base)',
  integNoDbFile: 'Aucun fichier de base de données',
  chainDetailNone: 'Aucun enregistrement',

  /* ---- Noms d'actions d'audit et raisons d'échec de connexion (écrits dans audit_log, affichés dans la liste d'audit) ---- */
  actPackImport: 'Paquet de documents importé',
  actUserRegister: 'Utilisateur enregistré',
  actLoginFail: 'Échec de connexion',
  actLogin: 'Connexion',
  actResetPassword: 'Réinitialisation du mot de passe',
  actChangePassword: 'Mot de passe modifié',
  actSetQA: 'Questions de sécurité définies',
  actRecoverByQA: 'Mot de passe récupéré via les questions de sécurité',
  actChangeSetting: 'Paramètre modifié',
  actRegionUpdate: 'Région modifiée',
  actRegionCreate: 'Région créée',
  actRegionDelete: 'Région supprimée',
  actCatUpdate: 'Catégorie modifiée',
  actCatCreate: 'Catégorie créée',
  actCatDelete: 'Catégorie supprimée',
  actTagAutoCreate: 'Étiquette créée automatiquement',
  actTagUpdate: 'Étiquette modifiée',
  actTagCreate: 'Étiquette créée',
  actTagDelete: 'Étiquette supprimée',
  actFieldUpdate: 'Définition de champ modifiée',
  actFieldCreate: 'Définition de champ créée',
  actFieldDelete: 'Définition de champ supprimée',
  actPostUpdate: 'Document modifié',
  actPostCreate: 'Document créé',
  actPostMerge: 'Documents fusionnés',
  actPostTrash: 'Document déplacé vers la corbeille',
  actPostRestore: 'Document restauré',
  actPostPurge: 'Document supprimé définitivement',
  actPostVersionRestore: 'Version historique restaurée',
  actTransferPosts: 'Tous les documents transférés',
  actNoteCreate: 'Note créée',
  actNoteDelete: 'Note supprimée',
  sysUser: 'Système',
  unknownUser: 'Utilisateur inconnu',
  loginNoUser: "L'utilisateur n'existe pas",
  loginMacMismatch: 'Adresse MAC incompatible',
  loginBadPassword: 'Mot de passe incorrect',
  chainBrokenPrev:
    "Enregistrement #{id} : prev_hash ne correspond pas à l'enregistrement précédent (chaîne rompue) ; des lignes ont pu être supprimées ou insérées",
  chainBrokenContent: 'Enregistrement #{id} : le contenu ne correspond pas à self_hash (champs altérés)',
  chainOkDetail: '{n} enregistrements chaînés vérifiés ; chaîne intacte',
  mergeAppendMark: '[Ajouté par fusion {time}]',
  regionFallback: 'Région #{id}',
  categoryFallback: 'Catégorie #{id}',

  /* Texte des produits exportés (Markdown / PDF) */
  docFallbackName: 'Document',
  sharedDocTitle: 'Document partagé',
  uncategorized: 'Non classé',
  exportTitle: 'Export de documents',
  tagsLabel: 'étiquettes',
  fieldsBlock: 'Détails des champs',
  statusDraft: 'Brouillon',
  statusPublished: 'Publié',
  metaStatus: 'statut',
  metaRegion: 'région',
  metaCategory: 'catégorie',
  metaCreated: 'créé',
  metaUpdated: 'mis à jour',
  metaAuthor: 'auteur',
  exportFooter: 'Exporté le {time} · {n} document(s) · généré par {app}',

  /* Rapport d'importation de paquet de documents */
  packZipLabel: 'ZIP du paquet de documents ',
  importRegionName: 'Région importée',
  emptyTitle: '(sans titre)',
  impFieldFail: 'Champ {code} : {msg}',
  impItemFail: 'Ligne {n} : {msg}',
  impSkipEmptyTitle: 'Ligne {n} : titre vide, ignorée',
  impSkipDup: 'Ligne {n} « {title} » : valeur de champ en doublon, ignorée',
  impReasonEmptyTitle: 'Titre vide',
  impReasonDup: 'Valeur de champ en doublon avec « {title} »',
  impReasonMerged: 'Fusionné dans « {title} »',
  impReasonSuffix: 'Importation en doublon ; suffixe « importation en doublon » ajouté au titre',
  impReasonNoCheck: 'Créé à neuf sans vérification de doublon',
  impReasonCreated: 'Créé à neuf (vérification de doublon passée)',
  impExistingDoc: 'Document existant',
  impDupSuffix: '(importation en doublon {code})',
  impProgress: 'Traité {n}/{total}',

  /* Avertissements d'horloge */
  clockBackdrift:
    "Ce lancement est antérieur à l'enregistrement du lancement précédent ; l'horloge système a peut-être été retardée",
  clockRollback: "Retour en arrière de l'horloge système d'environ {n} seconde(s) détecté",
  clockJump: "Saut en avant de l'horloge système d'environ {n} minute(s) détecté",

  /* Page d'explication du réseau local (affichée lors d'un accès direct par navigateur) */
  lanPageTitle: '文档盒 Archbox · service de partage réseau local',
  lanPageH1: '文档盒 Archbox · service de partage réseau local',
  lanPageMeta: "Version {ver} · port {port} · en cours d'exécution",
  lanPageOk1:
    "Si vous voyez cette page, c'est que <b>le service fonctionne</b> — il n'a simplement pas d'interface web.",
  lanPageOk2:
    "Le contenu partagé sur le réseau local est récupéré par le <b>client « 文档盒 »</b> lui-même : ouvrez 「partage réseau local」 sur une autre machine où ce logiciel est installé et cet appareil apparaîtra automatiquement dans la liste (diffusion toutes les 5 secondes sur le même sous-réseau, aucune saisie manuelle d'adresse).",
  lanPageOk3: 'La navigation vers cette adresse dans un navigateur ne peut pas fonctionner, pour deux raisons :',
  lanPageLi1:
    "Le service n'accepte que <code>/api/…</code> avec un jeton d'accès — le jeton est obtenu par le client lors de la découverte et n'est pas disponible dans un navigateur.",
  lanPageLi2:
    "CORS n'est volontairement pas activé, donc un navigateur ne peut pas lire le contenu partagé de manière cross-origin.",
  lanPageOk4:
    'Pour vérifier si le service fonctionne, faites une requête vers <code>/health</code> ou <code>/api/version</code>.'
};
