import { describe, expect, it } from 'vitest';
import { FIELD_CHIPS, fieldValue, patchField, formatDate, formatPageNo, isMonthLevel, tileOf } from './fieldFormat';

const d = { year: 2026, month: 10, day: 5 }; // 월요일, 40주차

describe('형식 코드', () => {
  it('기능후보 7의 예시 그대로', () => {
    expect(formatDate(d, 'YYMMDD')).toBe('261005');
    expect(formatDate(d, 'YYYY.MM.DD (ddd)')).toBe('2026.10.05 (월)');
  });

  it('기호들', () => {
    expect(formatDate(d, 'YYYY')).toBe('2026');
    expect(formatDate(d, 'MMMM MMM MM M')).toBe('October OCT 10 10');
    expect(formatDate(d, 'DD D')).toBe('05 5');
    expect(formatDate(d, 'dddd ddd eeee eee')).toBe('월요일 월 Monday Mon');
    expect(formatDate(d, 'ww w')).toBe('40 40');
  });

  it('[ ] 안은 글자 그대로', () => {
    expect(formatDate(d, '[Mon] D')).toBe('Mon 5');
  });

  it('옛 형식 id도 예전과 같은 값', () => {
    expect(formatDate(d, 'ddd-en')).toBe('Mon');
    expect(formatDate(d, 'dddd-en')).toBe('Monday');
    expect(formatDate(d, '주차')).toBe('40주차');
    expect(formatDate(d, 'W')).toBe('W40');
    expect(formatDate(d, 'Week')).toBe('Week 40');
    expect(formatDate(d, 'M월 D일')).toBe('10월 5일');
  });

  it('날짜 기호가 없으면 M/D', () => {
    expect(formatDate(d, '')).toBe('10/5');
    expect(formatDate(d, '안녕')).toBe('10/5');
  });

  it('달·해만 보이는 형식', () => {
    expect(isMonthLevel('MMMM')).toBe(true);
    expect(isMonthLevel('YYYY년 M월')).toBe(true);
    expect(isMonthLevel('YYYY')).toBe(true);
    expect(isMonthLevel('M/D')).toBe(false);
    expect(isMonthLevel('주차')).toBe(false);
    expect(isMonthLevel('')).toBe(false);
  });
});

describe('필드 종류', () => {
  it('주간 범위는 연결한 날짜부터 6일 뒤까지', () => {
    expect(fieldValue({ offset: 0, format: 'M/D', kind: 'range' }, d)).toBe('10/5 – 10/11');
  });

  it('D-day: 전 D-23, 당일 D-DAY, 뒤는 D+3 또는 빈칸', () => {
    const dday = { offset: 0, format: '', kind: 'dday' as const, target: '2026-10-28' };
    expect(fieldValue(dday, d)).toBe('D-23');
    expect(fieldValue(dday, { year: 2026, month: 10, day: 28 })).toBe('D-DAY');
    expect(fieldValue(dday, { year: 2026, month: 10, day: 31 })).toBe('D+3');
    expect(fieldValue({ ...dday, after: 'blank' }, { year: 2026, month: 10, day: 31 })).toBe('');
    expect(fieldValue({ ...dday, target: undefined }, d)).toBe('');
  });

  it('페이지 번호: 자릿수·전체·시작 번호', () => {
    const page = (format: string, start?: number) => ({ offset: 0, format, kind: 'page' as const, start });
    expect(formatPageNo(page('n'), 2, 33)).toBe('3');
    expect(formatPageNo(page('nnn'), 2, 33)).toBe('003');
    expect(formatPageNo(page('p.n'), 2, 33)).toBe('p.3');
    expect(formatPageNo(page('n / N'), 2, 33)).toBe('3 / 33');
    expect(formatPageNo(page('n / N', 5), 0, 3)).toBe('5 / 7');
  });

  it('칩마다 제 타일로 돌아온다', () => {
    for (const [tile, chips] of Object.entries(FIELD_CHIPS)) {
      for (const chip of chips) expect(tileOf(chip)).toBe(tile);
    }
  });
});

describe('patchField', () => {
  it('undefined를 준 키는 지운다 — 페이지 번호 칸을 날짜 칸으로', () => {
    const page = { offset: 2, format: 'n', kind: 'page' as const, start: 5 };
    expect(patchField(page, { format: 'M/D', kind: undefined })).toEqual({ offset: 2, format: 'M/D', start: 5 });
  });
});
