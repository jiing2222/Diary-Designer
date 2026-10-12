/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { buildPdf } from './export';
import { workExportInput, type WorkPrintSettings } from './fromWork';
import { expandWork, newPage, newWork, type DatedItem, type Work } from '../core/work';
import { diaryFromPreset } from '../core/diary';
import { DEFAULT_DOT_GRID } from '../core/grid';
import type { CalendarObject, TextObject } from '../core/objects';

const today = { year: 2026, month: 10, day: 12 };
const diary = diaryFromPreset('d1', 'M6', 'M6', '#000000');
const settings: WorkPrintSettings = {
  paper: { width: 210, height: 297, landscape: false, printMargin: 5 },
  gap: 0,
  allowRotate: true,
  align: 'center',
  cropMark: 'none',
  cropFrontOnly: false,
  showRuler: false,
  backTurn180: false,
  cutStack: false,
  cutStackGroup: 0,
  blankBackGrid: false,
  sides: 'both',
  printGrid: true,
  printPunch: false,
};

function workWith(pageCount: number, duplex = true): Work {
  const w = newWork({ name: 't', diaryId: 'd1', now: '2026-10-12', duplex });
  return { ...w, items: Array.from({ length: pageCount }, () => newPage()) };
}

describe('작업 → PDF 재료', () => {
  it('양면 3페이지 → 속지 2장, 마지막 뒷면은 빈 종이(기본)', () => {
    const work = workWith(3);
    const input = workExportInput(work, diary, expandWork(work, today), settings, null);
    expect(input.datasetPages).toBe(2);
    expect(input.datasetBackOverrides?.size).toBe(1);
  });

  it('빈 뒷면에 도트 찍기를 켜면 바탕만 있는 뒷면', () => {
    const work = workWith(3);
    const input = workExportInput(work, diary, expandWork(work, today), { ...settings, blankBackGrid: true }, null);
    expect(input.datasetBackOverrides?.size).toBe(2);
    expect(input.datasetBackOverrides?.get(1)?.objects).toEqual([]);
  });

  it('고른 페이지가 든 속지만', () => {
    const work = workWith(6);
    const input = workExportInput(work, diary, expandWork(work, today), settings, [3]);
    expect(input.datasetPages).toBe(1);
  });

  it('포인트 색 이름표는 실제 색으로 풀어서 넘긴다', () => {
    const work = workWith(1, false);
    const text: TextObject = { id: 't1', type: 'text', x: 0, y: 0, width: 10, height: 5, text: '가', color: '@A' };
    const w2: Work = {
      ...work,
      palette: { ...work.palette, points: [{ key: 'A', color: '#8ea8c6' }] },
      items: [{ kind: 'page', id: 'p1', face: { id: 'f1', background: DEFAULT_DOT_GRID, objects: [text] } }],
    };
    const input = workExportInput(w2, diary, expandWork(w2, today), settings, null);
    const first = input.datasetOverrides?.get(0)?.objects[0] as TextObject | undefined;
    expect(first?.color).toBe('#8ea8c6');
  });

  it('PDF 장수 — 양면이면 용지 한 장에 앞·뒤 두 쪽', async () => {
    const work = workWith(20);
    const input = workExportInput(work, diary, expandWork(work, today), settings, null);
    const slots = input.layout.slots.length;
    const doc = await PDFDocument.load(await buildPdf(input));
    expect(doc.getPageCount()).toBe(Math.ceil(10 / slots) * 2);
  });

  it('면마다 그 면의 달을 칸에 실어 보내고, 달력이 든 PDF가 만들어진다', async () => {
    const realFont = readFileSync(fileURLToPath(new URL('../../public/fonts/Pretendard-Regular.ttf', import.meta.url)));
    const cal: CalendarObject = { id: 'c1', type: 'calendar', x: 2, y: 2, width: 60, height: 80 };
    const item: DatedItem = {
      kind: 'dated',
      id: 'dt1',
      faces: [{ id: 'f1', background: DEFAULT_DOT_GRID, objects: [cal] }],
      dataset: { kind: 'date', perPage: 1, start: '2026-10-01', end: '2026-11-01', step: 'month' },
      boundary: 'continue',
      overrides: {},
    };
    const work: Work = { ...workWith(0, false), items: [item] };
    const faces = expandWork(work, today);
    expect(faces.map((f) => f.month)).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
    const input = workExportInput(work, diary, faces, { ...settings, allowRotate: false }, null, { fontBytes: realFont });
    expect(input.datasetOverrides?.get(1)?.month).toEqual({ year: 2026, month: 11 });
    const bytes = await buildPdf({ ...input, layout: { ...input.layout, slots: input.layout.slots.slice(0, 1), count: 1 } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2); // 칸 하나 → 달마다 한 장
  });
});

describe('PDF 전 확인 창의 선택·출력 면', () => {
  it('격자를 끄면 모든 면의 바탕을 찍지 않는다, 타공 표시를 켜면 다이어리의 구멍 설정이 실린다', () => {
    const work = workWith(2);
    const input = workExportInput(work, diary, expandWork(work, today), { ...settings, printGrid: false, printPunch: true }, null);
    expect(input.datasetOverrides?.get(0)?.dotGrid.print).toBe(false);
    expect(input.datasetOverrides?.get(0)?.punch).toEqual(diary.punch);
  });

  it('출력 면 — 뒷면만이면 뒷면 쪽만 나온다', async () => {
    const work = workWith(16);
    const both = await PDFDocument.load(await buildPdf(workExportInput(work, diary, expandWork(work, today), settings, null)));
    const backOnly = await PDFDocument.load(
      await buildPdf(workExportInput(work, diary, expandWork(work, today), { ...settings, sides: 'back' }, null)),
    );
    expect(backOnly.getPageCount()).toBe(both.getPageCount() / 2);
  });

  it('타공 표시는 구멍마다 원 하나 — 칸마다 구멍 수만큼', async () => {
    const work = workWith(1, false);
    const input = workExportInput(work, diary, expandWork(work, today), { ...settings, printPunch: true, printGrid: false }, null);
    const bytes = await buildPdf({ ...input, layout: { ...input.layout, slots: input.layout.slots.slice(0, 1), count: 1 } });
    const doc = await PDFDocument.load(bytes);
    const raw = doc.getPages()[0].node.Contents();
    expect(raw).toBeDefined();
    // 구멍 테두리 굵기(0.15mm → pt)로 그린 선의 수 = 구멍 수
    const widths = contentWidths(bytes);
    expect(widths.filter((w) => Math.abs(w - 0.15 * (72 / 25.4)) < 1e-3).length).toBe(diary.punch.holeCount);
  });
});

/** 내용 스트림의 선 굵기(w) 값들 — pdf/export.test의 같은 이름 함수와 같다. */
function contentWidths(bytes: Uint8Array): number[] {
  const text = Buffer.from(bytes).toString('latin1');
  const out: number[] = [];
  for (const m of text.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const inflated = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      for (const w of inflated.matchAll(/([\d.]+) w\b/g)) out.push(Number(w[1]));
    } catch {
      // 압축이 아닌 스트림은 건너뛴다.
    }
  }
  return out;
}
