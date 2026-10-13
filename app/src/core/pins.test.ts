import { describe, expect, it } from 'vitest';
import { PIN_BOARDS, inches, pinText, titleLines } from './pins';

describe('핀 글', () => {
  it('규격을 미국에서 부르는 이름과 보드로 바꾼다', () => {
    const t = pinText({ presetId: 'M6', width: 80, height: 125, holeCount: 6 }, 1, 1);
    expect(t.title).toBe('Pocket (Mini 6) Planner Insert');
    expect(t.board).toBe(PIN_BOARDS.pocket);
    expect(t.sizeLine).toBe('Pocket (Mini 6) · 80 x 125 mm / 3.15 x 4.92 in');
    expect(pinText({ presetId: 'DA6', width: 95, height: 171, holeCount: 6 }, 1, 1).board).toBe(PIN_BOARDS.personal);
  });

  it('양식 이름이 있으면 제목·설명에 넣는다', () => {
    const t = pinText({ presetId: 'A5', width: 148, height: 210, holeCount: 6 }, 1, 1, 'Habit Tracker');
    expect(t.title).toBe('A5 Habit Tracker Planner Insert');
    expect(t.description).toContain('Printable A5 habit tracker planner insert');
  });

  it('여러 면이면 페이지 번호를 붙이고, 모르는 규격은 크기로 부른다', () => {
    const t = pinText({ presetId: 'custom', width: 100, height: 160, holeCount: 6 }, 2, 3);
    expect(t.title).toBe('100 x 160 mm Planner Insert – Page 2');
  });

  it('무료 배포처럼 들리는 말은 쓰지 않는다(아직 파일을 나눠주지 않는다)', () => {
    const t = pinText({ presetId: 'A5', width: 148, height: 210, holeCount: 6 }, 1, 1);
    expect(t.description.toLowerCase()).not.toContain('free');
  });

  it('인치는 소수 둘째 자리, 제목은 두 줄까지', () => {
    expect(inches(148)).toBe('5.83');
    expect(titleLines('Pocket (Mini 6) Planner Insert')).toEqual(['Pocket (Mini 6)', 'Planner Insert']);
    expect(titleLines('Pocket (Mini 6) Planner Insert – Page 12')).toHaveLength(2);
    expect(titleLines('A5 Planner Insert')).toEqual(['A5 Planner Insert']);
  });
});
