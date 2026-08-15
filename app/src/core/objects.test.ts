import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  cloneObject,
  ensureIdCounterAbove,
  isLine,
  isLocked,
  dedupe,
  distanceToSegment,
  fitBox,
  mirrorObjectX,
  moveSegment,
  newId,
  objectInRect,
  pdfRotateOf,
  rectLines,
  reshape,
  resizeBox,
  rotationOf,
  segmentLength,
  sameSegment,
  segmentInRect,
  splitAtBoundary,
  toggleLines,
  MIN_BOX_SIZE,
  type DiaryObject,
  type LineSeg,
} from './objects';

const seg = (x1: number, y1: number, x2: number, y2: number): LineSeg => ({ x1, y1, x2, y2 });
const bare = (o: LineSeg) => seg(o.x1, o.y1, o.x2, o.y2);

describe('같은 자리의 선', () => {
  it('방향이 반대여도 같은 선이다', () => {
    expect(sameSegment(seg(10, 10, 50, 10), seg(50, 10, 10, 10))).toBe(true);
  });

  it('한쪽 끝만 달라도 다른 선이다', () => {
    expect(sameSegment(seg(10, 10, 50, 10), seg(10, 10, 55, 10))).toBe(false);
  });
});

describe('면 = 선 네 개', () => {
  it('마주보는 두 점에서 네 변이 나온다', () => {
    const lines = rectLines({ x: 10, y: 20 }, { x: 50, y: 60 });
    expect(lines).toHaveLength(4);
    // 위·아래·왼쪽·오른쪽이 모두 있어야 한다.
    expect(lines).toContainEqual(seg(10, 20, 50, 20));
    expect(lines).toContainEqual(seg(10, 60, 50, 60));
    expect(lines).toContainEqual(seg(10, 20, 10, 60));
    expect(lines).toContainEqual(seg(50, 20, 50, 60));
  });

  it('어느 방향으로 끌어도 같은 네모다', () => {
    const a = rectLines({ x: 10, y: 20 }, { x: 50, y: 60 });
    const d = rectLines({ x: 50, y: 60 }, { x: 10, y: 20 });
    for (const line of a) expect(d.some((x) => sameSegment(x, line))).toBe(true);
  });

  it('한 줄로 끌면 선 하나만 만든다', () => {
    // 변이 서로 겹치므로 네 개를 만들면 같은 자리에 두 겹이 쌓인다.
    expect(rectLines({ x: 10, y: 20 }, { x: 50, y: 20 })).toEqual([seg(10, 20, 50, 20)]);
    expect(rectLines({ x: 10, y: 20 }, { x: 10, y: 60 })).toEqual([seg(10, 20, 10, 60)]);
  });

  it('한 점에서 끝나면 아무것도 안 만든다', () => {
    expect(rectLines({ x: 10, y: 20 }, { x: 10, y: 20 })).toEqual([]);
  });
});

describe('다시 그으면 지워진다', () => {
  it('빈 곳에 그으면 생긴다', () => {
    const after = toggleLines([], [seg(10, 10, 50, 10)]);
    expect(after).toHaveLength(1);
    expect(isLine(after[0]) && bare(after[0])).toEqual(seg(10, 10, 50, 10));
  });

  it('같은 자리에 다시 그으면 지워진다', () => {
    const one = toggleLines([], [seg(10, 10, 50, 10)]);
    expect(toggleLines(one, [seg(10, 10, 50, 10)])).toEqual([]);
  });

  it('반대 방향으로 다시 그어도 지워진다', () => {
    const one = toggleLines([], [seg(10, 10, 50, 10)]);
    expect(toggleLines(one, [seg(50, 10, 10, 10)])).toEqual([]);
  });

  it('겹쳐 그어도 선이 쌓이지 않는다', () => {
    let objs = toggleLines([], [seg(10, 10, 50, 10)]);
    objs = toggleLines(objs, [seg(10, 10, 50, 10)]); // 지움
    objs = toggleLines(objs, [seg(10, 10, 50, 10)]); // 다시 그림
    expect(objs).toHaveLength(1);
  });

  it('면의 네 변이 전부 있으면 전부 지운다', () => {
    const box = rectLines({ x: 10, y: 20 }, { x: 50, y: 60 });
    const drawn = toggleLines([], box);
    expect(drawn).toHaveLength(4);
    expect(toggleLines(drawn, box)).toEqual([]);
  });

  it('일부만 있으면 없는 것만 채운다', () => {
    // 반쯤 겹쳐 그렸을 때 일부는 생기고 일부는 사라지면 무슨 일인지 알 수 없다.
    const box = rectLines({ x: 10, y: 20 }, { x: 50, y: 60 });
    const half = toggleLines([], [box[0], box[1]]);
    const after = toggleLines(half, box);

    expect(after).toHaveLength(4);
    // 원래 있던 둘은 그대로 남아야 한다.
    expect(after[0].id).toBe(half[0].id);
    expect(after[1].id).toBe(half[1].id);
  });

  it('길이 0인 선은 무시한다', () => {
    expect(toggleLines([], [seg(10, 10, 10, 10)])).toEqual([]);
  });
});

describe('치수', () => {
  it('선의 길이', () => {
    expect(segmentLength(seg(20, 20, 60, 20))).toBe(40);
    expect(segmentLength(seg(0, 0, 30, 40))).toBe(50);
  });

  it('면을 감싸는 네모가 곧 그 크기다', () => {
    // 면은 선 네 개라 "면의 크기"라는 값이 따로 없다.
    const box = rectLines({ x: 15, y: 25 }, { x: 65, y: 100 });
    expect(boundsOf(box)).toEqual({ x: 15, y: 25, width: 50, height: 75 });
  });

  it('대각선도 감싸는 네모로 잰다', () => {
    expect(boundsOf([seg(10, 10, 40, 50)])).toEqual({ x: 10, y: 10, width: 30, height: 40 });
  });

  it('아무것도 없으면 null이다', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('새 선에 붙는 기본 모양', () => {
  it('정한 값이 새 선에 들어간다', () => {
    const [line] = toggleLines([], [seg(10, 10, 50, 10)], { width: 0.4, dash: 'dashed' });
    expect(isLine(line) && line.width).toBe(0.4);
    expect(isLine(line) && line.dash).toBe('dashed');
  });

  it('정하지 않은 값은 키 자체가 없다', () => {
    // 값이 없어야 core/style의 기본값을 따라간다. 나중에 기본값을 바꾸면 같이 따라온다.
    const [line] = toggleLines([], [seg(10, 10, 50, 10)], { width: undefined, color: undefined });
    expect('width' in line).toBe(false);
    expect('color' in line).toBe(false);
  });
});

describe('감싸서 고르기', () => {
  const line = seg(20, 20, 60, 20);

  it('완전히 들어오면 골라진다', () => {
    expect(segmentInRect(line, { x1: 10, y1: 10, x2: 70, y2: 30 })).toBe(true);
  });

  it('끝점 하나만 걸쳐도 골라진다', () => {
    // 긴 선을 고르려고 끝까지 다 감쌀 필요가 없다.
    expect(segmentInRect(line, { x1: 10, y1: 10, x2: 40, y2: 30 })).toBe(true);
  });

  it('양 끝이 둘 다 밖이어도 사각형을 관통하면 골라진다', () => {
    // 사각형이 선 중간 한 토막만 감싸는 경우 — 끝점은 하나도 안 안에 있다.
    expect(segmentInRect(line, { x1: 30, y1: 10, x2: 40, y2: 30 })).toBe(true);
  });

  it('아예 안 닿으면 안 골라진다', () => {
    expect(segmentInRect(line, { x1: 100, y1: 100, x2: 120, y2: 120 })).toBe(false);
    // 사각형이 선 위쪽으로 완전히 벗어나 있으면(x범위는 겹쳐도 y가 안 겹친다) 안 닿는다.
    expect(segmentInRect(line, { x1: 30, y1: 50, x2: 40, y2: 70 })).toBe(false);
  });

  it('어느 방향으로 감싸도 같다', () => {
    expect(segmentInRect(line, { x1: 70, y1: 30, x2: 10, y2: 10 })).toBe(true);
  });
});

describe('감싸서 고르기 — 상자 모양(도형·글자·달력·이미지·체크박스)', () => {
  const shape: DiaryObject = { id: 'sh1', type: 'shape', x: 20, y: 20, width: 40, height: 20 };

  it('완전히 들어오면 골라진다', () => {
    expect(objectInRect(shape, { x1: 10, y1: 10, x2: 70, y2: 50 })).toBe(true);
  });

  it('한쪽 귀퉁이만 걸쳐도 골라진다', () => {
    // 선과 같은 규칙 — 끝까지 다 감쌀 필요 없이 조금이라도 걸치면 골라진다.
    expect(objectInRect(shape, { x1: 10, y1: 10, x2: 30, y2: 30 })).toBe(true);
  });

  it('사각형이 상자 안쪽 한 토막만 감싸도(상자가 사각형을 완전히 감싸도) 골라진다', () => {
    expect(objectInRect(shape, { x1: 25, y1: 25, x2: 35, y2: 30 })).toBe(true);
  });

  it('아예 안 닿으면 안 골라진다', () => {
    expect(objectInRect(shape, { x1: 100, y1: 100, x2: 120, y2: 120 })).toBe(false);
  });

  it('어느 방향으로 감싸도 같다', () => {
    expect(objectInRect(shape, { x1: 70, y1: 50, x2: 10, y2: 10 })).toBe(true);
  });
});

describe('끝점 옮기기', () => {
  const line = { id: 'a', type: 'line' as const, ...seg(20, 20, 60, 20) };

  it('잡은 쪽 끝만 움직인다', () => {
    expect(bare(reshape(line, 2, { x: 60, y: 50 }))).toEqual(seg(20, 20, 60, 50));
    expect(bare(reshape(line, 1, { x: 10, y: 10 }))).toEqual(seg(10, 10, 60, 20));
  });

  it('다른 값은 건드리지 않는다', () => {
    const styled = { ...line, width: 0.5, color: '#000' };
    const after = reshape(styled, 2, { x: 60, y: 50 });
    expect(after.width).toBe(0.5);
    expect(after.color).toBe('#000');
    expect(after.id).toBe('a');
  });
});

describe('겹친 선 정리', () => {
  it('같은 자리에 겹치면 먼저 있던 것만 남는다', () => {
    // 끝점을 끌다 이미 있는 선 위에 겹칠 수 있다. 그대로 두면 그 자리를
    // 다시 그었을 때 둘이 한꺼번에 사라져 무슨 일인지 알 수 없다.
    const objs = [
      { id: 'a', type: 'line' as const, ...seg(20, 20, 60, 20) },
      { id: 'b', type: 'line' as const, ...seg(60, 20, 20, 20) },
      { id: 'c', type: 'line' as const, ...seg(20, 40, 60, 40) },
    ];
    const after = dedupe(objs);
    expect(after.map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('겹친 것이 없으면 그대로 둔다', () => {
    const objs = [
      { id: 'a', type: 'line' as const, ...seg(20, 20, 60, 20) },
      { id: 'b', type: 'line' as const, ...seg(20, 40, 60, 40) },
    ];
    expect(dedupe(objs)).toEqual(objs);
  });
});

describe('글자 상자를 내용에 맞추기(fitBox)', () => {
  const base = { x: 20, y: 30, width: 5, height: 5 };

  it('필요한 만큼 키운다', () => {
    const fit = fitBox(base, 5, { width: 22, height: 5 }, 80, 125);
    // 22mm를 담으려면 5mm칸이 5개(25mm) 필요하다.
    expect(fit.width).toBe(25);
    expect(fit.height).toBe(5);
  });

  it('왼쪽 위는 움직이지 않는다', () => {
    const fit = fitBox(base, 5, { width: 40, height: 20 }, 80, 125);
    expect(fit.x).toBe(20);
    expect(fit.y).toBe(30);
  });

  it('필요한 것이 이미 있는 크기보다 작으면 줄어든다 — growBox와 다른 점', () => {
    const bigger = { ...base, width: 30, height: 15 };
    const fit = fitBox(bigger, 5, { width: 8, height: 6 }, 80, 125);
    expect(fit.width).toBe(10); // 8mm를 담으려면 5mm칸 2개(10mm)
    expect(fit.height).toBe(10); // 6mm를 담으려면 5mm칸 2개(10mm)
  });

  it('속지 밖으로는 자라지 않는다', () => {
    const fit = fitBox(base, 5, { width: 200, height: 200 }, 80, 125);
    expect(fit.x + fit.width).toBeLessThanOrEqual(80);
    expect(fit.y + fit.height).toBeLessThanOrEqual(125);
  });

  it('간격의 배수로 맞춘다', () => {
    const fit = fitBox(base, 5, { width: 23.4, height: 11 }, 80, 125);
    expect(fit.width % 5).toBeCloseTo(0, 9);
    expect(fit.height % 5).toBeCloseTo(0, 9);
  });
});

describe('옮기기', () => {
  it('길이와 각도가 변하지 않는다', () => {
    const before = seg(10, 10, 40, 50);
    const after = moveSegment(before, 5, -5);
    expect(after).toEqual(seg(15, 5, 45, 45));

    const len = (s: LineSeg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    expect(len(after)).toBeCloseTo(len(before), 9);
  });
});

describe('선까지의 거리', () => {
  const line = seg(20, 20, 60, 20);

  it('선 위에 있으면 0이다', () => {
    expect(distanceToSegment(line, 40, 20)).toBe(0);
  });

  it('선과 나란히 떨어진 만큼 나온다', () => {
    expect(distanceToSegment(line, 40, 23)).toBeCloseTo(3, 9);
  });

  it('선 바깥으로 나가면 끝점까지의 거리다', () => {
    // 선을 무한히 늘인 직선이 아니라 그은 구간까지만 잰다.
    expect(distanceToSegment(line, 70, 20)).toBeCloseTo(10, 9);
  });
});

describe('상자 모서리로 크기 바꾸기', () => {
  const box = { x: 10, y: 10, width: 20, height: 30 }; // 10~30, 10~40

  it('맞은편 모서리는 그대로 두고 끈 모서리만 움직인다', () => {
    // 오른쪽 아래(se)를 (50, 60)으로 끌면 왼쪽 위(10,10)는 그대로다.
    expect(resizeBox(box, 'se', { x: 50, y: 60 })).toEqual({ x: 10, y: 10, width: 40, height: 50 });
  });

  it('왼쪽 위(nw)를 끌면 오른쪽 아래(30,40)가 고정된다', () => {
    expect(resizeBox(box, 'nw', { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 30, height: 40 });
  });

  it('맞은편을 넘어 반대쪽으로 끌어도 뒤집히지 않고 최소 크기로 멈춘다', () => {
    // se를 왼쪽 위 모서리(10,10) 너머로 끌어도 폭·높이가 음수가 되지 않는다.
    const r = resizeBox(box, 'se', { x: 5, y: 5 });
    expect(r.width).toBe(MIN_BOX_SIZE);
    expect(r.height).toBe(MIN_BOX_SIZE);
    expect(r.x).toBeLessThanOrEqual(10);
    expect(r.y).toBeLessThanOrEqual(10);
  });

  it('ne·sw도 같은 규칙이다', () => {
    // 오른쪽 위(ne)를 끌면 왼쪽 아래(10,40)가 고정된다.
    expect(resizeBox(box, 'ne', { x: 50, y: 0 })).toEqual({ x: 10, y: 0, width: 40, height: 40 });
    // 왼쪽 아래(sw)를 끌면 오른쪽 위(30,10)가 고정된다.
    expect(resizeBox(box, 'sw', { x: 0, y: 60 })).toEqual({ x: 0, y: 10, width: 30, height: 50 });
  });
});

describe('잠금', () => {
  it('정하지 않았으면 잠기지 않은 것이다', () => {
    const line = { id: 'l1', type: 'line' as const, x1: 0, y1: 0, x2: 10, y2: 0 };
    expect(isLocked(line)).toBe(false);
  });

  it('locked: true면 잠긴 것이다', () => {
    const line = { id: 'l1', type: 'line' as const, x1: 0, y1: 0, x2: 10, y2: 0, locked: true };
    expect(isLocked(line)).toBe(true);
  });

  it('locked: false도 잠기지 않은 것이다', () => {
    const line = { id: 'l1', type: 'line' as const, x1: 0, y1: 0, x2: 10, y2: 0, locked: false };
    expect(isLocked(line)).toBe(false);
  });
});

describe('상자 회전', () => {
  // x:20 y:40 w:30 h:10 → 가운데(35, 45).
  const rbox = { x: 20, y: 40, width: 30, height: 10 };

  it('회전 없으면(0) 그대로다', () => {
    const t = rotationOf(rbox, 0);
    expect(t.svg).toBe('');
    expect(t.map({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it('90도 — 상자 가운데는 축이라 그대로, 왼쪽 위는 옮겨간다', () => {
    const t = rotationOf(rbox, 90);
    expect(t.map({ x: 35, y: 45 })).toEqual({ x: 35, y: 45 });
    expect(t.map({ x: 20, y: 40 })).toEqual({ x: 40, y: 30 });
    expect(t.svg).toBe('matrix(0 1 -1 0 80 10)');
  });

  it('270도 — 가운데는 그대로, 왼쪽 위는 90도와 반대쪽으로 옮겨간다', () => {
    const t = rotationOf(rbox, 270);
    expect(t.map({ x: 35, y: 45 })).toEqual({ x: 35, y: 45 });
    expect(t.map({ x: 20, y: 40 })).toEqual({ x: 30, y: 60 });
    expect(t.svg).toBe('matrix(0 -1 1 0 -10 80)');
  });

  it('180도 — 가운데를 기준으로 정확히 마주보는 자리로 뒤집힌다(왼쪽 위 ↔ 오른쪽 아래)', () => {
    const t = rotationOf(rbox, 180);
    expect(t.map({ x: 35, y: 45 })).toEqual({ x: 35, y: 45 });
    expect(t.map({ x: 20, y: 40 })).toEqual({ x: 50, y: 50 }); // 원래 오른쪽 아래 자리
    expect(t.svg).toBe('matrix(-1 0 0 -1 70 90)');
  });

  it('0·90·180·270도는 부동소수점 오차 없이 정확한 정수 계수를 낸다', () => {
    // Math.cos(Math.PI/2)는 정확히 0이 아니다 — 특수 각도를 따로 계산해야
    // "회전 없음"이어야 할 값에 아주 작은 회전이 섞여 들어가지 않는다.
    for (const deg of [90, 180, 270]) {
      const [a, b, c, d] = rotationOf(rbox, deg)
        .svg.replace('matrix(', '')
        .split(' ')
        .map(Number);
      for (const n of [a, b, c, d]) expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('이미지처럼 임의 각도(45도)도 돌아간다 — 가운데는 그대로, 거리는 보존된다', () => {
    const t = rotationOf(rbox, 45);
    const center = { x: 35, y: 45 };
    expect(t.map(center).x).toBeCloseTo(center.x, 9);
    expect(t.map(center).y).toBeCloseTo(center.y, 9);

    // 회전은 가운데로부터의 거리를 보존한다.
    const p = { x: 20, y: 40 };
    const before = Math.hypot(p.x - center.x, p.y - center.y);
    const moved = t.map(p);
    const after = Math.hypot(moved.x - center.x, moved.y - center.y);
    expect(after).toBeCloseTo(before, 9);
  });

  it('360도는 0도와 같다(꽉 채운 한 바퀴)', () => {
    expect(rotationOf(rbox, 360).svg).toBe('');
  });
});

describe('PDF 회전 각도', () => {
  it('270도가 회전 배치와 같은 손 방향(9b 수정 4에서 인쇄로 검증된 조합)이라 90도를 그대로 쓰고, 90도는 그 거울상이라 -90도를 쓴다', () => {
    expect(pdfRotateOf(0)).toBe(0);
    expect(pdfRotateOf(90)).toBe(-90);
    expect(pdfRotateOf(270)).toBe(90);
  });

  it('임의 각도는 부호만 반대로, 더 작은 크기의 동치 각도로 정규화한다', () => {
    expect(pdfRotateOf(45)).toBe(-45);
    expect(pdfRotateOf(200)).toBe(160); // -200과 같은 회전이지만 크기가 더 작다
  });
});

describe('붙여넣기 사본', () => {
  const shape: DiaryObject = { id: 'sh1', type: 'shape', x: 10, y: 10, width: 20, height: 20 };

  it('새 id를 받는다 — 원본과 겹치지 않는다', () => {
    const clone = cloneObject(shape, 5, 5);
    expect(clone.id).not.toBe(shape.id);
  });

  it('종류에 맞는 접두어로 id를 매긴다', () => {
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
    expect(cloneObject(shape, 0, 0).id).toMatch(/^sh\d+$/);
    expect(cloneObject(line, 0, 0).id).toMatch(/^l\d+$/);
  });

  it('선은 두 끝점 다 옮겨진다', () => {
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
    const clone = cloneObject(line, 5, 3);
    expect(clone).toMatchObject({ x1: 5, y1: 3, x2: 15, y2: 13 });
  });

  it('상자 모양은 x·y만 옮겨지고 크기는 그대로다', () => {
    const clone = cloneObject(shape, 5, 3);
    expect(clone).toMatchObject({ x: 15, y: 13, width: 20, height: 20 });
  });

  it('원본은 손대지 않는다', () => {
    cloneObject(shape, 5, 5);
    expect(shape).toEqual({ id: 'sh1', type: 'shape', x: 10, y: 10, width: 20, height: 20 });
  });
});

describe('좌우 뒤집기(뒷면 복사)', () => {
  const shape: DiaryObject = { id: 'sh1', type: 'shape', x: 10, y: 10, width: 20, height: 30 };

  it('상자 모양은 오른쪽 끝이 왼쪽 끝이 되도록 뒤집는다 — y·크기는 그대로', () => {
    // 속지 폭 80에서 x=10~30(오른쪽 끝 30)이던 상자는 뒤집으면
    // 오른쪽 끝이 80-10=70, 왼쪽 끝(x)이 80-30=50이 된다.
    expect(mirrorObjectX(shape, 80)).toEqual({ ...shape, x: 50 });
  });

  it('선은 두 끝점 다 뒤집는다', () => {
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 5, x2: 30, y2: 15 };
    expect(mirrorObjectX(line, 80)).toEqual({ ...line, x1: 80, x2: 50 });
  });

  it('왼쪽 끝(안전영역 쪽)에 있던 것이 오른쪽 끝으로 간다', () => {
    // 타공에서 5mm 띄워 그린 상자(x=5, width=10 → 오른쪽 끝 15)는
    // 뒤집으면 반대쪽 끝에서 5mm(오른쪽 끝에서 5) 떨어진 자리로 간다.
    const box: DiaryObject = { id: 'sh1', type: 'shape', x: 5, y: 0, width: 10, height: 10 };
    const mirrored = mirrorObjectX(box, 80);
    if (mirrored.type === 'line') throw new Error('shape가 line이 될 리 없다');
    expect(mirrored.x).toBe(65); // 80-5-10
    // 오른쪽 끝까지의 거리(80-(65+10)=5)가 원래 왼쪽 끝까지의 거리(5)와 같다.
    expect(80 - (mirrored.x + mirrored.width)).toBe(box.x);
  });

  it('두 번 뒤집으면 제자리로 돌아온다', () => {
    expect(mirrorObjectX(mirrorObjectX(shape, 80), 80)).toEqual(shape);
  });

  it('원본은 손대지 않는다', () => {
    mirrorObjectX(shape, 80);
    expect(shape).toEqual({ id: 'sh1', type: 'shape', x: 10, y: 10, width: 20, height: 30 });
  });
});

describe('경계에서 선 쪼개기', () => {
  it('경계까지 거리 비율대로 y를 보간한다', () => {
    // 뒷면(오른쪽 끝=경계) 쪽 점이 경계에서 10mm, 앞면(왼쪽 끝=경계) 쪽 점이
    // 5mm — 뒷면 쪽이 경계에서 더 머니, 교차점은 두 y의 2:1 지점(뒷면 쪽에
    // 더 가깝게 쳐다본 게 아니라, distToBoundary 비율 10:5 = 2:1이 그대로
    // t = 10/15에 반영된다).
    const { aSeg, bSeg } = splitAtBoundary(
      { x: 70, y: 10, distToBoundary: 10, edgeX: 80 },
      { x: 5, y: 50, distToBoundary: 5, edgeX: 0 },
    );
    const crossY = 10 + (10 / 15) * (50 - 10);
    expect(aSeg).toEqual({ x1: 70, y1: 10, x2: 80, y2: crossY });
    expect(bSeg).toEqual({ x1: 0, y1: crossY, x2: 5, y2: 50 });
  });

  it('둘 다 경계 위에 있으면(거리 0) 가운데(0.5)로 나눈다 — 0으로 나누지 않는다', () => {
    const { aSeg, bSeg } = splitAtBoundary(
      { x: 80, y: 10, distToBoundary: 0, edgeX: 80 },
      { x: 0, y: 50, distToBoundary: 0, edgeX: 0 },
    );
    expect(aSeg.y2).toBe(30);
    expect(bSeg.y1).toBe(30);
  });

  it('한쪽이 경계 바로 위(거리 0)면 교차점이 그 점의 y와 같다', () => {
    const { aSeg, bSeg } = splitAtBoundary(
      { x: 80, y: 10, distToBoundary: 0, edgeX: 80 },
      { x: 5, y: 50, distToBoundary: 5, edgeX: 0 },
    );
    expect(aSeg.y2).toBe(10);
    expect(bSeg.y1).toBe(10);
  });

  it('반쪽 두 개는 경계에서 만난다 — 끝점 x가 각자의 edgeX와 같다', () => {
    const { aSeg, bSeg } = splitAtBoundary(
      { x: 70, y: 10, distToBoundary: 10, edgeX: 80 },
      { x: 5, y: 50, distToBoundary: 5, edgeX: 0 },
    );
    expect(aSeg.x2).toBe(80);
    expect(bSeg.x1).toBe(0);
  });
});

describe('저장 파일을 불러온 뒤 id 겹침 막기', () => {
  // counter는 모듈 하나에 딱 하나뿐이라(파일 전체 테스트가 순서대로 이
  // 카운터를 같이 쓴다), 절대값이 아니라 "불러온 뒤 매기는 다음 id가
  // 불러온 파일 속 id보다 뒤인가"만 본다.
  it('불러온 id들보다 다음 id가 뒤에 온다', () => {
    const before = newId('l');
    const beforeNum = Number(before.replace(/^l/, ''));

    ensureIdCounterAbove([`l${beforeNum + 50}`, `t${beforeNum + 10}`]);
    const after = Number(newId('l').replace(/^l/, ''));

    expect(after).toBeGreaterThan(beforeNum + 50);
  });

  it('불러온 id가 지금 카운터보다 낮으면 아무 일도 하지 않는다(거꾸로 가지 않는다)', () => {
    const a = Number(newId('l').replace(/^l/, ''));
    ensureIdCounterAbove(['l1']); // 훨씬 옛날 id — 이미 지나온 숫자다
    const b = Number(newId('l').replace(/^l/, ''));
    expect(b).toBe(a + 1);
  });

  it('숫자가 없는 id는 무시한다(터지지 않는다)', () => {
    expect(() => ensureIdCounterAbove(['abc', ''])).not.toThrow();
  });
});
