import type { Mm } from './units';

/* ────────────────────────────── 용지 ────────────────────────────── */

export interface PaperPreset {
  id: string;
  name: string;
  width: Mm;
  height: Mm;
}

export const PAPER_PRESETS: PaperPreset[] = [
  // 미국·캐나다 가정용 프린터의 기본 용지(8.5 × 11 in). 미국이 핵심 시장이라 맨 앞에 둔다.
  { id: 'Letter', name: 'US Letter', width: 215.9, height: 279.4 },
  { id: 'A4', name: 'A4', width: 210, height: 297 },
  { id: 'A5', name: 'A5', width: 148, height: 210 },
];

/** Letter를 쓰는 나라(지역 코드). 나머지는 A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PR']);

/**
 * 처음 고를 용지 — 브라우저 언어의 지역이 Letter를 쓰는 나라면 Letter, 아니면 A4.
 * 지역이 빠진 언어('en')는 가장 흔한 지역으로 채워 본다(en → US, ko → KR).
 */
export function defaultPaperId(locale: string): 'Letter' | 'A4' {
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).maximize().region;
  } catch {
    return 'A4';
  }
  return region && LETTER_REGIONS.has(region) ? 'Letter' : 'A4';
}

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
/*
 * 이름은 미국 링 플래너 커뮤니티가 부르는 말이다(2026-10-17, 미국 출시 대비) — 한국식 ‘DA6’ 대신 Personal,
 * ‘M6’ 대신 Pocket. id는 저장된 다이어리가 가리키므로 그대로 둔다.
 */
export const INSERT_PRESETS: InsertPreset[] = [
  { id: 'A5', name: 'A5', width: 148, height: 210, holeCount: 6, groupGap: 70, markSize: 6 },
  { id: 'TA6', name: 'A6', width: 105, height: 148, holeCount: 6, groupGap: 38, markSize: 6 },
  { id: 'DA6', name: 'Personal', width: 95, height: 171, holeCount: 6, groupGap: 51, markSize: 6 },
  { id: 'M6', name: 'Pocket (M6)', width: 80, height: 125, holeCount: 6, groupGap: null, markSize: 4 },
  { id: 'M5', name: 'Mini (M5)', width: 62, height: 105, holeCount: 5, groupGap: null, markSize: 4 },
  { id: 'M6TRI', name: 'Pocket Tri-fold', width: 220, height: 125, holeCount: 6, groupGap: null, markSize: 4 },
  { id: 'M5TRI', name: 'Mini Tri-fold', width: 202, height: 105, holeCount: 5, groupGap: null, markSize: 4 },
  { id: 'DA9', name: 'Micro', width: 60, height: 80, holeCount: 3, groupGap: null, markSize: 4 },
];

/* ────────────────────────── 규격 계열 ────────────────────────── */

export function findInsertPreset(id: string): InsertPreset | undefined {
  return INSERT_PRESETS.find((p) => p.id === id);
}

export function findPaperPreset(id: string): PaperPreset | undefined {
  return PAPER_PRESETS.find((p) => p.id === id);
}
