import { describe, expect, it } from 'vitest';
import { alignBox } from './align';

const page = { width: 80, height: 120 };
const box = (x: number, y: number, width = 10, height = 10) => ({ x, y, width, height });

describe('맞춤 안내선', () => {
  it('다른 객체의 왼쪽에 가까우면 붙고 세로 안내선이 두 상자를 지난다', () => {
    const r = alignBox(box(21, 40), [box(20, 10)], page, 2);
    expect(r.dx).toBe(-1);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ axis: 'x', at: 20, from: 10, to: 50 }]);
  });

  it('가운데끼리, 오른쪽끼리도 맞추고, 가장 가까운 것을 고른다', () => {
    // 가운데 25.5 vs 상대 가운데 25 (0.5) / 오른쪽 30.5 vs 30 (0.5) — 같으면 먼저 찾은 쪽, 이동량은 같다.
    expect(alignBox(box(20.5, 50), [box(20, 10)], page, 2).dx).toBe(-0.5);
    // 왼쪽 31(상대 오른쪽 30과 1) vs 가운데 36(상대 없음) → 1 당김
    expect(alignBox(box(31, 50), [box(20, 10)], page, 2).dx).toBe(-1);
  });

  it('페이지 가운데에도 맞춘다(가로·세로 함께)', () => {
    const r = alignBox(box(34.2, 54.5), [], page, 1);
    expect(r).toMatchObject({ dx: 0.8, dy: 0.5 });
    expect(r.guides).toEqual([
      { axis: 'x', at: 40, from: 0, to: 120 },
      { axis: 'y', at: 60, from: 0, to: 80 },
    ]);
  });

  it('멀면 그대로', () => {
    expect(alignBox(box(5, 5), [box(50, 90)], page, 1)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
