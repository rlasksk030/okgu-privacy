# 운영 배포 전 필요한 작업

이 프로젝트는 아직 출시 준비가 끝나지 않았습니다. UI 초안·로직 검사와 실제 계정·실기기 검증을 구분합니다.

2026-11-09: 기존 계정의 Workers Free를 확인했고, 합성 데이터 정적 미리보기만 https://okgu-mobile.rlasksk030.workers.dev/ 에 배포했습니다. 아래 단계는 실제 시트 연동 서버를 위한 남은 작업입니다. 운영 origin은 `https://okgu-mobile.rlasksk030.workers.dev`, OAuth redirect URI는 `https://okgu-mobile.rlasksk030.workers.dev/auth/callback`입니다. 비밀 설정과 D1은 아직 연결하지 않았습니다.

1. 기존 Cloudflare 계정에서 Workers Free/D1 무료 한도 및 실제 요금제 확인. Paid 계정의 과금 여지가 있으면 생성·배포 중지. 새 결제 수단이나 유료 플랜을 등록하지 않습니다.
2. 확인 또는 승인된 D1 리소스의 실제 ID를 `wrangler.jsonc`에 입력하고 원격 적용 전 스키마를 검토합니다. 현재 ID는 배포 불가 표식입니다.
3. Google Cloud에서 웹 애플리케이션 OAuth 클라이언트를 준비합니다. 확장프로그램용 클라이언트 ID를 그대로 재사용하지 않습니다. redirect URI는 실제 운영 origin + `/auth/callback`입니다.
4. `openid email profile spreadsheets` 범위, 동의 화면, 학교 Workspace 제한 및 검증 필요성을 확인합니다. 현재 코드는 개별 계정으로 대상 시트 접근을 확인하고 개별 계정 권한으로 저장합니다.
5. Google client secret, 32바이트 AES-GCM 키, VAPID 키는 배포 환경의 비밀 설정에만 입력합니다. 파일·커밋·대화에 키를 붙이지 않습니다. `.dev.vars.example`은 키 이름 목록일 뿐입니다.
6. 공식 레지스트리에서 의존성을 설치하고 lockfile을 생성·검토합니다. 현재 버전 범위는 아직 설치 검증되지 않았으므로 운영 공급망 고정이 필요합니다.
7. `npm test`, `npm run build`, 실제 브라우저·계정별 읽기/쓰기 검증을 수행합니다.
8. 교직원 알림 동시 도착 시 무료 CPU·네트워크 제한 안에서 처리되는지 확인합니다. 현재 cron 초안은 한 번에 최대 4건, 9분 지연 창이며 대상 기기가 많으면 누락될 수 있습니다. 처리량과 큐를 검증·보정하기 전 자동 알림을 출시하면 안 됩니다. 성공/실패/불확실 상태 재처리 정책도 실서비스에서 검증해야 합니다.
9. iPhone의 홈 화면 설치·알림 허용, Android Chrome 설치·알림 허용, 기기 잠금/절전/앱 종료 상태를 실제로 검사합니다.
10. 검증을 완료한 뒤 배포합니다. 현재 공개된 정적 미리보기는 실제 시트 연동 운영 서비스가 아닙니다.

Google Sheets API에는 이 코드가 사용할 수 있는 셀 단위 원자적 compare-and-swap이 없습니다. 앱 내부 쓰기 잠금과 직전 원문 비교는 구현했지만, 시트에서 직접 편집하는 사용자와 최종 쓰기 직전 경합은 완전히 막지 못합니다. 교직원 공동 편집에서 이 한계를 검토하고 실제 경합 검사 및 복구 정책을 확정해야 합니다.

참고한 공식 문서:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://github.com/block65/webcrypto-web-push/blob/master/packages/web-push/README.md
