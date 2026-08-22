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
  /**
   * 이 면 전체를 반 바퀴 돌려 그릴지. `turnLayout180`이 켠다.
   *
   * `rotated`(90도 눕히기)와 달리 칸 개수·크기에는 영향이 없다. 칸 위치는
   * 이 배치가 이미 옮겨놨고, 이 값은 **칸 안의 내용**을 함께 돌리라고
   * `core/place`의 `placeSlot`에 알리는 표시다. 배치에 붙여두는 이유는
   * 그리는 쪽이 일곱 군데(pdf/export)나 되기 때문이다 — 값을 따로 들고
   * 다니면 한 군데만 빠뜨려도 그것만 안 돌아간 채로 인쇄된다.
   */
  turn180?: boolean;
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
    turn180: false,
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
 * 양면 인쇄에서 뒷면의 칸 배치. **긴 변으로 넘기는 프린터** 기준이다.
 *
 * 긴 변으로 넘기면 앞면의 (x, y) 뒤에 뒷면의 (W−x, y)가 온다. 그래서 칸은
 * 좌우로만 옮긴다 — 회전 배치든 아니든 종이가 넘어가는 축은 같으므로 여기는
 * 갈라지지 않는다. 짧은 변으로 넘기는 프린터는 `turnLayout180`을 덧씌운다.
 *
 * **회전 배치면 칸 안의 내용이 반 바퀴 돌아야 한다(`turn180`).** 여기가
 * 오래 틀렸던 자리다.
 *
 * 칸을 90도 눕히면 속지 자신의 가로축(구멍이 있는 축)이 종이의 **세로축**이
 * 된다(core/place의 placeSlot). 그런데 "뒷면이면 타공을 반대쪽으로 옮긴다"는
 * 계산(core/punch의 holeCenterX, mirror)은 **속지의 가로축**을 뒤집는다 —
 * 회전 배치에서 그 축은 종이의 세로축이므로, 뒷면 구멍이 종이 위아래로
 * 뒤집힌 자리에 생긴다. 앞면 구멍은 칸 아래쪽, 뒷면 구멍은 칸 위쪽 —
 * **한 장에 구멍을 뚫으면 한쪽 면이 반드시 틀어진다.** 칸 안의 내용을 함께
 * 반 바퀴 돌리면 그 세로축이 제자리로 돌아와 앞뒤 구멍이 겹친다.
 *
 * 2026-08-22에는 이걸 **칸을 상하로도 옮겨서** 맞추려 했다. 가운데 정렬처럼
 * 대칭인 배치에서는 칸의 집합이 그대로라 구멍자리가 우연히 맞아 보였지만,
 * 그건 앞면 i번 칸 뒤에 **뒷면 i번이 아닌 다른 칸**이 오게 만드는 것이라
 * 내용 짝이 어긋났다(대칭이 아닌 배치·홀수 칸에서는 구멍자리까지 틀어진다).
 * 좌우만 옮기고 내용을 돌리는 것이 옳다 — 2026-08-23, 실제로 뚫어본 결과다.
 *
 * 절취선(core/crop)은 칸 좌표만 보고 계산하므로, 이 배치를 그대로 넘기면
 * 절취선도 저절로 앞뒤가 맞는 자리에 나온다 — 따로 뒤집는 코드가 필요 없다.
 *
 * 안전영역·타공 안내의 뒷면 뒤집기(core/punch의 mirror)는 **회전과 무관하게
 * 늘 켠다.** 한때 회전 배치에서 그것을 꺼는 `localAxisMirror`를 넣었다가
 * 지웠는데(2026-08-22), 끄는 쪽은 속지양식 편집 화면과 인쇄하기 탭이 같은
 * 뒷면의 안전영역을 서로 다른 자리에 그리게 만들었다. 여기서 고칠 것은
 * 속지 안의 계산이 아니라 칸을 놓는 각도였다.
 */
export function mirrorLayout(layout: Layout, paperWidth: Mm, _paperHeight: Mm): Layout {
  return {
    ...layout,
    turn180: layout.rotated,
    slots: layout.slots.map((s) => ({ ...s, x: paperWidth - s.x - s.width })),
  };
}

/**
 * 뒷면 한 면을 통째로 반 바퀴 돌린다.
 *
 * **프린터가 종이를 어느 변으로 넘기느냐의 문제다.** `mirrorLayout`은 긴 변으로
 * 넘기는 프린터(앞면의 (x, y) 뒤에 뒷면의 (W−x, y)가 온다)를 전제로 짜여 있다.
 * 짧은 변으로 넘기는 프린터는 (x, H−y)가 오므로, 같은 PDF를 넣으면 뒷면이
 * 딱 반 바퀴 어긋난 채로 찍힌다 — 앞면 구멍자리는 속지 이쪽 끝, 뒷면
 * 구멍자리는 저쪽 끝에 생겨서 **한 장에 구멍을 뚫으면 한쪽 면이 반드시
 * 틀어진다.** 실제로 뚫어보기 전에는 알기 어렵고, 뚫고 나면 되돌릴 수 없다.
 *
 * 돌리는 일은 두 가지가 **함께** 일어나야 한다.
 *
 *   1. 칸 위치 — 용지 한가운데를 기준으로 점대칭으로 옮긴다(여기서 한다).
 *   2. 칸 안의 내용 — 같은 각도로 함께 돈다(`turn180`을 켜두면 `core/place`의
 *      `placeSlot`이 한다).
 *
 * 하나만 하면 더 나빠진다. 위치만 옮기면 속지가 엉뚱한 칸에 세워진 채로 가고,
 * 내용만 돌리면 칸 밖으로 나간다.
 *
 * 두 번 부르면 원래대로 돌아온다 — 반 바퀴를 두 번 돌면 제자리다. `mirrorLayout`
 * 위에 겹쳐 쓰는 것을 전제로 하며, 절취선(core/crop)은 칸 좌표만 보므로 이
 * 배치를 그대로 넘기면 저절로 따라온다.
 */
export function turnLayout180(layout: Layout, paperWidth: Mm, paperHeight: Mm): Layout {
  return {
    ...layout,
    turn180: !layout.turn180,
    slots: layout.slots.map((s) => ({
      ...s,
      x: paperWidth - s.x - s.width,
      y: paperHeight - s.y - s.height,
    })),
  };
}
