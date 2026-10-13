import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_VIEW, daysLeft, expiredTrash, isTrashed, outsideObjects, projectsFor, removeFolderFrom, restoreWork, trashWork } from './library';
import { newFace, newPage, newWork, type DatedItem } from './work';
import type { DiaryObject } from './objects';

const NOW = '2026-10-11T00:00:00.000Z';
const work = () => newWork({ name: 'w', diaryId: 'd', now: NOW });

describe('휴지통', () => {
  it('넣고 되살리기', () => {
    const t = trashWork(work(), NOW);
    expect(isTrashed(t)).toBe(true);
    expect(isTrashed(restoreWork(t))).toBe(false);
  });

  it('남은 날: 넣은 날은 30일, 3일 뒤 27일', () => {
    const t = trashWork(work(), NOW);
    expect(daysLeft(t, NOW)).toBe(30);
    expect(daysLeft(t, '2026-10-14T00:00:00.000Z')).toBe(27);
    expect(daysLeft(work(), NOW)).toBeNull();
  });

  it('30일이 지나면 지울 대상', () => {
    const t = trashWork(work(), NOW);
    expect(expiredTrash([t], '2026-11-09T23:00:00.000Z')).toEqual([]);
    expect(expiredTrash([t], '2026-11-10T00:00:00.000Z')).toEqual([t.id]);
  });
});

describe('폴더', () => {
  it('폴더를 지우면 작업은 분류 없음으로', () => {
    const a = { ...work(), folderId: 'f1' };
    const b = { ...work(), folderId: 'f2' };
    const out = removeFolderFrom([a, b], 'f1');
    expect(out[0].folderId).toBeUndefined();
    expect(out[1].folderId).toBe('f2');
  });
});

describe('Projects 목록', () => {
  const a = { ...work(), id: 'a', name: '메모 10', diaryId: 'M5', folderId: 'f1', updatedAt: '2026-10-12', createdAt: '2026-10-01' };
  const b = { ...work(), id: 'b', name: '메모 2', diaryId: 'M6', updatedAt: '2026-10-10', createdAt: '2026-10-11' };
  const c = { ...work(), id: 'c', name: 'Daily', diaryId: 'M5', folderId: 'f1', updatedAt: '2026-10-11', createdAt: '2026-10-02' };
  const trashed = { ...a, id: 'trash', trashedAt: NOW };
  const works = [b, trashed, c, a];

  it('모든 작업은 휴지통을 빼고 최근 수정순이며 원본 배열을 바꾸지 않는다', () => {
    expect(projectsFor(works, DEFAULT_PROJECT_VIEW).map((w) => w.id)).toEqual(['a', 'c', 'b']);
    expect(works.map((w) => w.id)).toEqual(['b', 'trash', 'c', 'a']);
  });

  it('폴더·다이어리·검색은 교집합이고 필터에 맞지 않으면 빈 목록', () => {
    expect(projectsFor(works, { ...DEFAULT_PROJECT_VIEW, folderId: 'f1', diaryId: 'M5', query: '메모' }).map((w) => w.id)).toEqual(['a']);
    expect(projectsFor(works, { ...DEFAULT_PROJECT_VIEW, folderId: 'f1', diaryId: 'M6' })).toEqual([]);
    expect(projectsFor(works, { ...DEFAULT_PROJECT_VIEW, folderId: null }).map((w) => w.id)).toEqual(['b']);
  });

  it('이름순은 숫자를 자연스럽게 정렬하고 검색은 대소문자·앞뒤 공백·한글 조합을 구분하지 않는다', () => {
    expect(projectsFor([a, b], { ...DEFAULT_PROJECT_VIEW, sort: 'name' }).map((w) => w.id)).toEqual(['b', 'a']);
    expect(projectsFor(works, { ...DEFAULT_PROJECT_VIEW, query: ' DAILY ' }).map((w) => w.id)).toEqual(['c']);
    expect(projectsFor(works, { ...DEFAULT_PROJECT_VIEW, query: '메모'.normalize('NFD') })).toHaveLength(2);
  });

  it('최근 만든순은 최근 수정순과 독립적이다', () => {
    expect(projectsFor(works, { ...DEFAULT_PROJECT_VIEW, sort: 'created' }).map((w) => w.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('다이어리를 바꾸면 밖으로 나가는 객체', () => {
  const line = (id: string, x2: number): DiaryObject => ({ id, type: 'line', x1: 10, y1: 10, x2, y2: 10 });

  it('원본은 안에 있어도 날짜별 수정으로 나간 요소를 한 번만 센다', () => {
    const face = newFace(); face.objects = [line('a', 70)];
    const dated = { kind: 'dated', id: 'd', faces: [face], overrides: {
      first: { props: { a: { x2: 90 } }, added: [], removed: [] },
      second: { props: { a: { x2: 95 } }, added: [], removed: [] },
    } } as unknown as DatedItem;
    expect(outsideObjects({ items: [dated] }, { width: 80, height: 125 })).toBe(1);
    expect(outsideObjects({ items: [dated] }, { width: 148, height: 210 })).toBe(0);
  });

  it('원본과 날짜별로 더한 객체를 세고, 날짜마다 반복해 세지 않는다', () => {
    const page = newPage();
    page.face.objects = [line('a', 70), line('b', 85)];
    const face = newFace();
    face.objects = [line('c', 85)];
    const dated = {
      kind: 'dated',
      id: 'd',
      faces: [face],
      overrides: { k: { props: {}, added: [line('e', 90)], removed: [] } },
    } as unknown as DatedItem;
    // M5(80mm 폭)로 바꾸면 85·85·90mm까지 가는 선 셋이 걸친다.
    expect(outsideObjects({ items: [page, dated] }, { width: 80, height: 125 })).toBe(3);
    expect(outsideObjects({ items: [page, dated] }, { width: 148, height: 210 })).toBe(0);
  });
});
