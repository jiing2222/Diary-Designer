import type { Lattice } from './grid';
import type { Mm } from './units';

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
