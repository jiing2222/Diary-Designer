import { describe, expect, it } from 'vitest';
import { diaryFromPreset } from '../core/diary';
import { expandWork, faceLabel, newPage, newWork, type Work } from '../core/work';
import type { WorkPrintSettings } from '../pdf/fromWork';
import { printJob, sheetFaces, sheetSlots } from './printPreview';

const today = { year: 2026, month: 10, day: 12 };
const diary = diaryFromPreset('d1', 'M6', 'M6', '#000000');
const settings: WorkPrintSettings = {
  paper: { width: 210, height: 297, landscape: false, printMargin: 5 },
  gap: 0, allowRotate: false, align: 'center', cropMark: 'mark', cropFrontOnly: true,
  showRuler: true, backTurn180: false, cutStack: false, cutStackGroup: 0,
  blankBackGrid: false, sides: 'both', printGrid: true, printPunch: true,
};

function workWith(count: number, duplex = true): Work {
  return {
    ...newWork({ name: '미리보기 검증', diaryId: diary.id, now: '2026-10-12', duplex }),
    items: Array.from({ length: count }, (_, i) => {
      const page = newPage();
      page.face.objects.push({ id: `t${i}`, type: 'text', x: 5, y: 5, width: 20, height: 5, text: `면 ${i}` });
      return page;
    }),
  };
}

function jobFor(work: Work, text?: string, patch: Partial<WorkPrintSettings> = {}) {
  return printJob(work, diary, expandWork(work, today), { ...settings, ...patch }, {
    mode: text === undefined ? 'all' : 'pick', text: text ?? '',
  });
}

describe('6-4 출력 범위와 미리보기', () => {
  it('가져온 페이지의 날짜 색 규칙은 앞뒤 미리보기에서 작업 규칙보다 우선한다', () => {
    const work = workWith(2);
    work.colorRules = { sunday: '#ff0000' };
    work.items[0].colorRules = { sunday: '#abcdef' };
    work.items[1].colorRules = {};
    const job = jobFor(work);
    expect(sheetSlots(job, 0, false, diary).content.get(0)?.calendar?.rules).toEqual({ sunday: '#abcdef' });
    expect(sheetSlots(job, 0, true, diary).content.get(0)?.calendar?.rules).toEqual({});
  });
  it('마지막 선택까지 해제하면 전체로 돌아가지 않고 0페이지·0장', () => {
    const job = jobFor(workWith(20), '');
    expect(job).toMatchObject({ pickedCount: 0, cards: 0, sheets: 0, pickedFaces: [], rangeError: '' });
    expect(job.input.datasetOverrides?.size).toBe(0);
    expect(job.input.datasetBackOverrides?.size).toBe(0);
  });

  it('범위 밖 번호만 쓰면 빈 선택, 잘못 쓴 글자는 전체 임시 미리보기와 오류', () => {
    expect(jobFor(workWith(5), '99')).toMatchObject({ pickedCount: 0, sheets: 0, rangeError: '' });
    expect(jobFor(workWith(5), '1, 가')).toMatchObject({ pickedCount: 5, pickedFaces: null, rangeError: '가' });
  });

  it('p.4만 골라도 양면 짝 p.3·p.4가 출력되며 클릭 번호는 원래 페이지를 가리킨다', () => {
    const job = jobFor(workWith(20), '4');
    expect(job).toMatchObject({ cards: 1, pickedCount: 2, sheets: 1 });
    expect([...sheetFaces(job, 0, false)]).toEqual([[0, 2]]);
    expect([...sheetFaces(job, 0, true)]).toEqual([[0, 3]]);
    const front = sheetSlots(job, 0, false, diary, new Set([3]));
    const back = sheetSlots(job, 0, true, diary, new Set([3]));
    expect(front.content.get(0)?.objects).toEqual(job.input.datasetOverrides?.get(0)?.objects);
    expect(back.content.get(0)?.objects).toEqual(job.input.datasetBackOverrides?.get(0)?.objects);
    expect(front.content.get(0)?.selected).toBe(false);
    expect(back.content.get(0)?.selected).toBe(true);
    expect(back.content.get(0)?.punch).toEqual(diary.punch);
    expect(faceLabel(job.faces[back.face.get(0)!], back.face.get(0)!)).toBe('p.4');
  });

  it('홀수 마지막 빈 뒷면과 남는 칸은 클릭할 페이지가 없고 내용도 비어 있다', () => {
    const work = workWith(9);
    const job = jobFor(work);
    const back = sheetSlots(job, 1, true, diary);
    expect(back.face.size).toBe(0);
    for (const slot of back.content.values()) {
      expect(slot.objects).toEqual([]);
      expect(slot.dotGrid.print).toBe(false);
      expect(slot.punch).toBeUndefined();
    }
    const withGrid = sheetSlots(jobFor(work, undefined, { blankBackGrid: true }), 1, true, diary);
    expect(withGrid.face.size).toBe(0);
    expect(withGrid.content.get(0)?.dotGrid.print).toBe(true);
    expect(withGrid.content.get(0)?.punch).toEqual(diary.punch);
    expect(withGrid.content.get(1)?.punch).toBeUndefined();
  });

  it('재단 후 쌓는 순서·2장 무더기도 페이지 설명과 내용이 같은 칸에 든다', () => {
    const job = jobFor(workWith(34), undefined, { cutStack: true, cutStackGroup: 2 });
    expect(job.slots).toBe(4);
    const front = sheetSlots(job, 1, false, diary);
    expect([...front.face.values()]).toEqual([2, 6, 10, 14]);
    expect([...front.content.values()].map((s) => s.objects[0].id)).toEqual(['t2', 't6', 't10', 't14']);
    expect([...sheetFaces(job, 2, true).values()]).toEqual([17, 21, 25, 29]);
  });

  it('회전 배치·뒷면 반 바퀴에서도 원래 페이지와 날짜·타공 재료를 보존한다', () => {
    const m5 = diaryFromPreset('d2', 'M5', 'M5', '#000000');
    const work = workWith(8);
    const faces = expandWork(work, today);
    faces[3] = { ...faces[3], month: { year: 2026, month: 11 } };
    const job = printJob(work, m5, faces, {
      ...settings, paper: { ...settings.paper, width: 220, height: 75 }, allowRotate: true, backTurn180: true,
    }, { mode: 'all', text: '' });
    expect(job.input.layout.rotated).toBe(true);
    // 회전 배치의 기본 뒷면은 이미 반 바퀴 돈다. 추가 반 바퀴는 내용 회전을 되돌린다.
    expect(job.backLayout.turn180).toBe(false);
    expect(job.backLayout.slots[0].x).toBeCloseTo(job.input.layout.slots[0].x);
    expect(job.backLayout.slots[0].y).toBeCloseTo(75 - job.input.layout.slots[0].y - job.input.layout.slots[0].height);
    const back = sheetSlots(job, 0, true, m5);
    const slot = [...back.face].find(([, f]) => f === 3)![0];
    expect(back.content.get(slot)?.calendar).toMatchObject({ year: 2026, page: 10 });
    expect(back.content.get(slot)?.objects[0].id).toBe('t3');
    expect(back.content.get(slot)?.punch).toEqual(m5.punch);
  });

  it('100장 넘는 양면 작업도 마지막 종이의 원래 페이지 번호와 PDF 재료가 맞는다', () => {
    const job = jobFor(workWith(803));
    expect(job.sheets).toBe(101);
    expect([...sheetFaces(job, 100, false).values()]).toEqual([800, 802]);
    expect([...sheetFaces(job, 100, true).values()]).toEqual([801]);
    expect(sheetSlots(job, 100, false, diary).content.get(1)?.objects[0].id).toBe('t802');
  });
});
