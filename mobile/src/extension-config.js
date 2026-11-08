// ============================================================
// 🔧 설정 파일 - 여기서 스프레드시트 정보를 관리합니다
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1sQhiIldTRHR8X1PVLqbnTKE1tOQPqfSpmeCrtqrHfZc',

  // 시트 탭 이름 → 해당 월 매핑
  // 학년도: 2026년 3월 ~ 2027년 2월
  SHEET_TABS: {
    3:  { name: '3월',      year: 2026 },
    4:  { name: '4월',      year: 2026 },
    5:  { name: '5월',      year: 2026 },
    6:  { name: '6월',      year: 2026 },
    7:  { name: '7월',      year: 2026 },
    8:  { name: '8월',      year: 2026 },
    9:  { name: '9월',      year: 2026 },
    10: { name: '10월',     year: 2026 },
    11: { name: '11월',     year: 2026 },
    12: { name: '12월',     year: 2026 },
    1:  { name: '내년(1월)', year: 2027 },
    2:  { name: '내년(2월)', year: 2027 }
  },

  // 알림 시간 (24시간 형식)
  ALARM_HOUR: 8,
  ALARM_MINUTE: 30,

  // 데이터 읽기 범위 (각 시트에서 읽을 범위)
  READ_RANGE: 'A1:H120',

  // 요일 컬럼 매핑 (0=일요일 ~ 6=토요일) → 스프레드시트 컬럼
  // 시트 구조: B=일, C=월, D=화, E=수, F=목, G=금, H=토
  DAY_TO_COL_INDEX: {
    0: 1,  // 일요일 → B열 (index 1)
    1: 2,  // 월요일 → C열 (index 2)
    2: 3,  // 화요일 → D열 (index 3)
    3: 4,  // 수요일 → E열 (index 4)
    4: 5,  // 목요일 → F열 (index 5)
    5: 6,  // 금요일 → G열 (index 6)
    6: 7   // 토요일 → H열 (index 7)
  },

  // 컬럼 인덱스 → 스프레드시트 열 문자
  COL_LETTERS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
};

export { CONFIG };
