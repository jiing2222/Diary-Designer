import { cleanStyle, type TextStyle } from './objects';

/**
 * 저장한 글자 스타일(세부계획 A8 결정 2026-09-28·2026-10-12).
 *
 * ‘섹션 제목’, ‘작은 캡션’처럼 글자 모양에 이름을 붙여 둔다. **모든 작업 공통**이다 — 앱 전체
 * 설정(storage/v2의 meta)에 둔다. 색은 팔레트 이름표(`@A`)일 수 있고, 그러면 쓰는 작업의 A 색으로
 * 나온다.
 *
 * 누르면 고른 글자에, 고른 글자가 없으면 다음에 놓을 글자에 쓴다(store의 applyTextStyle).
 */
export interface SavedTextStyle {
  id: string;
  name: string;
  style: TextStyle;
}

/**
 * 스타일에 담는 것 — 글꼴·크기·간격·색·B·I·U·S. 정렬·세로 정렬·회전은 그 칸의 배치라 담지 않는다
 * (‘제목’ 스타일을 눌렀다고 오른쪽 정렬이던 칸이 왼쪽으로 가면 안 된다).
 */
export const SAVED_STYLE_KEYS = [
  'font',
  'size',
  'lineHeight',
  'letterSpacing',
  'color',
  'bold',
  'italic',
  'underline',
  'strike',
] as const satisfies readonly (keyof TextStyle)[];

/** 지금 글자 모양에서 저장할 것만 — 값이 없는(기본값을 따르는) 키는 담지 않는다. */
export function pickSavedStyle(style: TextStyle): TextStyle {
  const out: TextStyle = {};
  for (const key of SAVED_STYLE_KEYS) (out as Record<string, unknown>)[key] = style[key];
  return cleanStyle(out);
}

/**
 * 스타일을 쓸 때 줄 바꿀 값 — 담는 키를 **모두** 준다. 저장에 없는 키는 undefined라서 받는 쪽
 * (styleText 등)이 그 값을 지워 기본으로 돌린다. 그래야 누를 때마다 늘 같은 모양이 된다.
 */
export function stylePatchOf(saved: TextStyle): TextStyle {
  const out: TextStyle = {};
  for (const key of SAVED_STYLE_KEYS) (out as Record<string, unknown>)[key] = saved[key];
  return out;
}

/** 다음에 놓을 글자의 모양에 스타일을 얹는다 — 담는 키는 통째로 바꾸고, 정렬·회전은 그대로. */
export function applyToDraft(draft: TextStyle, saved: TextStyle): TextStyle {
  const kept: TextStyle = { ...draft };
  for (const key of SAVED_STYLE_KEYS) delete kept[key];
  return cleanStyle({ ...kept, ...pickSavedStyle(saved) });
}
