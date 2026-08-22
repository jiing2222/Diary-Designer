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
 * **회전 배치가 아니면 좌우만, 회전 배치면 좌우·상하 둘 다 뒤집는다.**
 *
 * 프린터가 종이를 물리적으로 뒤집는 축(긴 가장자리 기준 = 좌우 뒤집기)은
 * 회전 배치 여부와 무관하다 — 지금까지는 회전 배치면 상하만 뒤집도록
 * 해뒀는데(9b 수정 5), 그 하나만으로는 **타공 안내가 종이 좌우로는 전혀
 * 갈라지지 않는** 버그가 있었다(2026-08-22, 실제 인쇄를 빛에 비춰 확인 —
 * 앞뒤 구멍이 종이 같은 쪽에 있었다).
 *
 * 원인: 칸을 90도 눕히면(회전 배치) 속지 자신의 가로축(구멍이 있는 축)이
 * 종이의 **세로축**이 된다(core/place의 placeSlot). 그런데 "뒷면이면
 * 타공을 반대쪽으로 옮긴다"는 계산(core/punch의 holeCenterX, mirror)은
 * 여전히 **속지의 가로축**만 뒤집는다 — 회전 배치에서 그 축은 종이의
 * 세로축이므로, 결국 종이의 위아래만 바뀌고 좌우는 앞뒤가 똑같은 자리에
 * 그대로 겹쳤다. 칸 자체를 좌우로도 뒤집어야 종이 좌우에서도 앞뒤가 갈라진다.
 *
 * 칸 **안의 내용**(그린 것)은 어느 경우든 뒤집지 않는다 — 위치만 옮긴다.
 *
 * 절취선(core/crop)은 칸 좌표만 보고 계산하므로, 이 배치를 그대로 넘기면
 * 절취선도 저절로 앞뒤가 맞는 자리에 나온다 — 따로 뒤집는 코드가 필요 없다.
 *
 * **`localAxisMirror`(회전 배치면 안전영역·타공 안내의 뒷면 뒤집기를 꺼버리는
 * 함수)를 만들었다가 다시 지웠다(2026-08-22).** "칸 자체가 좌우로 이미
 * 갈라지니 안전영역까지 뒤집으면 위아래로 한 번 더 갈라진다"는 추론으로
 * 넣었는데, 이건 **실제 인쇄가 아니라 미리보기 스크린샷만 보고** 내린
 * 판단이었다. 그 결과 속지양식 편집 화면(EditorTab, 회전을 모르고 뒷면이면
 * 항상 뒤집는다)과 인쇄하기 탭(회전 배치면 안 뒤집는다)이 **같은 뒷면
 * 카드의 안전영역을 서로 다른 자리에 그리는** 화면 불일치를 냈다 — 사용자가
 * 편집 화면에서 안전영역 옆에 붙여 그린 상자가 인쇄하기 탭에서는 반대쪽에
 * 떨어져 보이는 것으로 발견됐다. 두 화면 다 "뒷면이면 항상 뒤집는다"로
 * 돌아가는 편이 최소한 서로 일관되므로 되돌렸다.
 */
export function mirrorLayout(layout: Layout, paperWidth: Mm, paperHeight: Mm): Layout {
  return layout.rotated
    ? {
        ...layout,
        slots: layout.slots.map((s) => ({
          ...s,
          x: paperWidth - s.x - s.width,
          y: paperHeight - s.y - s.height,
        })),
      }
    : { ...layout, slots: layout.slots.map((s) => ({ ...s, x: paperWidth - s.x - s.width })) };
}
