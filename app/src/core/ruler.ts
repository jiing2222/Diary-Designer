import type { Mm } from './units';

/**
 * 편집 화면의 눈금자(리뉴얼 9-1, 기능후보 4). 화면에만 보이고 인쇄되지 않는다 — Print의 ‘50mm 검증
 * 눈금’(인쇄되는 것)과는 다르다.
 *
 * 0은 속지의 왼쪽 위 모서리, 단위는 mm. 확대에 따라 눈금 간격을 고른다 — 눈금끼리 너무 붙으면
 * 읽을 수 없으므로 가장 촘촘한 눈금도 화면에서 최소 `MIN_TICK_PX`는 떨어지게 한다.
 */

export type TickKind = 'major' | 'mid' | 'minor';

export interface Tick {
  mm: Mm;
  kind: TickKind;
  /** 숫자를 붙이는 눈금이면 그 글자. */
  label?: string;
}

/** 가장 촘촘한 눈금 사이의 화면 거리 하한(px). */
export const MIN_TICK_PX = 4;
/** 숫자 사이의 화면 거리 하한(px) — 두 자리·세 자리 숫자가 겹치지 않게. */
export const MIN_LABEL_PX = 28;

/** 고를 수 있는 간격(mm). 1·5·10 계열이라 자로 잴 때와 같은 느낌. */
const STEPS: Mm[] = [1, 5, 10, 50, 100];

/**
 * 0부터 `length`까지의 눈금. `pxPerMm`은 지금 확대에서 1mm가 화면에서 몇 px인지.
 * - minor: 화면에서 MIN_TICK_PX 이상 떨어지는 가장 작은 간격
 * - mid: 그 다음 간격(5mm 등)
 * - major: 숫자를 붙이는 간격 — MIN_LABEL_PX 이상 떨어지는 가장 작은 10의 배수 계열
 */
export function rulerTicks(length: Mm, pxPerMm: number): Tick[] {
  if (!(length > 0) || !(pxPerMm > 0)) return [];
  const minor = STEPS.find((s) => s * pxPerMm >= MIN_TICK_PX) ?? STEPS[STEPS.length - 1];
  const labelStep = [10, 20, 50, 100, 200, 500].find((s) => s * pxPerMm >= MIN_LABEL_PX) ?? 500;
  const mid = STEPS.find((s) => s > minor && labelStep % s === 0 && s < labelStep) ?? null;
  const out: Tick[] = [];
  // 정수 mm로 센다 — 0.1씩 더하며 쌓이는 소수 오차가 없게.
  for (let i = 0; i * minor <= length + 1e-9; i++) {
    const mm = i * minor;
    if (mm % labelStep === 0) out.push({ mm, kind: 'major', label: String(mm) });
    else if (mid !== null && mm % mid === 0) out.push({ mm, kind: 'mid' });
    else out.push({ mm, kind: 'minor' });
  }
  return out;
}
