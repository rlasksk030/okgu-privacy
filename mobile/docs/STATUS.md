# 2026-11-09 최신 상태

목표: 구글시트의 작은 표를 휴대폰에서 읽기 편하게 제공하고, 확장프로그램과 같이 새 일정 작성·수정·선택 일정 삭제를 지원한다. iPhone·Galaxy/Android 지원은 필수다.

## 현재 결론
서버와 화면 배포, 모바일 전용 OAuth 클라이언트, 테스트 사용자, 암호화 비밀 설정, D1 연결·스키마 적용 완료. **실제 Google Sheets 접근 동의 및 계정 연동 검증 대기. 업무용 정식 출시 아님.** WRITE_ENABLED=0, PUSH_ENABLED=0, cron 미등록.

- 앱: https://okgu-mobile.rlasksk030.workers.dev/
- 예시 화면: https://okgu-mobile.rlasksk030.workers.dev/?demo=1
- 이전 정적 미리보기는 okgu-mobile-preview 이름으로 보존. 이름 변경 후 해당 별도 URL은 재검사하지 않았음.
- 서버 최초 배포 버전 85a7c23f. 로그인 설정과 DB 바인딩 저장으로 후속 버전 생성.
- 기존 개인정보처리방침 main, 기존 Worker 8개 및 기존 Google OAuth 클라이언트는 변경하지 않음.

## 구현과 검사
| 항목 | 상태/근거 |
|---|---|
| 오늘·내일·3일·주간·월간·검색·이름 필터·큰 글자 | UI 구현, 기간/필터 논리 통과. 데스크톱 예시 표시 확인 |
| 새로 작성·수정·삭제 | 예시 UI CRUD 확인. 실제 시트 CRUD 미실행; 필수 출시 조건 |
| 저장 복구 | 요청 식별자·내용 해시 보관, D1 잠금, 재시도 원문 대조 후 동일 요청 중복 PUT 방지 |
| 응답 유실 | 합성 Sheets 응답 유실 후 재시도에서 추가 PUT 없이 성공 결과 복구 확인 |
| 충돌 | 같은 요청의 다른 내용 거부, 동시 저장 잠금, 이전 미확정 요청이 있으면 새 저장 차단 |
| 로그아웃 | 서비스 워커가 없는 기기에서 무기한 기다리지 않게 수정. 실제 계정 로그아웃 미검증 |
| 알림 | Web Push 의존성을 공식 원본 v2.0.0으로 보존하여 번들 빌드. 처리량·실패 복구·실기기 미검증. 비활성 |
| 설치 | manifest·아이콘·서비스 워커 배포. iOS/Android 홈 화면 설치 미검증 |

- `node --test tests/*.test.mjs`: **21/21 PASS**. 실제 Google API 성공과 구분.
- Node 구문 검사와 번들 정적 경로/비로그인 응답 검사 통과.
- esbuild 0.28.1로 서버/정적 자산 단일 번들 생성: 110,099 bytes, SHA256 `b253bd1ce1b50046dcc32de9d822d04278924faa19b5136b787c992835165023`.
- 운영 URL에서 옥구알리미 첫 화면과 Google 계정으로 시작하기 버튼 확인.
- Google 로그인 시작 → 등록된 테스트 계정 선택 → 테스트 앱 안내 → Sheets 권한 승인 화면 도달. Sheets 권한 체크/최종 승인은 미실행.
- Google 동의 화면은 계정의 모든 Sheets 확인·수정·생성·삭제 범위. 앱 코드는 env의 지정 업무 시트만 요청하지만 OAuth 권한 범위 자체가 한 시트로 제한되는 것은 아님.
- D1 `okgu-mobile` 신규 생성·DB 바인딩. users, sessions, oauth_states, subscriptions, deliveries, test_jobs, write_operations, write_locks 8개 테이블 목록 확인.
- Google client secret 및 32바이트 AES-GCM 키는 Cloudflare Secret 항목에 저장. 소스/문서에 값 미포함.

## 배포 문제 및 해결
- Cloudflare 정적 전용 Worker는 서버 설정 불가. 기존 미리보기 이름을 보존 변경하고 같은 원래 주소에 서버 Worker를 생성.
- Quick Edit에서 루트에 Set Entrypoint 적용/시작 파일 업로드 교체 시 `Entrypoint must not be empty` 오류. 새 편집 세션에서 기본 worker.js를 보존하여 해결.
- .mjs 업로드는 모듈 배포에 포함되지 않아 `No such module` 발생. 앱 번들을 app.js로 명명하고 worker.js는 `export { default } from "./app.js";`로 연결하여 실제 배포 완료.
- 편집기 JS 타입 추론 진단 8건은 남음(번들/의존성 타입 추론). 런타임 성공·구문 검사와 별도이며 타입 검사 PASS로 기록하지 않음.
- npm DNS/로컬 포트 제한은 유지. 설치된 esbuild와 공식 저장소에서 읽은 고정 원본으로 번들 구성.
- TextEdit 사용은 자동 승인 검토에서 거절. 해당 앱 재시도 없이 Cloudflare의 Upload 기능으로 소스 파일 전달.

## 남은 필수 검증
1. 사용자가 실제 Google Sheets 접근 부여를 승인한 뒤 OAuth callback, 실제 업무 시트 읽기 확인.
2. 분리된 합성 Google Sheet에서 추가·수정·삭제·다른 줄 보존·권한 거부·응답 유실·동시 변경 검증. 실제 업무 시트에 시험 내용 쓰지 않음.
3. 360/390/430px 화면과 큰 글자, iPhone/Android 설치·키보드·터치 점검.
4. 외부 직접 시트 편집 경합/복구 검토 후 WRITE_ENABLED 활성화.
5. 푸시 처리량·지연·중복·실패 복구 보정과 실기기 검증 후 PUSH_ENABLED/cron 활성화.

## 비용·보존
Workers Free 및 D1 무료 범위에서 구성. 유료 플랜/결제 수단/새 유료 서버/새 GitHub 계정 없음.
GitHub Actions 예상 신규 실행 0회. 저장소에 workflow 없음. 소스와 감사 기록은 기존 계정의 feature/okgu-mobile-20261109 브랜치에 보존, main 미병합.
과거 기록은 HISTORY-20261109.md에 원문 보존.
