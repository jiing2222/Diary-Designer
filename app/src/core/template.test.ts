import { describe, expect, it } from 'vitest';
import {
  backFromFront,
  capacityPerSheet,
  cutStackPage,
  defaultName,
  duplicateTemplate,
  ensureTemplateIdCounterAbove,
  frontBackFilled,
  groupBySize,
  insertFromPreset,
  newBack,
  newTemplate,
  outsideCount,
  printModeOf,
  refreshTemplateIds,
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

  it('만들면 색상판도 비어 있다', () => {
    expect(newTemplate('가').palette).toEqual({ main: null, subs: [] });
  });

  it('종류를 주지 않으면 속지다', () => {
    expect(newTemplate('가').kind).toBe('insert');
  });

  it('종류를 노트로 만들 수 있다', () => {
    expect(newTemplate('가', insertFromPreset('M6'), 'notebook').kind).toBe('notebook');
  });

  it('노트로 만들면 표지·쪽이 함께 생긴다', () => {
    const t = newTemplate('가', insertFromPreset('M6'), 'notebook');
    expect(t.cover?.front.objects.present).toEqual([]);
    expect(t.cover?.back.objects.present).toEqual([]);
    expect(t.pageCount).toBe(8);
    expect(t.pages).toHaveLength(8);
    expect(t.pages?.every((p) => p.objects.present.length === 0)).toBe(true);
  });

  it('속지로 만들면 표지·쪽이 없다', () => {
    const t = newTemplate('가');
    expect(t.cover).toBeUndefined();
    expect(t.pages).toBeUndefined();
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

  it('종류를 물려받는다', () => {
    const notebook = { ...source, kind: 'notebook' as const };
    expect(duplicateTemplate(notebook, '사본').kind).toBe('notebook');
  });

  it('노트의 표지·쪽을 물려받되 각자 새 되돌리기 이력으로 시작하고, 그린 것을 고쳐도 원본은 그대로다', () => {
    const notebook = newTemplate('노트', insertFromPreset('M6'), 'notebook');
    notebook.cover!.front.objects = commit(notebook.cover!.front.objects, [line(0, 0, 10, 10)]);
    notebook.pages![0].objects = commit(notebook.pages![0].objects, [line(1, 1, 5, 5)]);

    const copy = duplicateTemplate(notebook, '사본');
    expect(copy.cover!.front.objects.present).toEqual(notebook.cover!.front.objects.present);
    expect(copy.cover!.front.objects.past).toEqual([]);
    expect(copy.pages![0].objects.present).toEqual(notebook.pages![0].objects.present);
    expect(copy.pageCount).toBe(notebook.pageCount);

    copy.pages![0].objects = commit(copy.pages![0].objects, []);
    expect(notebook.pages![0].objects.present).toHaveLength(1);
  });

  it('색상판을 물려받되 원본과 배열을 공유하지 않는다', () => {
    const withPalette = { ...source, palette: { main: '#ff0000', subs: ['#00ff00'] } };
    const copy = duplicateTemplate(withPalette, '사본');
    expect(copy.palette).toEqual(withPalette.palette);

    // 사본의 서브색을 고쳐도 원본은 그대로여야 한다.
    copy.palette.subs.push('#0000ff');
    expect(withPalette.palette.subs).toEqual(['#00ff00']);
  });

  it('세트형에서 직접 손본 페이지도 물려받는다', () => {
    const withOverride = { ...source, pageOverrides: { 2: [line(0, 0, 5, 5)] } };
    const copy = duplicateTemplate(withOverride, '사본');
    expect(copy.pageOverrides).toEqual(withOverride.pageOverrides);
  });
});

describe('불러와 더할 때 새 id 주기', () => {
  it('양식과 그 안의 객체 모두 새 id를 받는다', () => {
    const t = newTemplate('위클리1', insertFromPreset('M6'));
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);

    const fresh = refreshTemplateIds(t);
    expect(fresh.id).not.toBe(t.id);
    expect(fresh.objects.present[0].id).not.toBe(t.objects.present[0].id);
  });

  it('겹치지 않아도 항상 새 id를 준다 — 다른 세션에서 저장한 두 파일이 같은 id를 쓸 수 있어서다', () => {
    const a = newTemplate('가');
    const b = newTemplate('나');
    const freshA = refreshTemplateIds(a);
    const freshB = refreshTemplateIds(b);
    expect(freshA.id).not.toBe(a.id);
    expect(freshB.id).not.toBe(b.id);
    expect(freshA.id).not.toBe(freshB.id);
  });

  it('내용(이름·자리·규격)은 그대로 옮긴다', () => {
    const t = newTemplate('위클리1', insertFromPreset('M6'));
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);

    const fresh = refreshTemplateIds(t);
    expect(fresh.name).toBe(t.name);
    expect(fresh.insert).toEqual(t.insert);
    expect(fresh.objects.present).toEqual([{ ...t.objects.present[0], id: fresh.objects.present[0].id }]);
  });

  it('뒷면 객체도 새 id를 받는다', () => {
    const t = newTemplate('가');
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);
    const back = backFromFront(t);
    t.back = back;

    const fresh = refreshTemplateIds(t);
    expect(fresh.back?.objects.present[0].id).not.toBe(back.objects.present[0].id);
  });

  it('뒷면이 없으면 그대로 없다', () => {
    const t = newTemplate('가');
    expect(refreshTemplateIds(t).back).toBeNull();
  });

  it('실행취소 이력은 물려주지 않는다', () => {
    const t = newTemplate('가');
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);
    expect(refreshTemplateIds(t).objects.past).toEqual([]);
  });

  it('세트형에서 직접 손본 페이지의 객체도 새 id를 받는다', () => {
    const t = { ...newTemplate('가'), pageOverrides: { 3: [line(0, 0, 5, 5)] } };
    const fresh = refreshTemplateIds(t);
    expect(fresh.pageOverrides?.[3][0].id).not.toBe(t.pageOverrides[3][0].id);
    // 자리 등 나머지 내용은 그대로다.
    expect(fresh.pageOverrides?.[3][0]).toEqual({ ...t.pageOverrides[3][0], id: fresh.pageOverrides![3][0].id });
  });

  it('손본 페이지가 없으면 그대로 없다', () => {
    const t = newTemplate('가');
    expect(refreshTemplateIds(t).pageOverrides).toBeUndefined();
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

describe('인쇄 방식', () => {
  it('속지는 repeat.mode를 따른다', () => {
    expect(printModeOf(newTemplate('가'))).toBe('combo');
    expect(printModeOf({ ...newTemplate('가'), repeat: { mode: 'repeat', count: 3 } })).toBe('repeat');
  });

  it('노트는 repeat.mode가 single이어도 늘 notebook이다', () => {
    // 노트는 만들어질 때 repeat이 single로 남지만(반복·세트형 개념이 따로
    // 없다), 낱장 조합(combo)에 다른 양식과 섞이면 안 된다.
    const t = newTemplate('가', undefined, 'notebook');
    expect(t.repeat).toEqual({ mode: 'single' });
    expect(printModeOf(t)).toBe('notebook');
  });

  it('양식이 없으면 combo다', () => {
    expect(printModeOf(null)).toBe('combo');
    expect(printModeOf(undefined)).toBe('combo');
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

describe('양면 인쇄 — 장수·칸 채우기', () => {
  it('한 장의 용량은 단면이면 그대로, 양면이면 두 배다', () => {
    expect(capacityPerSheet(4, false)).toBe(4);
    expect(capacityPerSheet(4, true)).toBe(8);
  });

  it('단면이면 sheetsNeeded와 같은 장수가 나온다', () => {
    // 예: 53쪽 · 한 장에 4칸 → 단면 14장 (설계문서 8장 예시)
    expect(sheetsNeeded(53, capacityPerSheet(4, false))).toBe(14);
  });

  it('양면이면 앞뒤를 합친 용량으로 장수가 줄어든다', () => {
    // 같은 예시가 양면이면 7장
    expect(sheetsNeeded(53, capacityPerSheet(4, true))).toBe(7);
  });

  it('단면이면 뒤는 항상 0이다', () => {
    expect(frontBackFilled(0, 10, 4, false)).toEqual({ front: 4, back: 0 });
    expect(frontBackFilled(2, 10, 4, false)).toEqual({ front: 2, back: 0 });
  });

  it('양면 — 앞을 다 채운 뒤 뒤를 채운다', () => {
    // 한 장 용량 8(=4×2). 총 5장이면 앞 4 + 뒤 1.
    expect(frontBackFilled(0, 5, 4, true)).toEqual({ front: 4, back: 1 });
  });

  it('양면 — 앞도 다 못 채우면 뒤는 0이다', () => {
    expect(frontBackFilled(0, 3, 4, true)).toEqual({ front: 3, back: 0 });
  });

  it('양면 — 앞뒤를 딱 채우고 끝나면 남는 장이 없다', () => {
    expect(frontBackFilled(0, 8, 4, true)).toEqual({ front: 4, back: 4 });
  });

  it('양면 — 다음 장은 다시 앞부터 채운다', () => {
    // 한 장 용량 8. 총 13장 → 0번 장(8칸: 앞4+뒤4), 1번 장(5칸: 앞4+뒤1)
    expect(frontBackFilled(1, 13, 4, true)).toEqual({ front: 4, back: 1 });
  });
});

describe('뒷면', () => {
  it('새 양식은 단면이다', () => {
    expect(newTemplate('가').back).toBeNull();
  });

  it('newBack은 빈 뒷면을 낸다', () => {
    const back = newBack();
    expect(back.objects.present).toEqual([]);
  });

  it('뒷면이 없으면 복제해도 단면이다', () => {
    const t = newTemplate('가');
    expect(duplicateTemplate(t, '가 사본').back).toBeNull();
  });

  it('뒷면이 있으면 복제할 때 물려받는다', () => {
    const t = newTemplate('가');
    t.back = newBack();
    t.back.objects = commit(t.back.objects, [line(10, 10, 70, 10)]);

    const copy = duplicateTemplate(t, '가 사본');
    expect(copy.back).not.toBeNull();
    expect(copy.back!.objects.present).toEqual(t.back.objects.present);
  });

  it('복제한 뒷면을 고쳐도 원본은 그대로다', () => {
    const t = newTemplate('가');
    t.back = newBack();
    t.back.objects = commit(t.back.objects, [line(10, 10, 70, 10)]);

    const copy = duplicateTemplate(t, '사본');
    copy.back!.objects = commit(copy.back!.objects, []);
    expect(t.back.objects.present).toHaveLength(1);
  });

  it('복제한 뒷면은 실행취소 이력을 물려받지 않는다', () => {
    const t = newTemplate('가');
    t.back = newBack();
    t.back.objects = commit(t.back.objects, [line(10, 10, 70, 10)]);

    const copy = duplicateTemplate(t, '사본');
    expect(copy.back!.objects.past).toEqual([]);
  });
});

describe('앞면을 뒷면으로 복사', () => {
  it('자리를 좌우로 뒤집어 뒷면에 낸다 — 타공이 반대쪽에 있어서다', () => {
    // 격자는 앞뒤 공유값이라 backFromFront가 따로 옮기지 않는다. 그림
    // 자리만 속지 폭(기본 규격 M6, 80mm) 기준으로 뒤집는다.
    const t = newTemplate('가'); // insert.width === 80
    t.objects = commit(t.objects, [line(10, 10, 70, 10), text(5, 5, 20, 8)]);

    const back = backFromFront(t);
    expect(back.objects.present).toEqual([
      { ...line(10, 10, 70, 10), x1: 70, x2: 10 }, // 80-10, 80-70
      { ...text(5, 5, 20, 8), x: 55 }, // 80-5-20
    ]);
    // 원본은 그대로다.
    expect(t.objects.present).toEqual([line(10, 10, 70, 10), text(5, 5, 20, 8)]);
  });

  it('실행취소 이력은 물려받지 않는다', () => {
    const t = newTemplate('가');
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);

    const back = backFromFront(t);
    expect(back.objects.past).toEqual([]);
  });

  it('뒷면을 고쳐도 앞면은 그대로다', () => {
    const t = newTemplate('가');
    t.objects = commit(t.objects, [line(10, 10, 70, 10)]);

    const back = backFromFront(t);
    back.objects = commit(back.objects, []);
    expect(t.objects.present).toHaveLength(1);
  });
});

describe('겹치기 배치', () => {
  it('설계문서 예시 — 53쪽 · 4칸에서 1장의 칸들은 1·15·29·43이다', () => {
    // 담당 쪽수 = ceil(53/4) = 14. n번째 칸·0번째 장 = n×14.
    expect(cutStackPage(0, 0, 53, 4)).toBe(0); // "1"
    expect(cutStackPage(0, 1, 53, 4)).toBe(14); // "15"
    expect(cutStackPage(0, 2, 53, 4)).toBe(28); // "29"
    expect(cutStackPage(0, 3, 53, 4)).toBe(42); // "43"
  });

  it('설계문서 예시 — 2장의 칸들은 2·16·30·44다', () => {
    expect(cutStackPage(1, 0, 53, 4)).toBe(1);
    expect(cutStackPage(1, 1, 53, 4)).toBe(15);
    expect(cutStackPage(1, 2, 53, 4)).toBe(29);
    expect(cutStackPage(1, 3, 53, 4)).toBe(43);
  });

  it('한 칸의 무더기(장을 넘나들며)는 쪽 번호가 이미 순서대로다', () => {
    // 담당 쪽수 14. 칸 0은 14개 장(0~13) 전부에서 쪽을 받는다(0~13).
    const slot0 = Array.from({ length: 14 }, (_, sheet) => cutStackPage(sheet, 0, 53, 4));
    expect(slot0).toEqual(Array.from({ length: 14 }, (_, i) => i));
  });

  it('마지막 칸은 데이터가 모자라면 뒤쪽 장부터 null이다', () => {
    // 칸 3의 구간(담당 쪽수 14)은 42~55인데 실제 쪽은 42~52(11개)뿐이다.
    const slot3 = Array.from({ length: 14 }, (_, sheet) => cutStackPage(sheet, 3, 53, 4));
    expect(slot3.slice(0, 11)).toEqual(Array.from({ length: 11 }, (_, i) => 42 + i));
    expect(slot3.slice(11)).toEqual([null, null, null]);
  });

  it('범위를 완전히 벗어난 칸은 null이다', () => {
    expect(cutStackPage(20, 0, 53, 4)).toBeNull();
  });

  it('그룹을 나누면 그룹 안에서만 담당 구간이 이어진다', () => {
    // 20쪽 · 4칸 · 그룹 5장 → 딱 한 그룹, 그룹 안 담당 쪽수 = ceil(20/4) = 5.
    // 그룹을 굳이 나눠도(전체가 한 그룹과 같은 크기라) 결과는 그룹 없을 때와 같다.
    for (let sheet = 0; sheet < 5; sheet++) {
      for (let slot = 0; slot < 4; slot++) {
        expect(cutStackPage(sheet, slot, 20, 4, 5)).toBe(cutStackPage(sheet, slot, 20, 4));
      }
    }
  });

  it('그룹마다 새로 시작하되, 그룹끼리는 이어진다', () => {
    // 40쪽 · 4칸 · 그룹 5장 → 두 그룹(각 20쪽어치). 그룹 1은 쪽 0~19,
    // 그룹 2는 쪽 20~39를 담당한다.
    // 그룹 1: 0번째 장 0번째 칸 = 쪽 0.
    expect(cutStackPage(0, 0, 40, 4, 5)).toBe(0);
    // 그룹 2의 첫 장(전체로는 5번째 장)의 첫 칸 = 그룹 시작 쪽(20) + 0.
    expect(cutStackPage(5, 0, 40, 4, 5)).toBe(20);
    // 그룹 2의 칸 1은 그룹 시작(20) + 담당쪽수(5) = 25.
    expect(cutStackPage(5, 1, 40, 4, 5)).toBe(25);
  });

  it('마지막 그룹이 짧아도 데이터가 모자란 칸만 null이다', () => {
    // 22쪽 · 4칸 · 그룹 5장(=20쪽어치) → 그룹 1(쪽 0~19, 꽉 참), 그룹 2(쪽
    // 20~21, 2쪽뿐 — 담당쪽수 ceil(2/4)=1이라 칸 0·1만 쪽을 받고 칸 2·3은 빈다).
    expect(cutStackPage(5, 0, 22, 4, 5)).toBe(20);
    expect(cutStackPage(5, 1, 22, 4, 5)).toBe(21);
    expect(cutStackPage(5, 2, 22, 4, 5)).toBeNull();
    expect(cutStackPage(5, 3, 22, 4, 5)).toBeNull();
  });

  it('그룹을 정하지 않으면 전체를 한 무더기로 본다', () => {
    expect(cutStackPage(0, 0, 53, 4, undefined)).toBe(cutStackPage(0, 0, 53, 4));
  });
});

describe('저장 파일을 불러온 뒤 양식 id 겹침 막기', () => {
  it('불러온 양식 id들보다 다음 id가 뒤에 온다', () => {
    const before = newTemplate('가');
    const beforeNum = Number(before.id.replace(/^t/, ''));

    ensureTemplateIdCounterAbove([`t${beforeNum + 50}`]);
    const after = newTemplate('나');

    expect(Number(after.id.replace(/^t/, ''))).toBeGreaterThan(beforeNum + 50);
  });
});
