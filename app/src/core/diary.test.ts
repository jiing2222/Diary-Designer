import { describe, expect, it } from 'vitest';
import { diaryFromPreset, diarySizeLabel, nearestPreset, nextDiaryColor, samePaper, DIARY_COLORS } from './diary';

describe('nearestPreset — ±10mm면 같은 규격', () => {
  it('정확히 같으면 그 규격', () => {
    expect(nearestPreset(80, 125)?.id).toBe('M6');
  });

  it('75×125도 M6다 (사용자 예시)', () => {
    expect(nearestPreset(75, 125)?.id).toBe('M6');
  });

  it('세로가 10mm 넘게 다르면 아니다', () => {
    expect(nearestPreset(80, 136)).toBeNull();
  });

  it('여럿이 걸리면 더 가까운 쪽', () => {
    // 62×105는 M5. M6(80×125)는 허용 오차 밖이라 애초에 후보가 아니다.
    expect(nearestPreset(64, 107)?.id).toBe('M5');
  });
});

describe('diarySizeLabel', () => {
  it('규격과 같으면 규격 이름만', () => {
    expect(diarySizeLabel({ width: 148, height: 210 })).toBe('A5');
  });

  it('조금 다르면 규격 이름과 실측', () => {
    expect(diarySizeLabel({ width: 80, height: 126 })).toBe('M6 (미니6) · 80×126');
  });

  it('어느 규격에도 가깝지 않으면 실측만', () => {
    expect(diarySizeLabel({ width: 300, height: 300 })).toBe('300×300');
  });
});

describe('diaryFromPreset', () => {
  it('규격의 크기와 구멍을 채운다', () => {
    const d = diaryFromPreset('d1', 'A5', '업무용', '#000000');
    expect(d).toMatchObject({ id: 'd1', name: '업무용', presetId: 'A5', width: 148, height: 210 });
    expect(d.punch.holeCount).toBe(6);
  });
});

describe('nextDiaryColor', () => {
  it('안 쓴 색부터', () => {
    expect(nextDiaryColor([DIARY_COLORS[0]])).toBe(DIARY_COLORS[1]);
  });

  it('다 쓰면 처음부터 돈다', () => {
    expect(nextDiaryColor([...DIARY_COLORS])).toBe(DIARY_COLORS[0]);
  });
});

describe('samePaper', () => {
  it('화면 표시용 값은 무시한다', () => {
    const a = diaryFromPreset('a', 'M6', 'a', '#000');
    const b = { ...a, punch: { ...a.punch, show: false, markSize: 9 } };
    expect(samePaper(a, b)).toBe(true);
  });

  it('세로가 다르면 다른 종이', () => {
    const a = diaryFromPreset('a', 'M6', 'a', '#000');
    expect(samePaper(a, { ...a, height: 126 })).toBe(false);
  });
});
