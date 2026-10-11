/**
 * 열린 탭 — 피그마 데스크톱처럼 맨 앞의 고정 Library 탭 + 연 작업들
 * (리뉴얼, design/리뉴얼/디자인.md ‘탭’, 기능후보 11).
 *
 * 여기는 "어떤 작업이 어떤 순서로 열려 있고 지금 무엇을 보는가"만 다룬다.
 * 되돌리기 기록·스크롤처럼 탭마다 기억할 화면 상태는 store가 작업 id로 따로 든다.
 */

/** 동시에 열 수 있는 작업 탭 수(사용자 결정, 2026-10-11). Library 탭은 세지 않는다. */
export const MAX_TABS = 10;

export const LIBRARY_TAB = 'library';

export interface Tabs {
  /** 연 작업 id들 — 탭 줄의 순서. */
  open: string[];
  /** 지금 보는 탭. `LIBRARY_TAB` 또는 작업 id. */
  active: string;
  /** 작업 id → 마지막으로 본 순서(클수록 최근). 꽉 찼을 때 가장 오래 안 본 탭을 고른다. */
  seen: Record<string, number>;
}

export function emptyTabs(): Tabs {
  return { open: [], active: LIBRARY_TAB, seen: {} };
}

function nextSeen(tabs: Tabs): number {
  return Math.max(0, ...Object.values(tabs.seen)) + 1;
}

/** 탭을 고른다(이미 열린 작업이거나 Library). */
export function activate(tabs: Tabs, id: string): Tabs {
  if (id !== LIBRARY_TAB && !tabs.open.includes(id)) return tabs;
  if (id === LIBRARY_TAB) return { ...tabs, active: id };
  return { ...tabs, active: id, seen: { ...tabs.seen, [id]: nextSeen(tabs) } };
}

/** 꽉 찼을 때 닫을 탭 — 지금 보는 탭을 빼고 가장 오래 안 본 것. */
export function leastRecent(tabs: Tabs): string | null {
  const candidates = tabs.open.filter((id) => id !== tabs.active);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => ((tabs.seen[a] ?? 0) <= (tabs.seen[b] ?? 0) ? a : b));
}

/**
 * 작업을 탭으로 연다. 이미 열려 있으면 그 탭으로 간다.
 *
 * 꽉 찼으면 열지 않고 `{ full: 닫을 후보 }`를 돌려준다 — "가장 오래 안 본 탭을
 * 닫을까요?"를 묻는 것은 화면의 일이다. 답을 받으면 `closeTab` 뒤에 다시 연다.
 */
export function openTab(tabs: Tabs, workId: string): { tabs: Tabs } | { full: string } {
  if (tabs.open.includes(workId)) return { tabs: activate(tabs, workId) };
  if (tabs.open.length >= MAX_TABS) {
    const victim = leastRecent(tabs);
    if (victim) return { full: victim };
  }
  return { tabs: activate({ ...tabs, open: [...tabs.open, workId] }, workId) };
}

/**
 * 탭을 닫는다. 지금 보던 탭이면 오른쪽 탭으로, 없으면 왼쪽, 그것도 없으면 Library로.
 * (브라우저 탭을 닫을 때와 같다.)
 */
export function closeTab(tabs: Tabs, workId: string): Tabs {
  const index = tabs.open.indexOf(workId);
  if (index < 0) return tabs;
  const open = tabs.open.filter((id) => id !== workId);
  const { [workId]: _gone, ...seen } = tabs.seen;
  let active = tabs.active;
  if (active === workId) active = open[index] ?? open[index - 1] ?? LIBRARY_TAB;
  return activate({ open, active, seen }, active);
}

/** 작업이 지워지거나 휴지통에 들어가면 탭에서도 뺀다. 저장소에서 다시 읽을 때 쓴다. */
export function keepExisting(tabs: Tabs, exists: (id: string) => boolean): Tabs {
  let next = tabs;
  for (const id of tabs.open) if (!exists(id)) next = closeTab(next, id);
  return next;
}
