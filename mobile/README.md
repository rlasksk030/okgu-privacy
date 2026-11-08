# 옥구알리미 모바일

주간업무계획 구글 시트를 **휴대폰에서 확대·가로 이동 없이 읽기 좋게 보여주는 것**이 최우선 목표입니다. 이용 대상은 옥구초 교직원이며, iPhone Safari와 갤럭시·안드로이드 Chrome의 홈 화면 웹앱을 목표로 합니다.

현재 상태: **실제 Google 로그인·학교 일정 읽기 확인 완료, 실제 시트 쓰기 검증 중**.

사이트: https://okgu-mobile.rlasksk030.workers.dev/

예시 화면: https://okgu-mobile.rlasksk030.workers.dev/?demo=1

Cloudflare Workers Free에 서버와 화면, D1 로그인 저장소, Google OAuth 설정을 연결했습니다. 사용자 승인 후 실제 Google Sheets 연결과 학교 일정 읽기를 확인했습니다. 쓰기와 푸시는 비활성 상태이며 정식 운영 서비스로 표시하지 않습니다. 예시 데이터의 작성·수정·삭제는 학교 시트에 반영되지 않습니다.

## 화면

- 오늘: 제목과 시간을 먼저 읽고, 대상·장소·담당을 구분합니다.
- 3일·주간: 날짜별 세로 목록으로 읽습니다.
- 월간: 달력에는 일정 건수만 작게 표시하고, 선택한 날짜의 상세 일정은 아래에 크게 표시합니다.
- 검색: 이름, 학년, 행사명, 장소를 전체 학년도 또는 선택한 월에서 검색합니다.
- 추가·수정·삭제는 필수 기능입니다. 상단 + 또는 날짜별 ‘일정 추가’로 새 일정을 쓰고, 일정을 눌러 수정·삭제합니다. 최종 저장·삭제 전 내용을 확인하며 원본 시트의 다른 일정은 보존합니다.
- 설정: 글자 크기, 내 이름, 4개 알림 시간, 내 일정만 알림, 빈 일정 알림 생략.

## 구성

- `public/`: 외부 CDN 의존성이 없는 모바일 UI, PWA 셸, 서비스 워커.
- `src/extension-parser.js`, `src/extension-config.js`: 실제 설치본 v1.10.14에서 가져온 코드. 원본에 모듈 import/export만 추가.
- `src/core.mjs`: 월·날짜 검증, 이벤트 원본 위치 추적, 변경 충돌 확인, 월 경계 쓰기 보정.
- `src/worker.mjs`: Cloudflare Worker 대상 Google OAuth, Sheets, D1 세션·암호화 토큰·개인 설정, Web Push/예약 처리의 초안.
- `migrations/`: 무료 D1 okgu-mobile에 적용한 스키마.

## 확인

`npm test`로 네트워크가 필요 없는 논리 검사를 실행합니다. 2026-11-09 기준 25개 PASS. `npm run preview`는 로컬 HTTP 미리보기입니다. 현재 작업 환경에서는 포트 열기가 EPERM으로 차단되었습니다.

대시보드 배포용 번들은 `npm run build:dashboard`로 생성합니다. 실제 Sheets CRUD·모바일 실기기 검증은 남아 있습니다. `npm run deploy`의 기본 차단을 유지하며 아래 문서에서 상태를 확인합니다.

- [배포 전 남은 작업](docs/DEPLOYMENT.md)
- [기능 대응과 검증 범위](docs/STATUS.md)
- [데이터 처리 설계](docs/DATA.md)

실제 학교 일정 데이터·개인 토큰·비밀키는 소스, 예시 데이터, 검증 증거에 포함하지 않았습니다.
