import { describe, expect, it } from 'vitest';
import { dateColorOf, mapRuleColors, resolveRuleColors, ruleAppliesTo, weekdayHeaderColorOf } from './colorRules';
import { HOLIDAY_YEARS, holidayCovered, isHoliday } from './holidays';
import { defaultWorkPalette } from './colors';
import { expandWork, newWork, type PageItem } from './work';

const rules = { sunday: '@B', saturday: '@A', holiday: '@C' };

describe('미국 공휴일(규칙으로 계산)', () => {
  const us = (year: number, month: number, day: number) => isHoliday({ year, month, day }, 'us');
  it('요일로 정해지는 날 — 2026년', () => {
    expect([us(2026, 1, 19), us(2026, 2, 16), us(2026, 5, 25), us(2026, 9, 7), us(2026, 10, 12), us(2026, 11, 26)]).toEqual([
      true, true, true, true, true, true,
    ]);
  });
  it('해가 바뀌면 같이 움직인다 — 2027년 메모리얼(5/31)·추수감사절(11/25)', () => {
    expect([us(2027, 5, 31), us(2027, 11, 25), us(2027, 11, 26)]).toEqual([true, true, false]);
  });
  it('날짜가 고정인 날, 그리고 한국 공휴일은 아니다', () => {
    expect([us(2030, 1, 1), us(2030, 6, 19), us(2030, 7, 4), us(2030, 11, 11), us(2030, 12, 25)]).toEqual([true, true, true, true, true]);
    expect(us(2026, 10, 3)).toBe(false); // 개천절
    expect(holidayCovered(2099, 'us')).toBe(true);
  });
  it('그리기 전에 색을 바꿔도 나라는 남는다', () => {
    expect(resolveRuleColors({ holiday: '@A', holidays: 'us' }, defaultWorkPalette())?.holidays).toBe('us');
  });
    it('따로 색을 지닌 페이지도 공휴일 나라는 작업 것을 따른다', () => {
    const w = newWork({ name: 'w', diaryId: 'd', now: '' });
    const page = { ...(w.items[0] as PageItem), colorRules: { holiday: '#f00', holidays: 'kr' as const } };
    const faces = expandWork({ items: [page], colorRules: { holidays: 'us' } }, { year: 2026, month: 1, day: 1 });
    expect(faces[0].colorRules).toEqual({ holiday: '#f00', holidays: 'us' });
  });
    it('규칙의 나라를 따른다 — 없으면 한국', () => {
    const rules = { holiday: '#f00' };
    expect(dateColorOf({ year: 2026, month: 10, day: 3 }, rules)).toBe('#f00');
    expect(dateColorOf({ year: 2026, month: 10, day: 3 }, { ...rules, holidays: 'us' })).toBeUndefined();
    expect(dateColorOf({ year: 2026, month: 11, day: 26 }, { ...rules, holidays: 'us' })).toBe('#f00');
  });
});

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

describe('달력 머리글 칠하기 선택(2026-10-13)', () => {
  it('plainHeaders면 머리글은 칠하지 않고 날짜 칸은 그대로, 색을 풀어도 선택은 남는다', () => {
    const rules = { sunday: '#ff0000', plainHeaders: true };
    expect(weekdayHeaderColorOf(0, 'sun', rules)).toBeUndefined();
    expect(weekdayHeaderColorOf(0, 'sun', { sunday: '#ff0000' })).toBe('#ff0000');
    expect(dateColorOf({ year: 2026, month: 10, day: 11 }, rules)).toBe('#ff0000');
    expect(mapRuleColors(rules, (v) => v)).toEqual(rules);
  });
});
