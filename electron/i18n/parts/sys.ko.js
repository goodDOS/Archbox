/** 주 프로세스 i18n 사전 · sys 도메인(한국어). 키 집합은 sys.zh-CN.js와 반드시 완전히 일치해야 합니다. */
module.exports = {
  /* ---- 데이터베이스 무결성 경고 팝업 ---- */
  dbIntegrityTitle: '데이터베이스 무결성 경고',
  dbIntegrityMsg: '데이터베이스 무결성 검증 미통과를 감지했습니다(변조되거나 손상되었을 수 있습니다).',
  dbReadOnlyNote:
    '\n\n증거를 덮어쓰지 않기 위해 프로그램이 【읽기 전용 모드】로 전환되었습니다:\n평소처럼 열람, 검색, 데이터 내보내기는 가능하지만 수정할 수 없습니다.\n오탕으로 확인 후 설정에서 서명 기준을 다시 만들어 쓰기 기능을 복구할 수 있습니다.',
  dbAuditNote: '\n\n이번 이벤트는 감사 로그에 기록되었습니다(시작 시 한 줄씩 기록되며 자동으로 지울 수 없음).',
  dbGotoSettings: '설정으로 이동하여 처리',
  dbQuit: '프로그램 종료',

  /* ---- 프로그램 파일 무결성 경고 팝업 ---- */
  appIntegrityTitle: '프로그램 파일 무결성 경고',
  appIntegrityMsg: '프로그램 부속 런타임 파일이 배포 시 서명 매니페스트와 일치하지 않는 것을 감지했습니다.',
  appIntegrityDetail:
    '영향 범위: 프로그램 설치 디렉터리 아래 app.asar.unpacked 내 파일($scope={scope}).\n' +
    '프로그램 주체 app.asar는 실행 파일 내부의 Electron 검증을 통과했습니다 —— 주 프로그램이 변경되었다면 본 프로그램은 아예 시작할 수 없습니다.\n\n' +
    '{reason}\n\n이번 이벤트는 감사 로그에 기록되었습니다(시작 시 한 줄씩 기록되며 자동으로 지울 수 없음).' +
    '이 파일들을 직접 수정한 적이 없다면 공식 채널에서 프로그램 패키지를 다시 받거나 이번 실행의 출처를 경계하는 것을 권장합니다.',
  appIntegrityOk: '알겠습니다',

  /* ---- 무결성 검증의 구체적 원인(db/core.js + services/integrity.js) ---- */
  integSigBroken: '서명 파일이 손상되어 데이터베이스 무결성을 검증할 수 없습니다',
  integSigFail: '데이터베이스 서명 검증 실패, 변조되었을 수 있습니다',
  integHashMismatch: '데이터베이스 콘텐츠 해시가 일치하지 않습니다, 변조되거나 손상되었을 수 있습니다',
  integCrcMismatch: '데이터베이스 콘텐츠 CRC32가 일치하지 않습니다, 손상되었을 수 있습니다',
  integDefault: '데이터베이스 무결성 검증 미통과',
  appIntegrityDirMissing: '프로그램 부속 런타임 파일 디렉터리 app.asar.unpacked이 통째로 누락되었습니다',
  appIntegrityDirMissingDetail:
    '그러나 app.asar 헤더는 그 안에 {n}개 파일이 있어야 한다고 선언했습니다({sample}{more}) —— 디렉터리가 삭제되었거나 패키지와 함께 설치되지 않았습니다',
  andMore: ' 등',
  diffModified: '{n}개 수정됨({sample}{more})',
  diffMissing: '{n}개 삭제됨({sample}{more})',
  diffAdded: '{n}개 추가됨({sample}{more})',
  appIntegrityNoDir: '프로그램 디렉터리가 존재하지 않아 자체 검사를 건너뜁니다',
  appIntegrityNoManifest:
    '프로그램 파일 서명 매니페스트를 찾지 못했습니다(개발 상태 또는 최초 실행), 자체 검사를 건너뜁니다',
  appIntegrityManifestBroken: '프로그램 파일 서명 매니페스트가 손상되어 파싱할 수 없습니다',
  appIntegritySigFail: '프로그램 파일 서명 매니페스트 검증 실패: ',
  appIntegrityMismatch: '프로그램 파일이 서명 매니페스트와 일치하지 않습니다: ',
  manifestMissing: '매니페스트 객체 누락',
  manifestNoSig: '매니페스트에 서명이 없습니다',
  manifestSigInvalid:
    '매니페스트 서명이 유효하지 않습니다(매니페스트가 교체·변조되었거나 본 프로그램이 아닌 다른 프로그램에서 생성되었을 수 있습니다)',

  /* ---- 데이터베이스 열기 실패 화면(keystore.js → state.dbError) ---- */
  dbOpenFailed: '데이터베이스 열기 실패({dir}): {msg}',
  dbTampered: '【데이터 파일 변경 감지: {reason}】',
  dbStillCantOpen: '데이터베이스를 여전히 열 수 없습니다',
  dbLockedNeedPass: '데이터베이스가 암호화되어 잠금 해제에 암호가 필요합니다',

  /* ---- 데이터 디렉터리 선택 대화 상자(ipc/boot.js) ---- */
  pickDataDirTitle: 'archive.db가 포함된 데이터 디렉터리 선택(수리/복구용)',

  /* ---- 감사 기록(action/detail은 설정 페이지 감사 목록에 직접 표시) ---- */
  auditDbIntegrity: '데이터베이스 무결성 경고',
  auditAppIntegrity: '프로그램 파일 무결성 경고',
  auditIntegrityAction: '이 세션은 읽기 전용으로 전환되었으며 서명 기준을 자동으로 다시 만들지 않습니다',
  auditAppIntegrityReason: '프로그램 파일이 서명 매니페스트와 일치하지 않습니다',
  integNoSig: '서명 파일이 없어 최초로 간주합니다(persistNow가 기준을 만들 예정)',
  integNoDbFile: '데이터베이스 파일이 없습니다',
  chainDetailNone: '기록 없음',

  /* ---- 감사 작업명과 로그인 실패 원인(audit_log에 기록, 감사 목록에 직접 표시) ---- */
  actPackImport: '문서 팩 가져오기',
  actUserRegister: '새 사용자 등록',
  actLoginFail: '로그인 실패',
  actLogin: '로그인',
  actResetPassword: '비밀번호 재설정',
  actChangePassword: '비밀번호 변경',
  actSetQA: '보안 질문 설정',
  actRecoverByQA: '보안 질문으로 비밀번호 찾기',
  actChangeSetting: '설정 수정',
  actRegionUpdate: '구역 수정',
  actRegionCreate: '새 구역',
  actRegionDelete: '구역 삭제',
  actCatUpdate: '분류 수정',
  actCatCreate: '새 분류',
  actCatDelete: '분류 삭제',
  actTagAutoCreate: '태그 자동 생성',
  actTagUpdate: '태그 수정',
  actTagCreate: '새 태그',
  actTagDelete: '태그 삭제',
  actFieldUpdate: '필드 정의 수정',
  actFieldCreate: '새 필드 정의',
  actFieldDelete: '필드 정의 삭제',
  actPostUpdate: '문서 수정',
  actPostCreate: '새 문서',
  actPostMerge: '문서 병합',
  actPostTrash: '문서 삭제(휴지통으로 이동)',
  actPostRestore: '문서 복구',
  actPostPurge: '문서 완전 삭제',
  actPostVersionRestore: '이력 버전 복구',
  actTransferPosts: '모든 문서 이전',
  actNoteCreate: '새 메모',
  actNoteDelete: '메모 삭제',
  sysUser: '시스템',
  unknownUser: '알 수 없는 사용자',
  loginNoUser: '사용자가 존재하지 않습니다',
  loginMacMismatch: 'MAC 불일치',
  loginBadPassword: '비밀번호 오류',
  chainBrokenPrev:
    '기록 #{id}의 prev_hash가 이전 기록과 일치하지 않습니다(체인 끊김), 삭제 또는 삽입이 있었을 수 있습니다',
  chainBrokenContent: '기록 #{id}의 내용이 self_hash와 일치하지 않습니다(필드가 변조됨)',
  chainOkDetail: '{n}개 체인화 기록을 검증했습니다, 체인이 완전하고 변조되지 않았습니다',
  mergeAppendMark: '[병합 추가 {time}]',
  regionFallback: '구역 #{id}',
  categoryFallback: '분류 #{id}',

  /* 내보내기 산출물 텍스트(Markdown / PDF) */
  docFallbackName: '문서',
  sharedDocTitle: '공유 문서',
  uncategorized: '미분류',
  exportTitle: '문서 내보내기',
  tagsLabel: '태그',
  fieldsBlock: '필드 정보',
  statusDraft: '초안',
  statusPublished: '게시됨',
  metaStatus: '상태',
  metaRegion: '구역',
  metaCategory: '분류',
  metaCreated: '생성',
  metaUpdated: '업데이트',
  metaAuthor: '작성자',
  exportFooter: '내보내기 시간: {time} · 총 {n}개 문서 · {app} 생성',

  /* 문서 팩 가져오기 보고서 */
  packZipLabel: '문서 팩 ZIP ',
  importRegionName: '가져온 구역',
  emptyTitle: '(제목 없음)',
  impFieldFail: '필드 {code}: {msg}',
  impItemFail: '{n}번째 행: {msg}',
  impSkipEmptyTitle: '{n}번째 행: 제목이 비어 건너뜀',
  impSkipDup: '{n}번째 행「{title}」: 필드 값 중복으로 건너뜀',
  impReasonEmptyTitle: '제목이 비어 있음',
  impReasonDup: '「{title}」과 필드 값 중복',
  impReasonMerged: '「{title}」에 병합',
  impReasonSuffix: '중복 가져오기, 제목에 「중복 가져오기」 접미사 추가',
  impReasonNoCheck: '중복 검사 안 함 · 신규 생성',
  impReasonCreated: '중복 검사 통과 · 신규 생성',
  impExistingDoc: '기존 문서',
  impDupSuffix: '(중복 가져오기 {code})',
  impProgress: '{n}/{total} 처리됨',

  /* 시계와 클라우드 서비스 안내 */
  clockBackdrift: '이번 시작 시간이 지난 시작 기록보다 빠릅니다. 시스템 시계가 되돌려졌을 수 있습니다',
  clockRollback: '시스템 시간이 약 {n}초 되돌려진 것을 감지했습니다',
  clockJump: '시스템 시간이 약 {n}분 앞으로 뛴 것을 감지했습니다',

  /* 로컬 네트워크 설명 페이지(브라우저 직접 접속 시 표시) */
  lanPageTitle: '文档盒 Archbox · 로컬 공유 서비스',
  lanPageH1: '文档盒 Archbox · 로컬 공유 서비스',
  lanPageMeta: '버전 {ver} · 포트 {port} · 실행 중',
  lanPageOk1: '이 페이지가 보이면 <b>서비스가 정상</b>입니다 —— 원래 웹 인터페이스가 없습니다.',
  lanPageOk2:
    '로컬 네트워크의 공유 콘텐츠는 <b>「文档盒」클라이언트</b>가 직접 가져옵니다: 이 소프트웨어를 설치한 다른 컴퓨터에서 「로컬 공유」를 열면 본机이 자동으로 목록에 나타납니다(같은 네트워크 대역에서 5초마다 브로드캐스트하므로 주소를 수동 입력할 필요가 없습니다).',
  lanPageOk3: '브라우저로 주소를 입력하는 방법은 통하지 않습니다. 두 가지 이유:',
  lanPageLi1:
    '서비스는 <code>/api/…</code>만 수용하며 접근 토큰을 휴대해야 합니다 —— 토큰은 클라이언트가 발견 시 취득하므로 브라우저에는 없습니다.',
  lanPageLi2:
    '인터페이스는 의도적으로 교차 출처 허용을 두지 않으므로 브라우저가 공유 콘텐츠를 교차 출역으로 읽을 수 없습니다.',
  lanPageOk4: '서비스가 실행 중인지 확인하려면 <code>/health</code> 또는 <code>/api/version</code>에 접근하세요.'
};
