import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPdf, type SlotContent } from './export';
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

  it('굵은 글자가 없으면 Bold 글꼴을 심지 않는다', async () => {
    // 굵기마다 파일이 2.7MB다. 쓰지도 않을 것을 심으면 PDF가 그만큼 무거워진다.
    // 망가진 바이트를 줘도 터지지 않아야 한다 — 아예 손대지 않는다는 뜻이다.
    const plain = {
      id: 't1',
      type: 'text' as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      text: '보통 굵기',
    };
    const given = await buildPdf({
      ...base,
      dotGrid: noGrid,
      objects: [plain],
      boldFontBytes: new Uint8Array([1, 2, 3]),
    });
    const not = await buildPdf({ ...base, dotGrid: noGrid, objects: [plain] });
    expect(given.byteLength).toBe(not.byteLength);
  });

  it('쓰이지 않는 등록 글꼴은 심지 않는다', async () => {
    // 굵게와 같은 규칙이다. 등록만 해놓고 안 쓴 글꼴까지 심으면 파일마다
    // 수 MB씩 불어난다. 망가진 바이트를 줘도 터지지 않아야 손대지 않은 것이다.
    const plain = {
      id: 't1',
      type: 'text' as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      text: '기본 글꼴',
    };
    const given = await buildPdf({
      ...base,
      dotGrid: noGrid,
      objects: [plain],
      userFonts: new Map([['f1', new Uint8Array([1, 2, 3])]]),
    });
    const not = await buildPdf({ ...base, dotGrid: noGrid, objects: [plain] });
    expect(given.byteLength).toBe(not.byteLength);
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

describe('낱장 조합 — 칸마다 다른 양식', () => {
  // 가로로 두 칸이 들어가는 배치. 왼쪽 칸(0)과 오른쪽 칸(1)에 다른 내용을 넣어본다.
  const twoUpLayout = computeLayout({
    paperWidth: 170,
    paperHeight: 130,
    insertWidth: 80,
    insertHeight: 125,
    gap: 5,
    printMargin: 2.5,
    allowRotate: false,
    align: 'center',
  });

  const base = {
    paperWidth: 170,
    paperHeight: 130,
    layout: twoUpLayout,
    dotGrid: noGrid,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'none' as const,
    showRuler: false,
  };

  it('두 칸짜리 배치를 전제로 한다', () => {
    expect(twoUpLayout.count).toBe(2);
  });

  it('지정하지 않은 칸은 기본값을 쓴다 — 지금까지의 동작과 같다', async () => {
    const withoutOverrides = await buildPdf(base);
    const withEmptyMap = await buildPdf({ ...base, slotOverrides: new Map() });
    expect(withEmptyMap).toEqual(withoutOverrides);
  });

  it('지정한 칸만 다른 내용이 그려진다', async () => {
    const line = { id: 'l1', type: 'line' as const, x1: 10, y1: 10, x2: 70, y2: 10 };
    const overridden = await buildPdf({
      ...base,
      slotOverrides: new Map([[1, { dotGrid: noGrid, objects: [line], safeZoneWidth: 10 }]]),
    });
    // 두 칸 다 비어 있던 것보다 커야 한다 — 칸 1에 선이 하나 늘었다.
    expect(overridden.byteLength).toBeGreaterThan((await buildPdf(base)).byteLength);
  });

  it('칸마다 인쇄 여부가 따로 논다', async () => {
    // 낱장 조합에서 어떤 양식은 격자를 켜고 어떤 양식은 끄고 쓸 수 있다.
    const bothOff = await buildPdf(base);
    const oneOn = await buildPdf({
      ...base,
      slotOverrides: new Map([[0, { dotGrid: DEFAULT_DOT_GRID, objects: [], safeZoneWidth: 10 }]]),
    });
    expect(oneOn.byteLength).toBeGreaterThan(bothOff.byteLength);
  });

  it('override 칸에 글자가 있어도 글꼴 없이는 안전하게 건너뛴다', async () => {
    // 기본 동작(글꼴 없이도 여러 줄 글자를 안전하게 건너뛴다)이 override 칸에도
    // 그대로 적용돼야 한다.
    const text = {
      id: 't1',
      type: 'text' as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      text: '오른쪽 칸',
    };
    const withText = await buildPdf({
      ...base,
      slotOverrides: new Map([[1, { dotGrid: noGrid, objects: [text], safeZoneWidth: 10 }]]),
    });
    const withoutText = await buildPdf(base);
    expect(withText).toEqual(withoutText);
  });

  it('기본값에는 글자가 없고 override 칸에만 있어도 글꼴을 심으려 한다', async () => {
    // 기본 칸(objects: [])만 봤다면 글자가 없다고 판단해 글꼴을 건드리지 않는다.
    // override까지 합쳐서 봐야 이 칸의 글자를 알아챌 수 있다.
    const text = {
      id: 't1',
      type: 'text' as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      text: '오른쪽 칸',
    };
    // 망가진 폰트 바이트라 embedFont가 시도되면 던진다 — 즉 이 예외 자체가
    // override의 글자를 알아챘다는 증거다. 안 던지면 무시했다는 뜻이다.
    await expect(
      buildPdf({
        ...base,
        fontBytes: new Uint8Array([1, 2, 3]),
        slotOverrides: new Map([[1, { dotGrid: noGrid, objects: [text], safeZoneWidth: 10 }]]),
      }),
    ).rejects.toThrow();
  });
});

describe('낱장 조합 — 통째로 반복(sheets)', () => {
  const twoUpLayout = computeLayout({
    paperWidth: 170,
    paperHeight: 130,
    insertWidth: 80,
    insertHeight: 125,
    gap: 5,
    printMargin: 2.5,
    allowRotate: false,
    align: 'center',
  });

  const base = {
    paperWidth: 170,
    paperHeight: 130,
    layout: twoUpLayout,
    dotGrid: DEFAULT_DOT_GRID,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'none' as const,
    showRuler: false,
  };

  it('정하지 않으면 지금까지처럼 1장이다', async () => {
    const doc = await PDFDocument.load(await buildPdf(base));
    expect(doc.getPageCount()).toBe(1);
  });

  it('sheets만큼 장이 늘어난다', async () => {
    const doc = await PDFDocument.load(await buildPdf({ ...base, sheets: 14 }));
    expect(doc.getPageCount()).toBe(14);
  });

  it('장마다 자투리 없이 두 칸 다 채운다', async () => {
    // 반복 인쇄와 달리 매번 완전히 채워진 장만 나와야 한다.
    const one = await buildPdf({ ...base, sheets: 1 });
    const three = await buildPdf({ ...base, sheets: 3 });
    // 3장은 1장의 3배 내용이어야 한다(같은 도트 패턴이 그대로 반복되므로
    // 바이트도 거의 정비례해야 한다 — 장마다 빈 칸이 섞이면 이 비율이 깨진다).
    expect(three.byteLength).toBeGreaterThan(one.byteLength * 2.5);
  });

  it('totalSlots가 있으면 sheets는 무시된다', async () => {
    // 반복 인쇄가 우선이다 — 설계상 둘은 섞이지 않는다.
    const doc = await PDFDocument.load(
      await buildPdf({ ...base, totalSlots: 2, sheets: 99 }),
    );
    expect(doc.getPageCount()).toBe(1);
  });

  it('양면이면 장마다 뒷면도 함께 반복된다', async () => {
    const doc = await PDFDocument.load(
      await buildPdf({
        ...base,
        sheets: 3,
        duplex: true,
        defaultBack: { dotGrid: DEFAULT_DOT_GRID, objects: [], safeZoneWidth: 10 },
      }),
    );
    expect(doc.getPageCount()).toBe(6); // 3장 × 2쪽
  });
});

describe('반복 인쇄 — 여러 장', () => {
  // 가로로 두 칸이 들어가는 배치 (5c 시험과 같은 구성). 한 장에 칸 2개.
  const twoUpLayout = computeLayout({
    paperWidth: 170,
    paperHeight: 130,
    insertWidth: 80,
    insertHeight: 125,
    gap: 5,
    printMargin: 2.5,
    allowRotate: false,
    align: 'center',
  });

  const base = {
    paperWidth: 170,
    paperHeight: 130,
    layout: twoUpLayout,
    dotGrid: DEFAULT_DOT_GRID,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'none' as const,
    showRuler: false,
  };

  it('totalSlots를 안 주면 지금까지처럼 한 장이다', async () => {
    const doc = await PDFDocument.load(await buildPdf(base));
    expect(doc.getPageCount()).toBe(1);
  });

  it('칸 수보다 totalSlots가 많으면 그만큼 장이 늘어난다', async () => {
    // 한 장에 2칸이니 5칸이 필요하면 3장(2+2+1)이다.
    const doc = await PDFDocument.load(await buildPdf({ ...base, totalSlots: 5 }));
    expect(doc.getPageCount()).toBe(3);
  });

  it('딱 나누어떨어지면 남는 장이 없다', async () => {
    const doc = await PDFDocument.load(await buildPdf({ ...base, totalSlots: 4 }));
    expect(doc.getPageCount()).toBe(2);
  });

  it('마지막 장의 남는 칸은 완전히 빈 채로 찍힌다', async () => {
    // totalSlots=3, 칸 2개짜리 배치 → 2장. 두 번째 장은 칸 1개만 채워야 한다.
    // 격자를 켜두면(온전한 칸은 도트가 찍힌다) 완전히 채운 2장(4칸)보다
    // 바이트가 작아야 한다 — 빈 칸에는 아무것도 안 그렸다는 뜻이다.
    const threeSlots = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID, totalSlots: 3 });
    const fourSlots = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID, totalSlots: 4 });
    expect(threeSlots.byteLength).toBeLessThan(fourSlots.byteLength);
  });

  it('totalSlots가 칸 수 이하면 한 장뿐이고 다 채운다', async () => {
    const doc = await PDFDocument.load(
      await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID, totalSlots: 1 }),
    );
    expect(doc.getPageCount()).toBe(1);
    // 칸 하나만 채운 것이 두 칸 다 채운 것보다 작아야 한다.
    const oneSlot = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID, totalSlots: 1 });
    const twoSlots = await buildPdf({ ...base, dotGrid: DEFAULT_DOT_GRID, totalSlots: 2 });
    expect(oneSlot.byteLength).toBeLessThan(twoSlots.byteLength);
  });

  it('재단선도 장마다 찍힌다', async () => {
    const withMarks = await buildPdf({ ...base, totalSlots: 4, cropMark: 'mark' as const });
    const withoutMarks = await buildPdf({ ...base, totalSlots: 4, cropMark: 'none' as const });
    expect(withoutMarks.byteLength).toBeLessThan(withMarks.byteLength);
  });

  it('그린 것이 채운 칸마다 반복된다', async () => {
    const line = { id: 'l1', type: 'line' as const, x1: 10, y1: 10, x2: 70, y2: 10 };
    const one = await buildPdf({ ...base, dotGrid: noGrid, objects: [line], totalSlots: 2 });
    const two = await buildPdf({ ...base, dotGrid: noGrid, objects: [line], totalSlots: 4 });
    // 4칸(2장)이 2칸(1장)보다 커야 한다 — 반복 인쇄가 실제로 여러 장을 채운다.
    expect(two.byteLength).toBeGreaterThan(one.byteLength);
  });
});

describe('양면 인쇄', () => {
  // 가로로 두 칸이 들어가는 배치. 한 장에 칸 2개.
  const twoUpLayout = computeLayout({
    paperWidth: 170,
    paperHeight: 130,
    insertWidth: 80,
    insertHeight: 125,
    gap: 5,
    printMargin: 2.5,
    allowRotate: false,
    align: 'center',
  });

  const base = {
    paperWidth: 170,
    paperHeight: 130,
    layout: twoUpLayout,
    dotGrid: noGrid,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'none' as const,
    showRuler: false,
  };

  const backContent = (line = false): SlotContent => ({
    dotGrid: noGrid,
    objects: line ? [{ id: 'b1', type: 'line', x1: 5, y1: 5, x2: 40, y2: 5 }] : [],
    safeZoneWidth: 10,
  });

  it('양면을 꺼두면 한 장에 한 쪽뿐이다', async () => {
    const doc = await PDFDocument.load(await buildPdf(base));
    expect(doc.getPageCount()).toBe(1);
  });

  it('양면을 켜면 장마다 뒷면 페이지가 하나 더 생긴다', async () => {
    const doc = await PDFDocument.load(await buildPdf({ ...base, duplex: true }));
    expect(doc.getPageCount()).toBe(2);
  });

  it('뒷면 기본값이 없으면 뒷면 페이지는 완전히 빈 채로 찍힌다', async () => {
    const blank = await buildPdf({ ...base, duplex: true });
    const withBack = await buildPdf({ ...base, duplex: true, defaultBack: backContent(true) });
    expect(withBack.byteLength).toBeGreaterThan(blank.byteLength);
  });

  it('뒷면 칸 위치가 좌우로 뒤집힌다', async () => {
    // 왼쪽 칸(0)에만 앞면 내용을 주고, 뒷면은 기본값(모든 칸 같은 내용)으로 켠다.
    // 뒷면 페이지의 벡터 좌표는 core/layout의 mirrorLayout이 낸 값을 그대로 써야
    // 하므로, 뒷면 내용이 있을 때와 없을 때 바이트가 달라야 한다.
    const withoutBack = await buildPdf({ ...base, duplex: true });
    const withBack = await buildPdf({
      ...base,
      duplex: true,
      defaultBack: backContent(true),
    });
    expect(withBack.byteLength).toBeGreaterThan(withoutBack.byteLength);
  });

  it('낱장 조합 — 칸마다 다른 뒷면이 그려진다', async () => {
    const oneBack = await buildPdf({
      ...base,
      duplex: true,
      backSlotOverrides: new Map([[1, backContent(true)]]),
    });
    const noBack = await buildPdf({ ...base, duplex: true });
    expect(oneBack.byteLength).toBeGreaterThan(noBack.byteLength);
  });

  it('배정된 양식에 뒷면이 없으면(null) 기본 뒷면 대신 완전히 비운다', async () => {
    const withDefault = await buildPdf({ ...base, duplex: true, defaultBack: backContent(true) });
    const overriddenBlank = await buildPdf({
      ...base,
      duplex: true,
      defaultBack: backContent(true),
      backSlotOverrides: new Map([[0, null], [1, null]]),
    });
    expect(overriddenBlank.byteLength).toBeLessThan(withDefault.byteLength);
  });

  it('반복 인쇄 + 양면 — 총 쪽수만큼 장이 줄어든다', async () => {
    // 한 장 용량 4(칸 2 × 앞뒤). 총 5칸 필요 → 단면 3장(2+2+1), 양면 2장(4+1).
    const single = await PDFDocument.load(
      await buildPdf({ ...base, totalSlots: 5, defaultBack: backContent() }),
    );
    const dup = await PDFDocument.load(
      await buildPdf({ ...base, totalSlots: 5, duplex: true, defaultBack: backContent() }),
    );
    expect(single.getPageCount()).toBe(3);
    expect(dup.getPageCount()).toBe(4); // 2장 × 2쪽
  });

  it('반복 인쇄 + 양면 — 마지막 장에서 앞을 다 채운 뒤 뒤를 채운다', async () => {
    // 한 장 용량 4(칸 2 × 앞뒤). 총 3칸 → 앞 2 + 뒤 1, 한 장으로 끝난다.
    const three = await PDFDocument.load(
      await buildPdf({ ...base, totalSlots: 3, duplex: true, defaultBack: backContent(true) }),
    );
    expect(three.getPageCount()).toBe(2); // 1장 × 2쪽
  });

  it('재단선도 앞뒤 페이지에 각각 찍힌다', async () => {
    const withMarks = await buildPdf({ ...base, duplex: true, cropMark: 'mark' as const });
    const withoutMarks = await buildPdf({ ...base, duplex: true, cropMark: 'none' as const });
    expect(withoutMarks.byteLength).toBeLessThan(withMarks.byteLength);
  });

  it('뒷면 글자도 글꼴을 심는다', async () => {
    const text = {
      id: 't1',
      type: 'text' as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      text: '뒷면 글자',
    };
    // 망가진 폰트 바이트로 embedFont를 강제로 던지게 해서, 뒷면 글자가
    // 글꼴 수집 대상에 포함됐는지 확인한다.
    await expect(
      buildPdf({
        ...base,
        duplex: true,
        fontBytes: new Uint8Array([1, 2, 3]),
        defaultBack: { dotGrid: noGrid, objects: [text], safeZoneWidth: 10 },
      }),
    ).rejects.toThrow();
  });

  it('뒷면의 안전영역 비우기도 도트를 줄인다', async () => {
    // core/grid의 gridArea가 뒷면에서는 오른쪽을 비운다(mirror). 어느 쪽을
    // 비우든 도트 개수는 줄어야 한다 — 방향이 아니라 "적용되는지"를 본다.
    // 정확한 방향(왼쪽/오른쪽)은 core/grid.test.ts·core/geometry.test.ts가 잰다.
    const dotGrid = { ...DEFAULT_DOT_GRID, print: true };
    const full = await buildPdf({
      ...base,
      duplex: true,
      defaultBack: { dotGrid, objects: [], safeZoneWidth: 10 },
    });
    const avoided = await buildPdf({
      ...base,
      duplex: true,
      defaultBack: { dotGrid: { ...dotGrid, avoidSafeZone: true }, objects: [], safeZoneWidth: 10 },
    });
    expect(avoided.byteLength).toBeLessThan(full.byteLength);
  });

  it('회전 배치(M5 등)에서도 양면이 안전하게 그려진다', async () => {
    // M5(62×105)는 A4에서 실제로 회전 배치가 된다(core/geometry.test.ts로 확인).
    // 회전 배치면 mirrorLayout이 칸을 좌우 대신 상하로 뒤집는다 — 여기서는
    // 그 배선이 죽지 않고 정상적으로 두 쪽(앞·뒤)을 만들어내는지만 스모크로
    // 확인한다. 정확한 방향은 core/geometry.test.ts의 mirrorLayout 테스트가 잰다.
    const rotatedLayout = computeLayout({
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 62,
      insertHeight: 105,
      gap: 0,
      printMargin: 0,
      allowRotate: true,
      align: 'center',
    });
    expect(rotatedLayout.rotated).toBe(true);

    const doc = await PDFDocument.load(
      await buildPdf({
        paperWidth: 210,
        paperHeight: 297,
        layout: rotatedLayout,
        dotGrid: { ...DEFAULT_DOT_GRID, avoidSafeZone: true },
        objects: [],
        safeZoneWidth: 10,
        cropMark: 'none',
        showRuler: false,
        duplex: true,
        defaultBack: {
          dotGrid: { ...DEFAULT_DOT_GRID, avoidSafeZone: true },
          objects: [],
          safeZoneWidth: 10,
        },
      }),
    );
    expect(doc.getPageCount()).toBe(2);
  });
});

describe('세트형 — 데이터셋', () => {
  // 가로로 두 칸이 들어가는 배치. 한 장에 칸 2개 → 칸 하나가 한 쪽.
  const twoUpLayout = computeLayout({
    paperWidth: 170,
    paperHeight: 130,
    insertWidth: 80,
    insertHeight: 125,
    gap: 5,
    printMargin: 2.5,
    allowRotate: false,
    align: 'center',
  });

  const base = {
    paperWidth: 170,
    paperHeight: 130,
    layout: twoUpLayout,
    dotGrid: DEFAULT_DOT_GRID,
    objects: [],
    safeZoneWidth: 10,
    cropMark: 'none' as const,
    showRuler: false,
  };

  // 글자는 글꼴 없이는 그려지지 않으므로(기존 규칙), 내용 차이는 선으로 낸다.
  const pageContent = (x2: number): SlotContent => ({
    dotGrid: DEFAULT_DOT_GRID,
    objects: [{ id: 'l1', type: 'line', x1: 5, y1: 5, x2, y2: 5 }],
    safeZoneWidth: 10,
  });

  const overridesFor = (count: number) =>
    new Map(Array.from({ length: count }, (_, i) => [i, pageContent(10 + i)] as const));

  it('datasetPages만큼 장이 나온다 — 칸 2개면 5쪽에 3장', async () => {
    const doc = await PDFDocument.load(
      await buildPdf({ ...base, datasetOverrides: overridesFor(5), datasetPages: 5 }),
    );
    expect(doc.getPageCount()).toBe(3); // 2+2+1
  });

  it('마지막 장의 남는 칸은 채운 것보다 작다', async () => {
    const threePages = await buildPdf({
      ...base,
      datasetOverrides: overridesFor(3),
      datasetPages: 3,
    });
    const fourPages = await buildPdf({
      ...base,
      datasetOverrides: overridesFor(4),
      datasetPages: 4,
    });
    // 3쪽(마지막 장 1칸만 채움)이 4쪽(모든 장 꽉 채움)보다 작아야 한다.
    expect(threePages.byteLength).toBeLessThan(fourPages.byteLength);
  });

  it('쪽마다 다른 내용이 그려진다', async () => {
    const twoPages = await buildPdf({ ...base, datasetOverrides: overridesFor(2), datasetPages: 2 });
    // 1번 쪽(칸 1)의 내용만 완전히 다른 것으로 바꾼다. 칸 위치별 override가
    // 아니라 전체 쪽 번호별 override라는 것을 확인한다 — 잘못 짜였다면 두
    // 칸이 같은 내용을 반복해 이 변화가 반영되지 않는다.
    const changed = await buildPdf({
      ...base,
      datasetOverrides: new Map([[0, pageContent(10)], [1, pageContent(70)]]),
      datasetPages: 2,
    });
    expect(changed.byteLength).not.toBe(twoPages.byteLength);
  });

  it('totalSlots·sheets가 있어도 datasetOverrides가 있으면 그것을 따른다', async () => {
    const doc = await PDFDocument.load(
      await buildPdf({
        ...base,
        datasetOverrides: overridesFor(2),
        datasetPages: 2,
        totalSlots: 99,
        sheets: 99,
      }),
    );
    expect(doc.getPageCount()).toBe(1); // 칸 2개짜리 배치에 2쪽 → 1장
  });

  it('양면이어도 한 장의 용량이 늘지 않는다 — 칸 하나가 앞뒤 같은 쪽이다', async () => {
    const doc = await PDFDocument.load(
      await buildPdf({
        ...base,
        datasetOverrides: overridesFor(2),
        datasetPages: 2,
        duplex: true,
        datasetBackOverrides: overridesFor(2),
      }),
    );
    // 단면이면 1장. 양면이면 반복 인쇄처럼 용량이 늘어 장이 줄지 않고,
    // 그 1장에 뒷면 페이지가 하나 더 붙어 2쪽이 된다.
    expect(doc.getPageCount()).toBe(2);
  });

  it('뒷면 override가 없어도 defaultBack이 있으면 쓴다', async () => {
    const withDefault = await buildPdf({
      ...base,
      datasetOverrides: overridesFor(1),
      datasetPages: 1,
      duplex: true,
      defaultBack: pageContent(50),
    });
    const withoutDefault = await buildPdf({
      ...base,
      datasetOverrides: overridesFor(1),
      datasetPages: 1,
      duplex: true,
    });
    expect(withDefault.byteLength).toBeGreaterThan(withoutDefault.byteLength);
  });
});
