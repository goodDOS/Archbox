/** Software Guide page (formal documentation style) */
export default {
  title: 'Software Guide',
  subtitle: 'Archbox · Product features and usage',
  introTitle: 'Product overview',
  introP1:
    'Archbox is a single-machine, offline document workstation for small teams and individuals. All business data is stored in a single SQLite file on the local machine. Every feature remains fully available without a network connection, and data can be migrated by moving the data directory as a whole.',
  introP2:
    'This software does not provide cloud storage, cloud account sync, online collaboration or AI summarization. Every path that could move data off the local machine has been closed: the program contains no cloud-sync or remote-upload feature at all.',
  scopeTitle: 'Scope of use',
  scopeYes: 'Suitable for',
  scopeYesBody:
    'Document management scenarios that require long-term archiving, structured retrieval and verifiable audit trails for individuals and small teams: two-level archiving (Region → Category), global tags, six custom field types, rich text entry with inline base64 images, historical version snapshots and full-version restore, full-text search and in-page find, a SHA-256 hash-chained audit log for all operations, and optional AES-256-GCM transparent encryption. Devices on the same LAN can browse shared regions read-only through LAN Sharing.',
  scopeNo: 'Not suitable for',
  scopeNoBody:
    'This software is not intended for simultaneous multi-user editing, mobile access, publishing public links, or managing large image asset libraries. Version comparison covers text only; image and layout changes are outside its scope. The program contains no cloud-sync feature.',
  scopeVerdictLabel: 'Selection guide: ',
  scopeVerdict:
    'If the core requirement is "several people editing the same document online at once", this software does not fit. If the core requirement is "important documents stored safely on this machine, openable at any time, usable offline", it does.',
  featuresTitle: 'Features',
  f1Title: 'Two-level archiving and global tags',
  f1Body:
    'Documents belong to exactly two levels: Region → Category. There is no third level. Tags are defined globally and attach horizontally across the hierarchy to express document state (in progress, pending review, voided), not ownership. Regions and categories each carry a unique code, enforced by both application-level duplicate checks and a database unique index.',
  f1Limit:
    'Limitation: the archiving depth is fixed at two levels. Users accustomed to deeply nested folders will need to adjust.',
  f2Title: 'Rich text entry with images',
  f2Body:
    'A Tiptap (ProseMirror) based editor supporting paragraphs, headings, lists, quotes, dividers, code blocks, links, text color, alignment and font size, with transaction-level undo/redo. Images are inlined into the body as base64, producing no separate files, so backing up the database file backs up all content including images. Content is sanitized on write through a sanitize-html allowlist and again through DOMPurify on display.',
  f2Limit:
    'Limitation: image bytes count directly against the database file, so a large number of images grows the file accordingly.',
  f3Title: 'Six custom field types',
  f3Body:
    'Text, long text, number, date, dropdown and link. Field definitions are global: create once and reuse in every category, with no per-category configuration.',
  f3Limit:
    'Limitation: field definitions apply to all categories, so fields unused in a particular category still appear in its entry form.',
  f4Title: 'Full-text search and filters',
  f4Body:
    'Keyword search covers title, body, field values and author, with highlighted results. Multi-condition filters can be combined by region, category, tag, author, date range, field value and source. The document detail page supports Ctrl+F in-page find, scoped to the title, field data and body.',
  f4Limit: 'Limitation: keyword search does not match tag names; use the filter bar for tags.',
  f5Title: 'Version history and restore',
  f5Body:
    'Every save creates a historical snapshot. Any past version can be previewed, restored in one click, or compared field by field against the current content, with additions, deletions and edits marked.',
  f5Limit:
    'Limitation: comparison covers text only; image and layout changes are not visible. A snapshot is taken on every save, whether or not content actually changed.',
  f6Title: 'Transparent encryption and verifiable audit',
  f6Body:
    'The database file can be encrypted with AES-256-GCM, with the passphrase deriving the key through scrypt (N=16384). Key operations are written into a SHA-256 hash chain with a genesis block, so a single verification confirms whether data has been altered.',
  f6Limit:
    'Note: ① Encryption is off by default and must be enabled under Settings → Data Encryption. ② A forgotten database passphrase cannot be recovered (there is no back door), but the account password can be reset via security questions. The two are independent.',
  f7Title: 'Automatic backup',
  f7Body:
    'Back up the database daily or weekly to a directory of your choice, with an optional backup on exit. Backups keep the most recent 5 files and rotate automatically.',
  f7Limit: 'Note: automatic backup is off by default. It is recommended to enable it during initial setup.',
  f8Title: 'Read-only LAN sharing',
  f8Body:
    'Devices on the same network segment that install this software and open LAN Sharing will discover the sharing source automatically (a beacon is broadcast every 5 seconds; no address needs to be shared manually; if the peer does not appear in the list, click "Rediscover" to refresh manually). Shared content is read-only and supports search and in-page find. Drafts, templates and the recycle bin are never shared.',
  f8Limit:
    'Limitation: sharing is read-only and peers cannot modify your data. Peers are not allowed to copy documents by default; enable "Allow copy to this device" under My Sharing to permit it. The sharing service has no web interface — opening the address in a browser only shows an information page.',
  f9Title: 'Single-file migration',
  f9Body:
    'Export documents as a .archboxpack file (ZIP with manifest, checksums and signature) containing body, images, fields, tags, regions and categories. Import matches duplicates by title, region and category, with skip, merge, create-new and no-dedup strategies.',
  f9Limit: 'Limitation: pack size grows with inline images. Check the size before transferring.',
  f10Title: 'Eight visual themes',
  f10Body:
    'Six built-in color schemes (Business Light, Business Dark, Wireframe, Bamboo, Sandalwood, Sky) plus CS1.6 and Half-Life tribute themes. Switching is instant.',
  f10Limit: 'Limitation: themes do not follow the system light/dark setting; selection is manual.',
  passwordTitle: 'Account password and database passphrase',
  pwAccount: 'Account password',
  pwAccountBody:
    'The credential used to sign in to this software. If forgotten, it can be reset directly by answering the three security questions set during registration. Make sure those answers are recorded and memorable.',
  pwDb: 'Database passphrase',
  pwDbBody:
    'A separate credential used to encrypt the database. It is never stored in plaintext; the key is derived from it through scrypt, with no back door and no manual recovery channel. Forgetting it means the data can no longer be opened. It is only used when encryption is enabled.',
  pwNote:
    'This software has no first-run onboarding wizard. After installation, the first screen is the sign-in / registration page; complete account registration to enter the main interface.',
  startTitle: 'Getting started',
  s1: 'Register an account. The first screen is the sign-in page. Registration requires a username, a password and three security questions (used for password recovery). There is no onboarding wizard.',
  s2: 'Decide on encryption. The software works without it. To enable it, go to Settings → Data Encryption and keep the database passphrase safe. This option is off by default.',
  s3: 'Create your first region and set its code. The code is required and unique across the database (e.g. HR, FIN). It appears in document numbers and exported packs, so keep it consistent.',
  s4: 'Create categories under the region. Category codes are unique as well. The archiving skeleton is now in place — note that the depth is fixed at two levels.',
  s5: 'Plan your tag set. Tags are shared globally. Name them by document stage rather than by ownership.',
  s6: 'Define the fields you need. Open Taxonomy and create definitions such as contract number, signing date or amount. Fields are global and reusable.',
  s7: 'Write your first document. Click New under a region or category, fill in the title, compose the body, insert images and fill in fields. A historical snapshot is created on save.',
  s8: 'Learn the two search modes. Use the top search box for keyword search combined with filters; use Ctrl+F on the detail page to locate text within a long document.',
  s9: 'Turn on automatic backup. Go to Settings → Data, enable automatic backup and choose a directory. This option is off by default and should be configured early.',
  s10: 'Enable LAN sharing if needed. Open LAN Sharing, turn on the sharing switch and select target regions. Devices on the same network segment discover this machine automatically; the access token is enabled by default, and peers must enter the token once manually before they can browse read-only. Turning off "Require access token to connect" allows one-click connection, but then any device on the segment can connect — choose carefully.',
  tamperTitle: 'Program integrity protection',
  tamperIntro:
    'This software performs two layers of verification on whether program files have been modified. Their triggers and responses differ, so please distinguish between them:',
  tamperLayer1: 'Core layer',
  tamperLayer1Body:
    'Program code (UI, business logic and entry scripts) is packaged inside resources\\app.asar. Its fingerprint is embedded in the executable Archbox.exe itself and verified by the Electron runtime at the earliest stage of startup, before any business code runs; this software cannot intercept or report it. If verification fails, the result is a double-click with no window and an immediate process exit. This is an intentional hard failure of the core layer: "exits instantly with no window" is the signal that the main program has been modified.',
  tamperLayer2: 'Auxiliary layer',
  tamperLayer2Body:
    'A small number of files that cannot be packaged (such as the database engine\'s WebAssembly modules) live under resources\\app.asar.unpacked. This software compares them item by item against the signature manifest on every startup. On a mismatch it will: ① show a persistent banner at the top of the UI (collapsible); ② write to the audit log once per startup, with no automatic clearing; ③ provide diagnostic detail including file names, original hashes and current hashes. This layer does not affect write permission; data writability is determined independently by "data file integrity". The two checks are deliberately separated.',
  tamperNote:
    'Boundary of protection: the core layer is guaranteed inside the executable — a modified program cannot start. The auxiliary layer records evidence of tampering rather than preventing it absolutely; it defends against accidental changes, silent modification by security software and mistaken replacement. If both the files and the signature manifest are altered, bypass is theoretically possible, but it will leave a record in the audit chain.',
  crashTitle: 'Startup troubleshooting',
  c1: 'First identify the symptom. No window at all and the process disappears immediately, see step 2. A window appears with an in-app prompt, follow the path described in that prompt.',
  c2: '"Exits instantly with no window" means the program core was modified or files are corrupted. The most common cause is security software quarantining, scanning or byte-modifying Archbox.exe or app.asar; incomplete installation or disk write errors are also possible.',
  c3: 'The remedy is to reinstall. Obtain a package from the official channel and install over the same location. Data is not stored in the program directory, so overwriting the installation does not affect it. If security software repeatedly blocks the process, add the program directory to its allowlist and reinstall.',
  c4: 'Why there is no dialog for this layer: the check runs before business code and is behavior internal to the executable, so this software has no opportunity to insert a prompt. This guide page is that prompt.',
  c5: 'Log location: when the program starts normally, logs are written to {dir} as app-2026-10-17.log, rotated daily and kept for 7 days (copy the full path shown above, or click "Open log directory" under Settings → Run log). Note that the log directory sits alongside the data directory, not inside it. The first few lines of startup contain "Program file self-check: passed / disabled / failed", which is the auxiliary layer result.',
  unfitTitle: 'When not to use this software',
  unfitLead: 'If any of the following applies, consider a different tool:',
  u1: 'You need several people editing the same document simultaneously. This is a single-user workstation; read-only sharing is the ceiling and there is no real-time collaboration.',
  u2: 'You need access from phones or tablets. This is a desktop application. LAN sharing is for computers running the same software; it is not a web page and has no mobile client.',
  u3: 'You need a public link for customers. Sharing is limited to the local network segment and can be switched off, so it is unsuitable for external publishing.',
  u4: 'You need to manage tens of thousands of images. Images are stored inline and the database keeps growing; use a dedicated asset management tool.',
  u5: 'Your team cannot accept data living on a single machine. That is a design premise of this software, with no middle ground.',
  coda: 'If your documents need to be stored safely on this machine for the long term, openable at any time and unaffected by network outages, this software is built for exactly that.',
  tail: 'This page is updated with each release. Runtime environment, open-source components and license terms are documented on the About page. This is a test build; features and documentation may continue to change.'
};
