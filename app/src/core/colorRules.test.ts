import { describe, expect, it } from 'vitest';
import { dateColorOf, mapRuleColors, resolveRuleColors, ruleAppliesTo, weekdayHeaderColorOf } from './colorRules';
import { HOLIDAY_YEARS, holidayCovered, isHoliday } from './holidays';
import { defaultWorkPalette } from './colors';

const rules = { sunday: '@B', saturday: '@A', holiday: '@C' };

describe('공휴일', () => {
  it('2026·2027 목록 — 대체공휴일 포함', () => {
    expect(HOLIDAY_YEARS).toEqual([2026, 2027]);
    expect(isHoliday({ year: 2026, month: 10, day: 5 })).toBe(true); // 대체공휴일(개천절)
    expect(isHoliday({ year: 2027, month: 2, day: 9 })).toBe(true); // 대체공휴일(설날)
    expect(isHoliday({ year: 2026, month: 10, day: 6 })).toBe(false);
    expect(holidayCovered(2028)).toBe(false);
  });
});

describe('dateColorOf', () => {
  it('공휴일 > 일요일 > 토요일', () => {
    expect(dateColorOf({ year: 2026, month: 10, day: 3 }, rules)).toBe('@C'); // 개천절(토)
    expect(dateColorOf({ year: 2026, month: 10, day: 11 }, rules)).toBe('@B'); // 일
    expect(dateColorOf({ year: 2026, month: 10, day: 10 }, rules)).toBe('@A'); // 토
    expect(dateColorOf({ year: 2026, month: 10, day: 7 }, rules)).toBeUndefined(); // 수
  });

  it('공휴일 규칙이 없으면 공휴일인 토요일은 토요일 색', () => {
    expect(dateColorOf({ year: 2026, month: 10, day: 3 }, { saturday: '@A' })).toBe('@A');
  });

  it('규칙이 없으면 아무 색도 없다', () => {
    expect(dateColorOf({ year: 2026, month: 10, day: 11 }, undefined)).toBeUndefined();
  });
});

describe('달력 머리글', () => {
  it('일요일 시작이면 첫·마지막 칸, 월요일 시작이면 마지막 두 칸', () => {
    expect(weekdayHeaderColorOf(0, 'sun', rules)).toBe('@B');
    expect(weekdayHeaderColorOf(6, 'sun', rules)).toBe('@A');
    expect(weekdayHeaderColorOf(5, 'mon', rules)).toBe('@A');
    expect(weekdayHeaderColorOf(6, 'mon', rules)).toBe('@B');
    expect(weekdayHeaderColorOf(2, 'mon', rules)).toBeUndefined();
  });
});

describe('규칙이 적용되는 칸', () => {
  it('Day·Weekday만', () => {
    expect(ruleAppliesTo({ format: 'M/D' })).toBe(true);
    expect(ruleAppliesTo({ format: 'dddd' })).toBe(true);
    expect(ruleAppliesTo({ format: 'MMMM' })).toBe(false);
    expect(ruleAppliesTo({ format: '주차' })).toBe(false);
    expect(ruleAppliesTo({ format: 'M/D', kind: 'range' })).toBe(false);
    expect(ruleAppliesTo({ format: 'n', kind: 'page' })).toBe(false);
  });
});

describe('규칙의 색 바꾸기·풀기', () => {
  it('이름표를 실제 색으로, 지운 포인트는 주어진 색으로', () => {
    const palette = { ...defaultWorkPalette(), points: [{ key: 'A', color: '#8ea8c6' }] };
    expect(resolveRuleColors({ saturday: '@A', sunday: '#ff0000' }, palette)).toEqual({ saturday: '#8ea8c6', sunday: '#ff0000' });
    expect(mapRuleColors({ saturday: '@A' }, (v) => (v === '@A' ? '#123456' : v))).toEqual({ saturday: '#123456' });
  });
});
