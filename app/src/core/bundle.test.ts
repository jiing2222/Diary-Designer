import { describe, expect, it } from 'vitest';
import { bundleWorks, fileNameOf, planImport, readFile, FILE_FORMAT, type RingsFile } from './bundle';
import { diaryFromPreset, type Diary } from './diary';
import { newWork, type PageItem, type Work } from './work';
import type { DiaryObject } from './objects';

const now = '2026-10-13T00:00:00.000Z';
const m6 = (id: string): Diary => diaryFromPreset(id, 'M6', 'M6', '#000');
const a5 = (id: string): Diary => diaryFromPreset(id, 'A5', 'A5', '#000');
const workWith = (id: string, diaryId: string, objects: DiaryObject[] = []): Work => {
  const w = { ...newWork({ name: id, diaryId, now }), id };
  const page = w.items[0] as PageItem;
  return { ...w, items: [{ ...page, face: { ...page.face, objects } }] };
};
const fontText = (font: string): DiaryObject => ({ id: 't1', type: 'text', x: 0, y: 0, width: 10, height: 5, text: 'a', font });
const empty = { works: [], diaries: [], fonts: [], images: [] };
const fileOf = (p: Partial<RingsFile>): RingsFile => ({ format: FILE_FORMAT, version: 1, savedAt: now, works: [], diaries: [], fonts: [], images: [], ...p });

describe('작업 파일로 묶기', () => {
  it('고른 작업과 그 다이어리, 쓰는 글꼴만 담는다(파일이 있는 것만, 휴지통은 뺀다)', () => {
    const snap = {
      works: [workWith('w1', 'd1', [fontText('f1')]), workWith('w2', 'd2'), { ...workWith('w3', 'd1'), trashedAt: now }],
      diaries: [m6('d1'), a5('d2')],
      fonts: [{ id: 'f1', name: 'Hand' }, { id: 'f2', name: 'Other' }],
      images: [],
    };
    const f = bundleWorks(snap, ['w1', 'w3'], { font: (id) => (id === 'f1' ? 'AAA' : 'BBB'), image: () => undefined }, now);
    expect(f.works.map((w) => w.id)).toEqual(['w1']);
    expect(f.diaries.map((d) => d.id)).toEqual(['d1']);
    expect(f.fonts).toEqual([{ info: { id: 'f1', name: 'Hand' }, data: 'AAA' }]);
  });

  it('파일 이름에 못 쓰는 글자를 뺀다', () => {
    expect(fileNameOf('주간: 10/5')).toBe('주간 10 5.rings');
    expect(fileNameOf('  ')).toBe('rings.rings');
  });
});

describe('작업 파일 읽기', () => {
  it('다른 파일·더 새 판은 이유와 함께 거절한다', () => {
    expect(readFile('not json')).toHaveProperty('error');
    expect(readFile('{"format":"other"}')).toHaveProperty('error');
    expect(readFile(JSON.stringify({ format: FILE_FORMAT, version: 99, works: [], diaries: [] }))).toHaveProperty('error');
  });

  it('글꼴·이미지 칸이 없는 파일도 읽는다', () => {
    const r = readFile(JSON.stringify({ format: FILE_FORMAT, version: 1, works: [], diaries: [] }));
    expect('ok' in r && r.ok.fonts).toEqual([]);
  });
});

describe('불러오기 계획 — 받는 쪽을 덮어쓰지 않는다', () => {
  it('id가 겹치는 작업은 새 id로, 폴더는 비운다', () => {
    const local = { ...empty, works: [workWith('w1', 'd1')], diaries: [m6('d1')] };
    const file = fileOf({ works: [{ ...workWith('w1', 'd9'), folderId: 'fo1' }], diaries: [a5('d9')] });
    const plan = planImport(local, file, () => 0);
    expect(plan.works).toHaveLength(1);
    expect(plan.works[0].id).not.toBe('w1');
    expect(plan.works[0].folderId).toBeUndefined();
  });

  it('같은 종이의 다이어리가 있으면 그것을 쓰고 새로 만들지 않는다', () => {
    const local = { ...empty, diaries: [m6('mine')] };
    const plan = planImport(local, fileOf({ works: [workWith('w1', 'theirs')], diaries: [m6('theirs')] }));
    expect(plan.diaries).toEqual([]);
    expect(plan.works[0].diaryId).toBe('mine');
  });

  it('id만 겹치고 종이가 다른 다이어리는 새 id, 작업도 따라간다', () => {
    const local = { ...empty, diaries: [m6('d1')] };
    const plan = planImport(local, fileOf({ works: [workWith('w1', 'd1')], diaries: [a5('d1')] }), () => 0);
    expect(plan.diaries).toHaveLength(1);
    expect(plan.diaries[0].id).not.toBe('d1');
    expect(plan.works[0].diaryId).toBe(plan.diaries[0].id);
  });

  it('같은 글꼴은 다시 등록하지 않고, id만 겹치면 새 id로 — 객체도 따라간다', () => {
    const file = fileOf({
      works: [workWith('w1', 'd1', [fontText('f1')]), workWith('w2', 'd1', [fontText('f2')])],
      diaries: [m6('d1')],
      fonts: [
        { info: { id: 'f1', name: 'Same' }, data: 'A' },
        { info: { id: 'f2', name: 'Theirs' }, data: 'B' },
      ],
    });
    const local = { ...empty, fonts: [{ id: 'f1', name: 'Same' }, { id: 'f2', name: 'Mine' }] };
    const plan = planImport(local, file, () => 0);
    expect(plan.fonts).toHaveLength(1);
    const id = plan.fonts[0].info.id;
    expect(id).not.toBe('f2');
    expect(plan.fonts[0].data).toBe('B');
    const fontOf = (w: Work) => ((w.items[0] as PageItem).face.objects[0] as { font?: string }).font;
    expect(fontOf(plan.works[0])).toBe('f1');
    expect(fontOf(plan.works[1])).toBe(id);
  });
});
