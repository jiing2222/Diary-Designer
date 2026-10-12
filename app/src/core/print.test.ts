import { describe, expect, it } from 'vitest';
import { backLayoutOf, cardAt, cardsForFaces, formatPageRange, insertFootprint, parsePageRange, printCards, sheetCount } from './print';
import { computeLayout } from './layout';

describe('속지 한 장 = 앞·뒷면', () => {
  it('양면: 면 0·1이 1장, 홀수면 마지막 뒷면이 빈다', () => {
    expect(printCards(5, true)).toEqual([
      { front: 0, back: 1 },
      { front: 2, back: 3 },
      { front: 4, back: null },
    ]);
  });

  it('단면: 면마다 한 장', () => {
    expect(printCards(2, false)).toEqual([
      { front: 0, back: null },
      { front: 1, back: null },
    ]);
  });
});

describe('페이지 선택', () => {
  it('1-3, 5 → 면 0·1·2·4, 범위 밖은 무시, 거꾸로 쓴 범위도', () => {
    expect(parsePageRange('1-3, 5, 99', 6)).toEqual({ faces: [0, 1, 2, 4] });
    expect(parsePageRange('4~2', 6)).toEqual({ faces: [1, 2, 3] });
    expect(parsePageRange('', 6)).toEqual({ faces: [] });
    expect(parsePageRange('1 - 3, 5 ~ 6', 6)).toEqual({ faces: [0, 1, 2, 4, 5] });
  });

  it('알아볼 수 없는 조각을 알려준다', () => {
    expect(parsePageRange('1-3, 가', 6)).toEqual({ error: '가' });
  });

  it('양면이면 고른 페이지가 든 속지의 앞·뒤가 함께', () => {
    const cards = printCards(6, true);
    expect(cardsForFaces(cards, [3])).toEqual([{ front: 2, back: 3 }]);
    expect(cardsForFaces(cards, null)).toHaveLength(3);
  });
});

describe('용지', () => {
  it('속지 영역은 지금은 속지 그대로', () => {
    expect(insertFootprint({ width: 80, height: 125 })).toEqual({ width: 80, height: 125 });
  });

  it('필요한 장수는 올림', () => {
    expect(sheetCount(9, 4)).toBe(3);
    expect(sheetCount(0, 4)).toBe(0);
  });
});

describe('칸 배정·뒷면 배치(미리보기와 PDF가 같이 쓴다)', () => {
  it('차례로: 장마다 칸 수만큼, 마지막 장의 남는 칸은 빈다', () => {
    expect([0, 1, 2, 3].map((slot) => cardAt(1, slot, 6, 4, { on: false }))).toEqual([4, 5, null, null]);
  });

  it('겹치기 배치를 켜면 칸마다 연속 구간 — 1장 0번 칸 다음은 2장 0번 칸', () => {
    expect(cardAt(0, 0, 8, 4, { on: true })).toBe(0);
    expect(cardAt(1, 0, 8, 4, { on: true })).toBe(1);
  });

  it('뒷면은 칸 위치를 좌우로 뒤집는다', () => {
    const layout = computeLayout({ paperWidth: 210, paperHeight: 297, insertWidth: 80, insertHeight: 125, gap: 0, printMargin: 5, allowRotate: false, align: 'topLeft' });
    const back = backLayoutOf(layout, 210, 297, false);
    expect(back.slots[0].x).toBeCloseTo(210 - layout.slots[0].x - layout.slots[0].width);
  });
});

describe('고른 페이지를 글자로', () => {
  it('이어지는 번호는 묶고, 읽으면 같은 면이 된다', () => {
    expect(formatPageRange([4, 0, 1, 2, 2])).toBe('1-3, 5');
    expect(formatPageRange([])).toBe('');
    expect(parsePageRange(formatPageRange([0, 1, 2, 4, 9]), 20)).toEqual({ faces: [0, 1, 2, 4, 9] });
  });
});
