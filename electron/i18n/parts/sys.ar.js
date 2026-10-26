/** قاموس i18n للعملية الرئيسية · نطاق sys (العربية). مجموعة المفاتيح يجب أن تطابق sys.zh-CN.js تمامًا. */
module.exports = {
  /* ---- نافذة تحذير سلامة قاعدة البيانات ---- */
  dbIntegrityTitle: 'تحذير سلامة قاعدة البيانات',
  dbIntegrityMsg: 'تم اكتشاف فشل التحقق من سلامة قاعدة البيانات (قد تكون معدّلة أو تالفة).',
  dbReadOnlyNote:
    '\n\nلتجنّب الكتابة فوق الأدلة، تحول البرنامج إلى 【وضع القراءة فقط】:\nما زال بإمكانك تصفّح البيانات والبحث فيها وتصديرها، لكن لا تعديلها.\nبعد تأكيد كونها إنذارًا كاذبًا يمكنك إعادة بناء خط التوقيع في الإعدادات لاستعادة الكتابة.',
  dbAuditNote: '\n\nتم تسجيل هذا الحادث في سجل التدقيق (مدخل واحد لكل تشغيل، لا يمكن مسحه تلقائيًا).',
  dbGotoSettings: 'الانتقال إلى الإعدادات',
  dbQuit: 'إنهاء البرنامج',

  /* ---- نافذة تحذير سلامة ملفات البرنامج ---- */
  appIntegrityTitle: 'تحذير سلامة ملفات البرنامج',
  appIntegrityMsg: 'تم اكتشاف عدم تطابق بين ملفات التشغيل المرفقة بالبرنامج وقائمة التوقيع الصادرة مع الإصدار.',
  appIntegrityDetail:
    'النطاق المتأثر: الملفات تحت app.asar.unpacked في مجلد تثبيت البرنامج ($scope={scope}).\n' +
    'لقد اجتاز البرنامج الرئيسي app.asar فحص Electron المدمج في الملف التنفيذي — لو كان البرنامج الرئيسي قد عُدّل لما استطاع هذا البرنامج أن يبدأ أصلًا.\n\n' +
    '{reason}\n\nتم تسجيل هذا الحادث في سجل التدقيق (مدخل واحد لكل تشغيل، لا يمكن مسحه تلقائيًا).' +
    'إن لم تعدّل هذه الملفات بنفسك فيُنصح بإعادة الحصول على حزمة البرنامج من قناة رسمية، أو الحذر من مصدر هذا التشغيل.',
  appIntegrityOk: 'علمت',

  /* ---- أسباب محددة لفشل التحقق من السلامة (db/core.js + services/integrity.js) ---- */
  integSigBroken: 'ملف التوقيع تالف؛ لا يمكن التحقق من سلامة قاعدة البيانات',
  integSigFail: 'فشل التحقق من توقيع قاعدة البيانات؛ قد تكون معدّلة',
  integHashMismatch: 'مُلخّب محتوى قاعدة البيانات غير مطابق؛ قد تكون معدّلة أو تالفة',
  integCrcMismatch: 'قيمة CRC32 لمحتوى قاعدة البيانات غير مطابقة؛ قد تكون تالفة',
  integDefault: 'فشل التحقق من سلامة قاعدة البيانات',
  appIntegrityDirMissing: 'مجلد ملفات التشغيل المرفقة app.asar.unpacked مفقود بالكامل',
  appIntegrityDirMissingDetail:
    'لكن ترويسة app.asar تعلن أنه يجب أن يحتوي على {n} ملف(ات) ({sample}{more}) — حُذف المجلد أو لم يُثبّت مع الحزمة',
  andMore: ' وغيرها',
  diffModified: '{n} معدّل ({sample}{more})',
  diffMissing: '{n} محذوف ({sample}{more})',
  diffAdded: '{n} مضاف ({sample}{more})',
  appIntegrityNoDir: 'مجلد البرنامج غير موجود؛ تم تخطي الفحص الذاتي',
  appIntegrityNoManifest: 'لم يُعثر على قائمة توقيع ملفات البرنامج (وضع التطوير أو أول تشغيل)؛ تم تخطي الفحص الذاتي',
  appIntegrityManifestBroken: 'قائمة توقيع ملفات البرنامج تالفة ولا يمكن تحليلها',
  appIntegritySigFail: 'فشل التحقق من قائمة توقيع ملفات البرنامج: ',
  appIntegrityMismatch: 'ملفات البرنامج لا تطابق قائمة التوقيع: ',
  manifestMissing: 'كائن القائمة مفقود',
  manifestNoSig: 'القائمة لا تحتوي على توقيع',
  manifestSigInvalid: 'توقيع القائمة غير صالح (ربما استُبدلت القائمة أو عُدّلت أو أُنشئت ببرنامج آخر)',

  /* ---- شاشة فشل فتح قاعدة البيانات (keystore.js → state.dbError) ---- */
  dbOpenFailed: 'فشل فتح قاعدة البيانات ({dir}): {msg}',
  dbTampered: '【تم اكتشاف تعديل على ملف البيانات: {reason}】',
  dbStillCantOpen: 'ما زالت قاعدة البيانات غير قابلة للفتح',
  dbLockedNeedPass: 'قاعدة البيانات مشفّرة وتحتاج عبارة مرور لفتحها',

  /* ---- نافذة اختيار مجلد البيانات (ipc/boot.js) ---- */
  pickDataDirTitle: 'اختر مجلد البيانات الذي يحتوي على archive.db (للإصلاح/الاستعادة)',

  /* ---- سجلات التدقيق (الإجراء/التفاصيل تُعرض مباشرة في قائمة التدقيق بالإعدادات) ---- */
  auditDbIntegrity: 'إنذار سلامة قاعدة البيانات',
  auditAppIntegrity: 'إنذار سلامة ملفات التطبيق',
  auditIntegrityAction: 'تحولت هذه الجلسة إلى القراءة فقط، ولن يُعاد بناء خط التوقيع تلقائيًا',
  auditAppIntegrityReason: 'ملفات التطبيق لا تطابق القائمة الموقّعة',
  integNoSig: 'لا يوجد ملف توقيع؛ يُعتبر أول تشغيل (سوف ينشئ persistNow خط الأساس)',
  integNoDbFile: 'لا يوجد ملف قاعدة بيانات',
  chainDetailNone: 'لا توجد سجلات',

  /* ---- أسماء إجراءات التدقيق وأسباب فشل تسجيل الدخول (تُكتب في audit_log وتُعرض في قائمة التدقيق) ---- */
  actPackImport: 'استيراد حزمة مستندات',
  actUserRegister: 'تسجيل مستخدم جديد',
  actLoginFail: 'فشل تسجيل الدخول',
  actLogin: 'تسجيل الدخول',
  actResetPassword: 'إعادة تعيين كلمة المرور',
  actChangePassword: 'تعديل كلمة المرور',
  actSetQA: 'تعيين أسئلة الأمان',
  actRecoverByQA: 'استعادة كلمة المرور عبر أسئلة الأمان',
  actChangeSetting: 'تعديل إعداد',
  actRegionUpdate: 'تعديل النطاق',
  actRegionCreate: 'إنشاء نطاق',
  actRegionDelete: 'حذف نطاق',
  actCatUpdate: 'تعديل التصنيف',
  actCatCreate: 'إنشاء تصنيف',
  actCatDelete: 'حذف تصنيف',
  actTagAutoCreate: 'إنشاء تسمية تلقائيًا',
  actTagUpdate: 'تعديل تسمية',
  actTagCreate: 'إنشاء تسمية',
  actTagDelete: 'حذف تسمية',
  actFieldUpdate: 'تعديل تعريف حقل',
  actFieldCreate: 'إنشاء تعريف حقل',
  actFieldDelete: 'حذف تعريف حقل',
  actPostUpdate: 'تعديل مستند',
  actPostCreate: 'إنشاء مستند',
  actPostMerge: 'دمج مستندات',
  actPostTrash: 'حذف مستند (نقله إلى المهملات)',
  actPostRestore: 'استعادة مستند',
  actPostPurge: 'حذف مستند نهائيًا',
  actPostVersionRestore: 'استعادة إصدار تاريخي',
  actTransferPosts: 'نقل جميع المستندات',
  actNoteCreate: 'إنشاء ملاحظة',
  actNoteDelete: 'حذف ملاحظة',
  sysUser: 'النظام',
  unknownUser: 'مستخدم غير معروف',
  loginNoUser: 'المستخدم غير موجود',
  loginMacMismatch: 'عنوان MAC غير مطابق',
  loginBadPassword: 'كلمة مرور خاطئة',
  chainBrokenPrev: 'السجل #{id}: prev_hash لا يطابق السجل السابق (انقطاع السلسلة)؛ قد تكون هناك حذف أو إدراج',
  chainBrokenContent: 'السجل #{id}: المحتوى لا يطابق self_hash (حقول معدّلة)',
  chainOkDetail: 'تم التحقق من {n} سجلًا مُسلسَلًا؛ السلسلة سليمة وغير معدّلة',
  mergeAppendMark: '[أُضيف بالدمج {time}]',
  regionFallback: 'نطاق #{id}',
  categoryFallback: 'تصنيف #{id}',

  /* نصوص مخرجات التصدير (Markdown / PDF) */
  docFallbackName: 'مستند',
  sharedDocTitle: 'مستند مشترك',
  uncategorized: 'غير مصنّف',
  exportTitle: 'تصدير المستندات',
  tagsLabel: 'تسميات',
  fieldsBlock: 'تفاصيل الحقول',
  statusDraft: 'مسودة',
  statusPublished: 'منشور',
  metaStatus: 'الحالة',
  metaRegion: 'النطاق',
  metaCategory: 'التصنيف',
  metaCreated: 'أُنشئ',
  metaUpdated: 'حُدّث',
  metaAuthor: 'المؤلف',
  exportFooter: 'صُدّر في {time} · {n} مستند(ات) · أُنشئ بواسطة {app}',

  /* تقرير استيراد حزمة المستندات */
  packZipLabel: 'ZIP حزمة المستندات ',
  importRegionName: 'نطاق مستورد',
  emptyTitle: '(بدون عنوان)',
  impFieldFail: 'الحقل {code}: {msg}',
  impItemFail: 'الصف {n}: {msg}',
  impSkipEmptyTitle: 'الصف {n}: العنوان فارغ، تم التخطي',
  impSkipDup: 'الصف {n} «{title}»: قيمة حقل مكررة، تم التخطي',
  impReasonEmptyTitle: 'العنوان فارغ',
  impReasonDup: 'قيمة حقل مكررة مع «{title}»',
  impReasonMerged: 'مدمج في «{title}»',
  impReasonSuffix: 'استيراد مكرر؛ أُضيفت لاحقة «استيراد مكرر» إلى العنوان',
  impReasonNoCheck: 'بدون فحص التكرار · إنشاء جديد',
  impReasonCreated: 'اجتاز فحص التكرار · إنشاء جديد',
  impExistingDoc: 'مستند موجود',
  impDupSuffix: '(استيراد مكرر {code})',
  impProgress: 'تمت معالجة {n}/{total}',

  /* تنبيهات الساعة وخدمة السحابة */
  clockBackdrift: 'هذا التشغيل أقدم من سجل التشغيل السابق؛ قد تكون ساعة النظام أُعيدت إلى الوراء',
  clockRollback: 'تم اكتشاف ارتداد ساعة النظام نحو الخلف بنحو {n} ثانية',
  clockJump: 'تم اكتشاف قفزة ساعة النظام إلى الأمام بنحو {n} دقيقة',

  /* صفحة شرح الشبكة المحلية (تُعرض عند الدخول المباشر من المتصفح) */
  lanPageTitle: '文档盒 Archbox · خدمة المشاركة المحلية',
  lanPageH1: '文档盒 Archbox · خدمة المشاركة المحلية',
  lanPageMeta: 'الإصدار {ver} · المنفذ {port} · يعمل',
  lanPageOk1: 'إذا رأيت هذه الصفحة فهذا يعني <b>أن الخدمة تعمل</b> — هي ببساطة لا تملك واجهة ويب.',
  lanPageOk2:
    'المحتوى المشترك على الشبكة المحلية يجريه <b>عميل 「文档盒」</b> نفسه: افتح 「المشاركة المحلية」 على جهاز آخر ثُبّت عليه هذا البرنامج وستظهر هذه الآلة تلقائيًا في القائمة (بث كل 5 ثوانٍ على نفس الشبكة الفرعية، دون إدخال عنوان يدويًا).',
  lanPageOk3: 'طريق كتابة العنوان في المتصفح لا يصلح، لسببين:',
  lanPageLi1:
    'الخدمة تقبل <code>/api/…</code> فقط وتتطلب حمل رمز الوصول — الرمز يحصل عليه العميل عند الاكتشاف وهو غير متاح في المتصفح.',
  lanPageLi2: 'الواجهة لا تمنح إذن العبور بين الأصول بشكل متعمّد، فلا يستطيع المتصفح قراءة المحتوى المشترك عبر الأصول.',
  lanPageOk4: 'للتأكد من عمل الخدمة اطلب <code>/health</code> أو <code>/api/version</code>.'
};
