import type { Font } from '@pdf-lib/fontkit';
import type { Measure } from '../core/text';

/**
 * 글꼴 파일로 글자 폭을 잰다 — core/text의 `Measure`(글자 크기 1mm일 때의 폭).
 *
 * **화면과 PDF가 이 함수 하나를 쓴다**(구현전략 ‘바닥 1’). 화면은 fonts/coverage가
 * 파싱해 둔 글꼴을, PDF는 심을 때 같은 바이트로 파싱한 글꼴을 넘긴다 — 같은 파일 ·
 * 같은 계산이라 두 뷰의 자리가 같다.
 *
 * 계산은 pdf-lib이 폭을 재는 방식과 같다: 글리프 advance를 더하고 커닝은 넣지 않는다
 * (화면도 font-kerning: none으로 그린다, ui/InsertView).
 */
const cache = new WeakMap<Font, Measure>();

export function measureOf(font: Font): Measure {
  const hit = cache.get(font);
  if (hit) return hit;
  const widths = new Map<string, number>();
  const measure: Measure = (text) => {
    let w = widths.get(text);
    if (w === undefined) {
      let units = 0;
      for (const glyph of font.layout(text).glyphs) units += glyph.advanceWidth;
      w = units / font.unitsPerEm;
      widths.set(text, w);
    }
    return w;
  };
  cache.set(font, measure);
  return measure;
}
