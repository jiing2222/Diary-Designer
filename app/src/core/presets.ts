import type { Mm } from './units';

/* ────────────────────────────── 용지 ────────────────────────────── */

export interface PaperPreset {
  id: string;
  name: string;
  width: Mm;
  height: Mm;
}

export const PAPER_PRESETS: PaperPreset[] = [
  { id: 'A4', name: 'A4', width: 210, height: 297 },
  { id: 'A5', name: 'A5', width: 148, height: 210 },
];

/* ────────────────────────────── 속지 ────────────────────────────── */

export interface InsertPreset {
  id: string;
  name: string;
  width: Mm;
  height: Mm;
  /** 타공 개수 */
  holeCount: number;
  /**
   * 6공을 3개씩 두 묶음으로 나눌 때, 두 묶음 사이의 중심 간격.
   * null이면 전부 균등 간격.
   */
  groupGap: Mm | null;
  /** 화면 표시용 구멍 크기. 인쇄되지 않으므로 안내 목적일 뿐이다. */
  markSize: Mm;
}

/**
 * 6공 바인더의 국제 표준 간격. 3/4인치 = 19.05mm.
 * 제조사와 무관하게 고정이므로 상수로 둔다.
 */
export const HOLE_PITCH: Mm = 19;

/**
 * 기본 속지 규격.
 *
 * 이 값들은 출발점일 뿐이다. 실제 속지는 브랜드마다 다르고
 * M6만 해도 세로가 125~128mm로 제각각이다. 사용자가 크기를 바꾸면
 * 타공 위치는 punch.ts에서 그 자리에서 다시 계산된다.
 */
export const INSERT_PRESETS: InsertPreset[] = [
  { id: 'A5', name: 'A5', width: 148, height: 210, holeCount: 6, groupGap: 70, markSize: 6 },
  { id: 'TA6', name: 'TA6', width: 105, height: 148, holeCount: 6, groupGap: 38, markSize: 6 },
  { id: 'DA6', name: 'DA6', width: 95, height: 171, holeCount: 6, groupGap: 51, markSize: 6 },
  { id: 'M6', name: 'M6', width: 80, height: 125, holeCount: 6, groupGap: null, markSize: 4 },
  { id: 'M5', name: 'M5', width: 62, height: 105, holeCount: 5, groupGap: null, markSize: 4 },
  { id: 'M6TRI', name: 'M6 3-fold', width: 220, height: 125, holeCount: 6, groupGap: null, markSize: 4 },
  { id: 'M5TRI', name: 'M5 3-fold', width: 202, height: 105, holeCount: 5, groupGap: null, markSize: 4 },
  // 구멍이 셋이라 M3다. id는 DA9로 두었던 것을 그대로 쓴다 — 저장 파일에
  // 이 id가 들어 있어서, 바꾸면 예전 파일이 이 규격을 못 찾는다.
  { id: 'DA9', name: 'M3', width: 60, height: 80, holeCount: 3, groupGap: null, markSize: 4 },
];

/* ────────────────────────── 규격 계열 ────────────────────────── */

/**
 * 규격을 몇 갈래로 묶은 것.
 *
 * 프리셋이 여덟 개나 되어 한 줄로 늘어놓으면 고르기 어렵다. 실제로 쓰는
 * 사람은 "내 바인더가 M6냐 A5냐"부터 정하므로, 그 갈래를 먼저 고르게 한다.
 * 양식 갤러리의 왼쪽 줄과 새 양식 만들기 창이 **같은 갈래**를 쓴다 — 두
 * 군데가 서로 다르게 묶으면 같은 규격을 찾는 길이 화면마다 달라진다.
 */
export type SizeFamilyId = 'custom' | 'a5a6' | 'm6m5' | 'etc';

export interface SizeFamily {
  id: SizeFamilyId;
  label: string;
  /** 이 갈래에 드는 프리셋. `custom`은 비어 있다 — 프리셋에 없는 크기를 뜻한다. */
  presetIds: string[];
}

export const SIZE_FAMILIES: SizeFamily[] = [
  { id: 'custom', label: 'Custom', presetIds: [] },
  { id: 'a5a6', label: 'A5/A6', presetIds: ['A5', 'TA6', 'DA6'] },
  { id: 'm6m5', label: 'M6/M5', presetIds: ['M6', 'M5'] },
  { id: 'etc', label: 'ETC', presetIds: ['M6TRI', 'M5TRI', 'DA9'] },
];

/** 이 프리셋이 어느 갈래인지. 프리셋에 없는 id면 `custom`. */
export function familyOf(presetId: string): SizeFamilyId {
  return SIZE_FAMILIES.find((f) => f.presetIds.includes(presetId))?.id ?? 'custom';
}

export function findInsertPreset(id: string): InsertPreset | undefined {
  return INSERT_PRESETS.find((p) => p.id === id);
}

export function findPaperPreset(id: string): PaperPreset | undefined {
  return PAPER_PRESETS.find((p) => p.id === id);
}
