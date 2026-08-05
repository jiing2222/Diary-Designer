import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, canRedo, canUndo, commit, initHistory, redo, undo } from './history';

describe('실행취소', () => {
  it('처음에는 되돌릴 것이 없다', () => {
    const h = initHistory<string[]>([]);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('쌓고 되돌리고 다시 한다', () => {
    let h = initHistory<string[]>([]);
    h = commit(h, ['선1']);
    h = commit(h, ['선1', '선2']);
    expect(h.present).toEqual(['선1', '선2']);

    h = undo(h);
    expect(h.present).toEqual(['선1']);
    h = undo(h);
    expect(h.present).toEqual([]);
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present).toEqual(['선1']);
    h = redo(h);
    expect(h.present).toEqual(['선1', '선2']);
    expect(canRedo(h)).toBe(false);
  });

  it('되돌린 뒤 새로 그으면 앞길이 사라진다', () => {
    // 편집기의 보통 동작이다. 되돌려놓고 다른 걸 그리면 원래 있던 것은 못 돌아온다.
    let h = initHistory<string[]>([]);
    h = commit(h, ['선1']);
    h = commit(h, ['선1', '선2']);
    h = undo(h);
    expect(canRedo(h)).toBe(true);

    h = commit(h, ['선1', '선3']);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toEqual(['선1', '선3']);
  });

  it('원본을 고치지 않는다', () => {
    const h = initHistory<string[]>([]);
    const after = commit(h, ['선1']);
    expect(h.present).toEqual([]);
    expect(after.present).toEqual(['선1']);
  });

  it('기억할 단계에 한계가 있다', () => {
    let h = initHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    // 가장 오래된 것부터 버린다. 최근 것은 남아 있어야 한다.
    expect(h.present).toBe(HISTORY_LIMIT + 50);
    expect(undo(h).present).toBe(HISTORY_LIMIT + 49);
  });
});
