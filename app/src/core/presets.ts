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
  { id: 'TA6', name: 'TA6 (트루 A6)', width: 105, height: 148, holeCount: 6, groupGap: 38, markSize: 6 },
  { id: 'DA6', name: 'DA6 (다이어리 A6)', width: 95, height: 171, holeCount: 6, groupGap: 51, markSize: 6 },
  { id: 'M6', name: 'M6 (미니6)', width: 80, height: 125, holeCount: 6, groupGap: null, markSize: 4 },
  { id: 'M5', name: 'M5 (미니5)', width: 62, height: 105, holeCount: 5, groupGap: null, markSize: 4 },
  { id: 'M6TRI', name: 'M6 3단접이', width: 220, height: 125, holeCount: 6, groupGap: null, markSize: 4 },
  { id: 'M5TRI', name: 'M5 3단접이', width: 202, height: 105, holeCount: 5, groupGap: null, markSize: 4 },
  { id: 'DA9', name: 'DA9', width: 60, height: 80, holeCount: 3, groupGap: null, markSize: 4 },
];

export function findInsertPreset(id: string): InsertPreset | undefined {
  return INSERT_PRESETS.find((p) => p.id === id);
}

export function findPaperPreset(id: string): PaperPreset | undefined {
  return PAPER_PRESETS.find((p) => p.id === id);
}
