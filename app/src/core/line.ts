import type { Dash, LineObject } from './objects';
import { OBJECT_LINE_COLOR, OBJECT_LINE_WIDTH } from './style';
import type { Mm } from './units';

/**
 * 선을 어떻게 그릴지.
 *
 * **화면과 PDF가 반드시 같은 모양으로 그려야 한다.** 둘은 그리는 방법이 전혀 다르다 —
 * 화면은 SVG의 stroke 속성에 맡기고, PDF는 pdf-lib에 pt로 넘긴다. 그래도 "이 선이
 * 실제로 몇 mm 굵기이고 무슨 색인가"는 하나뿐이므로 여기서 한 번만 정한다.
 *
 * 이 파일이 생긴 이유가 있다. 한동안 `OBJECT_LINE_CAP`을 화면만 `round`로 두고
 * PDF는 `butt`로 둬서 **인쇄물에서만** 굵은 선의 꼭짓점이 끊겼다. 그건 값을
 * core/style 한 군데로 모아 고쳤는데, `?? 기본값`과 점선 비율은 여전히 두 뷰에
 * 각각 적혀 있었다. 주석으로 "화면과 같은 값을 쓴다"고 적어둬도 강제가 아니다.
 *
 * 글자 쪽의 core/text(`sizeOf`·`alignOf`·`valignOf`·`lineHeightOf`)와 같은 역할이다.
 */

/** 이 선의 굵기. 정하지 않았으면 기본값. */
export function widthOf(o: LineObject): Mm {
  return o.width ?? OBJECT_LINE_WIDTH;
}

/** 이 선의 색. 정하지 않았으면 기본값. */
export function colorOf(o: LineObject): string {
  return o.color ?? OBJECT_LINE_COLOR;
}

/** 이 선의 모양. 정하지 않았으면 실선. */
export function dashOf(o: LineObject): Dash {
  return o.dash ?? 'solid';
}

/**
 * 점선의 [그리는 길이, 띄는 길이]. 실선이면 없다.
 *
 * **굵기에 비례한다.** 고정 길이로 두면 0.1mm 선에서는 점선이 뭉개지고 0.8mm
 * 선에서는 뚝뚝 끊겨 보인다. 비율로 두면 어느 굵기에서나 비슷하게 읽힌다.
 *
 * mm로 돌려준다. 화면은 그대로 이어 붙이고, PDF는 pt로 바꿔서 쓴다.
 */
export function dashPattern(o: LineObject): [Mm, Mm] | undefined {
  const w = widthOf(o);
  if (dashOf(o) === 'dashed') return [w * 6, w * 4];
  if (dashOf(o) === 'dotted') return [w, w * 3];
  return undefined;
}
