import type { Dash, ShapeObject } from './objects';
import { OBJECT_LINE_COLOR, OBJECT_LINE_WIDTH, SHAPE_FILL_OPACITY } from './style';
import type { Mm } from './units';

/**
 * 도형(사각형·타원)을 어떻게 그릴지.
 *
 * core/line과 같은 이유로 여기 모은다 — 화면(SVG `<path>`)과 PDF(pdf-lib의
 * `drawSvgPath`)가 그리는 방법은 다르지만, 둥근 정도와 테두리는 하나의
 * 계산이어야 한다.
 */

/** 테두리만 있는 것들의 공통 모양 — 도형·체크박스가 함께 쓴다. */
interface Stroked {
  strokeWidth?: Mm;
  color?: string;
  dash?: Dash;
}

/** 테두리 굵기. 정하지 않았으면 기본값(선과 같다). */
export function strokeWidthOf(o: Stroked): Mm {
  return o.strokeWidth ?? OBJECT_LINE_WIDTH;
}

/** 테두리 색. 정하지 않았으면 기본값(선과 같다). */
export function strokeColorOf(o: Stroked): string {
  return o.color ?? OBJECT_LINE_COLOR;
}

/** 테두리 점선 모양. 정하지 않았으면 실선. */
export function strokeDashOf(o: Stroked): Dash {
  return o.dash ?? 'solid';
}

/** 채우기 색. 정하지 않았으면 null(안 채운다 — 테두리만). */
export function fillColorOf(o: ShapeObject): string | null {
  return o.fillColor ?? null;
}

/** 채우기 투명도(0~1). 정하지 않았으면 기본값(불투명). fillColorOf가 null이면 뜻이 없다. */
export function fillOpacityOf(o: ShapeObject): number {
  return o.fillOpacity ?? SHAPE_FILL_OPACITY;
}

/** 둥글기 단계. 정하지 않았으면 0(각짐). */
export function roundnessOf(o: ShapeObject): 0 | 1 | 2 | 3 | 4 {
  return o.roundness ?? 0;
}

/**
 * 둥글기 단계(0~4)를 실제 반지름(rx, ry)으로.
 *
 * 0~3은 짧은 변의 절반을 기준으로 25%씩 늘어난다 — 그래야 세로로 긴
 * 상자든 가로로 긴 상자든 3단계까지는 "그래도 사각형"으로 보인다. 4는
 * 특별하게 상자의 가로·세로 절반을 각각 반지름으로 쓴다 — 짧은 변
 * 기준을 그대로 쓰면 직사각형에서 알약 모양(스타디움)이 되어 "원"이라는
 * 말과 안 맞는다. 정사각형이면 완전한 원, 직사각형이면 완전한 타원이 된다.
 */
export function cornerRadiusOf(box: { width: Mm; height: Mm }, roundness: 0 | 1 | 2 | 3 | 4): { rx: Mm; ry: Mm } {
  if (roundness === 4) return { rx: box.width / 2, ry: box.height / 2 };
  const short = Math.min(box.width, box.height) / 2;
  const r = short * (roundness / 4);
  return { rx: r, ry: r };
}

/**
 * 상자와 반지름으로 둥근 사각형(또는 타원)의 SVG 경로 문자열을 만든다.
 *
 * 화면은 이 문자열을 그대로 `<path d>`에 쓰고, PDF는 pdf-lib의
 * `drawSvgPath`에 그대로 넘긴다 — 모양을 결정하는 계산은 여기 한 번뿐이다.
 *
 * 호(arc) 대신 3차 베지어로 모서리를 근사한다. `κ`(카파, ≈0.5523)는 원을
 * 베지어 4개로 근사할 때 쓰는 잘 알려진 상수다 — 여러 SVG 구현체·PDF
 * 라이브러리가 arc 명령을 조금씩 다르게 해석하는 위험을 피할 수 있다.
 * `rx === width/2 && ry === height/2`(둥글기 4단계)면 네 변의 직선이
 * 전부 길이 0이 되어, 이 함수 그대로 완전한 타원이 된다 — 따로 분기하지
 * 않는다.
 */
export function roundedRectPath(box: { x: Mm; y: Mm; width: Mm; height: Mm }, rx: Mm, ry: Mm): string {
  const { x, y, width: w, height: h } = box;
  const k = 0.5522847498;
  const ox = rx * k;
  const oy = ry * k;
  return [
    `M ${x + rx} ${y}`,
    `L ${x + w - rx} ${y}`,
    `C ${x + w - rx + ox} ${y} ${x + w} ${y + ry - oy} ${x + w} ${y + ry}`,
    `L ${x + w} ${y + h - ry}`,
    `C ${x + w} ${y + h - ry + oy} ${x + w - rx + ox} ${y + h} ${x + w - rx} ${y + h}`,
    `L ${x + rx} ${y + h}`,
    `C ${x + rx - ox} ${y + h} ${x} ${y + h - ry + oy} ${x} ${y + h - ry}`,
    `L ${x} ${y + ry}`,
    `C ${x} ${y + ry - oy} ${x + rx - ox} ${y} ${x + rx} ${y}`,
    'Z',
  ].join(' ');
}
