import { describe, expect, it } from 'vitest';
import {
  applyOverride,
  dateKey,
  diffOverride,
  emptyOverride,
  MAX_DATED_PAGES,
  periodsOf,
  periodSummary,
  suggestPerPage,
  todayPeriod,
} from './dated';
import type { DateDataset } from './dataset';
import type { DiaryObject, TextObject } from './objects';

const daily = (start: string, end: string, perPage = 1): DateDataset => ({
  kind: 'date',
  perPage,
  start,
  end,
  step: 'day',
});

const keys = (d: DateDataset, b: 'continue' | 'blank') => periodsOf(d, b).map((p) => p.key);
const datesOf = (d: DateDataset, b: 'continue' | 'blank') =>
  periodsOf(d, b).map((p) => p.dates.map((x) => (x ? dateKey(x) : null)));

describe('periodsOf', () => {
  it('데일리: 하루에 한 쪽, 쪽 이름은 그 날짜', () => {
    expect(keys(daily('2026-10-01', '2026-10-03'), 'continue')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('한 쪽에 7일 — 사용자 예시: 10/1~10/14면 2쪽', () => {
    expect(periodsOf(daily('2026-10-01', '2026-10-14', 7), 'continue')).toHaveLength(2);
  });

  it('마지막 쪽의 남는 칸은 비운다', () => {
    const out = datesOf(daily('2026-10-01', '2026-10-09', 7), 'continue');
    expect(out[1]).toEqual(['2026-10-08', '2026-10-09', null, null, null, null, null]);
  });

  describe('달이 바뀔 때 (세부계획 A4.8)', () => {
    // 31칸짜리 월간 트래커를 9월(30일)부터.
    const tracker = daily('2026-09-01', '2026-10-31', 31);

    it('이어서: 9월 쪽의 31번째 칸에 10/1', () => {
      const out = datesOf(tracker, 'continue');
      expect(out[0][30]).toBe('2026-10-01');
      expect(out[1][0]).toBe('2026-10-02');
    });

    it('공백: 9월 쪽의 31번째 칸은 비고 10월은 새 쪽', () => {
      const out = datesOf(tracker, 'blank');
      expect(out[0][29]).toBe('2026-09-30');
      expect(out[0][30]).toBeNull();
      expect(out[1][0]).toBe('2026-10-01');
      expect(out).toHaveLength(2);
    });

    it('위클리가 달을 넘으면: 공백은 9월 쪽에 9/28~9/30만', () => {
      const out = datesOf(daily('2026-09-28', '2026-10-04', 7), 'blank');
      expect(out[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null]);
      expect(out[1][0]).toBe('2026-10-01');
    });
  });

  it('쪽이 그리는 달은 첫 날짜의 달', () => {
    expect(periodsOf(daily('2026-09-28', '2026-10-04', 7), 'continue')[0].month).toEqual({ year: 2026, month: 9 });
  });

  it('달력형: 1년 12쪽, 이름은 연-월', () => {
    const out = periodsOf({ kind: 'calendar', year: 2027 }, 'continue');
    expect(out).toHaveLength(12);
    expect(out[9].key).toBe('2027-10');
    expect(out[9].month).toEqual({ year: 2027, month: 10 });
  });

  it('시작이 끝보다 뒤면 쪽이 없다', () => {
    expect(periodsOf(daily('2026-10-05', '2026-10-01'), 'continue')).toEqual([]);
  });
});

describe('todayPeriod — 기간을 정하기 전에는 오늘 날짜', () => {
  it('객체가 쓰는 가장 큰 오프셋까지 오늘부터 하루씩', () => {
    const field = (offset: number): TextObject => ({
      id: `t${offset}`,
      type: 'text',
      x: 0,
      y: 0,
      width: 10,
      height: 5,
      text: '',
      field: { offset, format: 'D' },
    });
    const p = todayPeriod({ year: 2026, month: 10, day: 30 }, [field(0), field(2)]);
    expect(p.dates.map((d) => (d ? dateKey(d) : null))).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('applyOverride — 바꾼 속성만', () => {
  const day: TextObject = { id: 't1', type: 'text', x: 0, y: 0, width: 10, height: 5, text: '10/5', size: 3 };
  const box: DiaryObject = { id: 'sh1', type: 'shape', x: 0, y: 0, width: 5, height: 5 };

  it('색만 바꾸면 날짜 글자는 그대로, 원본의 다른 속성도 그대로', () => {
    const out = applyOverride([day], { ...emptyOverride(), props: { t1: { color: '@A' } } });
    expect(out[0]).toMatchObject({ text: '10/5', size: 3, color: '@A' });
  });

  it('글자를 바꾸면 고정 글자 — field가 사라진다', () => {
    const withField: TextObject = { ...day, field: { offset: 0, format: 'M/D' } };
    const out = applyOverride([withField], { ...emptyOverride(), props: { t1: { text: '10/5 생일' } } });
    expect(out[0]).toMatchObject({ text: '10/5 생일' });
    expect((out[0] as TextObject).field).toBeUndefined();
  });

  it('지운 것은 빠지고 더한 것은 맨 위에', () => {
    const sticker: DiaryObject = { id: 'im9', type: 'image', x: 1, y: 1, width: 3, height: 3 };
    const out = applyOverride([day, box], { props: {}, added: [sticker], removed: ['sh1'] });
    expect(out.map((o) => o.id)).toEqual(['t1', 'im9']);
  });

  it('id·type은 바꿀 수 없다', () => {
    const out = applyOverride([day], { ...emptyOverride(), props: { t1: { id: 'x', type: 'line' } } });
    expect(out[0]).toMatchObject({ id: 't1', type: 'text' });
  });
});

describe('diffOverride — 옛 ‘인쇄하기에서 고친 쪽’ 옮기기', () => {
  const day: TextObject = { id: 't1', type: 'text', x: 0, y: 0, width: 10, height: 5, text: '10/5' };
  const box: DiaryObject = { id: 'sh1', type: 'shape', x: 0, y: 0, width: 5, height: 5 };

  it('달라진 속성만, 지운 것, 더한 것', () => {
    const added: DiaryObject = { id: 'l7', type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 };
    const out = diffOverride([day, box], [{ ...day, color: '#ff0000' }, added]);
    expect(out).toEqual({ props: { t1: { color: '#ff0000' } }, added: [added], removed: ['sh1'] });
  });

  it('diff를 다시 얹으면 고친 결과와 같다', () => {
    const edited = [{ ...day, color: '#ff0000', x: 3 }, box];
    expect(applyOverride([day, box], diffOverride([day, box], edited))).toEqual(edited);
  });

  it('같으면 빈 수정', () => {
    expect(diffOverride([day], [day])).toEqual(emptyOverride());
  });
});

describe('날짜로 펼치기 — 제안과 요약', () => {
  const field = (id: string, offset: number): TextObject => ({
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 10,
    height: 5,
    text: '',
    field: { offset, format: 'D' },
  });

  it('한 쪽에 며칠: 가장 큰 순번 + 1, 필드가 없으면 1', () => {
    expect(suggestPerPage([])).toBe(1);
    expect(suggestPerPage([field('a', 0), field('b', 6)])).toBe(7);
  });

  it('10월 데일리는 31장 · 10/1~10/31', () => {
    const sum = periodSummary(daily('2026-10-01', '2026-10-31'), 'continue');
    expect(sum.pages).toBe(31);
    expect(sum.first && dateKey(sum.first)).toBe('2026-10-01');
    expect(sum.last && dateKey(sum.last)).toBe('2026-10-31');
  });

  it('마지막 쪽이 덜 차면 마지막 날짜는 실제 날짜', () => {
    const sum = periodSummary(daily('2026-10-01', '2026-10-09', 7), 'continue');
    expect(sum.pages).toBe(2);
    expect(sum.last && dateKey(sum.last)).toBe('2026-10-09');
  });

  it('끝 날짜를 잘못 쳐도 다 세지 않고 너무 많다고 알린다', () => {
    const sum = periodSummary(daily('2026-01-01', '9999-12-31'), 'continue');
    expect(sum.pages).toBeGreaterThan(MAX_DATED_PAGES);
    expect(sum.first).toBeNull();
  });
});
