import type { Lattice } from './grid';
import { roundMm, type Mm } from './units';

/**
 * 스냅 — 마우스 위치를 격자점으로 끌어당긴다.
 *
 * **문턱값이 없다. 언제나 가장 가까운 격자점으로 간다.**
 * 이 프로그램의 모든 작업은 도트 위에서 일어나므로, 도트를 벗어난 자리에는
 * 아예 그을 수 없게 하는 편이 규칙이 하나뿐이라 헷갈리지 않는다.
 *
 * 붙는 자리는 화면에 보이는 모양과 무관하다. 도트로 보든 줄노트로 보든
 * 같은 격자점을 쓴다. 그래서 core/grid가 gridLattice를 따로 내놓는다.
 */

/** 값 목록에서 target에 가장 가까운 것. 목록은 오름차순이라고 가정한다. */
function nearest(values: Mm[], target: Mm): Mm | null {
  if (values.length === 0) return null;

  let best = values[0];
  let bestGap = Math.abs(target - best);
  for (const v of values) {
    const gap = Math.abs(target - v);
    // 더 멀어지기 시작하면 그 앞이 답이다. 목록이 정렬돼 있으므로 여기서 끝낸다.
    if (gap > bestGap) break;
    best = v;
    bestGap = gap;
  }
  return best;
}

/**
 * 가장 가까운 격자점.
 *
 * 격자가 직사각형이라 가로·세로를 따로 골라도 가장 가까운 점이 나온다.
 * 격자가 없으면(간격이 속지보다 넓거나 0이면) null이다.
 */
export function snapToLattice(
  lattice: Lattice,
  x: Mm,
  y: Mm,
): { x: Mm; y: Mm } | null {
  const sx = nearest(lattice.xs, x);
  const sy = nearest(lattice.ys, y);
  if (sx === null || sy === null) return null;
  return { x: sx, y: sy };
}

/**
 * 격자의 위상 — 첫 점과 간격.
 *
 * 격자점 **목록**(Lattice)이 아니라 이 둘로 판단한다. 목록은 여백 앞에서 끝나는데,
 * 그 끝에 맞춰버리면 지금 가능한 "여백 쪽으로 밀어내기"가 막힌다. 위상만 쓰면
 * 목록 바깥으로 나가도 같은 간격으로 이어진다.
 */
export interface GridPhase {
  x0: Mm;
  y0: Mm;
  spacing: Mm;
}

/** 격자 위상에 맞춘 값. 목록의 범위를 벗어나도 같은 간격으로 이어진다. */
function toPhase(v: Mm, origin: Mm, spacing: Mm): Mm {
  return origin + Math.round((v - origin) / spacing) * spacing;
}

/**
 * 끌어서 옮긴 거리.
 *
 * **고른 것 전체가 이 거리만큼 함께 움직인다.** 객체를 하나씩 다시 스냅하지 않으므로
 * 선의 길이와 각도가 한 치도 변하지 않고, 여러 개를 함께 끌어도 서로의 간격이
 * 무너지지 않는다.
 *
 * 격자에 맞추는 방식이 요점이다. **이동량이 아니라 `anchor`가 도착할 자리를 맞춘다.**
 * 이동량만 칸 단위로 반올림하면, 한 번 격자를 벗어난 것은 어긋난 만큼을 영원히
 * 달고 다닌다 — 몇 번을 옮겨도 칸에 돌아오지 못한다. 도착지를 맞추면 ⌘ 없이 한 번
 * 끄는 것만으로 제자리를 찾는다. anchor가 이미 격자 위라면 돌아갈 어긋남이 0이라
 * 이동량을 반올림하던 예전과 결과가 정확히 같다.
 *
 * `grid`가 `null`이면 격자를 푼 것이다(⌘를 누른 채 끄는 중). 끈 만큼 그대로 가되
 * 0.01mm로는 정리한다 — 부동소수점 꼬리가 그대로 저장 파일에 들어가면 사람이 읽을
 * 수 없고, 0.01mm는 어떤 프린터도 구별하지 못하는 크기라 잃는 것이 없다.
 */
export function moveDelta(
  from: { x: Mm; y: Mm },
  to: { x: Mm; y: Mm },
  anchor: { x: Mm; y: Mm },
  grid: GridPhase | null,
): { dx: Mm; dy: Mm } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!grid || grid.spacing <= 0) return { dx: roundMm(dx), dy: roundMm(dy) };

  return {
    dx: roundMm(toPhase(anchor.x + dx, grid.x0, grid.spacing) - anchor.x),
    dy: roundMm(toPhase(anchor.y + dy, grid.y0, grid.spacing) - anchor.y),
  };
}
