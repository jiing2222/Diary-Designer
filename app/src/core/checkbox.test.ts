import { describe, expect, it } from 'vitest';
import { checkboxIconBox, checkboxPath, iconOf } from './checkbox';
import type { CheckboxObject } from './objects';

const at = (extra: Partial<CheckboxObject> = {}): CheckboxObject => ({
  id: 'ch1',
  type: 'checkbox',
  x: 5,
  y: 3,
  width: 8.5,
  height: 8.5,
  ...extra,
});

describe('체크박스에 새겨둔 값', () => {
  it('정한 아이콘이 있으면 그것을 쓴다', () => {
    expect(iconOf(at({ icon: 'star' }))).toBe('star');
  });

  it('없으면 네모가 기본이다', () => {
    expect(iconOf(at())).toBe('square');
  });
});

describe('칸을 아이콘 상자로 줄이기 — "칸보다 조금 작게"', () => {
  it('칸보다 작다 — 네 방향 다 안쪽으로 들어간다', () => {
    const cell = { x: 5, y: 5, width: 10, height: 10 };
    const box = checkboxIconBox(cell);
    expect(box.x).toBeGreaterThan(cell.x);
    expect(box.y).toBeGreaterThan(cell.y);
    expect(box.x + box.width).toBeLessThan(cell.x + cell.width);
    expect(box.y + box.height).toBeLessThan(cell.y + cell.height);
  });

  it('칸 가운데는 그대로 유지된다 — 좌우·상하로 똑같이 줄어든다', () => {
    const cell = { x: 5, y: 5, width: 10, height: 6 };
    const box = checkboxIconBox(cell);
    expect(box.x + box.width / 2).toBeCloseTo(cell.x + cell.width / 2, 9);
    expect(box.y + box.height / 2).toBeCloseTo(cell.y + cell.height / 2, 9);
  });
});

/** 경로 문자열에서 M·L·C 뒤에 나오는 숫자를 모두 뽑아 (x, y) 쌍으로 묶는다. */
function points(path: string): { x: number; y: number }[] {
  const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

describe('아이콘 경로 — 모든 모양이 상자 범위 안에서 닫힌 도형을 낸다', () => {
  const box = { x: 5, y: 3, width: 10, height: 8 };
  const icons = ['square', 'circle', 'triangle', 'diamond', 'star', 'heart'] as const;

  it.each(icons)('%s — Z로 닫고, 모든 점이 상자 범위 안이다', (icon) => {
    const path = checkboxPath(icon, box);
    expect(path.endsWith('Z')).toBe(true);
    for (const p of points(path)) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(p.x).toBeLessThanOrEqual(box.x + box.width + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(p.y).toBeLessThanOrEqual(box.y + box.height + 1e-6);
    }
  });

  it('네모·동그라미는 도형(core/shape)의 경로를 그대로 빌린다', () => {
    // roundedRectPath(box, 0, 0)과 roundedRectPath(box, w/2, h/2)가 그대로 나온다.
    expect(checkboxPath('square', box).startsWith(`M ${box.x} ${box.y}`)).toBe(true);
    expect(checkboxPath('circle', box).startsWith(`M ${box.x + box.width / 2} ${box.y}`)).toBe(true);
  });

  it('별은 꼭짓점 10개(바깥 5 + 안쪽 5)를 잇는다', () => {
    const path = checkboxPath('star', box);
    // M 하나 + L 아홉 개 + Z = 점 10개.
    expect(path.match(/L /g)).toHaveLength(9);
  });
});
