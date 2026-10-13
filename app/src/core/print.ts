import { computeLayout, mirrorLayout, turnLayout180, type Align, type Layout } from './layout';
import { cutStackPage, filledSlots, sheetsNeeded } from './template';
import type { Mm } from './units';

/**
 * 작업을 종이에 싣는 순서(리뉴얼 6단계, 세부계획 A14).
 *
 * 작업은 면(Face)이 차례로 놓인 목록이다(core/work). 종이에 찍을 때는 **속지 한 장**이 단위다 —
 * 양면이면 면 0·1이 1장의 앞·뒤, 2·3이 2장의 앞·뒤…(core/work의 `sheetSideOf`와 같은 규칙).
 * 단면이면 면마다 한 장의 앞면이다. 속지들은 용지의 칸에 차례로 들어간다(pdf/export의 세트형 경로).
 */

/** 속지 한 장 — 앞·뒷면에 찍을 면의 번호(0부터). 뒷면이 없으면 null(단면, 또는 홀수 페이지의 마지막 장). */
export interface PrintCard {
  front: number;
  back: number | null;
}

export function printCards(faceCount: number, duplex: boolean): PrintCard[] {
  const cards: PrintCard[] = [];
  if (!duplex) {
    for (let i = 0; i < faceCount; i++) cards.push({ front: i, back: null });
    return cards;
  }
  for (let i = 0; i < faceCount; i += 2) cards.push({ front: i, back: i + 1 < faceCount ? i + 1 : null });
  return cards;
}

/**
 * ‘페이지 선택’ 글자(`1-5, 8`)를 면 번호(0부터)로. 페이지 번호는 편집 화면의 p.N(1부터)이다.
 * 범위를 벗어난 번호는 무시하고, 알아볼 수 없는 조각이 있으면 그 조각을 알려준다.
 */
export function parsePageRange(text: string, faceCount: number): { faces: number[] } | { error: string } {
  const out = new Set<number>();
  for (const raw of text.replace(/\s*([-~])\s*/g, '$1').split(/[,\s]+/)) {
    const part = raw.trim();
    if (part === '') continue;
    const m = part.match(/^(\d+)(?:\s*[-~]\s*(\d+))?$/);
    if (!m) return { error: part };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (let p = Math.max(1, lo); p <= Math.min(faceCount, hi); p++) out.add(p - 1);
  }
  return { faces: [...out].sort((x, y) => x - y) };
}

/** 면 번호들(0부터)을 ‘페이지 선택’ 글자로 — 이어지는 번호는 묶는다(`[0,1,2,4]` → `1-3, 5`). parsePageRange의 반대. */
export function formatPageRange(faces: number[]): string {
  const pages = [...new Set(faces)].sort((a, b) => a - b).map((f) => f + 1);
  const parts: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(i === j ? String(pages[i]) : `${pages[i]}-${pages[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/**
 * 속지마다 `copies`부. 같은 속지를 **이어서** 늘어놓으므로 칸이 4개인 용지라면 한 장이 같은
 * 속지 4개로 찬다(사용자 요청 — 양식 하나를 한 장에 가득). 앞·뒤는 카드째로 늘어나 짝이
 * 어긋나지 않는다.
 */
export function repeatCards(cards: PrintCard[], copies: number): PrintCard[] {
  const n = Math.max(1, Math.floor(copies) || 1);
  return n === 1 ? cards : cards.flatMap((c) => Array.from({ length: n }, () => c));
}

/** 고른 면이 하나라도 든 속지만 — 양면이면 고른 페이지의 앞·뒤가 함께 나온다(세부계획 A14 결정). */
export function cardsForFaces(cards: PrintCard[], faces: number[] | null): PrintCard[] {
  if (!faces) return cards;
  const picked = new Set(faces);
  return cards.filter((c) => picked.has(c.front) || (c.back !== null && picked.has(c.back)));
}

/**
 * 속지가 용지에서 차지하는 영역(구현전략 ‘바닥 2’). 배치(core/layout)는 속지 크기를 직접 보지
 * 않고 이것을 묻는다 — 지금은 속지 그대로의 직사각형이지만, 인덱스 탭(기능후보 6)이 생기면
 * 탭만큼 넓어진 영역을 돌려주면 된다.
 */
export function insertFootprint(insert: { width: Mm; height: Mm }): { width: Mm; height: Mm } {
  return { width: insert.width, height: insert.height };
}

/** 필요한 용지 장수(앞뒤 한 장 = 1장). 속지 수를 한 장의 칸 수로 나눠 올림. */
export function sheetCount(cardCount: number, slotsPerSheet: number): number {
  return sheetsNeeded(cardCount, slotsPerSheet);
}

/**
 * 이 용지(sheet)의 이 칸(slot)에 들어갈 속지 번호. 빈 칸이면 null.
 * **미리보기(ui/Print)와 PDF(pdf/export)가 이 함수 하나를 쓴다** — 둘이 따로 계산하면 화면에서 본
 * 칸 배정과 인쇄물이 달라진다. 겹치기 배치(자른 뒤 쌓으면 순서대로)를 켜면 칸마다 연속된 구간을 맡는다.
 */
export function cardAt(
  sheet: number,
  slot: number,
  totalCards: number,
  slotsPerSheet: number,
  cutStack: { on: boolean; group?: number },
): number | null {
  if (cutStack.on) return cutStackPage(sheet, slot, totalCards, slotsPerSheet, cutStack.group);
  return slot < filledSlots(sheet, totalCards, slotsPerSheet) ? sheet * slotsPerSheet + slot : null;
}

/**
 * 뒷면 배치 — 칸 위치를 뒤집고(긴 변으로 넘기는 프린터), 짧은 변으로 넘기는 프린터면 반 바퀴 더
 * 돌린다(core/layout의 mirrorLayout·turnLayout180). 미리보기와 PDF가 같이 쓴다.
 */
export function backLayoutOf(layout: Layout, paperWidth: Mm, paperHeight: Mm, backTurn180: boolean): Layout {
  const m = mirrorLayout(layout, paperWidth, paperHeight);
  return backTurn180 ? turnLayout180(m, paperWidth, paperHeight) : m;
}

/** 용지 — 프리셋 크기와 방향, 프린터가 못 찍는 가장자리. */
export interface PrintPaper {
  width: Mm;
  height: Mm;
  landscape: boolean;
  printMargin: Mm;
}

/** 실제 용지 크기 — 가로 방향이면 가로·세로를 바꾼다. */
export function paperSize(paper: Pick<PrintPaper, 'width' | 'height' | 'landscape'>): { width: Mm; height: Mm } {
  return paper.landscape ? { width: paper.height, height: paper.width } : { width: paper.width, height: paper.height };
}

/** 용지 위 배치 — 속지 영역(`insertFootprint`)을 용지에 몇 개, 어떻게 놓을지(core/layout). */
export function printLayout(
  settings: { paper: PrintPaper; gap: Mm; allowRotate: boolean; align: Align },
  insert: { width: Mm; height: Mm },
): Layout {
  const { width, height } = paperSize(settings.paper);
  const area = insertFootprint(insert);
  return computeLayout({
    paperWidth: width,
    paperHeight: height,
    insertWidth: area.width,
    insertHeight: area.height,
    gap: settings.gap,
    printMargin: settings.paper.printMargin,
    allowRotate: settings.allowRotate,
    align: settings.align,
  });
}
