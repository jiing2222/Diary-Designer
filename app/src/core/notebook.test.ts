import { describe, expect, it } from 'vitest';
import { commit } from './history';
import type { DiaryObject } from './objects';
import {
  allNotebookObjects,
  composeSpread,
  newNotebookHalf,
  notebookImposition,
  notebookInsertSize,
  notebookPageWidth,
  notebookPrintUnit,
  notebookPrintUnitCount,
  paddedPageCount,
  resizePages,
  type NotebookCover,
  type NotebookHalf,
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

describe('왼쪽·오른쪽 반쪽을 인쇄될 한 장으로 합치기', () => {
  const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 };

  it('왼쪽은 그대로, 오른쪽은 페이지 폭만큼 밀린다', () => {
    const left = newNotebookHalf();
    left.objects = commit(left.objects, [line]);
    const right = newNotebookHalf();
    right.objects = commit(right.objects, [{ ...line, id: 'l2', x1: 1, x2: 6 }]);

    const spread = composeSpread(left, right, 70);
    expect(spread.objects).toEqual([line, { ...line, id: 'l2', x1: 71, x2: 76 }]);
  });

  it('격자는 왼쪽 반쪽 것만 쓴다', () => {
    const left = newNotebookHalf();
    left.dotGrid = { ...left.dotGrid, spacing: 3 };
    const right = newNotebookHalf();
    right.dotGrid = { ...right.dotGrid, spacing: 8 };

    expect(composeSpread(left, right, 70).dotGrid.spacing).toBe(3);
  });

  it('둘 다 비어 있으면 빈 채로 합쳐진다', () => {
    expect(composeSpread(newNotebookHalf(), newNotebookHalf(), 70).objects).toEqual([]);
  });
});

/** id만 다른 반쪽 하나 — "이 반쪽이 실제로 쓰였는지"를 id로 확인하는 데 쓴다. */
function halfWith(id: string): NotebookHalf {
  const h = newNotebookHalf();
  h.objects = commit(h.objects, [{ id, type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }]);
  return h;
}

describe('인쇄 단위(표지 + 내지) 계산', () => {
  const cover: NotebookCover = { front: halfWith('앞표지'), back: halfWith('뒤표지') };
  const pages = [halfWith('1쪽'), halfWith('2쪽'), halfWith('3쪽'), halfWith('4쪽')];
  const imposition = notebookImposition(4); // 장 1개

  it('전체 인쇄 단위는 표지 1장 + 내지 장 수다', () => {
    expect(notebookPrintUnitCount(imposition)).toBe(2); // 표지 1 + 내지 1장
  });

  it('0번 단위는 표지 — 뒤표지(왼쪽)+앞표지(오른쪽), 뒷면은 없다', () => {
    const unit = notebookPrintUnit(cover, pages, imposition, 70, 0);
    expect(unit.front.objects.map((o) => o.id)).toEqual(['뒤표지', '앞표지']);
    expect(unit.back).toBeNull();
  });

  it('1번 단위는 첫 내지 장 — imposition이 정한 쪽이 앞뒤에 온다', () => {
    // notebookImposition(4) → frontLeft=3(4쪽) frontRight=0(1쪽) backLeft=1(2쪽) backRight=2(3쪽)
    const unit = notebookPrintUnit(cover, pages, imposition, 70, 1);
    expect(unit.front.objects.map((o) => o.id)).toEqual(['4쪽', '1쪽']);
    expect(unit.back?.objects.map((o) => o.id)).toEqual(['2쪽', '3쪽']);
  });
});

describe('노트에 쓰인 모든 그린 것 모으기', () => {
  it('표지 앞뒤·내지 전부를 모은다', () => {
    const cover: NotebookCover = { front: halfWith('앞표지'), back: halfWith('뒤표지') };
    const pages = [halfWith('1쪽'), halfWith('2쪽')];
    const ids = allNotebookObjects(cover, pages).map((o) => o.id);
    expect(ids).toEqual(['앞표지', '뒤표지', '1쪽', '2쪽']);
  });
});
