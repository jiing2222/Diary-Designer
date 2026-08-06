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
import type { Layout } from '../core/layout';
import { cropSegments, type CropMode } from '../core/crop';
import { gridArea, gridLattice, gridShapes, type DotGrid } from '../core/grid';
import { insertSizeOf, placeSlot } from '../core/place';
import { colorOf, dashPattern, widthOf } from '../core/line';
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
import {
  isLine,
  isText,
  type DiaryObject,
  type LineObject,
  type TextObject,
} from '../core/objects';

/**
 * PDF 생성.
 *
 * 화면(SVG)과 완전히 독립적으로, 문서 모델의 mm 값에서 직접 벡터를 그린다.
 * 캔버스를 이미지로 떠서 넣는 방식은 절대 쓰지 않는다. 그러면 실제 치수가
 * 어긋나고 인쇄 품질이 무너진다.
 */

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
  /** 타공 안전영역 폭. 격자가 이 영역을 피할지는 dotGrid가 정한다. */
  safeZoneWidth: Mm;
  cropMark: CropMode;
  showRuler: boolean;
}

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

  /*
   * 속지 글꼴은 필요할 때만 심는다. 글자가 하나도 없으면 1.2MB를 넣을 이유가 없다.
   *
   * **서브셋을 쓰지 않는다.** pdf-lib의 서브셋 기능은 한글 글꼴에서 글리프를
   * 빠뜨린다 — "2027년 3월 셋째 주"가 "3월"로 나온다. 5KB와 1.2MB의 차이지만
   * 맞는 쪽을 택한다. 글꼴은 문서에 한 번만 들어가므로 쪽수가 늘어도 그대로다.
   */
  const texts = input.objects.filter(isText);
  let bodyFont: PDFFont | null = null;
  let boldFont: PDFFont | null = null;
  if (texts.length > 0 && input.fontBytes) {
    doc.registerFontkit(fontkit);
    bodyFont = await doc.embedFont(input.fontBytes, { subset: false });
    // 굵기마다 파일이 따로다. 굵은 글자가 하나도 없으면 심지 않는다.
    if (input.boldFontBytes && texts.some(boldOf)) {
      boldFont = await doc.embedFont(input.boldFontBytes, { subset: false });
    }
  }

  const page = doc.addPage([mmToPt(input.paperWidth), mmToPt(input.paperHeight)]);

  // PDF는 Y축이 위로 증가한다. 문서 모델은 아래로 증가하므로 여기서 뒤집는다.
  // 이 변환은 익스포터 안에만 존재하고 모델은 알지 못한다.
  const flipY = (y: Mm): Mm => input.paperHeight - y;

  // 층 순서가 화면과 같아야 한다. 도트 → 선 → 글자.
  // 재단선과 눈금자는 속지 내용이 아니라 용지 위의 표시라 그 위에 얹는다.
  if (input.dotGrid.print) {
    drawDotGrid(page, input.layout, input.dotGrid, input.safeZoneWidth, flipY);
  }
  drawObjects(page, input.layout, input.objects.filter(isLine), flipY);
  if (bodyFont) drawTexts(page, input.layout, texts, { regular: bodyFont, bold: boldFont }, flipY);

  for (const s of cropSegments(input.layout, input.paperWidth, input.paperHeight, input.cropMark)) {
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
  grid: DotGrid,
  safeZoneWidth: Mm,
  flipY: (y: Mm) => Mm,
) {
  for (const slot of layout.slots) {
    const insert = insertSizeOf(slot, layout.rotated);
    const place = placeSlot(slot, layout.rotated);

    const area = gridArea(insert, grid, safeZoneWidth);
    const lattice = gridLattice(area, grid.spacing, grid.minMargin);
    const { dots, lines } = gridShapes(lattice, grid.style, grid.linesToEdge ? area : null);

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
      });
    }
  }
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
function drawTexts(
  page: PDFPage,
  layout: Layout,
  texts: TextObject[],
  /** 굵기별 글꼴. `bold`가 없으면 굵은 글자가 없다는 뜻이라 심지 않은 것이다. */
  fonts: { regular: PDFFont; bold: PDFFont | null },
  flipY: (y: Mm) => Mm,
) {
  if (texts.length === 0) return;

  for (const slot of layout.slots) {
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
      const font = boldOf(t) && fonts.bold ? fonts.bold : fonts.regular;

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
  }
}

function drawObjects(
  page: PDFPage,
  layout: Layout,
  objects: LineObject[],
  flipY: (y: Mm) => Mm,
) {
  if (objects.length === 0) return;

  for (const slot of layout.slots) {
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
        dashArray: dashPattern(o)?.map(mmToPt),
        // 끝 처리도 같은 값을 쓴다. 자세한 이유는 core/style에 있다.
        lineCap: OBJECT_LINE_CAP === 'round' ? LineCapStyle.Round : LineCapStyle.Butt,
      });
    }
  }
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
