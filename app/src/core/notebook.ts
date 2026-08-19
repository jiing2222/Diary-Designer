import type { Mm } from './units';

/**
 * 노트 제작 — 스테이플러·바느질로 매는 노트.
 *
 * 완성 페이지를 가로 중심에서 접어 만들기 때문에, 실제로 그리는 양식의
 * 가로는 완성 페이지 가로의 두 배다(세로는 그대로 — 접는 축이 가로뿐이다).
 *
 * 재단여백은 계산에 넣지 않는다. 접었을 때 양 끝(좌·우)에 대략 이만큼
 * 여유가 있으면 좋다는 **화면 안내일 뿐**이고(`NOTEBOOK_TRIM_GUIDE`),
 * 실제 치수·재단선에는 관여하지 않는다 — 얼마나 자를지는 사용자가
 * 정한다.
 */
export const NOTEBOOK_TRIM_GUIDE: Mm = 5;

/** 완성 페이지 크기에서 실제로 그릴 양식 크기를 낸다. */
export function notebookInsertSize(pageWidth: Mm, pageHeight: Mm): { width: Mm; height: Mm } {
  return { width: pageWidth * 2, height: pageHeight };
}
