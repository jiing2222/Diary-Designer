import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOT_GRID,
  DEFAULT_MIN_MARGIN,
  cellAt,
  cellsIn,
  gridArea,
  gridLattice,
  gridShapes,
  spacingForCells,
  tableLines,
  tableSize,
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
      expect(marginX).toBeGreaterThanOrEqual(DEFAULT_MIN_MARGIN);
      expect(marginY).toBeGreaterThanOrEqual(DEFAULT_MIN_MARGIN);
    }
  });

  it('여백이 필요 이상으로 벌어지지 않는다', () => {
    // 중앙 정렬이면 여백은 (속지 − 격자) ÷ 2로 못 박힌다. 칸을 하나 더 넣으면
    // 여백이 간격만큼 줄어드므로, 3mm를 지키면서 도달 가능한 최댓값이 이 값이다.
    // 간격이 4mm 이하면 여백은 언제나 5mm 밑이다.
    for (let spacing = 1; spacing <= 20; spacing += 0.5) {
      const { marginX, marginY } = gridLattice(m6, spacing);
      expect(marginX).toBeLessThan(DEFAULT_MIN_MARGIN + spacing / 2);
      expect(marginY).toBeLessThan(DEFAULT_MIN_MARGIN + spacing / 2);
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
      expect(marginX).toBeGreaterThanOrEqual(DEFAULT_MIN_MARGIN);
      expect(xs[0]).toBeGreaterThanOrEqual(a.x + DEFAULT_MIN_MARGIN);
    }
  });

  it('안전영역이 속지보다 넓으면 격자가 없다', () => {
    const { xs } = gridLattice(gridArea(m6Insert, on, 100), 5);
    expect(xs).toEqual([]);
  });

  it('뒷면(mirror)이면 오른쪽이 안전영역만큼 좁아진다', () => {
    // 앞면 왼쪽에 있던 구멍은 종이를 뒤집으면 뒷면에서 오른쪽에 있다.
    expect(gridArea(m6Insert, on, 10, true)).toEqual({ x: 0, y: 0, width: 70, height: 125 });
  });

  it('뒷면이어도 안전영역을 꺼두면 속지 전체를 쓴다', () => {
    expect(gridArea(m6Insert, off, 10, true)).toEqual({ x: 0, y: 0, width: 80, height: 125 });
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

  it('영역을 주면 선이 그 끝까지 늘어난다', () => {
    // 줄노트처럼 선이 종이 끝까지 이어지길 원할 때.
    const { lines } = gridShapes(lattice, 'grid', m6);
    for (const l of lines.filter((s) => s.y1 === s.y2)) {
      expect(Math.min(l.x1, l.x2)).toBe(0);
      expect(Math.max(l.x1, l.x2)).toBe(80);
    }
    for (const l of lines.filter((s) => s.x1 === s.x2)) {
      expect(Math.min(l.y1, l.y2)).toBe(0);
      expect(Math.max(l.y1, l.y2)).toBe(125);
    }
  });

  it('선을 늘여도 격자점 자리는 조금도 변하지 않는다', () => {
    // 늘어나는 건 보이는 선뿐이다. 붙는 자리까지 따라 움직이면 이미 그려둔 것이
    // 어긋난다 — 줄 간격에서 한 번 겪은 사고다.
    const plain = gridShapes(lattice, 'grid');
    const wide = gridShapes(lattice, 'grid', m6);

    expect(wide.lines.length).toBe(plain.lines.length);
    expect(wide.lines.filter((l) => l.y1 === l.y2).map((l) => l.y1)).toEqual(lattice.ys);
    expect(wide.lines.filter((l) => l.x1 === l.x2).map((l) => l.x1)).toEqual(lattice.xs);
  });

  it('도트 모양은 영역을 줘도 달라지지 않는다', () => {
    expect(gridShapes(lattice, 'dot', m6)).toEqual(gridShapes(lattice, 'dot'));
  });
});

describe('최소 여백 설정', () => {
  it('정하지 않으면 기본값 3mm를 쓴다', () => {
    expect(gridLattice(m6, 5)).toEqual(gridLattice(m6, 5, DEFAULT_MIN_MARGIN));
  });

  it('0으로 두면 여백이 최소가 된다', () => {
    // 80mm에 5mm 간격이면 딱 나누어떨어져 여백이 0이다.
    const { xs, marginX } = gridLattice(m6, 5, 0);
    expect(marginX).toBe(0);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(80);
  });

  it('0으로 둬도 나누어떨어지지 않으면 남는 만큼은 반씩 남는다', () => {
    // 정확히 0이 되지는 않는다는 것을 못 박아둔다. 80 = 6 × 13 + 2
    expect(gridLattice(m6, 6, 0).marginX).toBe(1);
  });

  it('여백을 키우면 칸이 줄어든다', () => {
    const tight = gridLattice(m6, 5, 0);
    const loose = gridLattice(m6, 5, 10);
    expect(loose.xs.length).toBeLessThan(tight.xs.length);
    expect(loose.marginX).toBeGreaterThanOrEqual(10);
  });

  it('어떤 값을 줘도 격자는 한가운데 놓인다', () => {
    for (const m of [0, 1, 3, 7, 12]) {
      const { xs, marginX } = gridLattice(m6, 5, m);
      if (xs.length === 0) continue;
      expect(xs[0]).toBeCloseTo(80 - xs[xs.length - 1], 9);
      expect(marginX).toBeGreaterThanOrEqual(m);
    }
  });

  it('음수를 줘도 격자가 영역 밖으로 나가지 않는다', () => {
    const { xs, marginX } = gridLattice(m6, 5, -20);
    expect(marginX).toBeGreaterThanOrEqual(0);
    expect(xs[0]).toBeGreaterThanOrEqual(0);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(80);
  });
});

describe('여백 없이 끝까지 채우기', () => {
  it('나누어떨어지면 끝점이 영역 끝과 맞는다', () => {
    // 80 = 5 × 16, 125 = 5 × 25 — 잘린 칸이 없다.
    const { xs, ys, cols, rows } = gridLattice(m6, 5, 3, true);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(80);
    expect(ys[0]).toBe(0);
    expect(ys[ys.length - 1]).toBe(125);
    expect(cols).toBe(16);
    expect(rows).toBe(25);
  });

  it('온전한 칸은 가운데 정렬을 지킨다', () => {
    // 80 = 6 × 13 + 2 → 남는 2mm가 1mm씩 나뉜다. 한쪽만 잘리면 격자가 쏠려 보인다.
    const { xs, cols } = gridLattice(m6, 6, 3, true);
    expect(cols).toBe(13);
    // 가장자리를 뺀 안쪽 점들이 온전한 격자다.
    const inner = xs.slice(1, -1);
    expect(inner[0]).toBe(1);
    expect(inner[inner.length - 1]).toBe(79);
    expect(inner[0]).toBeCloseTo(80 - inner[inner.length - 1], 9);
  });

  it('영역 가장자리도 붙을 자리로 넣는다', () => {
    // 격자선은 영역 끝까지 그어지는데 붙을 자리가 안쪽에서 끝나면,
    // 테두리를 그으려 해도 양끝이 여백만큼 못 미친다.
    const { xs, ys } = gridLattice(m6, 6, 3, true);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(80);
    expect(ys[0]).toBe(0);
    expect(ys[ys.length - 1]).toBe(125);
  });

  it('가장자리 띠는 칸으로 세지 않는다', () => {
    // 간격보다 좁아서 거기에 무언가를 앉힐 수 없다. 격자점 사이이긴 해도 칸이 아니다.
    const { xs, cols } = gridLattice(m6, 6, 3, true);
    expect(xs.length - 1).toBe(cols + 2);
  });

  it('끄면 가장자리를 넣지 않는다', () => {
    const { xs } = gridLattice(m6, 6, 3, false);
    expect(xs[0]).not.toBe(0);
  });

  it('최소 여백은 무시된다', () => {
    // 여백을 없애는 것이 목적이라 하한을 둘 이유가 없다.
    expect(gridLattice(m6, 5, 0, true)).toEqual(gridLattice(m6, 5, 15, true));
  });

  it('온전한 칸 수는 최소 여백 0과 같다', () => {
    for (const spacing of [5, 6, 7.5]) {
      expect(gridLattice(m6, spacing, 3, true).cols).toBe(gridLattice(m6, spacing, 0).cols);
    }
  });

  it('안쪽 격자는 간격이 그대로 지켜진다', () => {
    const inner = gridLattice(m6, 6, 3, true).xs.slice(1, -1);
    for (let i = 1; i < inner.length; i++) {
      expect(inner[i] - inner[i - 1]).toBeCloseTo(6, 9);
    }
  });

  it('간격이 영역보다 넓으면 격자가 없다', () => {
    expect(gridLattice(m6, 200, 0, true).xs).toEqual([]);
  });

  it('안전영역을 비우면 그 안쪽에서만 채운다', () => {
    // 끝까지 채운다는 것은 속지가 아니라 **격자 영역**의 끝까지다.
    const area = gridArea(
      { width: 80, height: 125 },
      { ...DEFAULT_DOT_GRID, avoidSafeZone: true },
      10,
    );
    const { xs } = gridLattice(area, 5, 0, true);
    expect(xs[0]).toBeGreaterThanOrEqual(10);
  });
});


describe('칸 수로 간격 정하기', () => {
  it('딱 나누어떨어지는 간격이 나온다', () => {
    // 여백 없이 80mm에 10칸이면 8mm.
    expect(spacingForCells(80, 10, 0)).toBe(8);
  });

  it('여백을 뺀 만큼을 나눈다', () => {
    expect(spacingForCells(80, 10, 5)).toBe(7);
  });

  it('그 간격으로 실제로 그 칸 수가 나온다', () => {
    // 계산해놓고 막상 만들면 한 칸 모자라는 일이 없어야 한다.
    for (const n of [3, 7, 10, 24]) {
      const spacing = spacingForCells(80, n, 0);
      expect(gridLattice(m6, spacing, 0, true).cols).toBe(n);
    }
  });

  it('0칸은 만들 수 없다', () => {
    expect(spacingForCells(80, 0, 0)).toBe(0);
  });
});

describe('가장자리에 덧붙인 자리', () => {
  const padded = gridLattice(m6, 6, 3, true); // 80 = 6 × 13 + 2 → 양끝에 덧붙는다
  const exact = gridLattice(m6, 5, 3, true); // 80 = 5 × 16 → 덧붙일 것이 없다

  it('나누어떨어지지 않을 때만 덧붙는다', () => {
    expect(padded.padded).toBe(true);
    expect(exact.padded).toBe(false);
    expect(gridLattice(m6, 6, 3, false).padded).toBe(false);
  });

  it('인쇄할 때는 그 자리에 도트를 찍지 않는다', () => {
    // 재단선 위에 반쯤 잘린 도트가 남으면 격자가 어긋나 보인다.
    const screen = gridShapes(padded, 'dot');
    const print = gridShapes(padded, 'dot', null, true);
    expect(print.dots.length).toBe((padded.xs.length - 2) * (padded.ys.length - 2));
    expect(print.dots.length).toBeLessThan(screen.dots.length);
    expect(print.dots.every((d) => d.x > 0 && d.x < 80)).toBe(true);
  });

  it('화면에서는 보여준다', () => {
    // 보여야 어디에 붙는지 알고 끝까지 그을 수 있다.
    const screen = gridShapes(padded, 'dot');
    expect(screen.dots.some((d) => d.x === 0)).toBe(true);
    expect(screen.dots.some((d) => d.x === 80)).toBe(true);
  });

  it('덧붙일 것이 없으면 인쇄해도 그대로다', () => {
    expect(gridShapes(exact, 'dot', null, true).dots.length).toBe(
      gridShapes(exact, 'dot').dots.length,
    );
  });

  it('선은 인쇄해도 그대로 긋는다', () => {
    // 잘린 칸을 종이 끝에서 닫아주는 것이 그 선이다. 도트와 달리 빼면 안 된다.
    expect(gridShapes(padded, 'grid', m6, true).lines).toEqual(
      gridShapes(padded, 'grid', m6).lines,
    );
  });
});

describe('표 — 두 점 사이의 격자점을 전부 잇는다', () => {
  // M6 5mm 격자: 가로 5,10,…,75 · 세로 5,10,…,120
  const lattice = gridLattice(m6, 5);

  it('한 칸이면 테두리 4개와 같다', () => {
    // rectLines(면 그리기)의 1칸 결과와 정확히 같은 네 선이어야 한다.
    const lines = tableLines(lattice, { x: 5, y: 5 }, { x: 10, y: 10 });
    expect(lines).toHaveLength(4);
    expect(lines).toEqual(
      expect.arrayContaining([
        { x1: 5, y1: 5, x2: 10, y2: 5 },
        { x1: 5, y1: 10, x2: 10, y2: 10 },
        { x1: 5, y1: 5, x2: 5, y2: 10 },
        { x1: 10, y1: 5, x2: 10, y2: 10 },
      ]),
    );
  });

  it('여러 칸이면 안쪽 칸 선까지 전부 나온다', () => {
    // 가로 3칸(5,10,15,20) · 세로 1칸(5,10) → 가로선 2개 + 세로선 4개
    const lines = tableLines(lattice, { x: 5, y: 5 }, { x: 20, y: 10 });
    const horizontal = lines.filter((l) => l.y1 === l.y2);
    const vertical = lines.filter((l) => l.x1 === l.x2);
    expect(horizontal).toHaveLength(2);
    expect(vertical).toHaveLength(4);
    // 가로선은 전부 왼쪽 끝에서 오른쪽 끝까지, 세로선은 위에서 아래까지 이어진다.
    for (const l of horizontal) {
      expect(Math.min(l.x1, l.x2)).toBe(5);
      expect(Math.max(l.x1, l.x2)).toBe(20);
    }
    for (const l of vertical) {
      expect(Math.min(l.y1, l.y2)).toBe(5);
      expect(Math.max(l.y1, l.y2)).toBe(10);
    }
  });

  it('시작점과 끝점 순서가 바뀌어도 같은 표가 나온다', () => {
    const forward = tableLines(lattice, { x: 5, y: 5 }, { x: 20, y: 15 });
    const backward = tableLines(lattice, { x: 20, y: 15 }, { x: 5, y: 5 });
    expect(new Set(backward)).toEqual(new Set(forward));
    expect(forward).toHaveLength(backward.length);
  });

  it('가로로만 끌면 선 하나뿐이다 — 나눌 세로 폭이 없다', () => {
    const lines = tableLines(lattice, { x: 5, y: 5 }, { x: 20, y: 5 });
    expect(lines).toEqual([{ x1: 5, y1: 5, x2: 20, y2: 5 }]);
  });

  it('세로로만 끌어도 마찬가지다', () => {
    const lines = tableLines(lattice, { x: 5, y: 5 }, { x: 5, y: 20 });
    expect(lines).toEqual([{ x1: 5, y1: 5, x2: 5, y2: 20 }]);
  });

  it('한 점이면 그을 것이 없다', () => {
    expect(tableLines(lattice, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([]);
  });

  it('격자점 사이 간격은 항상 지켜진다', () => {
    // 몇 칸을 끌든 인접한 선끼리는 원래 격자 간격(5mm) 그대로다.
    const lines = tableLines(lattice, { x: 5, y: 5 }, { x: 30, y: 25 });
    const xs = [...new Set(lines.flatMap((l) => [l.x1, l.x2]))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(5, 9);
    }
  });

  it('실제로 존재하는 격자점만 쓴다 — 다시 계산하지 않는다', () => {
    // 안전영역을 피해 격자가 밀린 lattice에서, 그 앞쪽(존재하지 않는 자리)까지
    // 끌어도 실제로 있는 점부터만 선이 생긴다.
    const shifted = gridLattice(gridArea(m6, { ...DEFAULT_DOT_GRID, avoidSafeZone: true }, 10), 5);
    const lines = tableLines(shifted, { x: 0, y: 5 }, { x: 30, y: 15 });
    const xs = lines.flatMap((l) => [l.x1, l.x2]);
    expect(Math.min(...xs)).toBe(shifted.xs[0]);
    expect(Math.min(...xs)).toBeGreaterThan(0);
  });

  it('범위를 벗어나게 끌어도 있는 격자점까지만 그려진다', () => {
    const lines = tableLines(lattice, { x: -50, y: -50 }, { x: 1000, y: 1000 });
    const xs = lines.flatMap((l) => [l.x1, l.x2]);
    const ys = lines.flatMap((l) => [l.y1, l.y2]);
    expect(Math.min(...xs)).toBe(lattice.xs[0]);
    expect(Math.max(...xs)).toBe(lattice.xs[lattice.xs.length - 1]);
    expect(Math.min(...ys)).toBe(lattice.ys[0]);
    expect(Math.max(...ys)).toBe(lattice.ys[lattice.ys.length - 1]);
  });
});

describe('표 크기 — 몇 칸인지', () => {
  const lattice = gridLattice(m6, 5);

  it('한 칸이면 1 × 1이다', () => {
    expect(tableSize(lattice, { x: 5, y: 5 }, { x: 10, y: 10 })).toEqual({ cols: 1, rows: 1 });
  });

  it('여러 칸이면 tableLines가 실제로 내는 것과 같은 수다', () => {
    const a = { x: 5, y: 5 };
    const b = { x: 20, y: 15 };
    const { cols, rows } = tableSize(lattice, a, b);
    const lines = tableLines(lattice, a, b);
    expect(lines.filter((l) => l.x1 === l.x2)).toHaveLength(cols + 1);
    expect(lines.filter((l) => l.y1 === l.y2)).toHaveLength(rows + 1);
  });

  it('한 줄로만 끌어도 최소 1칸으로 센다', () => {
    // 가로로만 끌면 세로 폭이 없어도 "그 방향으로 한 칸"은 된다.
    expect(tableSize(lattice, { x: 5, y: 5 }, { x: 20, y: 5 })).toEqual({ cols: 3, rows: 1 });
    expect(tableSize(lattice, { x: 5, y: 5 }, { x: 5, y: 20 })).toEqual({ cols: 1, rows: 3 });
  });

  it('시작점과 끝점 순서가 바뀌어도 같다', () => {
    const a = { x: 5, y: 5 };
    const b = { x: 25, y: 15 };
    expect(tableSize(lattice, a, b)).toEqual(tableSize(lattice, b, a));
  });
});

describe('칸 하나하나의 자리 — 체크박스 도장', () => {
  const lattice = gridLattice(m6, 5);

  it('한 칸이면 그 칸 하나다', () => {
    const cells = cellsIn(lattice, { x: 5, y: 5 }, { x: 10, y: 10 });
    expect(cells).toEqual([{ x: 5, y: 5, width: 5, height: 5 }]);
  });

  it('여러 칸이면 tableSize가 세는 것과 같은 수다 — 왼쪽 위부터 순서대로', () => {
    const a = { x: 5, y: 5 };
    const b = { x: 20, y: 15 };
    const { cols, rows } = tableSize(lattice, a, b);
    const cells = cellsIn(lattice, a, b);
    expect(cells).toHaveLength(cols * rows);
    // 첫 칸은 왼쪽 위, 마지막 칸은 오른쪽 아래.
    expect(cells[0]).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(cells[cells.length - 1]).toEqual({ x: 15, y: 10, width: 5, height: 5 });
  });

  it('칸들을 다 합치면 tableLines의 바깥 테두리와 같은 자리를 덮는다', () => {
    const a = { x: 5, y: 5 };
    const b = { x: 20, y: 15 };
    const cells = cellsIn(lattice, a, b);
    const left = Math.min(...cells.map((c) => c.x));
    const top = Math.min(...cells.map((c) => c.y));
    const right = Math.max(...cells.map((c) => c.x + c.width));
    const bottom = Math.max(...cells.map((c) => c.y + c.height));
    expect({ left, top, right, bottom }).toEqual({ left: 5, top: 5, right: 20, bottom: 15 });
  });

  it('시작점과 끝점 순서가 바뀌어도 같은 칸들이 나온다', () => {
    const forward = cellsIn(lattice, { x: 5, y: 5 }, { x: 20, y: 15 });
    const backward = cellsIn(lattice, { x: 20, y: 15 }, { x: 5, y: 5 });
    expect(new Set(forward.map((c) => JSON.stringify(c)))).toEqual(
      new Set(backward.map((c) => JSON.stringify(c))),
    );
  });

  it('한 줄로만 끌면(가로나 세로 폭이 없으면) 칸이 없다', () => {
    expect(cellsIn(lattice, { x: 5, y: 5 }, { x: 20, y: 5 })).toEqual([]);
    expect(cellsIn(lattice, { x: 5, y: 5 }, { x: 5, y: 20 })).toEqual([]);
  });

  it('한 점이면 칸이 없다', () => {
    expect(cellsIn(lattice, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([]);
  });
});
