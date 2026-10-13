import { describe, expect, it } from 'vitest';
import { cleanSizes, dotKeyAt, dotsOf, withDotSizes } from './dots';
import { DOTS_SIZE } from './style';
import type { DotsObject } from './objects';

const board: DotsObject = { id: 'dg1', type: 'dots', x: 10, y: 20, width: 15, height: 10, cols: 3, rows: 2 };

describe('도트 판', () => {
  it('칸 가운데에 도트, 지름은 기본값', () => {
    const dots = dotsOf(board);
    expect(dots).toHaveLength(6);
    expect(dots[0]).toEqual({ key: '0,0', row: 0, col: 0, x: 12.5, y: 22.5, size: DOTS_SIZE });
    expect(dots[5]).toMatchObject({ key: '1,2', x: 22.5, y: 27.5 });
  });

  it('누른 자리의 도트, 판 밖이면 없음', () => {
    expect(dotKeyAt(board, { x: 21, y: 29 })).toBe('1,2');
    expect(dotKeyAt(board, { x: 9, y: 25 })).toBeNull();
  });

  it('바꾼 도트만 기억하고, 되돌리면 지운다(0은 없음)', () => {
    const a = withDotSizes({ ...board, size: 1 }, ['0,1', '1,1'], 0);
    expect(dotsOf(a).map((d) => d.size)).toEqual([1, 0, 1, 1, 0, 1]);
    const b = withDotSizes(a, ['0,1', '1,1'], undefined);
    expect(b.sizes).toBeUndefined();
  });

  it('판이 줄면 밖이 된 키를 걷어낸다', () => {
    const a = withDotSizes(board, ['0,2', '0,0'], 2);
    expect(cleanSizes({ ...a, cols: 2 }).sizes).toEqual({ '0,0': 2 });
  });
});
