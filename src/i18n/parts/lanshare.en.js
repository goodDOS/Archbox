/** LAN Sharing (LanShare / SharePanel) — English */
export default {
  // Header and toolbar
  title: 'LAN Sharing',
  desc: 'Share your documents read-only over the LAN · Includes only published documents from selected regions; excludes account info, drafts and templates',
  myShare: 'My Sharing',
  discovering: 'Discovering',
  rediscover: 'Rediscover',
  notEnabledHint: 'Sharing is off: click "My Sharing" at the top right to enable it and select the regions to share',
  serviceOn: 'Local sharing service is on (port {port})',
  readonlyHint: 'Read-only browsing · no account data',

  // Sharing source list
  sourcesCount: 'Sharing sources ({n})',
  self: 'This device',
  lan: 'LAN',
  unnamedSource: 'Unnamed sharing source',
  emptyLocalOff: 'Sharing is off. Click "My Sharing" to enable it — shared regions will appear here',
  loadingRegions: 'Loading regions…',
  authTip: 'This sharing source requires an access token. Ask the owner for it and enter it below',
  token: 'Access token',
  connecting: 'Connecting',
  connect: 'Connect',
  noRegions: 'This sharing source has no shared regions',
  noSources:
    'No sharing sources found. Make sure the other device has enabled "LAN Sharing" and that the firewall allows UDP 47471 and TCP {port}.',
  noSourcesAuth: 'The other device has access token verification enabled — ask them for the token before connecting.',
  pickRegion: '← Pick a region under a sharing source on the left to browse its read-only documents',

  // Document list and details
  unnamed: 'Unnamed',
  readonly: 'Read-only',
  searchInRegion: 'Search within region…',
  postCount: '{n} documents',
  listMetaPre: 'Total ',
  listMetaPost: ' documents · page {page} / {pages}',
  noPosts: 'No documents match the current filter',
  backToListTitle: 'Back to shared document list',
  backToList: 'Back to list',
  findTitle: 'Find text on this page (Ctrl+F)',
  findHere: 'Find on page',
  copyTitleOk: 'Copy this document to the local library',
  copyTitleNo: 'This sharing source does not allow document copying',
  fieldsTitle: 'Field data',
  authorLine: 'Author: {name}',

  // Runtime errors and receipts
  loadStatusFailed: 'Failed to get sharing status',
  tokenExpired: 'Token expired (the other side may have regenerated it) — please enter it again',
  tokenWrong: 'Incorrect access token',
  cannotConnect: 'Cannot connect to this sharing source',
  tokenRequired: 'Please enter the access token',
  tokenWrongOrOff: 'Incorrect access token, or the other side has not enabled sharing',
  discoverFailed: 'Failed to discover sharing sources',
  fetchPostsFailed: 'Failed to load documents',
  postGone: 'Document does not exist or has been removed',
  fetchPostFailed: 'Failed to load document details',
  copyFailed: 'Copy failed',
  localLibrary: 'Local library',
  whereRegion: '"{region}"{category}',
  copiedTo: 'Copied into {where}',
  copyToast: 'Copied to this device: {title}{where}{unreported}',
  notReported: ' (source host not notified)',

  // Sharing panel: switches and descriptions
  enableSwitch: 'Enable LAN sharing',
  enableDesc:
    'Once enabled, other devices on the LAN can read-only browse the documents of the regions you select (no account info, no drafts or templates).',
  authSwitch: 'Require access token to connect',
  authDesc1:
    'On: other devices must enter the token manually, and it is not broadcast on the LAN; Off: the token is broadcast publicly and anyone can connect instantly.',
  authDescRotate: 'Re-enabling issues a new token',
  authDesc2: ', and already-connected devices must re-enter it.',
  copySwitch: 'Allow others to copy documents',
  copyDesc1: 'On: other devices can copy documents shared by this device',
  copyDescTo: 'into their own libraries',
  copyDesc2:
    ' (copies belong to them, with the original author snapshot). Off: they can only browse read-only and cannot copy anything out.',

  // Sharing panel: connection info
  hostNameLabel: 'Hostname',
  hostNamePlaceholder: 'Name shown on the LAN',
  localAddr: 'Local address',
  hide: 'Hide',
  show: 'Show',
  copyTokenTitle: 'Copy token',
  regenTokenTitle: 'Regenerate token',
  noteAuthOn:
    'After other devices see this device in the "LAN Sharing" list, they must enter the access token above manually before they can browse read-only.',
  clearCached: 'Clear tokens remembered on this device',
  noteAuthOff1:
    'Auto-discovery mode is on: the token is sent along with the LAN broadcast, so other devices connect instantly without entering anything — ',
  noteAuthOffWarn: 'anyone on the same subnet can use it to connect',
  noteAuthOff2: '. To tighten this, turn on "Require access token to connect" above.',

  // Sharing panel: region selection and stats
  pickRegionsTitle: 'Select regions to share',
  syncAllBtn: 'Update all',
  unshared: 'Not shared',
  noRegionsEmpty: 'No regions yet — create one in the left sidebar first.',
  visitorRankTitle: 'Visitor ranking (last 7 days · top 7)',
  noVisitors: 'No visitor access in the last 7 days.',
  unknownHost: 'Unknown host',
  macUnknown: 'Unavailable',
  countTimes: '{n} times',
  postRankTitle: 'Document view ranking (last 7 days · top 7)',
  noPostRank: 'No documents were viewed in the last 7 days.',
  copyRankTitle: 'Most-copied documents ({n})',
  noCopyRank:
    'No copy records yet. After others copy documents shared by this device, they will be ranked here by count.',
  firstTime: 'First',
  lastTime: 'Latest',
  copiers: 'Copied by: {who}',
  copyLogTitle: 'Copy log ({n})',
  noCopyLog: 'No copy records yet.',
  tookAway: 'Copied "{title}"',
  visitorLogTitle: 'Visitor log ({n})',
  noVisitorLog:
    "No visitor log yet. It will appear here after other devices discover and access this device's sharing.",
  offDesc:
    'Sharing is off. Once enabled, this device acts as a read-only document source, discoverable by other devices on the LAN via UDP broadcast.',

  // Visitor log labels and MAC credibility
  browseRegion: 'Browsed region "{name}"',
  browseRegionPlain: 'Browsed region',
  viewPost: 'Viewed document "{title}"',
  viewPostNo: 'Viewed document #{id}',
  browseSourcesOverview: 'Viewed sharing sources overview',
  viewStats: 'Viewed stats',
  access: 'Access',
  macArp: 'Verified',
  macSelf: 'Self-reported',
  macTipArp: "Measured from this device's network neighbor table (ARP); trustworthy on the same subnet",
  macTipSelf:
    'Self-reported by the peer — the only source across subnets. Note: this value can be forged by the peer and must not be used as an identity credential',
  macTipUnknown: 'Cannot determine the source of this MAC',

  // Switch feedback and confirmations
  enabledOn: 'LAN sharing enabled',
  enabledOff: 'LAN sharing disabled',
  regionShared: '"{name}" is now shared',
  regionUnshared: '"{name}" is no longer shared',
  allUpdated: 'All shared regions updated',
  confirmAuthOff:
    'After turning this off, the access token will be sent in plaintext with LAN broadcasts, and other devices on the same subnet can connect to this device directly. Turn off?',
  confirmAuthOn:
    'Re-enabling access token verification will issue a new access token. Already-connected devices will immediately lose access and must enter the new token. Enable?',
  authOnRotated: 'Access token verification enabled and a new access token issued (connected devices must re-enter it)',
  authOn: 'Access token verification enabled',
  authOffNote: 'Access token verification off (the token will be distributed via broadcast)',
  confirmCopyOn:
    'Once enabled, devices on the same subnet holding the access token can copy entire documents shared by this device into their own libraries. Once copied, this device cannot revoke them. Enable?',
  copyOn: 'Others may now copy documents shared by this device',
  copyOff: 'Document copying disabled',
  confirmRegen: 'After regenerating, connected devices must enter the new token to access. Regenerate?',
  tokenRegenerated: 'Access token regenerated',
  clearedTokens: 'Cleared {n} cached access tokens',
  noCachedTokens: 'No cached access tokens on this device',
  clearFailed: 'Clear failed',
  tokenCopied: 'Token copied',
  copyTokenFailed: 'Copy failed',
  hostNameRequired: 'Hostname cannot be empty',
  nameSet: 'Device name set to "{name}"'
};
