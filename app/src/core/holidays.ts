import type { CalendarDate } from './dataset';

/**
 * 한국 공휴일(세부계획 A13 ‘색 규칙’, design/리뉴얼/공휴일목록.md).
 *
 * 해마다 6월경 다음 해 월력요항이 나오면 그 해를 더한다. 목록에 없는 해는 공휴일
 * 규칙이 적용되지 않는다 — 화면이 그 사실을 알린다(`holidayCovered`).
 * 대체공휴일·선거일도 공휴일로 넣었다(쉬는 날이라 다이어리에 색을 칠하는 대상).
 */
const HOLIDAYS: Record<number, string[]> = {
  2026: [
    '01-01',
    '02-16', '02-17', '02-18',
    '03-01', '03-02',
    '05-01', '05-05', '05-24', '05-25',
    '06-03', '06-06',
    '07-17',
    '08-15', '08-17',
    '09-24', '09-25', '09-26',
    '10-03', '10-05', '10-09',
    '12-25',
  ],
  2027: [
    '01-01',
    '02-06', '02-07', '02-08', '02-09',
    '03-01',
    '05-01', '05-03', '05-05', '05-13',
    '06-06',
    '07-17', '07-19',
    '08-15', '08-16',
    '09-14', '09-15', '09-16',
    '10-03', '10-04', '10-09', '10-11',
    '12-25', '12-27',
  ],
};

const SETS = new Map(Object.entries(HOLIDAYS).map(([y, days]) => [Number(y), new Set(days)]));

/** 목록이 있는 해들(오름차순). */
export const HOLIDAY_YEARS: number[] = [...SETS.keys()].sort((a, b) => a - b);

/** 어느 나라 공휴일인가. 저장된 작업에 없으면 한국(미국 출시 전에 만든 작업). */
export type HolidayRegion = 'kr' | 'us';

/** 이 해의 공휴일 목록이 있는가. 미국은 규칙으로 계산하므로 언제나 있다. */
export function holidayCovered(year: number, region: HolidayRegion = 'kr'): boolean {
  return region === 'us' || SETS.has(year);
}

export function isHoliday(d: CalendarDate, region: HolidayRegion = 'kr'): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = `${pad(d.month)}-${pad(d.day)}`;
  return region === 'us' ? usHolidays(d.year).has(key) : (SETS.get(d.year)?.has(key) ?? false);
}

/**
 * 미국 연방 공휴일 11개 — 날짜가 고정이거나 ‘몇째 무슨 요일’이라 해마다 계산한다(목록을 갱신할 필요가 없다).
 * 주말에 겹칠 때 옮겨 쉬는 날(observed)은 넣지 않는다 — 다이어리에는 그 날짜 자체를 칠하는 것이 보통이다.
 */
function usHolidays(year: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dow = (m: number, d: number) => new Date(Date.UTC(year, m - 1, d)).getUTCDay();
  // m월의 n번째 w요일(n = -1이면 마지막).
  const nth = (m: number, w: number, n: number) => {
    if (n > 0) return 1 + ((w - dow(m, 1) + 7) % 7) + (n - 1) * 7;
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return last - ((dow(m, last) - w + 7) % 7);
  };
  const days: [number, number][] = [
    [1, 1], // New Year's Day
    [1, nth(1, 1, 3)], // Martin Luther King Jr. Day — 1월 셋째 월요일
    [2, nth(2, 1, 3)], // Presidents' Day — 2월 셋째 월요일
    [5, nth(5, 1, -1)], // Memorial Day — 5월 마지막 월요일
    [6, 19], // Juneteenth
    [7, 4], // Independence Day
    [9, nth(9, 1, 1)], // Labor Day — 9월 첫째 월요일
    [10, nth(10, 1, 2)], // Columbus Day — 10월 둘째 월요일
    [11, 11], // Veterans Day
    [11, nth(11, 4, 4)], // Thanksgiving — 11월 넷째 목요일
    [12, 25], // Christmas
  ];
  return new Set(days.map(([m, d]) => `${pad(m)}-${pad(d)}`));
}
