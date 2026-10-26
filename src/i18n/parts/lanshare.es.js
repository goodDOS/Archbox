/** LAN Sharing (LanShare / SharePanel) — Español */
export default {
  // Header and toolbar
  title: 'Uso compartido en LAN',
  desc: 'Comparte tus documentos en solo lectura por la red local · Incluye únicamente los documentos publicados de las áreas seleccionadas; excluye datos de cuenta, borradores y plantillas',
  myShare: 'Mi uso compartido',
  discovering: 'Buscando',
  rediscover: 'Buscar de nuevo',
  notEnabledHint:
    'Uso compartido desactivado: haz clic en «Mi uso compartido» arriba a la derecha para activarlo y elegir las áreas que quieres compartir',
  serviceOn: 'Servicio de uso compartido local activo (puerto {port})',
  readonlyHint: 'Consulta en solo lectura · sin datos de cuenta',

  // Sharing source list
  sourcesCount: 'Fuentes de uso compartido ({n})',
  self: 'Este dispositivo',
  lan: 'LAN',
  unnamedSource: 'Fuente de uso compartido sin nombre',
  emptyLocalOff:
    'Uso compartido desactivado. Haz clic en «Mi uso compartido» para activarlo — las áreas compartidas aparecerán aquí',
  loadingRegions: 'Cargando áreas…',
  authTip: 'Esta fuente requiere un token de acceso. Pídeselo al propietario e introdúcelo abajo',
  token: 'Token de acceso',
  connecting: 'Conectando',
  connect: 'Conectar',
  noRegions: 'Esta fuente no tiene áreas compartidas',
  noSources:
    'No se han encontrado fuentes de uso compartido. Comprueba que el otro dispositivo tenga activado «Uso compartido en LAN» y que el cortafuegos permita UDP 47471 y TCP {port}.',
  noSourcesAuth:
    'El otro dispositivo tiene activada la verificación del token de acceso — pídele el token antes de conectar.',
  pickRegion: '← Elige un área bajo una fuente a la izquierda para consultar sus documentos en solo lectura',

  // Document list and details
  unnamed: 'Sin nombre',
  readonly: 'Solo lectura',
  searchInRegion: 'Buscar en el área…',
  postCount: '{n} documentos',
  listMetaPre: 'Total ',
  listMetaPost: ' documentos · página {page} / {pages}',
  noPosts: 'Ningún documento coincide con el filtro actual',
  backToListTitle: 'Volver a la lista de documentos compartidos',
  backToList: 'Volver a la lista',
  findTitle: 'Buscar texto en esta página (Ctrl+F)',
  findHere: 'Buscar en la página',
  copyTitleOk: 'Copiar este documento al archivo local',
  copyTitleNo: 'Esta fuente no permite copiar documentos',
  fieldsTitle: 'Datos de campos',
  authorLine: 'Autor: {name}',

  // Runtime errors and receipts
  loadStatusFailed: 'No se pudo obtener el estado del uso compartido',
  tokenExpired: 'Token caducado (puede que el otro lado lo haya regenerado) — introdúcelo de nuevo',
  tokenWrong: 'Token de acceso incorrecto',
  cannotConnect: 'No se puede conectar con esta fuente',
  tokenRequired: 'Introduce el token de acceso',
  tokenWrongOrOff: 'Token de acceso incorrecto, o el otro lado no ha activado el uso compartido',
  discoverFailed: 'No se pudieron descubrir las fuentes de uso compartido',
  fetchPostsFailed: 'No se pudieron cargar los documentos',
  postGone: 'El documento no existe o se ha eliminado',
  fetchPostFailed: 'No se pudieron cargar los detalles del documento',
  copyFailed: 'No se pudo copiar',
  localLibrary: 'Archivo local',
  whereRegion: '«{region}»{category}',
  copiedTo: 'Copiado en {where}',
  copyToast: 'Copiado a este dispositivo: {title}{where}{unreported}',
  notReported: ' (host de origen no notificado)',

  // Sharing panel: switches and descriptions
  enableSwitch: 'Activar el uso compartido en LAN',
  enableDesc:
    'Una vez activado, otros dispositivos de la red local podrán consultar en solo lectura los documentos de las áreas seleccionadas (sin datos de cuenta, sin borradores ni plantillas).',
  authSwitch: 'Exigir un token de acceso para conectar',
  authDesc1:
    'Activado: los demás dispositivos deben introducir el token manualmente y este no se difunde por la red; Desactivado: el token se difunde públicamente y cualquiera puede conectarse al instante.',
  authDescRotate: 'Al reactivarlo se emite un token nuevo',
  authDesc2: ', y los dispositivos ya conectados deben volver a introducirlo.',
  copySwitch: 'Permitir que otros copien documentos',
  copyDesc1: 'Activado: otros dispositivos pueden copiar los documentos compartidos por este dispositivo',
  copyDescTo: 'a sus propios archivos',
  copyDesc2:
    ' (las copias son suyas, con la instantánea del autor original). Desactivado: solo pueden consultar en solo lectura y no pueden copiar nada.',

  // Sharing panel: connection info
  hostNameLabel: 'Nombre del host',
  hostNamePlaceholder: 'Nombre que se muestra en la red local',
  localAddr: 'Dirección local',
  hide: 'Ocultar',
  show: 'Mostrar',
  copyTokenTitle: 'Copiar token',
  regenTokenTitle: 'Regenerar token',
  noteAuthOn:
    'Cuando otros dispositivos vean este dispositivo en la lista «Uso compartido en LAN», deberán introducir manualmente el token de acceso de arriba antes de poder consultar en solo lectura.',
  clearCached: 'Borrar los tokens recordados en este dispositivo',
  noteAuthOff1:
    'Modo de descubrimiento automático activado: el token se envía junto con la difusión de red, así que los demás dispositivos se conectan al instante sin introducir nada — ',
  noteAuthOffWarn: 'cualquiera en la misma subred puede usarlo para conectarse',
  noteAuthOff2: '. Para restringirlo, activa «Exigir un token de acceso para conectar» arriba.',

  // Sharing panel: region selection and stats
  pickRegionsTitle: 'Selecciona las áreas que quieres compartir',
  syncAllBtn: 'Actualizar todo',
  unshared: 'No compartida',
  noRegionsEmpty: 'Aún no hay áreas — crea una primero en la barra lateral izquierda.',
  visitorRankTitle: 'Ranking de visitantes (últimos 7 días · 7 primeros)',
  noVisitors: 'No hay accesos de visitantes en los últimos 7 días.',
  unknownHost: 'Host desconocido',
  macUnknown: 'No disponible',
  countTimes: '{n} veces',
  postRankTitle: 'Ranking de vistas de documentos (últimos 7 días · 7 primeros)',
  noPostRank: 'No se ha visto ningún documento en los últimos 7 días.',
  copyRankTitle: 'Documentos más copiados ({n})',
  noCopyRank:
    'Aún no hay copias registradas. Cuando otros copien documentos compartidos por este dispositivo, aparecerán aquí ordenados por número.',
  firstTime: 'Primera',
  lastTime: 'Última',
  copiers: 'Copiado por: {who}',
  copyLogTitle: 'Registro de copias ({n})',
  noCopyLog: 'Aún no hay copias registradas.',
  tookAway: 'Copió «{title}»',
  visitorLogTitle: 'Registro de visitantes ({n})',
  noVisitorLog:
    'Aún no hay registro de visitantes. Aparecerá aquí cuando otros dispositivos descubran y accedan al uso compartido de este dispositivo.',
  offDesc:
    'Uso compartido desactivado. Una vez activado, este dispositivo actúa como fuente de documentos en solo lectura, detectable por otros dispositivos de la red local mediante difusión UDP.',

  // Visitor log labels and MAC credibility
  browseRegion: 'Consultó el área «{name}»',
  browseRegionPlain: 'Consultó un área',
  viewPost: 'Vio el documento «{title}»',
  viewPostNo: 'Vio el documento #{id}',
  browseSourcesOverview: 'Vio el resumen de fuentes',
  viewStats: 'Vio las estadísticas',
  access: 'Acceso',
  macArp: 'Verificada',
  macSelf: 'Autodeclarada',
  macTipArp: 'Medida desde la tabla de vecinos de red (ARP) de este dispositivo; fiable en la misma subred',
  macTipSelf:
    'Autodeclarada por el otro extremo — la única fuente disponible entre subredes distintas. Atención: este valor puede ser falsificado por el otro extremo y no debe usarse como credencial de identidad',
  macTipUnknown: 'No se puede determinar el origen de esta MAC',

  // Switch feedback and confirmations
  enabledOn: 'Uso compartido en LAN activado',
  enabledOff: 'Uso compartido en LAN desactivado',
  regionShared: '«{name}» ahora se comparte',
  regionUnshared: '«{name}» ya no se comparte',
  allUpdated: 'Se han actualizado todas las áreas compartidas',
  confirmAuthOff:
    'Al desactivarlo, el token de acceso se enviará en claro con las difusiones de red y otros dispositivos de la misma subred podrán conectarse directamente a este dispositivo. ¿Desactivar?',
  confirmAuthOn:
    'Al reactivar la verificación del token de acceso se emitirá un token nuevo. Los dispositivos ya conectados perderán el acceso de inmediato y deberán introducir el nuevo token. ¿Activar?',
  authOnRotated:
    'Verificación del token activada y nuevo token emitido (los dispositivos conectados deben reintroducirlo)',
  authOn: 'Verificación del token de acceso activada',
  authOffNote: 'Verificación del token de acceso desactivada (el token se distribuirá por difusión)',
  confirmCopyOn:
    'Una vez activado, los dispositivos de la misma subred que tengan el token de acceso podrán copiar documentos completos compartidos por este dispositivo a sus propios archivos. Una vez copiados, este dispositivo no puede revocarlos. ¿Activar?',
  copyOn: 'Ahora otros pueden copiar los documentos compartidos por este dispositivo',
  copyOff: 'Copia de documentos desactivada',
  confirmRegen:
    'Tras regenerarlo, los dispositivos conectados deberán introducir el token nuevo para acceder. ¿Regenerar?',
  tokenRegenerated: 'Token de acceso regenerado',
  clearedTokens: 'Se han borrado {n} tokens de acceso guardados',
  noCachedTokens: 'No hay tokens de acceso guardados en este dispositivo',
  clearFailed: 'No se pudo borrar',
  tokenCopied: 'Token copiado',
  copyTokenFailed: 'No se pudo copiar',
  hostNameRequired: 'El nombre del host no puede estar vacío',
  nameSet: 'Nombre del dispositivo establecido en «{name}»'
};
