import { describe, expect, it } from 'vitest';
import { starterSet } from './starterSet';
import { boxOf, isLine, isText } from './objects';

/** M6(80×125, 왼쪽 안전영역 10mm)의 5mm 격자와 비슷한 것. */
const xs = Array.from({ length: 13 }, (_, i) => 15 + i * 5);
const ys = Array.from({ length: 24 }, (_, i) => 5 + i * 5);

describe('기본 속지 세트', () => {
  const set = starterSet({ xs, ys });

  it('12종, 이름이 겹치지 않고 모두 무언가 그려져 있다', () => {
    expect(set).toHaveLength(12);
    expect(new Set(set.map((t) => t.name)).size).toBe(12);
    for (const t of set) expect(t.objects.length).toBeGreaterThan(2);
  });

  it('모든 것이 격자 안에 있다', () => {
    for (const t of set) {
      for (const o of t.objects) {
        const b = boxOf(o);
        expect(b.x).toBeGreaterThanOrEqual(xs[0] - 1e-9);
        expect(b.y).toBeGreaterThanOrEqual(ys[0] - 1e-9);
        expect(b.x + b.width).toBeLessThanOrEqual(xs.at(-1)! + 1e-9);
        expect(b.y + b.height).toBeLessThanOrEqual(ys.at(-1)! + 1e-9);
      }
    }
  });

  it('선의 끝점은 격자점 위다 — 열어서 고칠 때 도트에 붙는다', () => {
    for (const t of set) {
      for (const o of t.objects.filter(isLine)) {
        for (const [x, y] of [[o.x1, o.y1], [o.x2, o.y2]]) {
          expect(xs).toContain(x);
          expect(ys).toContain(y);
        }
      }
    }
  });

  it('제목 글자가 하나씩 있다', () => {
    for (const t of set) expect(t.objects.filter(isText).some((o) => o.bold)).toBe(true);
  });

  it('격자가 너무 작으면 그리지 않는다', () => {
    expect(starterSet({ xs: [0, 5, 10], ys })).toEqual([]);
  });
});
