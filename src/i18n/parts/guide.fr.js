export default {
  title: 'Documentation du logiciel',
  subtitle: "文档盒 Archbox · fonctionnalités du produit et guide d'utilisation",
  introTitle: 'Présentation du produit',
  introP1:
    '文档盒 Archbox est un poste de gestion documentaire hors ligne destiné aux petites et moyennes équipes comme aux particuliers. Toutes les données métier sont stockées dans un fichier SQLite unique en local ; les fonctionnalités restent complètes hors connexion et les données peuvent être migrées intégralement avec leur répertoire.',
  introP2:
    "Ce logiciel n'offre ni stockage cloud, ni synchronisation cloud de comptes, ni collaboration en ligne, ni résumé par IA. Tous les chemins susceptibles de faire sortir les données de l'appareil ont été fermés : le programme ne contient aucune fonction de synchronisation cloud ni de téléversement à distance.",
  scopeTitle: "Périmètre d'application",
  scopeYes: 'Périmètre applicable',
  scopeYesBody:
    "Destiné à l'archivage à long terme, à la recherche structurée et à la traçabilité vérifiable pour les particuliers et les petites équipes : archivage à deux niveaux « région → catégorie », étiquetage transversal global, six types de champs personnalisés, saisie riche mêlant texte et images (images intégrées en base64), instantanés d'historique de versions avec restauration complète, recherche plein texte et recherche dans la page, audit complet des opérations fondé sur une chaîne de hachage SHA-256, et chiffrement transparent AES-256-GCM en option. Les appareils d'un même réseau peuvent consulter en lecture seule le contenu des régions partagées via le « partage local ».",
  scopeNo: 'Périmètre non applicable',
  scopeNoBody:
    "Ce logiciel ne convient pas à l'édition collaborative en ligne à plusieurs, à l'accès mobile, à la publication de liens publics, ni à la gestion de grandes quantités d'images. La comparaison de versions ne couvre que le contenu textuel ; les changements d'images et de mise en page ne sont pas inclus. Le programme ne contient aucune fonction de synchronisation cloud.",
  scopeVerdictLabel: 'Critère de choix : ',
  scopeVerdict:
    "Si votre besoin central est « éditer en ligne le même document à plusieurs en même temps », ce logiciel ne convient pas ; s'il est « conserver durablement et en toute sécurité des documents importants en local, ouvrables à tout moment et utilisables hors ligne », ce logiciel convient.",
  featuresTitle: 'Fonctionnalités',
  f1Title: 'Archivage à deux niveaux et étiquettes globales',
  f1Body:
    "Les documents appartiennent à deux niveaux « région → catégorie », sans troisième niveau. Les étiquettes sont définies globalement, accrochées transversalement hors de la hiérarchie, pour marquer l'état d'un document (par ex. en cours, à relire, périmé), sans porter d'appartenance. Régions et catégories portent un code unique, soumis à une double contrainte de dédoublonnage applicatif et d'index unique en base.",
  f1Limit:
    "Limite : la hiérarchie d'archivage est fixée à deux niveaux. Les habitués des arborescences imbriquées devront s'adapter.",
  f2Title: 'Saisie riche texte et images',
  f2Body:
    "Éditeur riche basé sur Tiptap (ProseMirror), prenant en charge paragraphes, titres, listes, citations, lignes de séparation, blocs de code, liens, couleur de texte, alignement et taille de police, avec annulation/rétablissement au niveau des transactions. Les images sont intégrées directement au corps en base64, sans fichier séparé : sauvegarder le fichier de base de données suffit donc à sauvegarder intégralement le contenu illustré. Avant stockage et avant affichage, le contenu passe respectivement par l'assainissement par liste blanche sanitize-html puis par un second traitement DOMPurify.",
  f2Limit:
    'Limite : la taille des images pèse directement sur le fichier de base de données, qui grossit à mesure que les images se multiplient.',
  f3Title: 'Six types de champs personnalisés',
  f3Body:
    'Six types de champs sont pris en charge : texte, texte long, nombre, date, liste déroulante et lien. Les définitions de champs sont globales et partagées : créées une fois, elles sont réutilisables dans toutes les catégories, sans reconfiguration par catégorie.',
  f3Limit:
    "Limite : les définitions de champs s'appliquent à toutes les catégories ; un champ inutilisé dans une catégorie apparaîtra quand même dans son formulaire de saisie.",
  f4Title: 'Recherche plein texte et filtres',
  f4Body:
    "La recherche par mot-clé couvre le titre, le corps, les valeurs de champ et l'auteur, avec surlignage des résultats ; filtres multiples combinables par région, catégorie, étiquette, auteur, plage de dates, valeur de champ et origine. La page de détail d'un document prend en charge la recherche dans la page via Ctrl+F, portant sur le titre, les données de champ et le corps.",
  f4Limit:
    "Limite : la recherche par mot-clé ne couvre pas les noms d'étiquettes ; utilisez le filtre pour les étiquettes.",
  f5Title: "Instantanés d'historique et restauration",
  f5Body:
    "Chaque enregistrement génère automatiquement un instantané historique : aperçu de n'importe quelle version, restauration complète en un clic, ou comparaison côte à côte champ par champ d'une version avec le contenu actuel, en signalant ajouts, suppressions et modifications.",
  f5Limit:
    "Limite : seuls les contenus textuels sont comparés, les changements d'images et de mise en page ne sont pas visibles ; chaque enregistrement génère un instantané, indépendamment de toute modification réelle du contenu.",
  f6Title: 'Chiffrement transparent et audit vérifiable',
  f6Body:
    "Le fichier de base de données peut être chiffré en AES-256-GCM ; la phrase secrète dérive la clé via scrypt (N=16384). Les opérations clés sont consignées dans une chaîne de hachage SHA-256 (avec bloc de genèse), vérifiable en un clic pour confirmer que les données n'ont pas été altérées.",
  f6Limit:
    "Remarques : ① le chiffrement est désactivé par défaut et doit être activé dans « Paramètres → Chiffrement des données » ; ② la phrase secrète de la base est irrécupérable en cas d'oubli (aucune porte dérobée), mais le mot de passe du compte peut être réinitialisé via les questions de sécurité, les deux étant indépendants.",
  f7Title: 'Sauvegarde automatique',
  f7Body:
    'Sauvegarde de la base vers un répertoire désigné chaque jour ou chaque semaine, avec option de sauvegarde à la fermeture. Les 5 sauvegardes les plus récentes sont conservées, les plus anciennes étant automatiquement supprimées.',
  f7Limit:
    "Remarque : la sauvegarde automatique est désactivée par défaut ; il est conseillé de l'activer lors de la première configuration.",
  f8Title: 'Partage en lecture seule sur le même réseau',
  f8Body:
    "Les appareils d'un même réseau ayant installé ce logiciel et accédé au « partage local » découvrent automatiquement les sources de partage (une balise est diffusée toutes les 5 secondes, sans transmission manuelle d'adresse ; si le correspondant n'apparaît pas, cliquez sur « Redécouvrir » en secours). Le contenu partagé est en lecture seule, avec recherche et recherche dans la page de détail. Les brouillons, modèles et le contenu de la corbeille ne sont pas partagés.",
  f8Limit:
    "Limite : le partage est en lecture seule, le correspondant ne peut pas modifier vos données locales ; la copie de documents est interdite par défaut et doit être explicitement autorisée dans « Mon partage » en activant « Autoriser la copie vers cet appareil ». Le service de partage n'offre pas d'interface web ; accéder directement à l'adresse dans un navigateur n'affiche qu'une page d'explication.",
  f9Title: 'Migration en fichier unique',
  f9Body:
    "Export au format de pack .archboxpack (structure ZIP, avec manifeste, sommes de contrôle et signature), couvrant corps, images, champs, étiquettes, régions et catégories. À l'import, le dédoublonnage se fait par titre, région et catégorie, avec quatre stratégies : ignorer, fusionner, créer et sans dédoublonnage.",
  f9Limit: 'Limite : la taille du pack augmente avec les images intégrées ; vérifiez-la avant transfert.',
  f10Title: "Huit thèmes d'apparence",
  f10Body:
    'Six palettes intégrées — affaires clair, affaires sombre, fil de fer noir et blanc, bambou, bois de santal, ciel bleu — plus deux thèmes hommages CS1.6 et Half-Life, commutables en un clic.',
  f10Limit: 'Limite : pas de bascule automatique clair/sombre selon le système ; la sélection est manuelle.',
  passwordTitle: 'Mot de passe du compte et phrase secrète de la base',
  pwAccount: 'Mot de passe du compte',
  pwAccountBody:
    "Identifiant utilisé pour se connecter au logiciel. En cas d'oubli, le mot de passe peut être réinitialisé directement via les trois paires de questions de sécurité définies lors de l'enregistrement. Assurez-vous de les avoir remplies fidèlement et de pouvoir vous en souvenir.",
  pwDb: 'Phrase secrète de la base de données',
  pwDbBody:
    "Identifiant indépendant utilisé pour le chiffrement de la base. La phrase secrète n'est jamais stockée en clair ; la clé en est dérivée via scrypt, sans porte dérobée ni canal de récupération manuelle : en cas d'oubli, les données deviendront définitivement illisibles. Cette phrase secrète n'est utilisée qu'après activation du chiffrement ; sans chiffrement, elle n'intervient pas.",
  pwNote:
    "Ce logiciel n'a pas d'assistant de premier démarrage. À la première ouverture après installation, vous arrivez sur la page de connexion/inscription ; il suffit de terminer l'enregistrement du compte pour accéder à l'interface principale.",
  startTitle: 'Guide de première utilisation',
  s1: "Enregistrer un compte. À la première ouverture, c'est la page de connexion ; l'inscription requiert nom d'utilisateur, mot de passe et trois paires de questions de sécurité (pour la récupération du mot de passe), sans assistant.",
  s2: 'Confirmer le besoin de chiffrement. Le logiciel fonctionne aussi sans chiffrement ; pour chiffrer, activez-le dans « Paramètres → Chiffrement des données » et conservez précieusement la phrase secrète de la base. Cette option est désactivée par défaut.',
  s3: "Créer la première région et définir son code. Le code est obligatoire et unique dans toute la bibliothèque (ex. HR, FIN) ; il servira à la numérotation des documents et à l'export des packs, remplissez-le soigneusement.",
  s4: "Créer des catégories sous la région. Le code de catégorie doit lui aussi être unique. La structure d'archivage est alors en place ; notez que la hiérarchie est fixée à deux niveaux.",
  s5: "Planifier le système d'étiquettes. Les étiquettes sont globales et partagées ; nommez-les selon l'étape du document plutôt que selon son appartenance.",
  s6: 'Définir les champs nécessaires. Dans « Gestion agrégée », créez les définitions de champs (numéro de contrat, date de signature, montant, etc.), réutilisables globalement.',
  s7: "Saisir le premier document. Cliquez sur « Nouveau » sous une région ou une catégorie, remplissez le titre, composez le corps, insérez des images et renseignez les champs. L'enregistrement générera en même temps un instantané historique.",
  s8: 'Se familiariser avec les deux modes de recherche. La barre de recherche en haut prend en charge la recherche par mot-clé combinée à des filtres ; pour localiser du texte dans un long document, utilisez la recherche dans la page via Ctrl+F sur la page de détail.',
  s9: 'Activer la sauvegarde automatique. Dans « Paramètres → Données », activez la sauvegarde automatique et désignez un répertoire. Cette option est désactivée par défaut ; configurez-la au plus tôt.',
  s10: "Activer le partage local selon les besoins. Dans « Partage local », activez l'interrupteur de partage et cochez les régions cibles. Les appareils du même réseau découvriront automatiquement cet appareil ; le jeton d'accès est activé par défaut, le correspondant doit le saisir une fois pour consulter en lecture seule ; en désactivant « La connexion requiert un jeton d'accès », la connexion est immédiate, mais tout appareil du même réseau peut s'y connecter — choisissez prudemment.",
  tamperTitle: "Protection de l'intégrité du programme",
  tamperIntro:
    'Ce logiciel vérifie à deux niveaux si les fichiers du programme ont été modifiés. Les conditions de déclenchement et les traitements diffèrent ; veuillez les distinguer :',
  tamperLayer1: 'Niveau corps',
  tamperLayer1Body:
    "Le code du programme (interface, logique métier et script d'entrée) est encapsulé dans resources\\app.asar ; son empreinte est inscrite dans l'exécutable Archbox.exe lui-même et vérifiée par le runtime Electron tout au début du démarrage, avant toute exécution du code métier ; ce logiciel ne peut ni l'intercepter ni en avertir. En cas d'échec, le double-clic n'ouvre aucune fenêtre et le processus se termine directement. C'est une défaillance dure et délibérée de ce niveau : « fenêtre absente et fermeture immédiate » est le signal d'une modification du programme principal.",
  tamperLayer2: 'Niveau annexe',
  tamperLayer2Body:
    "Quelques fichiers impossibles à intégrer dans l'archive (comme le module WebAssembly du moteur de base de données) se trouvent dans resources\\app.asar.unpacked, comparés un à un à la liste des signatures par ce logiciel à chaque démarrage. En cas de différence : ① une barre d'alerte permanente en haut de l'interface (repliable) ; ② une inscription au journal d'audit, une par démarrage, impossible à effacer automatiquement ; ③ un détail diagnostic avec les noms de fichiers concernés, leurs hachages d'origine et actuels. Ce niveau n'affecte pas les droits d'écriture ; l'écriture des données est jugée séparément par « l'intégrité du fichier de données », les deux vérifications étant volontairement séparées.",
  tamperNote:
    "Limites de capacité : le niveau corps est garanti par l'exécutable lui-même — une fois modifié, le programme ne démarre plus ; le niveau annexe laisse une trace de modification sans blocage absolu, protégeant contre les modifications involontaires, les altérations silencieuses d'un logiciel de sécurité et les remplacements accidentels. Si fichier et liste de signatures sont falsifiés simultanément, le contournement reste théoriquement possible, mais laissera une trace dans la chaîne d'audit.",
  crashTitle: 'Diagnostic des échecs de démarrage',
  c1: "Distinguer d'abord les symptômes. Aucune fenêtre et processus qui s'éteint aussitôt : voir l'étape 2 ; une fenêtre s'ouvre mais un message apparaît dans l'interface : suivez la procédure indiquée.",
  c2: "« Fenêtre absente et fermeture immédiate » signifie que le corps du programme a été modifié ou qu'un fichier est endommagé. La cause la plus fréquente est la mise en quarantaine, la suppression ou la modification d'octets d'Archbox.exe ou d'app.asar par un logiciel de sécurité, ou une installation incomplète, ou une erreur d'écriture disque.",
  c3: "Le traitement consiste à réinstaller. Récupérez le paquet depuis un canal officiel et réinstallez par-dessus au même emplacement ; les données ne sont pas stockées dans le répertoire du programme, la réinstallation n'affecte donc pas les données. Si le logiciel de sécurité bloque à répétition, ajoutez le répertoire du programme à sa liste de confiance puis réinstallez.",
  c4: "Pourquoi cette vérification n'affiche aucun message : elle s'exécute avant le code métier, c'est un comportement interne de l'exécutable, ce logiciel n'a aucune occasion d'insérer un message. Cette page d'explication tient lieu de message correspondant.",
  c5: 'Emplacement des journaux : lorsque le programme démarre normalement, les journaux sont écrits dans {dir}, avec des noms de fichiers comme app-2026-10-17.log, en rotation quotidienne, conservés 7 jours (vous pouvez copier directement le chemin complet ci-dessus, ou cliquer sur « Ouvrir le répertoire des journaux » dans « Paramètres → Journal d’exécution »). Remarque : le répertoire des journaux est au même niveau que le répertoire de données, mais pas à l’intérieur de celui-ci. Les premières lignes de démarrage contiennent la mention « autotest des fichiers du programme réussi / non activé / échoué », qui relève du niveau annexe.',
  unfitTitle: 'Scénarios non adaptés',
  unfitLead: "Dans l'un des cas suivants, il est conseillé de choisir un autre outil :",
  u1: "Besoin d'éditer le même document à plusieurs en même temps. Ce logiciel est un poste de travail individuel ; le partage en lecture seule est sa limite, sans collaboration en temps réel.",
  u2: "Besoin de consulter à tout moment depuis un téléphone ou une tablette. Ce logiciel est une application de bureau ; le partage local s'adresse à des ordinateurs équipés du même logiciel, ce n'est ni une page web ni une offre mobile.",
  u3: 'Besoin de générer des liens publics. Le partage est limité au même réseau et désactivable à tout moment, inadapté à une diffusion publique.',
  u4: "Besoin de gérer des dizaines de milliers d'images. Les images étant stockées en intégration, la base grossira continuellement ; un outil professionnel de gestion de ressources est recommandé.",
  u5: "L'équipe ne peut accepter que les données n'existent que sur un seul appareil. C'est un préalable de conception de ce logiciel, sans compromis.",
  coda: 'Si vos documents doivent être stockés durablement en local, ouverts à tout moment et insensibles à la connexion, ce logiciel est le choix adapté à ce scénario.',
  tail: "Le contenu de cette page évolue avec les versions. L'environnement d'exécution, les composants open source et la licence figurent sur la page « À propos ». Version de test actuelle ; les fonctionnalités et les textes explicatifs sont susceptibles d'être ajustés."
};
