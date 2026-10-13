import { dayOfWeek, type CalendarDate } from './dataset';
import { fieldKindOf, type FieldSpec } from './fieldFormat';
import { isHoliday } from './holidays';
import { colorOfKey, keyOfRef, type WorkPalette } from './colors';

/**
 * 색 규칙 — ‘이런 날은 이 색’(세부계획 A13 결정 2026-10-11).
 *
 * 작업마다 한 벌이다. 색은 팔레트 이름표(`@A`)라 포인트 색을 바꾸면 규칙의 색도 따라간다.
 * **‘이 날짜는 무슨 색인가’는 여기 `dateColorOf` 하나가 정한다** — 날짜 칸(core/format)과
 * 달력 칸(화면 ui/InsertView · PDF pdf/export)이 모두 이것을 부른다.
 *
 * 우선순위: 날짜별로 직접 바꾼 색 > 공휴일 > 일요일 > 토요일 > 칸 자신의 색.
 * (날짜별 수정은 규칙을 얹은 뒤에 얹혀서 저절로 이긴다 — core/work.)
 */
export interface ColorRules {
  sunday?: string;
  saturday?: string;
  holiday?: string;
}

export type RuleKey = keyof ColorRules;

export const RULE_KEYS: RuleKey[] = ['sunday', 'saturday', 'holiday'];

/** 이 날짜에 규칙이 정한 색. 해당 없으면 undefined. */
export function dateColorOf(d: CalendarDate, rules: ColorRules | undefined): string | undefined {
  if (!rules) return undefined;
  if (rules.holiday && isHoliday(d)) return rules.holiday;
  const w = dayOfWeek(d);
  if (w === 0 && rules.sunday) return rules.sunday;
  if (w === 6 && rules.saturday) return rules.saturday;
  return undefined;
}

/**
 * 달력 머리글(요일 이름) 칸의 색 — 일요일·토요일 줄. `weekStart`가 월요일이면 일요일이
 * 맨 끝 칸이다. 공휴일은 날짜가 아니라 머리글에는 없다.
 */
export function weekdayHeaderColorOf(column: number, weekStart: 'sun' | 'mon', rules: ColorRules | undefined): string | undefined {
  if (!rules) return undefined;
  const w = weekStart === 'mon' ? (column + 1) % 7 : column;
  if (w === 0) return rules.sunday;
  if (w === 6) return rules.saturday;
  return undefined;
}

/**
 * 규칙이 적용되는 날짜 칸인가 — 날짜 하나를 보여주는 Day·Weekday 칸만. 달·해·주차·
 * 주간 범위·D-day·페이지 번호는 ‘어느 하루’가 아니라서 칠하지 않는다.
 */
export function ruleAppliesTo(field: Pick<FieldSpec, 'format' | 'kind'>): boolean {
  if (field.kind) return false;
  const kind = fieldKindOf(field);
  return kind === 'day' || kind === 'weekday';
}

/** 규칙에서 이 색(이름표)을 다른 값으로 — 팔레트에서 포인트 색을 지울 때. */
export function mapRuleColors(rules: ColorRules | undefined, map: (v: string) => string): ColorRules | undefined {
  if (!rules) return rules;
  const out: ColorRules = {};
  for (const key of RULE_KEYS) {
    const v = rules[key];
    if (v !== undefined) out[key] = map(v);
  }
  return out;
}

/** 규칙의 이름표를 실제 색으로 — 그리기 직전에(화면·PDF). 팔레트에 없는 이름표는 검정. */
export function resolveRuleColors(rules: ColorRules | undefined, palette: WorkPalette): ColorRules | undefined {
  return mapRuleColors(rules, (v) => {
    const key = keyOfRef(v);
    return key === null ? v : (colorOfKey(palette, key) ?? '#000000');
  });
}
