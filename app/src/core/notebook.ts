import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import { initHistory, type History } from './history';
import type { DiaryObject } from './objects';
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

/**
 * 노트의 "반쪽" 하나 — 표지 앞면·뒷면, 또는 내지 한 쪽.
 *
 * 속지의 앞면·뒷면이 각자 그린 것·되돌리기 이력을 따로 갖는 것과 같은
 * 이유로, 반쪽마다 따로 갖는다. **도트 격자도 따로 갖는다** — 속지의
 * 앞뒤와 달리(Template.dotGrid, 공유값), 노트는 쪽마다 다른 격자를 쓰고
 * 싶을 수 있다(사용자 요청).
 */
export interface NotebookHalf {
  objects: History<DiaryObject[]>;
  dotGrid: DotGrid;
}

export function newNotebookHalf(): NotebookHalf {
  return { objects: initHistory<DiaryObject[]>([]), dotGrid: { ...DEFAULT_DOT_GRID } };
}

/** 복제할 때 쓴다. duplicateTemplate과 같은 이유로 실행취소 이력은 물려주지 않는다. */
export function duplicateNotebookHalf(h: NotebookHalf): NotebookHalf {
  return { objects: initHistory([...h.objects.present]), dotGrid: { ...h.dotGrid } };
}

/** 노트를 처음 만들 때 쪽수. 대부분 접었다 펴며 손보므로 흔한 값(장 2개)으로 시작한다. */
export const DEFAULT_NOTEBOOK_PAGE_COUNT = 8;

/**
 * 종이 한 장을 접으면 쪽 4개(앞면 좌우 + 뒷면 좌우)가 나온다 — "장"은
 * 늘 4쪽 단위로만 늘어난다. 사용자가 4의 배수가 아닌 쪽수를 입력하면
 * 다음 4의 배수까지 빈 쪽으로 채운다. 최소 4쪽(한 장)이다.
 */
export function paddedPageCount(count: number): number {
  return Math.max(4, Math.ceil(count / 4) * 4);
}

/** 물리적 장 한 장 — 앞면 좌·우, 뒷면 좌·우에 어느 쪽(0부터 세는 쪽 번호)이 오는지. */
export interface SheetImposition {
  sheet: number;
  frontLeft: number;
  frontRight: number;
  backLeft: number;
  backRight: number;
}

/**
 * 새들스티치(가운데를 스테이플러로 찍는) 인쇄 배치.
 *
 * 장 여러 개를 겹쳐 접어 하나로 묶으므로(시그니처 하나), 가장 바깥 장이
 * 첫 쪽·마지막 쪽을 담고 안쪽 장으로 갈수록 가운데 쪽에 가까워진다 —
 * 예를 들어 4쪽(장 1개)이면 앞면이 [4쪽|1쪽], 뒷면이 [2쪽|3쪽]이라
 * 접으면 1·2·3·4 순서로 읽힌다.
 *
 * `pageCount`는 4의 배수여야 한다(`paddedPageCount`로 미리 맞춘다).
 * 쪽 번호는 0부터 센다(0번 = 1쪽).
 */
export function notebookImposition(pageCount: number): SheetImposition[] {
  const sheets = pageCount / 4;
  return Array.from({ length: sheets }, (_, i) => ({
    sheet: i,
    frontLeft: pageCount - 1 - 2 * i,
    frontRight: 2 * i,
    backLeft: 2 * i + 1,
    backRight: pageCount - 2 - 2 * i,
  }));
}
