import type { Mm } from './units';

/**
 * 도트 격자.
 *
 * 이 프로그램의 바탕이다. 모든 작업이 이 격자 위에서 일어난다.
 *
 * 함수를 둘로 나눈 것이 이 파일의 요점이다.
 *
 *   gridLattice  격자점의 좌표. 화면에 뭐가 보이든 이 값은 변하지 않는다
 *   gridShapes   그중 무엇을 그릴지. 위 좌표에서 파생된다
 *
 * 표를 그릴 때 붙는 자리(스냅)는 언제나 gridLattice 쪽을 쓴다. 보이는 모양과
 * 붙는 자리를 분리해야 도트로 보든 줄노트로 보든 같은 위치에 그려진다.
 */

/** 같은 격자에서 그리는 방식만 바꾼다. 줄노트가 공짜로 딸려온다. */
export type GridStyle = 'dot' | 'grid' | 'horizontal' | 'vertical';

export interface DotGrid {
  style: GridStyle;
  /** 격자점 사이 간격 */
  spacing: Mm;
  /**
   * 타공 안전영역을 비워둘지.
   *
   * 구멍에 걸리는 도트를 지우는 게 아니라 격자가 놓일 영역 자체를 좁힌다.
   * 좁아진 영역 안에서 중앙 정렬과 여백 계산이 그대로 다시 일어난다.
   *
   * 타공 안내선을 화면에 보여줄지(punch.show)와는 무관하다. 안내선을 껐다고
   * 구멍이 없어지는 것은 아니다.
   */
  avoidSafeZone: boolean;
  /**
   * 화면에 보이기 · 인쇄물에 남기기.
   *
   * 둘을 따로 두는 것이 요점이다. 도트를 보면서 작업하고 인쇄할 땐 뺄 수도,
   * 반대로 화면을 깨끗이 비워두고 설정한 도트만 인쇄할 수도 있어야 한다.
   */
  showOnScreen: boolean;
  print: boolean;
}

export const DEFAULT_DOT_GRID: DotGrid = {
  style: 'dot',
  spacing: 5,
  // 시판 도트 속지는 대개 구멍 쪽까지 도트가 깔려 있다. 필요할 때만 켠다.
  avoidSafeZone: false,
  showOnScreen: true,
  print: true,
};

/** 격자가 놓일 영역. 속지 왼쪽 위 모서리가 원점 (0, 0). */
export interface Area {
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
}

export interface Lattice {
  /** 격자점의 가로 좌표들 */
  xs: Mm[];
  /** 격자점의 세로 좌표들 */
  ys: Mm[];
  /** 격자 바깥에 남는 여백. 입력값이 아니라 간격에서 계산된 결과다. */
  marginX: Mm;
  marginY: Mm;
}

/**
 * 격자 바깥에 최소한 남겨야 하는 여백.
 *
 * 속지 끝까지 격자를 채우면 바깥쪽 도트가 재단선 위에 앉아 반쯤 잘려나간다.
 * 실제 도트 속지는 전부 가장자리를 비워둔다.
 */
export const MIN_MARGIN: Mm = 3;

/**
 * 한 축의 격자점 좌표.
 *
 * 여백은 입력받지 않는다. 타공 여백과 같은 이유다 — 간격을 정하면 여백은
 * 저절로 결정되는 종속 변수다. 여백을 따로 받으면 둘이 서로 안 맞는 상황이 생긴다.
 *
 *   칸 개수 = floor((영역 − 최소여백 × 2) ÷ 간격)
 *   여백    = (영역 − 칸 개수 × 간격) ÷ 2
 *
 * 여백이 3mm 밑으로 안 내려가는 선에서 칸을 최대한 넣는다. 결과적으로 격자는
 * 영역 한가운데에 놓이고, 간격 3~7mm 구간에서는 여백이 3~5mm에 들어온다.
 */
function axis(start: Mm, size: Mm, spacing: Mm): { positions: Mm[]; margin: Mm } {
  if (spacing <= 0) return { positions: [], margin: size / 2 };

  const cells = Math.floor((size - MIN_MARGIN * 2) / spacing);

  // 칸이 하나도 안 나오면 격자가 아니다. 여기서 걸러내지 않으면 간격을 속지보다
  // 넓게 넣었을 때 한가운데에 점 한 줄만 찍히고 여백이 수십 mm로 벌어진다.
  if (cells < 1) return { positions: [], margin: size / 2 };

  const margin = (size - cells * spacing) / 2;

  // 칸이 n개면 격자점은 n + 1개다.
  const positions = Array.from({ length: cells + 1 }, (_, i) => start + margin + i * spacing);
  return { positions, margin };
}

/**
 * 격자점의 좌표.
 *
 * 스냅은 언제나 이 값을 쓴다. 화면에 도트로 보이든 줄노트로 보이든 상관없다.
 */
export function gridLattice(area: Area, spacing: Mm): Lattice {
  const x = axis(area.x, area.width, spacing);
  const y = axis(area.y, area.height, spacing);
  return { xs: x.positions, ys: y.positions, marginX: x.margin, marginY: y.margin };
}

export interface Dot {
  x: Mm;
  y: Mm;
}

/**
 * 어떤 점을 품고 있는 칸.
 *
 * 칸은 이웃한 격자점 네 개가 둘러싼 자리다. 글자 상자가 이 칸에 놓인다.
 * 격자 바깥을 찍으면 null이다 — 붙일 칸이 없다.
 */
export function cellAt(lattice: Lattice, x: Mm, y: Mm): Area | null {
  // 격자선 위를 정확히 찍으면 **거기서 시작하는 칸**으로 친다.
  // 마지막 점만은 시작할 칸이 없으므로 앞 칸에 붙인다.
  const span = (values: Mm[], v: Mm): [Mm, Mm] | null => {
    const last = values.length - 1;
    if (last < 1 || v < values[0] || v > values[last]) return null;
    if (v === values[last]) return [values[last - 1], values[last]];

    for (let i = 0; i < last; i++) {
      if (v >= values[i] && v < values[i + 1]) return [values[i], values[i + 1]];
    }
    return null;
  };

  const xs = span(lattice.xs, x);
  const ys = span(lattice.ys, y);
  if (!xs || !ys) return null;
  return { x: xs[0], y: ys[0], width: xs[1] - xs[0], height: ys[1] - ys[0] };
}

export interface Segment {
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
}

export interface GridShapes {
  dots: Dot[];
  lines: Segment[];
}

/**
 * 격자점에서 실제로 그릴 것을 뽑아낸다.
 *
 * 네 가지 모양이 전부 같은 격자에서 나온다. 간격을 그대로 두고 모양만 바꾸면
 * 도트속지가 그리드속지가 되고 줄노트가 된다.
 *
 * 선은 격자 끝에서 끝까지만 긋는다. 속지 끝까지 늘이면 여백이 무의미해진다.
 */
export function gridShapes(lattice: Lattice, style: GridStyle): GridShapes {
  const { xs, ys } = lattice;
  if (xs.length === 0 || ys.length === 0) return { dots: [], lines: [] };

  const left = xs[0];
  const right = xs[xs.length - 1];
  const top = ys[0];
  const bottom = ys[ys.length - 1];

  if (style === 'dot') {
    const dots: Dot[] = [];
    for (const y of ys) for (const x of xs) dots.push({ x, y });
    return { dots, lines: [] };
  }

  const lines: Segment[] = [];
  if (style === 'grid' || style === 'horizontal') {
    for (const y of ys) lines.push({ x1: left, y1: y, x2: right, y2: y });
  }
  if (style === 'grid' || style === 'vertical') {
    for (const x of xs) lines.push({ x1: x, y1: top, x2: x, y2: bottom });
  }
  return { dots: [], lines };
}

/**
 * 속지 안에서 격자가 놓일 영역.
 *
 * 화면·PDF·설정 패널 셋이 전부 이 함수를 부른다. 어디 하나가 다른 결론을 내면
 * 인쇄물만 틀어지고 화면으로는 알 수가 없다.
 *
 * 안전영역은 속지 왼쪽에 있다. 회전 배치라도 여기서는 신경 쓰지 않는다.
 * 이 좌표는 속지 기준이고, 칸으로 옮기는 일은 core/place가 한다.
 */
export function gridArea(
  insert: { width: Mm; height: Mm },
  grid: DotGrid,
  safeZoneWidth: Mm,
): Area {
  const avoid = grid.avoidSafeZone ? Math.max(0, safeZoneWidth) : 0;
  return { x: avoid, y: 0, width: insert.width - avoid, height: insert.height };
}
