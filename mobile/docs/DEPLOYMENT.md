# 모바일 서버 배포와 남은 검증

현재 주소: https://okgu-mobile.rlasksk030.workers.dev/  
OAuth callback: https://okgu-mobile.rlasksk030.workers.dev/auth/callback

## 구성 완료
- 기존 Cloudflare Workers Free 계정, 신규 okgu-mobile Worker.
- Google 프로젝트 nana-484101에 모바일 전용 웹 클라이언트 생성, Nana 테스트 사용자 등록. 앱 공개 상태는 Testing.
- GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY는 Worker Secret 저장.
- APP_ORIGIN, GOOGLE_CLIENT_ID, SCHOOL_YEAR, SPREADSHEET_ID는 환경 변수 설정.
- 무료 D1 okgu-mobile 생성·DB 바인딩·migrations/0001_initial.sql 적용. 8개 테이블 확인.
- WRITE_ENABLED=1, PUSH_ENABLED=0. 자동 알림 cron 없음. 기존 Worker 로그 설정 유지.

## Dashboard 재현 빌드
`npm run build:dashboard`는 esbuild로 public 자산과 서버를 묶어 dist/app.js, dist/worker.js, dist/build.json을 생성한다. 레지스트리가 제한된 환경은 OKGU_ESBUILD_MODULE에 이미 설치한 공식 esbuild 모듈 경로를 지정할 수 있다.

공식 @block65/webcrypto-web-push v2.0.0 및 uint8array-extras v1.5.0 원본/라이선스/해시는 vendor/에 있다. 새 패키지를 임의 출처에서 설치하지 않는다.

Cloudflare Edit code에서는 **기본 worker.js를 유지**하고 app.js 번들을 Upload로 추가한다. 기본 worker.js의 내용을 `export { default } from "./app.js";`로 수정하고 Deploy한다. .mjs 업로드 또는 루트 Set Entrypoint는 이 환경에서 배포 오류를 일으켰다. 기존 배포 버전과 로컬 hash를 기록하고 실제 URL을 확인한다.

`npm run deploy`의 기본 차단 유지. 사용자 승인 없는 유료 리소스 생성, 권한 확대, 자동 CI 연결 금지.

## 다음 단계
사용자가 **계정 전체 Sheets 확인·수정·생성·삭제 접근 부여를 승인**했고 동의 처리를 완료했다. callback 통신 옵션 오류를 수정해 실제 로그인과 학교 시트 읽기까지 확인했다. 분리된 합성 Google Sheet에서 작성·수정·삭제와 다른 줄 보존을 실검증했고, 학교 시트 대상 복원 및 기본 쓰기를 활성화했다. 사용자 계정 권한에 따라 API 읽기/쓰기가 거부되는지도 확인한다.

Google Sheets 셀 갱신에는 이 코드가 사용하는 원자적 compare-and-swap이 없다. 앱 내부 잠금/직전 원문 검사는 직접 시트에서 수정하는 사람과 마지막 순간 경합을 완전히 막지 못한다. 저장 직전 FORMULA 재조회와 변경 거부를 추가하고 남은 경합 한계를 검토했다. 기본 CRUD 시험 사용을 활성화했으나 동시 외부 편집을 완전 보장하거나 실기기까지 검증한 것으로 표시하지 않는다.

푸시 초안은 최대 4건/실행·9분 지연 창, 실패 복구가 불충분하다. 처리량·재시도 보정 및 iPhone/Android 종료·잠금 상태에서 검사 전에는 켜지 않는다. 홈 화면 설치도 실제 기기 검증 필요.

공식 참고:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.cloudflare.com/workers/get-started/dashboard/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
