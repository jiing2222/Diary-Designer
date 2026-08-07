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

export interface DateDataset {
  kind: 'date';
  /** 한 쪽이 소비하는 개수. 위클리 = 7, 데일리 = 1. */
  perPage: number;
  /** "2027-01-01" 꼴. */
  start: string;
  end: string;
  step: 'day' | 'week' | 'month';
}

/**
 * 월간 달력 — 한 쪽이 한 달이다(설계문서 7장, "월간 달력은 따로 처리한다").
 *
 * 매달 1일이 시작하는 요일이 달라서 날짜 하나하나를 순서대로 셀 수 없다.
 * 대신 항상 6주(42칸) 그리드로 고정하고, 그 칸이 몇 월 며칠인지는
 * `calendarCellAt`이 매달 새로 계산한다.
 *
 * **시작 요일·이전달 표시 여부는 여기 없다.** 데이터(몇 년치인가)가 아니라
 * "어떻게 보일까"에 가까운 값이라, 달력을 그리는 오브젝트 쪽 속성으로
 * 옮겼다(core/calendar.ts).
 */
export interface CalendarDataset {
  kind: 'calendar';
  year: number;
}

export type Dataset = DateDataset | CalendarDataset;

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
export function datasetLength(dataset: DateDataset): number {
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
export function dateAt(dataset: DateDataset, index: number): CalendarDate | null {
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
export function dateAtOffset(dataset: DateDataset, page: number, offset: number): CalendarDate | null {
  return dateAt(dataset, page * dataset.perPage + offset);
}

/**
 * 이 데이터셋이 몇 쪽인지.
 *
 * 날짜형은 `ceil(총 개수 ÷ perPage)`(설계문서 7장). 월간 달력은 1년
 * 12달이라 언제나 12쪽이다.
 */
export function datasetPages(dataset: Dataset): number {
  if (dataset.kind === 'calendar') return 12;
  if (dataset.perPage <= 0) return 0;
  return Math.ceil(datasetLength(dataset) / dataset.perPage);
}

/** 월간 달력 그리드 한 칸의 크기. 항상 6주 × 7일로 고정한다. */
export const CALENDAR_GRID_SIZE = 42;

/**
 * 달력 그리드의 이 칸(0~41, 왼쪽 위부터 한 줄씩)에 해당하는 날짜.
 *
 * `page`는 몇 월인지(0부터, 0 = 1월). `weekStart`·`showAdjacent`는
 * 데이터가 아니라 오브젝트가 정하는 값이라(core/calendar.ts) 여기서는
 * 인자로 받는다. 그 칸이 이번 달이 아니고 `showAdjacent`가 꺼져 있으면
 * null이다(빈 칸으로 찍힌다). 범위 밖 오프셋(42 이상)도 null이다.
 */
export function calendarCellAt(
  year: number,
  page: number,
  offset: number,
  weekStart: 'sun' | 'mon',
  showAdjacent: boolean,
): CalendarDate | null {
  if (offset < 0 || offset >= CALENDAR_GRID_SIZE) return null;
  const month = page + 1;
  const first = { year, month, day: 1 };
  const firstWeekday = dayOfWeek(first); // 0(일)~6(토)
  // weekStart가 월요일이면 월요일이 칸 0이 되도록 요일을 한 칸씩 당긴다.
  const startCol = weekStart === 'mon' ? (firstWeekday + 6) % 7 : firstWeekday;
  const gridStart = addDays(first, -startCol);
  const date = addDays(gridStart, offset);
  const inMonth = date.year === year && date.month === month;
  if (!inMonth && !showAdjacent) return null;
  return date;
}

/** 이 쪽(달)의 제목에 쓸 날짜 — 언제나 그 달 1일이다. showAdjacent와 무관하다. */
export function calendarTitleAt(year: number, page: number): CalendarDate {
  return { year, month: page + 1, day: 1 };
}
