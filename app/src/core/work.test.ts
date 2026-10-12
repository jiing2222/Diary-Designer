import { describe, expect, it } from 'vitest';
import {
  allIdsOf,
  colorRefUsage,
  cloneItem,
  editableBackground,
  faceLabel,
  editableObjects,
  sourcePreview,
  writeBackground,
  writeObjects,
  duplicateItem,
  expandWork,
  faceCount,
  moveItem,
  newPage,
  newWork,
  removeItem,
  sheetSideOf,
  spreadsOf,
  spreadByDates,
  changedIds,
  revertToSource,
  type DatedItem,
  type Face,
  type WorkItem,
} from './work';
import { DEFAULT_DOT_GRID } from './grid';
import { emptyOverride, suggestPerPage } from './dated';
import { moonPhaseOf } from './moon';
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
    expect(out[0].period).toMatchObject({ key: '2026-10-01', faceIndex: 0 });
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

describe('고치기 — 무엇을 고치고 어디에 저장하나', () => {
  const field = dayField('t1');
  const page = { kind: 'page' as const, id: 'p1', face: face([field]) };

  it('보통 페이지는 field가 살아 있는 원본을 고친다', () => {
    const resolved = expandWork({ items: [page] }, today)[0];
    const objs = editableObjects({ items: [page] }, { kind: 'face', face: resolved });
    expect((objs[0] as TextObject).field).toEqual({ offset: 0, format: 'M/D' });
  });

  it('보통 페이지에 쓰면 면이 바뀐다', () => {
    const resolved = expandWork({ items: [page] }, today)[0];
    const items = writeObjects({ items: [page] }, { kind: 'face', face: resolved }, []);
    expect((items[0] as typeof page).face.objects).toEqual([]);
  });

  describe('날짜 페이지', () => {
    const item = dated();
    const work = { items: [item] as WorkItem[] };
    const faces = expandWork(work, today);
    const target = { kind: 'face' as const, face: faces[1] }; // 10/2

    it('보이는 그대로(날짜가 채워진 것)를 고친다', () => {
      expect((editableObjects(work, target)[0] as TextObject).text).toBe('10/2');
    });

    it('색만 바꾸면 그 날짜의 수정으로 — 원본은 그대로', () => {
      const edited = editableObjects(work, target).map((o) => ({ ...o, color: '@A' }));
      const items = writeObjects(work, target, edited);
      const next = items[0] as DatedItem;
      expect(next.faces).toBe(item.faces);
      expect(next.overrides['2026-10-02/0'].props.t1).toEqual({ color: '@A' });
      const out = expandWork({ items }, today);
      expect(out.map((f) => (f.objects[0] as TextObject).color)).toEqual([undefined, '@A', undefined]);
    });

    it('다시 원본과 같게 고치면 수정이 사라진다', () => {
      const withEdit = writeObjects(
        work,
        target,
        editableObjects(work, target).map((o) => ({ ...o, color: '@A' })),
      );
      const faces2 = expandWork({ items: withEdit }, today);
      const back = writeObjects({ items: withEdit }, { kind: 'face', face: faces2[1] }, editableObjects(work, target));
      expect((back[0] as DatedItem).overrides).toEqual({});
    });
  });

  describe('원본 편집', () => {
    it('원본을 고치면 모든 날짜에', () => {
      const item = dated();
      const target = { kind: 'source' as const, itemId: 'dt1', faceIndex: 0 };
      const edited = editableObjects({ items: [item] }, target).map((o) => ({ ...o, color: '@B' }));
      const items = writeObjects({ items: [item] }, target, edited);
      const out = expandWork({ items }, today);
      expect(out.every((f) => (f.objects[0] as TextObject).color === '@B')).toBe(true);
    });

    it('원본에서 객체를 지우면 그 객체에 붙은 날짜별 수정도 지운다', () => {
      const item = dated({ overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } } });
      const items = writeObjects({ items: [item] }, { kind: 'source', itemId: 'dt1', faceIndex: 0 }, []);
      expect((items[0] as DatedItem).overrides).toEqual({});
    });

    it('원본 미리보기는 기간의 첫 날짜로 채운다', () => {
      const preview = sourcePreview(dated(), 0);
      expect((preview!.objects[0] as TextObject).text).toBe('10/1');
      expect(preview?.fieldIds).toEqual(['t1']);
    });
  });

  it('날짜 페이지에서 바탕을 바꾸면 원본 면의 바탕이 바뀐다', () => {
    const item = dated();
    const faces = expandWork({ items: [item] }, today);
    const items = writeBackground({ items: [item] }, { kind: 'face', face: faces[2] }, { spacing: 7 });
    expect((items[0] as DatedItem).faces[0].background.spacing).toBe(7);
    expect(editableBackground({ items }, { kind: 'face', face: faces[0] })?.spacing).toBe(7);
  });

  it('allIdsOf는 항목·면·객체·그룹 id를 모두', () => {
    const w = { ...newWork({ name: 'w', diaryId: 'd', now: '' }), items: [{ ...page, face: face([{ ...field, groupId: 'g9' }]) }] };
    expect(allIdsOf(w)).toEqual(expect.arrayContaining(['p1', 'f1', 't1', 'g9', w.id]));
  });
});

describe('colorRefUsage', () => {
  it('이름표를 쓰는 객체 수와 면 수 — 날짜 묶음은 펼친 면마다 센다', () => {
    const item = dated({ faces: [face([{ ...dayField('t1'), color: '@A' }])] });
    expect(colorRefUsage({ items: [item] }, '@A', today)).toEqual({ objects: 3, faces: 3 });
    expect(colorRefUsage({ items: [item] }, '@B', today)).toEqual({ objects: 0, faces: 0 });
  });
});

describe('faceLabel', () => {
  it('보통 페이지·날짜 페이지·달력형', () => {
    expect(faceLabel({}, 2)).toBe('p.3');
    expect(faceLabel({ period: { key: '2026-10-05', faceIndex: 0, dates: [] } }, 0)).toBe('p.1 · 10/5');
    expect(faceLabel({ period: { key: '2027-03', faceIndex: 0, dates: [] } }, 4)).toBe('p.5 · 2027.03');
  });
});

describe('날짜로 펼치기', () => {
  it('보통 페이지가 원본이 되어 기간만큼 펼쳐진다', () => {
    const page = { kind: 'page' as const, id: 'p1', face: face([dayField('t1')]) };
    const item = spreadByDates(page, { kind: 'date', perPage: 1, start: '2026-10-01', end: '2026-10-31', step: 'day' }, 'continue');
    expect(item.faces[0]).toBe(page.face);
    const out = texts([item]);
    expect(out).toHaveLength(31);
    expect(out[4]).toBe('10/5');
  });

  it('날짜 페이지 하나에만 놓은 자동 필드도 그 날짜로 채워지고, 고칠 때는 자동 필드로 남는다', () => {
    const added = dayField('t9', 0, 'D');
    const item = dated({ overrides: { '2026-10-02/0': { ...emptyOverride(), added: [added] } } });
    const faces = expandWork({ items: [item] }, today);
    expect((faces[1].objects[1] as TextObject).text).toBe('2');
    expect(faces[1].fieldIds).toContain('t9');
    expect(faces[0].objects).toHaveLength(1);

    const target = { kind: 'face' as const, face: faces[1] };
    const editable = editableObjects({ items: [item] }, target);
    expect((editable[1] as TextObject).field).toEqual({ offset: 0, format: 'D' });
    // 그대로 다시 써도 그 날짜에만 더한 자동 필드로 남는다
    const items = writeObjects({ items: [item] }, target, editable);
    expect((items[0] as DatedItem).overrides['2026-10-02/0'].added[0]).toMatchObject({ id: 't9', field: { offset: 0, format: 'D' } });
  });
});

describe('원본으로 되돌리기', () => {
  it('날짜 페이지에서 바꾼 객체를 알려주고, 되돌리면 그 날짜의 수정이 사라진다', () => {
    const item = dated({ overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } } });
    const faces = expandWork({ items: [item] }, today);
    const target = { kind: 'face' as const, face: faces[1] };
    expect(changedIds({ items: [item] }, target)).toEqual(['t1']);
    expect(changedIds({ items: [item] }, { kind: 'face' as const, face: faces[0] })).toEqual([]);
    const items = revertToSource({ items: [item] }, target, ['t1']);
    expect((items[0] as DatedItem).overrides).toEqual({});
  });
});

describe('페이지 번호', () => {
  const pageNo = (id: string): TextObject => ({ ...dayField(id), field: { offset: 0, format: 'n / N', kind: 'page' } });
  const pg = (id: string, objects: Face['objects']): WorkItem => ({ kind: 'page', id, face: { ...face(objects), id: `f${id}` } });

  it('번호 칸이 있는 면만 센다 — 표지에 없으면 다음 면이 1', () => {
    const items = [pg('cover', []), pg('a', [pageNo('n1')]), pg('b', [pageNo('n2')])];
    const out = expandWork({ items }, today).map((f) => (f.objects[0] as TextObject | undefined)?.text);
    expect(out).toEqual([undefined, '1 / 2', '2 / 2']);
  });

  it('날짜 묶음의 면도 차례로 세고, 고칠 때는 번호 칸으로 남는다', () => {
    const item = dated({ faces: [face([pageNo('n1')])] });
    const faces = expandWork({ items: [item] }, today);
    expect(faces.map((f) => (f.objects[0] as TextObject).text)).toEqual(['1 / 3', '2 / 3', '3 / 3']);
    expect(faces[1].fieldIds).toEqual(['n1']);
    const editable = editableObjects({ items: [item] }, { kind: 'face', face: faces[1] });
    expect((editable[0] as TextObject).field?.kind).toBe('page');
  });
});

describe('색 규칙', () => {
  const rules = { sunday: '@B' };
  // 10/4(일) ~ 10/6
  const item = (over: Partial<DatedItem> = {}) =>
    dated({ dataset: { kind: 'date', perPage: 1, start: '2026-10-04', end: '2026-10-06', step: 'day' }, ...over });
  const colors = (items: WorkItem[]) =>
    expandWork({ items, colorRules: rules }, today).map((f) => (f.objects[0] as TextObject).color);

  it('일요일 날짜 칸만 규칙 색', () => {
    expect(colors([item()])).toEqual(['@B', undefined, undefined]);
  });

  it('그 날짜에서 직접 바꾼 색이 규칙보다 우선', () => {
    const it2 = item({ overrides: { '2026-10-04/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } } });
    expect(colors([it2])).toEqual(['@A', undefined, undefined]);
  });

  it('달·주차 칸은 칠하지 않는다', () => {
    expect(colors([item({ faces: [face([dayField('t1', 0, 'MMMM')])] })])).toEqual([undefined, undefined, undefined]);
  });

  it('고칠 객체에는 규칙 색이 없어서, 다른 걸 고쳐도 규칙 색이 날짜별 수정으로 저장되지 않는다', () => {
    const work = { items: [item()] as WorkItem[], colorRules: rules };
    const faces = expandWork(work, today);
    const target = { kind: 'face' as const, face: faces[0] };
    const editable = editableObjects(work, target);
    expect((editable[0] as TextObject).color).toBeUndefined();
    const moved = editable.map((o) => ({ ...o, x: 5 }));
    const items = writeObjects(work, target, moved);
    expect((items[0] as DatedItem).overrides['2026-10-04/0'].props.t1).toEqual({ x: 5 });
  });

  it('보통 페이지도 오늘이 일요일이면 규칙 색', () => {
    expect(colors([{ kind: 'page', id: 'p1', face: face([dayField('t1')]) }])).toEqual(['@B']); // 오늘 10/11(일)
  });
});

describe('달 모양', () => {
  const moon = { id: 'mo1', type: 'moon' as const, x: 0, y: 0, width: 5, height: 5, offset: 0 };

  it('날짜 묶음의 페이지마다 그 날의 위상 — 고칠 객체(보통 페이지)에는 위상이 저장되지 않는다', () => {
    // 2026-09-25 추석(보름) ~ 9/27
    const item = dated({
      faces: [face([moon])],
      dataset: { kind: 'date', perPage: 1, start: '2026-09-25', end: '2026-09-27', step: 'day' },
    });
    const phases = expandWork({ items: [item] }, today).map((f) => (f.objects[0] as typeof moon & { phase?: number }).phase);
    expect(phases[0]).toBe(4);
    expect(phases).toHaveLength(3);
    const page = { kind: 'page' as const, id: 'p1', face: face([moon]) };
    expect(editableObjects({ items: [page] }, { kind: 'face', face: expandWork({ items: [page] }, today)[0] })[0]).not.toHaveProperty('phase');
  });

  it('날짜 페이지에서 달의 순번만 바꾸면 위상도 그 날짜로 다시 정해진다', () => {
    // 위상이 바뀌는 이틀을 찾는다(같은 위상이면 이 테스트는 아무것도 확인하지 못한다).
    let day = 1;
    while (moonPhaseOf({ year: 2026, month: 9, day }) === moonPhaseOf({ year: 2026, month: 9, day: day + 1 })) day++;
    const start = `2026-09-${String(day).padStart(2, '0')}`;
    const end = `2026-09-${String(day + 1).padStart(2, '0')}`;
    // 한 페이지에 이틀 — 그 페이지의 달을 둘째 날짜로
    const item = dated({
      faces: [face([moon])],
      dataset: { kind: 'date', perPage: 2, start, end, step: 'day' },
      overrides: { [`${start}/0`]: { ...emptyOverride(), props: { mo1: { offset: 1 } } } },
    });
    const shown = expandWork({ items: [item] }, today)[0].objects[0] as typeof moon & { phase?: number };
    expect(shown.phase).toBe(moonPhaseOf({ year: 2026, month: 9, day: day + 1 }));
    expect(shown.phase).not.toBe(moonPhaseOf({ year: 2026, month: 9, day }));
  });

  it('한 페이지에 며칠 제안에 달의 순번도 센다', () => {
    expect(suggestPerPage([{ ...moon, offset: 6 }])).toBe(7);
  });
});
