import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  isLine,
  isLocked,
  dedupe,
  distanceToSegment,
  growBox,
  moveSegment,
  rectLines,
  reshape,
  resizeBox,
  segmentLength,
  sameSegment,
  segmentInRect,
  toggleLines,
  MIN_BOX_SIZE,
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

  it('걸치기만 하면 안 골라진다', () => {
    // 격자 위에서 의도치 않게 딸려오는 것을 막는다.
    expect(segmentInRect(line, { x1: 10, y1: 10, x2: 40, y2: 30 })).toBe(false);
  });

  it('어느 방향으로 감싸도 같다', () => {
    expect(segmentInRect(line, { x1: 70, y1: 30, x2: 10, y2: 10 })).toBe(true);
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

describe('글자 상자 키우기', () => {
  const base = { x: 20, y: 30, width: 5, height: 5 };

  it('필요한 만큼 키운다', () => {
    const grown = growBox(base, 5, { width: 22, height: 5 }, 80, 125);
    // 22mm를 담으려면 5mm칸이 5개(25mm) 필요하다.
    expect(grown.width).toBe(25);
    expect(grown.height).toBe(5);
  });

  it('왼쪽 위는 움직이지 않는다', () => {
    const grown = growBox(base, 5, { width: 40, height: 20 }, 80, 125);
    expect(grown.x).toBe(20);
    expect(grown.y).toBe(30);
  });

  it('필요한 것이 이미 있는 크기보다 작으면 줄어들지 않는다', () => {
    const bigger = { ...base, width: 30, height: 15 };
    const grown = growBox(bigger, 5, { width: 8, height: 6 }, 80, 125);
    expect(grown.width).toBe(30);
    expect(grown.height).toBe(15);
  });

  it('속지 밖으로는 자라지 않는다', () => {
    const grown = growBox(base, 5, { width: 200, height: 200 }, 80, 125);
    expect(grown.x + grown.width).toBeLessThanOrEqual(80);
    expect(grown.y + grown.height).toBeLessThanOrEqual(125);
  });

  it('간격의 배수로 자란다', () => {
    const grown = growBox(base, 5, { width: 23.4, height: 11 }, 80, 125);
    expect(grown.width % 5).toBeCloseTo(0, 9);
    expect(grown.height % 5).toBeCloseTo(0, 9);
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
