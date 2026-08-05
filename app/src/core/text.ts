import type { Align, TextObject, VAlign } from './objects';
import { TEXT_ASCENT, TEXT_DESCENT, TEXT_SIZE } from './style';
import type { Mm } from './units';

/**
 * 글자를 어디에 놓을지.
 *
 * **화면과 PDF가 반드시 같은 자리에 놓아야 한다.** 둘은 그리는 방법이 전혀 다르다 —
 * 화면은 SVG의 text-anchor에 맡기고, PDF는 글자 폭을 재서 좌표를 직접 옮긴다.
 * 각자 계산하면 언젠가 어긋나므로 기준점을 여기서 한 번만 정한다.
 *
 * 세로 기준은 글꼴의 윗선·아랫선 비율(core/style)로 잡는다. 실제 글꼴 지표를
 * 쓰지 않는 이유는 화면 쪽에서 그 값을 얻기 어렵기 때문이다. 같은 비율을 두 뷰가
 * 함께 쓰면 적어도 서로 어긋나지는 않는다.
 */

/** 글자 크기. 정하지 않았으면 기본값. */
export function sizeOf(t: TextObject): Mm {
  return t.size ?? TEXT_SIZE;
}

export function alignOf(t: TextObject): Align {
  return t.align ?? 'left';
}

export function valignOf(t: TextObject): VAlign {
  return t.valign ?? 'middle';
}

/**
 * 글자가 걸리는 가로 기준점.
 *
 * 화면은 이 자리에 text-anchor(start/middle/end)로 붙이고,
 * PDF는 잰 폭만큼 왼쪽으로 물려서 그린다. 결과는 같다.
 */
export function anchorX(box: { x: Mm; width: Mm }, align: Align): Mm {
  if (align === 'center') return box.x + box.width / 2;
  if (align === 'right') return box.x + box.width;
  return box.x;
}

/** 잰 폭을 알 때 글자가 실제로 시작하는 왼쪽 끝. PDF가 쓴다. */
export function leftOf(box: { x: Mm; width: Mm }, align: Align, textWidth: Mm): Mm {
  const at = anchorX(box, align);
  if (align === 'center') return at - textWidth / 2;
  if (align === 'right') return at - textWidth;
  return at;
}

/** ⇧Enter로 줄을 나눈다. 줄바꿈 없는 한 줄짜리 글자도 배열 하나로 다룬다. */
export function splitLines(text: string): string[] {
  return text.split('\n');
}

/**
 * 실제로 쓰이는 줄 간격.
 *
 * **도트 간격을 그대로 따른다.** 5mm 도트 위에서 여러 줄을 쓰면, 각 줄이 정확히
 * 다음 도트 줄에 앉아야 칸 한가운데가 아니라 위쪽으로 자꾸 밀리는 일이 없다.
 * 글자가 도트 간격보다 커서 겹칠 것 같으면(예: 2mm 도트에 24pt 글자) 그때만
 * 글꼴이 실제로 차지하는 높이로 물러난다 — 겹쳐서 안 보이는 것보단 낫다.
 */
export function effectiveLineHeight(size: Mm, spacing: Mm): Mm {
  return Math.max(spacing, size * (TEXT_ASCENT + TEXT_DESCENT));
}

/**
 * 여러 줄 글자 블록이 실제로 차지하는 높이.
 *
 * 첫 줄은 글꼴의 윗선·아랫선만큼, 그 아래 줄은 줄 간격(도트 간격)만큼씩 보탠다.
 * 한 줄일 때는 spacing이 결과에 끼어들지 않는다 — 그래야 지금까지의
 * 한 줄 계산과 정확히 같은 값이 나온다.
 */
export function blockHeight(size: Mm, lineCount: number, spacing: Mm): Mm {
  return (lineCount - 1) * effectiveLineHeight(size, spacing) + size * (TEXT_ASCENT + TEXT_DESCENT);
}

/**
 * 각 줄이 앉는 밑선(baseline)의 세로 좌표.
 *
 * 위·가운데·아래 모두 이 함수 하나로 낸다. 한 줄일 때(lineCount=1)는
 * 예전 `baselineY` 공식과 정확히 같은 값을 낸다 — 아래 `baselineY`가
 * 이 함수에 위임하므로 둘이 어긋날 일이 없다.
 */
export function lineBaselines(
  box: { y: Mm; height: Mm },
  size: Mm,
  valign: VAlign,
  lineCount: number,
  spacing: Mm,
): Mm[] {
  const asc = size * TEXT_ASCENT;
  const lineHeight = effectiveLineHeight(size, spacing);
  const total = blockHeight(size, lineCount, spacing);

  let inkTop: Mm;
  if (valign === 'top') inkTop = box.y;
  else if (valign === 'bottom') inkTop = box.y + box.height - total;
  else inkTop = box.y + box.height / 2 - total / 2;

  return Array.from({ length: lineCount }, (_, i) => inkTop + asc + i * lineHeight);
}

/**
 * 글자가 앉는 밑선(baseline)의 세로 좌표. 한 줄짜리 글자를 위한 지름길이다.
 *
 * 한 줄이면 줄 간격이 결과에 곱해지지 않으므로(`i`가 항상 0) spacing에
 * 아무 값이나 넣어도 된다 — 여기서는 0을 쓴다.
 */
export function baselineY(box: { y: Mm; height: Mm }, size: Mm, valign: VAlign): Mm {
  return lineBaselines(box, size, valign, 1, 0)[0];
}
