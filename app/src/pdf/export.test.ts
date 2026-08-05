import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPdf } from './export';
import { computeLayout } from '../core/layout';
import { DEFAULT_DOT_GRID } from '../core/grid';
import { OBJECT_LINE_COLOR, OBJECT_LINE_WIDTH } from '../core/style';
import { MM_TO_PT } from '../core/units';

const layout = computeLayout({
  paperWidth: 210,
  paperHeight: 297,
  insertWidth: 80,
  insertHeight: 125,
  gap: 0,
  printMargin: 5,
  allowRotate: true,
  align: 'center',
});

/** A4에 M6 3단접이. 속지가 눕는 배치라 좌표 변환이 한 번 더 들어간다. */
const rotatedLayout = computeLayout({
  paperWidth: 210,
  paperHeight: 297,
  insertWidth: 220,
  insertHeight: 125,
  gap: 0,
  printMargin: 0,
  allowRotate: true,
  align: 'topLeft',
});

const noGrid = { ...DEFAULT_DOT_GRID, print: false };

async function pageOf(paperWidth: number, paperHeight: number) {
  const bytes = await buildPdf({
    paperWidth,
    paperHeight,
    layout,
    dotGrid: DEFAULT_DOT_GRID,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'mark',
    showRuler: true,
  });
  const doc = await PDFDocument.load(bytes);
  return { page: doc.getPage(0), bytes };
}

describe('PDF 출력', () => {
  it('A4 페이지가 정확히 210 × 297mm다', async () => {
    const { page } = await pageOf(210, 297);
    // 되돌려 재도 원래 mm가 나와야 한다. 여기가 이 프로그램의 존재 이유다.
    expect(page.getWidth() / MM_TO_PT).toBeCloseTo(210, 9);
    expect(page.getHeight() / MM_TO_PT).toBeCloseTo(297, 9);
  });

  it('A5 페이지가 정확히 148 × 210mm다', async () => {
    const { page } = await pageOf(148, 210);
    expect(page.getWidth() / MM_TO_PT).toBeCloseTo(148, 9);
    expect(page.getHeight() / MM_TO_PT).toBeCloseTo(210, 9);
  });

  it('이미지가 아니라 벡터로 그린다', async () => {
    // 캔버스를 이미지로 떠서 넣으면 실제 치수가 어긋난다. 그 방식을 막는 시험이다.
    const { bytes } = await pageOf(210, 297);
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).not.toMatch(/\/Subtype\s*\/Image/);
  });

  it('절취선을 끄면 내용이 줄어든다', async () => {
    const withMarks = await buildPdf({
      paperWidth: 210, paperHeight: 297, layout, dotGrid: noGrid, objects: [], safeZoneWidth: 10,
      cropMark: 'mark', showRuler: false,
    });
    const without = await buildPdf({
      paperWidth: 210, paperHeight: 297, layout, dotGrid: noGrid, objects: [], safeZoneWidth: 10,
      cropMark: 'none', showRuler: false,
    });
    expect(without.byteLength).toBeLessThan(withMarks.byteLength);
  });
});

describe('도트 격자 인쇄', () => {
  const base = {
    paperWidth: 210,
    paperHeight: 297,
    layout,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'none' as const,
    showRuler: false,
  };

  it('인쇄를 끄면 도트가 빠진다', async () => {
    const on = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID });
    const off = await buildPdf({ ...base, dotGrid: noGrid });
    expect(off.byteLength).toBeLessThan(on.byteLength);
  });

  it('화면 표시와 인쇄가 따로 논다', async () => {
    // 화면에서 껐다고 인쇄까지 빠지면 안 된다. 도트를 보지 않고 작업하다가
    // 인쇄할 때만 넣는 경우가 있다.
    const hidden = await buildPdf({
      ...base,
      dotGrid: { ...DEFAULT_DOT_GRID, showOnScreen: false, print: true },
    });
    const shown = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID });
    expect(hidden.byteLength).toBe(shown.byteLength);
  });

  it('간격을 좁히면 도트가 늘어난다', async () => {
    const wide = await buildPdf({ ...base, dotGrid: { ...DEFAULT_DOT_GRID, spacing: 10 } });
    const tight = await buildPdf({ ...base, dotGrid: { ...DEFAULT_DOT_GRID, spacing: 3 } });
    expect(tight.byteLength).toBeGreaterThan(wide.byteLength);
  });

  it('네 가지 모양이 전부 인쇄된다', async () => {
    const empty = await buildPdf({ ...base, dotGrid: noGrid });
    for (const style of ['dot', 'grid', 'horizontal', 'vertical'] as const) {
      const bytes = await buildPdf({ ...base, dotGrid: { ...DEFAULT_DOT_GRID, style } });
      expect(bytes.byteLength).toBeGreaterThan(empty.byteLength);
    }
  });

  it('안전영역을 비우면 도트가 줄어든다', async () => {
    // 설정이 PDF까지 실제로 전달되는지 본다. 화면에서만 반영되면 인쇄물이 틀어진다.
    const full = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID });
    const avoided = await buildPdf({
      ...base,
      dotGrid: { ...DEFAULT_DOT_GRID, avoidSafeZone: true },
    });
    expect(avoided.byteLength).toBeLessThan(full.byteLength);
  });

  it('그린 선이 모든 칸에 들어간다', async () => {
    const line = { id: 'l1', type: 'line' as const, x1: 10, y1: 10, x2: 70, y2: 10 };
    const empty = await buildPdf({ ...base, dotGrid: noGrid });
    const drawn = await buildPdf({ ...base, dotGrid: noGrid, objects: [line] });
    expect(drawn.byteLength).toBeGreaterThan(empty.byteLength);
  });

  it('도트를 인쇄하지 않아도 그린 선은 남는다', async () => {
    // 둘은 따로 논다. 도트 없는 줄노트를 뽑는 흔한 경우다.
    const line = { id: 'l1', type: 'line' as const, x1: 10, y1: 10, x2: 70, y2: 10 };
    const bytes = await buildPdf({ ...base, dotGrid: noGrid, objects: [line] });
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).not.toMatch(/\/Subtype\s*\/Image/);
    expect(bytes.byteLength).toBeGreaterThan(
      (await buildPdf({ ...base, dotGrid: noGrid })).byteLength,
    );
  });

  it('선마다 정한 굵기·색·모양이 PDF에 반영된다', async () => {
    const at = (extra: object) => ({
      id: 'l1',
      type: 'line' as const,
      x1: 10,
      y1: 10,
      x2: 70,
      y2: 10,
      ...extra,
    });
    const make = (extra: object) => buildPdf({ ...base, dotGrid: noGrid, objects: [at(extra)] });

    // 값을 바꿨는데 PDF가 그대로면 그 값이 그려질 때 무시된 것이다.
    const basic = await make({});
    expect(await make({ width: 1.2 })).not.toEqual(basic);
    expect(await make({ color: '#ff0000' })).not.toEqual(basic);
    expect(await make({ dash: 'dashed' })).not.toEqual(basic);
    expect(await make({ dash: 'dotted' })).not.toEqual(await make({ dash: 'dashed' }));
  });

  it('값이 없는 선은 기본값을 따른다', async () => {
    // 손대지 않은 선은 값을 갖지 않는다. 나중에 기본값을 바꾸면 다 같이 따라온다.
    // 위 시험과 짝이다 — 값이 다르면 결과가 다르고, 기본값과 같으면 결과도 같다.
    const bare = { id: 'l1', type: 'line' as const, x1: 10, y1: 10, x2: 70, y2: 10 };
    const explicit = { ...bare, width: OBJECT_LINE_WIDTH, color: OBJECT_LINE_COLOR };
    const a = await buildPdf({ ...base, dotGrid: noGrid, objects: [bare] });
    const b = await buildPdf({ ...base, dotGrid: noGrid, objects: [explicit] });
    expect(a).toEqual(b);
  });

  it('글꼴 없이도 여러 줄 글자 객체를 안전하게 건너뛴다', async () => {
    // fontBytes를 안 주면 글자를 그리지 않는다(2.7MB를 억지로 받을 이유가 없다).
    // ⇧Enter로 줄을 나눈 글자가 섞여 있어도 줄 나누기 계산 경로가 죽지 않아야 한다.
    const text = {
      id: 't1',
      type: 'text' as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      text: '여러 줄\n제목',
    };
    const withText = await buildPdf({ ...base, dotGrid: noGrid, objects: [text] });
    const empty = await buildPdf({ ...base, dotGrid: noGrid, objects: [] });
    expect(withText.byteLength).toBe(empty.byteLength);
  });

  it('속지가 누워도 도트가 벡터로 들어간다', async () => {
    const bytes = await buildPdf({
      ...base,
      layout: rotatedLayout,
      dotGrid: DEFAULT_DOT_GRID,
    });
    expect(rotatedLayout.rotated).toBe(true);
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).not.toMatch(/\/Subtype\s*\/Image/);

    const empty = await buildPdf({ ...base, layout: rotatedLayout, dotGrid: noGrid });
    expect(bytes.byteLength).toBeGreaterThan(empty.byteLength);
  });
});
