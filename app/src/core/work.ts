import { cloneObject, newId, type DiaryObject } from './objects';
import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import type { CalendarDate, Dataset } from './dataset';
import { resolveFieldsWithDates } from './format';
import { defaultWorkPalette, type WorkPalette } from './colors';
import {
  applyOverride,
  overrideKey,
  periodsOf,
  todayPeriod,
  type Boundary,
  type FaceOverride,
} from './dated';

/**
 * 작업 — 여러 페이지로 된 결과물 하나(리뉴얼, 기본계획 5장). Library의 Projects에
 * 카드 하나로 보이는 단위다.
 *
 * 옛 양식(core/template)은 "속지 한 장 + 날짜를 어떻게 채울지"였다. 작업은
 * **면(Face)이 차례로 놓인 목록**이다. 표지·월간·메모처럼 서로 다른 면을 섞고,
 * 날짜 묶음(DatedItem)은 원본 면을 기간만큼 펼친다.
 *
 * 면은 순서대로 종이의 앞·뒤가 된다(양면이면 0번 면 = 1장 앞, 1번 면 = 1장 뒤…,
 * `sheetSideOf`). 편집 화면은 다이어리를 펼친 모습(앞 장 뒷면 | 다음 장 앞면)으로
 * 보여준다(`spreadsOf`).
 */

/** 면 하나 — 종이 한쪽의 바탕과 그 위의 객체들. */
export interface Face {
  id: string;
  background: DotGrid;
  objects: DiaryObject[];
}

/** 보통 페이지 — 면 하나. */
export interface PageItem {
  kind: 'page';
  id: string;
  face: Face;
}

/** 날짜 묶음 — 원본 면들을 기간의 쪽마다 펼친다(core/dated). */
export interface DatedItem {
  kind: 'dated';
  id: string;
  /** 한 쪽마다 찍히는 원본 면들. 단면 양식이면 1개, 앞뒤 양식이면 2개. */
  faces: Face[];
  dataset: Dataset;
  boundary: Boundary;
  /** 날짜별 개별 수정. 키는 `overrideKey(쪽 이름, 면 번호)`. */
  overrides: Record<string, FaceOverride>;
}

export type WorkItem = PageItem | DatedItem;

export interface Work {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** 이 작업이 쓰는 내 다이어리(core/diary). 크기는 언제나 다이어리에서 읽는다. */
  diaryId: string;
  /** 양면이면 면이 앞·뒤로 짝지어 인쇄된다. 단면이면 면마다 한 장. */
  duplex: boolean;
  palette: WorkPalette;
  items: WorkItem[];
  /** Library 폴더. 없으면 폴더 밖. */
  folderId?: string;
  /** 휴지통에 넣은 시각. 30일 뒤 완전히 지운다(세부계획 B). */
  trashedAt?: string;
}

/* ────────────────────────── 만들기 ────────────────────────── */

export function newFace(background: DotGrid = DEFAULT_DOT_GRID): Face {
  return { id: newId('fc'), background: { ...background }, objects: [] };
}

export function newPage(background?: DotGrid): PageItem {
  return { kind: 'page', id: newId('pg'), face: newFace(background) };
}

export function newWork(input: { name: string; diaryId: string; now: string; duplex?: boolean }): Work {
  return {
    id: newId('w'),
    name: input.name,
    createdAt: input.now,
    updatedAt: input.now,
    diaryId: input.diaryId,
    duplex: input.duplex ?? true,
    palette: defaultWorkPalette(),
    items: [newPage()],
  };
}

/** 면 복사 — 객체들도 새 id를 받는다(같은 id가 두 면에 있으면 고르기가 엉킨다). */
export function cloneFace(face: Face): Face {
  return {
    id: newId('fc'),
    background: { ...face.background },
    objects: face.objects.map((o) => cloneObject(o, 0, 0)),
  };
}

export function cloneItem(item: WorkItem): WorkItem {
  if (item.kind === 'page') return { kind: 'page', id: newId('pg'), face: cloneFace(item.face) };
  // 날짜 묶음의 개별 수정은 원본 객체 id에 붙어 있다. 원본 면을 복사하며 id가
  // 바뀌므로 수정의 id도 같이 바꿔 준다.
  const idMap = new Map<string, string>();
  const faces = item.faces.map((f) => {
    const copy = cloneFace(f);
    f.objects.forEach((o, i) => idMap.set(o.id, copy.objects[i].id));
    return copy;
  });
  const overrides: Record<string, FaceOverride> = {};
  for (const [key, ov] of Object.entries(item.overrides)) {
    overrides[key] = {
      props: Object.fromEntries(Object.entries(ov.props).map(([id, p]) => [idMap.get(id) ?? id, p])),
      added: ov.added.map((o) => cloneObject(o, 0, 0)),
      removed: ov.removed.map((id) => idMap.get(id) ?? id),
    };
  }
  return { ...item, id: newId('dt'), faces, overrides };
}

/* ────────────────────────── 페이지 다루기 ────────────────────────── */

/** `index` 뒤에 넣는다. `index`가 -1이면 맨 앞. */
export function insertItems(items: WorkItem[], index: number, added: WorkItem[]): WorkItem[] {
  return [...items.slice(0, index + 1), ...added, ...items.slice(index + 1)];
}

/** 복제 — 원본 바로 뒤에 `count`개(세부계획 A12 ‘여러 장 복제’). */
export function duplicateItem(items: WorkItem[], index: number, count = 1): WorkItem[] {
  const source = items[index];
  if (!source || count < 1) return items;
  const copies = Array.from({ length: Math.floor(count) }, () => cloneItem(source));
  return insertItems(items, index, copies);
}

export function removeItem(items: WorkItem[], index: number): WorkItem[] {
  return items.filter((_, i) => i !== index);
}

/** `from`의 항목을 `to` 자리로 옮긴다. */
export function moveItem(items: WorkItem[], from: number, to: number): WorkItem[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/* ────────────────────────── 펼치기 ────────────────────────── */

/**
 * 실제로 보이고 인쇄되는 면 하나 — 날짜가 채워지고 개별 수정이 얹힌 결과.
 *
 * 화면과 PDF가 **둘 다 이것만 그린다.** 각자 날짜를 채우면 언젠가 어긋난다.
 */
export interface ResolvedFace {
  /** 이 작업 안에서 이 면을 가리키는 열쇠. 날짜 묶음이면 쪽 이름이 들어 있다. */
  key: string;
  itemId: string;
  /** 원본 면(Face)의 id. 이 면을 고치면 어디를 고쳐야 하는지 알려준다. */
  faceId: string;
  /** 날짜 묶음일 때만: 쪽 이름과 그 쪽 안의 면 번호 — 개별 수정을 붙일 자리. */
  period?: { key: string; faceIndex: number };
  background: DotGrid;
  objects: DiaryObject[];
  /**
   * 자동 필드인 객체의 id. 날짜를 채우면 `field`가 빠지므로 따로 알려준다 —
   * 편집 화면은 이 객체를 고르면 일반 글자와 다른 색 테두리를 그린다(세부계획 A4.6).
   * 날짜별 수정으로 글자를 직접 바꾼 것은 고정 글자라 들어가지 않는다.
   */
  fieldIds: string[];
  /** 달력 객체가 그릴 달. */
  month: { year: number; month: number };
}

function fieldIdsOf(objects: DiaryObject[], override?: FaceOverride): string[] {
  return objects
    .filter((o) => o.type === 'text' && o.field && !(override && 'text' in (override.props[o.id] ?? {})))
    .filter((o) => !override?.removed.includes(o.id))
    .map((o) => o.id);
}

/**
 * 작업의 모든 면을 차례로.
 *
 * `today`는 날짜 묶음이 아닌 페이지의 자동 필드가 보여줄 날짜다(기간을 정하기 전엔
 * 오늘 날짜로 보인다). 함수를 순수하게 두려고 바깥에서 받는다.
 */
export function expandWork(work: Pick<Work, 'items'>, today: CalendarDate): ResolvedFace[] {
  const out: ResolvedFace[] = [];
  for (const item of work.items) {
    if (item.kind === 'page') {
      const period = todayPeriod(today, item.face.objects);
      out.push({
        key: item.id,
        itemId: item.id,
        faceId: item.face.id,
        background: item.face.background,
        objects: resolveFieldsWithDates(item.face.objects, period.dates),
        fieldIds: fieldIdsOf(item.face.objects),
        month: period.month,
      });
      continue;
    }
    for (const period of periodsOf(item.dataset, item.boundary)) {
      item.faces.forEach((face, faceIndex) => {
        const filled = resolveFieldsWithDates(face.objects, period.dates);
        const override = item.overrides[overrideKey(period.key, faceIndex)];
        out.push({
          key: `${item.id}:${period.key}:${faceIndex}`,
          itemId: item.id,
          faceId: face.id,
          period: { key: period.key, faceIndex },
          background: face.background,
          objects: applyOverride(filled, override),
          fieldIds: fieldIdsOf(face.objects, override),
          month: period.month,
        });
      });
    }
  }
  return out;
}

/** 면 개수 — 날짜 묶음은 펼친 개수. 객체를 채우지 않고 센다. */
export function faceCount(work: Pick<Work, 'items'>): number {
  let n = 0;
  for (const item of work.items) {
    n += item.kind === 'page' ? 1 : periodsOf(item.dataset, item.boundary).length * item.faces.length;
  }
  return n;
}

/* ────────────────────────── 종이와 펼침면 ────────────────────────── */

/** 면 번호(0부터)가 몇 번째 종이의 어느 쪽인지. 단면이면 면마다 한 장의 앞면. */
export function sheetSideOf(faceIndex: number, duplex: boolean): { sheet: number; side: 'front' | 'back' } {
  if (!duplex) return { sheet: faceIndex, side: 'front' };
  return { sheet: Math.floor(faceIndex / 2), side: faceIndex % 2 === 0 ? 'front' : 'back' };
}

/**
 * 펼침면 — 다이어리를 펼친 모습(세부계획 A11 결정).
 *
 * 펼쳤을 때 보이는 두 면은 한 장의 앞뒤가 아니라 **앞 장의 뒷면과 다음 장의 앞면**이다.
 * 그래서 첫 장의 앞면(0번)은 오른쪽에 혼자 놓이고, 그 뒤로 (1|2), (3|4)…로 짝짓는다.
 * 비는 자리는 null.
 */
export function spreadsOf(count: number): [number | null, number | null][] {
  if (count <= 0) return [];
  const out: [number | null, number | null][] = [[null, 0]];
  for (let left = 1; left < count; left += 2) out.push([left, left + 1 < count ? left + 1 : null]);
  return out;
}
