import { describe, expect, it } from 'vitest';
import { formatDate, resolveObjectsForPage, resolvePageObjects } from './format';
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

  // 2027-03-05는 금요일이다.
  it('요일 — 한글', () => {
    expect(formatDate(d, 'ddd')).toBe('금');
    expect(formatDate(d, 'dddd')).toBe('금요일');
  });

  it('요일 — 영어', () => {
    expect(formatDate(d, 'ddd-en')).toBe('Fri');
    expect(formatDate(d, 'dddd-en')).toBe('Friday');
  });

  it('월만', () => {
    expect(formatDate(d, 'M')).toBe('3');
    expect(formatDate(d, 'M월')).toBe('3월');
  });

  it('월 — 영어', () => {
    expect(formatDate(d, 'MMM')).toBe('MAR');
    expect(formatDate(d, 'MMMM')).toBe('March');
  });

  it('주차 — 1월 1일부터 7일씩 끊어 센다(2027-03-05는 10주차)', () => {
    expect(formatDate(d, '주차')).toBe('10주차');
    expect(formatDate(d, 'W')).toBe('W10');
    expect(formatDate(d, 'Week')).toBe('Week 10');
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

  it('text 안에 자리표시 패턴이 있으면 그 자리만 진짜 값으로 바꾸고 앞뒤 글자는 남긴다', () => {
    const mixed = { ...field(0), text: '⟨+D0⟩입니다' };
    const resolved = resolveObjectsForPage([mixed], weekly, 0);
    expect((resolved[0] as TextObject).text).toBe('1/1입니다');
  });

  describe('"몇 월"만 보여주는 서식은 오프셋이 아니라 그 쪽의 대표 달을 쓴다', () => {
    // 8/31~9/6인 쪽 — 8월 1일 + 9월 6일, 9월이 대표 달이다.
    const splitPage: Dataset = { kind: 'date', perPage: 7, start: '2027-08-31', end: '2027-12-31', step: 'day' };

    it('M 서식은 오프셋 0(8/31)이 아니라 대표 달(9월)을 보여준다', () => {
      const resolved = resolveObjectsForPage([field(0, 'M')], splitPage, 0);
      expect((resolved[0] as TextObject).text).toBe('9');
    });

    it('MMMM 서식도 마찬가지다', () => {
      const resolved = resolveObjectsForPage([field(0, 'MMMM')], splitPage, 0);
      expect((resolved[0] as TextObject).text).toBe('September');
    });

    it('날짜 하나를 짚어야 하는 다른 서식(D)은 오프셋 그대로다 — 8/31이 안 바뀐다', () => {
      const resolved = resolveObjectsForPage([field(0, 'D')], splitPage, 0);
      expect((resolved[0] as TextObject).text).toBe('31');
    });

    it('한 달에 다 걸치는 쪽은 원래대로다', () => {
      const resolved = resolveObjectsForPage([field(0, 'M월')], weekly, 0);
      expect((resolved[0] as TextObject).text).toBe('1월');
    });
  });

  describe('resolvePageObjects — 인쇄하기에서 직접 손본 페이지', () => {
    it('손본 적 없는 페이지는 지금까지처럼 자동 계산한다', () => {
      const resolved = resolvePageObjects([field(0)], weekly, 0, undefined);
      expect((resolved[0] as TextObject).text).toBe('1/1');
    });

    it('손본 페이지는 원본 양식과 무관하게 저장된 내용을 그대로 쓴다', () => {
      const saved: DiaryObject = { id: 't9', type: 'text', x: 0, y: 0, width: 5, height: 5, text: '직접 쓴 글자' };
      const resolved = resolvePageObjects([field(0)], weekly, 0, { 0: [saved] });
      expect(resolved).toEqual([saved]);
    });

    it('손본 페이지가 아니면 overrides에 다른 페이지가 있어도 자동 계산한다', () => {
      const saved: DiaryObject = { id: 't9', type: 'text', x: 0, y: 0, width: 5, height: 5, text: '0쪽만 손봄' };
      const resolved = resolvePageObjects([field(0)], weekly, 1, { 0: [saved] });
      expect((resolved[0] as TextObject).text).toBe('1/8');
    });
  });
});

describe('월간 달력 데이터셋에는 자동 필드가 없다', () => {
  // 달력은 오브젝트 하나가 스스로 채운다(10단계) — 혹시 글자에 field가 남아
  // 있어도(예: 날짜형에서 달력형으로 바꾼 직후) 조용히 빈 문자열이 된다.
  const calendar: CalendarDataset = { kind: 'calendar', year: 2027 };

  it('field가 있는 글자는 빈 문자열이 된다', () => {
    const withField: TextObject = {
      id: 'c0',
      type: 'text',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text: '자리표시였던 글자',
      field: { offset: 0, format: 'D' },
    };
    const resolved = resolveObjectsForPage([withField], calendar, 2);
    expect((resolved[0] as TextObject).text).toBe('');
    expect((resolved[0] as TextObject).field).toBeUndefined();
  });
});
