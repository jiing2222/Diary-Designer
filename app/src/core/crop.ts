import type { Layout } from './layout';
import type { Mm } from './units';
import { CROP_ARM } from './style';

/**
 * 절취선 좌표 계산.
 *
 * 화면과 PDF가 각자 계산하면 언젠가 어긋난다. 좌표는 여기서 한 번만 내고,
 * 그리는 일만 각자 한다.
 */

/**
 * mark    바깥 테두리에만 십자. 안쪽 교차점은 뺀다
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

  // 십자 마크. 재단선이 만나는 자리에 놓되, 다음 둘은 건너뛴다.
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
  // 용지 밖으로 뻗은 팔은 화면(viewBox)과 PDF(페이지 경계)가 알아서 잘라낸다.
  const armX = armLengths(xs);
  const armY = armLengths(ys);
  const keepInner = mode === 'markAll';
  const onPaperEdge = (v: Mm, size: Mm) => near(v, 0) || near(v, size);
  const onBlockEdge = (v: Mm, lo: Mm, hi: Mm) => near(v, lo) || near(v, hi);

  const out: Segment[] = [];
  xs.forEach((x, xi) => {
    ys.forEach((y, yi) => {
      if (!keepInner && !onBlockEdge(x, left, right) && !onBlockEdge(y, top, bottom)) return;
      if (onPaperEdge(x, paperWidth) && onPaperEdge(y, paperHeight)) return;
      out.push({ x1: x - armX[xi], y1: y, x2: x + armX[xi], y2: y });
      out.push({ x1: x, y1: y - armY[yi], x2: x, y2: y + armY[yi] });
    });
  });
  return out;
}

/**
 * 각 좌표에서 십자 팔이 뻗을 수 있는 최대 길이.
 *
 * 옆 좌표까지 거리의 절반보다 길게 뻗으면, 칸 사이 간격이 좁을 때(기본
 * 3mm 팔에 간격이 6mm보다 좁으면) 옆 표시의 팔과 맞닿거나 겹친다 — 자를
 * 부분(간격)에 끊기지 않는 선 하나가 남아, 표시 두 개가 아니라 마치
 * 재단선 하나가 그어진 것처럼 보인다. 십자 마크를 쓰는 이유(속지 위에
 * 자국을 남기지 않는 것) 자체가 무색해진다.
 */
function armLengths(coords: Mm[]): Mm[] {
  return coords.map((v, i) => {
    let arm = CROP_ARM;
    if (i > 0) arm = Math.min(arm, (v - coords[i - 1]) / 2);
    if (i < coords.length - 1) arm = Math.min(arm, (coords[i + 1] - v) / 2);
    return arm;
  });
}
