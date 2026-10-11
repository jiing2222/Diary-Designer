import { beforeEach, describe, expect, it } from 'vitest';
import { facesOf, targetOf, useStore } from './store';
import { MAX_TABS, LIBRARY_TAB } from './core/workspace';
import { emptyOverride } from './core/dated';
import type { DatedItem, PageItem, Work } from './core/work';
import type { TextObject } from './core/objects';
import { DEFAULT_DOT_GRID } from './core/grid';

const initial = useStore.getState();
beforeEach(() => {
  useStore.setState(initial, true);
  useStore.setState({ ready: true, today: '2026-10-11' });
});

const s = () => useStore.getState();
const active = (): Work => s().works.find((w) => w.id === s().tabs.active)!;

/** 지금 작업의 항목들을 바로 갈아 끼운다 — 날짜 묶음처럼 화면 없이는 만들기 번거로운 것을 준비할 때. */
function setItems(items: Work['items']) {
  const id = s().tabs.active;
  useStore.setState({ works: s().works.map((w) => (w.id === id ? { ...w, items } : w)) });
}

const dayField = (id: string): TextObject => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  width: 10,
  height: 5,
  text: '',
  field: { offset: 0, format: 'M/D' },
});

const datedItem = (): DatedItem => ({
  kind: 'dated',
  id: 'dt1',
  faces: [{ id: 'fc1', background: DEFAULT_DOT_GRID, objects: [dayField('t1')] }],
  dataset: { kind: 'date', perPage: 1, start: '2026-10-01', end: '2026-10-03', step: 'day' },
  boundary: 'continue',
  overrides: {},
});

describe('작업 만들기와 탭', () => {
  it('새 작업을 만들면 탭이 열리고 다이어리가 없으면 M6로 하나 생긴다', () => {
    const id = s().createWork('10월 다이어리');
    expect(s().tabs.open).toEqual([id]);
    expect(s().tabs.active).toBe(id);
    expect(s().diaries).toHaveLength(1);
    expect(s().diaries[0].presetId).toBe('M6');
    expect(active().name).toBe('10월 다이어리');
  });

  it('같은 이름이면 번호를 붙인다', () => {
    s().createWork('메모');
    s().createWork('메모');
    expect(s().works.map((w) => w.name)).toEqual(['메모', '메모 2']);
  });

  it(`탭이 ${MAX_TABS}개면 열지 않고 물어본다`, () => {
    const ids = Array.from({ length: MAX_TABS }, () => s().createWork()!);
    s().closeWorkTab(ids[0]);
    s().createWork(); // 다시 10개
    s().openWork(ids[0]);
    expect(s().pendingOpen?.workId).toBe(ids[0]);
    s().resolvePendingOpen(true);
    expect(s().tabs.open).toContain(ids[0]);
    expect(s().tabs.open).toHaveLength(MAX_TABS);
  });

  it('휴지통에 넣으면 탭이 닫힌다', () => {
    const id = s().createWork()!;
    s().trashWorkById(id);
    expect(s().tabs.open).toEqual([]);
    expect(s().tabs.active).toBe(LIBRARY_TAB);
    expect(s().works[0].trashedAt).toBeDefined();
  });
});

describe('편집 — 보통 페이지', () => {
  beforeEach(() => {
    s().createWork();
  });

  it('선을 그으면 지금 면에 들어가고 되돌리면 사라진다', () => {
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    expect((active().items[0] as PageItem).face.objects).toHaveLength(1);
    s().undo();
    expect((active().items[0] as PageItem).face.objects).toHaveLength(0);
    s().redo();
    expect((active().items[0] as PageItem).face.objects).toHaveLength(1);
  });

  it('페이지 추가는 지금 면 뒤에, 되돌리기도 된다', () => {
    s().addPageAfterCurrent();
    expect(active().items).toHaveLength(2);
    s().undo();
    expect(active().items).toHaveLength(1);
  });

  it('+ 페이지 추가는 맨 뒤에, 양면이면 앞·뒤 두 면, 새 페이지로 간다', () => {
    s().addPagesAtEnd();
    expect(active().items).toHaveLength(3);
    // 면 0(오른쪽 혼자) | (1|2) — 새 첫 면 1은 펼침면 1의 왼쪽
    expect(s().cursors[active().id]).toMatchObject({ spread: 1, side: 'back' });
  });

  it('단면이면 한 면만', () => {
    s().setDuplex(false);
    s().addPagesAtEnd();
    expect(active().items).toHaveLength(2);
    expect(s().cursors[active().id]).toMatchObject({ spread: 1, side: 'front' });
  });

  it('보던 펼침면이 지워지면 마지막 펼침면을 본다', () => {
    s().duplicateItemAt(0, 4); // 면 5개 → 펼침면 3개
    s().goTo(2, 'front');
    s().removeItemAt(4);
    s().removeItemAt(3);
    s().removeItemAt(2); // 면 2개 → 펼침면 2개
    expect(targetOf(s(), 'back')).not.toBeNull();
  });

  it('날짜 칸은 글자가 비어 있어도 놓인다(보이는 값은 날짜)', () => {
    s().commitText({ x: 0, y: 0, width: 10, height: 5, text: '', field: { offset: 0, format: 'M/D' } });
    expect((active().items[0] as PageItem).face.objects).toHaveLength(1);
  });

  it('여러 장 복제', () => {
    s().duplicateItemAt(0, 4);
    expect(active().items).toHaveLength(5);
  });

  it('펼침면: 첫 면은 오른쪽(앞면) 혼자, 그다음 펼침면은 왼쪽·오른쪽', () => {
    s().duplicateItemAt(0, 2); // 면 3개
    expect(targetOf(s(), 'back')).toBeNull();
    s().goTo(1, 'back');
    const left = targetOf(s(), 'back');
    const right = targetOf(s(), 'front');
    expect(left?.kind === 'face' && facesOf(active(), s().today).indexOf(left.face)).toBe(1);
    expect(right?.kind === 'face' && facesOf(active(), s().today).indexOf(right.face)).toBe(2);
  });

  it('펼침면 두 면을 잇는 선은 한 번에 그려지고 한 번에 되돌려진다', () => {
    s().duplicateItemAt(0, 2);
    s().goTo(1, 'back');
    s().commitCrossBoundaryLine({ x1: 70, y1: 10, x2: 80, y2: 10 }, { x1: 0, y1: 10, x2: 10, y2: 10 }, 'front');
    const count = () => active().items.map((i) => (i as PageItem).face.objects.length);
    expect(count()).toEqual([0, 1, 1]);
    s().undo();
    expect(count()).toEqual([0, 0, 0]);
  });

  it('다른 작업에 붙여넣으면 같은 자리에', () => {
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    const line = (active().items[0] as PageItem).face.objects[0];
    s().select([line.id]);
    s().copySelected();
    s().createWork();
    s().pasteClipboard();
    const pasted = (active().items[0] as PageItem).face.objects[0];
    expect(pasted).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(pasted.id).not.toBe(line.id);
  });
});

describe('편집 — 날짜 묶음', () => {
  beforeEach(() => {
    s().createWork();
    setItems([datedItem()]);
    useStore.setState({ cursors: {} });
  });

  it('날짜 페이지에서 색을 바꾸면 그 날짜의 수정 — 원본은 그대로', () => {
    s().goTo(1, 'back'); // 펼침면 1 = (10/2 | 10/3)
    s().select(['t1']);
    s().styleText({ color: '@A' });
    const item = active().items[0] as DatedItem;
    expect(item.overrides['2026-10-02/0'].props.t1).toEqual({ color: '@A' });
    expect(item.faces[0].objects[0]).not.toHaveProperty('color');
  });

  it('원본 편집에서 바꾸면 모든 날짜에, 날짜별 수정은 남는다', () => {
    const item = datedItem();
    setItems([{ ...item, overrides: { '2026-10-02/0': { ...emptyOverride(), props: { t1: { color: '@A' } } } } }]);
    s().enterSourceEdit('dt1', 0);
    s().select(['t1']);
    s().styleText({ size: 4 });
    const faces = facesOf(active(), s().today);
    expect(faces.map((f) => (f.objects[0] as TextObject).size)).toEqual([4, 4, 4]);
    expect(faces.map((f) => (f.objects[0] as TextObject).color)).toEqual([undefined, '@A', undefined]);
  });

  it('이 날짜에서 바꾼 것을 원본으로 되돌린다', () => {
    s().goTo(1, 'back');
    s().select(['t1']);
    s().styleText({ color: '@A' });
    s().revertSelectedToSource();
    expect((active().items[0] as DatedItem).overrides).toEqual({});
    s().undo();
    expect(Object.keys((active().items[0] as DatedItem).overrides)).toEqual(['2026-10-02/0']);
  });

  it('원본 편집 중에는 왼쪽 면이 없다', () => {
    s().enterSourceEdit('dt1', 0);
    expect(targetOf(s(), 'back')).toBeNull();
    expect(targetOf(s(), 'front')?.kind).toBe('source');
  });
});

describe('날짜로 펼치기', () => {
  beforeEach(() => {
    s().createWork();
  });
  const october = { kind: 'date' as const, perPage: 1, start: '2026-10-01', end: '2026-10-31', step: 'day' as const };

  it('보통 페이지를 펼치면 31장, 되돌리면 한 장', () => {
    const page = active().items[0];
    s().setDatedPeriod(page.id, october, 'continue');
    expect(facesOf(active(), s().today)).toHaveLength(31);
    s().undo();
    expect(facesOf(active(), s().today)).toHaveLength(1);
  });

  it('기간을 바꿔도 10/5의 수정은 10/5에 남는다', () => {
    setItems([datedItem()]);
    useStore.setState({ cursors: {} });
    s().setDatedPeriod('dt1', october, 'continue');
    s().goTo(2, 'front'); // 펼침면 2 = (10/4 | 10/5)
    s().select(['t1']);
    s().styleText({ color: '@A' });
    s().setDatedPeriod('dt1', { ...october, start: '2026-09-28' }, 'continue');
    const item = active().items[0] as DatedItem;
    expect(Object.keys(item.overrides)).toEqual(['2026-10-05/0']);
    const faces = facesOf(active(), s().today);
    expect(faces.findIndex((f) => (f.objects[0] as TextObject).color === '@A')).toBe(7); // 9/28부터 8번째
  });
});

describe('작업 색상', () => {
  beforeEach(() => {
    s().createWork();
  });

  it('포인트를 지우면 그 이름표를 쓰던 객체는 주어진 색으로 바뀐다', () => {
    s().addPaletteColor('#8ea8c6');
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    const line = (active().items[0] as PageItem).face.objects[0];
    s().select([line.id]);
    s().styleSelected({ color: '@A' });
    s().removePaletteColor('A', '#8ea8c6');
    expect((active().items[0] as PageItem).face.objects[0]).toMatchObject({ color: '#8ea8c6' });
    expect(active().palette.points).toEqual([]);
  });
});

describe('hydrate', () => {
  it('불러온 id보다 카운터를 올려 새로 만드는 것과 겹치지 않는다', () => {
    s().createWork();
    const loaded = s().works;
    useStore.setState(initial, true);
    s().hydrate({ works: loaded, diaries: [], folders: [] });
    const id = s().createWork();
    expect(loaded.map((w) => w.id)).not.toContain(id);
  });

  it('없어진 작업의 탭은 뺀다', () => {
    s().hydrate({ works: [], diaries: [], folders: [], tabs: { open: ['w99'], active: 'w99', seen: {} } });
    expect(s().tabs.open).toEqual([]);
    expect(s().tabs.active).toBe(LIBRARY_TAB);
  });
});
