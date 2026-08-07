import { describe, expect, it } from 'vitest';
import { calendarLayout, weekdayLabels } from './calendar';

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
});
