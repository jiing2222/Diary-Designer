import { beforeEach, describe, expect, it } from 'vitest';
import { cursorOf, facesOf, savedPrintSettingsOf, targetOf, useStore } from './store';
import { MAX_TABS, LIBRARY_TAB } from './core/workspace';
import { emptyOverride } from './core/dated';
import { allIdsOf, type DatedItem, type PageItem, type Work } from './core/work';
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
  it('새 포인트 색을 취소하면 작업 팔레트에 남지 않는다', () => {
    s().createWork();
    const original = active().palette;
    s().previewPaletteColor('A', '#8ea8c6');
    expect(active().palette).toBe(original);
    expect(s().palettePreview?.palette.points).toEqual([{ key: 'A', color: '#8ea8c6' }]);
    s().finishPalettePreview(false);
    expect(active().palette).toBe(original);
    expect(active().palette.points).toHaveLength(0);
    expect(s().palettePreview).toBeNull();
  });

  it('Library 카드에서 고른 작업의 Print를 바로 연다', () => {
    const a = s().createWork('a')!;
    const b = s().createWork('b')!;
    s().activateTab(LIBRARY_TAB);
    s().openPrint(a);
    expect(s().tabs.active).toBe(a);
    expect(cursorOf(s(), active()).printing).toBe(true);
    s().activateTab(b);
    expect(cursorOf(s(), active()).printing).not.toBe(true);
  });

  it('Print 진입도 탭 수 제한을 지키며 확인 뒤에 열린다', () => {
    const ids = Array.from({ length: MAX_TABS }, () => s().createWork()!);
    s().duplicateWork(ids[0]);
    const extra = s().works.find((w) => !ids.includes(w.id))!;
    s().activateTab(LIBRARY_TAB);
    s().openPrint(extra.id);
    expect(s().pendingOpen?.printing).toBe(true);
    expect(s().tabs.active).toBe(LIBRARY_TAB);
    s().resolvePendingOpen(true);
    expect(s().tabs.active).toBe(extra.id);
    expect(cursorOf(s(), active()).printing).toBe(true);
    expect(s().tabs.open).toHaveLength(MAX_TABS);
  });

  it('새로 읽어도 편집 위치·확대·선택을 복원한다', () => {
    const id = s().createWork()!;
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    const selected = [(active().items[0] as PageItem).face.objects[0].id];
    s().rememberViewport({ zoom: 150, scrollTop: 300 });
    const saved = s();
    s().hydrate({
      works: saved.works, diaries: saved.diaries, folders: saved.folders, tabs: saved.tabs,
      cursors: { [id]: { ...cursorOf(saved, active()), selectedIds: selected } },
    });
    expect(s().selectedIds).toEqual(selected);
    expect(cursorOf(s(), active())).toMatchObject({ zoom: 150, scrollTop: 300 });
  });

  it('작업과 Library를 오가도 그 작업의 선택이 돌아온다', () => {
    const a = s().createWork('a')!;
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    const id = (active().items[0] as PageItem).face.objects[0].id;
    s().select([id]);
    const b = s().createWork('b')!;
    expect(s().selectedIds).toEqual([]);
    s().activateTab(a);
    expect(s().selectedIds).toEqual([id]);
    s().activateTab(LIBRARY_TAB);
    expect(s().selectedIds).toEqual([]);
    s().activateTab(a);
    expect(s().selectedIds).toEqual([id]);
    s().closeWorkTab(b);
    expect(s().selectedIds).toEqual([id]);
  });

  it('다른 페이지로 간 뒤에는 이전 페이지의 선택을 되살리지 않는다', () => {
    const a = s().createWork()!;
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    s().select([(active().items[0] as PageItem).face.objects[0].id]);
    s().activateTab(LIBRARY_TAB);
    s().activateTab(a);
    s().addPageAfterCurrent();
    s().goTo(1);
    s().activateTab(LIBRARY_TAB);
    s().activateTab(a);
    expect(s().selectedIds).toEqual([]);
  });

  it('확대·스크롤은 작업별로 기억하며 선택을 지우지 않는다', () => {
    const a = s().createWork()!;
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
    const ids = [(active().items[0] as PageItem).face.objects[0].id];
    s().select(ids);
    s().rememberViewport({ zoom: 150, scrollTop: 230, scrollLeft: 45 });
    expect(s().selectedIds).toEqual(ids);
    const b = s().createWork()!;
    s().rememberViewport({ zoom: 75, scrollTop: 20, scrollLeft: 0 });
    s().activateTab(a);
    expect(cursorOf(s(), active())).toMatchObject({ zoom: 150, scrollTop: 230, scrollLeft: 45 });
    s().activateTab(b);
    expect(cursorOf(s(), active())).toMatchObject({ zoom: 75, scrollTop: 20, scrollLeft: 0 });
  });

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

describe('7-1 Projects 정리', () => {
  it('폴더 이동은 내용을 보존하고 존재하지 않는 폴더로는 옮기지 않는다', () => {
    const id = s().createWork()!;
    const folder = s().addFolder('  메모  ')!;
    const before = active();
    s().moveWorkToFolder(id, folder);
    expect(active().folderId).toBe(folder);
    expect(active().items).toBe(before.items);
    const moved = active();
    s().moveWorkToFolder(id, '없는 폴더');
    expect(active()).toBe(moved);
    s().moveWorkToFolder(id, null);
    expect(active().folderId).toBeUndefined();
    expect(active().items).toBe(before.items);
    expect(s().folders[0].name).toBe('메모');
  });

  it('폴더만 지우면 휴지통의 작업도 함께 폴더 밖으로 나오며 선택 필터를 해제한다', () => {
    const a = s().createWork('a')!;
    const b = s().createWork('b')!;
    const folder = s().addFolder('임시')!;
    s().moveWorkToFolder(a, folder);
    s().moveWorkToFolder(b, folder);
    s().trashWorkById(b);
    s().patch({ projectView: { folderId: folder, diaryId: null, query: 'a', sort: 'name' } });
    s().removeFolder(folder);
    expect(s().folders).toHaveLength(0);
    expect(s().works).toHaveLength(2);
    expect(s().works.every((w) => w.folderId === undefined)).toBe(true);
    expect(s().works.find((w) => w.id === b)?.trashedAt).toBeDefined();
    expect(s().projectView).toEqual({ folderId: undefined, diaryId: null, query: 'a', sort: 'name' });
  });

  it('다른 다이어리 복제는 원본·현재 탭을 유지하며 좌표·날짜별 수정·색을 사본에 보존한다', () => {
    const id = s().createWork('10월 기록')!;
    setItems([datedItem()]);
    s().goToFace(0);
    s().select(['t1']);
    s().styleText({ color: '@A', size: 4 });
    s().setPaletteColor('base5', '#222222');
    s().addPaletteColor('#8ea8c6');
    const folder = s().addFolder('기록')!;
    s().moveWorkToFolder(id, folder);
    const source = active();
    const sourceFaces = facesOf(source, s().today);
    const target = s().addDiary('M5', 'M5 수첩');
    const copyId = s().duplicateWork(id, target)!;
    const copy = s().works.find((w) => w.id === copyId)!;
    expect(s().tabs.active).toBe(id);
    expect(s().works.find((w) => w.id === id)).toBe(source);
    expect(copy.diaryId).toBe(target);
    expect(copy.folderId).toBe(folder);
    expect(copy.duplex).toBe(source.duplex);
    expect(copy.palette).toEqual(source.palette);
    expect(copy.palette.base).not.toBe(source.palette.base);
    expect(copy.palette.points[0]).not.toBe(source.palette.points[0]);
    expect(allIdsOf(copy).some((objId) => allIdsOf(source).includes(objId))).toBe(false);
    const copyFaces = facesOf(copy, s().today);
    expect(copyFaces.map((f) => f.period?.dates)).toEqual(sourceFaces.map((f) => f.period?.dates));
    expect(copyFaces[0].objects[0]).toMatchObject({ x: 0, y: 0, width: 10, height: 5, color: '@A', size: 4 });
    expect(copyFaces[1].objects[0]).not.toHaveProperty('size');
    s().openWork(copyId);
    s().goToFace(0);
    s().select([copyFaces[0].objects[0].id]);
    s().styleText({ size: 8 });
    expect(facesOf(source, s().today)[0].objects[0]).toHaveProperty('size', 4);
  });

  it('없는 다이어리로 복제하지 않고, 반복 복제의 이름은 서로 구분된다', () => {
    const id = s().createWork('메모')!;
    expect(s().duplicateWork(id, '없는 다이어리')).toBeNull();
    expect(s().works).toHaveLength(1);
    s().duplicateWork(id);
    s().duplicateWork(id);
    expect(s().works.map((w) => w.name).sort()).toEqual(['메모', '메모 사본', '메모 사본 2']);
    expect(s().addFolder('  ')).toBeNull();
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

describe('달 모양', () => {
  beforeEach(() => {
    s().createWork();
  });
  const objs = () => (active().items[0] as PageItem).face.objects;

  it('놓으면 고른 상태, 다음 날짜로 넘기기를 켜면 순번이 늘어난다', () => {
    s().commitMoon({ x: 0, y: 0, width: 5, height: 5 });
    s().commitMoon({ x: 5, y: 0, width: 5, height: 5 });
    expect(objs().map((o) => (o as { offset: number }).offset)).toEqual([0, 0]);
    s().setFieldNext({ advance: true });
    s().commitMoon({ x: 10, y: 0, width: 5, height: 5 });
    s().commitMoon({ x: 15, y: 0, width: 5, height: 5 });
    expect(objs().map((o) => (o as { offset: number }).offset)).toEqual([0, 0, 0, 1]);
    expect(s().selectedIds).toEqual([objs()[3].id]);
  });

  it('날짜 페이지의 달을 복사해 붙여도 위상(화면용)은 저장되지 않는다', () => {
    const moon = { id: 'mo1', type: 'moon' as const, x: 0, y: 0, width: 5, height: 5, offset: 0 };
    setItems([{ ...datedItem(), faces: [{ id: 'fc1', background: DEFAULT_DOT_GRID, objects: [moon] }] }, ...active().items]);
    useStore.setState({ cursors: {} });
    s().goTo(0, 'front'); // 10/1
    s().select(['mo1']);
    s().copySelected();
    s().goTo(2, 'back'); // 면 3(보통 페이지) = 펼침면 2의 왼쪽
    s().pasteClipboard();
    const page = active().items[1] as PageItem;
    expect(page.face.objects).toHaveLength(1);
    expect(page.face.objects[0]).not.toHaveProperty('phase');
  });

  it('꾸미기 — undefined를 준 키는 지워 기본값으로, 준 키만 바뀐다', () => {
    s().commitMoon({ x: 0, y: 0, width: 5, height: 5 });
    s().styleMoon({ size: 3, strokeWidth: 0.3 });
    s().styleMoon({ color: '@A' });
    expect(objs()[0]).toMatchObject({ size: 3, strokeWidth: 0.3, color: '@A' });
    s().styleMoon({ size: undefined });
    expect(objs()[0]).not.toHaveProperty('size');
  });
});

describe('Print 화면', () => {
  beforeEach(() => {
    s().createWork();
  });

  it('열고 닫는다 — 탭마다 따로', () => {
    s().openPrint();
    expect(s().cursors[active().id].printing).toBe(true);
    s().closePrint();
    expect(s().cursors[active().id].printing).toBe(false);
  });

  it('속지를 누르면 그 페이지의 편집 화면으로 — 펼침면·쪽을 맞춘다', () => {
    s().duplicateItemAt(0, 4); // 면 5개: [null,0] [1,2] [3,4]
    s().openPrint();
    s().goToFace(3);
    expect(s().cursors[active().id]).toMatchObject({ printing: false, spread: 2, side: 'back' });
    s().goToFace(2);
    expect(s().cursors[active().id]).toMatchObject({ spread: 1, side: 'front' });
  });
});

describe('인쇄 설정 저장', () => {
  it('저장할 것만 꺼내고, 불러올 때 아는 키만 받는다', () => {
    useStore.setState({ gap: 3, exportChoice: { grid: false, punch: true } });
    const saved = savedPrintSettingsOf(s());
    expect(saved).toMatchObject({ gap: 3, exportChoice: { grid: false, punch: true } });
    expect(saved).not.toHaveProperty('printRange');
    useStore.setState(initial, true);
    s().hydrate({ works: [], diaries: [], folders: [], print: { ...saved, nope: 1 } as never });
    expect(s().gap).toBe(3);
    expect(s().exportChoice).toEqual({ grid: false, punch: true });
    expect(s()).not.toHaveProperty('nope');
  });
});

describe('저장한 글자 스타일', () => {
  beforeEach(() => {
    s().createWork();
  });
  const texts = () => (active().items[0] as PageItem).face.objects as TextObject[];

  it('저장하면 정렬·회전은 빼고 담는다', () => {
    const id = s().saveTextStyle('제목', { size: 5, bold: true, align: 'center' });
    expect(s().textStyles).toEqual([{ id, name: '제목', style: { size: 5, bold: true } }]);
  });

  it('고른 글자가 있으면 그 글자에 통째로 — 저장에 없는 값은 기본으로 돌아가고 정렬은 남는다', () => {
    s().commitText({ x: 0, y: 0, width: 10, height: 5, text: '가', italic: true, align: 'right' });
    s().select([texts()[0].id]);
    const id = s().saveTextStyle('제목', { size: 5, bold: true });
    s().applyTextStyle(id);
    expect(texts()[0]).toMatchObject({ size: 5, bold: true, align: 'right' });
    expect(texts()[0]).not.toHaveProperty('italic');
    s().undo();
    expect(texts()[0]).toMatchObject({ italic: true });
  });

  it('고른 글자가 없으면 다음에 놓을 글자에 쓰고 글자 도구를 든다', () => {
    const id = s().saveTextStyle('캡션', { size: 2, color: '@A' });
    s().setTextDraftStyle({ align: 'center', bold: true });
    s().applyTextStyle(id);
    expect(s().textDraftStyle).toEqual({ align: 'center', size: 2, color: '@A' });
    expect(s().tool).toBe('text');
  });

  it('지운다', () => {
    const id = s().saveTextStyle('제목', { size: 5 });
    s().removeTextStyle(id);
    expect(s().textStyles).toEqual([]);
  });

  it('불러온 스타일 id보다 카운터를 올린다', () => {
    useStore.setState(initial, true);
    s().hydrate({ works: [], diaries: [], folders: [], textStyles: [{ id: 'ts900', name: 'x', style: {} }] });
    expect(s().saveTextStyle('y', {})).not.toBe('ts900');
    expect(Number(s().textStyles[1].id.replace(/\D/g, ''))).toBeGreaterThan(900);
  });
});

describe('색 규칙', () => {
  beforeEach(() => {
    s().createWork();
  });

  it('규칙을 켜고 끈다', () => {
    s().setColorRule('sunday', '@A');
    expect(active().colorRules).toEqual({ sunday: '@A' });
    s().setColorRule('sunday', undefined);
    expect(active().colorRules).toEqual({});
  });

  it('규칙이 쓰던 포인트를 지우면 규칙도 지금 색으로 고정', () => {
    s().addPaletteColor('#8ea8c6');
    s().setColorRule('holiday', '@A');
    s().removePaletteColor('A', '#8ea8c6');
    expect(active().colorRules).toEqual({ holiday: '#8ea8c6' });
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
