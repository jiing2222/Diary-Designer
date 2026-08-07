import { cleanStyle, type Align, type TextObject, type TextStyle, type VAlign } from './objects';
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

/** 굵게 쓸 것인가. 정하지 않았으면 보통 굵기. */
export function boldOf(t: { bold?: boolean }): boolean {
  return t.bold ?? false;
}

/**
 * 굵게를 쓸 수 있는가.
 *
 * 등록한 글꼴에는 Bold 파일이 따로 없다. 브라우저는 가짜 굵게를 만들어주지만
 * pdf-lib에는 그 기능이 없어서, 허용하면 화면만 굵고 인쇄물은 그대로 나온다.
 * 굵은 글꼴이 필요하면 Bold 파일을 따로 등록해서 고른다.
 */
export function canBold(t: { font?: string }): boolean {
  return t.font === undefined;
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

/** 자동 필드가 편집 화면에서 보이는 자리표시(설계문서 7장). 진짜 값이 아니다. */
export function fieldPlaceholder(field: { offset: number }): string {
  return `⟨+${field.offset}⟩`;
}

/**
 * 이 글자에 실제로 보일 문자열.
 *
 * 화면과 PDF가 함께 부른다 — 각자 `t.text`를 직접 읽으면 자동 필드가 생겼을 때
 * 한쪽만 자리표시로 바뀌는 사고가 난다.
 *
 * **지금은 화면·PDF가 똑같이 자리표시를 보여준다.** 데이터셋에서 진짜 값을
 * 뽑아 채우는 일은 8c의 몫이다 — 그때까지는 편집 화면과 인쇄물이 다른 값을
 * 보여주는 것보다, 둘 다 같은 자리표시를 보여주는 편이 덜 놀랍다.
 */
export function displayText(t: TextObject): string {
  return t.field ? fieldPlaceholder(t.field) : t.text;
}

/**
 * 자동 필드의 서식 목록.
 *
 * 실제 계산은 core/format의 `formatDate`가 한다 — 여기 id가 그쪽 switch문의
 * case와 정확히 같아야 한다. 요일·월·주차는 파생값이라 날짜 하나에서
 * 바로 계산되고(설계문서 7장 서식 표), 따로 값을 입력받지 않는다.
 */
export const FIELD_FORMATS: { id: string; label: string }[] = [
  { id: 'D', label: '15' },
  { id: 'M/D', label: '3/15' },
  { id: 'M월 D일', label: '3월 15일' },
  { id: 'YYYY-MM-DD', label: '2027-03-15' },
  { id: 'ddd', label: '월' },
  { id: 'dddd', label: '월요일' },
  { id: 'ddd-en', label: 'Mon' },
  { id: 'dddd-en', label: 'Monday' },
  { id: 'M', label: '3' },
  { id: 'M월', label: '3월' },
  { id: 'MMM', label: 'MAR' },
  { id: 'MMMM', label: 'March' },
  { id: '주차', label: '11주차' },
  { id: 'W', label: 'W11' },
  { id: 'Week', label: 'Week 11' },
];
export const DEFAULT_FIELD_FORMAT = 'M/D';

/** 글꼴 자체가 세로로 차지하는 높이. 줄 간격의 하한이다. */
export function naturalLineHeight(size: Mm): Mm {
  return size * (TEXT_ASCENT + TEXT_DESCENT);
}

/**
 * 글자를 **새로 만들 때** 줄 간격으로 새겨둘 값.
 *
 * **도트 간격을 그대로 따른다.** 5mm 도트 위에서 여러 줄을 쓰면 각 줄이 정확히
 * 다음 도트 줄에 앉아야, 줄이 늘수록 칸 한가운데에서 위쪽으로 밀리지 않는다.
 * 다만 글자가 도트 간격보다 커서 줄이 겹칠 상황이면(예: 2mm 도트에 24pt 글자)
 * 글꼴 자체 높이로 물러난다 — 겹쳐서 못 읽는 것보단 낫다.
 *
 * 이 값은 **만들 때 한 번만** 계산해서 객체에 저장한다(TextObject.lineHeight).
 * 그리는 순간마다 다시 계산하면 나중에 도트 간격을 바꿀 때 이미 만든 글이
 * 소급해서 움직인다.
 */
export function effectiveLineHeight(size: Mm, spacing: Mm): Mm {
  return Math.max(spacing, naturalLineHeight(size));
}

/** 이 글자가 실제로 쓰는 줄 간격. 새겨둔 값이 없으면 글꼴 자체 높이. */
export function lineHeightOf(t: TextObject): Mm {
  return t.lineHeight ?? naturalLineHeight(sizeOf(t));
}

/**
 * 앞으로 쓸 글자에 새겨둘 스타일.
 *
 * 줄 간격은 **직접 정해둔 값이 있으면 그것을 그대로 쓰고**, 없을 때만 지금 도트
 * 간격에서 뽑아낸다. 속성 막대에서 줄 간격을 한 번 고쳐두면 크기·색과 마찬가지로
 * 다음에 쓰는 글자로 이어져야 하기 때문이다 — 고쳐놓아도 매번 도트 간격으로
 * 되돌아가면 고칠 이유가 없다.
 *
 * 어느 쪽이든 **만들 때 한 번만** 정해서 객체에 새긴다. 그리는 순간마다 다시
 * 계산하면 나중에 도트 간격을 바꿀 때 이미 써둔 글이 소급해서 움직인다.
 */
export function newTextStyle(draft: TextStyle, spacing: Mm): TextStyle {
  const size = draft.size ?? TEXT_SIZE;
  return cleanStyle({
    ...draft,
    lineHeight: draft.lineHeight ?? effectiveLineHeight(size, spacing),
  });
}

/**
 * 여러 줄 글자 블록이 실제로 차지하는 높이.
 *
 * 첫 줄은 글꼴의 윗선·아랫선만큼, 그 아래 줄은 줄 간격만큼씩 보탠다.
 * 한 줄일 때는 줄 간격이 결과에 끼어들지 않는다 — 그래야 지금까지의
 * 한 줄 계산과 정확히 같은 값이 나온다.
 */
export function blockHeight(size: Mm, lineCount: number, lineHeight: Mm): Mm {
  return (lineCount - 1) * lineHeight + naturalLineHeight(size);
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
  lineHeight: Mm,
): Mm[] {
  const asc = size * TEXT_ASCENT;
  const total = blockHeight(size, lineCount, lineHeight);

  let inkTop: Mm;
  if (valign === 'top') inkTop = box.y;
  else if (valign === 'bottom') inkTop = box.y + box.height - total;
  else inkTop = box.y + box.height / 2 - total / 2;

  return Array.from({ length: lineCount }, (_, i) => inkTop + asc + i * lineHeight);
}

/**
 * 글자가 앉는 밑선(baseline)의 세로 좌표. 한 줄짜리 글자를 위한 지름길이다.
 *
 * 한 줄이면 줄 간격이 결과에 곱해지지 않으므로(`i`가 항상 0) 아무 값이나
 * 넣어도 된다 — 여기서는 0을 쓴다.
 */
export function baselineY(box: { y: Mm; height: Mm }, size: Mm, valign: VAlign): Mm {
  return lineBaselines(box, size, valign, 1, 0)[0];
}
