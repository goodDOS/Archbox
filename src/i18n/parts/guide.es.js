/** Página Guía del software (estilo documentación formal) */
export default {
  title: 'Guía del software',
  subtitle: 'Archbox · Funciones y uso del producto',
  introTitle: 'Descripción general del producto',
  introP1:
    'Archbox es un puesto de documentos sin conexión y de un solo equipo para equipos pequeños y particulares. Todos los datos de trabajo se guardan en un único archivo SQLite en el equipo local. Cada función sigue disponible sin conexión de red, y los datos se migran moviendo la carpeta de datos completa.',
  introP2:
    'El software no ofrece almacenamiento en la nube, sincronización de cuentas en la nube, colaboración en línea ni resúmenes con IA. Se ha cerrado toda vía que pudiera sacar datos del equipo local: el programa no contiene ninguna función de sincronización en la nube ni de subida remota.',
  scopeTitle: 'Ámbito de uso',
  scopeYes: 'Adecuado para',
  scopeYesBody:
    'Escenarios de gestión documental que requieren archivo a largo plazo, recuperación estructurada y rastros de auditoría verificables, para particulares y equipos pequeños: archivo en dos niveles (Área → Categoría), etiquetas globales, seis tipos de campo personalizados, entrada de texto enriquecido con imágenes base64 en línea, instantáneas de versiones históricas y restauración completa, búsqueda de texto completo y búsqueda en la página, registro de auditoría con cadena de hash SHA-256 para todas las operaciones, y cifrado transparente AES-256-GCM opcional. Los dispositivos de la misma LAN pueden consultar en solo lectura las áreas compartidas mediante Compartir en LAN.',
  scopeNo: 'No adecuado para',
  scopeNoBody:
    'El software no está pensado para edición simultánea de varios usuarios, acceso desde móviles, publicación de enlaces públicos ni gestión de grandes bibliotecas de imágenes. La comparación de versiones cubre solo el texto; los cambios de imágenes y maquetación quedan fuera. El programa no contiene ninguna función de sincronización en la nube.',
  scopeVerdictLabel: 'Cómo elegir: ',
  scopeVerdict:
    'Si la necesidad principal es "varias personas editando el mismo documento en línea a la vez", este software no encaja. Si la necesidad es "documentos importantes guardados a salvo en este equipo, abribles en cualquier momento, utilizables sin conexión", sí encaja.',
  featuresTitle: 'Funciones',
  f1Title: 'Archivo en dos niveles y etiquetas globales',
  f1Body:
    'Los documentos pertenecen exactamente a dos niveles: Área → Categoría. No hay un tercer nivel. Las etiquetas se definen globalmente y se aplican de forma transversal a la jerarquía para expresar el estado del documento (en curso, pendiente de revisión, anulado), no la propiedad. Las áreas y categorías tienen cada una un código único, garantizado tanto por comprobaciones de duplicados en la aplicación como por un índice único en la base de datos.',
  f1Limit:
    'Limitación: la profundidad de archivo es fija de dos niveles. Quien esté acostumbrado a carpetas muy anidadas tendrá que adaptarse.',
  f2Title: 'Entrada de texto enriquecido con imágenes',
  f2Body:
    'Editor basado en Tiptap (ProseMirror) con párrafos, títulos, listas, citas, separadores, bloques de código, enlaces, color de texto, alineación y tamaño de fuente, con deshacer/rehacer a nivel de transacción. Las imágenes se insertan en el cuerpo como base64, sin archivos separados, así que al guardar el archivo de base de datos se guarda todo, incluidas las imágenes. El contenido se sanea al escribir mediante una lista blanca de sanitize-html y de nuevo al mostrarse mediante DOMPurify.',
  f2Limit:
    'Limitación: los bytes de las imágenes pesan directamente en el archivo de base de datos, por lo que muchas imágenes hacen crecer el archivo en consecuencia.',
  f3Title: 'Seis tipos de campo personalizados',
  f3Body:
    'Texto, texto largo, número, fecha, lista desplegable y enlace. Las definiciones de campo son globales: se crean una vez y se reutilizan en todas las categorías, sin configuración por categoría.',
  f3Limit:
    'Limitación: las definiciones se aplican a todas las categorías, así que los campos no usados en una categoría concreta siguen apareciendo en su formulario de entrada.',
  f4Title: 'Búsqueda de texto completo y filtros',
  f4Body:
    'La búsqueda por palabra clave cubre título, cuerpo, valores de campo y autor, con resultados resaltados. Los filtros multicondición se combinan por área, categoría, etiqueta, autor, rango de fechas, valor de campo y origen. La página de detalle admite búsqueda en la página con Ctrl+F, limitada a título, datos de campos y cuerpo.',
  f4Limit:
    'Limitación: la búsqueda por palabra clave no coincide con nombres de etiquetas; para etiquetas usa la barra de filtros.',
  f5Title: 'Historial de versiones y restauración',
  f5Body:
    'Cada guardado crea una instantánea histórica. Cualquier versión pasada puede previsualizarse, restaurarse con un clic o compararse campo a campo con el contenido actual, marcando añadidos, eliminaciones y ediciones.',
  f5Limit:
    'Limitación: la comparación cubre solo el texto; los cambios de imágenes y maquetación no se ven. Se crea una instantánea en cada guardado, aunque el contenido no haya cambiado.',
  f6Title: 'Cifrado transparente y auditoría verificable',
  f6Body:
    'El archivo de base de datos puede cifrarse con AES-256-GCM, con la frase de paso derivando la clave mediante scrypt (N=16384). Las operaciones clave se escriben en una cadena de hash SHA-256 con bloque génesis, de modo que una sola verificación indica si los datos han sido alterados.',
  f6Limit:
    'Nota: ① El cifrado está desactivado por defecto y debe activarse en Ajustes → Cifrado de datos. ② Una frase de paso de base de datos olvidada no se puede recuperar (no hay puerta trasera), pero la contraseña de la cuenta puede restablecerse con las preguntas de seguridad. Ambas cosas son independientes.',
  f7Title: 'Copia de seguridad automática',
  f7Body:
    'Copia de seguridad de la base de datos a diario o semanalmente en una carpeta a tu elección, con opción de copia al salir. Las copias conservan los 5 archivos más recientes y rotan automáticamente.',
  f7Limit:
    'Nota: la copia automática está desactivada por defecto. Se recomienda activarla durante la configuración inicial.',
  f8Title: 'Compartir en LAN en solo lectura',
  f8Body:
    'Los dispositivos del mismo segmento de red que instalan el software y abren Compartir en LAN descubren automáticamente el origen compartido (se emite un beacon cada 5 segundos; no hace falta compartir direcciones a mano; si el par no aparece en la lista, pulsa "Redescubrir" para actualizar). El contenido compartido es de solo lectura y admite búsqueda y búsqueda en la página. Los borradores, las plantillas y la papelera nunca se comparten.',
  f8Limit:
    'Limitación: compartir es de solo lectura y los pares no pueden modificar tus datos. Por defecto los pares no pueden copiar documentos; activa "Permitir copiar a este dispositivo" en Mi compartición para permitirlo. El servicio de compartición no tiene interfaz web: abrir la dirección en un navegador solo muestra una página informativa.',
  f9Title: 'Migración en un solo archivo',
  f9Body:
    'Exporta los documentos como archivo .archboxpack (ZIP con manifiesto, sumas de verificación y firma) que contiene cuerpo, imágenes, campos, etiquetas, áreas y categorías. La importación detecta duplicados por título, área y categoría, con estrategias omitir, combinar, crear nuevo y sin deduplicación.',
  f9Limit:
    'Limitación: el tamaño del paquete crece con las imágenes en línea. Comprueba el tamaño antes de transferir.',
  f10Title: 'Ocho temas visuales',
  f10Body:
    'Seis esquemas de color integrados (Business claro, Business oscuro, Wireframe, Bambú, Sándalo, Cielo) más dos temas homenaje a CS1.6 y Half-Life. El cambio es inmediato.',
  f10Limit: 'Limitación: los temas no siguen el ajuste claro/oscuro del sistema; la elección es manual.',
  passwordTitle: 'Contraseña de cuenta y frase de paso de la base de datos',
  pwAccount: 'Contraseña de cuenta',
  pwAccountBody:
    'La credencial usada para entrar en el software. Si la olvidas, puede restablecerse directamente respondiendo las tres preguntas de seguridad configuradas al registrarte. Asegúrate de anotar y recordar esas respuestas.',
  pwDb: 'Frase de paso de la base de datos',
  pwDbBody:
    'Una credencial separada usada para cifrar la base de datos. Nunca se guarda en claro; la clave se deriva de ella mediante scrypt, sin puerta trasera y sin canal de recuperación manual. Olvidarla significa no poder abrir ya los datos. Solo se usa cuando el cifrado está activado.',
  pwNote:
    'El software no tiene asistente inicial. Tras la instalación, la primera pantalla es la de acceso / registro; completa el registro de la cuenta para entrar en la interfaz principal.',
  startTitle: 'Primeros pasos',
  s1: 'Registra una cuenta. La primera pantalla es la de acceso. El registro requiere nombre de usuario, contraseña y tres preguntas de seguridad (para recuperar la contraseña). No hay asistente inicial.',
  s2: 'Decide sobre el cifrado. El software funciona sin él. Para activarlo ve a Ajustes → Cifrado de datos y guarda bien la frase de paso. Esta opción está desactivada por defecto.',
  s3: 'Crea tu primera área y define su código. El código es obligatorio y único en toda la base de datos (p. ej. HR, FIN). Aparece en los números de documento y en los paquetes exportados, así que mantenlo coherente.',
  s4: 'Crea categorías dentro del área. Los códigos de categoría también son únicos. El esqueleto de archivo ya está listo: recuerda que la profundidad es fija de dos niveles.',
  s5: 'Planifica las etiquetas. Las etiquetas se comparten globalmente. Nómbralas por fase del documento, no por propiedad.',
  s6: 'Define los campos que necesites. Abre Taxonomía y crea definiciones como número de contrato, fecha de firma o importe. Los campos son globales y reutilizables.',
  s7: 'Escribe tu primer documento. Pulsa Nuevo bajo un área o categoría, rellena el título, compón el cuerpo, inserta imágenes y completa los campos. Al guardar se crea una instantánea histórica.',
  s8: 'Aprende los dos modos de búsqueda. Usa el cuadro de búsqueda superior para la búsqueda por palabra clave combinada con filtros; usa Ctrl+F en la página de detalle para localizar texto en un documento largo.',
  s9: 'Activa la copia de seguridad automática. Ve a Ajustes → Datos, activa la copia automática y elige una carpeta. Está desactivada por defecto y conviene configurarla pronto.',
  s10: 'Activa Compartir en LAN si lo necesitas. Abre Compartir en LAN, enciende el interruptor y selecciona las áreas. Los dispositivos del mismo segmento descubren este equipo automáticamente; el token de acceso está activo por defecto y los pares deben introducirlo una vez para poder consultar en solo lectura. Desactivar "Requerir token de acceso para conectar" permite conectar con un clic, pero entonces cualquier dispositivo del segmento puede conectarse: elige con cuidado.',
  tamperTitle: 'Protección de integridad del programa',
  tamperIntro:
    'El software realiza dos capas de verificación sobre si los archivos del programa han sido modificados. Sus disparadores y respuestas son distintos, así que conviene distinguirlas:',
  tamperLayer1: 'Capa principal',
  tamperLayer1Body:
    'El código del programa (interfaz, lógica de negocio y scripts de entrada) va empaquetado en resources\\app.asar. Su huella está incrustada en el propio ejecutable Archbox.exe y la verifica el runtime de Electron en la fase más temprana del arranque, antes de que se ejecute cualquier código de negocio; el software no puede interceptarla ni notificarla. Si la verificación falla, el resultado es un doble clic sin ventana y la salida inmediata del proceso. Es un fallo duro e intencionado de la capa principal: "sale al instante sin ventana" es la señal de que el programa principal ha sido modificado.',
  tamperLayer2: 'Capa auxiliar',
  tamperLayer2Body:
    'Un pequeño número de archivos que no pueden empaquetarse (como los módulos WebAssembly del motor de base de datos) residen en resources\\app.asar.unpacked. El software los compara elemento a elemento con el manifiesto de firmas en cada arranque. Ante una discrepancia: ① muestra un aviso persistente en la parte superior de la interfaz (contraíble); ② escribe en el registro de auditoría una vez por arranque, sin borrado automático; ③ ofrece detalles de diagnóstico con nombres de archivo, hashes originales y hashes actuales. Esta capa no afecta al permiso de escritura; la capacidad de escritura de los datos la determina por separado la "integridad del archivo de datos". Las dos comprobaciones están deliberadamente separadas.',
  tamperNote:
    'Límites de la protección: la capa principal está garantizada dentro del ejecutable — un programa modificado no puede arrancar. La capa auxiliar registra pruebas de manipulación en lugar de impedirla de forma absoluta; defiende frente a cambios accidentales, alteraciones silenciosas de software de seguridad y sustituciones erróneas. Si se alteraran tanto los archivos como el manifiesto de firmas, el bypass sería teóricamente posible, pero dejaría rastro en la cadena de auditoría.',
  crashTitle: 'Diagnóstico de arranque',
  c1: 'Primero identifica el síntoma. Ninguna ventana y el proceso desaparece de inmediato: ve al punto 2. Aparece una ventana con un aviso interno: sigue la ruta que indica ese aviso.',
  c2: '"Sale al instante sin ventana" significa que el núcleo del programa ha sido modificado o que los archivos están dañados. La causa más común es un software de seguridad que pone en cuarentena, analiza o altera bytes de Archbox.exe o app.asar; también son posibles una instalación incompleta o errores de escritura en disco.',
  c3: 'El remedio es reinstalar. Consigue un paquete por el canal oficial e instálalo sobre la misma ubicación. Los datos no están en la carpeta del programa, así que sobrescribir la instalación no los afecta. Si el software de seguridad bloquea el proceso repetidamente, añade la carpeta del programa a su lista de permitidos y reinstala.',
  c4: 'Por qué no hay diálogo para esta capa: la comprobación se ejecuta antes del código de negocio y es comportamiento interno del ejecutable, así que el software no tiene ocasión de mostrar un aviso. Esta página de la guía es ese aviso.',
  c5: 'Ubicación de los registros: cuando el programa arranca con normalidad, los registros se escriben en {dir} como app-2026-10-17.log, rotados a diario y conservados 7 días (copia la ruta completa mostrada arriba, o pulsa "Abrir carpeta de registros" en Ajustes → Registro de ejecución). Ten en cuenta que la carpeta de registros está junto a la carpeta de datos, no dentro. Las primeras líneas del arranque contienen "Autocomprobación de archivos del programa: superada / deshabilitada / fallida", que es el resultado de la capa auxiliar.',
  unfitTitle: 'Cuándo no usar este software',
  unfitLead: 'Si se cumple alguna de las siguientes condiciones, plantéate otra herramienta:',
  u1: 'Necesitas que varias personas editen el mismo documento a la vez. Esto es un puesto de un solo usuario; compartir en solo lectura es el máximo y no hay colaboración en tiempo real.',
  u2: 'Necesitas acceso desde móviles o tabletas. Es una aplicación de escritorio. Compartir en LAN es para equipos con el mismo software; no es una página web y no tiene cliente móvil.',
  u3: 'Necesitas un enlace público para clientes. Compartir se limita al segmento de red local y puede desactivarse, así que no sirve para publicación externa.',
  u4: 'Necesitas gestionar decenas de miles de imágenes. Las imágenes se guardan en línea y la base de datos crece; usa una herramienta específica de gestión de activos.',
  u5: 'Tu equipo no acepta que los datos vivan en un solo equipo. Es una premisa de diseño de este software, sin término medio.',
  coda: 'Si tus documentos deben guardarse a salvo en este equipo a largo plazo, abribles en cualquier momento e independientes de caídas de red, este software está hecho exactamente para eso.',
  tail: 'Esta página se actualiza con cada versión. El entorno de ejecución, los componentes de código abierto y los términos de licencia se documentan en la página Acerca de. Esta es una compilación de prueba; las funciones y la documentación pueden seguir cambiando.'
};
