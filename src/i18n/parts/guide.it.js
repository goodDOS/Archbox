/** Pagina Guida del software (stile documentazione formale) */
export default {
  title: 'Guida del software',
  subtitle: 'Archbox · Funzioni e uso del prodotto',
  introTitle: 'Panoramica del prodotto',
  introP1:
    "Archbox è una postazione documenti offline e monoutente per piccoli team e privati. Tutti i dati operativi sono salvati in un unico file SQLite sulla macchina locale. Ogni funzione resta pienamente disponibile senza connessione di rete, e i dati si migrano spostando l'intera cartella dati.",
  introP2:
    'Il software non offre archiviazione cloud, sincronizzazione di account cloud, collaborazione online né riassunti AI. Ogni percorso che potrebbe portare dati fuori dalla macchina locale è stato chiuso: il programma non contiene alcuna funzione di sincronizzazione cloud o caricamento remoto.',
  scopeTitle: "Ambito d'uso",
  scopeYes: 'Adatto a',
  scopeYesBody:
    'Scenari di gestione documentale che richiedono archiviazione a lungo termine, recupero strutturato e tracce di controllo verificabili, per privati e piccoli team: archiviazione a due livelli (Area → Categoria), tag globali, sei tipi di campo personalizzati, inserimento rich text con immagini base64 inline, snapshot delle versioni storiche e ripristino completo, ricerca full-text e ricerca nella pagina, registro di controllo con catena di hash SHA-256 per ogni operazione, e cifratura trasparente AES-256-GCM opzionale. I dispositivi sulla stessa LAN possono consultare in sola lettura le aree condivise tramite Condivisione LAN.',
  scopeNo: 'Non adatto a',
  scopeNoBody:
    "Il software non è pensato per la modifica simultanea da più utenti, l'accesso da mobile, la pubblicazione di link pubblici o la gestione di grandi librerie di immagini. Il confronto tra versioni copre solo il testo; modifiche a immagini e impaginazione sono fuori ambito. Il programma non contiene alcuna funzione di sincronizzazione cloud.",
  scopeVerdictLabel: 'Come scegliere: ',
  scopeVerdict:
    'Se l\'esigenza principale è "più persone che modificano lo stesso documento online contemporaneamente", questo software non è adatto. Se l\'esigenza è "documenti importanti custoditi al sicuro su questa macchina, apribili in qualsiasi momento, utilizzabili offline", lo è.',
  featuresTitle: 'Funzioni',
  f1Title: 'Archiviazione a due livelli e tag globali',
  f1Body:
    'I documenti appartengono esattamente a due livelli: Area → Categoria. Non esiste un terzo livello. I tag sono definiti globalmente e si applicano trasversalmente alla gerarchia per esprimere lo stato del documento (in corso, in revisione, annullato), non la proprietà. Aree e categorie hanno ciascuna un codice univoco, garantito sia da controlli applicativi sui duplicati sia da un indice univoco nel database.',
  f1Limit:
    'Limite: la profondità di archiviazione è fissa a due livelli. Chi è abituato a cartelle annidate in profondità dovrà adattarsi.',
  f2Title: 'Inserimento rich text con immagini',
  f2Body:
    'Editor basato su Tiptap (ProseMirror) con paragrafi, titoli, elenchi, citazioni, separatori, blocchi di codice, link, colore del testo, allineamento e dimensione carattere, con annulla/ripeti a livello di transazione. Le immagini sono incluse nel corpo come base64, senza file separati, così salvando il file del database si salva tutto, immagini comprese. Il contenuto viene sanificato in scrittura tramite allowlist sanitize-html e di nuovo in visualizzazione tramite DOMPurify.',
  f2Limit:
    'Limite: i byte delle immagini pesano direttamente sul file del database, quindi molte immagini fanno crescere il file di conseguenza.',
  f3Title: 'Sei tipi di campo personalizzati',
  f3Body:
    'Testo, testo lungo, numero, data, elenco a discesa e link. Le definizioni dei campi sono globali: si creano una volta e si riusano in ogni categoria, senza configurazione per categoria.',
  f3Limit:
    'Limite: le definizioni valgono per tutte le categorie, quindi i campi non usati in una categoria compaiono comunque nel suo modulo di inserimento.',
  f4Title: 'Ricerca full-text e filtri',
  f4Body:
    'La ricerca per parola chiave copre titolo, corpo, valori dei campi e autore, con risultati evidenziati. I filtri multi-condizione si combinano per area, categoria, tag, autore, intervallo di date, valore di campo e origine. La pagina di dettaglio supporta la ricerca nella pagina con Ctrl+F, limitata a titolo, dati dei campi e corpo.',
  f4Limit: 'Limite: la ricerca per parola chiave non considera i nomi dei tag; per i tag usa la barra dei filtri.',
  f5Title: 'Cronologia versioni e ripristino',
  f5Body:
    'Ogni salvataggio crea uno snapshot storico. Ogni versione passata può essere visualizzata in anteprima, ripristinata con un clic o confrontata campo per campo con il contenuto attuale, con aggiunte, eliminazioni e modifiche evidenziate.',
  f5Limit:
    'Limite: il confronto copre solo il testo; modifiche a immagini e impaginazione non sono visibili. Uno snapshot viene creato a ogni salvataggio, anche se il contenuto non è cambiato.',
  f6Title: 'Cifratura trasparente e controllo verificabile',
  f6Body:
    'Il file del database può essere cifrato con AES-256-GCM, con la passphrase che deriva la chiave tramite scrypt (N=16384). Le operazioni chiave sono scritte in una catena di hash SHA-256 con blocco genesi, così una sola verifica dice se i dati sono stati alterati.',
  f6Limit:
    "Nota: ① La cifratura è disattivata per impostazione predefinita e va attivata in Impostazioni → Cifratura dati. ② Una passphrase del database dimenticata non è recuperabile (non esiste back door), ma la password dell'account si può reimpostare con le domande di sicurezza. Le due cose sono indipendenti.",
  f7Title: 'Backup automatico',
  f7Body:
    "Backup del database ogni giorno o ogni settimana in una cartella a tua scelta, con possibile backup all'uscita. I backup mantengono gli ultimi 5 file e ruotano automaticamente.",
  f7Limit:
    'Nota: il backup automatico è disattivato per impostazione predefinita. Si consiglia di attivarlo durante la configurazione iniziale.',
  f8Title: 'Condivisione LAN in sola lettura',
  f8Body:
    'I dispositivi sullo stesso segmento di rete che installano il software e aprono Condivisione LAN scoprono automaticamente la sorgente condivisa (un beacon viene trasmesso ogni 5 secondi; non serve condividere indirizzi manualmente; se il peer non compare nell\'elenco, clicca "Riscopri" per aggiornare). Il contenuto condiviso è in sola lettura e supporta ricerca e ricerca nella pagina. Bozze, modelli e cestino non vengono mai condivisi.',
  f8Limit:
    'Limite: la condivisione è in sola lettura e i peer non possono modificare i tuoi dati. Per impostazione predefinita i peer non possono copiare documenti; abilita "Consenti copia su questo dispositivo" in La mia condivisione per permetterlo. Il servizio di condivisione non ha interfaccia web: aprire l\'indirizzo nel browser mostra solo una pagina informativa.',
  f9Title: 'Migrazione con un solo file',
  f9Body:
    "Esporta i documenti come file .archboxpack (ZIP con manifest, checksum e firma) contenente corpo, immagini, campi, tag, aree e categorie. L'importazione riconosce i duplicati per titolo, area e categoria, con strategie salta, unisci, crea nuovo e nessuna deduplica.",
  f9Limit:
    'Limite: la dimensione del pacchetto cresce con le immagini inline. Controlla la dimensione prima di trasferire.',
  f10Title: 'Otto temi visivi',
  f10Body:
    'Sei schemi di colore integrati (Business chiaro, Business scuro, Wireframe, Bambù, Legno di sandalo, Cielo) più due temi omaggio a CS1.6 e Half-Life. Il cambio è immediato.',
  f10Limit: "Limite: i temi non seguono l'impostazione chiaro/scuro di sistema; la scelta è manuale.",
  passwordTitle: "Password dell'account e passphrase del database",
  pwAccount: "Password dell'account",
  pwAccountBody:
    'La credenziale usata per accedere al software. Se la dimentichi, si reimposta direttamente rispondendo alle tre domande di sicurezza impostate in fase di registrazione. Assicurati che le risposte siano annotate e memorabili.',
  pwDb: 'Passphrase del database',
  pwDbBody:
    'Una credenziale separata usata per cifrare il database. Non viene mai salvata in chiaro; la chiave deriva da essa tramite scrypt, senza back door e senza canale di recupero manuale. Dimenticarla significa non poter più aprire i dati. Si usa solo quando la cifratura è attiva.',
  pwNote:
    "Il software non ha una procedura guidata al primo avvio. Dopo l'installazione la prima schermata è quella di accesso / registrazione; completa la registrazione dell'account per entrare nell'interfaccia principale.",
  startTitle: 'Primi passi',
  s1: "Registra un account. La prima schermata è quella di accesso. La registrazione richiede nome utente, password e tre domande di sicurezza (per il recupero della password). Non c'è procedura guidata.",
  s2: "Decidi sulla cifratura. Il software funziona anche senza. Per attivarla vai in Impostazioni → Cifratura dati e custodisci la passphrase del database. L'opzione è disattivata per impostazione predefinita.",
  s3: 'Crea la prima area e impostane il codice. Il codice è obbligatorio e univoco in tutto il database (es. HR, FIN). Compare nei numeri dei documenti e nei pacchetti esportati, quindi mantienilo coerente.',
  s4: "Crea le categorie sotto l'area. Anche i codici delle categorie sono univoci. Lo scheletro di archiviazione è pronto: ricorda che la profondità è fissa a due livelli.",
  s5: 'Pianifica i tag. I tag sono condivisi globalmente. Nominali per fase del documento, non per proprietà.',
  s6: 'Definisci i campi che servono. Apri Tassonomia e crea definizioni come numero di contratto, data di firma o importo. I campi sono globali e riutilizzabili.',
  s7: "Scrivi il primo documento. Clicca Nuovo sotto un'area o una categoria, inserisci il titolo, componi il corpo, aggiungi immagini e compila i campi. Al salvataggio viene creato uno snapshot storico.",
  s8: 'Impara le due modalità di ricerca. Usa la casella di ricerca in alto per la ricerca per parola chiave combinata con i filtri; usa Ctrl+F nella pagina di dettaglio per trovare testo in un documento lungo.',
  s9: "Attiva il backup automatico. Vai in Impostazioni → Dati, attiva il backup automatico e scegli una cartella. L'opzione è disattivata per impostazione predefinita e va configurata presto.",
  s10: 'Attiva la condivisione LAN se serve. Apri Condivisione LAN, accendi l\'interruttore e seleziona le aree. I dispositivi sullo stesso segmento scoprono questa macchina automaticamente; il token di accesso è attivo per impostazione predefinita e i peer devono inserirlo una volta per poter consultare in sola lettura. Disattivare "Richiedi token di accesso per connettersi" consente la connessione con un clic, ma allora qualsiasi dispositivo del segmento può connettersi: scegli con attenzione.',
  tamperTitle: "Protezione dell'integrità del programma",
  tamperIntro:
    "Il software esegue due livelli di verifica sull'eventuale modifica dei file del programma. Gli inneschi e le reazioni sono diversi, quindi vanno distinti:",
  tamperLayer1: 'Livello principale',
  tamperLayer1Body:
    "Il codice del programma (interfaccia, logica di business e script di avvio) è impacchettato in resources\\app.asar. La sua impronta è incorporata nell'eseguibile Archbox.exe stesso e viene verificata dal runtime Electron nella primissima fase dell'avvio, prima che giri qualsiasi codice di business; il software non può intercettarla né segnalarla. Se la verifica fallisce il risultato è un doppio clic senza finestra e l'uscita immediata del processo. È un fallimento duro e voluto del livello principale: \"esce subito senza finestra\" è il segnale che il programma principale è stato modificato.",
  tamperLayer2: 'Livello ausiliario',
  tamperLayer2Body:
    'Un piccolo numero di file che non possono essere impacchettati (come i moduli WebAssembly del motore del database) risiede in resources\\app.asar.unpacked. Il software li confronta voce per voce con il manifest delle firme a ogni avvio. In caso di differenza: ① mostra un banner persistente in cima all\'interfaccia (comprimibile); ② scrive nel registro di controllo una volta per avvio, senza cancellazione automatica; ③ fornisce dettagli diagnostici con nomi file, hash originali e hash attuali. Questo livello non influisce sul permesso di scrittura; la scrivibilità dei dati è determinata separatamente dall\'"integrità del file dati". I due controlli sono volutamente separati.',
  tamperNote:
    "Limiti della protezione: il livello principale è garantito dentro l'eseguibile — un programma modificato non può avviarsi. Il livello ausiliario registra le prove della manomissione invece di impedirla in modo assoluto; difende da modifiche accidentali, alterazioni silenziose dei software di sicurezza e sostituzioni errate. Se venissero alterati sia i file sia il manifest delle firme, il bypass sarebbe teoricamente possibile, ma lascerebbe una traccia nella catena di controllo.",
  crashTitle: "Diagnosi all'avvio",
  c1: 'Prima identifica il sintomo. Nessuna finestra e processo che sparisce subito: vedi il punto 2. Compare una finestra con un messaggio interno: segui il percorso indicato dal messaggio.',
  c2: '"Esce subito senza finestra" significa che il nucleo del programma è stato modificato o i file sono danneggiati. La causa più comune è un software di sicurezza che mette in quarantena, analizza o altera byte di Archbox.exe o app.asar; anche un\'installazione incompleta o errori di scrittura su disco sono possibili.',
  c3: "Il rimedio è reinstallare. Procura un pacchetto dal canale ufficiale e installalo sopra la stessa posizione. I dati non sono nella cartella del programma, quindi sovrascrivere l'installazione non li tocca. Se il software di sicurezza blocca ripetutamente il processo, aggiungi la cartella del programma alla sua allowlist e reinstalla.",
  c4: "Perché non c'è una finestra per questo livello: il controllo gira prima del codice di business ed è comportamento interno all'eseguibile, quindi il software non ha occasione di mostrare un messaggio. Questa pagina della guida è quel messaggio.",
  c5: 'Posizione dei log: quando il programma si avvia normalmente, i log sono scritti in {dir} come app-2026-10-17.log, ruotati ogni giorno e conservati 7 giorni (copia il percorso completo mostrato sopra, oppure clicca "Apri cartella log" in Impostazioni → Log di esecuzione). Nota che la cartella dei log è accanto alla cartella dati, non dentro. Le prime righe dell\'avvio contengono "Autocontrollo dei file del programma: superato / disabilitato / fallito", che è il risultato del livello ausiliario.',
  unfitTitle: 'Quando non usare questo software',
  unfitLead: 'Se vale una delle condizioni seguenti, valuta un altro strumento:',
  u1: "Serve che più persone modifichino lo stesso documento contemporaneamente. Questa è una postazione monoutente; la condivisione in sola lettura è il massimo e non c'è collaborazione in tempo reale.",
  u2: "Serve l'accesso da telefoni o tablet. È un'applicazione desktop. La condivisione LAN è per computer con lo stesso software; non è una pagina web e non ha client mobile.",
  u3: 'Serve un link pubblico per i clienti. La condivisione è limitata al segmento di rete locale e può essere spenta, quindi non è adatta alla pubblicazione esterna.',
  u4: 'Devi gestire decine di migliaia di immagini. Le immagini sono salvate inline e il database cresce; usa uno strumento dedicato alla gestione degli asset.',
  u5: 'Il tuo team non accetta che i dati vivano su una singola macchina. È una premessa di progetto di questo software, senza vie di mezzo.',
  coda: 'Se i tuoi documenti devono essere custoditi al sicuro su questa macchina a lungo termine, apribili in qualsiasi momento e indipendenti dalle interruzioni di rete, questo software è fatto esattamente per questo.',
  tail: 'Questa pagina viene aggiornata a ogni versione. Ambiente di runtime, componenti open source e termini di licenza sono documentati nella pagina Informazioni. Questa è una build di test; funzioni e documentazione possono ancora cambiare.'
};
