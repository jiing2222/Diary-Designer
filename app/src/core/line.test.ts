import { describe, expect, it } from 'vitest';
import { colorOf, dashOf, dashPattern, widthOf } from './line';
import type { LineObject } from './objects';
import { OBJECT_LINE_COLOR, OBJECT_LINE_WIDTH } from './style';

const at = (extra: Partial<LineObject> = {}): LineObject => ({
  id: 'l1',
  type: 'line',
  x1: 0,
  y1: 0,
  x2: 50,
  y2: 0,
  ...extra,
});

describe('선에 새겨둔 값', () => {
  it('정한 값이 있으면 그것을 쓴다', () => {
    expect(widthOf(at({ width: 0.8 }))).toBe(0.8);
    expect(colorOf(at({ color: '#000000' }))).toBe('#000000');
    expect(dashOf(at({ dash: 'dotted' }))).toBe('dotted');
  });

  it('없으면 core/style의 기본값을 따른다', () => {
    // 손대지 않은 선은 값을 갖지 않는다. 나중에 기본값을 바꾸면 다 같이 따라온다.
    expect(widthOf(at())).toBe(OBJECT_LINE_WIDTH);
    expect(colorOf(at())).toBe(OBJECT_LINE_COLOR);
    expect(dashOf(at())).toBe('solid');
  });
});

describe('점선 간격', () => {
  it('실선은 간격이 없다', () => {
    expect(dashPattern(at())).toBeUndefined();
    expect(dashPattern(at({ dash: 'solid' }))).toBeUndefined();
  });

  it('굵기에 비례한다', () => {
    // 고정 길이로 두면 가는 선에서는 뭉개지고 굵은 선에서는 뚝뚝 끊긴다.
    const thin = dashPattern(at({ dash: 'dashed', width: 0.1 }))!;
    const thick = dashPattern(at({ dash: 'dashed', width: 0.8 }))!;
    expect(thick[0] / thin[0]).toBeCloseTo(8, 9);
    expect(thick[1] / thin[1]).toBeCloseTo(8, 9);
  });

  it('파선은 그리는 쪽이, 점선은 띄는 쪽이 길다', () => {
    const [dashOn, dashOff] = dashPattern(at({ dash: 'dashed', width: 0.2 }))!;
    expect(dashOn).toBeGreaterThan(dashOff);

    const [dotOn, dotOff] = dashPattern(at({ dash: 'dotted', width: 0.2 }))!;
    expect(dotOff).toBeGreaterThan(dotOn);
  });

  it('점선의 점은 굵기와 같다 — 동그랗게 찍힌다', () => {
    // OBJECT_LINE_CAP이 round라 길이가 굵기와 같으면 정확히 원이 된다.
    expect(dashPattern(at({ dash: 'dotted', width: 0.3 }))![0]).toBe(0.3);
  });
});

describe('화면과 PDF가 같은 값을 쓴다', () => {
  it('mm로 돌려준다 — 화면은 그대로, PDF는 pt로 바꿔 쓴다', () => {
    // 이 함수가 생긴 이유다. 예전에는 두 뷰가 각자 6·4·1·3을 적어놓고 주석으로만
    // "같은 비율"이라고 약속했다. OBJECT_LINE_CAP이 정확히 그렇게 어긋나서
    // 인쇄물에서만 꼭짓점이 끊겼던 적이 있다.
    const pattern = dashPattern(at({ dash: 'dashed', width: 0.2 }))!;
    expect(pattern[0]).toBeCloseTo(1.2, 9);
    expect(pattern[1]).toBeCloseTo(0.8, 9);
  });
});
