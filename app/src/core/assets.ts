import type { DiaryObject } from './objects';
import type { Work } from './work';

/**
 * Library의 Images·Fonts 정책(리뉴얼 7-3, 세부계획 B 결정 2026-10-11·10-12).
 *
 * - Images는 늘 최신순, Fonts는 즐겨찾기가 위·그 안에서 가나다순. 편집기의 고르기 목록도 같은 순서.
 * - 올린 이미지·글꼴은 직접 지울 때까지 남는다(예전의 ‘★ 저장 / 최근 사용 10개’ 구분은 없앴다).
 * - **쓰는 중인 것을 지우면 목록에서만 빠진다**(`hidden`). 작업에는 그대로 남고, 파일은 그것을 쓰는
 *   작업이 하나도 없게 될 때 — 영구 삭제할 때·앱을 열 때 — 실제로 지운다(`purgeable`).
 *
 * 파일 자체(바이트·IndexedDB)는 fonts/·images/ 등록소가 맡는다. 여기는 목록과 사용처 계산만 한다.
 */
export interface LibraryAsset {
  id: string;
  name: string;
  label?: string;
  /** 목록에서 뺐지만 쓰는 작업이 있어 파일은 남겨둔 것. */
  hidden?: boolean;
}

/** 파일이 없어도 남겨 둘 목록 정보. 파일 바이트와 독립적으로 저장한다. */
export interface FontInfo extends LibraryAsset { favorite?: boolean }
export interface ImageInfo extends LibraryAsset { usedAt?: number }

/** 작업이 쓰는 이미지·글꼴 id — 원본 면, 날짜 묶음의 원본·날짜별로 더한 것·날짜별로 바꾼 속성까지. */
function idsInWork(work: Pick<Work, 'items'>, key: 'imageId' | 'font', out: Set<string>): void {
  const take = (v: unknown) => {
    if (typeof v === 'string' && v) out.add(v);
  };
  const objs = (list: DiaryObject[]) => list.forEach((o) => take((o as unknown as Record<string, unknown>)[key]));
  for (const item of work.items) {
    if (item.kind === 'page') objs(item.face.objects);
    else {
      item.faces.forEach((f) => objs(f.objects));
      for (const ov of Object.values(item.overrides)) {
        objs(ov.added);
        Object.values(ov.props).forEach((p) => take(p[key]));
      }
    }
  }
}

/** 작업들(휴지통 포함)이 쓰는 이미지 id. */
export function imagesInUse(works: Pick<Work, 'items'>[]): Set<string> {
  const out = new Set<string>();
  works.forEach((w) => idsInWork(w, 'imageId', out));
  return out;
}

/** 작업들(휴지통 포함)이 쓰는 글꼴 id. */
export function fontsInUse(works: Pick<Work, 'items'>[]): Set<string> {
  const out = new Set<string>();
  works.forEach((w) => idsInWork(w, 'font', out));
  return out;
}

/** 이 이미지·글꼴을 쓰는 작업 수(휴지통 포함) — Library 목록의 ‘작업 n개’와 지울 때의 안내. */
export function worksUsingAsset(works: Pick<Work, 'items'>[], kind: 'image' | 'font', id: string): number {
  return works.filter((w) => (kind === 'image' ? imagesInUse([w]) : fontsInUse([w])).has(id)).length;
}

/** 실제로 지워도 되는 것 — 목록에서 뺐고(hidden) 이제 아무도 쓰지 않는 것. */
export function purgeable<T extends LibraryAsset>(list: T[], used: Set<string>): T[] {
  return list.filter((a) => a.hidden && !used.has(a.id));
}

const labelOf = (a: LibraryAsset) => a.label ?? a.name;

/** Library·고르기 목록의 이미지 — 뺀 것 제외, 최신순(마지막으로 올리거나 씌운 때). */
export function libraryImages<T extends LibraryAsset & { usedAt?: number }>(images: T[]): T[] {
  return images.filter((i) => !i.hidden).sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0));
}

/** Library·고르기 목록의 글꼴 — 뺀 것 제외, 즐겨찾기가 위·그 안에서 가나다순. */
export function libraryFonts<T extends LibraryAsset & { favorite?: boolean }>(fonts: T[]): T[] {
  return fonts
    .filter((f) => !f.hidden)
    .sort(
      (a, b) =>
        Number(!!b.favorite) - Number(!!a.favorite) ||
        labelOf(a).localeCompare(labelOf(b), 'ko', { numeric: true, sensitivity: 'base' }),
    );
}

/**
 * 같은 이름의 파일을 다시 올릴 때 물려받을 id. 파일 없이 이름만 남은 것(저장 파일에서 돌아온 것)이나
 * 목록에서 뺀 것이면 그 id를 이어받아 — 그것을 쓰던 객체가 되살아나고 목록에도 다시 나온다.
 * 이미 목록에 있는 같은 이름은 물려받지 않는다(같은 이름의 다른 파일일 수 있다).
 */
export function reusableIdFor(
  list: LibraryAsset[],
  name: string,
  hasFile: (id: string) => boolean,
): string | undefined {
  return list.find((a) => a.name === name && (!hasFile(a.id) || a.hidden))?.id;
}
