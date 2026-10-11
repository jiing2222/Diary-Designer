import { INSERT_PRESETS, findInsertPreset, type InsertPreset } from './presets';
import { DEFAULT_PUNCH, type PunchSetting } from './punch';
import type { Mm } from './units';

/**
 * 내 다이어리 — 사용자가 등록한 바인더 한 권(리뉴얼, design/리뉴얼/기본계획.md 7장).
 *
 * **규격(M6·A5…)이 아니라 실측값을 지닌다.** 같은 M6라도 브랜드마다 세로가
 * 125~128mm로 다르고 구멍 위치도 조금씩 다르다. 이 앱은 mm 정확도가 생명이라,
 * 같은 규격으로 묶여도 치수를 합치지 않는다. `presetId`는 "어느 규격에 가까운가"를
 * 보여주는 이름표일 뿐이다(`nearestPreset`).
 *
 * 작업(core/work)은 다이어리를 id로 가리키고, 크기는 언제나 여기서 읽는다.
 */
export interface Diary {
  id: string;
  name: string;
  /** 작업 카드의 색 점. Library에서 이름 대신 이 색으로 다이어리를 구별한다. */
  color: string;
  /** 가장 가까운 규격. 어느 규격에도 가깝지 않으면 'custom'. */
  presetId: string;
  width: Mm;
  height: Mm;
  punch: PunchSetting;
}

/**
 * 같은 규격으로 보는 허용 오차(사용자 결정, 2026-10-11).
 *
 * 75×125도 M6다. 가로·세로 각각 이 값 안이면 그 규격으로 친다.
 */
export const PRESET_TOLERANCE: Mm = 10;

/**
 * 이 크기에 가장 가까운 규격. 가로·세로가 모두 허용 오차 안인 것들 중에서
 * 차이(가로 차 + 세로 차)가 가장 작은 것. 없으면 null.
 */
export function nearestPreset(width: Mm, height: Mm): InsertPreset | null {
  let best: { preset: InsertPreset; diff: Mm } | null = null;
  for (const preset of INSERT_PRESETS) {
    const dw = Math.abs(preset.width - width);
    const dh = Math.abs(preset.height - height);
    if (dw > PRESET_TOLERANCE || dh > PRESET_TOLERANCE) continue;
    const diff = dw + dh;
    if (!best || diff < best.diff) best = { preset, diff };
  }
  return best?.preset ?? null;
}

/** 다이어리 색 점의 기본 순서. 새 다이어리마다 다음 색을 준다. */
export const DIARY_COLORS = ['#2e2723', '#8ea8c6', '#c9a27a', '#6b4e3d', '#4f6e94', '#edd99a', '#b9b4ab'];

/** 이미 쓴 색을 피해 다음 색을 고른다. 다 썼으면 처음부터 돈다. */
export function nextDiaryColor(used: string[]): string {
  return DIARY_COLORS.find((c) => !used.includes(c)) ?? DIARY_COLORS[used.length % DIARY_COLORS.length];
}

/**
 * 규격 이름표. 규격에 가까우면 "M6 (미니6) · 80×126", 아니면 "80×126".
 * 규격과 정확히 같으면 치수를 덧붙이지 않는다.
 */
export function diarySizeLabel(d: Pick<Diary, 'width' | 'height'>): string {
  const preset = nearestPreset(d.width, d.height);
  const size = `${d.width}×${d.height}`;
  if (!preset) return size;
  if (preset.width === d.width && preset.height === d.height) return preset.name;
  return `${preset.name} · ${size}`;
}

/** 규격에서 새 다이어리를 만든다. 크기·구멍은 규격 값으로 채운다. */
export function diaryFromPreset(id: string, presetId: string, name: string, color: string): Diary {
  const preset = findInsertPreset(presetId) ?? INSERT_PRESETS[0];
  return {
    id,
    name,
    color,
    presetId: preset.id,
    width: preset.width,
    height: preset.height,
    punch: {
      ...DEFAULT_PUNCH,
      holeCount: preset.holeCount,
      groupGap: preset.groupGap,
      markSize: preset.markSize,
    },
  };
}

/**
 * 두 다이어리가 같은 종이인가 — 크기와 구멍 배치가 모두 같은가.
 *
 * 옛 양식을 옮길 때 같은 종이끼리 다이어리 하나로 묶는 데 쓴다(core/migrate).
 * 화면 표시용 값(`show`·`markSize`)은 종이가 아니므로 비교하지 않는다.
 */
export function samePaper(
  a: Pick<Diary, 'width' | 'height' | 'punch'>,
  b: Pick<Diary, 'width' | 'height' | 'punch'>,
): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.punch.holeCount === b.punch.holeCount &&
    a.punch.groupGap === b.punch.groupGap &&
    a.punch.edgeToHole === b.punch.edgeToHole &&
    a.punch.offsetY === b.punch.offsetY &&
    a.punch.safeZoneWidth === b.punch.safeZoneWidth
  );
}
