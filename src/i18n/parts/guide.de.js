export default {
  title: 'Softwarehinweise',
  subtitle: '文档盒 Archbox · Produktfunktionen und Nutzungshinweise',
  introTitle: 'Produktüberblick',
  introP1:
    '文档盒 Archbox ist eine Offline-Dokumentenverwaltungs-Workstation für kleine und mittlere Teams sowie Einzelpersonen. Alle Geschäftsdaten werden in einer einzelnen lokalen SQLite-Datei gespeichert; die Funktionalität ist auch offline vollständig, und die Daten können zusammen mit dem Verzeichnis vollständig migriert werden.',
  introP2:
    'Diese Software bietet keine Cloud-Speicherung, keine Konto-Cloud-Synchronisierung, keine Online-Zusammenarbeit und keine KI-Zusammenfassung. Alle Pfade, über die Daten die Maschine verlassen könnten, sind geschlossen: Die Cloud-Synchronisierung ist lediglich eine reservierte Schnittstelle und standardmäßig deaktiviert.',
  scopeTitle: 'Einsatzbereich',
  scopeYes: 'Einsatzbereich',
  scopeYesBody:
    'Für Einzelpersonen und kleine Teams, die langfristige Archivierung, strukturierte Suche und überprüfbare Nachvollziehbarkeit benötigen: zweistufige Archivierung „Bereich → Kategorie“, horizontale Markierung durch globale Tags, sechs Arten benutzerdefinierter Felder, gemischte Text-Bild-Erfassung (Bilder werden base64-inline gespeichert), Versions-Snapshots mit vollständiger Wiederherstellung, Volltextsuche und seiteninterne Suche, vollständige Auditierung auf Basis einer SHA-256-Hash-Kette sowie optionale AES-256-GCM-Transparenzverschlüsselung. Geräte im selben Netzsegment können über die „LAN-Freigabe“ die freigegebenen Bereiche schreibgeschützt durchsuchen.',
  scopeNo: 'Nicht einsetzbar für',
  scopeNoBody:
    'Diese Software eignet sich nicht für die gleichzeitige Online-Bearbeitung durch mehrere Personen, mobilen Zugriff, öffentlich geteilte Links sowie die Verwaltung großer Bildbestände. Der Versionsvergleich umfasst nur Textinhalte; Änderungen an Bildern und Layout werden nicht verglichen. Die Cloud-Synchronisierung ist im Programm nur ein reservierter Platzhalter und nicht implementiert.',
  scopeVerdictLabel: 'Auswahlentscheidung: ',
  scopeVerdict:
    'Ist das Kernanliegen „mehrere Personen bearbeiten gleichzeitig online dasselbe Dokument“, passt diese Software nicht; ist das Kernanliegen „wichtige Dokumente langfristig und sicher lokal speichern, jederzeit öffnen, offline verfügbar“, ist diese Software geeignet.',
  featuresTitle: 'Funktionsmerkmale',
  f1Title: 'Zweistufige Archivierung und globale Tags',
  f1Body:
    'Dokumente werden zweistufig nach „Bereich → Kategorie“ zugeordnet, ohne dritte Ebene. Tags sind global definiert und hängen horizontal außerhalb der Hierarchie, um den Dokumentstatus zu kennzeichnen (z. B. in Bearbeitung, zur Prüfung, verworfen), ohne Zugehörigkeitsbedeutung. Bereiche und Kategorien tragen jeweils einen eindeutigen Code mit doppelter Absicherung durch Duplikatprüfung auf Anwendungsebene und eindeutigen Datenbankindex.',
  f1Limit:
    'Einschränkung: Die Archivierungsebene ist auf zwei Stufen festgelegt. Nutzer, die mehrstufige Verzeichnisverschachtelung gewohnt sind, müssen sich anpassen.',
  f2Title: 'Gemischte Text-Bild-Erfassung',
  f2Body:
    'Ein Rich-Text-Editor auf Basis von Tiptap (ProseMirror) unterstützt Absätze, Überschriften, Listen, Zitate, Trennlinien, Codeblöcke, Links, Textfarbe, Ausrichtung und Schriftgröße; Rückgängig/Wiederholen arbeiten transaktionsbasiert. Bilder werden base64 direkt inline in den Text eingebettet, ohne separate Dateien zu erzeugen; die Sicherung der Datenbankdatei entspricht damit der vollständigen Sicherung bildhaltiger Inhalte. Inhalte werden vor dem Speichern und vor der Anzeige jeweils durch sanitize-html-Whitelist-Bereinigung und DOMPurify-Zweitverarbeitung geführt.',
  f2Limit:
    'Einschränkung: Die Bildgröße geht direkt in die Datenbankdatei ein; bei vielen Bildern wächst das Datenbankvolumen entsprechend.',
  f3Title: 'Sechs Arten benutzerdefinierter Felder',
  f3Body:
    'Unterstützt sechs Feldtypen: Text, Langtext, Zahl, Datum, Dropdown und Link. Felddefinitionen sind global geteilt und werden einmal erstellt, um in allen Kategorien wiederverwendet zu werden, ohne sie pro Kategorie erneut zu konfigurieren.',
  f3Limit:
    'Einschränkung: Felddefinitionen gelten für alle Kategorien; in einzelnen Kategorien ungenutzte Felder erscheinen ebenfalls im Erfassungsformular.',
  f4Title: 'Volltextsuche und Filterung',
  f4Body:
    'Die Stichwortsuche deckt Titel, Text, Feldwerte und Autor ab, Treffer werden hervorgehoben; kombinierbar mit Mehrfachfilterung nach Bereich, Kategorie, Tag, Autor, Datumsbereich, Feldwert und Herkunft. Die Detailseite unterstützt die seiteninterne Suche mit Ctrl+F über Titel, Felddaten und Text.',
  f4Limit: 'Einschränkung: Die Stichwortsuche findet keine Tagnamen; für Tags verwenden Sie bitte den Filter.',
  f5Title: 'Versions-Snapshots und Wiederherstellung',
  f5Body:
    'Bei jedem Speichern wird automatisch ein Snapshot erstellt; jede historische Version kann in der Vorschau betrachtet, mit einem Klick vollständig wiederhergestellt oder zum feldweisen Vergleich mit dem aktuellen Inhalt nebeneinander gelegt werden, wobei Hinzufügungen, Löschungen und Änderungen markiert werden.',
  f5Limit:
    'Einschränkung: Es werden nur Textinhalte verglichen, Bild- und Layoutänderungen sind nicht sichtbar; bei jedem Speichern wird ein Snapshot erzeugt, unabhängig davon, ob sich der Inhalt tatsächlich geändert hat.',
  f6Title: 'Transparenzverschlüsselung und überprüfbare Auditierung',
  f6Body:
    'Die Datenbankdatei kann optional mit AES-256-GCM verschlüsselt werden; das Passwort leitet den Schlüssel über scrypt (N=16384) ab. Kritische Vorgänge werden in eine SHA-256-Hash-Kette geschrieben (inklusive Genesis-Block) und können per Klick überprüft werden, um festzustellen, ob Daten verändert wurden.',
  f6Limit:
    'Hinweis: ① Die Verschlüsselung ist standardmäßig deaktiviert und muss unter „Einstellungen → Datenverschlüsselung“ manuell aktiviert werden; ② ein vergessenes Datenbankpasswort ist nicht wiederherstellbar (keine Hintertür), das Kontopasswort kann jedoch über Sicherheitsfragen zurückgesetzt werden; beide sind voneinander unabhängig.',
  f7Title: 'Automatische Sicherung',
  f7Body:
    'Unterstützt die tägliche oder wöchentliche Sicherung der Datenbank in ein festgelegtes Verzeichnis sowie die Sicherung beim Beenden. Die letzten 5 Sicherungen werden zyklisch aufbewahrt, ältere werden automatisch rotiert.',
  f7Limit:
    'Hinweis: Die automatische Sicherung ist standardmäßig deaktiviert; es wird empfohlen, sie bei der ersten Konfiguration zu aktivieren.',
  f8Title: 'Schreibgeschützte Freigabe im selben Netzsegment',
  f8Body:
    'Geräte im selben Netzsegment, die diese Software installiert haben und die „LAN-Freigabe“ öffnen, erkennen die Freigabequellen automatisch (alle 5 Sekunden wird ein Beacon gesendet, keine manuelle Adressübergabe nötig; erscheint der Gegenüber nicht in der Liste, kann „Erneut erkennen“ als manuelle Sicherung genutzt werden). Freigegebene Inhalte sind schreibgeschützt und unterstützen Suche sowie seiteninterne Suche auf der Detailseite. Entwürfe, Vorlagen und Papierkorb-Inhalte werden nicht freigegeben.',
  f8Limit:
    'Einschränkung: Die Freigabe ist schreibgeschützt, andere können lokale Daten nicht ändern; das Kopieren von Dokumenten ist standardmäßig nicht erlaubt und muss unter „Meine Freigabe“ mit „Kopieren auf diese Maschine erlauben“ explizit aktiviert werden. Der Freigabedienst bietet keine Weboberfläche; beim direkten Aufruf der Adresse im Browser wird nur eine Hinweisseite angezeigt.',
  f9Title: 'Migration als Einzeldatei',
  f9Body:
    'Unterstützt den Export von Dokumentpaketen im Format .archboxpack (ZIP-Struktur mit Manifest, Prüfsummen und Signatur), der Umfang deckt Text, Bilder, Felder, Tags, Bereiche und Kategorien ab. Beim Import erfolgt die Dublettenerkennung nach Titel, Bereich und Kategorie mit vier Strategien: Überspringen, Zusammenführen, Neu anlegen und Keine Dublettenerkennung.',
  f9Limit:
    'Einschränkung: Das Paketvolumen wächst mit den eingebetteten Bildern; prüfen Sie die Größe vor der Übertragung.',
  f10Title: 'Acht Erscheinungsthemen',
  f10Body:
    'Sechs integrierte Farbschemata — Business Hell, Business Dunkel, Schwarz-Weiß-Linienraster, Bambusgrün, Sandelholzbraun und Himmelsblau — sowie zwei Hommage-Themen CS1.6 und Half-Life, per Klick umschaltbar.',
  f10Limit:
    'Einschränkung: Automatischer Wechsel zwischen hellem/dunklem Systemmodus wird nicht unterstützt, die Auswahl erfolgt manuell.',
  passwordTitle: 'Kontopasswort und Datenbankpasswort',
  pwAccount: 'Kontopasswort',
  pwAccountBody:
    'Anmeldedaten für diese Software. Nach dem Vergessen kann das Passwort über die drei bei der Registrierung eingerichteten Sicherheitsfragen direkt zurückgesetzt werden. Stellen Sie sicher, dass die Sicherheitsfragen wahrheitsgemäß ausgefüllt und die Antworten erinnerbar sind.',
  pwDb: 'Datenbankpasswort',
  pwDbBody:
    'Unabhängige Anmeldedaten für die Datenbankverschlüsselung. Das Passwort wird nicht im Klartext gespeichert; der Schlüssel wird per scrypt abgeleitet, ohne Hintertür oder manuellen Wiederherstellungsweg — bei Verlust sind die Daten dauerhaft unlesbar. Dieses Passwort wird nur nach Aktivierung der Verschlüsselung verwendet; ohne Verschlüsselung kommt es nicht zum Einsatz.',
  pwNote:
    'Diese Software bietet keinen Erststart-Assistenten. Nach der Installation ist die erste Ansicht die Anmelde-/Registrierungsseite; nach der Konto-Registrierung gelangen Sie direkt zur Hauptoberfläche.',
  startTitle: 'Anleitung für den ersten Einsatz',
  s1: 'Konto registrieren. Beim ersten Öffnen erscheint die Anmeldeseite; zur Registrierung werden Benutzername, Passwort und drei Sicherheitsfragen (zur Passwortwiederherstellung) benötigt, ohne Assistenten.',
  s2: 'Verschlüsselungsbedarf klären. Ohne Verschlüsselung ist die Nutzung ebenfalls möglich; falls Verschlüsselung gewünscht ist, aktivieren Sie sie unter „Einstellungen → Datenverschlüsselung“ und bewahren Sie das Datenbankpasswort sorgfältig auf. Diese Option ist standardmäßig deaktiviert.',
  s3: 'Legen Sie den ersten Bereich an und vergeben Sie den Code. Der Code ist Pflicht und datenbankweit eindeutig (z. B. HR, FIN); er wird für Dokumentnummern und Paketexport verwendet, bitte sorgfältig ausfüllen.',
  s4: 'Legen Sie unter dem Bereich Kategorien an. Der Kategoriecode muss ebenfalls eindeutig sein. Damit ist das Archivgerüst fertig; beachten Sie, dass die Hierarchie auf zwei Ebenen festgelegt ist.',
  s5: 'Planen Sie das Tag-System. Tags sind global geteilt; benennen Sie sie nach dem Dokumentstadium statt nach der Zugehörigkeit.',
  s6: 'Definieren Sie die benötigten Felder. Gehen Sie zu „Aggregationsverwaltung“ und legen Sie nach Bedarf Felddefinitionen wie Vertragsnummer, Unterzeichnungsdatum, Betrag an — global wiederverwendbar.',
  s7: 'Erfassen Sie das erste Dokument. Klicken Sie im Bereich oder in der Kategorie auf „Neu“, füllen Sie den Titel, gestalten Sie den Text, fügen Sie Bilder ein und füllen Sie die Felder aus. Beim Speichern wird gleichzeitig ein Versions-Snapshot erzeugt.',
  s8: 'Machen Sie sich mit beiden Sucharten vertraut. Das Suchfeld oben unterstützt die Stichwortsuche mit kombinierbaren Filtern; zur Positionierung in langen Dokumenten nutzen Sie die seiteninterne Suche mit Ctrl+F auf der Detailseite.',
  s9: 'Automatische Sicherung aktivieren. Gehen Sie zu „Einstellungen → Daten“, aktivieren Sie die automatische Sicherung und legen Sie das Verzeichnis fest. Diese Option ist standardmäßig deaktiviert; es wird empfohlen, sie früh zu konfigurieren.',
  s10: 'LAN-Freigabe nach Bedarf aktivieren. Gehen Sie zu „LAN-Freigabe“, schalten Sie die Freigabe ein und wählen Sie die Zielbereiche. Geräte im selben Netzsegment erkennen diese Maschine automatisch; das Zugriffstoken ist standardmäßig aktiviert, der Gegenüber muss das Token einmal manuell eingeben, um schreibgeschützt zu browsen. Durch Deaktivieren von „Zugriffstoken erforderlich“ verbindet man sich mit einem Klick, aber jedes Gerät im selben Netzsegment kann dann zugreifen — bitte sorgfältig wählen.',
  tamperTitle: 'Hinweise zum Programmintegritätsschutz',
  tamperIntro:
    'Diese Software prüft, ob Programmdateien verändert wurden, auf zwei Ebenen. Die Auslösebedingungen und Handhabung unterscheiden sich — bitte beachten:',
  tamperLayer1: 'Hauptebene',
  tamperLayer1Body:
    'Der Programmcode (Oberfläche, Geschäftslogik und Einstiegsskripte) ist in resources\\app.asar verpackt; sein Fingerabdruck wird in die ausführbare Datei Archbox.exe selbst geschrieben und von der Electron-Laufzeit bereits in der frühesten Startphase geprüft — vor jeder Geschäftslogik, sodass diese Software nicht eingreifen oder warnen kann. Schlägt die Prüfung fehl, erscheint nach dem Doppelklick kein Fenster und der Prozess beendet sich sofort. Dies ist ein bewusstes, hartes Fehlschlagverhalten dieser Ebene: „kein Fenster, sofortiges Beenden“ ist das Signal, dass das Hauptprogramm verändert wurde.',
  tamperLayer2: 'Zusatzebene',
  tamperLayer2Body:
    'Wenige Dateien, die nicht ins Archiv verpackt werden können (z. B. das WebAssembly-Modul der Datenbank-Engine), liegen in resources\\app.asar.unpacked und werden von dieser Software bei jedem Start einzeln gegen die Signaturliste geprüft. Bei Abweichungen: ① erscheint oben dauerhaft ein Warnbanner (einklappbar); ② wird ein Audit-Logeintrag geschrieben, der bei jedem Start einmal erfasst und nicht automatisch gelöscht wird; ③ werden konkrete Dateinamen mit Original- und Ist-Hash als diagnostische Details angezeigt. Diese Ebene beeinträchtigt die Schreibberechtigung nicht; die Schreibbarkeit der Daten wird unabhängig durch die „Datenintegrität“ beurteilt — beide Prüfungen sind bewusst getrennt.',
  tamperNote:
    'Leistungsgrenze: Die Hauptebene wird intern von der ausführbaren Datei garantiert; nach einer Veränderung startet das Programm nicht mehr. Die Zusatzebene bietet eine Nachvollziehbarkeit der Veränderung statt einer absoluten Verhinderung und schützt vor unbeabsichtigten Änderungen, stillen Modifikationen durch Sicherheitssoftware und Fehlersetzungen. Werden Dateien und Signaturliste gleichzeitig manipuliert, ist eine Umgehung theoretisch möglich, hinterlässt aber Spuren in der Audit-Kette.',
  crashTitle: 'Fehlerbehebung bei Startproblemen',
  c1: 'Unterscheiden Sie zuerst das Fehlerbild. Kein Fenster und ein kurz aufblitzender Prozess — siehe Schritt 2; ein Fenster mit Hinweis in der Oberfläche — folgen Sie dem im Hinweis angegebenen Weg.',
  c2: '„Kein Fenster, sofortiges Beenden“ bedeutet, dass das Hauptprogramm verändert oder die Datei beschädigt wurde. Häufigste Ursache ist, dass Sicherheitssoftware Archbox.exe oder app.asar isoliert, bereinigt oder byteweise verändert hat; möglich sind auch unvollständige Installation oder Festplatten-Schreibfehler.',
  c3: 'Die Lösung ist eine Neuinstallation. Beziehen Sie das Programmpaket aus offizieller Quelle und installieren Sie es über denselben Speicherort — die Daten liegen nicht im Programmverzeichnis, eine Überinstallation beeinträchtigt die Daten nicht. Wird die Software von Sicherheitssoftware wiederholt blockiert, fügen Sie das Programmverzeichnis zur Vertrauensliste hinzu und installieren Sie erneut.',
  c4: 'Warum es bei dieser Ebene keine Dialogwarnung gibt: Die Prüfung läuft vor der Geschäftslogik und ist internes Verhalten der ausführbaren Datei; diese Software hat keine Gelegenheit, einen Hinweis einzufügen. Diese Hinweisseite ist die entsprechende Information.',
  c5: 'Protokollort: Bei normalem Start schreibt das Protokoll nach {dir}, Dateinamen wie app-2026-10-17.log, täglich rotiert und 7 Tage aufbewahrt (Sie können den vollständigen Pfad direkt kopieren oder unter „Einstellungen → Laufzeitprotokoll“ auf „Protokollverzeichnis öffnen“ klicken). Hinweis: Das Protokollverzeichnis liegt auf derselben Ebene wie das Datenverzeichnis, nicht innerhalb des Datenverzeichnisses. Die ersten Zeilen des Starts enthalten den Eintrag „Programmdatei-Selbsttest bestanden / nicht aktiviert / nicht bestanden“, das Ergebnis der Zusatzebenen-Prüfung.',
  unfitTitle: 'Ungeeignete Szenarien',
  unfitLead: 'Wenn einer der folgenden Fälle zutrifft, wird ein anderes Werkzeug empfohlen:',
  u1: 'Mehrere Personen müssen gleichzeitig dasselbe Dokument bearbeiten. Diese Software ist ein Einzelarbeitsplatz; die schreibgeschützte Freigabe ist die Obergrenze, Echtzeit-Zusammenarbeit wird nicht geboten.',
  u2: 'Mobil oder per Tablet jederzeit einsehen. Diese Software ist eine Desktop-Anwendung; die LAN-Freigabe richtet sich an Computer mit derselben Software, ist keine Webseite und bietet keinen mobilen Zugang.',
  u3: 'Öffentlich teilbare Links erzeugen. Die Freigabe ist auf dasselbe Netzsegment beschränkt und jederzeit abschaltbar, nicht für öffentliche Veröffentlichung geeignet.',
  u4: 'Zehntausende Bilder verwalten. Bilder werden inline gespeichert, das Datenbankvolumen wächst kontinuierlich; ein professionelles Asset-Management-Werkzeug wird empfohlen.',
  u5: 'Das Team akzeptiert keine Speicherung der Daten nur auf einem einzigen Gerät. Dies ist die Designprämisse dieser Software, ohne Kompromisslösung.',
  coda: 'Müssen Dokumente langfristig und stabil lokal gespeichert werden, jederzeit öffnbar und offline unabhängig, ist diese Software die passende Wahl für dieses Szenario.',
  tail: 'Der Inhalt dieser Seite wird mit Versionen aktualisiert. Laufzeitumgebung, Open-Source-Komponenten und Lizenzvereinbarung finden Sie auf der Seite „Über“. Aktuell handelt es sich um eine Testversion; Funktionen und Beschreibungstexte können weiter angepasst werden.'
};
