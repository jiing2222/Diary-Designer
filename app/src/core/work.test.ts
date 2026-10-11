import { describe, expect, it } from 'vitest';
import {
  cloneItem,
  duplicateItem,
  expandWork,
  faceCount,
  moveItem,
  newPage,
  newWork,
  removeItem,
  sheetSideOf,
  spreadsOf,
  type DatedItem,
  type Face,
  type WorkItem,
} from './work';
import { DEFAULT_DOT_GRID } from './grid';
import { emptyOverride } from './dated';
import type { TextObject } from './objects';

const today = { year: 2026, month: 10, day: 11 };

const dayField = (id: string, offset = 0, format = 'M/D'): TextObject => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  width: 10,
  height: 5,
  text: '',
  field: { offset, format },
});

const face = (objects: Face['objects']): Face => ({ id: 'f1', background: DEFAULT_DOT_GRID, objects });

const dated = (over: Partial<DatedItem> = {}): DatedItem => ({
  kind: 'dated',
  id: 'dt1',
  faces: [face([dayField('t1')])],
  dataset: { kind: 'date', perPage: 1, start: '2026-10-01', end: '2026-10-03', step: 'day' },
  boundary: 'continue',
  overrides: {},
  ...over,
});

const texts = (items: WorkItem[]) => expandWork({ items }, today).map((f) => (f.objects[0] as TextObject).text);

describe('expandWork', () => {
  it('보통 페이지의 날짜 필드는 오늘 날짜로 보인다', () => {
    expect(texts([{ kind: 'page', id: 'p1', face: face([dayField('t1')]) }])).toEqual(['10/11']);
  });

  it('날짜 묶음은 쪽마다 실제 날짜 — 자리표시가 아니다', () => {
    expect(texts([dated()])).toEqual(['10/1', '10/2', '10/3']);
  });

  it('10/2만 색을 바꾸면 그 쪽만 바뀌고 글자는 그대로 날짜', () => {
    const item = dated({ overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } } });
    const out = expandWork({ items: [item] }, today);
    expect(out.map((f) => (f.objects[0] as TextObject).color)).toEqual([undefined, '@A', undefined]);
    expect((out[1].objects[0] as TextObject).text).toBe('10/2');
  });

  it('원본 글꼴을 바꾸면 색만 바꾼 10/2에도 반영된다 (속성 단위)', () => {
    const item = dated({
      faces: [face([{ ...dayField('t1'), font: 'myfont' }])],
      overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } },
    });
    const out = expandWork({ items: [item] }, today);
    expect(out[1].objects[0]).toMatchObject({ font: 'myfont', color: '@A' });
  });

  it('기간을 바꿔도 수정은 날짜를 따라간다', () => {
    const ov = { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } };
    const item = dated({
      overrides: ov,
      dataset: { kind: 'date', perPage: 1, start: '2026-09-30', end: '2026-10-02', step: 'day' },
    });
    const out = expandWork({ items: [item] }, today);
    expect(out.map((f) => (f.objects[0] as TextObject).color)).toEqual([undefined, undefined, '@A']);
  });

  it('앞뒤 양식이면 쪽마다 두 면, 수정은 면 번호로 구별', () => {
    const item = dated({
      faces: [face([dayField('t1')]), { id: 'f2', background: DEFAULT_DOT_GRID, objects: [dayField('t2')] }],
      overrides: { '2026-10-01/1': { ...emptyOverride(), removed: ['t2'] } },
    });
    const out = expandWork({ items: [item] }, today);
    expect(out).toHaveLength(6);
    expect(out[1].objects).toEqual([]);
    expect(out[0].period).toEqual({ key: '2026-10-01', faceIndex: 0 });
  });

  it('자동 필드 id를 알려준다 — 글자를 직접 바꾼 쪽은 빠진다', () => {
    const item = dated({ overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { text: '생일' } } } } });
    const out = expandWork({ items: [item] }, today);
    expect(out.map((f) => f.fieldIds)).toEqual([['t1'], [], ['t1']]);
  });

  it('달력 객체가 그릴 달을 알려준다', () => {
    const item = dated({ dataset: { kind: 'calendar', year: 2027 }, faces: [face([])] });
    const out = expandWork({ items: [item] }, today);
    expect(out[2].month).toEqual({ year: 2027, month: 3 });
  });

  it('보통 페이지와 날짜 묶음을 섞는다', () => {
    const out = expandWork({ items: [newPage(), dated(), newPage()] }, today);
    expect(out).toHaveLength(5);
  });
});

describe('faceCount', () => {
  it('펼친 면 개수', () => {
    expect(faceCount({ items: [newPage(), dated()] })).toBe(4);
  });
});

describe('페이지 다루기', () => {
  const a = newPage();
  const b = newPage();

  it('여러 장 복제는 원본 바로 뒤에, 새 id로', () => {
    const out = duplicateItem([a, b], 0, 3);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(a);
    expect(out[4]).toBe(b);
    expect(new Set(out.map((i) => i.id)).size).toBe(5);
  });

  it('복제한 객체도 새 id', () => {
    const page = { ...newPage(), face: face([dayField('t1')]) };
    const copy = cloneItem(page);
    expect(copy.kind === 'page' && copy.face.objects[0].id).not.toBe('t1');
  });

  it('날짜 묶음을 복제하면 개별 수정도 새 id를 따라간다', () => {
    const item = dated({ overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } } });
    const copy = cloneItem(item) as DatedItem;
    const newObjId = copy.faces[0].objects[0].id;
    expect(copy.overrides['2026-10-02/0'].props[newObjId]).toEqual({ color: '@A' });
    expect(texts([copy])[1]).toBe('10/2');
    expect(expandWork({ items: [copy] }, today)[1].objects[0]).toMatchObject({ color: '@A' });
  });

  it('지우기·옮기기', () => {
    expect(removeItem([a, b], 0)).toEqual([b]);
    expect(moveItem([a, b], 0, 1)).toEqual([b, a]);
    expect(moveItem([a, b], 5, 0)).toEqual([a, b]);
  });
});

describe('종이와 펼침면', () => {
  it('양면: 면 0·1이 1장의 앞·뒤', () => {
    expect(sheetSideOf(0, true)).toEqual({ sheet: 0, side: 'front' });
    expect(sheetSideOf(1, true)).toEqual({ sheet: 0, side: 'back' });
    expect(sheetSideOf(2, true)).toEqual({ sheet: 1, side: 'front' });
  });

  it('단면: 면마다 한 장', () => {
    expect(sheetSideOf(2, false)).toEqual({ sheet: 2, side: 'front' });
  });

  it('펼침면: 첫 면은 오른쪽에 혼자, 그 뒤로 (뒷면|앞면)', () => {
    expect(spreadsOf(4)).toEqual([
      [null, 0],
      [1, 2],
      [3, null],
    ]);
    expect(spreadsOf(0)).toEqual([]);
  });
});

describe('newWork', () => {
  it('빈 페이지 하나로 시작, 양면, 기본 팔레트', () => {
    const w = newWork({ name: '10월 다이어리', diaryId: 'd1', now: '2026-10-11T00:00:00Z' });
    expect(w.items).toHaveLength(1);
    expect(w.duplex).toBe(true);
    expect(w.palette.points).toEqual([]);
  });
});
