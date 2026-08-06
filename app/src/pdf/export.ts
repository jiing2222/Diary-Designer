import {
  LineCapStyle,
  PDFDocument,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { mmToPt, ptToMm, type Mm } from '../core/units';
import {
  alignOf,
  boldOf,
  leftOf,
  lineBaselines,
  lineHeightOf,
  sizeOf,
  splitLines,
  valignOf,
} from '../core/text';
import { mirrorLayout, type Layout } from '../core/layout';
import { cropSegments, type CropMode } from '../core/crop';
import { gridArea, gridLattice, gridShapes, type DotGrid } from '../core/grid';
import { capacityPerSheet, frontBackFilled, sheetsNeeded } from '../core/template';
import { insertSizeOf, placeSlot } from '../core/place';
import { colorOf, dashPattern, dashPatternOf, widthOf } from '../core/line';
import {
  CONTENT_COLOR,
  CROP_COLOR,
  CROP_WIDTH,
  DOT_SIZE,
  GRID_LINE_WIDTH,
  OBJECT_LINE_CAP,
  RULER_COLOR,
  RULER_WIDTH,
  TEXT_COLOR,
  hexToRgb,
} from '../core/style';
import { isLine, isText, type DiaryObject, type TextObject } from '../core/objects';

/**
 * PDF 생성.
 *
 * 화면(SVG)과 완전히 독립적으로, 문서 모델의 mm 값에서 직접 벡터를 그린다.
 * 캔버스를 이미지로 떠서 넣는 방식은 절대 쓰지 않는다. 그러면 실제 치수가
 * 어긋나고 인쇄 품질이 무너진다.
 */

/** 칸 하나에 실제로 그려지는 내용. */
export interface SlotContent {
  dotGrid: DotGrid;
  objects: DiaryObject[];
  safeZoneWidth: Mm;
}

interface ExportInput {
  paperWidth: Mm;
  paperHeight: Mm;
  layout: Layout;
  dotGrid: DotGrid;
  /** 사용자가 그린 것들 */
  objects: DiaryObject[];
  /** 속지 글꼴 파일. 글자가 있을 때만 쓰인다. */
  fontBytes?: ArrayBuffer | Uint8Array;
  /** 굵게용 글꼴 파일. 굵은 글자가 실제로 있을 때만 쓰인다. */
  boldFontBytes?: ArrayBuffer | Uint8Array;
  /**
   * 사용자가 등록한 글꼴. `TextObject.font`의 id → 파일 바이트.
   *
   * 실제로 쓰이는 것만 담아 넘긴다. 등록만 해놓고 안 쓴 글꼴까지 심으면
   * 파일마다 수 MB씩 불어난다.
   */
  userFonts?: Map<string, ArrayBuffer | Uint8Array>;
  /** 타공 안전영역 폭. 격자가 이 영역을 피할지는 dotGrid가 정한다. */
  safeZoneWidth: Mm;
  /**
   * 낱장 조합 — 칸마다 다른 양식을 넣을 때, **기본값과 다른 칸만** 채운다.
   *
   * 키는 슬롯 번호(0부터, `layout.slots`와 같은 순서). 여기 없는 칸은 위의
   * `dotGrid`·`objects`·`safeZoneWidth`를 그대로 쓴다 — 지금까지의 "모든 칸이
   * 같은 양식"이라는 동작이 곧 이 맵이 비어 있는 경우다.
   *
   * 글꼴은 문서 전체에 한 번만 심는다. 칸마다 다른 양식이라도 텍스트가 있는
   * 칸이 하나라도 있으면 같은 글꼴로 전부 그린다 — 칸마다 다른 글꼴 파일을
   * 심으면 문서가 그만큼 무거워지고, 등록한 글꼴이 칸마다 다를 이유도 없다.
   */
  slotOverrides?: Map<number, SlotContent>;
  /**
   * 반복 인쇄 — 이 내용을 몇 칸어치 찍을지.
   *
   * **장수가 아니라 칸 수다.** 정하지 않으면 지금까지처럼 한 장, 모든 칸을 채운다.
   * 정하면 `ceil(totalSlots ÷ 칸 수)`장을 만들고, 마지막 장에서 모자라는 칸은
   * 완전히 비운다 — 내용을 억지로 채우거나 앞 칸을 복사해 늘리지 않는다.
   *
   * 도트 속지를 필요한 만큼만 뽑으려는 것이다. 54칸이 필요한데 한 장에 4칸씩
   * 이면 14장(56칸)이 나오는데, 마지막 장의 남는 2칸을 채우면 못 쓰는 속지
   * 2장이 더 생긴다.
   */
  totalSlots?: number;
  cropMark: CropMode;
  showRuler: boolean;
  /**
   * 양면 인쇄. 켜면 장마다 뒷면 페이지를 하나씩 더 넣는다.
   *
   * 칸 위치는 core/layout의 `mirrorLayout`로 좌우만 뒤집는다 — 칸 안의 내용은
   * 그대로다(설계문서 8장). 총 쪽수를 채우는 순서는 앞을 다 채운 뒤 뒤를
   * 채운다(core/template의 `frontBackFilled`).
   */
  duplex?: boolean;
  /**
   * 뒷면의 기본 내용 — 지금 양식의 뒷면. 양식에 뒷면이 없으면 `undefined`고,
   * 그 칸은 완전히 빈 채로 찍힌다.
   */
  defaultBack?: SlotContent;
  /**
   * 낱장 조합에서 칸마다 다른 뒷면. 키는 `layout.slots`와 같은 인덱스(앞면 기준).
   *
   * 값이 `null`이면 "그 칸에 배정된 양식엔 뒷면이 없다"는 뜻으로, `defaultBack`을
   * 대신 쓰지 않고 그 칸만 완전히 비운다. 맵에 아예 없는 칸은 `defaultBack`을 쓴다.
   */
  backSlotOverrides?: Map<number, SlotContent | null>;
}

/** 완전히 빈 칸. 반복 인쇄에서 마지막 장의 남는 칸에 쓴다. */
const BLANK_SLOT: SlotContent = {
  dotGrid: {
    style: 'dot',
    spacing: 1,
    avoidSafeZone: false,
    minMargin: 0,
    toEdge: false,
    dash: 'solid',
    showOnScreen: false,
    print: false,
  },
  objects: [],
  safeZoneWidth: 0,
};

const color = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
};

const CROP = color(CROP_COLOR);
const RULER = color(RULER_COLOR);
const DOT = color(CONTENT_COLOR.dot);
const GRID_LINE = color(CONTENT_COLOR.line);
const TEXT = color(TEXT_COLOR);

export async function buildPdf(input: ExportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  /** 칸 하나의 내용. 낱장 조합에서 정한 칸만 기본값을 벗어난다. */
  const resolveSlot = (i: number): SlotContent =>
    input.slotOverrides?.get(i) ?? {
      dotGrid: input.dotGrid,
      objects: input.objects,
      safeZoneWidth: input.safeZoneWidth,
    };

  /**
   * 뒷면 칸 하나의 내용. `null`로 정한 칸(그 칸 양식엔 뒷면이 없음)과 아예
   * 정하지 않은 칸(기본 뒷면을 씀)을 구분한다 — 앞면의 기본값 대체와 다른
   * 지점이다.
   */
  const resolveBackSlot = (i: number): SlotContent =>
    (input.backSlotOverrides?.has(i) ? input.backSlotOverrides.get(i) : input.defaultBack) ??
    BLANK_SLOT;

  /*
   * 속지 글꼴은 필요할 때만 심는다. 글자가 하나도 없으면 1.2MB를 넣을 이유가 없다.
   *
   * **서브셋을 쓰지 않는다.** pdf-lib의 서브셋 기능은 한글 글꼴에서 글리프를
   * 빠뜨린다 — "2027년 3월 셋째 주"가 "3월"로 나온다. 5KB와 1.2MB의 차이지만
   * 맞는 쪽을 택한다. 글꼴은 문서에 한 번만 들어가므로 쪽수가 늘어도 그대로다.
   *
   * 낱장 조합이면 기본값과 모든 override의 글자를 함께 본다 — 어느 칸에
   * 텍스트가 있든 글꼴은 문서 전체에 한 번만 심는다. 양면이면 뒷면 내용도 같이 본다.
   */
  const backOverrideContents = [...(input.backSlotOverrides?.values() ?? [])].filter(
    (c): c is SlotContent => c != null,
  );
  const allObjects = [
    input.objects,
    ...(input.slotOverrides ? [...input.slotOverrides.values()].map((c) => c.objects) : []),
    ...(input.defaultBack ? [input.defaultBack.objects] : []),
    ...backOverrideContents.map((c) => c.objects),
  ];
  const texts = allObjects.flatMap((list) => list.filter(isText));
  let bodyFont: PDFFont | null = null;
  let boldFont: PDFFont | null = null;
  const userFonts = new Map<string, PDFFont>();
  if (texts.length > 0 && input.fontBytes) {
    doc.registerFontkit(fontkit);
    bodyFont = await doc.embedFont(input.fontBytes, { subset: false });
    // 굵기마다 파일이 따로다. 굵은 글자가 하나도 없으면 심지 않는다.
    if (input.boldFontBytes && texts.some(boldOf)) {
      boldFont = await doc.embedFont(input.boldFontBytes, { subset: false });
    }
    // 등록 글꼴도 실제로 쓰이는 것만 심는다.
    for (const [id, b] of input.userFonts ?? []) {
      if (texts.some((t) => t.font === id)) {
        userFonts.set(id, await doc.embedFont(b, { subset: false }));
      }
    }
  }

  // PDF는 Y축이 위로 증가한다. 문서 모델은 아래로 증가하므로 여기서 뒤집는다.
  // 이 변환은 익스포터 안에만 존재하고 모델은 알지 못한다.
  const flipY = (y: Mm): Mm => input.paperHeight - y;

  const duplex = !!input.duplex;
  const slotsPerSheet = input.layout.slots.length;
  // 양면이면 한 장의 용량이 앞뒤를 합쳐 두 배다(core/template의 capacityPerSheet).
  // totalSlots를 정하지 않았으면 지금까지처럼 한 장, 모든 칸을 채운다.
  const sheets =
    input.totalSlots && input.totalSlots > 0 && slotsPerSheet > 0
      ? sheetsNeeded(input.totalSlots, capacityPerSheet(slotsPerSheet, duplex))
      : 1;
  // 칸 위치만 좌우로 뒤집은 배치. 재단선도 여기서 다시 계산해야 앞뒤가 같은
  // 자리에서 잘린다(core/layout의 mirrorLayout 주석 참고).
  const backLayout = duplex ? mirrorLayout(input.layout, input.paperWidth) : null;

  /** 한 면(앞 또는 뒤)을 그린다. 페이지·배치·칸 내용 판단 함수만 갈아끼운다. */
  function drawSide(page: PDFPage, layout: Layout, resolveForSheet: (i: number) => SlotContent) {
    // 층 순서가 화면과 같아야 한다. 도트 → 선 → 글자.
    // 인쇄 여부(dotGrid.print)는 칸마다 다를 수 있으므로 각 함수 안에서 칸별로 본다.
    drawDotGrid(page, layout, resolveForSheet, flipY);
    drawObjects(page, layout, resolveForSheet, flipY);
    if (bodyFont) {
      drawTexts(
        page,
        layout,
        resolveForSheet,
        { regular: bodyFont, bold: boldFont, user: userFonts },
        flipY,
      );
    }

    // 재단선과 눈금자는 속지 내용이 아니라 용지 위의 표시라 장마다 그 위에 얹는다.
    for (const s of cropSegments(layout, input.paperWidth, input.paperHeight, input.cropMark)) {
      page.drawLine({
        start: { x: mmToPt(s.x1), y: mmToPt(flipY(s.y1)) },
        end: { x: mmToPt(s.x2), y: mmToPt(flipY(s.y2)) },
        thickness: mmToPt(CROP_WIDTH),
        color: CROP,
      });
    }

    if (input.showRuler) {
      drawRuler(page, font, input.paperWidth, input.paperHeight, flipY);
    }
  }

  for (let sheet = 0; sheet < sheets; sheet++) {
    // 이 장에서 앞·뒤 각각 실제로 채울 칸 수. totalSlots가 없으면 언제나 전부다.
    // 마지막 장만 모자랄 수 있고, 그 나머지 칸은 완전히 비운다. 화면 미리보기와
    // 같은 core/template의 frontBackFilled를 쓴다 — 둘이 어긋나면 미리보기에서
    // 본 빈 칸이 실제 인쇄물과 달라진다.
    const { front, back } = input.totalSlots
      ? frontBackFilled(sheet, input.totalSlots, slotsPerSheet, duplex)
      : { front: slotsPerSheet, back: slotsPerSheet };

    const page = doc.addPage([mmToPt(input.paperWidth), mmToPt(input.paperHeight)]);
    drawSide(page, input.layout, (i) => (i < front ? resolveSlot(i) : BLANK_SLOT));

    if (duplex && backLayout) {
      const backPage = doc.addPage([mmToPt(input.paperWidth), mmToPt(input.paperHeight)]);
      drawSide(backPage, backLayout, (i) => (i < back ? resolveBackSlot(i) : BLANK_SLOT));
    }
  }

  return doc.save();
}

/**
 * 도트 격자.
 *
 * 화면이 그린 것을 베끼지 않는다. 같은 core/grid에서 좌표를 새로 받아
 * 벡터로 직접 그린다. 칸으로 옮기는 변환도 화면과 같은 core/place를 쓴다.
 */
function drawDotGrid(
  page: PDFPage,
  layout: Layout,
  resolveSlot: (i: number) => SlotContent,
  flipY: (y: Mm) => Mm,
) {
  layout.slots.forEach((slot, i) => {
    const { dotGrid: grid, safeZoneWidth } = resolveSlot(i);
    // 인쇄 여부는 칸마다 다를 수 있다 — 낱장 조합에서 어떤 양식은 격자를 끄고 쓴다.
    if (!grid.print) return;

    const insert = insertSizeOf(slot, layout.rotated);
    const place = placeSlot(slot, layout.rotated);

    const area = gridArea(insert, grid, safeZoneWidth);
    const lattice = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);
    // 인쇄물이므로 가장자리에 덧붙인 안내용 자리에는 도트를 찍지 않는다.
    const { dots, lines } = gridShapes(lattice, grid.style, grid.toEdge ? area : null, true);

    for (const d of dots) {
      const p = place.map(d.x, d.y);
      page.drawCircle({
        x: mmToPt(p.x),
        y: mmToPt(flipY(p.y)),
        size: mmToPt(DOT_SIZE / 2),
        color: DOT,
        borderWidth: 0,
      });
    }

    for (const l of lines) {
      const a = place.map(l.x1, l.y1);
      const b = place.map(l.x2, l.y2);
      page.drawLine({
        start: { x: mmToPt(a.x), y: mmToPt(flipY(a.y)) },
        end: { x: mmToPt(b.x), y: mmToPt(flipY(b.y)) },
        thickness: mmToPt(GRID_LINE_WIDTH),
        color: GRID_LINE,
        // 화면(ui/InsertView)과 같은 core/line에서 비율이 나온다. 굵기만 다르다.
        dashArray: dashPattern(grid.dash, GRID_LINE_WIDTH)?.map(mmToPt),
        lineCap: grid.dash === 'dotted' ? LineCapStyle.Round : LineCapStyle.Butt,
      });
    }
  });
}

/**
 * 사용자가 그린 것들.
 *
 * 좌표는 속지 기준 mm 그대로다. 화면이 그린 것을 베끼지 않고, 같은 모델에서
 * 같은 core/place 변환을 거쳐 벡터로 직접 그린다.
 */
/**
 * 글자.
 *
 * 놓는 자리는 화면과 같은 core/text가 정한다. 화면은 text-anchor에 맡기지만
 * PDF에는 그런 것이 없어서, 잰 폭만큼 왼쪽으로 물려 그린다. 여러 줄은 줄마다
 * 따로 그린다. 결과는 화면과 같다.
 *
 * **속지 영역으로 자른다.** 글자는 자기 상자를 넘칠 수 있지만(설계 원칙), 속지
 * 자체를 넘어가면 안 된다 — 재단선 너머까지 인쇄되면 옆 칸을 침범한다. 도트·선은
 * 애초에 격자 안에서만 그려지므로 자를 필요가 없고, 글자만 자른다.
 */
interface Fonts {
  regular: PDFFont;
  bold: PDFFont | null;
  /** 등록 글꼴. id로 찾는다. */
  user: Map<string, PDFFont>;
}

/**
 * 이 글자를 그릴 글꼴.
 *
 * 등록 글꼴이 먼저다. 그 글꼴에는 Bold 파일이 없으므로 굵게는 아예 끼지 않는다
 * (core/text의 canBold와 같은 규칙이다). 새로고침 뒤처럼 등록소에 없는 id가
 * 남아 있으면 기본 글꼴로 돌아간다 — 화면에서도 그렇게 보인다.
 */
function fontFor(t: TextObject, fonts: Fonts): PDFFont {
  if (t.font) return fonts.user.get(t.font) ?? fonts.regular;
  return boldOf(t) && fonts.bold ? fonts.bold : fonts.regular;
}

function drawTexts(
  page: PDFPage,
  layout: Layout,
  resolveSlot: (i: number) => SlotContent,
  /** 심어둔 글꼴들. `bold`가 없으면 굵은 글자가 없어서 심지 않은 것이다. */
  fonts: Fonts,
  flipY: (y: Mm) => Mm,
) {
  layout.slots.forEach((slot, i) => {
    const texts = resolveSlot(i).objects.filter(isText);
    if (texts.length === 0) return;

    const insert = insertSizeOf(slot, layout.rotated);
    const place = placeSlot(slot, layout.rotated);

    const corners = [
      place.map(0, 0),
      place.map(insert.width, 0),
      place.map(insert.width, insert.height),
      place.map(0, insert.height),
    ].map((p) => ({ x: mmToPt(p.x), y: mmToPt(flipY(p.y)) }));

    page.pushOperators(
      pushGraphicsState(),
      moveTo(corners[0].x, corners[0].y),
      lineTo(corners[1].x, corners[1].y),
      lineTo(corners[2].x, corners[2].y),
      lineTo(corners[3].x, corners[3].y),
      closePath(),
      clip(),
      endPath(),
    );

    for (const t of texts) {
      const size = sizeOf(t);
      const lines = splitLines(t.text);
      const baselines = lineBaselines(t, size, valignOf(t), lines.length, lineHeightOf(t));
      // 폭을 재는 글꼴과 그리는 글꼴이 반드시 같아야 한다. Bold는 획이 두꺼운
      // 만큼 폭도 넓어서, Regular로 재고 Bold로 그리면 가운데 정렬이 어긋난다.
      const font = fontFor(t, fonts);

      lines.forEach((line, i) => {
        if (line === '') return;
        const width = ptToMm(font.widthOfTextAtSize(line, mmToPt(size)));
        const p = place.map(leftOf(t, alignOf(t), width), baselines[i]);
        page.drawText(line, {
          x: mmToPt(p.x),
          y: mmToPt(flipY(p.y)),
          size: mmToPt(size),
          font,
          color: t.color ? color(t.color) : TEXT,
        });
      });
    }

    page.pushOperators(popGraphicsState());
  });
}

function drawObjects(
  page: PDFPage,
  layout: Layout,
  resolveSlot: (i: number) => SlotContent,
  flipY: (y: Mm) => Mm,
) {
  layout.slots.forEach((slot, i) => {
    const objects = resolveSlot(i).objects.filter(isLine);
    if (objects.length === 0) return;

    const place = placeSlot(slot, layout.rotated);
    for (const o of objects) {
      const a = place.map(o.x1, o.y1);
      const b = place.map(o.x2, o.y2);
      // 굵기·색·모양은 core/line이 정한다. 화면(ui/InsertView)도 같은 함수를 부르므로
      // 한쪽만 달라질 수 없다. mm로 받아서 여기서 pt로 바꾼다.
      page.drawLine({
        start: { x: mmToPt(a.x), y: mmToPt(flipY(a.y)) },
        end: { x: mmToPt(b.x), y: mmToPt(flipY(b.y)) },
        thickness: mmToPt(widthOf(o)),
        color: color(colorOf(o)),
        dashArray: dashPatternOf(o)?.map(mmToPt),
        // 끝 처리도 같은 값을 쓴다. 자세한 이유는 core/style에 있다.
        lineCap: OBJECT_LINE_CAP === 'round' ? LineCapStyle.Round : LineCapStyle.Butt,
      });
    }
  });
}

/**
 * 50mm 검증 눈금자.
 *
 * PDF를 정확히 만들어도 인쇄 대화상자가 "페이지에 맞춤"이면 96~97%로 축소된다.
 * 인쇄물의 이 눈금을 자로 재서 50mm가 나오는지 확인하면 바로 알 수 있다.
 */
function drawRuler(
  page: PDFPage,
  font: import('pdf-lib').PDFFont,
  paperWidth: Mm,
  paperHeight: Mm,
  flipY: (y: Mm) => Mm,
) {
  const length: Mm = 50;
  const x0 = paperWidth - length - 8;
  const y0 = paperHeight - 8;

  const seg = (x1: Mm, y1: Mm, x2: Mm, y2: Mm) =>
    page.drawLine({
      start: { x: mmToPt(x1), y: mmToPt(flipY(y1)) },
      end: { x: mmToPt(x2), y: mmToPt(flipY(y2)) },
      thickness: mmToPt(RULER_WIDTH),
      color: RULER,
    });

  seg(x0, y0, x0 + length, y0);

  // 10mm마다 긴 눈금, 그 사이 5mm에 짧은 눈금.
  for (let mm = 0; mm <= length; mm += 5) {
    const tall = mm % 10 === 0;
    seg(x0 + mm, y0, x0 + mm, y0 - (tall ? 3 : 1.5));
  }

  const label = '0 ---- 50mm : print at 100%';
  page.drawText(label, {
    x: mmToPt(x0),
    y: mmToPt(flipY(y0 + 3.5)),
    size: mmToPt(2.2),
    font,
    color: RULER,
  });
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  // Uint8Array를 그대로 넘기면 SharedArrayBuffer 가능성 때문에 타입이 안 맞는다.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
