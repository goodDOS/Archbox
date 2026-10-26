/**
 * Diccionario i18n del proceso principal · dominio sys (español).
 * El conjunto de claves debe coincidir exactamente con sys.zh-CN.js (lo verifica standardize).
 */
module.exports = {
  dbIntegrityTitle: 'Aviso de integridad de la base de datos',
  dbIntegrityMsg:
    'La base de datos no superó la verificación de integridad (puede haber sido manipulada o estar dañada).',
  dbReadOnlyNote:
    '\n\nPara no sobrescribir las pruebas, la app ha pasado a modo SOLO LECTURA:\npuedes seguir consultando, buscando y exportando tus datos, pero no modificarlos.\nCuando confirmes que es una falsa alarma, reconstruye la línea base de firmas en Ajustes para recuperar la escritura.',
  dbAuditNote:
    '\n\nEl incidente se ha registrado en el registro de auditoría (una entrada por arranque, no se puede borrar automáticamente).',
  dbGotoSettings: 'Abrir Ajustes',
  dbQuit: 'Salir',

  appIntegrityTitle: 'Aviso de integridad de los archivos del programa',
  appIntegrityMsg:
    'Los archivos de ejecución incluidos no coinciden con el manifiesto de firmas de la compilación publicada.',
  appIntegrityDetail:
    'Ámbito afectado: archivos bajo app.asar.unpacked en la carpeta de instalación ($scope={scope}).\n' +
    'El programa principal app.asar ha superado la verificación de Electron integrada en el ejecutable: si se hubiera modificado, este programa no podría arrancar.\n\n' +
    '{reason}\n\nEl incidente se ha registrado en el registro de auditoría (una entrada por arranque, no se puede borrar automáticamente).' +
    'Si no has modificado tú estos archivos, plantéate conseguir el paquete por un canal oficial o desconfía del origen de esta ejecución.',
  appIntegrityOk: 'Entendido',

  integSigBroken: 'El archivo de firmas está dañado; no se puede verificar la integridad de la base de datos',
  integSigFail: 'Falló la verificación de la firma de la base de datos; puede haber sido manipulada',
  integHashMismatch:
    'El hash del contenido de la base de datos no coincide; puede haber sido manipulada o estar dañada',
  integCrcMismatch: 'El CRC32 del contenido de la base de datos no coincide; puede estar dañada',
  integDefault: 'Falló la verificación de integridad de la base de datos',
  appIntegrityDirMissing: 'Falta por completo la carpeta de ejecución incluida app.asar.unpacked',
  appIntegrityDirMissingDetail:
    'pero la cabecera de app.asar declara {n} archivo(s) en ella ({sample}{more}) — la carpeta se ha eliminado o no se instaló con el paquete',
  andMore: ', etc.',
  diffModified: '{n} modificados ({sample}{more})',
  diffMissing: '{n} eliminados ({sample}{more})',
  diffAdded: '{n} añadidos ({sample}{more})',
  appIntegrityNoDir: 'La carpeta del programa no existe; autocomprobación omitida',
  appIntegrityNoManifest:
    'No se encontró el manifiesto de firmas de los archivos (modo desarrollo o primer arranque); autocomprobación omitida',
  appIntegrityManifestBroken: 'El manifiesto de firmas de los archivos está dañado y no se puede analizar',
  appIntegritySigFail: 'Falló la verificación del manifiesto de firmas de los archivos: ',
  appIntegrityMismatch: 'Los archivos del programa no coinciden con el manifiesto de firmas: ',
  manifestMissing: 'Falta el objeto manifest',
  manifestNoSig: 'El manifiesto no tiene firma',
  manifestSigInvalid:
    'Firma del manifiesto no válida (el manifiesto puede haber sido sustituido, manipulado o generado por otro programa)',

  dbOpenFailed: 'No se pudo abrir la base de datos ({dir}): {msg}',
  dbTampered: '[Detectada manipulación del archivo de datos: {reason}]',
  dbStillCantOpen: 'La base de datos sigue sin poder abrirse',
  dbLockedNeedPass: 'La base de datos está cifrada y requiere la frase de paso para desbloquearse',

  pickDataDirTitle: 'Selecciona la carpeta de datos que contiene archive.db (para reparación/recuperación)',

  /* ---- Registros de auditoría (acción/detalle se muestran en la lista) ---- */
  auditDbIntegrity: 'Alerta de integridad de la base de datos',
  auditAppIntegrity: 'Alerta de integridad de los archivos de la aplicación',
  auditIntegrityAction:
    'Cambiado a solo lectura para esta sesión; la línea base de firmas no se reconstruirá automáticamente',
  auditAppIntegrityReason: 'Los archivos de la aplicación no coinciden con el manifiesto firmado',
  integNoSig: 'Sin archivo de firma; se trata como primer arranque (persistNow creará la línea base)',
  integNoDbFile: 'Sin archivo de base de datos',
  chainDetailNone: 'Sin registros',

  /* ---- Nombres de acciones de auditoría y motivos de inicio de sesión fallido ---- */
  actPackImport: 'Paquete de archivo importado',
  actUserRegister: 'Usuario registrado',
  actLoginFail: 'Inicio de sesión fallido',
  actLogin: 'Inicio de sesión',
  actResetPassword: 'Contraseña restablecida',
  actChangePassword: 'Contraseña cambiada',
  actSetQA: 'Preguntas de seguridad configuradas',
  actRecoverByQA: 'Contraseña recuperada con preguntas de seguridad',
  actChangeSetting: 'Ajuste modificado',
  actRegionUpdate: 'Área actualizada',
  actRegionCreate: 'Área creada',
  actRegionDelete: 'Área eliminada',
  actCatUpdate: 'Categoría actualizada',
  actCatCreate: 'Categoría creada',
  actCatDelete: 'Categoría eliminada',
  actTagAutoCreate: 'Etiqueta creada automáticamente',
  actTagUpdate: 'Etiqueta actualizada',
  actTagCreate: 'Etiqueta creada',
  actTagDelete: 'Etiqueta eliminada',
  actFieldUpdate: 'Definición de campo actualizada',
  actFieldCreate: 'Definición de campo creada',
  actFieldDelete: 'Definición de campo eliminada',
  actPostUpdate: 'Documento actualizado',
  actPostCreate: 'Documento creado',
  actPostMerge: 'Documentos combinados',
  actPostTrash: 'Documento movido a la papelera',
  actPostRestore: 'Documento restaurado',
  actPostPurge: 'Documento eliminado permanentemente',
  actPostVersionRestore: 'Versión histórica restaurada',
  actTransferPosts: 'Todos los documentos transferidos',
  actNoteCreate: 'Nota creada',
  actNoteDelete: 'Nota eliminada',
  sysUser: 'Sistema',
  unknownUser: 'Usuario desconocido',
  loginNoUser: 'El usuario no existe',
  loginMacMismatch: 'La dirección MAC no coincide',
  loginBadPassword: 'Contraseña incorrecta',
  chainBrokenPrev:
    'Registro #{id}: prev_hash no coincide con el registro anterior (cadena rota); pueden haberse eliminado o insertado filas',
  chainBrokenContent: 'Registro #{id}: el contenido no coincide con self_hash (campos manipulados)',
  chainOkDetail: 'Verificados {n} registros encadenados; cadena intacta',
  mergeAppendMark: '[Añadido por la combinación {time}]',
  regionFallback: 'Área #{id}',
  categoryFallback: 'Categoría #{id}',

  /* Textos de los productos exportados (Markdown / PDF) */
  docFallbackName: 'Documento',
  sharedDocTitle: 'Documento compartido',
  uncategorized: 'Sin categoría',
  exportTitle: 'Exportación de documento',
  tagsLabel: 'etiquetas',
  fieldsBlock: 'Detalles de los campos',
  statusDraft: 'Borrador',
  statusPublished: 'Publicado',
  metaStatus: 'estado',
  metaRegion: 'área',
  metaCategory: 'categoría',
  metaCreated: 'creado',
  metaUpdated: 'actualizado',
  metaAuthor: 'autor',
  exportFooter: 'Exportado {time} · {n} documento(s) · generado por {app}',

  /* Informe de importación del paquete */
  packZipLabel: 'ZIP del paquete de archivo ',
  importRegionName: 'Área importada',
  emptyTitle: '(sin título)',
  impFieldFail: 'Campo {code}: {msg}',
  impItemFail: 'Fila {n}: {msg}',
  impSkipEmptyTitle: 'Fila {n}: título vacío, omitida',
  impSkipDup: 'Fila {n} "{title}": valor de campo duplicado, omitida',
  impReasonEmptyTitle: 'Título vacío',
  impReasonDup: 'Valor de campo duplicado con "{title}"',
  impReasonMerged: 'Combinado en "{title}"',
  impReasonSuffix: 'Importación duplicada; sufijo añadido al título',
  impReasonNoCheck: 'Creado como nuevo sin comprobación de duplicados',
  impReasonCreated: 'Creado como nuevo (comprobación de duplicados superada)',
  impExistingDoc: 'Documento existente',
  impDupSuffix: '(importación duplicada {code})',
  impProgress: 'Procesados {n}/{total}',

  /* Avisos de reloj y servicios en la nube */
  clockBackdrift:
    'Este arranque es anterior al registro de arranque previo; el reloj del sistema puede haberse atrasado',
  clockRollback: 'El reloj del sistema se atrasó unos {n} segundos',
  clockJump: 'El reloj del sistema avanzó unos {n} minutos',

  /* Página informativa de LAN (se muestra al acceder desde el navegador) */
  lanPageTitle: 'Archbox · Servicio de compartición en LAN',
  lanPageH1: 'Archbox · Servicio de compartición en LAN',
  lanPageMeta: 'Versión {ver} · puerto {port} · en ejecución',
  lanPageOk1: 'Si ves esta página, <b>el servicio funciona</b>: simplemente no tiene interfaz web.',
  lanPageOk2:
    'El contenido compartido lo descarga el propio <b>cliente Archbox</b>: abre "Compartir en LAN" en la app de otro equipo y este dispositivo aparecerá automáticamente en la lista (emisión cada 5 segundos en la misma subred, sin introducir direcciones a mano).',
  lanPageOk3: 'Navegar a esta dirección no puede funcionar, por dos motivos:',
  lanPageLi1:
    'El servicio solo acepta <code>/api/…</code> con un token de acceso; el token lo obtiene el cliente durante el descubrimiento y no está disponible en un navegador.',
  lanPageLi2:
    'CORS no está habilitado a propósito, así que un navegador no puede leer contenido compartido entre orígenes.',
  lanPageOk4: 'Para comprobar si el servicio está activo, solicita <code>/health</code> o <code>/api/version</code>.'
};
