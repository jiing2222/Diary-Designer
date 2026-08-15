import type { Layout, Slot } from './layout';
import type { Mm } from './units';
import { CROP_MARK_GAP, CROP_MARK_LENGTH } from './style';

/**
 * 절취선 좌표 계산.
 *
 * 화면과 PDF가 각자 계산하면 언젠가 어긋난다. 좌표는 여기서 한 번만 내고,
 * 그리는 일만 각자 한다.
 */

/**
 * mark    바깥 테두리에만 표시. 안쪽 교차점은 뺀다
 * markAll 안쪽 교차점까지 전부. 프린터가 용지 가장자리를 못 찍어
 *         바깥 표시가 사라질 때 쓴다
 */
export type CropMode = 'none' | 'mark' | 'markAll' | 'line';

export interface Segment {
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
}

/** mm 단위에서 같은 자리로 볼 오차 */
const EPS: Mm = 0.001;
const near = (a: Mm, b: Mm) => Math.abs(a - b) < EPS;

/** 슬롯 경계를 모아 중복을 없앤 재단선 좌표 */
function edges(layout: Layout) {
  const xs = new Set<Mm>();
  const ys = new Set<Mm>();
  for (const s of layout.slots) {
    xs.add(s.x);
    xs.add(s.x + s.width);
    ys.add(s.y);
    ys.add(s.y + s.height);
  }
  const asc = (a: Mm, b: Mm) => a - b;
  return { xs: [...xs].sort(asc), ys: [...ys].sort(asc) };
}

/** 네 방향 — 가로 두 방향은 y를 고정하고 x로, 세로 두 방향은 x를 고정하고 y로 움직인다. */
const DIRECTIONS: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }[] = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

/**
 * (x, y)에서 (dx, dy) 방향으로 곧장 나아갈 때, 어느 속지의 내용과도 안
 * 겹치고 갈 수 있는 최대 거리. 막는 속지가 없으면(그 방향이 열려 있으면)
 * `Infinity`다.
 *
 * 가로 방향이면 그 y가 속지의 세로 범위 안에 있는 속지만, 세로 방향이면
 * 그 x가 가로 범위 안에 있는 속지만 살핀다 — 축이 다른 속지는애초에 이
 * 직선과 마주칠 일이 없다.
 */
function openDistance(x: Mm, y: Mm, dx: -1 | 0 | 1, dy: -1 | 0 | 1, slots: Slot[]): Mm {
  let best = Infinity;
  for (const s of slots) {
    if (dx !== 0) {
      if (y < s.y - EPS || y > s.y + s.height + EPS) continue;
      if (dx > 0 && s.x >= x - EPS) best = Math.min(best, s.x - x);
      if (dx < 0 && s.x + s.width <= x + EPS) best = Math.min(best, x - (s.x + s.width));
    } else {
      if (x < s.x - EPS || x > s.x + s.width + EPS) continue;
      if (dy > 0 && s.y >= y - EPS) best = Math.min(best, s.y - y);
      if (dy < 0 && s.y + s.height <= y + EPS) best = Math.min(best, y - (s.y + s.height));
    }
  }
  return best;
}

export function cropSegments(
  layout: Layout,
  paperWidth: Mm,
  paperHeight: Mm,
  mode: CropMode,
): Segment[] {
  if (mode === 'none' || layout.slots.length === 0) return [];

  const { xs, ys } = edges(layout);
  const top = ys[0];
  const bottom = ys[ys.length - 1];
  const left = xs[0];
  const right = xs[xs.length - 1];

  if (mode === 'line') {
    return [
      ...xs.map((x) => ({ x1: x, y1: top, x2: x, y2: bottom })),
      ...ys.map((y) => ({ x1: left, y1: y, x2: right, y2: y })),
    ];
  }

  // 표시. 재단선이 만나는 자리에 놓되, 다음 둘은 건너뛴다.
  //
  // 하나. 배치 덩어리 안쪽에 갇힌 교차점. 재단선 하나를 자르려면 양 끝의 표시
  // 두 개면 충분하고, 중간 표시는 속지 위에 자국만 남긴다. 어차피 한 번에
  // 끝까지 자르므로 가운데는 저절로 잘린다.
  //
  // 다만 프린터가 용지 가장자리를 못 찍으면 그 양 끝 표시가 통째로 사라진다.
  // 속지가 작아 칸이 많을수록 심하다. 그럴 때 쓰라고 markAll을 열어둔다.
  //
  // 둘. 용지 끝에 딱 붙은 자리. 거기는 이미 종이 끝이라 자를 것이 없다.
  // A4를 반으로 잘라 A5 두 장을 만들 때 가운데 한 줄만 남는 이유가 이것이다.
  // 이쪽은 markAll에서도 뺀다. 잘라낼 것이 없다는 사실은 변하지 않는다.
  //
  // 용지 밖으로 뻗은 것은 화면(viewBox)과 PDF(페이지 경계)가 알아서 잘라낸다.
  const keepInner = mode === 'markAll';
  const onPaperEdge = (v: Mm, size: Mm) => near(v, 0) || near(v, size);
  const onBlockEdge = (v: Mm, lo: Mm, hi: Mm) => near(v, lo) || near(v, hi);

  const out: Segment[] = [];
  for (const x of xs) {
    for (const y of ys) {
      if (!keepInner && !onBlockEdge(x, left, right) && !onBlockEdge(y, top, bottom)) continue;
      if (onPaperEdge(x, paperWidth) && onPaperEdge(y, paperHeight)) continue;

      // 네 방향 중 속지 내용이 없는 쪽으로만, 모서리에서 GAP만큼 떨어져
      // LENGTH만큼 짧게 긋는다 — 모서리에 바로 붙이지 않아야 자르고 난 뒤
      // 속지 위에 자국이 안 남는다. 반대쪽에서도 같은 자리를 향해 표시가
      // 나올 수 있으니(마주보는 두 속지 사이) 열린 거리의 절반까지만
      // 뻗는다 — 그래야 두 표시가 서로 넘어가 하나로 이어져 보이지 않는다.
      for (const { dx, dy } of DIRECTIONS) {
        const half = openDistance(x, y, dx, dy, layout.slots) / 2;
        if (half <= CROP_MARK_GAP) continue; // 간격조차 못 낼 만큼 좁으면 아무것도 안 그린다
        const length = Math.min(CROP_MARK_LENGTH, half - CROP_MARK_GAP);
        const from = CROP_MARK_GAP;
        const to = CROP_MARK_GAP + length;
        if (dx !== 0) out.push({ x1: x + dx * from, y1: y, x2: x + dx * to, y2: y });
        else out.push({ x1: x, y1: y + dy * from, x2: x, y2: y + dy * to });
      }
    }
  }
  return out;
}
