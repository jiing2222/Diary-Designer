import { addDays, dateAt, datasetLength, parseDate, type CalendarDate, type Dataset } from './dataset';
import type { DiaryObject } from './objects';

/**
 * 날짜 묶음 — 원본 양식 하나를 기간만큼 펼친 페이지들(리뉴얼, 세부계획 A4.6·A4.8).
 *
 * 옛 앱은 인쇄할 때 날짜를 채웠고, 고친 쪽은 **쪽 번호**로 기억했다
 * (`Template.pageOverrides`). 그래서 기간을 바꾸면 고친 내용이 엉뚱한 날짜로 밀렸다.
 * 여기서는 고친 것을 **그 쪽의 날짜(`Period.key`)**에 붙인다 — 기간을 바꿔도
 * 같은 날짜면 따라간다.
 *
 * 고친 것도 쪽 전체가 아니라 **객체마다, 바꾼 속성만** 기억한다(`FaceOverride`).
 * 10/5의 날짜 글자 색만 바꿨다면, 원본에서 그 글자의 글꼴을 바꿨을 때 10/5에도
 * 반영된다.
 */

/** 한 쪽(기간 하나). `dates[오프셋]`이 자동 필드가 꺼내 쓰는 날짜다. */
export interface Period {
  /** 이 쪽을 가리키는 이름. 날짜형은 첫 날짜 `2026-10-05`, 달력형은 `2026-10`. */
  key: string;
  /** 날짜가 없는 칸은 null — 마지막 쪽의 남는 칸, 달이 바뀌어 비운 칸. */
  dates: (CalendarDate | null)[];
  /** 달력 객체가 그릴 달. 날짜형이면 이 쪽의 첫 날짜가 속한 달. */
  month: { year: number; month: number };
}

/**
 * 달이 바뀔 때 남는 칸을 어떻게 할지(사용자 결정, 세부계획 A4.8).
 * - `continue` — 다음 달 날짜로 바로 이어 채운다(옛 앱과 같다).
 * - `blank` — 그 달 날짜만 채우고 남는 칸은 비운다. 다음 달은 다음 쪽부터.
 */
export type Boundary = 'continue' | 'blank';

export function dateKey(d: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 데이터셋을 쪽들로 나눈다. */
export function periodsOf(dataset: Dataset, boundary: Boundary): Period[] {
  if (dataset.kind === 'calendar') {
    return Array.from({ length: 12 }, (_, i) => ({
      key: monthKey(dataset.year, i + 1),
      dates: [],
      month: { year: dataset.year, month: i + 1 },
    }));
  }

  const perPage = Math.max(1, Math.floor(dataset.perPage));
  const total = datasetLength(dataset);
  const periods: Period[] = [];
  let chunk: CalendarDate[] = [];

  const flush = () => {
    if (chunk.length === 0) return;
    const first = chunk[0];
    const dates: (CalendarDate | null)[] = [...chunk];
    while (dates.length < perPage) dates.push(null);
    periods.push({ key: dateKey(first), dates, month: { year: first.year, month: first.month } });
    chunk = [];
  };

  for (let i = 0; i < total; i++) {
    const d = dateAt(dataset, i);
    if (!d) break;
    const monthChanged = chunk.length > 0 && (d.month !== chunk[0].month || d.year !== chunk[0].year);
    if (chunk.length === perPage || (boundary === 'blank' && monthChanged)) flush();
    chunk.push(d);
  }
  flush();
  return periods;
}

/**
 * 날짜 묶음이 아닌 보통 페이지의 날짜 — 오늘부터 하루씩(세부계획 A4.6 결정:
 * 기간을 정하기 전에는 오늘 날짜로 보인다). 오프셋이 몇까지 쓰일지 모르므로
 * 객체들이 쓰는 가장 큰 오프셋까지 만든다.
 */
export function todayPeriod(today: CalendarDate, objects: DiaryObject[]): Period {
  const dates = Array.from({ length: suggestPerPage(objects) }, (_, i) => addDays(today, i));
  return { key: dateKey(today), dates, month: { year: today.year, month: today.month } };
}

/**
 * 한 쪽에 며칠이 드는지 — 놓인 날짜 필드·달이 쓰는 가장 큰 순번 + 1. 필드가 없으면 1.
 * 위클리 한 쪽에 7칸(0~6)을 찍었으면 7이다. ‘날짜로 펼치기’가 처음 제안하는 값이다.
 */
export function suggestPerPage(objects: DiaryObject[]): number {
  let maxOffset = 0;
  for (const o of objects) {
    if (o.type === 'text' && o.field) maxOffset = Math.max(maxOffset, o.field.offset);
    if (o.type === 'moon') maxOffset = Math.max(maxOffset, o.offset);
  }
  return maxOffset + 1;
}

/**
 * 한 번에 펼칠 수 있는 쪽 수의 끝. 편집 화면이 모든 쪽을 그리므로 너무 많으면 멈춘다 —
 * 데일리 1년(366쪽)은 들어가게 잡았다.
 */
export const MAX_DATED_PAGES = 400;

/** 기간 요약 — ‘31장 · 10/1~10/31’을 보여줄 값. 쪽이 없으면 first·last가 null. */
export function periodSummary(
  dataset: Dataset,
  boundary: Boundary,
): { pages: number; first: CalendarDate | null; last: CalendarDate | null } {
  // 끝 날짜를 잘못 쳐서(9999년 등) 수백만 날을 세지 않게, 쪽이 넘칠 게 뻔하면 바로 돌려준다.
  if (dataset.kind === 'date') {
    const atLeast = Math.ceil(datasetLength(dataset) / Math.max(1, Math.floor(dataset.perPage)));
    if (atLeast > MAX_DATED_PAGES) return { pages: atLeast, first: null, last: null };
  }
  const periods = periodsOf(dataset, boundary);
  const first = periods[0]?.dates.find((d) => d) ?? null;
  const lastDates = periods[periods.length - 1]?.dates ?? [];
  const last = [...lastDates].reverse().find((d) => d) ?? null;
  return { pages: periods.length, first, last };
}

/** 오늘 날짜 문자열(`2026-10-11`)을 CalendarDate로. 화면에서 `new Date()`로 만들어 넘긴다. */
export function todayFrom(isoDate: string): CalendarDate {
  return parseDate(isoDate);
}

/* ────────────────────────── 날짜별 개별 수정 ────────────────────────── */

/** 객체 하나에서 바꾼 속성들. id·type은 바꿀 수 없다. */
export type ObjectPatch = Record<string, unknown>;

/**
 * 한 쪽의 한 면에서 원본과 달라진 것.
 *
 * - `props` — 원본 객체(id)마다 바꾼 속성만. **`text`를 바꾸면 그 글자는 고정 글자가
 *   된다** — 날짜가 더 이상 채워지지 않는다(사용자 결정: ‘10/5 생일’처럼 직접 쓴 것).
 * - `added` — 이 쪽에만 더한 객체(예: 10/5에만 붙인 스티커).
 * - `removed` — 이 쪽에서만 지운 원본 객체의 id.
 */
export interface FaceOverride {
  props: Record<string, ObjectPatch>;
  added: DiaryObject[];
  removed: string[];
}

export function emptyOverride(): FaceOverride {
  return { props: {}, added: [], removed: [] };
}

export function isEmptyOverride(o: FaceOverride): boolean {
  return Object.keys(o.props).length === 0 && o.added.length === 0 && o.removed.length === 0;
}

/** 개별 수정을 찾을 열쇠. 한 쪽에 면이 여럿(앞·뒤)일 수 있어서 면 번호를 붙인다. */
export function overrideKey(periodKey: string, faceIndex: number): string {
  return `${periodKey}/${faceIndex}`;
}

/**
 * 날짜가 채워진 객체들에 개별 수정을 얹는다.
 *
 * 순서가 중요하다 — **먼저 날짜를 채우고 그 위에 수정을 얹는다.** 그래야 색만 바꾼
 * 글자는 날짜가 계속 채워지고, 글자를 바꾼 것은 바꾼 글자가 이긴다.
 */
export function applyOverride(objects: DiaryObject[], override: FaceOverride | undefined): DiaryObject[] {
  if (!override) return objects;
  const removed = new Set(override.removed);
  const out: DiaryObject[] = [];
  for (const o of objects) {
    if (removed.has(o.id)) continue;
    const patch = override.props[o.id];
    if (!patch) {
      out.push(o);
      continue;
    }
    const { id: _id, type: _type, ...rest } = patch;
    const merged = { ...o, ...rest } as DiaryObject;
    if ('text' in rest && merged.type === 'text') delete merged.field;
    out.push(merged);
  }
  return [...out, ...override.added];
}

/**
 * 두 객체 목록의 차이를 개별 수정으로 — 옛 양식의 ‘인쇄하기에서 고친 쪽’
 * (쪽 전체가 담긴 `pageOverrides`)을 옮길 때 쓴다(core/migrate).
 *
 * `base`는 날짜가 채워진 원본, `edited`는 사용자가 고친 결과다. 같은 id끼리
 * 속성을 견줘 달라진 것만 남긴다. `field`는 견주지 않는다 — 고친 쪽에는 이미
 * 날짜가 채워져 있어 `field`가 없다.
 */
export function diffOverride(base: DiaryObject[], edited: DiaryObject[]): FaceOverride {
  const baseById = new Map(base.map((o) => [o.id, o]));
  const editedIds = new Set(edited.map((o) => o.id));
  const out = emptyOverride();

  for (const o of base) if (!editedIds.has(o.id)) out.removed.push(o.id);

  for (const e of edited) {
    const b = baseById.get(e.id);
    if (!b) {
      out.added.push(e);
      continue;
    }
    const patch: ObjectPatch = {};
    const keys = new Set([...Object.keys(b), ...Object.keys(e)]);
    for (const key of keys) {
      if (key === 'id' || key === 'type' || key === 'field') continue;
      const bv = (b as unknown as Record<string, unknown>)[key];
      const ev = (e as unknown as Record<string, unknown>)[key];
      if (JSON.stringify(bv) !== JSON.stringify(ev)) patch[key] = ev;
    }
    if (Object.keys(patch).length > 0) out.props[e.id] = patch;
  }
  return out;
}
