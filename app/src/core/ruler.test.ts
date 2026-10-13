import { describe, expect, it } from 'vitest';
import { MIN_LABEL_PX, MIN_TICK_PX, rulerTicks } from './ruler';

const PX_100 = 96 / 25.4; // 100%에서 1mm ≈ 3.78px

describe('눈금자 눈금', () => {
  it('100%: 1mm는 너무 붙어서 5mm 눈금부터, 숫자는 10mm마다', () => {
    const ticks = rulerTicks(80, PX_100);
    expect(ticks[0]).toEqual({ mm: 0, kind: 'major', label: '0' });
    expect(ticks.map((t) => t.mm).slice(0, 4)).toEqual([0, 5, 10, 15]);
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual([
      '0',
      '10',
      '20',
      '30',
      '40',
      '50',
      '60',
      '70',
      '80',
    ]);
  });

  it('200%: 1mm 눈금, 5mm는 중간 눈금', () => {
    const ticks = rulerTicks(20, PX_100 * 2);
    expect(ticks).toHaveLength(21);
    expect(ticks[5]).toEqual({ mm: 5, kind: 'mid' });
    expect(ticks[1]).toEqual({ mm: 1, kind: 'minor' });
  });

  it('얼마나 확대·축소해도 눈금·숫자끼리 하한보다 붙지 않고, 속지 끝을 넘지 않는다', () => {
    for (const zoom of [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]) {
      const px = PX_100 * zoom;
      const ticks = rulerTicks(148, px);
      for (let i = 1; i < ticks.length; i++)
        expect((ticks[i].mm - ticks[i - 1].mm) * px).toBeGreaterThanOrEqual(MIN_TICK_PX);
      const labels = ticks.filter((t) => t.label);
      for (let i = 1; i < labels.length; i++)
        expect((labels[i].mm - labels[i - 1].mm) * px).toBeGreaterThanOrEqual(MIN_LABEL_PX);
      expect(ticks[ticks.length - 1].mm).toBeLessThanOrEqual(148);
    }
  });

  it('길이·배율이 없으면 눈금도 없다', () => {
    expect(rulerTicks(0, 3)).toEqual([]);
    expect(rulerTicks(80, 0)).toEqual([]);
  });
});
