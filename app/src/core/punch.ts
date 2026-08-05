import { HOLE_PITCH } from './presets';
import type { Mm } from './units';

export interface PunchSetting {
  /** 화면에 타공 위치를 표시할지. 인쇄에는 절대 포함되지 않는다. */
  show: boolean;
  /** 왼쪽 안전영역 폭. 타공기 크기에 따라 조정한다. */
  safeZoneWidth: Mm;
  holeCount: number;
  /** 3+3 묶음 배치일 때 두 묶음 사이 중심 간격. null이면 균등 배치. */
  groupGap: Mm | null;
  /** 화면 표시용 구멍 크기 */
  markSize: Mm;
  /** 속지 왼쪽 끝에서 구멍 왼쪽 가장자리까지 */
  edgeToHole: Mm;
  /** 중앙 정렬에서 밀어낼 값. 특수한 경우에만 쓴다. */
  offsetY: Mm;
}

export const DEFAULT_PUNCH: Omit<PunchSetting, 'holeCount' | 'groupGap' | 'markSize'> = {
  show: true,
  safeZoneWidth: 10,
  edgeToHole: 3,
  offsetY: 0,
};

/**
 * 첫 구멍을 0으로 놓았을 때 각 구멍의 상대 위치.
 *
 * 6공을 3개씩 두 묶음으로 나누는 경우 묶음 안은 19mm씩,
 * 묶음 사이는 groupGap만큼 벌어진다.
 */
function holeOffsets(holeCount: number, groupGap: Mm | null): Mm[] {
  if (groupGap === null) {
    return Array.from({ length: holeCount }, (_, i) => i * HOLE_PITCH);
  }

  const half = holeCount / 2;
  const groupSpan = (half - 1) * HOLE_PITCH;
  return Array.from({ length: holeCount }, (_, i) =>
    i < half ? i * HOLE_PITCH : groupSpan + groupGap + (i - half) * HOLE_PITCH,
  );
}

/** 첫 구멍부터 마지막 구멍 중심까지의 길이. 속지가 이보다 짧으면 구멍이 안 들어간다. */
export function holeSpan(punch: PunchSetting): Mm {
  const offsets = holeOffsets(punch.holeCount, punch.groupGap);
  return offsets[offsets.length - 1] ?? 0;
}

/**
 * 구멍 중심의 세로 좌표들. 속지 위쪽 끝이 0.
 *
 * 상하 여백은 입력받지 않는다. 구멍은 물리적으로 세로 정중앙에 있고
 * 간격 19mm는 바인더 규격이라 바꿀 수 없으므로, 여백은 속지 높이에서
 * 자동으로 결정되는 종속 변수다. 따로 받으면 값끼리 모순이 생긴다.
 */
export function holeCentersY(insertHeight: Mm, punch: PunchSetting): Mm[] {
  const offsets = holeOffsets(punch.holeCount, punch.groupGap);
  const span = offsets[offsets.length - 1];
  const margin = (insertHeight - span) / 2 + punch.offsetY;
  return offsets.map((o) => margin + o);
}

/**
 * 균등 배치를 묶음 배치로 바꿀 때 처음 제시할 묶음 간격.
 *
 * A5 기준값(70mm)을 쓰되, 그대로 두면 M6 같은 작은 속지에서 구멍이 넘쳐버린다.
 * 속지에 실제로 들어가는 값으로 낮춰서 제안한다.
 */
export function suggestGroupGap(insertHeight: Mm, holeCount: number): Mm | null {
  const groupSpan = (holeCount / 2 - 1) * HOLE_PITCH;
  const MIN_MARGIN: Mm = 8;
  const fitting = insertHeight - groupSpan * 2 - MIN_MARGIN * 2;

  // 묶음 간격이 구멍 간격보다 좁으면 묶은 의미가 없다.
  if (fitting < HOLE_PITCH) return null;
  return Math.min(70, Math.floor(fitting));
}

/** 구멍 중심의 가로 좌표. 속지 왼쪽 끝이 0. */
export function holeCenterX(punch: PunchSetting): Mm {
  return punch.edgeToHole + punch.markSize / 2;
}

/** 맨 위 구멍 가장자리까지의 여백. 화면에 보여주기 위한 값. */
export function topMargin(insertHeight: Mm, punch: PunchSetting): Mm {
  const centers = holeCentersY(insertHeight, punch);
  return centers[0] - punch.markSize / 2;
}
