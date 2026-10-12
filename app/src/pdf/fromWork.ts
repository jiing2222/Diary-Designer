import type { ExportInput, SlotContent } from './export';
import type { ResolvedFace, Work } from '../core/work';
import type { Diary } from '../core/diary';
import type { Align } from '../core/layout';
import type { CropMode } from '../core/crop';
import type { Mm } from '../core/units';
import { DEFAULT_DOT_GRID } from '../core/grid';
import { resolveObjectColors } from '../core/colors';
import { resolveRuleColors } from '../core/colorRules';
import { cardsForFaces, paperSize, printCards, printLayout, type PrintCard, type PrintPaper } from '../core/print';

/**
 * 작업을 PDF 재료로(리뉴얼 6단계). pdf/export의 세트형 경로 — 칸 하나가 속지 한 장(앞·뒤)이고,
 * 장을 가로질러 차례로 채운다 — 에 그대로 싣는다.
 *
 * 면의 내용은 **편집 화면이 그리는 것과 같은 펼친 면**(core/work의 expandWork — 날짜·페이지
 * 번호·색 규칙이 채워진 것)을 받는다. 여기서는 팔레트 이름표를 실제 색으로 풀기만 한다.
 */
export interface WorkPrintSettings {
  paper: PrintPaper;
  gap: Mm;
  allowRotate: boolean;
  align: Align;
  cropMark: CropMode;
  cropFrontOnly: boolean;
  showRuler: boolean;
  backTurn180: boolean;
  cutStack: boolean;
  cutStackGroup: number;
  /** 양면 작업의 빈 뒷면(홀수 페이지의 마지막 장)에 앞면과 같은 바탕(도트)을 찍을지 — 끄면 빈 종이(세부계획 A14 결정). */
  blankBackGrid: boolean;
  /** 출력 면 — 수동 양면 인쇄용(앞면만 / 뒷면만 / 둘 다). */
  sides: 'both' | 'front' | 'back';
  /**
   * PDF 전 확인 창에서 고른 것(기능후보 9, 세부계획 A14). 격자를 끄면 모든 면의 바탕을 찍지 않고,
   * 켜면 면마다 정한 대로(Page → Background의 인쇄). 타공 표시를 켜면 구멍 자리에 얇은 원을 찍는다.
   */
  printGrid: boolean;
  printPunch: boolean;
}

/** 이번에 찍을 속지들 — 고른 페이지(면 번호)가 있으면 그것이 든 속지만. */
export function cardsToPrint(work: Pick<Work, 'duplex'>, faceCount: number, pickedFaces: number[] | null): PrintCard[] {
  return cardsForFaces(printCards(faceCount, work.duplex), pickedFaces);
}

export function workExportInput(
  work: Work,
  diary: Diary,
  faces: ResolvedFace[],
  settings: WorkPrintSettings,
  pickedFaces: number[] | null,
  files: Pick<ExportInput, 'fontBytes' | 'userFonts' | 'userImages'> = {},
): ExportInput {
  const cards = cardsToPrint(work, faces.length, pickedFaces);
  const grid = (g: ResolvedFace['background']) => (settings.printGrid ? g : { ...g, print: false });
  const punch = settings.printPunch ? diary.punch : undefined;
  const content = (face: ResolvedFace): SlotContent => ({
    dotGrid: grid(face.background),
    objects: resolveObjectColors(face.objects, work.palette),
    safeZoneWidth: diary.punch.safeZoneWidth,
    month: face.month,
    punch,
  });

  const fronts = new Map<number, SlotContent>();
  const backs = new Map<number, SlotContent>();
  cards.forEach((card, i) => {
    const front = faces[card.front];
    fronts.set(i, content(front));
    if (card.back !== null) backs.set(i, content(faces[card.back]));
    else if (work.duplex && settings.blankBackGrid) {
      // 빈 뒷면에 바탕만 — 앞면과 같은 도트·격자, 글자·그림은 없다.
      backs.set(i, { dotGrid: grid(front.background), objects: [], safeZoneWidth: diary.punch.safeZoneWidth, punch });
    }
  });

  const { width, height } = paperSize(settings.paper);
  const first = faces[cards[0]?.front ?? 0];
  return {
    paperWidth: width,
    paperHeight: height,
    layout: printLayout(settings, diary),
    // 세트형 경로라 칸마다 위의 내용을 쓴다 — 이 기본값(dotGrid·objects)은 그려지지 않는다.
    dotGrid: first?.background ?? DEFAULT_DOT_GRID,
    objects: [],
    safeZoneWidth: diary.punch.safeZoneWidth,
    datasetOverrides: fronts,
    datasetBackOverrides: backs,
    datasetPages: cards.length,
    duplex: work.duplex,
    backTurn180: settings.backTurn180,
    cropMark: settings.cropMark,
    cropFrontOnly: settings.cropFrontOnly,
    showRuler: settings.showRuler,
    cutStack: settings.cutStack,
    cutStackGroup: settings.cutStackGroup || undefined,
    sides: work.duplex ? settings.sides : 'front',
    colorRules: resolveRuleColors(work.colorRules, work.palette),
    ...files,
  };
}
