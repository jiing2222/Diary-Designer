import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  calendarCellAt,
  calendarTitleAt,
  compareDates,
  dateAt,
  dateAtOffset,
  datasetLength,
  datasetPages,
  dayOfWeek,
  daysBetween,
  parseDate,
  weekOfYear,
  type CalendarDataset,
  type Dataset,
} from './dataset';

describe('날짜 파싱·산술', () => {
  it('"YYYY-MM-DD"를 그대로 쪼갠다', () => {
    expect(parseDate('2027-03-15')).toEqual({ year: 2027, month: 3, day: 15 });
  });

  it('날짜를 더하면 자연스럽게 달을 넘어간다', () => {
    expect(addDays(parseDate('2027-01-30'), 3)).toEqual({ year: 2027, month: 2, day: 2 });
  });

  it('연말을 넘기면 해가 바뀐다', () => {
    expect(addDays(parseDate('2027-12-30'), 5)).toEqual({ year: 2028, month: 1, day: 4 });
  });

  it('달을 더하면 같은 날짜로 이동한다', () => {
    expect(addMonths(parseDate('2027-03-15'), 1)).toEqual({ year: 2027, month: 4, day: 15 });
  });

  it('없는 날짜(2월 31일 등)는 그 달의 마지막 날로 붙는다', () => {
    expect(addMonths(parseDate('2027-01-31'), 1)).toEqual({ year: 2027, month: 2, day: 28 });
  });

  it('윤년의 2월 29일까지는 챙긴다', () => {
    // 2028년은 윤년이다.
    expect(addMonths(parseDate('2028-01-31'), 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('12월을 넘기며 여러 달을 더해도 해가 맞게 넘어간다', () => {
    expect(addMonths(parseDate('2027-11-15'), 3)).toEqual({ year: 2028, month: 2, day: 15 });
  });

  it('날짜 비교', () => {
    expect(compareDates(parseDate('2027-01-01'), parseDate('2027-01-02'))).toBeLessThan(0);
    expect(compareDates(parseDate('2027-01-02'), parseDate('2027-01-01'))).toBeGreaterThan(0);
    expect(compareDates(parseDate('2027-01-01'), parseDate('2027-01-01'))).toBe(0);
  });

  it('요일 — 2027년 1월 1일은 금요일이다', () => {
    expect(dayOfWeek(parseDate('2027-01-01'))).toBe(5);
  });

  it('날짜 사이 며칠 — 뒤 날짜가 이전이면 음수다', () => {
    expect(daysBetween(parseDate('2027-01-01'), parseDate('2027-01-08'))).toBe(7);
    expect(daysBetween(parseDate('2027-01-08'), parseDate('2027-01-01'))).toBe(-7);
    expect(daysBetween(parseDate('2027-01-01'), parseDate('2027-01-01'))).toBe(0);
  });

  it('주차 — 1월 1일부터 7일씩 끊어 센다', () => {
    expect(weekOfYear(parseDate('2027-01-01'))).toBe(1);
    expect(weekOfYear(parseDate('2027-01-07'))).toBe(1);
    expect(weekOfYear(parseDate('2027-01-08'))).toBe(2);
    expect(weekOfYear(parseDate('2027-03-05'))).toBe(10);
  });
});

describe('데이터셋 — 하루 단위', () => {
  const weekly: Dataset = { kind: 'date', perPage: 7, start: '2027-01-01', end: '2027-12-31', step: 'day' };

  it('1년치 총 개수는 365(2027년은 평년)다', () => {
    expect(datasetLength(weekly)).toBe(365);
  });

  it('365일을 7개씩 소비하면 53쪽이다(설계문서 예시와 같다)', () => {
    expect(datasetPages(weekly)).toBe(53);
  });

  it('0번 인덱스는 시작일이다', () => {
    expect(dateAt(weekly, 0)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('마지막 인덱스는 종료일이고 그다음은 null이다', () => {
    expect(dateAt(weekly, 364)).toEqual({ year: 2027, month: 12, day: 31 });
    expect(dateAt(weekly, 365)).toBeNull();
  });

  it('음수 인덱스는 null이다', () => {
    expect(dateAt(weekly, -1)).toBeNull();
  });

  it('쪽·오프셋으로 날짜를 찾는다', () => {
    expect(dateAtOffset(weekly, 0, 0)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(dateAtOffset(weekly, 0, 6)).toEqual({ year: 2027, month: 1, day: 7 });
    expect(dateAtOffset(weekly, 1, 0)).toEqual({ year: 2027, month: 1, day: 8 });
  });

  it('마지막 쪽에서 데이터가 모자라면 null이다', () => {
    // 365 = 52*7 + 1 → 53쪽째는 오프셋 0만 있고 1~6은 없다.
    expect(dateAtOffset(weekly, 52, 0)).toEqual({ year: 2027, month: 12, day: 31 });
    expect(dateAtOffset(weekly, 52, 1)).toBeNull();
  });

  it('start가 end보다 뒤면 데이터가 없다', () => {
    const backwards: Dataset = { ...weekly, start: '2027-12-31', end: '2027-01-01' };
    expect(datasetLength(backwards)).toBe(0);
    expect(datasetPages(backwards)).toBe(0);
    expect(dateAt(backwards, 0)).toBeNull();
  });

  it('perPage가 0이면 쪽수도 0이다', () => {
    expect(datasetPages({ ...weekly, perPage: 0 })).toBe(0);
  });
});

describe('데이터셋 — 주 단위', () => {
  const perWeek: Dataset = { kind: 'date', perPage: 1, start: '2027-01-01', end: '2027-01-22', step: 'week' };

  it('7일씩 건너뛴다', () => {
    expect(dateAt(perWeek, 0)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(dateAt(perWeek, 1)).toEqual({ year: 2027, month: 1, day: 8 });
    expect(dateAt(perWeek, 2)).toEqual({ year: 2027, month: 1, day: 15 });
    expect(dateAt(perWeek, 3)).toEqual({ year: 2027, month: 1, day: 22 });
  });

  it('총 개수는 4주다', () => {
    expect(datasetLength(perWeek)).toBe(4);
  });
});

describe('데이터셋 — 달 단위', () => {
  const monthly: Dataset = { kind: 'date', perPage: 1, start: '2027-01-31', end: '2027-12-31', step: 'month' };

  it('매달 같은 날짜로 이동하고, 없는 날은 그 달 마지막 날로 붙는다', () => {
    expect(dateAt(monthly, 0)).toEqual({ year: 2027, month: 1, day: 31 });
    expect(dateAt(monthly, 1)).toEqual({ year: 2027, month: 2, day: 28 });
    expect(dateAt(monthly, 2)).toEqual({ year: 2027, month: 3, day: 31 });
  });

  it('총 개수는 12달이다', () => {
    expect(datasetLength(monthly)).toBe(12);
  });
});

describe('월간 달력', () => {
  const Y = 2027;
  const cellSun = (page: number, offset: number, showAdjacent = true) =>
    calendarCellAt(Y, page, offset, 'sun', showAdjacent);
  const cellMon = (page: number, offset: number, showAdjacent = true) =>
    calendarCellAt(Y, page, offset, 'mon', showAdjacent);

  it('언제나 12쪽이다', () => {
    const dataset: CalendarDataset = { kind: 'calendar', year: Y };
    expect(datasetPages(dataset)).toBe(12);
  });

  it('일요일 시작 — 2027년 3월 1일은 월요일이라 칸 0은 지난달 끝자락이다', () => {
    // 3월(page=2): 2/28(일) 3/1(월) 3/2(화) ...
    expect(cellSun(2, 0)).toEqual({ year: 2027, month: 2, day: 28 });
    expect(cellSun(2, 1)).toEqual({ year: 2027, month: 3, day: 1 });
    expect(cellSun(2, 31)).toEqual({ year: 2027, month: 3, day: 31 });
    expect(cellSun(2, 32)).toEqual({ year: 2027, month: 4, day: 1 });
  });

  it('월요일 시작 — 같은 3월이 마침 월요일부터 시작해 칸 0이 곧 1일이다', () => {
    expect(cellMon(2, 0)).toEqual({ year: 2027, month: 3, day: 1 });
    expect(cellMon(2, 30)).toEqual({ year: 2027, month: 3, day: 31 });
    expect(cellMon(2, 31)).toEqual({ year: 2027, month: 4, day: 1 });
  });

  it('이전·다음 달 칸도 실제 날짜를 낸다(showAdjacent 켬)', () => {
    // 4월(page=3): 4/1은 목요일 → 일요일 시작이면 앞에 3일(3/29~3/31)이 지난달이다.
    expect(cellSun(3, 0)).toEqual({ year: 2027, month: 3, day: 28 });
    expect(cellSun(3, 3)).toEqual({ year: 2027, month: 3, day: 31 });
    expect(cellSun(3, 4)).toEqual({ year: 2027, month: 4, day: 1 });
  });

  it('showAdjacent를 끄면 이번 달이 아닌 칸은 null이다', () => {
    expect(cellSun(2, 0, false)).toBeNull(); // 2/28, 지난달
    expect(cellSun(2, 1, false)).toEqual({ year: 2027, month: 3, day: 1 }); // 이번 달은 그대로
    expect(cellSun(2, 32, false)).toBeNull(); // 4/1, 다음달
  });

  it('연말·연초를 넘어가도 해가 다르면 이번 달이 아니다', () => {
    // 12월(page=11): 12/1은 수요일 → 일요일 시작이면 앞에 11/28~11/30이 지난달이다.
    expect(cellSun(11, 0)).toEqual({ year: 2027, month: 11, day: 28 });
    // 12/31은 그리드 34번째 칸(0부터) → 그 다음은 2028년 1월 1일, 해가 달라 이번 달이 아니다.
    expect(cellSun(11, 34)).toEqual({ year: 2028, month: 1, day: 1 });
    expect(cellSun(11, 34, false)).toBeNull();

    // 1월(page=0): 1/1은 금요일 → 앞의 지난달 자리는 2026년 12월이다.
    expect(cellSun(0, 0)).toEqual({ year: 2026, month: 12, day: 27 });
    expect(cellSun(0, 0, false)).toBeNull();
  });

  it('그리드 밖 오프셋(음수·42 이상)은 null이다', () => {
    expect(cellSun(2, -1)).toBeNull();
    expect(cellSun(2, 42)).toBeNull();
  });

  it('월 제목은 언제나 그 달 1일이다', () => {
    expect(calendarTitleAt(Y, 2)).toEqual({ year: 2027, month: 3, day: 1 });
    expect(calendarTitleAt(Y, 0)).toEqual({ year: 2027, month: 1, day: 1 });
  });
});
