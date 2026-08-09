import { describe, expect, it } from 'vitest';
import { computeLayout, mirrorLayout } from './layout';
import { holeCenterX, holeCentersY, logoSlotAreas, suggestGroupGap, type PunchSetting } from './punch';
import { INSERT_PRESETS } from './presets';

const punch = (holeCount: number, groupGap: number | null, markSize: number): PunchSetting => ({
  show: true,
  safeZoneWidth: 10,
  edgeToHole: 3,
  offsetY: 0,
  holeCount,
  groupGap,
  markSize,
});

describe('자동 배치', () => {
  const base = { gap: 0, printMargin: 5, allowRotate: true, align: 'center' as const };

  it('A4에 M6를 4개 넣는다', () => {
    const l = computeLayout({
      ...base,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    expect(l.count).toBe(4);
    expect(l.cols).toBe(2);
    expect(l.rows).toBe(2);
  });

  it('배치된 덩어리를 용지 가운데에 놓는다', () => {
    const l = computeLayout({
      ...base,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    expect(l.slots[0].x).toBeCloseTo((210 - 160) / 2, 6);
    expect(l.slots[0].y).toBeCloseTo((297 - 250) / 2, 6);

    const last = l.slots[l.slots.length - 1];
    expect(210 - (last.x + last.width)).toBeCloseTo(l.slots[0].x, 6);
  });

  it('좌측 상단 정렬은 여백 자리에 바로 붙인다', () => {
    // 오른쪽과 아래만 자르면 되도록. 재단 횟수가 사방 네 번에서 두 번으로 준다.
    const l = computeLayout({
      ...base,
      align: 'topLeft',
      printMargin: 0,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    expect(l.slots[0].x).toBe(0);
    expect(l.slots[0].y).toBe(0);

    // 여백이 있으면 그 안쪽 모서리에 붙는다
    const inset = computeLayout({
      ...base,
      align: 'topLeft',
      printMargin: 5,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    expect(inset.slots[0].x).toBe(5);
    expect(inset.slots[0].y).toBe(5);
  });

  it('정렬을 바꿔도 들어가는 개수는 같다', () => {
    const size = { paperWidth: 210, paperHeight: 297, insertWidth: 80, insertHeight: 125 };
    const centered = computeLayout({ ...base, ...size, align: 'center' });
    const topLeft = computeLayout({ ...base, ...size, align: 'topLeft' });
    expect(topLeft.count).toBe(centered.count);
  });

  it('돌려서 더 많이 들어가면 돌린다', () => {
    // 세로로 두면 1개, 눕히면 2개가 들어가는 크기
    const upright = computeLayout({
      ...base,
      allowRotate: false,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 140,
      insertHeight: 100,
    });
    const rotated = computeLayout({
      ...base,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 140,
      insertHeight: 100,
    });
    expect(rotated.count).toBeGreaterThan(upright.count);
    expect(rotated.rotated).toBe(true);
  });

  it('속지가 용지보다 크면 0개', () => {
    const l = computeLayout({
      ...base,
      allowRotate: false,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 300,
      insertHeight: 400,
    });
    expect(l.count).toBe(0);
  });

  it('간격을 주면 개수가 줄어든다', () => {
    // 회전을 끈 상태로 본다. 회전이 켜져 있으면 눕혀서 개수를 지켜낼 수도 있다.
    const size = { paperWidth: 210, paperHeight: 297, insertWidth: 100, insertHeight: 145 };
    const tight = computeLayout({ ...base, ...size, allowRotate: false });
    const loose = computeLayout({ ...base, ...size, allowRotate: false, gap: 10 });
    expect(tight.count).toBe(2);
    expect(loose.count).toBe(1);
  });

  it('돌리면 살아나는 배치를 놓치지 않는다', () => {
    const size = { paperWidth: 210, paperHeight: 297, insertWidth: 100, insertHeight: 145 };
    const fixed = computeLayout({ ...base, ...size, allowRotate: false, gap: 10 });
    const free = computeLayout({ ...base, ...size, allowRotate: true, gap: 10 });
    expect(free.count).toBeGreaterThan(fixed.count);
  });
});

describe('양면 배치 — 칸 뒤집기', () => {
  const base = { gap: 2, printMargin: 5, allowRotate: false, align: 'topLeft' as const };

  it('회전 배치가 아니면 x만 뒤집고 y·크기는 그대로다', () => {
    const front = computeLayout({
      ...base,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    expect(front.rotated).toBe(false);
    const back = mirrorLayout(front, 210, 297);

    front.slots.forEach((s, i) => {
      const b = back.slots[i];
      expect(b.x).toBeCloseTo(210 - s.x - s.width, 6);
      expect(b.y).toBe(s.y);
      expect(b.width).toBe(s.width);
      expect(b.height).toBe(s.height);
    });
  });

  it('회전 배치면 y만 뒤집고 x·크기는 그대로다', () => {
    // M5(62×105)는 A4에서 실제로 회전 배치가 된다 — M6은 안 눕고 M5는 눕는다.
    const front = computeLayout({
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 62,
      insertHeight: 105,
      gap: 0,
      printMargin: 0,
      allowRotate: true,
      align: 'center',
    });
    expect(front.rotated).toBe(true);
    const back = mirrorLayout(front, 210, 297);

    front.slots.forEach((s, i) => {
      const b = back.slots[i];
      expect(b.x).toBe(s.x);
      expect(b.y).toBeCloseTo(297 - s.y - s.height, 6);
      expect(b.width).toBe(s.width);
      expect(b.height).toBe(s.height);
    });
  });

  it('칸 수·회전 여부는 그대로 물려받는다', () => {
    const front = computeLayout({
      ...base,
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    const back = mirrorLayout(front, 210, 297);
    expect(back.count).toBe(front.count);
    expect(back.cols).toBe(front.cols);
    expect(back.rows).toBe(front.rows);
    expect(back.rotated).toBe(front.rotated);
  });

  it('용지 가운데 놓인 배치는 뒤집어도 같은 자리다', () => {
    // 좌우 대칭인 가운데 정렬에서는 뒤집어도 칸의 집합이 그대로여야 한다.
    const front = computeLayout({
      gap: 2,
      printMargin: 5,
      allowRotate: false,
      align: 'center',
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 80,
      insertHeight: 125,
    });
    const back = mirrorLayout(front, 210, 297);
    const xs = (l: typeof front) => [...new Set(l.slots.map((s) => s.x))].sort((a, b) => a - b);
    expect(xs(back)).toEqual(xs(front).map((x) => expect.closeTo(x, 6)));
  });

  it('M5(62×105)는 A4에서 실제로 회전 배치가 된다', () => {
    // 이 사실 자체가 버그의 전제다 — M6은 안 눕고 M5는 눕는다.
    const layout = computeLayout({
      paperWidth: 210,
      paperHeight: 297,
      insertWidth: 62,
      insertHeight: 105,
      gap: 0,
      printMargin: 0,
      allowRotate: true,
      align: 'center',
    });
    expect(layout.rotated).toBe(true);
  });
});

describe('구멍 가로 좌표 — 뒷면 뒤집기', () => {
  const p = punch(6, null, 4); // edgeToHole 3, markSize 4 → 5mm

  it('앞면은 왼쪽 끝에서 잰다', () => {
    expect(holeCenterX(p, 80)).toBe(5);
  });

  it('뒷면(mirror)이면 오른쪽 끝에서 잰 값이 된다', () => {
    // 앞면 왼쪽에 있던 구멍은 종이를 뒤집으면 뒷면에서 오른쪽에 있다.
    expect(holeCenterX(p, 80, true)).toBe(80 - 5);
  });
});

describe('타공 위치', () => {
  // 설계문서 5장의 표. 여백은 입력값이 아니라 계산 결과다.
  const expected: Array<[string, number, PunchSetting, number]> = [
    ['A5', 210, punch(6, 70, 6), 32.0],
    ['TA6', 148, punch(6, 38, 6), 17.0],
    ['DA6', 171, punch(6, 51, 6), 22.0],
    ['M6', 125, punch(6, null, 4), 15.0],
    ['M5', 105, punch(5, null, 4), 14.5],
    ['DA9', 80, punch(3, null, 4), 21.0],
  ];

  it.each(expected)('%s의 맨 위 구멍이 %s에서 %smm', (_name, height, p, first) => {
    expect(holeCentersY(height, p)[0]).toBeCloseTo(first, 6);
  });

  it.each(expected)('%s는 위아래 여백이 같다', (_name, height, p) => {
    const c = holeCentersY(height, p);
    expect(c[0]).toBeCloseTo(height - c[c.length - 1], 6);
  });

  it('묶음 안 간격은 항상 19mm다', () => {
    const c = holeCentersY(210, punch(6, 70, 6));
    expect(c[1] - c[0]).toBeCloseTo(19, 6);
    expect(c[2] - c[1]).toBeCloseTo(19, 6);
    expect(c[3] - c[2]).toBeCloseTo(70, 6); // 묶음 사이
    expect(c[4] - c[3]).toBeCloseTo(19, 6);
  });

  it('속지 세로가 달라지면 여백이 따라 움직인다', () => {
    // 브랜드마다 M6 세로가 125~128mm로 제각각이다
    for (const h of [125, 126, 127, 128]) {
      expect(holeCentersY(h, punch(6, null, 4))[0]).toBeCloseTo((h - 95) / 2, 6);
    }
  });

  it('모든 프리셋의 구멍이 속지 안에 들어간다', () => {
    for (const p of INSERT_PRESETS) {
      const centers = holeCentersY(p.height, punch(p.holeCount, p.groupGap, p.markSize));
      expect(centers[0] - p.markSize / 2).toBeGreaterThan(0);
      expect(centers[centers.length - 1] + p.markSize / 2).toBeLessThan(p.height);
    }
  });

  it('묶음 배치로 바꿔도 구멍이 넘치지 않는 간격을 제안한다', () => {
    for (const [height, holes] of [[125, 6], [148, 6], [171, 6], [210, 6]] as const) {
      const gap = suggestGroupGap(height, holes);
      expect(gap).not.toBeNull();
      const centers = holeCentersY(height, punch(holes, gap, 4));
      expect(centers[0]).toBeGreaterThan(0);
      expect(centers[centers.length - 1]).toBeLessThan(height);
    }
  });

  it('묶을 자리가 없으면 묶음을 제안하지 않는다', () => {
    expect(suggestGroupGap(80, 6)).toBeNull();
  });

  it('3단접이는 본체와 구멍 위치가 같다', () => {
    // 다르면 같은 바인더에 못 들어간다
    const m6 = holeCentersY(125, punch(6, null, 4));
    const m6tri = holeCentersY(125, punch(6, null, 4));
    expect(m6tri).toEqual(m6);

    const m5 = holeCentersY(105, punch(5, null, 4));
    const m5tri = holeCentersY(105, punch(5, null, 4));
    expect(m5tri).toEqual(m5);
  });
});

describe('로고 칸 자리', () => {
  it('M6 — 고른 배치라 맨 위·맨 아래 여백에 하나씩 난다', () => {
    // M6: 125mm, 구멍 6개, 균등 배치. 첫 구멍 15mm, 마지막 구멍 110mm.
    const areas = logoSlotAreas(80, 125, punch(6, null, 4));
    expect(areas).toHaveLength(2);
    expect(areas[0]).toEqual({ x: 0, y: 2, width: 10, height: 9 });
    expect(areas[1]).toEqual({ x: 0, y: 114, width: 10, height: 9 });
  });

  it('M5 — 마찬가지로 위아래 두 자리다', () => {
    const areas = logoSlotAreas(62, 105, punch(5, null, 4));
    expect(areas).toHaveLength(2);
    expect(areas[0]).toEqual({ x: 0, y: 2, width: 10, height: 8.5 });
    expect(areas[1]).toEqual({ x: 0, y: 94.5, width: 10, height: 8.5 });
  });

  it('A5 — 3+3 묶음 사이 한 자리만 난다', () => {
    // A5: 210mm, 구멍 6개, 묶음 사이 간격 70mm. 3번째 구멍 70mm, 4번째 140mm.
    const areas = logoSlotAreas(148, 210, punch(6, 70, 6));
    expect(areas).toHaveLength(1);
    expect(areas[0]).toEqual({ x: 0, y: 75, width: 10, height: 60 });
  });

  it('뒷면(mirror)이면 오른쪽 끝 기준으로 뒤집는다', () => {
    const front = logoSlotAreas(80, 125, punch(6, null, 4));
    const back = logoSlotAreas(80, 125, punch(6, null, 4), true);
    expect(back[0].x).toBe(80 - 10);
    expect(back[0].y).toBe(front[0].y);
    expect(back[0].width).toBe(front[0].width);
  });

  it('안전영역이 0이면(구멍 안내를 안 쓰면) 자리를 내지 않는다', () => {
    const areas = logoSlotAreas(80, 125, { ...punch(6, null, 4), safeZoneWidth: 0 });
    expect(areas).toHaveLength(0);
  });

  it('여백이 너무 좁으면(최소 높이 8mm 미만) 그 자리는 빠진다', () => {
    // DA9(80mm, 구멍 3개)는 여백이 넉넉하다 — 일부러 속지를 작게 줄여 좁힌다.
    // 구멍 span 38mm + 여유 8mm뿐이라 위아래 각각 2mm씩만 남는다(8mm 문턱 미만).
    const areas = logoSlotAreas(60, 46, punch(3, null, 4));
    expect(areas).toHaveLength(0);
  });
});
