import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import { initHistory, type History } from './history';
import { moveObject, type DiaryObject } from './objects';
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

/** 양식 가로에서 완성 페이지(반쪽 하나) 가로를 거꾸로 낸다. */
export function notebookPageWidth(insertWidth: Mm): Mm {
  return insertWidth / 2;
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
 * 노트 안의 반쪽 하나를 가리키는 자리 — 표지 앞/뒤, 또는 내지 몇 번째 쪽.
 * `index`는 0부터(0 = 1쪽).
 */
export type NotebookSlotRef = { part: 'cover'; side: 'front' | 'back' } | { part: 'page'; index: number };

/**
 * 종이 한 장을 접으면 쪽 4개(앞면 좌우 + 뒷면 좌우)가 나온다 — "장"은
 * 늘 4쪽 단위로만 늘어난다. 사용자가 4의 배수가 아닌 쪽수를 입력하면
 * 다음 4의 배수까지 빈 쪽으로 채운다. 최소 4쪽(한 장)이다.
 */
export function paddedPageCount(count: number): number {
  return Math.max(4, Math.ceil(count / 4) * 4);
}

/**
 * 쪽수를 바꾼다. 늘어난 자리는 새 반쪽(빈 채로)으로 채우고, 줄어들면
 * 뒤쪽부터 잘라낸다 — 실제 배열 길이는 `paddedPageCount(count)`를 따른다.
 * 남는 자리(원한 쪽수가 4의 배수가 아닐 때)는 빈 쪽으로 존재하되 여전히
 * 그릴 수 있다.
 */
export function resizePages(pages: NotebookHalf[], count: number): NotebookHalf[] {
  const target = paddedPageCount(count);
  if (pages.length === target) return pages;
  if (pages.length > target) return pages.slice(0, target);
  return [...pages, ...Array.from({ length: target - pages.length }, newNotebookHalf)];
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

/**
 * 왼쪽 반쪽·오른쪽 반쪽을 인쇄될 한 장(완성 폭 전체)의 그린 것으로 합친다.
 *
 * 왼쪽은 자기 좌표(0~pageWidth)를 그대로 쓰고, 오른쪽은 `pageWidth`만큼
 * 오른쪽으로 밀어 자기 자리(pageWidth~2×pageWidth)로 옮긴다 — 편집
 * 화면에서 두 반쪽이 완전히 독립된 좌표계를 갖는 것과 짝을 이루는 계산이다.
 *
 * **격자는 왼쪽 반쪽 것만 쓴다.** 인쇄 파이프라인(SlotContent)이 칸 하나에
 * 격자 하나만 그릴 수 있어서다 — 좌우가 다른 격자를 쓰면 인쇄물엔 왼쪽
 * 것만 보인다(알려진 단순화, 진행상황.md 참고).
 */
export function composeSpread(
  left: NotebookHalf,
  right: NotebookHalf,
  pageWidth: Mm,
): { objects: DiaryObject[]; dotGrid: DotGrid } {
  return {
    objects: [...left.objects.present, ...right.objects.present.map((o) => moveObject(o, pageWidth, 0))],
    dotGrid: left.dotGrid,
  };
}

export interface NotebookCover {
  front: NotebookHalf;
  back: NotebookHalf;
}

/** 표지까지 합친, 인쇄될 전체 장 수(0번 = 표지 1장 + 내지 장 수). */
export function notebookPrintUnitCount(imposition: SheetImposition[]): number {
  return imposition.length + 1;
}

/**
 * 인쇄 단위 하나(0번 = 표지, 1번부터 = 내지)의 앞·뒤 내용.
 *
 * 표지는 뒤표지(왼쪽)+앞표지(오른쪽)를 합쳐 앞면으로 삼고, 표지 안쪽(뒷면)은
 * 아직 디자인할 자리가 없어 `null`을 낸다 — 부르는 쪽이 속지 뒷면 없을 때와
 * 같은 규칙(`fillEmptyBack`)으로 채울지 완전히 비울지 정한다.
 *
 * 내지는 `notebookImposition`이 정한 대로 앞면 = frontLeft+frontRight,
 * 뒷면 = backLeft+backRight를 합친다.
 */
export function notebookPrintUnit(
  cover: NotebookCover,
  pages: NotebookHalf[],
  imposition: SheetImposition[],
  pageWidth: Mm,
  unit: number,
): {
  front: { objects: DiaryObject[]; dotGrid: DotGrid };
  back: { objects: DiaryObject[]; dotGrid: DotGrid } | null;
} {
  if (unit === 0) {
    return { front: composeSpread(cover.back, cover.front, pageWidth), back: null };
  }
  const sheet = imposition[unit - 1];
  return {
    front: composeSpread(pages[sheet.frontLeft], pages[sheet.frontRight], pageWidth),
    back: composeSpread(pages[sheet.backLeft], pages[sheet.backRight], pageWidth),
  };
}

/** 폰트·이미지 수집처럼 "이 노트에 쓰인 모든 그린 것"이 필요할 때 쓴다. */
export function allNotebookObjects(cover: NotebookCover, pages: NotebookHalf[]): DiaryObject[] {
  return [cover.front, cover.back, ...pages].flatMap((h) => h.objects.present);
}

/**
 * "2~4, 6" 같은 쪽 범위 입력을 실제 쪽 번호(1부터) 목록으로 판독한다 —
 * "복사하기"에서 쓴다. 쉼표로 나눈 조각마다 단일 쪽("6")이거나 범위
 * ("2~4")다. **잘못 친 조각은 그냥 건너뛴다** — 하나 잘못 쳤다고 나머지
 * 입력까지 전부 막을 이유가 없다. `maxPage`를 벗어난 값도 뺀다. 결과는
 * 중복 없이 오름차순으로 정렬된다.
 */
export function parsePageRange(input: string, maxPage: number): number[] {
  const result = new Set<number>();
  for (const token of input.split(',')) {
    const trimmed = token.trim();
    const range = trimmed.match(/^(\d+)\s*~\s*(\d+)$/);
    if (range) {
      const lo = Math.min(Number(range[1]), Number(range[2]));
      const hi = Math.max(Number(range[1]), Number(range[2]));
      for (let n = lo; n <= hi; n++) if (n >= 1 && n <= maxPage) result.add(n);
      continue;
    }
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (n >= 1 && n <= maxPage) result.add(n);
    }
  }
  return [...result].sort((a, b) => a - b);
}
