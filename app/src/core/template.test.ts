import { describe, expect, it } from 'vitest';
import {
  defaultName,
  duplicateTemplate,
  groupBySize,
  insertFromPreset,
  newTemplate,
  outsideCount,
  sheetsNeeded,
  sizeLabel,
  uniqueName,
} from './template';
import { commit } from './history';
import type { DiaryObject } from './objects';

const line = (x1: number, y1: number, x2: number, y2: number): DiaryObject => ({
  id: `l${x1}${y1}`,
  type: 'line',
  x1,
  y1,
  x2,
  y2,
});

const text = (x: number, y: number, width: number, height: number): DiaryObject => ({
  id: `t${x}${y}`,
  type: 'text',
  x,
  y,
  width,
  height,
  text: '메모',
});

describe('규격', () => {
  it('프리셋에서 크기와 타공을 가져온다', () => {
    const m6 = insertFromPreset('M6');
    expect(m6.width).toBe(80);
    expect(m6.height).toBe(125);
    expect(m6.punch.holeCount).toBe(6);
  });

  it('없는 프리셋이면 지금 값을 지킨다', () => {
    // `사용자 지정`을 골랐을 때 크기가 멋대로 바뀌면 안 된다.
    const base = insertFromPreset('M6');
    const custom = insertFromPreset('custom', base);
    expect(custom.width).toBe(80);
    expect(custom.presetId).toBe('custom');
  });

  it('규격을 바꿔도 안전영역 같은 손댄 값은 남는다', () => {
    const base = { ...insertFromPreset('M6') };
    base.punch = { ...base.punch, safeZoneWidth: 14 };
    expect(insertFromPreset('A5', base).punch.safeZoneWidth).toBe(14);
  });
});

describe('양식', () => {
  it('만들면 규격을 지니고 그린 것은 비어 있다', () => {
    const t = newTemplate('위클리1', insertFromPreset('M6'));
    expect(t.name).toBe('위클리1');
    expect(t.insert.width).toBe(80);
    expect(t.objects.present).toEqual([]);
  });

  it('id가 겹치지 않는다', () => {
    const a = newTemplate('가');
    const b = newTemplate('나');
    expect(a.id).not.toBe(b.id);
  });
});

describe('복제', () => {
  const source = (() => {
    const t = newTemplate('위클리1', insertFromPreset('M6'));
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);
    return t;
  })();

  it('그린 것을 물려받되 원본과 이어지지 않는다', () => {
    const copy = duplicateTemplate(source, '위클리1 사본');
    expect(copy.objects.present).toEqual(source.objects.present);
    expect(copy.id).not.toBe(source.id);

    // 사본을 고쳐도 원본은 그대로여야 한다.
    copy.objects = commit(copy.objects, []);
    expect(source.objects.present).toHaveLength(1);
  });

  it('실행취소 이력은 물려주지 않는다', () => {
    // 사본은 지금 모습에서 새로 시작한다. 원본의 과거로 되돌아가면 놀란다.
    const copy = duplicateTemplate(source, '사본');
    expect(copy.objects.past).toEqual([]);
  });

  it('규격을 바꿔 복제해도 좌표는 그대로다', () => {
    // 비례로 줄이면 5mm 격자가 4.69mm가 되어 격자의 의미가 사라진다.
    const copy = duplicateTemplate(source, '좁은 판', insertFromPreset('M5'));
    expect(copy.insert.width).toBe(62);
    expect(copy.objects.present).toEqual(source.objects.present);
  });

  it('규격을 주지 않으면 원본 규격을 쓰되 타공을 공유하지 않는다', () => {
    const copy = duplicateTemplate(source, '사본');
    expect(copy.insert.width).toBe(source.insert.width);
    expect(copy.insert.punch).not.toBe(source.insert.punch);
  });
});

describe('새 크기 밖으로 나가는 것', () => {
  const objects = [line(10, 10, 70, 10), text(60, 100, 30, 10)];

  it('다 들어가면 0이다', () => {
    expect(outsideCount(objects, { width: 100, height: 130 })).toBe(0);
  });

  it('조금이라도 걸치면 센다', () => {
    // 글자 상자가 60~90mm를 쓰는데 폭이 80이면 걸친다.
    expect(outsideCount(objects, { width: 80, height: 125 })).toBe(1);
  });

  it('둘 다 나가면 둘 다 센다', () => {
    expect(outsideCount(objects, { width: 50, height: 125 })).toBe(2);
  });

  it('음수 좌표도 밖으로 친다', () => {
    expect(outsideCount([line(-5, 10, 20, 10)], { width: 80, height: 125 })).toBe(1);
  });
});

describe('크기별 묶기', () => {
  it('같은 크기끼리 모으고 나타난 순서를 지킨다', () => {
    const a = newTemplate('위클리', insertFromPreset('M6'));
    const b = newTemplate('메모', insertFromPreset('A5'));
    const c = newTemplate('데일리', insertFromPreset('M6'));

    const groups = groupBySize([a, b, c]);
    expect(groups).toHaveLength(2);
    // M6가 먼저 나왔으므로 먼저 온다. 이름순으로 정렬하지 않는다.
    expect(groups[0].templates.map((t) => t.name)).toEqual(['위클리', '데일리']);
    expect(groups[1].templates.map((t) => t.name)).toEqual(['메모']);
  });

  it('크기가 같으면 프리셋 이름이 달라도 한 묶음이다', () => {
    // 묶는 기준은 이름이 아니라 실제 치수다.
    const a = newTemplate('가', insertFromPreset('M6'));
    const b = newTemplate('나', { ...insertFromPreset('M6'), presetId: 'custom' });
    expect(groupBySize([a, b])).toHaveLength(1);
  });
});

describe('이름', () => {
  it('크기와 프리셋 이름을 함께 보여준다', () => {
    expect(sizeLabel(insertFromPreset('M6'))).toContain('80 × 125mm');
    expect(sizeLabel(insertFromPreset('M6'))).toContain('M6');
  });

  it('크기를 손으로 고쳤으면 프리셋 이름을 쓰지 않는다', () => {
    // presetId가 남아 있어도 치수가 다르면 그 이름은 거짓이다.
    const tweaked = { ...insertFromPreset('M6'), height: 127 };
    expect(sizeLabel(tweaked)).toBe('80 × 127mm');
  });

  it('겹치면 번호를 붙인다', () => {
    const list = [newTemplate('양식 1'), newTemplate('양식 1 2')];
    expect(uniqueName(list, '양식 1')).toBe('양식 1 3');
    expect(uniqueName(list, '메모')).toBe('메모');
  });
});

describe('규격에서 나오는 이름', () => {
  it('프리셋 이름 뒤에 번호를 붙인다', () => {
    // 목록에서 어느 속지용인지 이름만 보고 알아야 한다.
    const a = newTemplate('M6-1', insertFromPreset('M6'));
    expect(defaultName([], insertFromPreset('M6'))).toBe('M6-1');
    expect(defaultName([a], insertFromPreset('M6'))).toBe('M6-2');
  });

  it('규격마다 따로 센다', () => {
    const list = [
      newTemplate('M6-1', insertFromPreset('M6')),
      newTemplate('M6-2', insertFromPreset('M6')),
    ];
    expect(defaultName(list, insertFromPreset('M5'))).toBe('M5-1');
  });

  it('중간을 지워도 번호가 겹치지 않는다', () => {
    // M6-1을 지우고 다시 만들면 M6-3이다. 이미 있는 M6-2와 부딪히지 않는다.
    const list = [newTemplate('M6-2', insertFromPreset('M6'))];
    expect(defaultName(list, insertFromPreset('M6'))).toBe('M6-3');
  });

  it('크기를 손으로 고쳤으면 치수를 쓴다', () => {
    // presetId가 남아 있어도 치수가 다르면 그 이름은 거짓이다.
    const tweaked = { ...insertFromPreset('M6'), height: 127 };
    expect(defaultName([], tweaked)).toBe('80x127-1');
  });

  it('손으로 붙인 이름은 세는 데 끼어들지 않는다', () => {
    const list = [newTemplate('위클리', insertFromPreset('M6'))];
    expect(defaultName(list, insertFromPreset('M6'))).toBe('M6-1');
  });
});

describe('반복 인쇄', () => {
  it('새로 만들면 single이다', () => {
    expect(newTemplate('가').repeat).toEqual({ mode: 'single' });
  });

  it('복제하면 반복 설정도 물려받는다', () => {
    const t = newTemplate('가');
    t.repeat = { mode: 'repeat', count: 54 };
    const copy = duplicateTemplate(t, '가 사본');
    expect(copy.repeat).toEqual({ mode: 'repeat', count: 54 });
  });

  it('복제본을 고쳐도 원본 반복 설정은 그대로다', () => {
    const t = newTemplate('가');
    t.repeat = { mode: 'repeat', count: 54 };
    const copy = duplicateTemplate(t, '가 사본');
    copy.repeat = { mode: 'repeat', count: 1 };
    expect(t.repeat).toEqual({ mode: 'repeat', count: 54 });
  });
});

describe('필요한 용지 장수', () => {
  it('칸 수로 나누어떨어지면 딱 맞는다', () => {
    expect(sheetsNeeded(54, 4)).toBe(14); // 54 = 4×13 + 2 → 14장
    expect(sheetsNeeded(8, 4)).toBe(2);
  });

  it('한 칸도 안 되면 0장이다', () => {
    expect(sheetsNeeded(0, 4)).toBe(0);
  });

  it('한 장에 칸이 없으면 0장이다', () => {
    expect(sheetsNeeded(10, 0)).toBe(0);
  });

  it('칸 수보다 적게 필요해도 한 장은 있어야 한다', () => {
    expect(sheetsNeeded(1, 4)).toBe(1);
  });
});
