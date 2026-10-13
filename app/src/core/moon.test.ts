import { describe, expect, it } from 'vitest';
import { moonCircle, moonLitPath, moonPhaseOf, moonShadePath, moonSizeOf } from './moon';

describe('달 위상 8단계', () => {
  it('설날(음력 1일)은 삭, 추석(음력 15일)은 보름', () => {
    expect(moonPhaseOf({ year: 2026, month: 2, day: 17 })).toBe(0);
    expect(moonPhaseOf({ year: 2027, month: 2, day: 7 })).toBe(0);
    expect(moonPhaseOf({ year: 2026, month: 9, day: 25 })).toBe(4);
    expect(moonPhaseOf({ year: 2027, month: 9, day: 15 })).toBe(4);
  });

  it('한 달 동안 0→7 순서로 돈다', () => {
    const seen: number[] = [];
    for (let day = 17; day <= 28; day++) seen.push(moonPhaseOf({ year: 2026, month: 2, day }));
    for (let day = 1; day <= 18; day++) seen.push(moonPhaseOf({ year: 2026, month: 3, day }));
    const order = seen.filter((p, i) => i === 0 || p !== seen[i - 1]);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });
});

describe('달 모양', () => {
  it('칸 가운데, 지름은 칸의 85% 또는 정한 값', () => {
    expect(moonCircle({ x: 0, y: 0, width: 10, height: 6 })).toEqual({ cx: 5, cy: 3, r: 2.55 });
    expect(moonSizeOf({ width: 10, height: 6, size: 4 })).toBe(4);
  });

  it('삭은 칠할 것이 없고, 보름은 원 전체, 상현은 오른쪽 반원', () => {
    expect(moonLitPath(0, 5, 5, 2)).toBeNull();
    expect(moonLitPath(4, 5, 5, 2)).toContain('A 2 2 0 1 1');
    expect(moonLitPath(2, 5, 5, 2)).toBe('M 5 3 A 2 2 0 0 1 5 7 Z');
    expect(moonLitPath(6, 5, 5, 2)).toBe('M 5 3 A 2 2 0 0 0 5 7 Z');
  });

  it('초승달은 오른쪽으로 불룩한 경계, 차가는 달은 왼쪽으로', () => {
    expect(moonLitPath(1, 5, 5, 2)).toMatch(/A 2 2 0 0 1 5 7 A [\d.]+ 2 0 0 0 5 3 Z$/);
    expect(moonLitPath(3, 5, 5, 2)).toMatch(/A 2 2 0 0 1 5 7 A [\d.]+ 2 0 0 1 5 3 Z$/);
  });
});

describe('칠하는 부분(호보니치 방식, 2026-10-13)', () => {
  it('삭은 꽉 찬 원, 보름은 칠하지 않고, 상현은 왼쪽 반을 칠한다', () => {
    expect(moonShadePath(0, 5, 5, 2)).toContain('A 2 2 0 1 1');
    expect(moonShadePath(4, 5, 5, 2)).toBeNull();
    expect(moonShadePath(2, 5, 5, 2)).toBe('M 5 3 A 2 2 0 0 0 5 7 Z');
    expect(moonShadePath(6, 5, 5, 2)).toBe('M 5 3 A 2 2 0 0 1 5 7 Z');
  });
});
