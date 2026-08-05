import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOT_GRID,
  MIN_MARGIN,
  cellAt,
  gridArea,
  gridLattice,
  gridShapes,
  type Area,
} from './grid';

/** M6 속지 전체. 이 프로그램이 가장 자주 쓰는 크기다. */
const area = (width: number, height: number): Area => ({ x: 0, y: 0, width, height });
const m6 = area(80, 125);

describe('격자점 좌표', () => {
  it('간격이 정확히 mm로 떨어진다', () => {
    const { xs } = gridLattice(m6, 5);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(5, 9);
    }
  });

  it('격자가 속지를 벗어나지 않는다', () => {
    const { xs, ys } = gridLattice(m6, 5);
    expect(xs[0]).toBeGreaterThanOrEqual(0);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(80);
    expect(ys[0]).toBeGreaterThanOrEqual(0);
    expect(ys[ys.length - 1]).toBeLessThanOrEqual(125);
  });

  it('격자가 한가운데 놓인다', () => {
    const { xs, ys } = gridLattice(m6, 5);
    // 왼쪽 여백과 오른쪽 여백이 같아야 한다.
    expect(xs[0]).toBeCloseTo(80 - xs[xs.length - 1], 9);
    expect(ys[0]).toBeCloseTo(125 - ys[ys.length - 1], 9);
  });

  it('여백이 3mm 밑으로 내려가지 않는다', () => {
    // 간격을 바꿔가며 전부 확인한다. 사용자가 임의의 간격을 넣기 때문이다.
    for (let spacing = 1; spacing <= 20; spacing += 0.5) {
      const { marginX, marginY } = gridLattice(m6, spacing);
      expect(marginX).toBeGreaterThanOrEqual(MIN_MARGIN);
      expect(marginY).toBeGreaterThanOrEqual(MIN_MARGIN);
    }
  });

  it('여백이 필요 이상으로 벌어지지 않는다', () => {
    // 중앙 정렬이면 여백은 (속지 − 격자) ÷ 2로 못 박힌다. 칸을 하나 더 넣으면
    // 여백이 간격만큼 줄어드므로, 3mm를 지키면서 도달 가능한 최댓값이 이 값이다.
    // 간격이 4mm 이하면 여백은 언제나 5mm 밑이다.
    for (let spacing = 1; spacing <= 20; spacing += 0.5) {
      const { marginX, marginY } = gridLattice(m6, spacing);
      expect(marginX).toBeLessThan(MIN_MARGIN + spacing / 2);
      expect(marginY).toBeLessThan(MIN_MARGIN + spacing / 2);
    }
  });

  it('M6 5mm 격자는 15 × 24개다', () => {
    // 가로 80mm: 칸 14개(70mm) + 여백 5mm씩
    // 세로 125mm: 칸 23개(115mm) + 여백 5mm씩
    const { xs, ys, marginX, marginY } = gridLattice(m6, 5);
    expect(xs.length).toBe(15);
    expect(ys.length).toBe(24);
    expect(marginX).toBe(5);
    expect(marginY).toBe(5);
  });

  it('간격이 0이면 격자가 없다', () => {
    expect(gridLattice(m6, 0).xs).toEqual([]);
  });

  it('영역이 여백보다 작으면 격자가 없다', () => {
    expect(gridLattice(area(4, 4), 5).xs).toEqual([]);
  });

  it('간격이 속지보다 넓으면 격자가 없다', () => {
    // 점 한 줄만 찍고 여백을 40mm로 벌리느니 격자가 없다고 하는 편이 낫다.
    expect(gridLattice(m6, 90).xs).toEqual([]);
    // 딱 한 칸이 들어가는 경계까지는 격자로 친다. 80 = 3 + 74 + 3
    expect(gridLattice(m6, 74).xs).toEqual([3, 77]);
    expect(gridLattice(m6, 75).xs).toEqual([]);
  });

  it('격자가 있으면 칸이 최소 하나는 있다', () => {
    for (let spacing = 0.5; spacing <= 100; spacing += 0.5) {
      const { xs, ys } = gridLattice(m6, spacing);
      if (xs.length > 0) expect(xs.length).toBeGreaterThanOrEqual(2);
      if (ys.length > 0) expect(ys.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('속지를 키우면 격자점이 늘어난다', () => {
    // 브랜드마다 M6 세로가 125~128mm로 다르다. 고정값을 믿지 않는다.
    const a = gridLattice(area(80, 125), 5).ys.length;
    const b = gridLattice(area(80, 128), 5).ys.length;
    expect(b).toBeGreaterThan(a);
  });
});

describe('타공 안전영역', () => {
  const m6Insert = { width: 80, height: 125 };
  const off = DEFAULT_DOT_GRID;
  const on = { ...DEFAULT_DOT_GRID, avoidSafeZone: true };

  it('기본값은 속지 전체를 쓴다', () => {
    expect(off.avoidSafeZone).toBe(false);
    expect(gridArea(m6Insert, off, 10)).toEqual({ x: 0, y: 0, width: 80, height: 125 });
  });

  it('켜면 왼쪽이 안전영역만큼 좁아진다', () => {
    expect(gridArea(m6Insert, on, 10)).toEqual({ x: 10, y: 0, width: 70, height: 125 });
  });

  it('세로는 건드리지 않는다', () => {
    // 안전영역은 왼쪽 세로 띠다. 위아래를 좁힐 이유가 없다.
    expect(gridArea(m6Insert, on, 10).height).toBe(125);
    expect(gridArea(m6Insert, on, 10).y).toBe(0);
  });

  it('좁아진 영역 안에서 다시 가운데 맞춘다', () => {
    const { xs } = gridLattice(gridArea(m6Insert, on, 10), 5);
    // 영역 70mm에 5mm 간격 → 칸 12개(60mm) + 여백 5mm씩. 안전영역 10mm 뒤부터.
    expect(xs[0]).toBe(15);
    expect(xs[xs.length - 1]).toBe(75);
    // 안전영역 안으로는 도트가 들어가지 않는다.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
  });

  it('여백 3mm 보장이 좁아진 영역에서도 지켜진다', () => {
    for (let spacing = 1; spacing <= 20; spacing += 0.5) {
      const a = gridArea(m6Insert, on, 10);
      const { xs, marginX } = gridLattice(a, spacing);
      if (xs.length === 0) continue;
      expect(marginX).toBeGreaterThanOrEqual(MIN_MARGIN);
      expect(xs[0]).toBeGreaterThanOrEqual(a.x + MIN_MARGIN);
    }
  });

  it('안전영역이 속지보다 넓으면 격자가 없다', () => {
    const { xs } = gridLattice(gridArea(m6Insert, on, 100), 5);
    expect(xs).toEqual([]);
  });
});

describe('칸 찾기', () => {
  // M6 5mm 격자: 가로 5,10,…,75 · 세로 5,10,…,120
  const lattice = gridLattice(m6, 5);

  it('찍은 자리를 품은 칸이 나온다', () => {
    expect(cellAt(lattice, 22, 33)).toEqual({ x: 20, y: 30, width: 5, height: 5 });
  });

  it('격자점 위를 찍어도 칸이 정해진다', () => {
    expect(cellAt(lattice, 20, 30)).toEqual({ x: 20, y: 30, width: 5, height: 5 });
  });

  it('격자 바깥은 붙일 칸이 없다', () => {
    expect(cellAt(lattice, 2, 33)).toBeNull();
    expect(cellAt(lattice, 78, 33)).toBeNull();
    expect(cellAt(lattice, 22, 123)).toBeNull();
  });

  it('격자가 없으면 칸도 없다', () => {
    expect(cellAt(gridLattice(m6, 0), 20, 30)).toBeNull();
  });
});

describe('모양 뽑기', () => {
  const lattice = gridLattice(m6, 5);

  it('네 모양이 전부 같은 격자에서 나온다', () => {
    // 이게 핵심이다. 간격을 그대로 두고 모양만 바꾸면 속지 종류가 바뀐다.
    const dot = gridShapes(lattice, 'dot');
    const h = gridShapes(lattice, 'horizontal');
    const v = gridShapes(lattice, 'vertical');

    expect(dot.dots.length).toBe(lattice.xs.length * lattice.ys.length);
    expect(h.lines.length).toBe(lattice.ys.length);
    expect(v.lines.length).toBe(lattice.xs.length);

    // 가로줄의 y는 도트의 y와 같은 자리다.
    expect(h.lines.map((l) => l.y1)).toEqual(lattice.ys);
    expect(v.lines.map((l) => l.x1)).toEqual(lattice.xs);
  });

  it('그리드는 가로줄과 세로줄을 합친 것이다', () => {
    const grid = gridShapes(lattice, 'grid');
    expect(grid.lines.length).toBe(lattice.xs.length + lattice.ys.length);
    expect(grid.dots).toEqual([]);
  });

  it('선이 격자 끝에서 끝까지만 그어진다', () => {
    // 속지 끝까지 늘이면 여백을 둔 의미가 없어진다.
    const { lines } = gridShapes(lattice, 'grid');
    const left = lattice.xs[0];
    const right = lattice.xs[lattice.xs.length - 1];
    for (const l of lines) {
      expect(Math.min(l.x1, l.x2)).toBeGreaterThanOrEqual(left);
      expect(Math.max(l.x1, l.x2)).toBeLessThanOrEqual(right);
    }
  });

  it('도트 모양은 선을 그리지 않는다', () => {
    expect(gridShapes(lattice, 'dot').lines).toEqual([]);
  });
});
