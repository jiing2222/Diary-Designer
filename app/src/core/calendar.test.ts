import { describe, expect, it } from 'vitest';
import {
  calendarLayout,
  letterSpacingOf,
  rowScaleOf,
  showAdjacentOf,
  sizeScaleOf,
  titleOf,
  weekdayLabels,
  weekdayLangOf,
  weekStartOf,
} from './calendar';
import type { CalendarObject } from './objects';

describe('달력 오브젝트 기하 계산', () => {
  // 8행(제목+요일머리글+6주) × 7열이라 딱 떨어지게 70×80을 쓴다.
  const layout = calendarLayout({ width: 70, height: 80 });
  const rowHeight = 80 / 8; // 10
  const colWidth = 70 / 7; // 10

  it('글자 크기는 한 줄 높이의 절반이다', () => {
    expect(layout.fontSize).toBe(rowHeight / 2);
  });

  it('제목은 가로 한가운데, 맨 위 줄에 앉는다', () => {
    expect(layout.title.cx).toBe(35);
  });

  it('요일 머리글은 7칸으로 고르게 나뉜다', () => {
    expect(layout.weekdays).toHaveLength(7);
    expect(layout.weekdays[0].cx).toBe(colWidth / 2);
    for (let i = 1; i < 7; i++) {
      expect(layout.weekdays[i].cx - layout.weekdays[i - 1].cx).toBeCloseTo(colWidth, 6);
    }
  });

  it('날짜 칸은 42개, 6행×7열이다', () => {
    expect(layout.days).toHaveLength(42);
  });

  it('같은 열의 날짜 칸은 요일 머리글과 가로로 같은 자리다', () => {
    for (let col = 0; col < 7; col++) {
      expect(layout.days[col].cx).toBe(layout.weekdays[col].cx);
    }
  });

  it('한 줄 내려갈 때마다 밑선이 줄 높이만큼 내려간다', () => {
    // 제목 → 요일 머리글
    expect(layout.weekdays[0].baseline - layout.title.baseline).toBeCloseTo(rowHeight, 6);
    // 요일 머리글 → 날짜 첫째 줄
    expect(layout.days[0].baseline - layout.weekdays[0].baseline).toBeCloseTo(rowHeight, 6);
    // 날짜 줄끼리
    for (let row = 1; row < 6; row++) {
      const prev = layout.days[(row - 1) * 7].baseline;
      const cur = layout.days[row * 7].baseline;
      expect(cur - prev).toBeCloseTo(rowHeight, 6);
    }
  });

  it('박스가 커지면 글자도 커진다', () => {
    const bigger = calendarLayout({ width: 140, height: 160 });
    expect(bigger.fontSize).toBe(layout.fontSize * 2);
  });

  it('sizeScale을 주면 그 배율만큼 글자가 커지거나 작아진다 — 줄 자체는 그대로다', () => {
    const scaled = calendarLayout({ width: 70, height: 80, sizeScale: 1.2 });
    expect(scaled.fontSize).toBeCloseTo(layout.fontSize * 1.2, 9);
    // 가로 자리(cx)는 글자 크기와 무관해 그대로다. 세로 밑선은 글자
    // 크기에 맞춰 그 줄 안에서 다시 가운데 잡히므로 살짝 움직인다 —
    // 그래도 같은 줄(rowHeight) 안에서다.
    expect(scaled.title.cx).toBe(layout.title.cx);
    expect(scaled.days[0].baseline - layout.days[0].baseline).toBeLessThan(rowHeight);
  });

  it('rowScale은 글자 크기와 무관하게 줄 사이 간격만 바꾼다', () => {
    const spaced = calendarLayout({ width: 70, height: 80, rowScale: 2 });
    expect(spaced.fontSize).toBe(layout.fontSize); // 글자 크기는 그대로
    expect(spaced.weekdays[0].baseline - spaced.title.baseline).toBeCloseTo(rowHeight * 2, 6);
  });

  it('rowScale이 1이 아니면 격자 전체가 상자 안에서 위아래 가운데로 맞춰진다', () => {
    // rowScale=1일 때 제목 줄의 밑선 자리(rowHeight 안에서 가운데)를 기준으로,
    // 격자가 커지거나 작아진 만큼 위쪽 여백이 똑같이 움직여야 한다.
    const bigger = calendarLayout({ width: 70, height: 80, rowScale: 2 });
    const smaller = calendarLayout({ width: 70, height: 80, rowScale: 0.5 });
    // 전체 격자 높이가 상자보다 커지면(rowScale 2 → 160mm > 80mm) 첫 줄이
    // 상자 위쪽 바깥으로 나가고, 작아지면(rowScale 0.5 → 40mm < 80mm)
    // 첫 줄이 상자 안쪽으로 들어온다.
    expect(bigger.title.baseline).toBeLessThan(layout.title.baseline);
    expect(smaller.title.baseline).toBeGreaterThan(layout.title.baseline);
  });
});

describe('요일 이름', () => {
  it('일요일 시작 — 한글', () => {
    expect(weekdayLabels('kr', 'sun')).toEqual(['일', '월', '화', '수', '목', '금', '토']);
  });

  it('월요일 시작 — 한글', () => {
    expect(weekdayLabels('kr', 'mon')).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  });

  it('일요일 시작 — 영어', () => {
    expect(weekdayLabels('en', 'sun')).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('일요일 시작 — 한자', () => {
    expect(weekdayLabels('hanja', 'sun')).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });

  it('월요일 시작 — MTWTFSS(한 글자씩, 겹치는 글자는 자리로 구분)', () => {
    expect(weekdayLabels('en-short', 'mon')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('일요일 시작 — SMTWTFS', () => {
    expect(weekdayLabels('en-short', 'sun')).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });
});

describe('달력 오브젝트 속성 기본값', () => {
  const bare: CalendarObject = { id: 'c1', type: 'calendar', x: 0, y: 0, width: 70, height: 80 };

  it('정하지 않았으면 일요일 시작·이전달 표시 끔·한글·배율 1이다', () => {
    expect(weekStartOf(bare)).toBe('sun');
    expect(showAdjacentOf(bare)).toBe(false);
    expect(weekdayLangOf(bare)).toBe('kr');
    expect(sizeScaleOf(bare)).toBe(1);
    expect(rowScaleOf(bare)).toBe(1);
    expect(letterSpacingOf(bare)).toBe(0);
  });

  it('정한 값이 있으면 그대로 쓴다', () => {
    const custom: CalendarObject = {
      ...bare,
      weekStart: 'mon',
      showAdjacent: false,
      weekdayLang: 'en',
      sizeScale: 1.3,
      rowScale: 1.5,
      letterSpacing: 0.5,
    };
    expect(weekStartOf(custom)).toBe('mon');
    expect(showAdjacentOf(custom)).toBe(false);
    expect(weekdayLangOf(custom)).toBe('en');
    expect(sizeScaleOf(custom)).toBe(1.3);
    expect(rowScaleOf(custom)).toBe(1.5);
    expect(letterSpacingOf(custom)).toBe(0.5);
  });
});

describe('달 제목', () => {
  const bare: CalendarObject = { id: 'c1', type: 'calendar', x: 0, y: 0, width: 70, height: 80 };

  it('정하지 않았으면 연·월에서 자동으로 만든다', () => {
    expect(titleOf(bare, 2026, 7)).toBe('2026년 8월'); // page는 0부터(7 = 8월)
  });

  it('정해뒀으면(빈 문자열 아니면) 그 글자 그대로다 — 달이 바뀌어도 안 바뀐다', () => {
    const custom: CalendarObject = { ...bare, title: 'AUGUST' };
    expect(titleOf(custom, 2026, 7)).toBe('AUGUST');
    expect(titleOf(custom, 2027, 0)).toBe('AUGUST'); // 다른 해·다른 달이어도 그대로
  });

  it('빈 문자열이면 빈 문자열 그대로다 — 뷰가 이걸 보고 제목 줄을 안 그린다', () => {
    const hidden: CalendarObject = { ...bare, title: '' };
    expect(titleOf(hidden, 2026, 7)).toBe('');
  });
});
