import { describe, expect, it } from 'vitest';
import { duplicatePages, duplicatePageCount, importAfterIndex, importPages, movePages, pageUnits, pairedItemIds, validImportPeriod } from './pages';
import { allIdsOf, expandWork, newPage, newWork, spreadByDates, type DatedItem, type PageItem, type Work } from './work';
import { emptyOverride } from './dated';
import type { DateDataset } from './dataset';
import type { TextObject } from './objects';

const today = { year: 2026, month: 10, day: 12 };
const period: DateDataset = { kind: 'date', start: '2026-11-01', end: '2026-11-03', step: 'day', perPage: 1 };
function work(pages = 4, duplex = true): Work {
  return { ...newWork({ name: '검증', diaryId: 'd1', now: '2026-10-12', duplex }), items: Array.from({ length: pages }, () => newPage()) };
}
function dated(): DatedItem {
  const page = newPage();
  page.face.objects = [{ id: 't99', type: 'text', x: 1, y: 2, width: 20, height: 5, text: '', color: '@A', groupId: 'g99', font: 'f99', field: { offset: 0, format: 'M/D' } }];
  const item = spreadByDates(page, { ...period, start: '2026-10-01', end: '2026-10-03' }, 'continue');
  item.overrides = { '2026-10-02/0': { ...emptyOverride(), props: { t99: { text: '이전 날짜 수정' } } } };
  return item;
}

describe('앞뒤 짝과 여러 페이지 관리', () => {
  it('양면은 앞뒤 단위, 단면은 한 면씩이며 날짜 묶음은 쪼개지 않는다', () => {
    const w = work();
    expect(pageUnits(w).map((u) => u.count)).toEqual([2, 2]);
    expect(pageUnits({ ...w, duplex: false }).map((u) => u.count)).toEqual([1, 1, 1, 1]);
    expect(pageUnits({ ...w, items: [dated()] })[0]).toMatchObject({ count: 3, dated: true });
  });
  it('역순으로 골라도 원래 순서이며 같은 짝을 중복 선택하지 않는다', () => {
    const w = work();
    expect(pairedItemIds(w, [w.items[3].id, w.items[0].id, w.items[0].id])).toEqual(w.items.map((i) => i.id));
    expect(importAfterIndex(w, w.items[0].id)).toBe(1);
  });
  it('날짜 묶음이 종이 경계를 넘으면 이웃의 실제 짝까지 포함한다', () => {
    const w = work();
    const d = dated();
    const items = [w.items[0], d, w.items[1], w.items[2]];
    expect(pairedItemIds({ ...w, items }, [d.id])).toEqual([items[0].id, d.id]);
  });
  it('여러 페이지를 골라 마지막 선택 뒤에 같은 순서의 독립된 사본을 더한다', () => {
    const w = work(3, false);
    const d = dated(); w.items[0] = d;
    const items = duplicatePages(w.items, [w.items[2].id, d.id], 2);
    expect(items.slice(0, 3)).toEqual(w.items);
    expect(items.map((i) => i.kind)).toEqual(['dated', 'page', 'page', 'dated', 'page', 'dated', 'page']);
    const copies = items.filter((i) => i.kind === 'dated') as DatedItem[];
    const a = copies[1].faces[0].objects[0];
    expect(a).toMatchObject({ font: 'f99', x: 1, y: 2 });
    expect(a.groupId).not.toBe('g99');
    expect(a.groupId).not.toBe(copies[2].faces[0].objects[0].groupId);
    expect(copies[1].overrides['2026-10-02/0'].props[a.id]).toEqual({ text: '이전 날짜 수정' });
    copies[1].dataset = { ...period }; (copies[1].faces[0].objects[0] as TextObject).x = 88;
    expect(d.faces[0].objects[0]).toMatchObject({ x: 1 });
    expect(d.dataset).toMatchObject({ start: '2026-10-01' });
    expect(new Set(allIdsOf({ ...w, items }).filter((id) => !id.startsWith('g'))).size).toBe(allIdsOf({ ...w, items }).filter((id) => !id.startsWith('g')).length);
  });
  it('잘못된 복제 수와 한도 초과는 원본 그대로 반환한다', () => {
    const w = work();
    for (const count of [0, -1, NaN, Infinity, 1.5, 401]) expect(duplicatePages(w.items, [w.items[0].id], count)).toBe(w.items);
  });
  it('양면의 마지막 앞면을 복제하면 원본과 사본의 빈 뒷면도 함께 만든다', () => {
    const w = work(1);
    expect(duplicatePageCount(w, [w.items[0].id], 2)).toBe(5);
    const items = duplicatePages(w.items, [w.items[0].id], 2, true);
    expect(items).toHaveLength(6);
    for (const index of [1, 3, 5]) expect((items[index] as PageItem).face.background.print).toBe(false);
  });
  it('앞뒤 짝을 홀수 마지막 면 뒤로 옮기거나 마지막 앞면을 앞으로 옮겨도 짝을 유지한다', () => {
    const w = work(3);
    const moved = movePages(w.items, [w.items[0].id, w.items[1].id], null, true);
    expect(moved.map((i) => i.id)).toEqual([w.items[2].id, expect.any(String), w.items[0].id, w.items[1].id]);
    const front = movePages(w.items, [w.items[2].id], w.items[0].id, true);
    expect(front.map((i) => i.id)).toEqual([w.items[2].id, expect.any(String), w.items[0].id, w.items[1].id]);
  });
  it('선택 순서와 무관하게 한 블록으로 이동하며 잘못된 위치는 거부한다', () => {
    const w = work(); const [a, b, c, d] = w.items;
    expect(movePages(w.items, [d.id, b.id], a.id)).toEqual([b, d, a, c]);
    expect(movePages(w.items, [a.id, b.id], null)).toEqual([c, d, a, b]);
    expect(movePages(w.items, [a.id], a.id)).toBe(w.items);
    expect(movePages(w.items, [a.id], '없음')).toBe(w.items);
  });
});

describe('다른 작업에서 페이지 가져오기', () => {
  it('보통 페이지도 원래 날짜 색 규칙을 복사하고 다시 복제해도 유지한다', () => {
    const source = work(1, false); const target = work(0, false);
    source.palette.points = [{ key: 'A', color: '#00ff00' }];
    source.colorRules = { sunday: '@A' }; target.colorRules = { sunday: '#ff0000' };
    const page = source.items[0] as PageItem;
    page.face.objects = [{ id: 't99', type: 'text', x: 1, y: 2, width: 20, height: 5, text: '', field: { offset: 0, format: 'M/D' } }];
    const result = importPages(target, source, [page.id], -1, { periods: {}, colors: 'original' })!;
    expect(result.items[0].colorRules).toEqual({ sunday: '#00ff00' });
    const copied = duplicatePages(result.items, [result.firstId], 1);
    expect(copied[1].colorRules).toEqual({ sunday: '#00ff00' });
    expect(expandWork({ ...target, items: copied }, { year: 2026, month: 11, day: 1 }).map((f) => f.objects[0])).toMatchObject([{ color: '#00ff00' }, { color: '#00ff00' }]);
  });
  it('앞뒤를 함께 복사하고 원본·대상 팔레트·파일 참조·좌표를 보존한다', () => {
    const source = work(); const target = work();
    const front = source.items[0] as PageItem;
    front.face.objects.push({ id: 'im99', type: 'image', x: 100, y: 200, width: 10, height: 10, imageId: 'img99' });
    const old = structuredClone(source);
    const result = importPages(target, source, [source.items[1].id], 1, { periods: {}, colors: 'original' })!;
    expect(result.addedFaces).toBe(2);
    expect(result.items.slice(0, 2)).toEqual(target.items.slice(0, 2));
    expect((result.items[2] as PageItem).face.objects[0]).toMatchObject({ x: 100, y: 200, imageId: 'img99' });
    expect(source).toEqual(old);
    expect(result.items[2].id).not.toBe(source.items[0].id);
    expect(target.palette.points).toEqual([]);
  });
  it('단면 하나를 양면 뒤에 가져오면 필요한 빈 뒷면으로 앞뒤를 맞춘다', () => {
    const target = work(1); const source = work(1, false);
    const result = importPages(target, source, [source.items[0].id], 0, { periods: {}, colors: 'original' })!;
    expect(result.items).toHaveLength(4);
    expect(result.items[2].id).toBe(result.firstId);
    expect((result.items[1] as PageItem).face.background.print).toBe(false);
    expect((result.items[3] as PageItem).face.background.print).toBe(false);
  });
  it('날짜 규칙은 유지하고 새 기간을 받으며 이전 날짜별 수정은 가져오지 않는다', () => {
    const source = { ...work(0, false), items: [dated()], palette: { ...work().palette, points: [{ key: 'A', color: '#abcdef' }] }, colorRules: { sunday: '@A' } };
    const target = { ...work(0, false), colorRules: { sunday: '#ff0000' } };
    const result = importPages(target, source, [source.items[0].id], -1, { periods: { [source.items[0].id]: period }, colors: 'original' })!;
    const item = result.items[0] as DatedItem;
    expect(item.dataset).toEqual(period); expect(item.overrides).toEqual({});
    expect(item.colorRules).toEqual({ sunday: '#abcdef' });
    const expanded = expandWork({ ...target, items: result.items }, today);
    expect(expanded[0].objects[0]).toMatchObject({ text: '11/1', color: '#abcdef', font: 'f99' });
    expect(expanded[0].colorRules).toEqual({ sunday: '#abcdef' });
    expect(source.items[0].overrides['2026-10-02/0']).toBeDefined();
  });
  it('현재 팔레트를 택하면 이름표를 유지하고 대상의 날짜 색 규칙을 따른다', () => {
    const d = dated(); const source = { ...work(0, false), items: [d] };
    const target = { ...work(0, false), colorRules: { sunday: '#ff0000' } };
    const result = importPages(target, source, [d.id], -1, { periods: { [d.id]: period }, colors: 'current' })!;
    expect((result.items[0] as DatedItem).faces[0].objects[0]).toMatchObject({ color: '@A' });
    expect(result.items[0].colorRules).toBeUndefined();
    expect(expandWork({ ...target, items: result.items }, today)[0].objects[0]).toMatchObject({ color: '#ff0000' });
  });
  it('현재 팔레트를 택해도 이 작업에 없는 이름표는 원래 색으로 고정한다(검정이 되지 않게)', () => {
    const page = newPage();
    page.face.objects = [{ id: 't1', type: 'text', x: 0, y: 0, width: 10, height: 5, text: 'a', color: '@C' } as TextObject];
    const source = { ...work(0, false), items: [page], palette: { ...work(0).palette, points: [{ key: 'C', color: '#123456' }] } };
    const target = work(0, false);
    const result = importPages(target, source, [page.id], -1, { periods: {}, colors: 'current' })!;
    expect((result.items[0] as PageItem).face.objects[0]).toMatchObject({ color: '#123456' });
  });
  it('기간 누락·없는 날짜·규칙 변경·너무 긴 기간과 자기 자신/휴지통 가져오기를 거부한다', () => {
    const d = dated(); const source = { ...work(0, false), items: [d] }; const target = work();
    for (const p of [undefined, { ...period, start: '2026-02-30' }, { ...period, start: '2026-12-01' }, { ...period, perPage: 7 }, { ...period, end: '9999-12-31' }]) expect(validImportPeriod(d, p)).toBe(false);
    expect(importPages(target, source, [d.id], 1, { periods: {}, colors: 'original' })).toBeNull();
    expect(importPages(source, source, [d.id], -1, { periods: { [d.id]: period }, colors: 'original' })).toBeNull();
    expect(importPages(target, { ...source, trashedAt: '2026-10-12' }, [d.id], 1, { periods: { [d.id]: period }, colors: 'original' })).toBeNull();
  });
});
