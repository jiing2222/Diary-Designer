import { describe, expect, it } from 'vitest';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canDraw, hasUndrawableChar, sanitizeForFont } from './fontCoverage';

// 진짜 Pretendard 파일로 확인한다 — 어떤 글자가 있고 없는지는 이 폰트 파일
// 자체가 결정하므로, 가짜 데이터로는 진짜 있는(또는 없는) 글자를 시험할 수 없다.
const font = fontkit.create(
  new Uint8Array(readFileSync(fileURLToPath(new URL('../../public/fonts/Pretendard-Regular.ttf', import.meta.url)))),
);

describe('canDraw', () => {
  it('한글·영문·기본 문장부호는 그릴 수 있다', () => {
    expect(canDraw(font, '가')).toBe(true);
    expect(canDraw(font, 'a')).toBe(true);
    expect(canDraw(font, '.')).toBe(true);
  });

  it('•(불릿)처럼 실제로 담긴 기호는 그릴 수 있다', () => {
    expect(canDraw(font, '•')).toBe(true);
  });

  it('공백은 윤곽선이 비어 있어도 그릴 수 있는 것으로 친다', () => {
    expect(canDraw(font, ' ')).toBe(true);
  });

  it('Pretendard에 없는 색깔 이모지는 그릴 수 없다', () => {
    expect(canDraw(font, '📧')).toBe(false);
    expect(canDraw(font, '⚫')).toBe(false);
  });
});

describe('sanitizeForFont', () => {
  it('못 그리는 글자만 X로 바꾸고 나머지는 그대로 둔다', () => {
    expect(sanitizeForFont('이모지⚫테스트📧끝', font)).toBe('이모지X테스트X끝');
  });

  it('전부 그릴 수 있으면 원래 글자 그대로다', () => {
    expect(sanitizeForFont('불릿 • 테스트', font)).toBe('불릿 • 테스트');
  });

  it('서로게이트 쌍(이모지)을 반 글자로 쪼개지 않는다', () => {
    // 만약 UTF-16 코드유닛 단위로 훑으면 "📧"가 두 X로(서로게이트 쌍이라)
    // 잘못 나온다 — 코드 포인트 단위로 훑어야 X 하나만 나온다.
    expect(sanitizeForFont('📧', font)).toBe('X');
  });
});

describe('hasUndrawableChar', () => {
  it('하나라도 못 그리면 true', () => {
    expect(hasUndrawableChar('테스트📧', font)).toBe(true);
  });

  it('전부 그릴 수 있으면 false', () => {
    expect(hasUndrawableChar('테스트', font)).toBe(false);
  });
});
