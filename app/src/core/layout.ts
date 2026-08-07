import type { Mm } from './units';

export interface LayoutInput {
  paperWidth: Mm;
  paperHeight: Mm;
  insertWidth: Mm;
  insertHeight: Mm;
  /** 속지 사이 간격 */
  gap: Mm;
  /** 프린터가 인쇄하지 못하는 가장자리 여백 */
  printMargin: Mm;
  /** 속지를 90도 돌려 더 많이 넣는 것을 허용할지 */
  allowRotate: boolean;
  /** 배치 덩어리를 용지 어디에 붙일지 */
  align: Align;
}

/**
 * 가운데에 놓으면 사방을 다 잘라야 하고, 좌측 상단에 붙이면 오른쪽과 아래
 * 두 번만 자르면 된다. 재단 횟수가 줄어드는 대신 프린터가 못 찍는 가장자리에
 * 내용이 닿을 수 있다.
 */
export type Align = 'center' | 'topLeft';

export interface Slot {
  /** 용지 왼쪽 위를 원점으로 한 칸의 위치 */
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
}

export interface Layout {
  cols: number;
  rows: number;
  count: number;
  rotated: boolean;
  slots: Slot[];
}

/** 주어진 방향으로 몇 칸이 들어가는지 센다. */
function fit(available: Mm, size: Mm, gap: Mm): number {
  if (size <= 0) return 0;
  return Math.max(0, Math.floor((available + gap) / (size + gap)));
}

/**
 * 용지 한 장에 속지를 최대한 많이 배치한다.
 *
 * allowRotate가 켜져 있으면 90도 돌린 경우도 계산해 더 많이 들어가는 쪽을 쓴다.
 * 배치된 전체 덩어리를 용지 어디에 놓을지는 align이 정한다.
 */
export function computeLayout(input: LayoutInput): Layout {
  const { paperWidth, paperHeight, gap, printMargin, allowRotate, align } = input;

  const availableW = paperWidth - printMargin * 2;
  const availableH = paperHeight - printMargin * 2;

  const upright = arrange(input.insertWidth, input.insertHeight);
  const turned = allowRotate ? arrange(input.insertHeight, input.insertWidth) : null;

  const best = turned && turned.count > upright.count ? turned : upright;

  return {
    ...best,
    rotated: best === turned,
    slots: buildSlots(best.cols, best.rows, best.w, best.h),
  };

  function arrange(w: Mm, h: Mm) {
    const cols = fit(availableW, w, gap);
    const rows = fit(availableH, h, gap);
    return { cols, rows, count: cols * rows, w, h };
  }

  function buildSlots(cols: number, rows: number, w: Mm, h: Mm): Slot[] {
    const blockW = cols * w + (cols - 1) * gap;
    const blockH = rows * h + (rows - 1) * gap;
    const originX = align === 'topLeft' ? printMargin : (paperWidth - blockW) / 2;
    const originY = align === 'topLeft' ? printMargin : (paperHeight - blockH) / 2;

    const slots: Slot[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({
          x: originX + c * (w + gap),
          y: originY + r * (h + gap),
          width: w,
          height: h,
        });
      }
    }
    return slots;
  }
}

/**
 * 양면 인쇄에서 뒷면의 칸 배치.
 *
 * 프린터가 종이를 물리적으로 뒤집는 축은 **긴 가장자리 기준(좌우 뒤집기)**과
 * **짧은 가장자리 기준(상하 뒤집기)** 두 가지가 있다(프린터 설정에서 고른다).
 * 어느 쪽을 쓰든 속지 각 칸이 인쇄되는 실제 종이 방향과 맞아야 하므로, 여기서는
 * **회전 배치(`layout.rotated`)가 아니면 좌우, 회전 배치면 상하**로 뒤집는다.
 *
 * 칸을 90도 눕혀서 넣으면(회전 배치) 속지의 가로축(구멍이 있는 축)이 용지의
 * 세로축과 겹친다. 그래서 좌우 뒤집기는 그 축에 영향을 주지 않아 구멍이 반대편
 * 으로 튀지만, 상하 뒤집기를 쓰면 다시 속지의 가로축이 정확히 뒤집힌다 —
 * 회전이 아니든 회전이든, **속지 자신의 가로축(구멍이 있는 축)은 항상 뒤집힌다**는
 * 뜻이다. 실제로 M5(회전 배치가 되는 규격)를 상하 뒤집기로 인쇄해보고 확인했다.
 *
 * 칸 **안의 내용**(그린 것)은 어느 경우든 뒤집지 않는다 — 위치만 옮긴다.
 *
 * 절취선(core/crop)은 칸 좌표만 보고 계산하므로, 이 배치를 그대로 넘기면
 * 절취선도 저절로 앞뒤가 맞는 자리에 나온다 — 따로 뒤집는 코드가 필요 없다.
 */
export function mirrorLayout(layout: Layout, paperWidth: Mm, paperHeight: Mm): Layout {
  return layout.rotated
    ? { ...layout, slots: layout.slots.map((s) => ({ ...s, y: paperHeight - s.y - s.height })) }
    : { ...layout, slots: layout.slots.map((s) => ({ ...s, x: paperWidth - s.x - s.width })) };
}
