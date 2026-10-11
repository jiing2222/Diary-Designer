import type { Work } from './work';

/**
 * Library의 작업 정리 — 폴더와 휴지통(리뉴얼, 세부계획 B).
 *
 * 폴더는 한 단계뿐이다(폴더 안에 폴더 없음). 작업은 `Work.folderId`로 폴더를 가리킨다.
 */
export interface Folder {
  id: string;
  name: string;
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

/** 폴더를 지우면 그 안의 작업은 폴더 밖으로 나온다(작업은 지우지 않는다). */
export function removeFolderFrom(works: Work[], folderId: string): Work[] {
  return works.map((w) => {
    if (w.folderId !== folderId) return w;
    const { folderId: _f, ...rest } = w;
    return rest;
  });
}
