import { describe, expect, it } from 'vitest';
import { clonePalette, mergePalette, newSavedPalette } from './palettes';
import { DEFAULT_BASE, defaultWorkPalette } from './colors';

describe('저장한 팔레트', () => {
  it('새 팔레트는 기본 5칸 + A', () => {
    const p = newSavedPalette('pl1', '봄');
    expect(p.palette.base).toEqual(DEFAULT_BASE);
    expect(p.palette.points.map((x) => x.key)).toEqual(['A']);
  });

  it('복사본은 원본과 따로 논다', () => {
    const a = newSavedPalette('pl1', '봄').palette;
    const b = clonePalette(a);
    b.points[0].color = '#000000';
    b.base.base1 = '#111111';
    expect(a.points[0].color).toBe('#8ea8c6');
    expect(a.base.base1).toBe(DEFAULT_BASE.base1);
  });

  it('불러오면 같은 칸만 덮어쓰고, 작업에만 있는 칸은 남기고, 새 칸은 뒤에 더한다', () => {
    const current = {
      ...defaultWorkPalette(),
      points: [
        { key: 'A', color: '#aaaaaa' },
        { key: 'C', color: '#cccccc' },
      ],
    };
    const loaded = {
      base: { ...DEFAULT_BASE, base5: '#222222' },
      points: [
        { key: 'B', color: '#bbbbbb' },
        { key: 'A', color: '#ff0000' },
      ],
    };
    const merged = mergePalette(current, loaded);
    expect(merged.base.base5).toBe('#222222');
    expect(merged.points).toEqual([
      { key: 'A', color: '#ff0000' },
      { key: 'C', color: '#cccccc' },
      { key: 'B', color: '#bbbbbb' },
    ]);
    // 불러온 팔레트와 객체를 나눠 쓰지 않는다.
    expect(merged.base).not.toBe(loaded.base);
  });
});
