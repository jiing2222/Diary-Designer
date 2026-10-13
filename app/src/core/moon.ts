import type { CalendarDate } from './dataset';
import type { Mm } from './units';

/**
 * 달 모양(세부계획 A4.7 결정 2026-09-28: 8단계, 기준 시간대 한국).
 *
 * 글자가 아니라 **도형**이다. 위상 계산과 모양(SVG 경로)은 여기서 한 번만 정하고
 * 화면(ui/InsertView)과 PDF(pdf/export의 `drawSvgPath`)가 같은 경로 문자열을 그린다.
 *
 * 그리는 법: 테두리 원은 늘 그리고, **어두운 부분을 칠한다** — 삭은 꽉 찬 원 ●, 보름달은 빈 원 ○.
 * 호보니치 수첩과 같은 방식이다(2026-10-13 사용자 결정, 처음엔 빛나는 부분을 칠했다). 한국(북반구)에서는
 * 차오르는 달의 오른쪽이 밝다 — 그래서 칠해지는 쪽은 왼쪽이다. 화면·PDF는 `moonShadePath`를 그린다.
 */

/** 0 삭 · 1 초승달 · 2 상현달 · 3 차가는 달 · 4 보름달 · 5 기우는 달 · 6 하현달 · 7 그믐달 */
export type MoonPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MOON_PHASE_NAMES = ['삭', '초승달', '상현달', '차가는 달', '보름달', '기우는 달', '하현달', '그믐달'] as const;

/** 삭망월(평균) — 일. */
const SYNODIC_MONTH = 29.530588853;
/** 기준 삭: 2000-01-06 18:14 UTC. */
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
const MS_PER_DAY = 86_400_000;

/**
 * 그 날의 달 나이(삭에서 며칠, 0 이상 29.53 미만) — 한국 시간 그날 정오(UTC 03시) 기준.
 *
 * 평균 주기로 센다. 실제 삭·망 시각과는 반나절 남짓 어긋날 수 있어서, 8단계의 경계에
 * 걸린 날은 천문 달력과 하루 다를 수 있다(진행상황.md ‘아직 확인하지 않은 값’).
 */
export function moonAgeOf(d: CalendarDate): number {
  const ms = Date.UTC(d.year, d.month - 1, d.day, 3) - REFERENCE_NEW_MOON_MS;
  const days = ms / MS_PER_DAY;
  return ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

/** 8단계 — 각 단계의 한가운데(삭 0일, 상현 7.4일, 보름 14.8일…)에 가까운 쪽으로. */
export function moonPhaseOf(d: CalendarDate): MoonPhase {
  return (Math.round((moonAgeOf(d) / SYNODIC_MONTH) * 8) % 8) as MoonPhase;
}

/** 달 칸에서 그릴 원 — 칸(상자) 가운데, 지름은 `size`(없으면 칸의 짧은 변 85%). */
export function moonCircle(o: { x: Mm; y: Mm; width: Mm; height: Mm; size?: Mm }): { cx: Mm; cy: Mm; r: Mm } {
  const size = o.size ?? Math.min(o.width, o.height) * 0.85;
  return { cx: o.x + o.width / 2, cy: o.y + o.height / 2, r: size / 2 };
}

/** 지름의 기본값(칸의 짧은 변 85%) — 막대의 크기 칸이 비어 있을 때 보여줄 값. */
export function moonSizeOf(o: { width: Mm; height: Mm; size?: Mm }): Mm {
  return o.size ?? Math.min(o.width, o.height) * 0.85;
}

/** 테두리 원의 경로. */
export function moonOutlinePath(cx: Mm, cy: Mm, r: Mm): string {
  return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
}

/**
 * 빛나는 부분의 경로. 삭이면 null(칠할 것이 없다).
 *
 * 한쪽 반원 + 경계(타원의 반쪽). 경계 타원의 가로 반지름은 r·|cos(위상각)| — 8단계라
 * 초승·그믐·차가는·기우는 달은 45°, 상현·하현은 0(직선)이다.
 */
export function moonLitPath(phase: MoonPhase, cx: Mm, cy: Mm, r: Mm): string | null {
  if (phase === 0) return null;
  if (phase === 4) return moonOutlinePath(cx, cy, r);
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  const waxing = phase < 4; // 오른쪽이 밝다
  const k = r * Math.SQRT1_2; // 경계 타원의 가로 반지름(45°)
  // 밝은 쪽 반원: 위 → (오른쪽이면 시계 방향으로) → 아래
  const half = `M ${top} A ${r} ${r} 0 0 ${waxing ? 1 : 0} ${bottom}`;
  if (phase === 2 || phase === 6) return `${half} Z`;
  // 경계: 아래 → 위. 초승·그믐은 밝은 쪽으로 불룩(가는 달), 차가는·기우는 달은 반대쪽으로 불룩.
  const crescent = phase === 1 || phase === 7;
  const bulgeRight = waxing === crescent;
  return `${half} A ${k} ${r} 0 0 ${bulgeRight ? 0 : 1} ${top} Z`;
}

/**
 * 어두운 부분의 경로 — 화면·PDF가 칠하는 것. 보름이면 null(칠할 것이 없다).
 *
 * 위상 p의 어두운 부분은 반 바퀴 뒤(p+4)의 빛나는 부분과 모양이 같다 — 상현(오른쪽 밝음)의 어두운
 * 왼쪽 반 = 하현의 밝은 왼쪽 반, 초승달의 어두운 큰 부분 = 기우는 달의 밝은 부분.
 */
export function moonShadePath(phase: MoonPhase, cx: Mm, cy: Mm, r: Mm): string | null {
  return moonLitPath(((phase + 4) % 8) as MoonPhase, cx, cy, r);
}
