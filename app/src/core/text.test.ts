import { describe, expect, it } from 'vitest';
import {
  anchorX,
  baselineY,
  blockHeight,
  effectiveLineHeight,
  leftOf,
  lineBaselines,
  splitLines,
} from './text';
import { TEXT_ASCENT, TEXT_DESCENT } from './style';

const box = { x: 20, y: 40, width: 30, height: 10 };
const size = 4;

describe('글자 가로 자리', () => {
  it('왼쪽·가운데·오른쪽', () => {
    expect(anchorX(box, 'left')).toBe(20);
    expect(anchorX(box, 'center')).toBe(35);
    expect(anchorX(box, 'right')).toBe(50);
  });

  it('잰 폭을 알면 실제 시작점이 나온다', () => {
    // 화면은 text-anchor로, PDF는 이 값으로 그린다. 결과가 같아야 한다.
    expect(leftOf(box, 'left', 12)).toBe(20);
    expect(leftOf(box, 'center', 12)).toBe(29); // 35 - 6
    expect(leftOf(box, 'right', 12)).toBe(38); // 50 - 12
  });

  it('폭이 상자보다 넓어도 기준점은 그대로다', () => {
    // 글자는 상자를 넘칠 수 있다. 넘친다고 자리가 바뀌지는 않는다.
    expect(leftOf(box, 'center', 50)).toBe(10);
    expect(leftOf(box, 'left', 50)).toBe(20);
  });
});

describe('글자 세로 자리', () => {
  it('위쪽은 상자 윗변에 글자 윗선을 맞춘다', () => {
    expect(baselineY(box, size, 'top')).toBeCloseTo(40 + size * TEXT_ASCENT, 9);
  });

  it('아래쪽은 상자 밑변에 글자 아랫선을 맞춘다', () => {
    expect(baselineY(box, size, 'bottom')).toBeCloseTo(50 - size * TEXT_DESCENT, 9);
  });

  it('가운데는 위아래가 고르게 남는다', () => {
    const base = baselineY(box, size, 'middle');
    const top = base - size * TEXT_ASCENT;
    const bottom = base + size * TEXT_DESCENT;
    expect(top - box.y).toBeCloseTo(box.y + box.height - bottom, 9);
  });

  it('칸이 커져도 가운데를 지킨다', () => {
    const tall = { ...box, height: 40 };
    const base = baselineY(tall, size, 'middle');
    const top = base - size * TEXT_ASCENT;
    const bottom = base + size * TEXT_DESCENT;
    expect(top - tall.y).toBeCloseTo(tall.y + tall.height - bottom, 9);
  });

  it('글자가 칸보다 커도 계산이 무너지지 않는다', () => {
    const base = baselineY(box, 30, 'middle');
    expect(Number.isFinite(base)).toBe(true);
  });
});

describe('줄바꿈', () => {
  it('⇧Enter로 나눈 줄이 배열이 된다', () => {
    expect(splitLines('월\n화\n수')).toEqual(['월', '화', '수']);
    expect(splitLines('한 줄')).toEqual(['한 줄']);
  });
});

describe('줄 간격은 도트 간격을 따른다', () => {
  // size=4일 때 글꼴 자체 높이(윗선+아랫선)는 4다.
  const natural = size * (TEXT_ASCENT + TEXT_DESCENT);

  it('간격이 글꼴 높이보다 넉넉하면 간격 그대로다', () => {
    expect(effectiveLineHeight(size, 5)).toBe(5);
  });

  it('간격이 글꼴보다 좁으면 겹치지 않을 만큼만 확보한다', () => {
    // 2mm 도트에 이 크기 글자를 쓰면 줄이 겹친다 — 글꼴 높이로 물러난다.
    expect(effectiveLineHeight(size, 2)).toBeCloseTo(natural, 9);
  });
});

describe('여러 줄 블록', () => {
  const spacing = 5;

  it('한 줄일 때는 줄 간격이 끼어들지 않는다', () => {
    // spacing이 섞이면 지금까지의 한 줄 계산과 어긋난다.
    expect(blockHeight(size, 1, spacing)).toBeCloseTo(size * (TEXT_ASCENT + TEXT_DESCENT), 9);
  });

  it('줄이 늘 때마다 도트 간격만큼 늘어난다', () => {
    const one = blockHeight(size, 1, spacing);
    const three = blockHeight(size, 3, spacing);
    expect(three - one).toBeCloseTo(2 * spacing, 9);
  });

  it('한 줄이면 baselineY와 정확히 같다', () => {
    // baselineY가 lineBaselines(...,1,0)에 위임하므로 항상 같아야 한다.
    for (const valign of ['top', 'middle', 'bottom'] as const) {
      expect(lineBaselines(box, size, valign, 1, spacing)[0]).toBe(baselineY(box, size, valign));
    }
  });

  it('줄마다 정확히 도트 간격만큼 떨어진다', () => {
    // 5mm 도트 위에서 여러 줄을 쓰면 각 줄이 정확히 다음 도트 줄에 앉는다.
    const lines = lineBaselines(box, size, 'top', 4, spacing);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i] - lines[i - 1]).toBeCloseTo(spacing, 9);
    }
  });

  it('가운데 정렬은 블록 전체를 칸 한가운데에 놓는다', () => {
    const lines = lineBaselines(box, size, 'middle', 3, spacing);
    const top = lines[0] - size * TEXT_ASCENT;
    const bottom = lines[lines.length - 1] + size * TEXT_DESCENT;
    // 위 여백과 아래 여백이 같아야 진짜 가운데다.
    expect(top - box.y).toBeCloseTo(box.y + box.height - bottom, 9);
  });
});
