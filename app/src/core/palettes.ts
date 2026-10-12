import { addPoint, defaultWorkPalette, type WorkPalette } from './colors';

/**
 * 저장한 팔레트(리뉴얼 7-4, 세부계획 A13 결정 2026-09-28 · B ‘Library 화면 시안’).
 *
 * Library → Colors에 팔레트를 보관해 둔다. **모든 작업 공통**이다 — 저장한 글자 스타일처럼 앱 전체
 * 설정(storage/v2의 meta)에 둔다. 편집기에서 ‘불러오기’를 하면 현재 작업에 **복사**된다 — 나중에
 * 보관한 팔레트를 고쳐도 이미 만든 작업은 바뀌지 않는다.
 */
export interface SavedPalette {
  id: string;
  name: string;
  palette: WorkPalette;
}

/** 팔레트를 떼어낸 복사본 — 보관함과 작업이 같은 객체를 나눠 쓰지 않게. */
export function clonePalette(p: WorkPalette): WorkPalette {
  return { base: { ...p.base }, points: p.points.map((pt) => ({ ...pt })) };
}

/** 새 팔레트 — 기본 5칸(블랙 계열)과 포인트 A 하나. */
export function newSavedPalette(id: string, name: string): SavedPalette {
  return { id, name, palette: addPoint(defaultWorkPalette(), '#8ea8c6') };
}

/**
 * 불러오기 — **같은 칸만 덮어쓴다**(2026-10-12 결정). 기본 5칸과 이름이 같은 포인트는 불러온 색이
 * 되고, 작업에만 있는 포인트(예: C)는 그대로 남아 그것을 쓰던 요소가 깨지지 않는다. 불러온 쪽에만
 * 있는 포인트는 더한다. 포인트 순서는 작업의 것을 지키고 새것은 뒤에.
 */
export function mergePalette(current: WorkPalette, loaded: WorkPalette): WorkPalette {
  const incoming = new Map(loaded.points.map((p) => [p.key, p.color]));
  const points = current.points.map((p) => ({ key: p.key, color: incoming.get(p.key) ?? p.color }));
  const have = new Set(points.map((p) => p.key));
  for (const p of loaded.points) if (!have.has(p.key)) points.push({ ...p });
  return { base: { ...loaded.base }, points };
}
