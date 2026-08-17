import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { insertSizeOf, placeSlot, unplaceSlot } from './place';

/** A4에 M6 3단접이(220 × 125). 가로가 용지보다 넓어 반드시 눕는다. */
const rotatedLayout = computeLayout({
  paperWidth: 210,
  paperHeight: 297,
  insertWidth: 220,
  insertHeight: 125,
  gap: 0,
  printMargin: 0,
  allowRotate: true,
  align: 'topLeft',
});

/** A4에 M6 4장. 눕지 않는다. */
const uprightLayout = computeLayout({
  paperWidth: 210,
  paperHeight: 297,
  insertWidth: 80,
  insertHeight: 125,
  gap: 0,
  printMargin: 0,
  allowRotate: true,
  align: 'topLeft',
});

describe('칸 안의 좌표', () => {
  it('눕지 않으면 칸 위치만큼 밀어준다', () => {
    expect(uprightLayout.rotated).toBe(false);
    const slot = uprightLayout.slots[3]; // 오른쪽 아래 칸
    const p = placeSlot(slot, false);
    expect(p.map(0, 0)).toEqual({ x: slot.x, y: slot.y });
    expect(p.map(10, 20)).toEqual({ x: slot.x + 10, y: slot.y + 20 });
  });

  it('회전 배치에서 속지 네 모서리가 칸 네 모서리로 간다', () => {
    expect(rotatedLayout.rotated).toBe(true);
    const slot = rotatedLayout.slots[0];
    const { width: w, height: h } = insertSizeOf(slot, true);
    expect({ w, h }).toEqual({ w: 220, h: 125 });

    const p = placeSlot(slot, true);
    // 속지를 왼쪽으로 눕히므로 왼쪽 위 모서리가 칸의 왼쪽 아래로 간다.
    expect(p.map(0, 0)).toEqual({ x: slot.x, y: slot.y + slot.height });
    expect(p.map(w, 0)).toEqual({ x: slot.x, y: slot.y });
    expect(p.map(0, h)).toEqual({ x: slot.x + slot.width, y: slot.y + slot.height });
    expect(p.map(w, h)).toEqual({ x: slot.x + slot.width, y: slot.y });
  });

  it('속지 안의 모든 점이 칸을 벗어나지 않는다', () => {
    for (const [layout, rotated] of [
      [uprightLayout, false],
      [rotatedLayout, true],
    ] as const) {
      for (const slot of layout.slots) {
        const { width: w, height: h } = insertSizeOf(slot, rotated);
        const p = placeSlot(slot, rotated);
        for (const u of [0, w / 3, w]) {
          for (const v of [0, h / 3, h]) {
            const { x, y } = p.map(u, v);
            expect(x).toBeGreaterThanOrEqual(slot.x);
            expect(x).toBeLessThanOrEqual(slot.x + slot.width);
            expect(y).toBeGreaterThanOrEqual(slot.y);
            expect(y).toBeLessThanOrEqual(slot.y + slot.height);
          }
        }
      }
    }
  });

  it('회전해도 거리가 변하지 않는다', () => {
    // 눕히기만 하고 늘이지 않는다. 3mm 도트 간격은 눕혀도 3mm여야 한다.
    const p = placeSlot(rotatedLayout.slots[0], true);
    const a = p.map(10, 20);
    const b = p.map(13, 20);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(3, 9);
  });

  it('화면과 PDF가 같은 변환을 쓴다', () => {
    // map()과 svg가 같은 여섯 숫자에서 나오는지 확인한다. 둘이 어긋나면
    // 인쇄물만 틀어지고 화면으로는 알아챌 수 없다.
    for (const [layout, rotated] of [
      [uprightLayout, false],
      [rotatedLayout, true],
    ] as const) {
      const slot = layout.slots[0];
      const p = placeSlot(slot, rotated);
      const [a, b, c, d, e, f] = p.svg
        .slice('matrix('.length, -1)
        .split(' ')
        .map(Number);

      for (const [u, v] of [
        [0, 0],
        [7, 11],
        [220, 125],
      ]) {
        expect(p.map(u, v)).toEqual({ x: a * u + c * v + e, y: b * u + d * v + f });
      }
    }
  });

  it('unplaceSlot은 placeSlot의 반대다 — 용지 좌표를 다시 속지 좌표로 되돌린다', () => {
    // 양식 만들기의 "용지" 보기에서 마우스로 찍은 용지 좌표를 그리기 로직이
    // 원래 받던 속지 좌표로 되돌리는 데 쓴다. 왕복(map → unplace)이 원래
    // (u, v)로 정확히 돌아와야 한다 — 어긋나면 클릭한 자리와 실제로 찍히는
    // 자리가 달라진다.
    for (const [layout, rotated] of [
      [uprightLayout, false],
      [rotatedLayout, true],
    ] as const) {
      for (const slot of layout.slots) {
        const { width: w, height: h } = insertSizeOf(slot, rotated);
        const p = placeSlot(slot, rotated);
        for (const [u, v] of [
          [0, 0],
          [w, h],
          [w / 3, h / 4],
        ]) {
          const { x, y } = p.map(u, v);
          const back = unplaceSlot(slot, rotated, x, y);
          expect(back.u).toBeCloseTo(u, 9);
          expect(back.v).toBeCloseTo(v, 9);
        }
      }
    }
  });
});
