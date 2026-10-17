import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { defaultPaperId, findInsertPreset, findPaperPreset } from './presets';

describe('용지', () => {
  it('US Letter는 8.5 × 11 in', () => {
    expect(findPaperPreset('Letter')).toMatchObject({ width: 215.9, height: 279.4 });
  });

  it('처음 용지는 브라우저 언어의 지역으로 — Letter 나라면 Letter, 아니면 A4', () => {
    expect(defaultPaperId('en-US')).toBe('Letter');
    expect(defaultPaperId('en')).toBe('Letter');
    expect(defaultPaperId('en-CA')).toBe('Letter');
    expect(defaultPaperId('en-GB')).toBe('A4');
    expect(defaultPaperId('ko-KR')).toBe('A4');
    expect(defaultPaperId('ko')).toBe('A4');
    expect(defaultPaperId('not a locale!')).toBe('A4');
  });

  it('Letter 한 장에 들어가는 속지 수(여백 0) — 미국 사용자에게 안내할 숫자', () => {
    const fit = (insertId: string) => {
      const i = findInsertPreset(insertId)!;
      return computeLayout({ paperWidth: 215.9, paperHeight: 279.4, insertWidth: i.width, insertHeight: i.height, gap: 0, printMargin: 0, allowRotate: true, align: 'topLeft' }).count;
    };
    // A5 두 장은 296mm라 Letter 긴 변(279.4)을 넘는다 — A4와 달리 한 장.
    expect([fit('A5'), fit('DA6'), fit('M6'), fit('M5')]).toEqual([1, 2, 4, 8]);
  });
});

describe('속지 규격 이름', () => {
  it('미국에서 부르는 이름 — id는 그대로', () => {
    expect(findInsertPreset('DA6')?.name).toBe('Personal');
    expect(findInsertPreset('M6')?.name).toBe('Pocket (M6)');
    expect(findInsertPreset('TA6')?.name).toBe('A6');
  });
});
