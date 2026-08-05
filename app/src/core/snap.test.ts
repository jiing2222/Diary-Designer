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

  it('가장 가까운 칸 수만큼 옮긴다', () => {
    // 5mm 격자에서 13.2mm를 끌면 세 칸(15mm)이 가장 가깝다.
    expect(moveDelta(from, { x: 33.2, y: 40 }, 5)).toEqual({ dx: 15, dy: 0 });
    expect(moveDelta(from, { x: 20, y: 52.4 }, 5)).toEqual({ dx: 0, dy: 10 });
  });

  it('반 칸을 못 넘으면 제자리다', () => {
    expect(moveDelta(from, { x: 22.4, y: 42.4 }, 5)).toEqual({ dx: 0, dy: 0 });
  });

  it('반대쪽으로도 칸 단위다', () => {
    expect(moveDelta(from, { x: 8, y: 27 }, 5)).toEqual({ dx: -10, dy: -15 });
  });

  it('격자를 풀면 끈 만큼 그대로 간다', () => {
    // 칸과 칸 사이에 놓고 싶을 때. ⌘를 누른 채 끄는 경우다.
    expect(moveDelta(from, { x: 23.2, y: 41.7 }, 5, true)).toEqual({ dx: 3.2, dy: 1.7 });
  });

  it('격자를 풀어도 0.01mm로는 정리한다', () => {
    // 부동소수점 꼬리가 저장 파일에 그대로 들어가면 사람이 읽을 수 없다.
    const { dx } = moveDelta({ x: 0.1, y: 0 }, { x: 0.3, y: 0 }, 5, true);
    expect(dx).toBe(0.2);
  });

  it('격자 간격이 0이면 1mm 단위로 물러난다', () => {
    expect(moveDelta(from, { x: 23.4, y: 40 }, 0)).toEqual({ dx: 3, dy: 0 });
  });

  it('이동량만 맞추므로 원래 자리가 격자 밖이어도 상대적인 자리를 지킨다', () => {
    // 격자 위가 아닌 22.3에서 시작해도, 옮긴 거리는 여전히 칸 단위다.
    // 객체를 다시 스냅하면 여기서 22.3이 20으로 끌려가 모양이 무너진다.
    expect(moveDelta({ x: 22.3, y: 41.1 }, { x: 32.3, y: 41.1 }, 5)).toEqual({ dx: 10, dy: 0 });
  });
});
