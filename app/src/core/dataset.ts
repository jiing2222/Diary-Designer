/**
 * 자동 필드가 순서대로 꺼내 쓰는 데이터.
 *
 * 지금은 날짜(`date`)만 다룬다. 위클리·데일리처럼 한 쪽이 날짜를 며칠씩
 * 소비하는 다이어리가 목표다(설계문서 7장). 숫자·목록 종류는 나중에 이
 * 파일의 판별 유니언(`kind`)을 넓혀서 더한다.
 *
 * **날짜는 `Date`를 쓰지 않고 연·월·일 정수로만 다룬다.** `Date`로 날짜
 * 산술을 하면 로컬 타임존·서머타임에 따라 하루가 밀리거나 당겨지는 사고가
 * 난다. 이 파일 안에서만 계산에 필요한 순간(요일 등)에 UTC로 잠깐 빌려 쓰고
 * 바로 되돌린다.
 */

export interface CalendarDate {
  year: number;
  /** 1~12 */
  month: number;
  /** 1~31 */
  day: number;
}

export interface Dataset {
  kind: 'date';
  /** 한 쪽이 소비하는 개수. 위클리 = 7, 데일리 = 1. */
  perPage: number;
  /** "2027-01-01" 꼴. */
  start: string;
  end: string;
  step: 'day' | 'week' | 'month';
}

/** "2027-01-01" → { year: 2027, month: 1, day: 1 }. */
export function parseDate(s: string): CalendarDate {
  const [year, month, day] = s.split('-').map(Number);
  return { year, month, day };
}

/** UTC 자정으로 바꾼 뒤 날짜 산술에 쓴다. 시분초가 없어 서머타임의 영향을 받지 않는다. */
function toUtcMs(d: CalendarDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

function fromUtcMs(ms: number): CalendarDate {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(d: CalendarDate, days: number): CalendarDate {
  return fromUtcMs(toUtcMs(d) + days * MS_PER_DAY);
}

/**
 * 달을 더한다. 결과 달의 마지막 날보다 크면 그 달의 마지막 날로 붙인다.
 *
 * 1월 31일 + 1개월은 "2월 31일"이 없으므로 2월 28일(윤년이면 29일)이 된다.
 */
export function addMonths(d: CalendarDate, months: number): CalendarDate {
  const totalMonth = (d.month - 1) + months;
  const year = d.year + Math.floor(totalMonth / 12);
  const month = ((totalMonth % 12) + 12) % 12; // 0~11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { year, month: month + 1, day: Math.min(d.day, lastDay) };
}

/** a가 b보다 이전이면 음수, 같으면 0, 이후면 양수. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toUtcMs(a) - toUtcMs(b);
}

/** 0(일)~6(토). */
export function dayOfWeek(d: CalendarDate): number {
  return new Date(toUtcMs(d)).getUTCDay();
}

function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

/**
 * 이 데이터셋에 들어 있는 총 개수.
 *
 * start가 end보다 뒤면 0이다 — 잘못 입력했다고 음수를 돌려주면 나머지 계산이
 * 전부 깨진다.
 */
export function datasetLength(dataset: Dataset): number {
  const start = parseDate(dataset.start);
  const end = parseDate(dataset.end);
  if (compareDates(start, end) > 0) return 0;

  if (dataset.step === 'day') return daysBetween(start, end) + 1;
  if (dataset.step === 'week') return Math.floor(daysBetween(start, end) / 7) + 1;

  // month: start와 같은 날짜를 매달 반복하다 end를 넘기기 전까지.
  let count = 0;
  while (compareDates(addMonths(start, count), end) <= 0) count++;
  return count;
}

/** 데이터셋에서 절대 인덱스(0부터)의 날짜. 범위 밖이면 null. */
export function dateAt(dataset: Dataset, index: number): CalendarDate | null {
  if (index < 0 || index >= datasetLength(dataset)) return null;
  const start = parseDate(dataset.start);
  if (dataset.step === 'day') return addDays(start, index);
  if (dataset.step === 'week') return addDays(start, index * 7);
  return addMonths(start, index);
}

/**
 * 이 쪽(0부터)의 이 오프셋에 해당하는 날짜.
 *
 * 마지막 쪽에서 오프셋이 데이터 끝을 넘어가면(예: 53쪽째 위클리의 마지막
 * 한두 칸) null이다 — 그 칸은 비워둔다.
 */
export function dateAtOffset(dataset: Dataset, page: number, offset: number): CalendarDate | null {
  return dateAt(dataset, page * dataset.perPage + offset);
}

/** 이 데이터셋이 몇 쪽인지. `ceil(총 개수 ÷ perPage)`(설계문서 7장). */
export function datasetPages(dataset: Dataset): number {
  if (dataset.perPage <= 0) return 0;
  return Math.ceil(datasetLength(dataset) / dataset.perPage);
}
