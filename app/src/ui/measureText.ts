import { blockHeight, splitLines } from '../core/text';
import { DEFAULT_FONT_FAMILY, FONT_WEIGHT } from '../core/style';
import type { Mm } from '../core/units';
import { PX_PER_MM_AT_100 } from './pixels';

/**
 * 입력 중인 글자가 실제로 몇 mm를 차지하는지.
 *
 * 상자를 자동으로 키우는 데 쓴다(core/objects의 growBox). 캔버스의 measureText로
 * 잰다 — 폰트 크기를 mm 그대로 넣으면 픽셀 단위 결과가 나오는데, 96px/inch는
 * 확대 배율과 무관한 고정값이라 나눠주면 곧 mm가 된다.
 *
 * 자로 잰 듯 정확할 필요는 없다. growBox가 격자 칸 단위로 한 번 더 올림하므로
 * 여기서 조금 넉넉히 잡아도 결과는 같다.
 */
let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  ctx ??= document.createElement('canvas').getContext('2d');
  return ctx!;
}

export function measureTextBox(
  text: string,
  size: Mm,
  lineHeight: Mm,
  bold = false,
  family = DEFAULT_FONT_FAMILY,
): { width: Mm; height: Mm } {
  const c = getCtx();
  // 굵기와 글꼴까지 넣어야 한다. Bold는 획이 두꺼운 만큼 폭도 넓고, 등록한 글꼴은
  // 글자 폭이 아예 다르다. 그리는 것과 다른 글꼴로 재면 상자가 안 맞는다.
  const weight = bold ? FONT_WEIGHT.bold : FONT_WEIGHT.regular;
  c.font = `${weight} ${size * PX_PER_MM_AT_100}px ${family}, sans-serif`;

  const lines = splitLines(text);
  const widthPx = Math.max(0, ...lines.map((l) => c.measureText(l).width));

  return {
    width: widthPx / PX_PER_MM_AT_100,
    // 줄 간격은 그 글자에 새겨둔 값을 그대로 쓴다(core/text의 lineHeightOf).
    height: blockHeight(size, lines.length, lineHeight),
  };
}
