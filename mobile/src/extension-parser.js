import { CONFIG } from './extension-config.js';
// ============================================================
// 📅 스케줄 파서 - 시트 데이터를 날짜별 일정으로 변환
// ============================================================

class ScheduleParser {

  /**
   * 시트 데이터(2D 배열)를 날짜별 일정 객체로 변환
   *
   * ✅ [버그 수정] 첫째주/마지막주 구분
   *   기존: lastDayCurrent와 비교해서 추론 → 5월 첫째주(large=[26-30])
   *         처럼 maxLarge가 lastDayPrev와 같은 경우 잘못 판정됨
   *   수정: 시트 안의 "주 인덱스"로 결정적 판단
   *         - 첫 번째 "구분" 행 = 첫째주 → large는 이전달, small은 현재달
   *         - 마지막 "구분" 행 = 마지막주 → large는 현재달, small은 다음달
   *         - 중간 주 = 모두 현재달
   */
  static parse(rows, month, year) {
    const schedule = {};
    if (!rows || rows.length === 0) return schedule;

    // ── 1차 패스: 모든 주의 날짜 배열 수집 ──
    // 시트 구조 특성: 마지막 주(주N)는 다음달 첫째/둘째주를 참고용으로 보여줌
    //   예: 6월 시트의 주6=[5,6,7,8,9,10,11] = 7월 둘째주 참고용
    //       이런 주는 모두 다음달로 처리해야 함
    const allWeeks = [];
    for (let r = 0; r < rows.length; r++) {
      const fc = ((rows[r] || [])[0] || '').replace(/\s+/g, '').trim();
      if (fc === '구분') {
        const wk = [];
        for (let c = 1; c <= 7 && c < rows[r].length; c++) {
          const dn = parseInt(rows[r][c]);
          if (!isNaN(dn) && dn > 0 && dn <= 31) wk.push(dn);
        }
        allWeeks.push(wk);
      }
      if (fc.includes('입력') && fc.includes('방법')) break;
    }
    const totalWeeks = allWeeks.length;

    // ── 2차 패스: 실제 파싱 ──
    let currentDates   = {};
    let currentSection = '';
    let inWeekBlock    = false;
    let weekIndex      = 0;   // 1부터 시작하는 현재 주 인덱스

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const firstCell = (row[0] || '').replace(/\s+/g, '').trim();

      if (firstCell === '구분') {
        currentDates   = {};
        currentSection = '';
        inWeekBlock    = true;
        weekIndex++;

        for (let c = 1; c <= 7 && c < row.length; c++) {
          const dayNum = parseInt(row[c]);
          if (!isNaN(dayNum) && dayNum > 0 && dayNum <= 31) {
            currentDates[c] = dayNum;
          }
        }
        continue;
      }

      const sectionFromHeader = this._detectSectionHeader(firstCell);
      if (sectionFromHeader) {
        currentSection = sectionFromHeader;
      } else if (firstCell.includes('협의') || firstCell.includes('건의')) {
        currentSection = '';
        inWeekBlock = false;
        continue;
      } else if (firstCell.includes('입력') && firstCell.includes('방법')) {
        break;
      }

      if (!inWeekBlock || Object.keys(currentDates).length === 0) continue;

      for (const [colStr, dayNum] of Object.entries(currentDates)) {
        const col = parseInt(colStr);
        const cellContent = (row[col] || '').trim();
        if (!cellContent) continue;

        if (cellContent.includes('업무명') || cellContent.includes('행사명') ||
            cellContent.includes('<예시>') || cellContent.includes('교장교감') ||
            cellContent === '일' || cellContent === '월' || cellContent === '화' ||
            cellContent === '수' || cellContent === '목' || cellContent === '금' || cellContent === '토') {
          continue;
        }

        const { actualYear, actualMonth } = this._resolveDate(
          dayNum, month, year, currentDates, weekIndex, totalWeeks, allWeeks
        );
        const dateKey = `${actualYear}-${String(actualMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

        if (!schedule[dateKey]) {
          schedule[dateKey] = { activities: [], trips: [], notes: [], _cells: [] };
        }

        schedule[dateKey]._cells.push({
          row: r + 1,
          col: col,
          section: currentSection || 'notes',
          colLetter: CONFIG.COL_LETTERS[col]
        });

        const lines = cellContent.split(/\n/).filter(s => s.trim());
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (currentSection === 'trips') {
            schedule[dateKey].trips.push(trimmed);
          } else if (currentSection === 'activities') {
            schedule[dateKey].activities.push(trimmed);
          } else {
            schedule[dateKey].notes.push(trimmed);
          }
        }
      }
    }

    return schedule;
  }

  // ---- A열 섹션 제목 표준화 ----
  // 시트에서 "출장"이 "복무(출장, 연가 등)"처럼 바뀌어도 같은 출장 섹션으로 인식한다.
  static _detectSectionHeader(firstCell) {
    if (!firstCell) return '';

    if (firstCell.includes('교육') && (firstCell.includes('활동') || firstCell.includes('업무'))) {
      return 'activities';
    }

    if (firstCell === '출장' || firstCell.includes('출장') || firstCell.includes('복무')) {
      return 'trips';
    }

    if ((firstCell.includes('주요') && firstCell.includes('참고')) ||
        firstCell.includes('참고사항') ||
        firstCell.includes('특별사항')) {
      return 'notes';
    }

    return '';
  }

  // ============================================================
  // ✅ 시트 구조 인식 + weekIndex 기반 월 결정
  //
  //   시트 구조 특성 (실제 데이터 분석으로 확인):
  //     - 주1: 이전월 말 + 현재월 초 (월 경계, large + small 혼합)
  //     - 주2~N-1: 순수 현재월 또는 마지막주(현재월 + 다음월 시작)
  //     - 주N: 다음월 첫째/둘째주 (참고용, small만)
  //
  //   판정:
  //     - 큰 숫자(≥25)와 작은 숫자(≤7)가 모두 있는 주
  //         → weekIndex==1: 첫째주 (large=이전달)
  //         → weekIndex>1: 현재월 마지막주 (small=다음달)
  //     - small만 있는 마지막 주(weekIndex==totalWeeks)
  //         → 다음월 참고용 → 모두 다음달
  //     - 그 외: 모두 현재달
  // ============================================================
  static _resolveDate(dayNum, month, year, currentDates, weekIndex, totalWeeks, allWeeks) {
    const allDays   = Object.values(currentDates).map(Number);
    const smallDays = allDays.filter(d => d <= 7);
    const largeDays = allDays.filter(d => d >= 25);

    let actualMonth = month;
    let actualYear  = year;

    // 케이스 A: large + small 모두 있음 (월 경계 주)
    if (smallDays.length > 0 && largeDays.length > 0) {
      if (weekIndex === 1) {
        // 첫째주: large는 이전달, small은 현재달
        if (largeDays.includes(dayNum)) {
          actualMonth = month - 1;
          if (actualMonth === 0) { actualMonth = 12; actualYear = year - 1; }
        }
      } else {
        // 마지막주: large는 현재달, small은 다음달
        if (smallDays.includes(dayNum)) {
          actualMonth = month + 1;
          if (actualMonth === 13) { actualMonth = 1; actualYear = year + 1; }
        }
      }
      return { actualYear, actualMonth };
    }

    // 케이스 B: small만 있고 시트의 마지막 주 → 다음월 참고용
    //   예: 4월 시트 주6=[3~9], 6월 시트 주6=[5~11]
    //   이런 주는 전부 다음달로 처리
    if (smallDays.length > 0 && largeDays.length === 0
        && weekIndex === totalWeeks && totalWeeks >= 2) {
      // 추가 검증: 이전 주가 large만 있는 순수 현재월이거나, large+small 혼합이면
      //           이 주는 확실히 다음달 참고용
      const prevWeek = (allWeeks && allWeeks[weekIndex - 2]) || [];
      const prevHasLarge = prevWeek.some(d => d >= 25);
      if (prevHasLarge) {
        actualMonth = month + 1;
        if (actualMonth === 13) { actualMonth = 1; actualYear = year + 1; }
        return { actualYear, actualMonth };
      }
    }

    // 케이스 C: 그 외 (순수 중간주, 참고용 아닌 주) → 현재달 그대로
    return { actualYear, actualMonth };
  }

  // ============================================================
  // ✅ [전면 재설계 v2] 시트 쓰기용 셀 위치 탐색
  //
  //   기존 알고리즘의 두 가지 버그 수정:
  //   1) c < row.length 제약 → 토요일(H열)처럼 뒤에서 잘릴 때 못 찾음
  //      → c <= 7 로 변경 (undefined는 parseInt→NaN으로 자동 무시)
  //   2) 단일 패스 상태머신 → 다음 주 구분 행을 만나면 sectionStartRow
  //      가 -1로 리셋되어 이미 찾은 주 정보가 사라짐
  //      → 2단계 구조: (1단계) 대상 날짜가 있는 주 블록 탐색,
  //                    (2단계) 그 블록 안에서 섹션+빈 셀 탐색
  //
  //   추가: targetMonth/targetYear 기반 요일 폴백
  //         (날짜가 직접 찾아지지 않을 때 요일 계산으로 열 유추)
  // ============================================================
  static findWriteCell(rows, targetDay, section = 'activities', targetMonth = null, targetYear = null) {

    // ── 1단계: targetDay 가 들어있는 주 블록 찾기 ──────────────
    let weekStartRow = -1;   // 해당 주 구분 행 인덱스
    let weekEndRow   = -1;   // 다음 주 구분 행 인덱스 (또는 rows.length)
    let targetCol    = null; // 날짜가 있는 열 (1~7)

    for (let r = 0; r < rows.length; r++) {
      const row       = rows[r] || [];
      const firstCell = (row[0] || '').replace(/\s+/g, '').trim();

      if (firstCell === '구분') {
        // ✅ c <= 7 만 사용 — row.length 제약 제거 (undefined → NaN → skip)
        for (let c = 1; c <= 7; c++) {
          const dayNum = parseInt(row[c]);
          if (!isNaN(dayNum) && dayNum > 0 && dayNum === targetDay) {
            targetCol    = c;
            weekStartRow = r;
            break;
          }
        }

        if (weekStartRow >= 0) {
          // 이 주의 끝(다음 구분 행 또는 '입력방법' 또는 rows 끝)을 찾음
          weekEndRow = rows.length;
          for (let r2 = r + 1; r2 < rows.length; r2++) {
            const fc2 = ((rows[r2] || [])[0] || '').replace(/\s+/g, '').trim();
            if (fc2 === '구분' || (fc2.includes('입력') && fc2.includes('방법'))) {
              weekEndRow = r2;
              break;
            }
          }
          break; // 주 블록 찾았으면 1단계 종료
        }
      }
    }

    // ── 1단계 폴백: 요일 기반 열 계산 (날짜가 직접 발견되지 않은 경우) ──
    //   예: 토요일(H열)의 값이 API에 의해 잘렸을 때
    if (weekStartRow < 0 && targetMonth !== null && targetYear !== null && targetDay) {
      const d           = new Date(targetYear, targetMonth - 1, targetDay);
      const expectedCol = CONFIG.DAY_TO_COL_INDEX[d.getDay()]; // 0=일→1, 6=토→7

      for (let r = 0; r < rows.length; r++) {
        const row       = rows[r] || [];
        const firstCell = (row[0] || '').replace(/\s+/g, '').trim();

        if (firstCell === '구분') {
          // 이 주에 있는 임의의 날짜와 열 차이로 targetDay가 이 주에 속하는지 검증
          let inThisWeek = false;
          for (let c = 1; c <= 7; c++) {
            const dayNum = parseInt(row[c]);
            if (!isNaN(dayNum) && dayNum > 0 && dayNum <= 31) {
              const colDiff = expectedCol - c;
              const dayDiff = targetDay - dayNum;
              // 같은 주라면 열 차이 == 날짜 차이 (단, 월 경계 없이 ±6 이내)
              if (colDiff === dayDiff && Math.abs(dayDiff) <= 6) {
                inThisWeek = true;
                break;
              }
            }
          }

          if (inThisWeek) {
            targetCol    = expectedCol;
            weekStartRow = r;
            weekEndRow   = rows.length;
            for (let r2 = r + 1; r2 < rows.length; r2++) {
              const fc2 = ((rows[r2] || [])[0] || '').replace(/\s+/g, '').trim();
              if (fc2 === '구분' || (fc2.includes('입력') && fc2.includes('방법'))) {
                weekEndRow = r2;
                break;
              }
            }
            console.log(`[옥구초] findWriteCell 폴백: ${targetMonth}/${targetDay}(요일기반) → col ${targetCol}`);
            break;
          }
        }
      }
    }

    // 그래도 못 찾으면 null
    if (weekStartRow < 0 || targetCol === null) {
      console.warn(`[옥구초] findWriteCell: ${targetDay}일을 어느 주에서도 찾지 못함`);
      return null;
    }

    console.log(`[옥구초] findWriteCell: ${targetDay}일 → 열${targetCol}(${CONFIG.COL_LETTERS[targetCol]}), 주블록 행 ${weekStartRow+1}~${weekEndRow}`);

    // ── 2단계: 주 블록 안에서 섹션 경계 파악 ───────────────────
    // 섹션 구조:
    //   activities: 구분 다음 행 ~ 출장/주요 참고사항 행 직전
    //   trips:      출장 행 ~ 주요 참고사항/협의/건의 행 직전
    //
    // ✅ 핵심 변경: sectionStartRow+1이 아닌 실제 데이터 시작 행부터 탐색
    //   (교육활동 헤더가 블록 상단이 아닌 중간에 있어도 맨 위 빈 행부터 씀)

    let searchStart = weekStartRow + 2; // 구분 다음다음 행 (구분 행 바로 아래 행은 건너뜀)
    let searchEnd   = weekEndRow;       // 기본: 주 블록 끝

    // 출장/주요 참고사항/협의 경계 탐색
    for (let r = weekStartRow + 1; r < weekEndRow; r++) {
      const fc = ((rows[r] || [])[0] || '').replace(/\s+/g, '').trim();
      const sectionHeader = this._detectSectionHeader(fc);

      if (sectionHeader === 'trips') {
        if (section === 'activities') {
          searchEnd = r;   // 교육활동 탐색 끝
          break;
        } else if (section === 'trips') {
          searchStart = r; // 출장 제목 행도 실제 입력 칸으로 사용됨
        }
      } else if (sectionHeader === 'notes') {
        searchEnd = r;     // 주요 참고사항 행에서 끝
        break;
      } else if (fc.includes('협의') || fc.includes('건의')) {
        searchEnd = r;     // 어느 섹션이든 협의 행에서 끝
        break;
      }
    }

    const colLetter = CONFIG.COL_LETTERS[targetCol];
    console.log(`[옥구초] findWriteCell: 탐색 범위 행 ${searchStart+1}~${searchEnd}, 열 ${colLetter}`);

    // 요일 이름 집합 (헤더 레이블로 쓰이는 값 — 실제 입력 내용이 아님)
    const DAY_LABELS = new Set(['일', '월', '화', '수', '목', '금', '토']);

    // ✅ [v1.7.7 버그 수정] isSectionHeader 체크 제거
    //    기존: A열이 "교육활동..."인 행 전체를 스킵 → 같은 행의 targetCol(파란 테두리 칸)도 건너뜀
    //    수정: 섹션 경계(searchStart/searchEnd)는 이미 위에서 처리됨
    //          메인 루프에서는 targetCol 셀만 확인 — 비어 있으면 바로 입력
    let maxNumber = 0;
    for (let r = searchStart; r < searchEnd; r++) {
      const cellVal = ((rows[r] && rows[r][targetCol]) || '').trim();

      // 완전 빈 셀 → 여기에 입력
      if (!cellVal) {
        return { sheetRow: r + 1, colLetter, col: targetCol, mode: 'new', nextNumber: maxNumber + 1 };
      }

      // 요일 이름만 있는 셀(예: "토") → 헤더 레이블이므로 건너뜀
      if (DAY_LABELS.has(cellVal)) {
        console.log(`[옥구초] findWriteCell: 행 ${r+1} 요일레이블("${cellVal}") 건너뜀`);
        continue;
      }

      const numberMatch = cellVal.match(/^(\d+)\s*[.)]/);
      if (numberMatch) {
        maxNumber = Math.max(maxNumber, parseInt(numberMatch[1], 10));
      }

      // 실제 내용이 있는 셀 → 이미 채워진 행이므로 건너뜀
    }

    // 빈 셀이 없으면 다음 섹션 제목을 덮어쓸 수 있으므로 저장하지 않는다.
    return null;
  }
}

export { ScheduleParser };
