import { describe, expect, it } from 'vitest';
import {
  anchorX,
  baselineY,
  blockHeight,
  boldOf,
  canBold,
  displayText,
  effectiveLineHeight,
  fieldPlaceholder,
  leftOf,
  lineBaselines,
  lineHeightOf,
  newTextStyle,
  rotateOf,
  splitLines,
} from './text';
import type { TextObject } from './objects';
import { TEXT_ASCENT, TEXT_DESCENT, TEXT_SIZE } from './style';

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

describe('자동 필드 자리표시', () => {
  const base: TextObject = {
    id: 't1',
    type: 'text',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: '원래 글자',
  };

  it('자리표시는 오프셋을 담은 꺾쇠 표시다', () => {
    expect(fieldPlaceholder({ offset: 0 })).toBe('⟨+0⟩');
    expect(fieldPlaceholder({ offset: 6 })).toBe('⟨+6⟩');
  });

  it('필드가 없으면 원래 글자를 그대로 보여준다', () => {
    expect(displayText(base)).toBe('원래 글자');
  });

  it('필드가 있으면 원래 글자 대신 자리표시를 보여준다', () => {
    // text는 지워지지 않는다 — field를 떼면 원래 글자로 돌아온다.
    const field = { ...base, field: { offset: 2, format: 'M/D' } };
    expect(displayText(field)).toBe('⟨+2⟩');
    expect(field.text).toBe('원래 글자');
  });
});

describe('만들 때 정해지는 줄 간격', () => {
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

describe('굵게', () => {
  it('정하지 않았으면 보통 굵기다', () => {
    expect(boldOf({})).toBe(false);
  });

  it('정했으면 그것을 쓴다', () => {
    expect(boldOf({ bold: true })).toBe(true);
    // 명시적으로 false를 담아둔 경우도 보통 굵기다.
    expect(boldOf({ bold: false })).toBe(false);
  });

  it('앞으로 쓸 글자에도 이어진다', () => {
    // 크기·색과 같은 규칙이다. 한 번 굵게로 바꾸면 다음 글자도 굵다.
    expect(newTextStyle({ bold: true }, 5).bold).toBe(true);
  });

  it('기본 글꼴에서만 쓸 수 있다', () => {
    // 등록한 글꼴에는 Bold 파일이 없다. 브라우저는 가짜 굵게를 만들어주지만
    // pdf-lib에는 그 기능이 없어서, 허용하면 화면만 굵고 인쇄물은 그대로다.
    expect(canBold({})).toBe(true);
    expect(canBold({ font: 'f1' })).toBe(false);
  });
});

describe('앞으로 쓸 글자의 스타일', () => {
  it('줄 간격을 정해두지 않았으면 지금 도트 간격이 새겨진다', () => {
    expect(newTextStyle({}, 5).lineHeight).toBe(5);
  });

  it('글자가 도트 간격보다 크면 겹치지 않을 만큼 벌린다', () => {
    // 2mm 도트에 24pt 글자. 도트를 그대로 따르면 줄이 서로 겹친다.
    const big = { size: 24 / (72 / 25.4) };
    expect(newTextStyle(big, 2).lineHeight).toBeCloseTo(effectiveLineHeight(big.size, 2), 9);
  });

  it('직접 정해둔 줄 간격은 도트 간격이 덮어쓰지 않는다', () => {
    // 속성 막대에서 한 번 고쳐두면 크기·색과 마찬가지로 다음 글자로 이어져야 한다.
    expect(newTextStyle({ lineHeight: 8 }, 5).lineHeight).toBe(8);
  });

  it('크기를 정하지 않았으면 기본 크기로 줄 간격을 잰다', () => {
    // 촘촘한 격자에서 기본 9pt 글자를 쓰는 흔한 경우.
    expect(newTextStyle({}, 1).lineHeight).toBeCloseTo(effectiveLineHeight(TEXT_SIZE, 1), 9);
  });

  it('나머지 값은 그대로 물려받는다', () => {
    const draft = { size: 4, align: 'center' as const, color: '#000000' };
    expect(newTextStyle(draft, 5)).toEqual({ ...draft, lineHeight: 5 });
  });
});

describe('글자에 새겨둔 줄 간격', () => {
  const at = (extra: Partial<TextObject> = {}): TextObject => ({
    id: 't1',
    type: 'text',
    x: 20,
    y: 40,
    width: 30,
    height: 10,
    text: '첫 줄\n둘째 줄',
    size,
    ...extra,
  });

  it('새겨둔 값이 있으면 그것을 쓴다', () => {
    expect(lineHeightOf(at({ lineHeight: 20 }))).toBe(20);
  });

  it('없으면 글꼴 자체 높이로 돌아간다', () => {
    expect(lineHeightOf(at())).toBeCloseTo(size * (TEXT_ASCENT + TEXT_DESCENT), 9);
  });

  it('도트 간격을 바꿔도 이미 쓴 글의 줄 위치는 그대로다', () => {
    // 이 프로그램에서 실제로 났던 문제. 20mm 도트에서 쓴 글을 5mm로 바꾸면
    // 줄이 소급해서 좁아졌다 — 만들어둔 양식이 설정 하나에 무너지는 셈이었다.
    // 줄 간격을 객체에 새겨두므로 이제 바깥 설정과 무관하다.
    const t = at({ lineHeight: effectiveLineHeight(size, 20) });
    const before = lineBaselines(t, size, 'middle', 2, lineHeightOf(t));

    // 도트 간격이 5mm로 바뀐 상황을 흉내 낸다. 객체는 손대지 않았다.
    const after = lineBaselines(t, size, 'middle', 2, lineHeightOf(t));

    expect(after).toEqual(before);
    expect(after[1] - after[0]).toBe(20);
  });
});

describe('여러 줄 블록', () => {
  const lineHeight = 5;

  it('한 줄일 때는 줄 간격이 끼어들지 않는다', () => {
    // spacing이 섞이면 지금까지의 한 줄 계산과 어긋난다.
    expect(blockHeight(size, 1, lineHeight)).toBeCloseTo(size * (TEXT_ASCENT + TEXT_DESCENT), 9);
  });

  it('줄이 늘 때마다 줄 간격만큼 늘어난다', () => {
    const one = blockHeight(size, 1, lineHeight);
    const three = blockHeight(size, 3, lineHeight);
    expect(three - one).toBeCloseTo(2 * lineHeight, 9);
  });

  it('한 줄이면 baselineY와 정확히 같다', () => {
    // baselineY가 lineBaselines(...,1,0)에 위임하므로 항상 같아야 한다.
    for (const valign of ['top', 'middle', 'bottom'] as const) {
      expect(lineBaselines(box, size, valign, 1, lineHeight)[0]).toBe(baselineY(box, size, valign));
    }
  });

  it('줄마다 정확히 줄 간격만큼 떨어진다', () => {
    // 5mm 도트 위에서 여러 줄을 쓰면 각 줄이 정확히 다음 도트 줄에 앉는다.
    const lines = lineBaselines(box, size, 'top', 4, lineHeight);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i] - lines[i - 1]).toBeCloseTo(lineHeight, 9);
    }
  });

  it('가운데 정렬은 블록 전체를 칸 한가운데에 놓는다', () => {
    const lines = lineBaselines(box, size, 'middle', 3, lineHeight);
    const top = lines[0] - size * TEXT_ASCENT;
    const bottom = lines[lines.length - 1] + size * TEXT_DESCENT;
    // 위 여백과 아래 여백이 같아야 진짜 가운데다.
    expect(top - box.y).toBeCloseTo(box.y + box.height - bottom, 9);
  });
});

describe('글자 회전', () => {
  // 회전 계산 자체(rotationOf·pdfRotateOf)는 core/objects.test.ts가 잰다 —
  // 글자·이미지가 함께 쓰는 공용 계산이라 그쪽으로 옮겼다. 여기서는 글자
  // 전용 접근자만 본다.
  it('rotateOf — 정하지 않았으면 0', () => {
    expect(rotateOf({})).toBe(0);
    expect(rotateOf({ rotate: 90 })).toBe(90);
  });
});
