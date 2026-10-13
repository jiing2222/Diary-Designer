import type { DotsObject } from './objects';
import { DOTS_SIZE, OBJECT_LINE_COLOR } from './style';
import type { Mm } from './units';

/**
 * 도트 판(리뉴얼 9-4)을 어떻게 그릴지 — 화면(InsertView)과 PDF(export)가 이것만 부른다(core/line과 같은 역할).
 * 도트는 칸(`width/cols` × `height/rows`) 가운데에 놓인다.
 */

/** 도트 하나의 키 — `행,열`(0부터). */
export const dotKey = (row: number, col: number) => `${row},${col}`;

/** 기본 지름. 정하지 않았으면 core/style의 기본값. */
export function dotsSizeOf(o: Pick<DotsObject, 'size'>): Mm {
  return o.size ?? DOTS_SIZE;
}

/** 색. 정하지 않았으면 기본 선 색. */
export function dotsColorOf(o: Pick<DotsObject, 'color'>): string {
  return o.color ?? OBJECT_LINE_COLOR;
}

/** 이 도트의 지름 — 바꾼 것이면 그 값, 아니면 기본 지름. */
export function dotSizeAt(o: Pick<DotsObject, 'size' | 'sizes'>, key: string): Mm {
  return o.sizes?.[key] ?? dotsSizeOf(o);
}

export interface Dot {
  key: string;
  row: number;
  col: number;
  x: Mm;
  y: Mm;
  /** 지름. 0이면 그리지 않는다. */
  size: Mm;
}

/** 모든 도트의 자리·지름(지름 0인 것 포함 — 고를 때는 없는 도트도 다시 살릴 수 있어야 한다). */
export function dotsOf(o: DotsObject): Dot[] {
  const cw = o.width / o.cols;
  const ch = o.height / o.rows;
  const out: Dot[] = [];
  for (let row = 0; row < o.rows; row++) {
    for (let col = 0; col < o.cols; col++) {
      const key = dotKey(row, col);
      out.push({ key, row, col, x: o.x + cw * (col + 0.5), y: o.y + ch * (row + 0.5), size: dotSizeAt(o, key) });
    }
  }
  return out;
}

/** 이 자리(mm)가 속한 칸의 도트 키. 판 밖이면 null. */
export function dotKeyAt(o: DotsObject, p: { x: Mm; y: Mm }): string | null {
  const col = Math.floor(((p.x - o.x) / o.width) * o.cols);
  const row = Math.floor(((p.y - o.y) / o.height) * o.rows);
  if (col < 0 || row < 0 || col >= o.cols || row >= o.rows) return null;
  return dotKey(row, col);
}

/**
 * 도트 몇 개의 지름을 바꾼다. `size`가 undefined면 기본 지름으로 되돌린다(키를 지운다). 행·열 수가 줄어
 * 판 밖이 된 키도 함께 걷어낸다 — 다시 늘렸을 때 옛 값이 되살아나지 않게.
 */
export function withDotSizes(o: DotsObject, keys: string[], size: Mm | undefined): DotsObject {
  const sizes = { ...o.sizes };
  for (const k of keys) {
    if (size === undefined) delete sizes[k];
    else sizes[k] = size;
  }
  return cleanSizes({ ...o, sizes });
}

/** 판 밖의 키·빈 `sizes`를 걷어낸다. */
export function cleanSizes(o: DotsObject): DotsObject {
  const kept = Object.entries(o.sizes ?? {}).filter(([k]) => {
    const [r, c] = k.split(',').map(Number);
    return r < o.rows && c < o.cols;
  });
  const { sizes: _drop, ...rest } = o;
  return kept.length > 0 ? { ...rest, sizes: Object.fromEntries(kept) } : rest;
}
