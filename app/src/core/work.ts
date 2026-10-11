import { cloneObject, newId, type DiaryObject } from './objects';
import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import type { CalendarDate, Dataset, DateDataset } from './dataset';
import { resolveFieldsWithDates } from './format';
import { formatPageNo } from './fieldFormat';
import { defaultWorkPalette, type WorkPalette } from './colors';
import {
  applyOverride,
  diffOverride,
  isEmptyOverride,
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

/**
 * 보통 페이지를 날짜 묶음으로 — ‘날짜로 펼치기’(세부계획 A4.6). 그 페이지가 원본이 되고
 * 기간의 쪽마다 펼쳐진다. 원본 면은 그대로 옮긴다(id도) — 지금 고른 것이 풀리지 않게.
 */
export function spreadByDates(page: PageItem, dataset: DateDataset, boundary: Boundary): DatedItem {
  return { kind: 'dated', id: newId('dt'), faces: [page.face], dataset, boundary, overrides: {} };
}

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
  /** 날짜 묶음일 때만: 쪽 이름·그 쪽 안의 면 번호·그 쪽의 날짜들 — 개별 수정을 붙일 자리. */
  period?: { key: string; faceIndex: number; dates: (CalendarDate | null)[] };
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
  return [...objects, ...(override?.added ?? [])]
    .filter((o) => o.type === 'text' && o.field && !(override && 'text' in (override.props[o.id] ?? {})))
    .filter((o) => !override?.removed.includes(o.id))
    .map((o) => o.id);
}

/**
 * 날짜 페이지 하나의 고칠 객체 — 원본에 날짜를 채우고 그 날짜의 수정을 얹은 것.
 * 그 날짜에만 더한 객체(`added`)는 날짜를 채우지 않은 채다 — 거기 자동 필드가 있으면
 * `field`가 살아 있어야 고쳐도 자동 필드로 남는다. 보일 때는 `expandWork`가 채운다.
 */
function datedEditable(source: Face, dates: (CalendarDate | null)[], override: FaceOverride | undefined): DiaryObject[] {
  return applyOverride(resolveFieldsWithDates(source.objects, dates), override);
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
        const override = item.overrides[overrideKey(period.key, faceIndex)];
        out.push({
          key: `${item.id}:${period.key}:${faceIndex}`,
          itemId: item.id,
          faceId: face.id,
          period: { key: period.key, faceIndex, dates: period.dates },
          background: face.background,
          // 그 날짜에만 더한 자동 필드도 그 날짜로 채운다(원본 쪽은 이미 채워져 field가 없다).
          objects: resolveFieldsWithDates(datedEditable(face, period.dates, override), period.dates),
          fieldIds: fieldIdsOf(face.objects, override),
          month: period.month,
        });
      });
    }
  }
  fillPageNumbers(out);
  return out;
}

/**
 * 페이지 번호 칸을 채운다(세부계획 A4.7 결정 2026-10-11). **번호 칸이 있는 면만 센다** —
 * 표지에서 번호 칸을 지우면 다음 면이 첫 번호가 된다. 따로 ‘세지 않기’ 설정이 없다.
 */
function fillPageNumbers(faces: ResolvedFace[]): void {
  const numbered = faces.filter((f) => f.objects.some(isPageField));
  numbered.forEach((f, i) => {
    f.objects = f.objects.map((o) => {
      if (!isPageField(o)) return o;
      const { field, ...rest } = o;
      return { ...rest, text: formatPageNo(field!, i, numbered.length) } as DiaryObject;
    });
  });
}

function isPageField(o: DiaryObject): o is DiaryObject & { type: 'text'; field: { kind: 'page' } } {
  return o.type === 'text' && o.field?.kind === 'page';
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

/* ────────────────────────── 고치기 ────────────────────────── */

/**
 * 편집 화면이 지금 고치는 자리.
 * - `face` — 펼친 면 하나(보통 페이지, 또는 날짜 묶음의 한 날짜).
 * - `source` — 날짜 묶음의 원본 면(‘원본 편집’ 모드, 세부계획 A4.6 2-1).
 */
export type FaceTarget =
  | { kind: 'face'; face: ResolvedFace }
  | { kind: 'source'; itemId: string; faceIndex: number };

function findItem(work: Pick<Work, 'items'>, itemId: string): WorkItem | undefined {
  return work.items.find((i) => i.id === itemId);
}

function targetItemId(t: FaceTarget): string {
  return t.kind === 'face' ? t.face.itemId : t.itemId;
}

/**
 * 고칠 객체 목록 — 편집 화면의 그리기·고르기·옮기기가 전부 이걸 고친다.
 *
 * - 보통 페이지: 면의 객체 **원본**(자동 필드가 `field`를 지닌 채). 날짜를 채운 것을
 *   고치면 `field`가 빠진 채 저장되어 자동 필드가 평범한 글자로 굳는다.
 * - 원본 편집: 날짜 묶음 원본 면의 객체.
 * - 날짜 페이지: 날짜를 채우고 그 날짜의 수정을 얹은 것 — 보이는 그대로다(그 날짜에만
 *   더한 자동 필드만 `field`를 지닌 채). 고친 결과는 원본과의 **차이**로 저장된다(`writeObjects`).
 */
export function editableObjects(work: Pick<Work, 'items'>, target: FaceTarget): DiaryObject[] {
  const item = findItem(work, targetItemId(target));
  if (!item) return [];
  if (item.kind === 'page') return item.face.objects;
  if (target.kind === 'source') return item.faces[target.faceIndex]?.objects ?? [];
  const period = target.face.period;
  const source = period && item.faces[period.faceIndex];
  if (!period || !source) return target.face.objects;
  return datedEditable(source, period.dates, item.overrides[overrideKey(period.key, period.faceIndex)]);
}

/** 고칠 면의 바탕. 날짜 페이지는 바탕을 따로 갖지 않으므로 원본 면의 바탕이다. */
export function editableBackground(work: Pick<Work, 'items'>, target: FaceTarget): DotGrid | null {
  const item = findItem(work, targetItemId(target));
  if (!item) return null;
  if (item.kind === 'page') return item.face.background;
  const faceIndex = target.kind === 'source' ? target.faceIndex : (target.face.period?.faceIndex ?? 0);
  return item.faces[faceIndex]?.background ?? null;
}

/**
 * 고친 객체 목록을 작업에 되돌려 넣는다. 새 `items`를 돌려준다.
 *
 * - 보통 페이지·원본 편집: 면의 객체를 갈아 끼운다. 원본에서 객체를 지우면 그 객체에
 *   붙어 있던 날짜별 수정도 함께 지운다 — 가리킬 것이 없는 수정이 남지 않게.
 * - 날짜 페이지: 날짜만 채운 원본과 견줘 **달라진 것만** 그 날짜의 수정으로 남긴다.
 *   달라진 게 없으면 수정을 지운다(원본으로 되돌아간다).
 */
export function writeObjects(work: Pick<Work, 'items'>, target: FaceTarget, next: DiaryObject[]): WorkItem[] {
  const itemId = targetItemId(target);
  return work.items.map((item) => {
    if (item.id !== itemId) return item;
    if (item.kind === 'page') return { ...item, face: { ...item.face, objects: next } };

    if (target.kind === 'source') {
      const faces = item.faces.map((f, i) => (i === target.faceIndex ? { ...f, objects: next } : f));
      const alive = new Set(next.map((o) => o.id));
      return { ...item, faces, overrides: pruneOverrides(item.overrides, alive) };
    }

    const period = target.face.period;
    const source = period && item.faces[period.faceIndex];
    if (!period || !source) return item;
    const filled = resolveFieldsWithDates(source.objects, period.dates);
    const diff = diffOverride(filled, next);
    const key = overrideKey(period.key, period.faceIndex);
    const { [key]: _old, ...rest } = item.overrides;
    return { ...item, overrides: isEmptyOverride(diff) ? rest : { ...rest, [key]: diff } };
  });
}

/**
 * 날짜 페이지에서 원본과 달라진 객체의 id — 바꾼 속성이 있는 원본 객체만(그 날짜에만
 * 더한 것은 원본이 없어 되돌릴 곳이 없다). 날짜 페이지가 아니면 빈 목록.
 */
export function changedIds(work: Pick<Work, 'items'>, target: FaceTarget): string[] {
  if (target.kind !== 'face' || !target.face.period) return [];
  const item = findItem(work, target.face.itemId);
  if (item?.kind !== 'dated') return [];
  const ov = item.overrides[overrideKey(target.face.period.key, target.face.period.faceIndex)];
  return ov ? Object.keys(ov.props) : [];
}

/** 날짜 페이지에서 고른 객체를 원본으로 되돌린다 — 그 날짜에서 바꾼 속성을 지운다(세부계획 A4.6 2-1). */
export function revertToSource(work: Pick<Work, 'items'>, target: FaceTarget, ids: string[]): WorkItem[] {
  if (target.kind !== 'face' || !target.face.period) return work.items;
  const { key: periodKey, faceIndex } = target.face.period;
  const key = overrideKey(periodKey, faceIndex);
  return work.items.map((item) => {
    if (item.id !== target.face.itemId || item.kind !== 'dated' || !item.overrides[key]) return item;
    const ov = item.overrides[key];
    const next: FaceOverride = { ...ov, props: Object.fromEntries(Object.entries(ov.props).filter(([id]) => !ids.includes(id))) };
    const { [key]: _old, ...rest } = item.overrides;
    return { ...item, overrides: isEmptyOverride(next) ? rest : { ...rest, [key]: next } };
  });
}

/** 원본에서 사라진 객체를 가리키는 수정을 걷어낸다. */
function pruneOverrides(overrides: Record<string, FaceOverride>, alive: Set<string>): Record<string, FaceOverride> {
  const out: Record<string, FaceOverride> = {};
  for (const [key, ov] of Object.entries(overrides)) {
    const pruned: FaceOverride = {
      props: Object.fromEntries(Object.entries(ov.props).filter(([id]) => alive.has(id))),
      added: ov.added,
      removed: ov.removed.filter((id) => alive.has(id)),
    };
    if (!isEmptyOverride(pruned)) out[key] = pruned;
  }
  return out;
}

/** 고칠 면의 바탕을 바꾼다. 날짜 페이지에서 바꾸면 원본 면의 바탕이 바뀐다(모든 날짜에). */
export function writeBackground(work: Pick<Work, 'items'>, target: FaceTarget, patch: Partial<DotGrid>): WorkItem[] {
  const itemId = targetItemId(target);
  return work.items.map((item) => {
    if (item.id !== itemId) return item;
    if (item.kind === 'page') return { ...item, face: { ...item.face, background: { ...item.face.background, ...patch } } };
    const faceIndex = target.kind === 'source' ? target.faceIndex : (target.face.period?.faceIndex ?? 0);
    return {
      ...item,
      faces: item.faces.map((f, i) => (i === faceIndex ? { ...f, background: { ...f.background, ...patch } } : f)),
    };
  });
}

/**
 * 원본 편집 화면에 보여줄 객체 — 날짜는 기간의 첫 쪽으로 채운다(세부계획 A4.6:
 * 기간을 정하면 첫 날짜로 보인다). 고치는 것은 `editableObjects`(필드가 살아 있는 원본)다.
 */
export function sourcePreview(item: DatedItem, faceIndex: number): ResolvedFace | null {
  const face = item.faces[faceIndex];
  if (!face) return null;
  const first = periodsOf(item.dataset, item.boundary)[0];
  const dates = first?.dates ?? [];
  const preview: ResolvedFace = {
    key: `${item.id}:source:${faceIndex}`,
    itemId: item.id,
    faceId: face.id,
    background: face.background,
    objects: resolveFieldsWithDates(face.objects, dates),
    fieldIds: fieldIdsOf(face.objects),
    month: first?.month ?? { year: 1970, month: 1 },
  };
  // 원본에는 순서가 없다 — 번호 칸은 시작 번호로 보인다.
  fillPageNumbers([preview]);
  return preview;
}

/** 작업 안의 모든 id(항목·면·객체·그룹). 불러온 뒤 id 카운터를 이것들보다 위로 올린다. */
export function allIdsOf(work: Work): string[] {
  const ids: string[] = [work.id];
  const objs = (list: DiaryObject[]) => {
    for (const o of list) {
      ids.push(o.id);
      if (o.groupId) ids.push(o.groupId);
    }
  };
  for (const item of work.items) {
    ids.push(item.id);
    if (item.kind === 'page') {
      ids.push(item.face.id);
      objs(item.face.objects);
    } else {
      for (const f of item.faces) {
        ids.push(f.id);
        objs(f.objects);
      }
      for (const ov of Object.values(item.overrides)) objs(ov.added);
    }
  }
  return ids;
}

/**
 * 이 색 이름표(`@A` 등)를 쓰는 객체가 몇 개고 몇 면에 걸쳐 있는지 — Colors 탭이
 * ‘A · 요소 48개, 31페이지’처럼 바꾸기 전에 영향 범위를 보여준다(세부계획 A13).
 */
export function colorRefUsage(work: Pick<Work, 'items'>, ref: string, today: CalendarDate): { objects: number; faces: number } {
  let objects = 0;
  let faces = 0;
  for (const face of expandWork(work, today)) {
    const n = face.objects.filter((o) => (o as { color?: string }).color === ref || (o as { fillColor?: string }).fillColor === ref).length;
    objects += n;
    if (n > 0) faces += 1;
  }
  return { objects, faces };
}

/** 면 이름표 — `p.3`, 날짜 페이지면 `p.3 · 10/5`, 달력형이면 `p.3 · 2027.03`. */
export function faceLabel(face: Pick<ResolvedFace, 'period'>, index: number): string {
  const p = face.period?.key;
  if (!p) return `p.${index + 1}`;
  const [y, m, d] = p.split('-').map(Number);
  return d ? `p.${index + 1} · ${m}/${d}` : `p.${index + 1} · ${y}.${String(m).padStart(2, '0')}`;
}
