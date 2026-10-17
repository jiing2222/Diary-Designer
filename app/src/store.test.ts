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

describe('7-5 페이지 가져오기·여러 페이지 관리', () => {
  it('가져오기는 현재 짝 뒤에 넣고 한 번에 되돌리며 원래 작업과 파일 참조는 유지한다', () => {
    const sourceId = s().createWork('원본')!;
    s().addPagesAtEnd();
    const source = active();
    const page = source.items[0] as PageItem;
    page.face.objects = [{ ...dayField('import-text'), font: 'f99' }];
    const targetId = s().createWork('대상')!;
    const before = active().items;
    expect(s().importPagesFrom(sourceId, [source.items[0].id], { periods: {}, colors: 'original' })).toBe(true);
    const added = active().items;
    expect(added.length).toBe(4);
    expect(targetOf(s())?.kind).toBe('face');
    const at = targetOf(s());
    expect(at?.kind === 'face' && at.face.itemId).toBe(added[2].id);
    expect((added[2] as PageItem).face.objects[0]).toMatchObject({ font: 'f99' });
    expect(s().works.find((w) => w.id === sourceId)).toBe(source);
    s().undo(); expect(active().id).toBe(targetId); expect(active().items).toBe(before);
    s().redo(); expect(active().items).toBe(added);
  });
  it('복제·이동·삭제는 앞뒤 짝을 함께 처리하며 각각 한 번에 되돌린다', () => {
    // 면 1 → 2 → 3 → 5(맨 아래 줄이 차게).
    s().createWork(); s().addPagesAtEnd(); s().addPagesAtEnd(); s().addPagesAtEnd();
    const original = active().items;
    expect(original).toHaveLength(5);
    s().duplicateSelectedPages([original[0].id], 2);
    expect(active().items.length).toBe(9);
    s().undo(); expect(active().items).toBe(original);
    s().moveSelectedPages([original[0].id], original[4].id);
    expect(active().items.map((i) => i.id)).toEqual([original[2].id, original[3].id, original[0].id, original[1].id, original[4].id]);
    s().undo(); expect(active().items).toBe(original);
    s().removeSelectedPages([original[0].id]); expect(active().items).toEqual(original.slice(2));
    s().undo(); expect(active().items).toBe(original);
  });
  it('날짜 묶음은 기간 확인 없이 가져오지 않으며 실패 시 이력도 쌓지 않는다', () => {
    const sourceId = s().createWork('날짜 원본')!; setItems([datedItem()]);
    s().createWork('대상');
    const before = active().items;
    const history = s().histories[active().id];
    expect(s().importPagesFrom(sourceId, ['dt1'], { periods: {}, colors: 'original' })).toBe(false);
    expect(active().items).toBe(before); expect(s().histories[active().id]).toBe(history);
  });
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
    expect(s().works.map((w) => w.name).sort()).toEqual(['메모', '메모 copy', '메모 copy 2']);
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

  it('+ 페이지 추가는 맨 뒤에 — 양면이면 맨 아래 줄이 두 면으로 차게(1→2→3→5), 새 페이지로 간다', () => {
    s().addPagesAtEnd();
    expect(active().items).toHaveLength(2);
    // 2쪽뿐이면 한 줄 (p.2 | p.1) — 새 면 1은 펼침면 0의 왼쪽
    expect(s().cursors[active().id]).toMatchObject({ spread: 0, side: 'back' });
    s().addPagesAtEnd();
    expect(active().items).toHaveLength(3);
    // 3쪽부터는 (·|0) (1|2) — 새 면 2는 펼침면 1의 오른쪽
    expect(s().cursors[active().id]).toMatchObject({ spread: 1, side: 'front' });
    s().addPagesAtEnd();
    expect(active().items).toHaveLength(5);
    // (·|0) (1|2) (3|4) — 새 첫 면 3은 펼침면 2의 왼쪽
    expect(s().cursors[active().id]).toMatchObject({ spread: 2, side: 'back' });
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

  it('새로 그은 선은 고른 상태가 된다 — 그리기 도구 그대로 끌어 옮길 수 있게', () => {
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 5 }]);
    const line = (active().items[0] as PageItem).face.objects[0];
    expect(s().selectedIds).toEqual([line.id]);
    // 같은 선을 다시 그으면 지워지고, 고른 것에서도 빠진다.
    s().drawLines([{ x1: 0, y1: 0, x2: 10, y2: 5 }]);
    expect(s().selectedIds).toEqual([]);
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

describe('손그림 선 (9-3)', () => {
  it('그리기 모양이 손그림이어도 도형 테두리는 실선으로 남긴다', () => {
    s().createWork();
    s().setDrawStyle({ dash: 'sketch' });
    s().commitShape({ x: 0, y: 0, width: 10, height: 10 });
    const shape = (active().items[0] as PageItem).face.objects[0] as { dash?: string };
    expect(shape.dash).toBeUndefined();
  });
});

describe('도트 판 (9-4)', () => {
  beforeEach(() => {
    s().createWork();
  });
  const objs = () => (active().items[0] as PageItem).face.objects;
  const board = () => objs()[0] as { cols: number; rows: number; size?: number; sizes?: Record<string, number> };

  it('놓으면 고른 상태, 행·열·지름을 바꾸고 기본값이면 키를 지운다', () => {
    s().commitDots({ x: 0, y: 0, width: 15, height: 10 }, 3, 2);
    expect(s().selectedIds).toEqual([objs()[0].id]);
    s().styleDots({ cols: 4.4, size: 1 });
    expect(board()).toMatchObject({ cols: 4, rows: 2, size: 1 });
    s().styleDots({ size: undefined });
    expect(board().size).toBeUndefined();
  });

  it('도트를 골라 지름을 바꾸고(0은 없음), 판을 놓으면 고른 도트도 풀린다', () => {
    s().commitDots({ x: 0, y: 0, width: 15, height: 10 }, 3, 2);
    const id = objs()[0].id;
    s().pickDot(id, '0,1', false);
    s().pickDot(id, '1,2', true);
    s().setPickedDotSize(0);
    expect(board().sizes).toEqual({ '0,1': 0, '1,2': 0 });
    s().pickDot(id, '1,2', true); // Shift로 다시 누르면 뺀다
    expect(s().pickedDots).toEqual({ id, keys: ['0,1'] });
    s().setPickedDotSize(undefined);
    expect(board().sizes).toEqual({ '1,2': 0 });
    s().select([]);
    expect(s().pickedDots).toBeNull();
  });

  it('행·열을 줄이면 판 밖이 된 도트의 지름 기록도 지운다', () => {
    s().commitDots({ x: 0, y: 0, width: 15, height: 10 }, 3, 2);
    const id = objs()[0].id;
    s().pickDot(id, '1,2', false);
    s().setPickedDotSize(2);
    s().styleDots({ cols: 2 });
    expect(board().sizes).toBeUndefined();
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

describe('첫 다이어리 온보딩 (7-2)', () => {
  it('다이어리가 없으면 새 작업 대신 온보딩을 띄운다', () => {
    expect(s().startNewWork()).toBeNull();
    expect(s().onboarding).toBe(true);
    expect(s().works).toEqual([]);
  });

  it('등록하고 시작하면 그 다이어리가 기본이 되고 새 작업이 열린다', () => {
    s().startNewWork();
    const id = s().finishOnboarding({ presetId: 'A5', name: '검정 바인더', size: { width: 150, height: 210 } });
    expect(s().onboarding).toBe(false);
    expect(s().diaries).toHaveLength(1);
    expect(s().defaultDiaryId).toBe(s().diaries[0].id);
    expect(active().id).toBe(id);
    expect(active().diaryId).toBe(s().diaries[0].id);
    expect(s().diaries[0]).toMatchObject({ name: '검정 바인더', width: 150, presetId: 'A5' });
  });

  it('닫으면 아무것도 만들지 않는다, 다이어리가 있으면 바로 새 작업', () => {
    s().startNewWork();
    expect(s().finishOnboarding(null)).toBeNull();
    expect(s().diaries).toEqual([]);
    s().addDiary('M6', 'm6');
    expect(s().startNewWork()).not.toBeNull();
    expect(s().onboarding).toBe(false);
  });
});

describe('다이어리 관리 (7-2)', () => {
  it('실측이 다르면 그 크기로 등록하고, 크기를 고치면 기준 규격을 다시 붙인다', () => {
    const id = s().addDiary('M6', '검정 바인더', { width: 79, height: 127 });
    expect(s().diaries.find((d) => d.id === id)).toMatchObject({ width: 79, height: 127, presetId: 'M6' });
    s().patchDiary(id, { width: 148, height: 210 });
    expect(s().diaries.find((d) => d.id === id)?.presetId).toBe('A5');
  });

  it('구멍 설정은 그 다이어리만', () => {
    const a = s().addDiary('M6', 'a');
    const b = s().addDiary('M6', 'b');
    s().patchDiaryPunch(a, { markSize: 5 });
    expect(s().diaries.find((d) => d.id === a)?.punch.markSize).toBe(5);
    expect(s().diaries.find((d) => d.id === b)?.punch.markSize).toBe(4);
  });

  it('쓰는 작업이 있으면(휴지통 포함) 지우지 않고, 없으면 지운다 — 기본이었으면 남은 첫 다이어리가 기본', () => {
    const a = s().addDiary('M6', 'a');
    const b = s().addDiary('A5', 'b');
    s().setDefaultDiary(a);
    const w = s().createWork()!;
    expect(active().diaryId).toBe(a);
    s().trashWorkById(w);
    expect(s().removeDiary(a)).toBe(false);
    s().deleteWorkForever(w);
    expect(s().removeDiary(a)).toBe(true);
    expect(s().defaultDiaryId).toBe(b);
  });
});

describe('작업의 다이어리 바꾸기 (7-2 칩)', () => {
  it('등록한 다이어리로만 바꾸고, 사본 없이 이 작업만', () => {
    const a = s().addDiary('M6', 'a');
    const b = s().addDiary('A5', 'b');
    s().setDefaultDiary(a);
    const w = s().createWork()!;
    s().setWorkDiary(w, 'nope');
    expect(active().diaryId).toBe(a);
    s().setWorkDiary(w, b);
    expect(active().diaryId).toBe(b);
    expect(s().works).toHaveLength(1);
  });
});

describe('Library 이미지·글꼴 지우기 (7-3)', () => {
  const img = (id: string) => ({ id, name: id, url: 'data:', usedAt: 1 });
  const font = (id: string) => ({ id, name: id, family: `user-font-${id}` });

  beforeEach(() => {
    s().addDiary('M6', 'm6');
    s().createWork();
    s().addUserImage(img('img1'));
    s().addUserImage(img('img2'));
    s().addUserFont(font('f1'));
    s().addUserFont(font('f2'));
    s().commitImage({ x: 0, y: 0, width: 10, height: 10 });
    s().styleImage('img1');
  });

  it('올린 것은 저절로 지워지지 않는다(예전 최근 10개 제한 없음)', () => {
    for (let i = 3; i <= 15; i++) s().addUserImage(img(`img${i}`));
    expect(s().userImages).toHaveLength(15);
  });

  it('되돌리기·복사 기록이 쓰는 이미지도 남겨 두어 다시 복원할 수 있다', () => {
    s().copySelected();
    s().deleteSelected();
    expect(s().removeUserImage('img1')).toBe('hidden');
    s().purgeUnusedAssets();
    expect(s().userImages.find((i) => i.id === 'img1')?.hidden).toBe(true);
    s().undo();
    expect((active().items[0] as PageItem).face.objects[0]).toHaveProperty('imageId', 'img1');
  });

  it('쓰는 중이면 목록에서만 빼고, 안 쓰면 지운다', () => {
    expect(s().removeUserImage('img1')).toBe('hidden');
    expect(s().userImages.find((i) => i.id === 'img1')?.hidden).toBe(true);
    expect(s().removeUserImage('img2')).toBe('deleted');
    expect(s().userImages.some((i) => i.id === 'img2')).toBe(false);
    expect(s().removeUserImage('nope')).toBeNull();
  });

  it('글꼴은 저장한 글자 스타일이 써도 쓰는 것으로 친다', () => {
    s().patch({ textStyles: [{ id: 'ts1', name: '제목', style: { font: 'f1' } }] });
    expect(s().removeUserFont('f1')).toBe('hidden');
    expect(s().removeUserFont('f2')).toBe('deleted');
  });

  it('뺀 것을 쓰던 작업을 영구 삭제하면 파일도 지운다', () => {
    const id = active().id;
    s().removeUserImage('img1');
    s().trashWorkById(id);
    s().purgeUnusedAssets();
    expect(s().userImages.some((i) => i.id === 'img1')).toBe(true); // 휴지통도 쓰는 것
    s().deleteWorkForever(id);
    expect(s().userImages.some((i) => i.id === 'img1')).toBe(false);
  });

  it('즐겨찾기를 켜고 끈다', () => {
    s().toggleFontFavorite('f2');
    expect(s().userFonts.find((f) => f.id === 'f2')?.favorite).toBe(true);
    s().toggleFontFavorite('f2');
    expect(s().userFonts.find((f) => f.id === 'f2')?.favorite).toBe(false);
  });
});

describe('저장한 팔레트 (7-4)', () => {
  beforeEach(() => {
    s().addDiary('M6', 'm6');
    s().createWork();
  });

  it('보관은 복사 — 작업 색을 바꿔도 보관한 것은 그대로', () => {
    s().addPaletteColor('#aaaaaa');
    const id = s().savePalette('봄')!;
    s().setPaletteColor('A', '#000000');
    expect(s().savedPalettes.find((p) => p.id === id)?.palette.points).toEqual([{ key: 'A', color: '#aaaaaa' }]);
  });

  it('불러오기는 같은 칸만 덮어쓰고, 보관한 것을 나중에 고쳐도 작업은 그대로', () => {
    s().addPaletteColor('#aaaaaa'); // A
    s().addPaletteColor('#cccccc'); // B
    const id = s().createPalette('가을'); // 기본 5칸 + A(#8ea8c6)
    s().loadPalette(id);
    expect(active().palette.points).toEqual([
      { key: 'A', color: '#8ea8c6' },
      { key: 'B', color: '#cccccc' },
    ]);
    const saved = s().savedPalettes.find((p) => p.id === id)!;
    s().patchSavedPalette(id, { palette: { ...saved.palette, points: [{ key: 'A', color: '#123456' }] } });
    expect(active().palette.points[0].color).toBe('#8ea8c6');
  });

  it('이름은 비우면 안 바뀌고, 지우면 목록에서 빠진다', () => {
    const id = s().createPalette('겨울');
    s().patchSavedPalette(id, { name: '  ' });
    expect(s().savedPalettes[0].name).toBe('겨울');
    s().removeSavedPalette(id);
    expect(s().savedPalettes).toEqual([]);
  });
});

describe('계정에서 받은 것 적용하기 (8-2)', () => {
  it('파일 id를 바꾸면 되돌리기 기록과 복사한 객체도 같은 파일을 가리킨다', () => {
    s().addDiary('M6', 'm6'); s().createWork('보존');
    const items = active().items;
    const page = items[0] as PageItem;
    const text = { ...dayField('t-original'), font: 'f1' };
    const before = [{ ...page, face: { ...page.face, objects: [text] } }];
    const after = [{ ...page, face: { ...page.face, objects: [{ ...text, text: '고침' }] } }];
    useStore.setState({
      works: [{ ...active(), items: after }],
      histories: { [active().id]: { past: [before], present: after, future: [] } },
      clipboard: [text],
    });
    s().applySyncOps([{ type: 'rekey', kind: 'font', from: 'f1', to: 'f1~local', conflict: false }]);
    s().undo();
    expect((active().items[0] as PageItem).face.objects[0]).toMatchObject({ font: 'f1~local' });
    s().redo();
    expect((active().items[0] as PageItem).face.objects[0]).toMatchObject({ font: 'f1~local' });
    expect(s().clipboard[0]).toMatchObject({ font: 'f1~local' });
  });

  it('새 id를 받은 작업은 탭·편집 위치가 따라가고, 같은 자리에 받은 작업이 들어온다', () => {
    s().addDiary('M6', 'm6');
    const id = s().createWork()!;
    const remote = { ...active(), name: '다른 기기' };
    s().applySyncOps([
      { type: 'rekey', kind: 'work', from: id, to: `${id}~x`, conflict: true },
      { type: 'put', kind: 'work', key: id, data: remote },
    ]);
    expect(s().tabs.active).toBe(`${id}~x`);
    expect(s().works.map((w) => w.name)).toEqual([expect.stringContaining('(copy from this device)'), '다른 기기']);
    expect(s().cursors[id]).toBeUndefined();
  });

  it('다른 기기에서 지운 작업은 탭이 닫히고, 기본 다이어리가 없어지면 남은 첫 다이어리로', () => {
    const d = s().addDiary('M6', 'm6');
    const d2 = s().addDiary('A5', 'a5');
    s().setDefaultDiary(d);
    const id = s().createWork()!;
    s().applySyncOps([
      { type: 'remove', kind: 'work', key: id },
      { type: 'remove', kind: 'diary', key: d },
    ]);
    expect(s().tabs.open).toEqual([]);
    expect(s().defaultDiaryId).toBe(d2);
  });

  it('새 id를 받은 글꼴은 화면용 이름도 새 id로, 그 자리에 받은 글꼴은 이 기기 것을 물려받지 않는다', () => {
    s().addUserFont({ id: 'f1', name: 'Mine', family: 'user-font-f1' });
    s().applySyncOps([
      { type: 'rekey', kind: 'font', from: 'f1', to: 'f1~x', conflict: false },
      { type: 'put', kind: 'font', key: 'f1', data: { id: 'f1', name: 'Theirs' } },
    ]);
    expect(s().userFonts).toEqual([
      { id: 'f1~x', name: 'Mine', family: 'user-font-f1~x' },
      { id: 'f1', name: 'Theirs', family: 'user-font-f1' },
    ]);
  });
});

describe('2026-10-13 수정사항', () => {
  it('같은 이름의 다이어리를 또 만들면 (1), (2)…를 붙이고, 이름을 바꿔도 겹치지 않는다', () => {
    const a = s().addDiary('M6', 'Pocket (M6)');
    s().addDiary('M6', 'Pocket (M6)');
    const c = s().addDiary('M6', 'Pocket (M6)');
    expect(s().diaries.map((d) => d.name)).toEqual(['Pocket (M6)', 'Pocket (M6) (1)', 'Pocket (M6) (2)']);
    s().patchDiary(c, { name: 'Pocket (M6)' });
    expect(s().diaries.find((d) => d.id === c)?.name).toBe('Pocket (M6) (2)');
    s().patchDiary(a, { name: 'Pocket (M6)' });
    expect(s().diaries.find((d) => d.id === a)?.name).toBe('Pocket (M6)');
  });

  it('폴더를 지워도 작업의 ‘수정한 때’는 그대로', () => {
    s().addDiary('M6', 'm6');
    const id = s().createWork()!;
    const folder = s().addFolder('f')!;
    s().moveWorkToFolder(id, folder);
    const before = s().works[0].updatedAt;
    s().removeFolder(folder);
    expect(s().works[0].folderId).toBeUndefined();
    expect(s().works[0].updatedAt).toBe(before);
  });

  it('양면에서 오른쪽 면을 지우면 남은 왼쪽 면을 고친다', () => {
    s().addDiary('M6', 'm6');
    s().createWork();
    s().setDuplex(true);
    s().addPagesAtEnd();
    s().addPagesAtEnd();
    s().addPagesAtEnd(); // 면 5개
    s().removeItemAt(4); // 면 4개: (·|0) (1|2) (3|·) — 마지막 면 3이 왼쪽에 홀로
    s().goTo(2, 'front');
    const t = targetOf(s());
    expect(t?.kind === 'face' && t.face.itemId).toBe(active().items[3].id);
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

describe('새 달력의 언어', () => {
  beforeEach(() => {
    s().createWork();
  });
  const cals = () => (active().items[0] as PageItem).face.objects.filter((o) => o.type === 'calendar');

  it('로그인 안 한(일반) 사용자는 영어 — 제목도 영어로 나온다', () => {
    s().commitCalendar({ x: 0, y: 0, width: 60, height: 50 });
    expect(cals()[0]).toMatchObject({ weekdayLang: 'en' });
  });

  it('달력 도구에서 고른 언어가 있으면 그것을 따른다', () => {
    s().setCalendarDraftStyle({ weekdayLang: 'hanja' });
    s().commitCalendar({ x: 0, y: 0, width: 60, height: 50 });
    expect(cals()[0]).toMatchObject({ weekdayLang: 'hanja' });
  });
});
