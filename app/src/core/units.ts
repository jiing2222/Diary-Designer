/**
 * 단위 변환.
 *
 * 이 프로그램의 모든 좌표와 치수는 mm다. 예외 없다.
 * 픽셀이나 포인트 값이 문서 모델에 저장되는 일은 없어야 한다.
 * 변환은 화면에 그리거나 PDF를 만드는 순간에만 일어난다.
 */

/** 밀리미터. 문서 모델에 쓰이는 유일한 길이 단위. */
export type Mm = number;

/** 1mm가 몇 PDF 포인트인지. PDF는 1pt = 1/72인치를 쓴다. */
export const MM_TO_PT = 72 / 25.4;

/** mm를 PDF 포인트로. */
export function mmToPt(mm: Mm): number {
  return mm * MM_TO_PT;
}

/**
 * 포인트를 mm로.
 *
 * 글자 크기만 pt로 입력받는다. 문서 프로그램에서 쓰던 단위라 10pt가 어느 정도인지
 * 감이 있기 때문이다. 받는 즉시 mm로 바꿔서 저장하므로 모델에는 여전히 mm만 있다.
 */
export function ptToMm(pt: number): Mm {
  return pt / MM_TO_PT;
}

/** 소수점 자리를 정리한다. 부동소수점 오차가 UI에 새어나오는 걸 막는다. */
export function roundMm(mm: Mm, digits = 2): Mm {
  const f = 10 ** digits;
  return Math.round(mm * f) / f;
}
