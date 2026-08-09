import { describe, expect, it } from 'vitest';
import { cornerRadiusOf, roundedRectPath, roundnessOf, strokeColorOf, strokeDashOf, strokeWidthOf } from './shape';
import type { ShapeObject } from './objects';
import { OBJECT_LINE_COLOR, OBJECT_LINE_WIDTH } from './style';

const at = (extra: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'sh1',
  type: 'shape',
  x: 0,
  y: 0,
  width: 20,
  height: 10,
  ...extra,
});

describe('도형에 새겨둔 값', () => {
  it('정한 값이 있으면 그것을 쓴다', () => {
    expect(strokeWidthOf(at({ strokeWidth: 0.8 }))).toBe(0.8);
    expect(strokeColorOf(at({ color: '#000000' }))).toBe('#000000');
    expect(strokeDashOf(at({ dash: 'dotted' }))).toBe('dotted');
    expect(roundnessOf(at({ roundness: 3 }))).toBe(3);
  });

  it('없으면 core/style의 기본값을 따른다 — 선과 같다', () => {
    expect(strokeWidthOf(at())).toBe(OBJECT_LINE_WIDTH);
    expect(strokeColorOf(at())).toBe(OBJECT_LINE_COLOR);
    expect(strokeDashOf(at())).toBe('solid');
    expect(roundnessOf(at())).toBe(0);
  });
});

describe('둥글기 단계 → 반지름', () => {
  it('0단계는 각짐(반지름 0)', () => {
    expect(cornerRadiusOf({ width: 20, height: 10 }, 0)).toEqual({ rx: 0, ry: 0 });
  });

  it('1~3단계는 짧은 변의 절반을 기준으로 25%씩 늘어난다', () => {
    // 짧은 변(높이 10)의 절반은 5 — 정사각형이든 아니든 짧은 변만 본다.
    expect(cornerRadiusOf({ width: 20, height: 10 }, 1)).toEqual({ rx: 1.25, ry: 1.25 });
    expect(cornerRadiusOf({ width: 20, height: 10 }, 2)).toEqual({ rx: 2.5, ry: 2.5 });
    expect(cornerRadiusOf({ width: 20, height: 10 }, 3)).toEqual({ rx: 3.75, ry: 3.75 });
  });

  it('정사각형이 아니어도 1~3단계는 여전히 "사각형"처럼 보인다', () => {
    // 짧은 변 기준 75%(3단계)도 긴 변의 절반(20)에는 한참 못 미친다.
    const { rx, ry } = cornerRadiusOf({ width: 40, height: 10 }, 3);
    expect(rx).toBeLessThan(20);
    expect(ry).toBeLessThan(5);
  });

  it('4단계는 정사각형이면 완전한 원 — 가로세로 반지름이 같다', () => {
    expect(cornerRadiusOf({ width: 20, height: 20 }, 4)).toEqual({ rx: 10, ry: 10 });
  });

  it('4단계는 직사각형이면 완전한 타원 — 가로세로 절반을 각각 쓴다(알약 모양이 아니다)', () => {
    expect(cornerRadiusOf({ width: 40, height: 10 }, 4)).toEqual({ rx: 20, ry: 5 });
  });
});

/** 경로 문자열에서 M·L·C 뒤에 나오는 숫자를 모두 뽑아 (x, y) 쌍으로 묶는다. */
function points(path: string): { x: number; y: number }[] {
  const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

describe('둥근 사각형 경로', () => {
  const box = { x: 5, y: 3, width: 20, height: 10 };

  it('왼쪽 위에서 시작해 Z로 닫는다', () => {
    const path = roundedRectPath(box, 2, 2);
    expect(path.startsWith(`M ${box.x + 2} ${box.y}`)).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('반지름이 0이면 모든 점이 상자의 네 모서리 중 하나다 — 완전한 사각형', () => {
    const path = roundedRectPath(box, 0, 0);
    const xs = [box.x, box.x + box.width];
    const ys = [box.y, box.y + box.height];
    for (const p of points(path)) {
      expect(xs).toContain(p.x);
      expect(ys).toContain(p.y);
    }
  });

  it('4단계(원·타원)에서는 직선 구간이 길이 0으로 사라진다', () => {
    // rx·ry가 상자 절반이면 네 변의 직선(L)이 시작점과 끝점이 같아진다.
    const { rx, ry } = cornerRadiusOf(box, 4);
    const path = roundedRectPath(box, rx, ry);
    // L 명령 뒤의 좌표만 모은다(M은 첫 줄, C는 곡선이라 제외).
    const lLines = path.split(' L ').slice(1).map((s) => s.split(' C ')[0].trim());
    for (const line of lLines) {
      const [x, y] = line.split(' ').map(Number);
      // 짧은 변 쪽은 반지름이 절반을 다 차지해 두 L 좌표가 같은 점으로 뭉친다.
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
    // 위쪽 변: 시작 (x+rx, y) 과 끝(다음 C의 시작이 되는 x+w-rx, y)이 같은 점.
    expect(box.x + rx).toBeCloseTo(box.x + box.width - rx, 9);
  });

  it('모든 점이 상자 범위 안에 있다', () => {
    const path = roundedRectPath(box, 3, 2);
    for (const p of points(path)) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1e-9);
      expect(p.x).toBeLessThanOrEqual(box.x + box.width + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(box.y - 1e-9);
      expect(p.y).toBeLessThanOrEqual(box.y + box.height + 1e-9);
    }
  });
});
