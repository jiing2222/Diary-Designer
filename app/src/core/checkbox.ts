import type { Box } from './objects';
import type { CheckboxIcon, CheckboxObject } from './objects';
import { roundedRectPath } from './shape';
import type { Mm } from './units';

/**
 * 체크박스 아이콘을 어떻게 그릴지.
 *
 * 도형(core/shape)과 같은 이유로 여기 모은다 — 화면(SVG `<path>`)과
 * PDF(pdf-lib의 `drawSvgPath`)가 정확히 같은 경로 문자열을 그린다.
 */

/** 칸을 아이콘 자리로 줄일 때 짧은 변에 대해 남기는 여백 비율. "칸보다 조금 작게". */
const MARGIN_RATIO = 0.15;

/** 표처럼 드래그해 걸친 칸 하나를, 그 칸보다 살짝 작은 아이콘 상자로 줄인다. */
export function checkboxIconBox(cell: Box): Box {
  const margin = Math.min(cell.width, cell.height) * MARGIN_RATIO;
  return {
    x: cell.x + margin,
    y: cell.y + margin,
    width: cell.width - margin * 2,
    height: cell.height - margin * 2,
  };
}

/** 아이콘 모양. 정하지 않았으면 네모. */
export function iconOf(o: CheckboxObject): CheckboxIcon {
  return o.icon ?? 'square';
}

/** 세모 — 위 꼭짓점에서 아래 두 모서리로. */
function trianglePath(box: Box): string {
  const { x, y, width: w, height: h } = box;
  return `M ${x + w / 2} ${y} L ${x} ${y + h} L ${x + w} ${y + h} Z`;
}

/** 다이아 — 네 변의 가운데를 잇는다. */
function diamondPath(box: Box): string {
  const { x, y, width: w, height: h } = box;
  return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`;
}

/** 별 — 꼭짓점 5개(바깥)·오목점 5개(안쪽)를 번갈아 잇는 정오각별. */
function starPath(box: Box): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rOuter = Math.min(box.width, box.height) / 2;
  // sin18°/sin54° — 정오각별의 안쪽 반지름 비율.
  const rInner = rOuter * 0.381966;

  const pts: Mm[] = [];
  for (let i = 0; i < 5; i++) {
    const outerAngle = -Math.PI / 2 + i * ((2 * Math.PI) / 5);
    const innerAngle = outerAngle + Math.PI / 5;
    pts.push(cx + rOuter * Math.cos(outerAngle), cy + rOuter * Math.sin(outerAngle));
    pts.push(cx + rInner * Math.cos(innerAngle), cy + rInner * Math.sin(innerAngle));
  }
  const [mx, my, ...rest] = pts;
  const l = [];
  for (let i = 0; i < rest.length; i += 2) l.push(`L ${rest[i]} ${rest[i + 1]}`);
  return `M ${mx} ${my} ${l.join(' ')} Z`;
}

/**
 * 하트 — 3차 베지어 6개로 근사한 잘 알려진 모양. 상자를 0~1로 정규화한
 * 좌표(왼쪽 위 (0,0), 오른쪽 아래 (1,1))로 적고 실제 상자로 늘린다.
 */
function heartPath(box: Box): string {
  const { x, y, width: w, height: h } = box;
  const px = (u: number) => x + u * w;
  const py = (v: number) => y + v * h;
  return [
    `M ${px(0.5)} ${py(1)}`,
    `C ${px(0.5)} ${py(1)} ${px(0)} ${py(0.65)} ${px(0)} ${py(0.35)}`,
    `C ${px(0)} ${py(0.15)} ${px(0.15)} ${py(0)} ${px(0.35)} ${py(0)}`,
    `C ${px(0.45)} ${py(0)} ${px(0.5)} ${py(0.05)} ${px(0.5)} ${py(0.15)}`,
    `C ${px(0.5)} ${py(0.05)} ${px(0.55)} ${py(0)} ${px(0.65)} ${py(0)}`,
    `C ${px(0.85)} ${py(0)} ${px(1)} ${py(0.15)} ${px(1)} ${py(0.35)}`,
    `C ${px(1)} ${py(0.65)} ${px(0.5)} ${py(1)} ${px(0.5)} ${py(1)}`,
    'Z',
  ].join(' ');
}

/** 아이콘 모양과 상자로 SVG 경로 문자열을 만든다. 네모·동그라미는 도형(core/shape)의 경로를 그대로 빌린다. */
export function checkboxPath(icon: CheckboxIcon, box: Box): string {
  if (icon === 'square') return roundedRectPath(box, 0, 0);
  if (icon === 'circle') return roundedRectPath(box, box.width / 2, box.height / 2);
  if (icon === 'triangle') return trianglePath(box);
  if (icon === 'diamond') return diamondPath(box);
  if (icon === 'star') return starPath(box);
  return heartPath(box);
}
