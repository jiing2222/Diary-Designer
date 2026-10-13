import { addDays, dayOfWeek, daysBetween, parseDate, weekOfYear, type CalendarDate } from './dataset';

/**
 * AutoField 형식 코드(리뉴얼 4-2, 세부계획 A4.2·A4.3·A4.7, 기능후보 7).
 *
 * 형식은 **코드 한 줄**이다 — `YYYY.MM.DD (ddd)`처럼 쓰면 그대로 바뀐다. 패널의 예시 칩도
 * 이 코드를 고르는 것일 뿐이고, 맨 아래 ‘직접 입력’ 칸에 코드를 쳐도 같다.
 *
 * 옛 형식 id(`M/D`, `ddd`, `주차` 등)는 대부분 이 코드 규칙과 뜻이 같아 그대로 읽힌다.
 * 뜻이 다른 다섯 개만 `LEGACY`에서 코드로 바꿔 읽는다 — 옛 데이터를 고치지 않는다.
 *
 * 기호 (긴 것부터 맞춘다):
 * | 코드 | 예 | | 코드 | 예 |
 * |---|---|---|---|---|
 * | YYYY | 2026 | | DD | 05 |
 * | YY | 26 | | D | 5 |
 * | MMMM | October | | dddd | 월요일 |
 * | MMM | OCT | | ddd | 월 |
 * | MM | 03 | | eeee | Monday |
 * | M | 3 | | eee | Mon |
 * | ww | 05 (주차) | | w | 5 (주차) |
 *
 * 나머지 글자는 그대로 나온다. 기호와 겹치는 글자는 `{ }`로 감싼다(`{Mon}`, `{Week} w`) — 2026-10-13
 * 사용자 결정. 그 전에 저장한 `[ ]`도 그대로 읽는다.
 */

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_KR_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_EN_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_EN_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 옛 형식 id 중 코드 규칙과 뜻이 다른 것. */
const LEGACY: Record<string, string> = {
  'ddd-en': 'eee',
  'dddd-en': 'eeee',
  주차: 'w주차',
  W: '{W}w',
  Week: '{Week} w',
};

/** 형식(옛 id 또는 코드)을 코드로. */
export function codeOf(format: string): string {
  return LEGACY[format] ?? format;
}

const DATE_TOKENS = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D', 'dddd', 'ddd', 'eeee', 'eee', 'ww', 'w'] as const;
type DateToken = (typeof DATE_TOKENS)[number];

type Piece = { token: string } | { text: string };

/** 감싸면 글자가 되는 괄호 — `{ }`(2026-10-13부터). 그 전에 저장한 `[ ]`도 그대로 읽는다. */
const QUOTES: Record<string, string> = { '{': '}', '[': ']' };

/** 코드를 기호와 글자로 쪼갠다. `{ }`(옛 `[ ]`) 안은 글자. */
function tokenize(code: string, tokens: readonly string[]): Piece[] {
  const out: Piece[] = [];
  let i = 0;
  while (i < code.length) {
    const close = QUOTES[code[i]];
    if (close) {
      const end = code.indexOf(close, i + 1);
      if (end > i) {
        out.push({ text: code.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const token = tokens.find((t) => code.startsWith(t, i));
    if (token) {
      out.push({ token });
      i += token.length;
    } else {
      out.push({ text: code[i] });
      i += 1;
    }
  }
  return out;
}

function dateTokenValue(d: CalendarDate, token: DateToken): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  switch (token) {
    case 'YYYY':
      return String(d.year);
    case 'YY':
      return pad2(d.year % 100);
    case 'MMMM':
      return MONTH_EN_LONG[d.month - 1];
    case 'MMM':
      return MONTH_EN[d.month - 1];
    case 'MM':
      return pad2(d.month);
    case 'M':
      return String(d.month);
    case 'DD':
      return pad2(d.day);
    case 'D':
      return String(d.day);
    case 'dddd':
      return WEEKDAY_KR_LONG[dayOfWeek(d)];
    case 'ddd':
      return WEEKDAY_KR[dayOfWeek(d)];
    case 'eeee':
      return WEEKDAY_EN_LONG[dayOfWeek(d)];
    case 'eee':
      return WEEKDAY_EN[dayOfWeek(d)];
    case 'ww':
      return pad2(weekOfYear(d));
    case 'w':
      return String(weekOfYear(d));
  }
}

/** 코드에 든 날짜 기호들. */
function dateTokensOf(code: string): Set<string> {
  const set = new Set<string>();
  for (const p of tokenize(code, DATE_TOKENS)) if ('token' in p) set.add(p.token);
  return set;
}

/**
 * 날짜를 형식대로. 날짜 기호가 하나도 없는 형식은 `M/D`로 본다 — 날짜 칸에 날짜가 안
 * 나오면 쓸모가 없다(옛 판의 ‘모르는 id면 M/D’와 같은 결과).
 */
export function formatDate(d: CalendarDate, format: string): string {
  const code = codeOf(format);
  const pieces = tokenize(code, DATE_TOKENS);
  if (!pieces.some((p) => 'token' in p)) return formatDate(d, 'M/D');
  return pieces.map((p) => ('token' in p ? dateTokenValue(d, p.token as DateToken) : p.text)).join('');
}

/**
 * 달·해만 보여주는 형식인가 — 일·요일·주 기호가 없다. 이런 칸은 오프셋 하나의 날짜 대신
 * 그 쪽을 대표하는 달을 쓴다(위클리가 두 달에 걸칠 때 더 많이 걸친 달, core/format).
 */
export function isMonthLevel(format: string): boolean {
  const tokens = dateTokensOf(codeOf(format));
  if (tokens.size === 0) return false;
  return [...tokens].every((t) => t.startsWith('Y') || t.startsWith('M'));
}

/* ────────────────────────── 필드 종류 ────────────────────────── */

/**
 * 자동 필드 한 칸의 설정(objects.ts의 `TextObject.field`).
 * - `kind` 없음 — 날짜 하나(Year·Month·Day·Week·Weekday 타일 모두 이것, 형식만 다르다)
 * - `range` — 주간 범위: 연결한 날짜부터 6일 뒤까지(`10/6 – 10/12`)
 * - `dday` — 기준일(`target`)까지 남은 날. 지난 뒤는 `after`(`plus` D+3 / `blank` 비움)
 * - `page` — 페이지 번호. 형식 코드는 `n`·`nn`·`nnn`(자릿수)·`N`(전체). `start`부터 센다.
 */
export interface FieldSpec {
  offset: number;
  format: string;
  kind?: 'range' | 'dday' | 'page';
  target?: string;
  after?: 'plus' | 'blank';
  start?: number;
}

/** 다음에 찍을 칸의 설정 — 순번(offset)은 찍을 때 매긴다. */
export type FieldDraft = Omit<FieldSpec, 'offset'>;

export const DEFAULT_FIELD_DRAFT: FieldDraft = { format: 'M/D' };

/**
 * 설정에 바꿀 것을 얹는다. 값이 `undefined`인 키는 **지운다** — 칩을 고를 때
 * `{ format: 'M/D', kind: undefined }`를 주면 페이지 번호였던 칸이 날짜 칸으로 돌아온다.
 * 다른 종류의 설정(기준일·시작 번호)은 남겨 둔다 — 다시 그 종류로 바꿨을 때 이어 쓴다.
 */
export function patchField<T extends FieldDraft>(base: T, patch: Partial<FieldSpec>): T {
  const out: Record<string, unknown> = { ...base, ...patch };
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out as T;
}

/** 주간 범위 사이의 기호. */
export const RANGE_DASH = ' – ';

/** 날짜 하나로 정해지는 칸의 값(페이지 번호는 제외 — 면 순서를 알아야 해서 core/work가 채운다). */
export function fieldValue(field: FieldSpec, date: CalendarDate | null): string {
  if (!date) return '';
  if (field.kind === 'range') return formatDate(date, field.format) + RANGE_DASH + formatDate(addDays(date, 6), field.format);
  if (field.kind === 'dday') return ddayText(date, field);
  return formatDate(date, field.format);
}

/** D-23 / D-DAY / D+3(또는 빈칸). 기준일이 없으면 빈칸. */
function ddayText(date: CalendarDate, field: FieldSpec): string {
  if (!field.target || !/^\d{4}-\d{2}-\d{2}$/.test(field.target)) return '';
  const left = daysBetween(date, parseDate(field.target));
  if (left > 0) return `D-${left}`;
  if (left === 0) return 'D-DAY';
  return field.after === 'blank' ? '' : `D+${-left}`;
}

const PAGE_TOKENS = ['nnn', 'nn', 'n', 'N'] as const;

/**
 * 페이지 번호. `index`는 번호를 세는 면 중 몇째인지(0부터), `count`는 번호를 세는 면 수.
 * 번호가 없는 코드(기호가 없으면)는 `n`으로 본다.
 */
export function formatPageNo(field: FieldSpec, index: number, count: number): string {
  const start = field.start ?? 1;
  const n = start + index;
  const total = start + count - 1;
  const pieces = tokenize(field.format, PAGE_TOKENS);
  if (!pieces.some((p) => 'token' in p)) return String(n);
  return pieces
    .map((p) => {
      if (!('token' in p)) return p.text;
      if (p.token === 'N') return String(total);
      return String(n).padStart(p.token.length, '0');
    })
    .join('');
}

/* ────────────────────────── 패널의 타일과 칩 ────────────────────────── */

/**
 * 패널의 타일. 날짜를 보여주는 칸은 **Date 하나**다(2026-10-13 사용자 결정) — 형식을 코드로 직접 쓰므로
 * 해·달·날·주·요일로 나눌 까닭이 없다. 칸이 실제로 무엇을 보여주는지(색 규칙이 칠할 칸인지 등)는
 * `fieldKindOf`가 따로 가린다.
 */
export type FieldTile = 'date' | 'dday' | 'page';

/** 칸이 실제로 보여주는 것 — 해·달·날·주·요일·D-day·페이지 번호. 색 규칙(core/colorRules)이 쓴다. */
export type FieldKind = 'year' | 'month' | 'day' | 'week' | 'weekday' | 'dday' | 'page';

/** 칩 하나 = 칸에 줄 설정 일부. 패널은 칩마다 오늘 날짜로 미리보기를 그린다. */
export type FieldChip = Pick<FieldSpec, 'format' | 'kind'>;

export const FIELD_CHIPS: Record<FieldTile, FieldChip[]> = {
  // 자주 쓰는 것만 — 나머지는 아래 ‘직접 입력’에 코드로(패널에 코드 설명표가 있다).
  date: [
    { format: 'D' },
    { format: 'DD' },
    { format: 'M/D' },
    { format: 'M월 D일' },
    { format: 'YYYY.MM.DD' },
    { format: 'ddd' },
    { format: 'eee' },
    { format: 'M월' },
    { format: 'MMM' },
    { format: 'YYYY' },
    { format: 'w주차' },
    { format: 'M/D', kind: 'range' },
  ],
  dday: [{ format: '', kind: 'dday' }],
  page: [
    { format: 'n', kind: 'page' },
    { format: 'nn', kind: 'page' },
    { format: 'nnn', kind: 'page' },
    { format: 'p.n', kind: 'page' },
    { format: 'n / N', kind: 'page' },
  ],
};

/** 칩을 고를 때 넘길 값 — 종류가 없는 칩도 `kind: undefined`를 줘서 이전 종류를 지운다(`patchField`). */
export function chipPatch(chip: FieldChip): Partial<FieldSpec> {
  return { format: chip.format, kind: chip.kind };
}

/** 이 칸이 어느 타일에 속하나 — 칸을 고르면 패널이 그 타일을 연다. */
export function tileOf(field: Pick<FieldSpec, 'format' | 'kind'>): FieldTile {
  if (field.kind === 'page') return 'page';
  if (field.kind === 'dday') return 'dday';
  return 'date';
}

/** 이 칸이 실제로 무엇을 보여주나 — 날(D)이 있으면 날, 그다음 주차·요일·달·해 순. */
export function fieldKindOf(field: Pick<FieldSpec, 'format' | 'kind'>): FieldKind {
  if (field.kind === 'page') return 'page';
  if (field.kind === 'dday') return 'dday';
  if (field.kind === 'range') return 'week';
  const tokens = dateTokensOf(codeOf(field.format));
  if (tokens.has('D') || tokens.has('DD')) return 'day';
  if (tokens.has('w') || tokens.has('ww')) return 'week';
  if (['ddd', 'dddd', 'eee', 'eeee'].some((t) => tokens.has(t))) return 'weekday';
  if (['M', 'MM', 'MMM', 'MMMM'].some((t) => tokens.has(t))) return 'month';
  if (tokens.has('YYYY') || tokens.has('YY')) return 'year';
  return 'day';
}

/** 이 칸이 날짜 기간을 쓰나 — 페이지 번호만 날짜와 상관없다. */
export function usesDate(field: Pick<FieldSpec, 'kind'>): boolean {
  return field.kind !== 'page';
}
