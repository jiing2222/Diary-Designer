import { describe, expect, it } from 'vitest';
import { commit } from './history';
import {
  newNotebookHalf,
  notebookImposition,
  notebookInsertSize,
  notebookPageWidth,
  paddedPageCount,
  resizePages,
} from './notebook';

describe('노트 양식 크기', () => {
  it('가로는 완성 페이지의 두 배, 세로는 그대로다', () => {
    expect(notebookInsertSize(70, 105)).toEqual({ width: 140, height: 105 });
  });

  it('양식 가로에서 완성 페이지 가로를 거꾸로 낸다', () => {
    expect(notebookPageWidth(140)).toBe(70);
  });
});

describe('노트 반쪽 하나', () => {
  it('그린 것은 비어 있고 격자는 기본값이다', () => {
    const half = newNotebookHalf();
    expect(half.objects.present).toEqual([]);
    expect(half.dotGrid.spacing).toBe(5);
  });
});

describe('4의 배수로 맞추기', () => {
  it('이미 4의 배수면 그대로다', () => {
    expect(paddedPageCount(8)).toBe(8);
  });

  it('아니면 다음 4의 배수로 올린다', () => {
    expect(paddedPageCount(22)).toBe(24);
    expect(paddedPageCount(1)).toBe(4);
  });

  it('0이어도 최소 4쪽(한 장)이다', () => {
    expect(paddedPageCount(0)).toBe(4);
  });
});

describe('쪽수 바꾸기', () => {
  it('늘어난 자리는 빈 반쪽으로 채운다', () => {
    const pages = resizePages([newNotebookHalf(), newNotebookHalf()], 8);
    expect(pages).toHaveLength(8);
    expect(pages.every((p) => p.objects.present.length === 0)).toBe(true);
  });

  it('줄어들면 뒤쪽부터 잘라내고, 남은 쪽은 그대로 물려받는다', () => {
    const first = newNotebookHalf();
    first.objects = commit(first.objects, [{ id: 'l1', type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }]);
    const pages = resizePages([first, newNotebookHalf(), newNotebookHalf(), newNotebookHalf()], 1);
    expect(pages).toHaveLength(4); // 1은 4로 맞춰진다
    expect(pages[0]).toBe(first);
  });

  it('4의 배수로 이미 맞으면 배열을 그대로 둔다', () => {
    const pages = [newNotebookHalf(), newNotebookHalf(), newNotebookHalf(), newNotebookHalf()];
    expect(resizePages(pages, 4)).toBe(pages);
  });
});

describe('새들스티치 인쇄 배치', () => {
  it('4쪽(장 1개) — 앞면이 [4쪽|1쪽], 뒷면이 [2쪽|3쪽]', () => {
    // 0부터 세므로 1쪽=0, 2쪽=1, 3쪽=2, 4쪽=3.
    expect(notebookImposition(4)).toEqual([{ sheet: 0, frontLeft: 3, frontRight: 0, backLeft: 1, backRight: 2 }]);
  });

  it('8쪽(장 2개) — 바깥 장이 처음·끝 쪽, 안쪽 장이 가운데 쪽을 담는다', () => {
    expect(notebookImposition(8)).toEqual([
      { sheet: 0, frontLeft: 7, frontRight: 0, backLeft: 1, backRight: 6 },
      { sheet: 1, frontLeft: 5, frontRight: 2, backLeft: 3, backRight: 4 },
    ]);
  });

  it('접어서 편 순서로 늘어놓으면 0쪽부터 마지막 쪽까지 한 번씩, 순서대로 나온다', () => {
    // 실제로 책을 펴서 읽는 순서 — 바깥 장부터 안쪽 장까지 각 장의
    // (frontRight, backLeft)를 먼저 순서대로, 그다음 안쪽 장부터 바깥
    // 장까지 거꾸로 각 장의 (backRight, frontLeft)를 이어붙인 것과 같다.
    const sheets = notebookImposition(8);
    const reading = [
      ...sheets.flatMap((s) => [s.frontRight, s.backLeft]),
      ...[...sheets].reverse().flatMap((s) => [s.backRight, s.frontLeft]),
    ];
    expect(reading).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('모든 쪽 번호가 한 번씩만 나온다', () => {
    const sheets = notebookImposition(12);
    const all = sheets.flatMap((s) => [s.frontLeft, s.frontRight, s.backLeft, s.backRight]);
    expect(new Set(all).size).toBe(12);
    expect(Math.min(...all)).toBe(0);
    expect(Math.max(...all)).toBe(11);
  });
});
