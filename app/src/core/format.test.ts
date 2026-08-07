import { describe, expect, it } from 'vitest';
import { formatDate, resolveObjectsForPage } from './format';
import { parseDate, type CalendarDataset, type Dataset } from './dataset';
import type { DiaryObject, TextObject } from './objects';

describe('날짜 서식', () => {
  const d = parseDate('2027-03-05');

  it('D — 일만', () => {
    expect(formatDate(d, 'D')).toBe('5');
  });

  it('M/D — 월/일', () => {
    expect(formatDate(d, 'M/D')).toBe('3/5');
  });

  it('M월 D일', () => {
    expect(formatDate(d, 'M월 D일')).toBe('3월 5일');
  });

  it('YYYY-MM-DD — 두 자리로 채운다', () => {
    expect(formatDate(d, 'YYYY-MM-DD')).toBe('2027-03-05');
  });

  it('YYYY년 M월 — 월 제목용', () => {
    expect(formatDate(d, 'YYYY년 M월')).toBe('2027년 3월');
  });

  it('모르는 서식이면 M/D로 대신한다', () => {
    expect(formatDate(d, '이상한값')).toBe(formatDate(d, 'M/D'));
  });
});

describe('쪽의 자동 필드 채우기', () => {
  const weekly: Dataset = {
    kind: 'date',
    perPage: 7,
    start: '2027-01-01',
    end: '2027-12-31',
    step: 'day',
  };

  const field = (offset: number, format = 'M/D'): TextObject => ({
    id: `f${offset}`,
    type: 'text',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: '자리표시였던 글자',
    field: { offset, format },
  });

  it('오프셋마다 그 쪽의 날짜로 채운다', () => {
    const resolved = resolveObjectsForPage([field(0), field(6)], weekly, 0);
    expect((resolved[0] as TextObject).text).toBe('1/1');
    expect((resolved[1] as TextObject).text).toBe('1/7');
  });

  it('다음 쪽은 다음 날짜부터다', () => {
    const resolved = resolveObjectsForPage([field(0)], weekly, 1);
    expect((resolved[0] as TextObject).text).toBe('1/8');
  });

  it('채운 뒤에는 field가 없다 — displayText가 자리표시로 되돌리지 않는다', () => {
    const resolved = resolveObjectsForPage([field(0)], weekly, 0);
    expect((resolved[0] as TextObject).field).toBeUndefined();
  });

  it('필드가 아닌 글자·선은 그대로 둔다', () => {
    const plain: TextObject = { id: 't1', type: 'text', x: 0, y: 0, width: 5, height: 5, text: '제목' };
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    const resolved = resolveObjectsForPage([plain, line], weekly, 0);
    expect(resolved).toEqual([plain, line]);
  });

  it('데이터가 모자란 쪽·오프셋은 빈 문자열이다', () => {
    // 365일 ÷ 7 = 52주 + 1일 → 52번(0부터) 쪽은 오프셋 0만 있고 1은 없다.
    const resolved = resolveObjectsForPage([field(1)], weekly, 52);
    expect((resolved[0] as TextObject).text).toBe('');
  });

  it('굵기·색 같은 다른 값은 그대로 물려받는다', () => {
    const bold = { ...field(0), bold: true, color: '#ff0000' };
    const resolved = resolveObjectsForPage([bold], weekly, 0);
    expect((resolved[0] as TextObject).bold).toBe(true);
    expect((resolved[0] as TextObject).color).toBe('#ff0000');
  });
});

describe('월간 달력 쪽의 자동 필드 채우기', () => {
  const calendar: CalendarDataset = { kind: 'calendar', year: 2027, weekStart: 'sun', showAdjacent: true };
  const hideAdjacent: CalendarDataset = { ...calendar, showAdjacent: false };

  const cell = (offset: number, format = 'D'): TextObject => ({
    id: `c${offset}`,
    type: 'text',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: '자리표시였던 글자',
    field: { offset, format },
  });

  const title = (format = 'YYYY년 M월'): TextObject => ({
    id: 'title',
    type: 'text',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: '자리표시였던 글자',
    field: { offset: 0, format, title: true },
  });

  it('그리드 칸은 오프셋이 가리키는 날짜의 일(day)을 보여준다', () => {
    // 3월(page=2), 일요일 시작: 칸1이 3/1이다.
    const resolved = resolveObjectsForPage([cell(1)], calendar, 2);
    expect((resolved[0] as TextObject).text).toBe('1');
  });

  it('지난달 칸도 showAdjacent가 켜져 있으면 날짜를 보여준다', () => {
    const resolved = resolveObjectsForPage([cell(0)], calendar, 2);
    expect((resolved[0] as TextObject).text).toBe('28'); // 2/28
  });

  it('showAdjacent를 끄면 이번 달이 아닌 칸은 빈 문자열이다', () => {
    const resolved = resolveObjectsForPage([cell(0)], hideAdjacent, 2);
    expect((resolved[0] as TextObject).text).toBe('');
  });

  it('title 필드는 오프셋과 무관하게 그 쪽의 달을 보여준다', () => {
    const resolved = resolveObjectsForPage([title()], calendar, 2);
    expect((resolved[0] as TextObject).text).toBe('2027년 3월');
  });

  it('title 필드도 채운 뒤에는 field가 없다', () => {
    const resolved = resolveObjectsForPage([title()], calendar, 2);
    expect((resolved[0] as TextObject).field).toBeUndefined();
  });
});
