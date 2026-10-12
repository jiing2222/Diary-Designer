/**
 * 열린 탭 — 피그마 데스크톱처럼 맨 앞의 고정 Library 탭 + 연 작업들
 * (리뉴얼, design/리뉴얼/디자인.md ‘탭’, 기능후보 11).
 *
 * 여기는 "어떤 작업이 어떤 순서로 열려 있고 지금 무엇을 보는가"와, 탭마다 기억하는 편집 위치의
 * 모양(`Cursor`)을 다룬다. 값은 store가 작업 id로 들고, 저장소(storage/v2)가 그대로 저장한다.
 * 되돌리기 기록은 이번 실행에서만 store가 든다.
 */

/**
 * 펼침면의 어느 쪽인지. 다이어리를 펼치면 왼쪽은 앞 장의 **뒷면**, 오른쪽은 다음 장의
 * **앞면**이다(core/work의 `spreadsOf`). 옛 판의 앞면/뒷면 이름을 그대로 쓴다 —
 * 편집 화면의 경계를 넘는 선·뒷면 거울 같은 동작이 이 이름을 기준으로 짜여 있다.
 */
export type Side = 'front' | 'back';

/** 편집 화면 보기 — 펼침면(다이어리를 펼친 모습) 또는 일렬(한 면씩 아래로, 기능후보 8). */
export type ViewMode = 'spread' | 'single';

/** 작업 탭마다 기억하는 편집 위치(기능후보 11: 탭마다 따로). */
export interface Cursor {
  /** 지금 고르는 펼침면(일렬 보기면 면) 번호. */
  spread: number;
  side: Side;
  /** 원본 편집 중이면 그 날짜 묶음과 원본 면 번호(세부계획 A4.6 2-1). */
  source: { itemId: string; faceIndex: number } | null;
  view: ViewMode;
  /** 이 탭이 Print 화면인가(세부계획 A14: 작업 탭 안에서 Print로 바뀐다). 없으면 편집 화면. */
  printing?: boolean;
  /** 탭을 오가거나 Print에서 돌아올 때 편집 화면을 같은 자리로 되살린다. */
  zoom?: number;
  scrollTop?: number;
  scrollLeft?: number;
  /** 탭을 떠날 때 고른 객체. 면을 바꾸면 비운다. */
  selectedIds?: string[];
}


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
