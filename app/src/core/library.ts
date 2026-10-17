import type { Work } from './work';
import type { DiaryObject } from './objects';
import { outsideCount } from './template';
import type { Mm } from './units';

/**
 * Library의 작업 정리 — 폴더와 휴지통(리뉴얼, 세부계획 B).
 *
 * 폴더는 한 단계뿐이다(폴더 안에 폴더 없음). 작업은 `Work.folderId`로 폴더를 가리킨다.
 */
export interface Folder {
  id: string;
  name: string;
}

export type ProjectSort = 'updated' | 'created' | 'name';

/** undefined는 모든 작업, null은 ‘분류 없음’(폴더 없음), 문자열은 해당 폴더. */
export interface ProjectView {
  folderId?: string | null;
  diaryId: string | null;
  query: string;
  sort: ProjectSort;
}

export const DEFAULT_PROJECT_VIEW: ProjectView = { diaryId: null, query: '', sort: 'updated' };

/** 폴더·다이어리·이름 검색은 함께 적용하며 휴지통은 Projects에서 늘 제외한다. */
export function projectsFor(works: Work[], view: ProjectView): Work[] {
  const query = view.query.trim().normalize('NFC').toLocaleLowerCase('ko');
  const nameOrder = (a: Work, b: Work) => a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' });
  return works.filter((w) => !isTrashed(w)
    && (view.folderId === undefined || (view.folderId === null ? !w.folderId : w.folderId === view.folderId))
    && (view.diaryId === null || w.diaryId === view.diaryId)
    && w.name.normalize('NFC').toLocaleLowerCase('ko').includes(query))
    .sort((a, b) => {
      if (view.sort === 'name') return nameOrder(a, b) || a.id.localeCompare(b.id);
      const key = view.sort === 'created' ? 'createdAt' : 'updatedAt';
      return b[key].localeCompare(a[key]) || nameOrder(a, b) || a.id.localeCompare(b.id);
    });
}

/**
 * 이 다이어리를 쓰는 작업 수 — 휴지통의 작업도 센다(되살리면 다시 그 다이어리가 필요하다).
 * 0일 때만 다이어리를 지울 수 있다(세부계획 B 결정 2026-10-12).
 */
export function worksUsingDiary(works: Work[], diaryId: string): number {
  return works.filter((w) => w.diaryId === diaryId).length;
}

/**
 * 다이어리를 바꾸면 새 크기 밖으로 나가는 객체 수(리뉴얼 7-2, 편집기 다이어리 칩). 좌표는 그대로 두므로
 * 지우지도 옮기지도 않는다 — 몰라서 놀라지 않게 바꾸기 전에 알려줄 뿐이다.
 *
 * 펼친 면(날짜마다 반복)이 아니라 **원본**을 센다 — 날짜 묶음의 양식 객체 하나가 365번 세어지면 안 된다.
 * 날짜별로 더한 객체는 따로 센다.
 */
export function outsideObjects(work: Pick<Work, 'items'>, size: { width: Mm; height: Mm }): number {
  let count = 0;
  for (const item of work.items) {
    if (item.kind === 'page') count += outsideCount(item.face.objects, size);
    else {
      const overrides = Object.values(item.overrides);
      for (const face of item.faces) {
        for (const o of face.objects) {
          // 날짜별 위치·크기 수정도 검사하되 같은 원본 요소는 한 번만 센다.
          const changedOutside = overrides.some((ov) => !ov.removed.includes(o.id)
            && ov.props[o.id] && outsideCount([{ ...o, ...ov.props[o.id] } as DiaryObject], size));
          if (outsideCount([o], size) || changedOutside) count++;
        }
      }
      for (const ov of overrides) count += outsideCount(ov.added, size);
    }
  }
  return count;
}

/** 휴지통에 머무는 기간. 지나면 완전히 지운다(사용자 결정). */
export const TRASH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isTrashed(w: Pick<Work, 'trashedAt'>): boolean {
  return w.trashedAt !== undefined;
}

export function trashWork(w: Work, now: string): Work {
  return { ...w, trashedAt: now };
}

export function restoreWork(w: Work): Work {
  const { trashedAt: _t, ...rest } = w;
  return rest;
}

/** 완전히 지워지기까지 남은 날(올림). 휴지통에 없으면 null. */
export function daysLeft(w: Pick<Work, 'trashedAt'>, now: string): number | null {
  if (w.trashedAt === undefined) return null;
  const elapsed = Date.parse(now) - Date.parse(w.trashedAt);
  return Math.max(0, Math.ceil(TRASH_DAYS - elapsed / DAY_MS));
}

/** 휴지통에서 기간이 지난 작업 id들 — 저장소에서 지울 대상. */
export function expiredTrash(works: Pick<Work, 'id' | 'trashedAt'>[], now: string): string[] {
  return works.filter((w) => daysLeft(w, now) === 0).map((w) => w.id);
}

/** 폴더를 지우면 그 안의 작업은 ‘분류 없음’으로 나온다(작업은 지우지 않는다). */
export function removeFolderFrom(works: Work[], folderId: string): Work[] {
  return works.map((w) => {
    if (w.folderId !== folderId) return w;
    const { folderId: _f, ...rest } = w;
    return rest;
  });
}

/**
 * Shift로 여러 개 고르기 — 보이는 순서(`order`)에서 `from`부터 `to`까지(양 끝 포함, 방향 상관없이).
 * `from`이 없거나 목록에 없으면(폴더를 바꾼 뒤 등) `to` 하나만.
 */
export function rangeIds(order: string[], from: string | null, to: string): string[] {
  const a = from === null ? -1 : order.indexOf(from);
  const b = order.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}
