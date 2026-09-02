import type { Font } from '@pdf-lib/fontkit';

/**
 * fontkit의 타입 선언엔 없지만 실제로 있는 값 — 글리프의 윤곽선이 정말
 * 비어 있는지 보는 데 쓴다(아래 canDraw 참고).
 */
type PathWithCommands = { commands: unknown[] };

/**
 * 이 폰트가 이 글자를 실제로 그릴 수 있는가.
 *
 * 화면(SVG)과 PDF가 함께 부른다 — 둘 다 "이 폰트로 이 글자가 그려지는가"라는
 * 같은 판단을 하므로 core에 한 번만 둔다.
 *
 * 두 가지를 놓치지 않는다:
 * 1. **글리프 자체가 없다**(notdef, id 0) — 예: Pretendard에 이모지가 없다.
 * 2. **글리프는 있지만 윤곽선이 비어 있다** — 컬러 이모지 폰트(예:
 *    Apple Color Emoji)는 진짜 그림을 sbix·CBDT·COLR 같은 별도의 색
 *    테이블에 담아서, 우리가(그리고 pdf-lib이) 읽는 흑백 윤곽선 쪽엔
 *    아무것도 없다 — 그래서 어떤 폰트를 골라도 색깔 이모지는 절대 안
 *    그려진다(2026-09-02, `fontkit.create`로 직접 확인).
 *
 * 둘 다 실제로는 안 그려지므로 같은 취급을 한다. 공백은 원래 잉크가
 * 없는 게 정상이라(글리프는 있고 윤곽선만 빈) 빼고 본다.
 */
export function canDraw(font: Font, char: string): boolean {
  if (/\s/.test(char)) return true;
  const glyph = font.glyphForCodePoint(char.codePointAt(0)!);
  if (glyph.id === 0) return false;
  return (glyph.path as unknown as PathWithCommands).commands.length > 0;
}

/**
 * 이 폰트로 못 그리는 글자를 X로 바꾼 문자열.
 *
 * **저장값(`TextObject.text`)은 안 건드린다.** 그릴 때만 이 함수를 거친다 —
 * 나중에 그 글자를 담은 폰트로 바꾸면 다시 원래 글자가 보여야 하기 때문이다.
 * `Array.from`으로 코드 포인트 단위로 훑어야 이모지(서로게이트 쌍) 하나가
 * 두 글자로 쪼개지지 않는다.
 */
export function sanitizeForFont(text: string, font: Font): string {
  return Array.from(text)
    .map((ch) => (canDraw(font, ch) ? ch : 'X'))
    .join('');
}

/** text 안에 이 폰트로 못 그리는 글자가 하나라도 있는가. 안내 문구를 띄울지 판단하는 데 쓴다. */
export function hasUndrawableChar(text: string, font: Font): boolean {
  return Array.from(text).some((ch) => !canDraw(font, ch));
}
