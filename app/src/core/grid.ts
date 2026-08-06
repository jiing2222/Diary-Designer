import type { Dash } from './objects';
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
   * 격자 바깥에 **최소한** 남길 여백.
   *
   * 여백을 직접 지정하는 값이 아니다. 여백은 여전히 간격에서 따라 나오는 종속
   * 변수이고(axis 함수 참고), 이것은 그 계산의 **하한**일 뿐이다. 여백을 정확한
   * 값으로 받으면 간격과 서로 맞지 않는 상황이 생긴다.
   *
   * 0으로 두면 여백이 최소가 된다. 다만 **정확히 0이 되지는 않는다** — 나누어
   * 떨어지지 않고 남는 만큼은 좌우에 반씩 남는다. 80mm에 5mm 간격이면 딱 0이지만
   * 6mm 간격이면 1mm가 남는다.
   *
   * 0에 가까울수록 바깥쪽 도트·선이 재단선에 붙어 자를 때 반쯤 날아갈 수 있다.
   * 그래도 막지는 않는다 — 어디까지 감수할지는 뽑아보고 정할 일이다.
   */
  minMargin: Mm;
  /**
   * 여백 없이 **영역 끝까지** 채우기. 네 모서리의 칸이 잘린다.
   *
   * 기본은 양끝에 여백을 남기고 온전한 칸으로만 격자를 만든다. 이것을 켜면
   * 여백의 하한이 0이 되어 칸을 최대한 넣고, 선을 영역 끝까지 긋는다.
   *
   * **가운데 정렬은 그대로다.** 그래서 나누어떨어지지 않고 남는 만큼이 양끝에
   * 반씩 붙고, 위아래·좌우 네 군데가 모두 잘린 칸이 된다. 한쪽 모서리에서
   * 시작해 반대쪽만 잘리게 하면 격자가 한쪽으로 쏠려 보인다.
   *
   *   80mm · 5mm 간격 → 0, 5, …, 80        딱 떨어져 잘린 칸이 없다
   *   80mm · 6mm 간격 → 1, 7, …, 79        양끝 1mm씩이 잘린 칸
   *
   * **여백(minMargin)은 이때 쓰이지 않는다.** 여백을 없애는 것이 목적이라
   * 하한을 둘 이유가 없다.
   *
   * 격자점 좌표가 실제로 달라지므로 붙는 자리도 함께 옮겨간다. 간격을 바꾸는
   * 것과 같은 종류의 설정이다 — 이미 그려둔 것의 좌표는 건드리지 않는다.
   */
  toEdge: boolean;
  /**
   * 격자선의 모양. 도트에는 쓰이지 않는다.
   *
   * 그은 선과 같은 세 가지이고, 점선 간격도 같은 `core/line`에서 나온다.
   * 화면과 인쇄의 선 굵기가 달라서 비율만 공유하고 실제 길이는 각자 계산한다.
   */
  dash: Dash;
  /**
   * 화면에 보이기 · 인쇄물에 남기기.
   *
   * 둘을 따로 두는 것이 요점이다. 도트를 보면서 작업하고 인쇄할 땐 뺄 수도,
   * 반대로 화면을 깨끗이 비워두고 설정한 도트만 인쇄할 수도 있어야 한다.
   */
  showOnScreen: boolean;
  print: boolean;
}

/**
 * 격자 바깥에 최소한 남겨야 하는 여백의 **기본값**.
 *
 * 속지 끝까지 격자를 채우면 바깥쪽 도트가 재단선 위에 앉아 반쯤 잘려나간다.
 * 실제 도트 속지는 전부 가장자리를 비워둔다.
 *
 * 설정에서 바꿀 수 있다(DotGrid.minMargin). 0까지 내릴 수 있지만 그때는 자를 때
 * 바깥쪽이 날아갈 각오를 해야 한다.
 */
export const DEFAULT_MIN_MARGIN: Mm = 3;

export const DEFAULT_DOT_GRID: DotGrid = {
  style: 'dot',
  spacing: 5,
  // 시판 도트 속지는 대개 구멍 쪽까지 도트가 깔려 있다. 필요할 때만 켠다.
  avoidSafeZone: false,
  minMargin: DEFAULT_MIN_MARGIN,
  toEdge: false,
  dash: 'solid',
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
  /**
   * **온전한** 칸 수.
   *
   * `xs.length - 1`로 세면 안 된다. 끝까지 채울 때 가장자리에 붙는 잘린 띠도
   * 격자점 사이이긴 하지만 칸이 아니다 — 간격보다 좁아서 거기에 무언가를
   * 앉힐 수 없다. 화면에 `14 × 23칸`이라고 적는 것은 이 값이다.
   */
  cols: number;
  rows: number;
  /**
   * 가장자리에 **붙을 자리만** 덧붙였는가.
   *
   * 끝까지 채울 때 영역 끝까지 그을 수 있도록 넣은 자리다. 격자의 일부가 아니라
   * 그리기를 돕는 안내라서, **인쇄에는 도트를 찍지 않는다** — 재단선 위에 반쯤
   * 잘린 도트가 남으면 격자가 어긋나 보인다. 화면에서는 보여야 어디에 붙는지 안다.
   */
  padded: boolean;
}

/**
 * 한 축의 격자점 좌표.
 *
 * **여백은 직접 입력받지 않는다.** 타공 여백과 같은 이유다 — 간격을 정하면 여백은
 * 저절로 결정되는 종속 변수다. 여백을 값으로 받으면 둘이 서로 안 맞는 상황이 생긴다.
 * 설정에서 받는 `minMargin`은 여백 자체가 아니라 이 계산의 **하한**이다.
 *
 *   칸 개수 = floor((영역 − 최소여백 × 2) ÷ 간격)
 *   여백    = (영역 − 칸 개수 × 간격) ÷ 2
 *
 * 최소여백 밑으로 안 내려가는 선에서 칸을 최대한 넣는다. 결과적으로 격자는
 * 영역 한가운데에 놓이고, 실제 여백은 `최소여백 ≤ 여백 < 최소여백 + 간격/2`다.
 * 기본값 3mm에 간격 3~7mm면 여백이 3~5mm에 들어온다.
 */
function axis(
  start: Mm,
  size: Mm,
  spacing: Mm,
  minMargin: Mm,
  toEdge: boolean,
): { positions: Mm[]; margin: Mm; cells: number; padded: boolean } {
  if (spacing <= 0) return { positions: [], margin: size / 2, cells: 0, padded: false };

  // 음수 여백은 격자를 영역 밖으로 밀어낸다. 0이 하한이다.
  const cells = Math.floor((size - Math.max(0, minMargin) * 2) / spacing);

  // 칸이 하나도 안 나오면 격자가 아니다. 여기서 걸러내지 않으면 간격을 속지보다
  // 넓게 넣었을 때 한가운데에 점 한 줄만 찍히고 여백이 수십 mm로 벌어진다.
  if (cells < 1) return { positions: [], margin: size / 2, cells: 0, padded: false };

  const margin = (size - cells * spacing) / 2;

  // 칸이 n개면 격자점은 n + 1개다.
  const positions = Array.from({ length: cells + 1 }, (_, i) => start + margin + i * spacing);

  /*
   * 끝까지 채울 때는 **영역 가장자리도 붙을 자리로 넣는다.**
   *
   * 격자선은 이미 영역 끝까지 그어지는데(gridShapes) 붙을 자리가 안쪽에서
   * 끝나면, 테두리를 그으려 해도 양끝이 여백만큼 못 미친다. 끝까지 채우겠다는
   * 뜻은 거기에 그릴 수 있다는 뜻이다.
   *
   * 나누어떨어지면 이미 가장자리에 점이 있으므로 아무것도 늘지 않는다.
   * 늘어난 자리는 **칸으로 세지 않는다** — 간격보다 좁아 무언가를 앉힐 수 없다.
   */
  const padded = toEdge && margin > 0;
  if (padded) {
    positions.unshift(start);
    positions.push(start + size);
  }

  return { positions, margin, cells, padded };
}

/**
 * 격자점의 좌표.
 *
 * 스냅은 언제나 이 값을 쓴다. 화면에 도트로 보이든 줄노트로 보이든 상관없다.
 */
export function gridLattice(
  area: Area,
  spacing: Mm,
  minMargin: Mm = DEFAULT_MIN_MARGIN,
  toEdge = false,
): Lattice {
  // 끝까지 채우기는 **여백의 하한을 0으로 두는 것**과 같은 계산이다. 가운데
  // 정렬은 그대로 두므로 나누어떨어지지 않고 남는 만큼이 양끝에 반씩 붙고,
  // 그 자리가 네 모서리의 잘린 칸이 된다. 선을 영역 끝까지 긋는 일은
  // gridShapes가 맡는다 — 여기서는 좌표만 정한다.
  const margin = toEdge ? 0 : minMargin;
  const x = axis(area.x, area.width, spacing, margin, toEdge);
  const y = axis(area.y, area.height, spacing, margin, toEdge);
  return {
    xs: x.positions,
    ys: y.positions,
    marginX: x.margin,
    marginY: y.margin,
    cols: x.cells,
    rows: y.cells,
    padded: x.padded || y.padded,
  };
}

/**
 * 칸을 몇 개 넣으려면 간격이 얼마여야 하는가.
 *
 * 간격을 직접 정하는 대신 `가로 10칸`처럼 세어서 만들고 싶을 때 쓴다.
 * 딱 나누어떨어지는 값을 돌려주므로 잘리는 칸이 생기지 않는다.
 *
 * **간격은 가로·세로가 하나뿐이다.** 그래서 한 축의 칸 수를 정하면 다른 축의
 * 칸 수는 거기서 따라 나온다. 둘 다 마음대로 정할 수는 없다 — 칸이 정사각형이
 * 아니게 되고, 그러면 도트 격자라고 부를 수 없다.
 */
export function spacingForCells(size: Mm, cells: number, minMargin: Mm): Mm {
  if (cells < 1) return 0;
  return Math.max(0, size - Math.max(0, minMargin) * 2) / cells;
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
 * 선은 기본적으로 **격자 끝에서 끝까지만** 긋는다. 속지 끝까지 늘이면 여백이
 * 무의미해지기 때문이다. `edges`를 주면 그 영역 끝까지 늘인다 — 줄노트처럼 선이
 * 종이 끝까지 이어지길 원할 때다.
 *
 * **어느 쪽이든 격자점 좌표는 변하지 않는다.** 늘어나는 것은 보이는 선뿐이라
 * 붙는 자리(스냅)와 도트 모양에는 아무 영향이 없다.
 */
export function gridShapes(
  lattice: Lattice,
  style: GridStyle,
  edges?: Area | null,
  /**
   * 인쇄용인가.
   *
   * 가장자리에 덧붙인 자리(`padded`)는 그리기를 돕는 안내일 뿐이라 **도트를
   * 찍지 않는다.** 재단선 위에 반쯤 잘린 도트가 남으면 격자가 어긋나 보인다.
   * 선은 그대로 긋는다 — 잘린 칸을 종이 끝에서 닫아주는 것이 그 선이다.
   */
  forPrint = false,
): GridShapes {
  const { xs, ys } = lattice;
  if (xs.length === 0 || ys.length === 0) return { dots: [], lines: [] };

  const left = edges ? edges.x : xs[0];
  const right = edges ? edges.x + edges.width : xs[xs.length - 1];
  const top = edges ? edges.y : ys[0];
  const bottom = edges ? edges.y + edges.height : ys[ys.length - 1];

  if (style === 'dot') {
    const trim = forPrint && lattice.padded;
    const dx = trim ? xs.slice(1, -1) : xs;
    const dy = trim ? ys.slice(1, -1) : ys;
    const dots: Dot[] = [];
    for (const y of dy) for (const x of dx) dots.push({ x, y });
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

/** `values`에서 `p1`·`p2` 사이(양끝 포함)에 있는 것만, 오름차순으로. */
function between(values: Mm[], p1: Mm, p2: Mm): Mm[] {
  const lo = Math.min(p1, p2);
  const hi = Math.max(p1, p2);
  return values.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
}

/**
 * 표 — 두 점 사이의 격자점을 전부 잇는 선들.
 *
 * "면 그리기"(core/objects의 `rectLines`)는 테두리 4개만 낸다. 표는 그 사이의
 * 모든 가로·세로 선까지 채운다 — 드래그한 범위가 몇 칸이든 안쪽 칸 선까지 전부
 * 생긴다. 도구가 다르면 결과가 다르다는 것이 이 프로그램의 원칙이다.
 *
 * **격자점은 `lattice.xs`·`ys`에서 그대로 가져온다.** 간격으로 다시 계산하지
 * 않는다 — 안전영역을 피해 격자가 밀려 있거나, 끝까지 채우기로 가장자리가
 * 덧붙었어도, 실제로 존재하는 격자점 사이에만 선이 생겨야 한다.
 *
 * 한 줄로 끌면(가로나 세로가 한 칸도 안 되면) 그 줄 하나만 나온다 —
 * `rectLines`와 같은 규칙이다. 한 점이면 그을 것이 없다.
 */
export function tableLines(lattice: Lattice, a: Dot, b: Dot): Segment[] {
  const xs = between(lattice.xs, a.x, b.x);
  const ys = between(lattice.ys, a.y, b.y);
  if (xs.length === 0 || ys.length === 0) return [];

  const flat = xs.length === 1; // 세로로만 폈다 — 가로 폭이 없다
  const thin = ys.length === 1; // 가로로만 폈다 — 세로 높이가 없다
  if (flat && thin) return []; // 한 점 — 그을 것이 없다

  const left = xs[0];
  const right = xs[xs.length - 1];
  const top = ys[0];
  const bottom = ys[ys.length - 1];

  if (flat) return [{ x1: left, y1: top, x2: left, y2: bottom }];
  if (thin) return [{ x1: left, y1: top, x2: right, y2: top }];

  const lines: Segment[] = [];
  for (const y of ys) lines.push({ x1: left, y1: y, x2: right, y2: y });
  for (const x of xs) lines.push({ x1: x, y1: top, x2: x, y2: bottom });
  return lines;
}
