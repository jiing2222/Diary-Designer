import { describe, expect, it } from 'vitest';
import { cardsForFaces, insertFootprint, parsePageRange, printCards, sheetCount } from './print';

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
