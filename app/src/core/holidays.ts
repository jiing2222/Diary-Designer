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

export function holidayCovered(year: number): boolean {
  return SETS.has(year);
}

export function isHoliday(d: CalendarDate): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  return SETS.get(d.year)?.has(`${pad(d.month)}-${pad(d.day)}`) ?? false;
}
