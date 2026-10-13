import { cloneItem, faceCount, insertItems, newPage, type Work, type WorkItem } from './work';
import { newId } from './objects';
import { colorOfKey, keyOfRef, mapColors, resolveObjectColors } from './colors';
import { resolveRuleColors } from './colorRules';
import { MAX_DATED_PAGES, periodSummary } from './dated';
import { parseDate, type Dataset } from './dataset';
import { DEFAULT_DOT_GRID } from './grid';

/** 페이지 관리는 보통 페이지의 앞뒤 짝·날짜 묶음을 쪼개지 않고 다룬다. */
export interface PageUnit {
  id: string;
  itemIds: string[];
  start: number;
  count: number;
  dated: boolean;
}

export function pageUnits(work: Pick<Work, 'items' | 'duplex'>): PageUnit[] {
  const out: PageUnit[] = [];
  let start = 0;
  for (let i = 0; i < work.items.length; i++) {
    const item = work.items[i];
    const ids = [item.id];
    let count = faceCount({ items: [item] });
    if (work.duplex && item.kind === 'page' && start % 2 === 0 && work.items[i + 1]?.kind === 'page') {
      ids.push(work.items[++i].id);
      count++;
    }
    out.push({ id: item.id, itemIds: ids, start, count, dated: item.kind === 'dated' });
    start += count;
  }
  return out;
}

/** 양면 작업에서 고른 면의 실제 인쇄 짝도 포함한다. 날짜 묶음은 쪼개지 않는다. */
export function pairedItemIds(work: Pick<Work, 'items' | 'duplex'>, ids: string[]): string[] {
  const chosen = new Set(ids);
  if (work.duplex) {
    const faces = work.items.flatMap((item) => Array<string>(faceCount({ items: [item] })).fill(item.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < faces.length; i += 2) {
        if (!chosen.has(faces[i]) && !chosen.has(faces[i + 1])) continue;
        for (const id of faces.slice(i, i + 2)) if (!chosen.has(id)) { chosen.add(id); changed = true; }
      }
    }
  }
  return work.items.filter((item) => chosen.has(item.id)).map((item) => item.id);
}

/** 면·객체·그룹·날짜별 속성까지 원본과 참조를 공유하지 않는 사본. */
function independentCopy(item: WorkItem): WorkItem {
  const copy = structuredClone(cloneItem(item));
  const groups = new Map<string, string>();
  const group = (id: string) => {
    if (!groups.has(id)) groups.set(id, newId('g'));
    return groups.get(id)!;
  };
  const faces = copy.kind === 'page' ? [copy.face] : copy.faces;
  for (const face of faces) for (const o of face.objects) if (o.groupId) o.groupId = group(o.groupId);
  if (copy.kind === 'dated') for (const ov of Object.values(copy.overrides)) {
    for (const o of ov.added) if (o.groupId) o.groupId = group(o.groupId);
    for (const p of Object.values(ov.props)) if (typeof p.groupId === 'string') p.groupId = group(p.groupId);
  }
  return copy;
}

const blankBack = () => newPage({ ...DEFAULT_DOT_GRID, print: false });

/** 선택된 마지막 앞면의 빈 뒷면도 포함한, 실제로 추가될 면 수. */
export function duplicatePageCount(work: Pick<Work, 'items' | 'duplex'>, ids: string[], count: number): number {
  const selected = work.items.filter((i) => ids.includes(i.id));
  if (!selected.length || !Number.isInteger(count) || count < 1) return 0;
  const size = faceCount({ items: selected });
  const after = work.items.findLastIndex((i) => ids.includes(i.id));
  const before = faceCount({ items: work.items.slice(0, after + 1) });
  return (size + (work.duplex ? size % 2 : 0)) * count + (work.duplex ? before % 2 : 0);
}

export function duplicatePages(items: WorkItem[], ids: string[], count: number, duplex = false): WorkItem[] {
  const selected = items.filter((i) => ids.includes(i.id));
  if (!selected.length || !Number.isInteger(count) || count < 1
    || duplicatePageCount({ items, duplex }, ids, count) > MAX_DATED_PAGES) return items;
  const after = items.findLastIndex((i) => ids.includes(i.id));
  const added = Array.from({ length: count }, () => {
    const copies = selected.map(independentCopy);
    if (duplex && faceCount({ items: selected }) % 2) copies.push(blankBack());
    return copies;
  }).flat();
  if (duplex && faceCount({ items: items.slice(0, after + 1) }) % 2) added.unshift(blankBack());
  return insertItems(items, after, added);
}

/** 고른 항목을 원래 순서대로, 남은 항목의 beforeId 바로 앞(없으면 끝)으로 옮긴다. */
export function movePages(items: WorkItem[], ids: string[], beforeId: string | null, duplex = false): WorkItem[] {
  const selected = items.filter((i) => ids.includes(i.id));
  if (!selected.length || (beforeId !== null && (!items.some((i) => i.id === beforeId) || ids.includes(beforeId)))) return items;
  const rest = items.filter((i) => !ids.includes(i.id));
  const index = beforeId === null ? rest.length : rest.findIndex((i) => i.id === beforeId);
  const next = [...rest.slice(0, index), ...selected, ...rest.slice(index)];
  if (next.every((item, i) => item === items[i])) return items;
  const padding = duplex ? faceCount({ items: rest.slice(0, index) }) % 2 : 0;
  if (padding) next.splice(index, 0, blankBack());
  if (duplex && faceCount({ items: selected }) % 2) next.splice(index + padding + selected.length, 0, blankBack());
  return next;
}

export interface ImportPagesOptions {
  /** 날짜 규칙은 유지하고 기간(또는 달력의 해)만 새로 정한다. */
  periods: Record<string, Dataset>;
  colors: 'original' | 'current';
}

export function validImportPeriod(item: WorkItem, dataset: Dataset | undefined): boolean {
  if (item.kind !== 'dated') return true;
  if (!dataset || dataset.kind !== item.dataset.kind) return false;
  if (dataset.kind === 'calendar') return Number.isInteger(dataset.year) && dataset.year >= 100 && dataset.year <= 9999;
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = parseDate(value);
    const actual = new Date(Date.UTC(d.year, d.month - 1, d.day));
    return d.year >= 100 && actual.getUTCFullYear() === d.year && actual.getUTCMonth() + 1 === d.month && actual.getUTCDate() === d.day;
  };
  if (!validDate(dataset.start) || !validDate(dataset.end) || dataset.start > dataset.end) return false;
  const rules = item.dataset;
  if (rules.kind !== 'date' || dataset.step !== rules.step || dataset.perPage !== rules.perPage) return false;
  const pages = periodSummary(dataset, item.boundary).pages;
  return pages > 0 && pages <= MAX_DATED_PAGES;
}

/** 선택한 자리의 앞뒤 짝·날짜 묶음 뒤에 넣는다. 빈 작업이면 -1. */
export function importAfterIndex(work: Work, itemId: string | null): number {
  const ids = itemId ? pairedItemIds(work, [itemId]) : [];
  return ids.length ? work.items.findLastIndex((i) => ids.includes(i.id)) : work.items.length - 1;
}

export function importPages(target: Work, source: Work, ids: string[], after: number, options: ImportPagesOptions): {
  items: WorkItem[]; firstId: string; addedFaces: number;
} | null {
  if (source.id === target.id || source.trashedAt || after < -1 || after >= target.items.length) return null;
  const selected = pairedItemIds(source, ids).map((id) => source.items.find((i) => i.id === id)!);
  if (!selected.length || selected.some((i) => !validImportPeriod(i, options.periods[i.id]))) return null;
  const prepared = selected.map((item): WorkItem => {
    const clean = structuredClone(item);
    if (clean.kind === 'dated') { clean.dataset = { ...options.periods[clean.id] }; clean.overrides = {}; }
    if (options.colors === 'original') {
      const faces = clean.kind === 'page' ? [clean.face] : clean.faces;
      for (const face of faces) face.objects = resolveObjectColors(face.objects, source.palette);
      clean.colorRules = resolveRuleColors(clean.colorRules ?? source.colorRules, source.palette) ?? {};
    } else {
      delete clean.colorRules;
      // 이 작업 팔레트에 없는 이름표(원래 작업에만 있던 C 등)는 원래 색으로 고정한다 — 그대로 두면
      // 가리킬 칸이 없어 검정으로 그려진다.
      const keep = (v: string) => {
        const key = keyOfRef(v);
        return key !== null && colorOfKey(target.palette, key) === null ? (colorOfKey(source.palette, key) ?? v) : v;
      };
      const faces = clean.kind === 'page' ? [clean.face] : clean.faces;
      for (const face of faces) face.objects = mapColors(face.objects, keep);
    }
    return clean;
  });
  const count = faceCount({ items: prepared });
  if (!count || count > MAX_DATED_PAGES) return null;
  const added = prepared.map(independentCopy);
  const firstId = added[0].id;
  // 마지막 종이의 빈 뒷면을 채워 새 앞뒤 짝이 중간에서 어긋나지 않게 한다.
  if (target.duplex) {
    if (faceCount({ items: target.items.slice(0, after + 1) }) % 2) added.unshift(blankBack());
    if (count % 2) added.push(blankBack());
  }
  return { items: insertItems(target.items, after, added), firstId, addedFaces: faceCount({ items: added }) };
}
