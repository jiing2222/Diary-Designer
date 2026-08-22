import { describe, expect, it } from 'vitest';
import { computeLayout, localAxisMirror, mirrorLayout } from './layout';
import { holeCenterX, holeCentersY, suggestGroupGap, type PunchSetting } from './punch';
import { placeSlot } from './place';
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

  it('회전 배치면 x·y 둘 다 뒤집고 크기는 그대로다', () => {
    // M5(62×105)는 A4에서 실제로 회전 배치가 된다 — M6은 안 눕고 M5는 눕는다.
    // x도 뒤집어야 하는 이유는 이 파일 아래 "타공이 종이 좌우로 갈라지는지"
    // 시험, 그리고 mirrorLayout의 주석을 참고.
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
      expect(b.x).toBeCloseTo(210 - s.x - s.width, 6);
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

  it('회전 배치에서 앞뒤 타공이 종이 좌우로 갈라진다(실제로 인쇄해 발견한 버그)', () => {
    // 칸을 90도 눕히면 속지의 가로축(구멍이 있는 축)이 종이의 세로축이
    // 된다(core/place의 placeSlot) — 그래서 holeCenterX의 mirror(속지의
    // 가로축만 뒤집는다)만으로는 종이 좌우가 전혀 안 갈라진다. mirrorLayout이
    // 칸 자체를 좌우로도 뒤집어야 한다(위 "x·y 둘 다 뒤집는다" 시험 참고).
    //
    // 2026-08-22 실제 인쇄를 빛에 비춰 확인한 버그 — 그때는 앞뒤 구멍이
    // 종이 같은 쪽에 있었다.
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
    const back = mirrorLayout(front, 210, 297);
    const p = punch(5, null, 4); // M5 규격 — edgeToHole 3, markSize 4 → 5mm

    const frontSlot = front.slots[0];
    const backSlot = back.slots[0];
    const frontHoleX = holeCenterX(p, 62, false);
    const backHoleX = holeCenterX(p, 62, true);

    // 구멍 하나(첫 번째)의 종이 위 실제 좌표. placeSlot이 회전 배치의
    // 좌표 변환을 맡는다 — 화면·PDF가 함께 쓰는 바로 그 함수다.
    const frontOnPaper = placeSlot(frontSlot, true).map(frontHoleX, holeCentersY(62, p)[0]);
    const backOnPaper = placeSlot(backSlot, true).map(backHoleX, holeCentersY(62, p)[0]);

    // 종이 좌우(x)로 확실히 갈라져야 한다 — 같은 x면 버그가 되살아난 것이다.
    expect(Math.abs(frontOnPaper.x - backOnPaper.x)).toBeGreaterThan(1);
  });

  it('localAxisMirror — 회전 배치면 언제나 false다', () => {
    expect(localAxisMirror(false, false)).toBe(false);
    expect(localAxisMirror(true, false)).toBe(true);
    expect(localAxisMirror(false, true)).toBe(false);
    expect(localAxisMirror(true, true)).toBe(false);
  });

  it('회전 배치에서 앞뒤 타공이 슬롯 안 같은 자리(위/아래)에 있다 — 종이 위아래로 갈라지면 버그다', () => {
    // 위 시험(종이 좌우로 갈라진다)의 짝이다. mirrorLayout이 칸 자체를 좌우로
    // 옮겨 종이 좌우는 이미 갈라지므로, holeCenterX의 mirror까지 걸면
    // (localAxisMirror 없이 그냥 side==='back'을 그대로 넘기면) 종이 위아래로도
    // 한 번 더 갈라진다 — 2026-08-22, 인쇄 미리보기에서 앞뒤 타공이 슬롯 안에서
    // 위/아래로 반대인 게 보여 찾았다(사진으로 확인).
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
    const back = mirrorLayout(front, 210, 297);
    const p = punch(5, null, 4);

    const frontSlot = front.slots[0];
    const backSlot = back.slots[0];
    // 실제 앱이 부르는 그대로 — localAxisMirror를 거친 값을 holeCenterX에 넘긴다.
    const frontHoleX = holeCenterX(p, 62, localAxisMirror(false, true));
    const backHoleX = holeCenterX(p, 62, localAxisMirror(true, true));
    const v = holeCentersY(62, p)[0];

    const frontOnPaper = placeSlot(frontSlot, true).map(frontHoleX, v);
    const backOnPaper = placeSlot(backSlot, true).map(backHoleX, v);

    // 슬롯 안에서 위에서부터의 상대 위치(0~1) — front·back 슬롯 높이가 같으므로
    // 그대로 비교할 수 있다. 같아야 한다(둘 다 슬롯 같은 쪽에 있어야 한다).
    const frontRel = (frontOnPaper.y - frontSlot.y) / frontSlot.height;
    const backRel = (backOnPaper.y - backSlot.y) / backSlot.height;
    expect(backRel).toBeCloseTo(frontRel, 6);
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

