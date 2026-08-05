/**
 * 실행취소·다시실행.
 *
 * 되돌릴 대상이 객체 목록 하나뿐이라 라이브러리를 쓰지 않는다.
 * 직접 두면 **무엇이 취소되는지를 정확히 정할 수 있다** — 용지 크기를 A4로 바꾼 것까지
 * 같이 취소되면 곤란하다. 설정은 되돌리는 게 아니라 그냥 다시 고르면 되는 것이다.
 *
 * 전부 순수 함수다. 원본을 고치지 않고 새 값을 낸다.
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** 기억해둘 최대 단계. 너무 길면 메모리만 먹는다. */
export const HISTORY_LIMIT = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * 새 상태를 쌓는다.
 *
 * 되돌린 뒤에 뭔가를 새로 하면 앞으로 갈 길은 사라진다. 편집기의 보통 동작이다.
 */
export function commit<T>(h: History<T>, next: T): History<T> {
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
