import type { Slot } from './layout';
import type { Mm } from './units';

/**
 * 속지 좌표를 용지 좌표로 옮긴다.
 *
 * 1단계까지는 이게 필요 없었다. 재단선도 눈금자도 전부 용지 좌표라 칸이
 * 어디 있는지 몰라도 그릴 수 있었고, 타공은 화면 전용이라 PDF에 없었다.
 * 도트 격자가 처음으로 "칸 안에 그려지면서 인쇄까지 되는" 내용이다.
 *
 * 화면은 SVG transform으로, PDF는 좌표를 직접 계산해서 그린다. 둘이 어긋나면
 * 인쇄물만 틀어지고 화면으로는 알 수가 없다. 그래서 변환을 행렬 여섯 숫자로
 * 한 번만 정하고, map()과 svg가 같은 숫자에서 나오게 한다.
 */

/** 속지 왼쪽 위를 원점으로 한 좌표 (u, v). */
export interface Placement {
  /** (u, v) → 용지 좌표 */
  map(u: Mm, v: Mm): { x: Mm; y: Mm };
  /** 같은 변환의 SVG 표현 */
  svg: string;
}

/**
 * 이 칸에 들어가는 속지의 크기.
 *
 * 회전 배치면 칸의 가로세로가 뒤바뀌어 있다. 속지 크기를 따로 넘겨받지 않고
 * 칸에서 되돌리는 이유는, 둘이 서로 안 맞는 상황을 아예 만들지 않기 위해서다.
 */
export function insertSizeOf(slot: Slot, rotated: boolean): { width: Mm; height: Mm } {
  return rotated
    ? { width: slot.height, height: slot.width }
    : { width: slot.width, height: slot.height };
}

/**
 * 칸 하나의 변환.
 *
 * 회전 배치면 속지를 왼쪽으로 90도 눕힌다. 속지의 왼쪽 변(구멍이 있는 쪽)이
 * 아래로 가고, 속지 안의 도트도 글자도 전부 함께 돈다.
 *
 * SVG의 matrix(a b c d e f)는 이렇게 계산된다.
 *   x' = a·u + c·v + e
 *   y' = b·u + d·v + f
 */
export function placeSlot(slot: Slot, rotated: boolean): Placement {
  const [a, b, c, d, e, f] = rotated
    ? [0, -1, 1, 0, slot.x, slot.y + slot.height]
    : [1, 0, 0, 1, slot.x, slot.y];

  return {
    map: (u, v) => ({ x: a * u + c * v + e, y: b * u + d * v + f }),
    svg: `matrix(${a} ${b} ${c} ${d} ${e} ${f})`,
  };
}
