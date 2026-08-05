import { describe, expect, it } from 'vitest';
import { DEFAULT_DOT_GRID, gridArea, gridLattice } from './grid';
import { moveDelta, snapToLattice } from './snap';

const m6 = { width: 80, height: 125 };
const lattice = gridLattice(gridArea(m6, DEFAULT_DOT_GRID, 10), 5);
// 5mm 간격, 여백 5mm → 가로 5,10,…,75 · 세로 5,10,…,120

describe('스냅', () => {
  it('격자점 위에서는 그 자리에 그대로 있다', () => {
    expect(snapToLattice(lattice, 25, 40)).toEqual({ x: 25, y: 40 });
  });

  it('가장 가까운 격자점으로 간다', () => {
    expect(snapToLattice(lattice, 26, 41)).toEqual({ x: 25, y: 40 });
    expect(snapToLattice(lattice, 29, 44)).toEqual({ x: 30, y: 45 });
  });

  it('정확히 가운데면 한쪽으로 정한다', () => {
    // 27.5는 25와 30의 한가운데다. 어느 쪽이든 좋지만 매번 같아야 한다.
    const a = snapToLattice(lattice, 27.5, 27.5);
    const b = snapToLattice(lattice, 27.5, 27.5);
    expect(a).toEqual(b);
  });

  it('격자 바깥에서도 가장 가까운 점으로 끌려온다', () => {
    // 속지 가장자리를 클릭해도 격자 안으로 들어온다. 문턱값이 없다.
    expect(snapToLattice(lattice, 0, 0)).toEqual({ x: 5, y: 5 });
    expect(snapToLattice(lattice, 80, 125)).toEqual({ x: 75, y: 120 });
    expect(snapToLattice(lattice, -50, 999)).toEqual({ x: 5, y: 120 });
  });

  it('격자가 없으면 붙을 자리도 없다', () => {
    const empty = gridLattice(gridArea(m6, DEFAULT_DOT_GRID, 10), 0);
    expect(snapToLattice(empty, 10, 10)).toBeNull();
  });

  it('모양을 바꿔도 붙는 자리는 같다', () => {
    // 이게 핵심이다. 줄노트로 보고 있어도 도트 자리에 붙는다.
    const asDots = gridLattice(gridArea(m6, DEFAULT_DOT_GRID, 10), 5);
    const asRuled = gridLattice(
      gridArea(m6, { ...DEFAULT_DOT_GRID, style: 'horizontal' }, 10),
      5,
    );
    expect(snapToLattice(asRuled, 26, 41)).toEqual(snapToLattice(asDots, 26, 41));
  });

  it('안전영역을 비우면 그 안으로는 붙지 않는다', () => {
    const avoided = gridLattice(
      gridArea(m6, { ...DEFAULT_DOT_GRID, avoidSafeZone: true }, 10),
      5,
    );
    // 왼쪽 끝을 찍어도 안전영역(10mm) 바깥인 15mm로 간다.
    expect(snapToLattice(avoided, 0, 40)!.x).toBe(15);
  });
});

describe('끌어서 옮긴 거리', () => {
  const from = { x: 20, y: 40 };
  // 위 lattice와 같은 격자 — 첫 점 5mm, 간격 5mm
  const grid = { x0: 5, y0: 5, spacing: 5 };
  /** 격자 위에 얌전히 놓인 것 */
  const onGrid = { x: 20, y: 40 };
  /** ⌘로 한 번 밀어내서 1.3mm 어긋난 것 */
  const offGrid = { x: 21.3, y: 41.3 };

  const drag = (dx: number, dy: number) => ({ x: from.x + dx, y: from.y + dy });

  it('가장 가까운 칸 수만큼 옮긴다', () => {
    // 5mm 격자에서 13.2mm를 끌면 세 칸(15mm)이 가장 가깝다.
    expect(moveDelta(from, drag(13.2, 0), onGrid, grid)).toEqual({ dx: 15, dy: 0 });
    expect(moveDelta(from, drag(0, 12.4), onGrid, grid)).toEqual({ dx: 0, dy: 10 });
  });

  it('반 칸을 못 넘으면 제자리다', () => {
    expect(moveDelta(from, drag(2.4, 2.4), onGrid, grid)).toEqual({ dx: 0, dy: 0 });
  });

  it('반대쪽으로도 칸 단위다', () => {
    expect(moveDelta(from, drag(-12, -13), onGrid, grid)).toEqual({ dx: -10, dy: -15 });
  });

  it('격자를 풀면 끈 만큼 그대로 간다', () => {
    // 칸과 칸 사이에 놓고 싶을 때. ⌘를 누른 채 끄는 경우다.
    expect(moveDelta(from, drag(3.2, 1.7), onGrid, null)).toEqual({ dx: 3.2, dy: 1.7 });
  });

  it('격자를 풀어도 0.01mm로는 정리한다', () => {
    // 부동소수점 꼬리가 그대로 저장 파일에 들어가면 사람이 읽을 수 없다.
    expect(moveDelta({ x: 0.1, y: 0 }, { x: 0.3, y: 0 }, onGrid, null).dx).toBe(0.2);
  });

  it('격자를 벗어나 있던 것은 다시 칸에 붙는다', () => {
    // 이 함수가 이렇게 생긴 이유다. 이동량만 반올림하면 1.3mm 어긋난 것은
    // 몇 번을 옮겨도 1.3mm 어긋난 채로 따라다녔다.
    const { dx, dy } = moveDelta(from, drag(13.2, 13.2), offGrid, grid);
    expect(offGrid.x + dx).toBe(35);
    expect(offGrid.y + dy).toBe(55);
  });

  it('⌘로 밀어냈다가 ⌘ 없이 옮기면 제자리를 찾는다', () => {
    // 사용자가 실제로 하는 순서 그대로.
    const free = moveDelta(from, drag(3.2, 0), onGrid, null);
    const pushed = { x: onGrid.x + free.dx, y: onGrid.y + free.dy };
    expect(pushed.x).toBe(23.2); // 격자 밖

    const back = moveDelta(from, drag(6.8, 0), pushed, grid);
    expect(pushed.x + back.dx).toBe(30); // 다시 격자 위
  });

  it('한 칸도 못 미치게 끌어도 격자로는 돌아온다', () => {
    // 어긋난 것을 살짝만 끌면 가장 가까운 칸으로 붙는다.
    const { dx } = moveDelta(from, drag(0.4, 0), offGrid, grid);
    expect(offGrid.x + dx).toBe(20);
  });

  it('이미 격자 위면 이동량을 반올림하던 예전과 결과가 같다', () => {
    // 돌아갈 어긋남이 0이라 도착지를 맞추든 이동량을 맞추든 같은 값이 나온다.
    for (const d of [0.4, 2.6, 7.5, -3.1, -11]) {
      const step = Math.round(d / 5) * 5;
      expect(moveDelta(from, drag(d, 0), onGrid, grid).dx).toBe(step);
    }
  });

  it('격자점 목록 바깥으로도 나갈 수 있다', () => {
    // 목록은 여백 앞(75mm)에서 끝나지만 위상은 그 너머로도 이어진다.
    // 목록에 맞춰버리면 여백 쪽으로 밀어내기가 막힌다.
    expect(75 + moveDelta(from, drag(10, 0), { x: 75, y: 40 }, grid).dx).toBe(85);
  });

  it('격자가 없으면 끈 만큼 간다', () => {
    expect(moveDelta(from, drag(3.4, 0), onGrid, { ...grid, spacing: 0 }).dx).toBe(3.4);
  });
});
