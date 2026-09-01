import { beforeEach, describe, expect, it } from 'vitest';
import { activeTemplate, resolveSlotTemplates, useStore } from './store';
import { insertFromPreset } from './core/template';
import { DEFAULT_DOT_GRID } from './core/grid';
import type { UserImage } from './images/registry';
import type { DiaryObject } from './core/objects';

const s = () => useStore.getState();
const initial = useStore.getState();

/** 지금 양식. 없으면 시험이 잘못 짜인 것이므로 여기서 터지는 편이 낫다. */
const at = () => {
  const t = activeTemplate(s());
  if (!t) throw new Error('양식이 없습니다');
  return t;
};

beforeEach(() => useStore.setState(initial, true));

describe('설정 저장소', () => {
  it('용지 기본값은 A4다', () => {
    expect(s().paper.presetId).toBe('A4');
    expect(s().paper.width).toBe(210);
    expect(s().paper.height).toBe(297);
  });

  it('크기를 고치면 사용자 지정이 된다', () => {
    s().patchPaper({ width: 200 });
    expect(s().paper.presetId).toBe('custom');
  });

  it('크기가 아닌 것을 고쳐도 프리셋을 잃지 않는다', () => {
    // 여백이나 방향을 건드렸다고 무엇을 고르고 있었는지 잊으면 안 된다
    s().patchPaper({ printMargin: 5 });
    expect(s().paper.presetId).toBe('A4');

    s().patchPaper({ landscape: true });
    expect(s().paper.presetId).toBe('A4');
  });

  it('같은 값을 다시 넣는 것은 고친 것이 아니다', () => {
    // 숫자 칸을 지웠다 같은 값으로 되돌려도 프리셋이 풀리면 안 된다
    s().patchPaper({ width: 210 });
    expect(s().paper.presetId).toBe('A4');
  });

  it('속지도 같은 규칙을 따른다', () => {
    s().addTemplate(insertFromPreset('M6'));
    expect(at().insert.presetId).toBe('M6');

    s().patchInsert({ height: 127 }); // 브랜드마다 M6 세로가 다르다
    expect(at().insert.presetId).toBe('custom');
  });

  it('인쇄 불가 영역은 배치에 관여하지 않는다', () => {
    // 화면 안내일 뿐이다. 배치를 미는 것은 paper.printMargin 쪽이다.
    expect(s().unprintable).toEqual({ show: true, width: 3 });
    expect(s().paper.printMargin).toBe(0);
  });
});

describe('양식', () => {
  const names = () => s().templates.map((t) => t.name);

  it('처음에는 하나도 없다', () => {
    // 미리 하나 만들어두면 원하지 않는 규격으로 시작하게 된다.
    expect(s().templates).toEqual([]);
    expect(activeTemplate(s())).toBeNull();
  });

  it('없을 때 그리기를 해도 터지지 않는다', () => {
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().undo();
    s().deleteSelected();
    expect(s().templates).toEqual([]);
  });

  it('종류를 주지 않으면 속지고, 주면 그대로 따른다', () => {
    s().addTemplate(insertFromPreset('M6'));
    expect(at().kind).toBe('insert');

    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    expect(at().kind).toBe('notebook');
  });

  it('규격에서 이름이 나온다', () => {
    // 목록에서 어느 속지용인지 이름만 보고 알아야 한다.
    s().addTemplate(insertFromPreset('M6'));
    s().addTemplate(insertFromPreset('M6'));
    s().addTemplate(insertFromPreset('M5'));
    expect(names()).toEqual(['M6-1', 'M6-2', 'M5-1']);
  });

  it('새로 만들면 지금 규격을 물려받고 바로 열린다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().patchInsert({ width: 75 });
    s().addTemplate();

    expect(s().templates).toHaveLength(2);
    expect(at().insert.width).toBe(75);
    expect(at().id).toBe(s().templates[1].id);
  });

  it('그린 것이 양식마다 따로 남는다', () => {
    // 이 구조 변경의 핵심이다. 양식을 오가도 각자의 작업이 지켜져야 한다.
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    const first = s().activeId;

    s().addTemplate();
    expect(at().objects.present).toHaveLength(0);

    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]);
    expect(at().objects.present).toHaveLength(1);

    s().selectTemplate(first);
    expect(at().objects.present).toHaveLength(1);
    expect(at().objects.present[0]).toMatchObject({ y1: 10 });
  });

  it('실행취소도 양식마다 따로다', () => {
    // 양식을 바꿨다가 ⌘Z를 눌렀는데 다른 양식의 작업이 사라지면 무섭다.
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    const first = s().activeId;

    s().addTemplate();
    s().undo(); // 새 양식에는 되돌릴 것이 없다

    s().selectTemplate(first);
    expect(at().objects.present).toHaveLength(1);
  });

  it('격자도 양식마다 따로다', () => {
    s().addTemplate();
    s().patchDotGrid({ spacing: 2 });
    const first = s().activeId;

    s().addTemplate();
    expect(at().dotGrid.spacing).toBe(5);

    s().selectTemplate(first);
    expect(at().dotGrid.spacing).toBe(2);
  });

  it('색상판도 양식마다 따로다', () => {
    s().addTemplate();
    s().setPaletteMain('#ff0000');
    s().addPaletteColor('#00ff00');
    const first = s().activeId;

    s().addTemplate();
    expect(at().palette).toEqual({ main: null, subs: [] });

    s().selectTemplate(first);
    expect(at().palette).toEqual({ main: '#ff0000', subs: ['#00ff00'] });
  });

  it('서브색은 같은 색을 두 번 더하지 않는다', () => {
    s().addTemplate();
    s().addPaletteColor('#112233');
    s().addPaletteColor('#112233');
    expect(at().palette.subs).toEqual(['#112233']);
  });

  it('서브색을 지우면 그 색만 빠진다', () => {
    s().addTemplate();
    s().addPaletteColor('#111111');
    s().addPaletteColor('#222222');
    s().removePaletteColor(0);
    expect(at().palette.subs).toEqual(['#222222']);
  });

  it('복제하면 원본 바로 뒤에 들어간다', () => {
    s().addTemplate();
    s().addTemplate();
    s().renameTemplate(s().templates[0].id, '가');
    s().renameTemplate(s().templates[1].id, '나');

    s().copyTemplate(s().templates[0].id);
    expect(names()).toEqual(['가', '가 사본', '나']);
  });

  it('이름이 겹치지 않는다', () => {
    s().addTemplate();
    const id = s().activeId;
    s().copyTemplate(id);
    s().copyTemplate(id);
    expect(new Set(names()).size).toBe(names().length);
  });

  it('빈 이름으로는 바뀌지 않는다', () => {
    s().addTemplate();
    const before = at().name;
    s().renameTemplate(s().activeId, '   ');
    expect(at().name).toBe(before);
  });

  it('마지막 하나도 지울 수 있다', () => {
    // 빈 갤러리는 정상적인 상태다. 처음 열었을 때와 같은 모습이 된다.
    s().addTemplate();
    s().removeTemplate(s().activeId);
    expect(s().templates).toEqual([]);
    expect(activeTemplate(s())).toBeNull();
  });

  it('열려 있던 것을 지우면 남은 것으로 옮겨간다', () => {
    s().addTemplate();
    s().addTemplate();
    const open = s().activeId;
    s().removeTemplate(open);

    expect(s().templates).toHaveLength(1);
    expect(s().activeId).not.toBe(open);
    // 무엇을 고르든 activeTemplate은 언제나 무언가를 돌려준다.
    expect(activeTemplate(s())).toBeDefined();
  });

  it('양식을 바꾸면 고른 것이 풀린다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().select([at().objects.present[0].id]);

    s().addTemplate();
    // 다른 양식의 id가 선택 목록에 남아 있으면 지우기·스타일이 엉뚱하게 동작한다.
    expect(s().selectedIds).toEqual([]);
  });
});

describe('노트 — 표지·쪽', () => {
  it('표지 반쪽 하나를 통째로 갈아끼운다', () => {
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 };
    const half = { objects: { past: [], present: [line], future: [] }, dotGrid: { ...DEFAULT_DOT_GRID, spacing: 3 } };

    s().setNotebookHalf({ part: 'cover', side: 'front' }, half);
    expect(at().cover?.front).toEqual(half);
    expect(at().cover?.back.objects.present).toEqual([]); // 다른 반쪽은 그대로

    s().setNotebookHalf({ part: 'page', index: 2 }, half);
    expect(at().pages?.[2]).toEqual(half);
    expect(at().pages?.[0].objects.present).toEqual([]); // 다른 쪽은 그대로
  });

  it('쪽수를 바꾸면 pageCount와 pages 배열이 같이 바뀐다', () => {
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    expect(at().pageCount).toBe(8); // 기본값

    s().setNotebookPageCount(20);
    expect(at().pageCount).toBe(20);
    expect(at().pages).toHaveLength(20); // 20은 이미 4의 배수
  });

  it('4의 배수가 아니면 pages는 다음 4의 배수 길이로 맞춰진다', () => {
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    s().setNotebookPageCount(10);
    expect(at().pageCount).toBe(10); // 사용자가 원한 값은 그대로 기억한다
    expect(at().pages).toHaveLength(12); // 실제 배열은 4의 배수로
  });

  it('속지에는 아무 일도 하지 않는다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().setNotebookPageCount(20);
    expect(at().pageCount).toBeUndefined();
    expect(at().pages).toBeUndefined();
  });

  it('복사하기 — 소스 쪽에도 반영되고, 대상 쪽들에도 같은 내용이 퍼진다', () => {
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 };
    const half = { objects: { past: [], present: [line], future: [] }, dotGrid: { ...DEFAULT_DOT_GRID, spacing: 3 } };

    s().copyNotebookPage(half, 0, [2, 4]);

    expect(at().pages?.[0]).toEqual(half); // 소스 쪽에도 지금 그린 내용이 그대로 반영된다
    expect(at().pages?.[2].objects.present).toEqual([line]);
    expect(at().pages?.[4].objects.present).toEqual([line]);
    expect(at().pages?.[1].objects.present).toEqual([]); // 대상이 아닌 쪽은 그대로
  });

  it('복사하기 — 대상 쪽마다 되돌리기 이력을 따로 새로 시작한다', () => {
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    const half = { objects: { past: [[]], present: [], future: [] }, dotGrid: { ...DEFAULT_DOT_GRID } };

    s().copyNotebookPage(half, 0, [1, 2]);

    expect(at().pages?.[1].objects.past).toEqual([]);
    expect(at().pages?.[2].objects.past).toEqual([]);
    // 같은 History 참조를 나눠 가지면 안 된다 — 한 쪽을 되돌려도 다른 쪽은 그대로여야 한다.
    expect(at().pages?.[1].objects).not.toBe(at().pages?.[2].objects);
  });

  it('복사하기 — 대상 목록에 소스 자신이 들어 있어도 두 번 처리되지 않는다', () => {
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    const line: DiaryObject = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 };
    const half = { objects: { past: [], present: [line], future: [] }, dotGrid: { ...DEFAULT_DOT_GRID } };

    s().copyNotebookPage(half, 0, [0, 3]);

    expect(at().pages?.[0]).toEqual(half); // 소스는 원본 그대로(복제되지 않음)
    expect(at().pages?.[3].objects.present).toEqual([line]);
  });
});

describe('객체 복사·붙여넣기', () => {
  it('아무것도 안 골랐으면 복사해도 클립보드가 비어 있다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().copySelected();
    expect(s().clipboard).toEqual([]);
  });

  it('고른 것을 클립보드에 담는다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    const id = at().objects.present[0].id;
    s().select([id]);
    s().copySelected();
    expect(s().clipboard).toHaveLength(1);
    expect(s().clipboard[0]).toMatchObject({ x1: 10, y1: 10, x2: 70, y2: 10 });
  });

  it('붙여넣으면 새 id로 하나 더 생기고 원본은 그대로다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    const original = at().objects.present[0];
    s().select([original.id]);
    s().copySelected();

    s().pasteClipboard();
    expect(at().objects.present).toHaveLength(2);
    const pasted = at().objects.present.find((o) => o.id !== original.id);
    expect(pasted).toBeDefined();
    expect(pasted!.id).not.toBe(original.id);
    // 겹치지 않게 살짝 옮겨진다.
    expect(pasted).toMatchObject({ x1: 15, y1: 15, x2: 75, y2: 15 });
    expect(at().objects.present).toContainEqual(original);
  });

  it('격자 간격이 5mm의 배수가 아니면, 붙여넣을 때 미는 양도 그 간격의 배수로 올린다', () => {
    // PASTE_OFFSET(5mm)을 그대로 밀면 간격 4mm에서는 도트를 1mm 벗어난다 —
    // 5를 4의 배수로 올림한 8mm를 밀어야 원본처럼 도트 위에 남는다.
    s().addTemplate();
    s().patchDotGrid({ spacing: 4 });
    s().drawLines([{ x1: 8, y1: 8, x2: 16, y2: 8 }]);
    const original = at().objects.present[0];
    s().select([original.id]);
    s().copySelected();

    s().pasteClipboard();
    const pasted = at().objects.present.find((o) => o.id !== original.id);
    expect(pasted).toMatchObject({ x1: 16, y1: 16, x2: 24, y2: 16 });
  });

  it('인쇄하기 낱장 조합에서 지금 손보는 칸이 활성 양식과 다른 격자를 쓰면, 붙여넣기는 그 칸(그림자)의 격자를 따른다', () => {
    // 활성 양식은 5mm 격자, 지금 손보는 칸(그림자)에는 3mm 격자를 배정
    // 받았다고 흉내낸다 — 낱장 조합에서 칸마다 다른 양식을 배정하면 흔한
    // 상황이다. 5를 3의 배수로 올림하면 6이어야 한다(활성 양식 기준
    // 5였다면 어긋난다).
    s().addTemplate();
    expect(at().dotGrid.spacing).toBe(5);
    const shadowGrid = { ...DEFAULT_DOT_GRID, spacing: 3 };
    s().beginShadowEdit(insertFromPreset('M6'), shadowGrid, [], 'front');
    s().drawLines([{ x1: 9, y1: 9, x2: 15, y2: 9 }]);
    const original = s().shadowTemplate!.objects.present[0];
    s().select([original.id]);
    s().copySelected();

    s().pasteClipboard();
    const pasted = s().shadowTemplate!.objects.present.find((o) => o.id !== original.id);
    expect(pasted).toMatchObject({ x1: 15, y1: 15, x2: 21, y2: 15 });
  });

  it('붙여넣은 것이 선택된다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().select([at().objects.present[0].id]);
    s().copySelected();

    s().pasteClipboard();
    const pastedId = at().objects.present.find((o) => !s().clipboard.map((c) => c.id).includes(o.id))!.id;
    expect(s().selectedIds).toEqual([pastedId]);
  });

  it('여러 번 붙여넣으면 매번 새 id로 늘어난다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().select([at().objects.present[0].id]);
    s().copySelected();

    s().pasteClipboard();
    s().pasteClipboard();
    expect(at().objects.present).toHaveLength(3);
    const ids = new Set(at().objects.present.map((o) => o.id));
    expect(ids.size).toBe(3);
  });

  it('클립보드가 비어 있으면 붙여넣어도 아무 일도 하지 않는다', () => {
    s().addTemplate();
    s().pasteClipboard();
    expect(at().objects.present).toEqual([]);
  });

  it('다른 면(뒷면)에 붙여넣으면 자리를 그대로 유지한다', () => {
    // 사용자 피드백 — 앞면에서 복사해 뒷면에 붙이면 "이전 면과 같은 위치"를
    // 기대한다. 같은 면에서 그대로 붙여넣을 때만(위 테스트들) 겹치지 않게
    // 살짝 민다.
    s().addTemplate();
    s().addBack();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().select([at().objects.present[0].id]);
    s().copySelected();

    s().setSide('back');
    s().pasteClipboard();
    expect(at().back!.objects.present).toHaveLength(1);
    expect(at().back!.objects.present[0]).toMatchObject({ x1: 10, y1: 10, x2: 70, y2: 10 });
  });

  it('그림자 세션이 바뀌면(예: 노트의 다른 쪽) 다른 면으로 친다', () => {
    s().addTemplate();
    s().beginShadowEdit(insertFromPreset('M6'), DEFAULT_DOT_GRID, [], 'front');
    s().drawLines([{ x1: 5, y1: 5, x2: 20, y2: 5 }]);
    s().select([s().shadowTemplate!.objects.present[0].id]);
    s().copySelected();
    s().endShadowEdit();

    // 새 그림자 세션(다른 노트 쪽을 손보는 상황을 흉내낸다) — shadowSide는
    // 둘 다 'front'라 shadowToken으로만 구별된다.
    s().beginShadowEdit(insertFromPreset('M6'), DEFAULT_DOT_GRID, [], 'front');
    s().pasteClipboard();
    expect(s().shadowTemplate!.objects.present[0]).toMatchObject({ x1: 5, y1: 5, x2: 20, y2: 5 });
  });

  it('그룹을 복사·붙여넣으면 사본끼리만 묶인 새 그룹이 된다 — 원본과는 갈라진다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 30, y2: 10 }]);
    s().drawLines([{ x1: 10, y1: 20, x2: 30, y2: 20 }]);
    const [a, b] = at().objects.present;
    s().select([a.id, b.id]);
    s().groupSelected();
    s().copySelected();

    s().pasteClipboard();
    const pasted = at().objects.present.filter((o) => o.id !== a.id && o.id !== b.id);
    expect(pasted).toHaveLength(2);
    const originalGroupId = at().objects.present.find((o) => o.id === a.id)!.groupId;
    expect(pasted[0].groupId).toBeDefined();
    expect(pasted[0].groupId).not.toBe(originalGroupId);
    expect(pasted[0].groupId).toBe(pasted[1].groupId);

    // 원본 하나만 다시 고르면 사본은 안 딸려온다 — 그룹이 갈라졌다는 뜻이다.
    s().select([a.id]);
    expect(new Set(s().selectedIds)).toEqual(new Set([a.id, b.id]));
  });
});

describe('객체 그룹화', () => {
  it('2개 미만이면 그룹화해도 아무 일도 하지 않는다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 30, y2: 10 }]);
    s().select([at().objects.present[0].id]);
    s().groupSelected();
    expect(at().objects.present[0].groupId).toBeUndefined();
  });

  it('2개 이상 고르고 그룹화하면 같은 groupId를 받는다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 30, y2: 10 }]);
    s().drawLines([{ x1: 10, y1: 20, x2: 30, y2: 20 }]);
    const [a, b] = at().objects.present;
    s().select([a.id, b.id]);
    s().groupSelected();
    const [ga, gb] = at().objects.present;
    expect(ga.groupId).toBeDefined();
    expect(ga.groupId).toBe(gb.groupId);
  });

  it('그룹 멤버 하나만 골라도 select가 전체 그룹을 채운다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 30, y2: 10 }]);
    s().drawLines([{ x1: 10, y1: 20, x2: 30, y2: 20 }]);
    const [a, b] = at().objects.present;
    s().select([a.id, b.id]);
    s().groupSelected();

    s().select([a.id]);
    expect(new Set(s().selectedIds)).toEqual(new Set([a.id, b.id]));
  });

  it('그룹 해제하면 groupId가 사라지고, 이후엔 하나만 골라진다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 30, y2: 10 }]);
    s().drawLines([{ x1: 10, y1: 20, x2: 30, y2: 20 }]);
    const [a, b] = at().objects.present;
    s().select([a.id, b.id]);
    s().groupSelected();

    s().ungroupSelected();
    expect(at().objects.present.every((o) => o.groupId === undefined)).toBe(true);

    s().select([a.id]);
    expect(s().selectedIds).toEqual([a.id]);
  });

  it('이미 그룹인 것들을 다시 그룹화하면 새 그룹으로 옮겨간다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 30, y2: 10 }]);
    s().drawLines([{ x1: 10, y1: 20, x2: 30, y2: 20 }]);
    s().drawLines([{ x1: 10, y1: 30, x2: 30, y2: 30 }]);
    const [a, b, c] = at().objects.present;
    s().select([a.id, b.id]);
    s().groupSelected();
    const firstGroupId = at().objects.present[0].groupId;

    s().select([a.id, b.id, c.id]);
    s().groupSelected();
    const [ga, gb, gc] = at().objects.present;
    expect(ga.groupId).toBe(gb.groupId);
    expect(ga.groupId).toBe(gc.groupId);
    expect(ga.groupId).not.toBe(firstGroupId);
  });
});

describe('저장 파일 불러오기', () => {
  it('양식이 통째로 갈아끼워진다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().addTemplate();
    expect(s().templates).toHaveLength(2);

    s().loadProject({
      version: 1,
      savedAt: '',
      templates: [
        {
          id: 'x1',
          name: '불러온것',
          insert: insertFromPreset('A5'),
          dotGrid: { ...DEFAULT_DOT_GRID, spacing: 7 },
          objects: [],
        },
      ],
      print: {},
      fonts: [],
    });

    expect(s().templates).toHaveLength(1);
    expect(at().name).toBe('불러온것');
    expect(at().insert.width).toBe(148);
    expect(at().dotGrid.spacing).toBe(7);
    // 이전 양식의 id가 선택 목록에 남으면 지우기가 엉뚱하게 동작한다.
    expect(s().selectedIds).toEqual([]);
  });

  it('불러온 파일 속 id와 그 뒤에 새로 그은 것의 id가 겹치지 않는다', () => {
    // 새로고침 뒤 카운터가 0부터 다시 시작해도, 불러온 파일 속 id(일부러
    // 아주 크게 잡았다)보다 다음 id가 뒤에 오는지 본다 — 안 그러면 새로
    // 그은 선이 파일 속 선과 id가 겹쳐, 리액트가 같은 key로 보고 하나만
    // 그리거나 골라도 엉뚱한 것이 옮겨지는 사고가 난다.
    s().loadProject({
      version: 1,
      savedAt: '',
      templates: [
        {
          id: 't1',
          name: '불러온것',
          insert: insertFromPreset('M6'),
          dotGrid: DEFAULT_DOT_GRID,
          objects: [{ id: 'l99999', type: 'line', x1: 10, y1: 10, x2: 70, y2: 10 }],
        },
      ],
      print: {},
      fonts: [],
    });

    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]);
    const ids = at().objects.present.map((o) => o.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // 겹치는 id가 없다
    expect(ids).toContain('l99999');
  });

  it('용지 설정도 함께 돌아온다', () => {
    s().patchPaper({ landscape: true });
    s().loadProject({
      version: 1,
      savedAt: '',
      templates: [
        { id: 'x1', name: '가', insert: insertFromPreset('M6'), dotGrid: DEFAULT_DOT_GRID, objects: [] },
      ],
      print: { paper: { presetId: 'A4', width: 210, height: 297, landscape: false, printMargin: 0 }, gap: 3 },
      fonts: [],
    });

    expect(s().paper.landscape).toBe(false);
    expect(s().gap).toBe(3);
  });

  it('글꼴은 이름만 돌아오고 파일은 없다', () => {
    s().loadProject({
      version: 1,
      savedAt: '',
      templates: [
        { id: 'x1', name: '가', insert: insertFromPreset('M6'), dotGrid: DEFAULT_DOT_GRID, objects: [] },
      ],
      print: {},
      fonts: [{ id: 'f3', name: '내글꼴' }],
    });

    expect(s().userFonts).toEqual([{ id: 'f3', name: '내글꼴', family: 'user-font-f3' }]);
  });
});

describe('양식 하나짜리 파일을 더해 불러오기', () => {
  it('갈아끼우지 않고 지금 프로젝트 끝에 더한다', () => {
    s().addTemplate();
    s().renameTemplate(at().id, '기존양식');
    expect(s().templates).toHaveLength(1);

    s().importTemplates([
      {
        id: 'x1',
        name: '불러온것',
        insert: insertFromPreset('A5'),
        dotGrid: DEFAULT_DOT_GRID,
        kind: 'insert',
        palette: { main: null, subs: [] },
        objects: { present: [], past: [], future: [] },
        repeat: { mode: 'single' },
        back: null,
      },
    ]);

    expect(s().templates).toHaveLength(2);
    expect(s().templates[0].name).toBe('기존양식');
    expect(at().name).toBe('불러온것'); // 방금 더한 것이 활성 양식이 된다
  });

  it('id가 지금 프로젝트의 기존 객체와 겹쳐도 새 id를 받아 안전하다', () => {
    // 다른 날 따로 저장한 두 파일은 newId 카운터가 각각 0부터 시작해
    // 거의 항상 같은 id를 쓴다 — 그대로 더하면 지금 프로젝트의 기존
    // 객체와 겹쳐 마퀴 선택이 깨졌던 것과 같은 문제가 생긴다.
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    const existingId = at().objects.present[0].id;

    s().importTemplates([
      {
        id: at().id, // 양식 id도 지금 활성 양식과 똑같이 겹치게 일부러 맞춘다
        name: '불러온것',
        insert: insertFromPreset('M6'),
        dotGrid: DEFAULT_DOT_GRID,
        kind: 'insert',
        palette: { main: null, subs: [] },
        objects: { present: [{ id: existingId, type: 'line', x1: 20, y1: 20, x2: 60, y2: 20 }], past: [], future: [] },
        repeat: { mode: 'single' },
        back: null,
      },
    ]);

    expect(s().templates).toHaveLength(2);
    expect(s().templates[0].id).not.toBe(s().templates[1].id);
    expect(at().objects.present[0].id).not.toBe(existingId);
  });

  it('이름이 겹치면 새 이름을 받는다', () => {
    s().addTemplate();
    s().renameTemplate(at().id, '위클리1');

    s().importTemplates([
      {
        id: 'x1',
        name: '위클리1',
        insert: insertFromPreset('M6'),
        dotGrid: DEFAULT_DOT_GRID,
        kind: 'insert',
        palette: { main: null, subs: [] },
        objects: { present: [], past: [], future: [] },
        repeat: { mode: 'single' },
        back: null,
      },
    ]);

    expect(at().name).not.toBe('위클리1');
    expect(s().templates.map((t) => t.name)).toContain('위클리1');
  });

  it('용지 설정은 건드리지 않는다', () => {
    // 용지·배치는 양식이 아니라 지금 프로젝트에 속한 값이다.
    s().patchPaper({ landscape: true });
    s().importTemplates([
      {
        id: 'x1',
        name: '가',
        insert: insertFromPreset('M6'),
        dotGrid: DEFAULT_DOT_GRID,
        kind: 'insert',
        palette: { main: null, subs: [] },
        objects: { present: [], past: [], future: [] },
        repeat: { mode: 'single' },
        back: null,
      },
    ]);
    expect(s().paper.landscape).toBe(true);
  });
});

describe('낱장 조합 — 칸 배정', () => {
  it('배정이 없으면 모든 칸이 지금 양식이다', () => {
    s().addTemplate(insertFromPreset('M6'));
    expect(resolveSlotTemplates(s(), 3).every((t) => t.id === s().activeId)).toBe(true);
  });

  it('같은 규격으로 배정하면 그 칸만 바뀐다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const first = s().activeId;
    s().addTemplate(insertFromPreset('M6'));
    const second = s().activeId;
    s().selectTemplate(first);

    s().assignSlot(1, second);
    const slots = resolveSlotTemplates(s(), 3);
    expect(slots[0].id).toBe(first);
    expect(slots[1].id).toBe(second);
    expect(slots[2].id).toBe(first);
  });

  it('규격이 다른 양식을 배정하면 무시하고 지금 양식으로 돌아간다', () => {
    // 배치 계산(칸 크기)이 한 규격으로 한 번만 일어나기 때문이다.
    s().addTemplate(insertFromPreset('M6'));
    const m6 = s().activeId;
    s().addTemplate(insertFromPreset('M5'));
    const m5 = s().activeId;
    s().selectTemplate(m6);

    s().assignSlot(0, m5);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(m6);
  });

  it('null로 배정을 지우면 다시 기본값이다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const first = s().activeId;
    s().addTemplate(insertFromPreset('M6'));
    const second = s().activeId;
    s().selectTemplate(first);

    s().assignSlot(0, second);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(second);

    s().assignSlot(0, null);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(first);
  });

  it('배정된 양식을 지우면 그 칸도 기본값으로 돌아간다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const first = s().activeId;
    s().addTemplate(insertFromPreset('M6'));
    const second = s().activeId;
    s().selectTemplate(first);
    s().assignSlot(0, second);

    s().removeTemplate(second);
    expect(s().slotAssignment[0]).toBeUndefined();
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(first);
  });

  it('노트로 배정하면 유효하지 않아 지금 양식으로 대신한다', () => {
    // 노트는 repeat이 single로 남아 있지만 낱장 조합에 다른 양식과 섞이면
    // 안 된다 — 표지+쪽 전체가 하나의 인쇄 단위라서다.
    s().addTemplate(insertFromPreset('M6'));
    const insertId = s().activeId;
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    const notebookId = s().activeId;
    s().selectTemplate(insertId);

    s().assignSlot(0, notebookId);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(insertId);
  });

  it('양식이 하나도 없으면 빈 배열이다', () => {
    expect(resolveSlotTemplates(s(), 4)).toEqual([]);
  });
});

describe('인쇄하기에서 직접 손본 내용 — 낱장 조합 칸', () => {
  const obj = (id: string): DiaryObject => ({ id, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });

  it('손보면 그 칸에 저장된다', () => {
    s().setComboSlotOverride(2, 'front', [obj('a')]);
    expect(s().comboSlotOverrides[2]).toEqual([obj('a')]);
  });

  it('앞뒤가 따로 저장된다', () => {
    s().setComboSlotOverride(0, 'front', [obj('a')]);
    s().setComboSlotOverride(0, 'back', [obj('b')]);
    expect(s().comboSlotOverrides[0]).toEqual([obj('a')]);
    expect(s().comboSlotBackOverrides[0]).toEqual([obj('b')]);
  });

  it('되돌리기(clear)로 다시 지운다', () => {
    s().setComboSlotOverride(1, 'front', [obj('a')]);
    s().clearComboSlotOverride(1, 'front');
    expect(s().comboSlotOverrides[1]).toBeUndefined();
  });

  it('다른 칸의 값은 그대로다', () => {
    s().setComboSlotOverride(0, 'front', [obj('a')]);
    s().setComboSlotOverride(1, 'front', [obj('b')]);
    s().clearComboSlotOverride(0, 'front');
    expect(s().comboSlotOverrides[1]).toEqual([obj('b')]);
  });
});

describe('인쇄하기에서 직접 손본 내용 — 세트형 페이지', () => {
  const obj = (id: string): DiaryObject => ({ id, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });

  it('손보면 지금 양식의 그 페이지에 저장된다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().setPageOverride(3, 'front', [obj('a')]);
    expect(at().pageOverrides?.[3]).toEqual([obj('a')]);
  });

  it('다른 양식에는 안 남는다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const first = s().activeId;
    s().addTemplate(insertFromPreset('M6'));
    s().selectTemplate(first);

    s().setPageOverride(0, 'front', [obj('a')]);
    s().selectTemplate(s().templates.find((t) => t.id !== first)!.id);
    expect(at().pageOverrides?.[0]).toBeUndefined();
  });

  it('되돌리기(clear)로 다시 지우면 다른 페이지는 그대로다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().setPageOverride(0, 'front', [obj('a')]);
    s().setPageOverride(1, 'front', [obj('b')]);

    s().clearPageOverride(0, 'front');
    expect(at().pageOverrides?.[0]).toBeUndefined();
    expect(at().pageOverrides?.[1]).toEqual([obj('b')]);
  });
});

describe('그림자 양식 — 인쇄하기에서 칸·페이지를 직접 그리기', () => {
  it('시작하면 지금 준 내용으로 채워지고, 진짜 양식(templates)에는 안 들어간다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const realId = s().activeId;
    const seed: DiaryObject[] = [{ id: 'seed', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }];

    s().beginShadowEdit(at().insert, at().dotGrid, seed, 'front');

    expect(s().shadowTemplate?.objects.present).toEqual(seed);
    // activeId는 그대로다 — 인쇄하기 화면의 나머지 부분이 안 바뀌어야 한다.
    expect(s().activeId).toBe(realId);
    expect(s().templates.some((t) => t.id === '__shadow__')).toBe(false);
  });

  it('그림자를 손보는 동안 그리기 액션은 그림자만 바꾸고, 진짜 활성 양식은 그대로다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().drawLines([{ x1: 5, y1: 5, x2: 50, y2: 5 }]); // 진짜 양식에 먼저 선 하나
    const before = at().objects.present;

    s().beginShadowEdit(at().insert, at().dotGrid, [], 'front');
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);

    expect(s().shadowTemplate?.objects.present).toHaveLength(1);
    expect(at().objects.present).toEqual(before); // 진짜 양식은 안 바뀜
  });

  it('뒷면을 손보면 그림자의 back에 담긴다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const seed: DiaryObject[] = [{ id: 'b1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }];
    s().beginShadowEdit(at().insert, at().dotGrid, seed, 'back');

    expect(s().shadowTemplate?.back?.objects.present).toEqual(seed);
    expect(s().shadowTemplate?.objects.present).toEqual([]); // 앞면 쪽은 안 씀

    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]);
    expect(s().shadowTemplate?.back?.objects.present).toHaveLength(2);
  });

  it('실행취소·다시실행이 그림자 세션 안에서만 동작한다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().beginShadowEdit(at().insert, at().dotGrid, [], 'front');
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    expect(s().shadowTemplate?.objects.present).toHaveLength(1);

    s().undo();
    expect(s().shadowTemplate?.objects.present).toHaveLength(0);

    s().redo();
    expect(s().shadowTemplate?.objects.present).toHaveLength(1);
  });

  it('끝내면(endShadowEdit) 사라지고, 그 뒤 그리기는 다시 진짜 활성 양식을 바꾼다', () => {
    s().addTemplate(insertFromPreset('M6'));
    s().beginShadowEdit(at().insert, at().dotGrid, [], 'front');
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().endShadowEdit();

    expect(s().shadowTemplate).toBeNull();
    expect(at().objects.present).toEqual([]); // 그림자에 그린 것은 진짜 양식에 안 남는다

    s().drawLines([{ x1: 1, y1: 1, x2: 2, y2: 1 }]);
    expect(at().objects.present).toHaveLength(1);
  });

  it('노트를 그림자로 손보는 동안은 patchDotGrid가 그림자의 격자를 고친다', () => {
    // 노트는 반쪽마다 격자가 따로다(NotebookHalf.dotGrid) — 속지처럼
    // 양식 하나가 공유하는 dotGrid를 고치면 안 된다.
    s().addTemplate(insertFromPreset('M6'), undefined, undefined, 'notebook');
    const templateGridBefore = at().dotGrid.spacing;
    s().beginShadowEdit(at().insert, at().cover!.front.dotGrid, [], 'front');

    s().patchDotGrid({ spacing: 9 });

    expect(s().shadowTemplate?.dotGrid.spacing).toBe(9);
    expect(at().dotGrid.spacing).toBe(templateGridBefore); // 양식 공유값은 안 바뀐다
  });

  it('속지를 그림자로 손보는 동안은(인쇄하기 칸 손보기) patchDotGrid가 그대로 양식을 고친다', () => {
    // 기존 동작 — 인쇄하기의 칸 손보기는 격자 설정 패널과 어긋나면 안 된다.
    s().addTemplate(insertFromPreset('M6'));
    s().beginShadowEdit(at().insert, at().dotGrid, [], 'front');

    s().patchDotGrid({ spacing: 9 });

    expect(at().dotGrid.spacing).toBe(9);
  });
});

describe('반복 인쇄 설정', () => {
  const sampleDataset = {
    kind: 'date' as const,
    perPage: 7,
    start: '2027-01-01',
    end: '2027-12-31',
    step: 'day' as const,
  };

  it('새 양식은 single이다', () => {
    s().addTemplate();
    expect(at().repeat).toEqual({ mode: 'single' });
  });

  it('patchRepeat이 지금 양식만 바꾼다', () => {
    s().addTemplate();
    const first = s().activeId;
    s().addTemplate();

    s().patchRepeat({ mode: 'repeat', count: 54 });
    expect(at().repeat).toEqual({ mode: 'repeat', count: 54 });

    s().selectTemplate(first);
    expect(at().repeat).toEqual({ mode: 'single' });
  });

  it('세트형(dataset)도 저장된다', () => {
    s().addTemplate();
    s().patchRepeat({ mode: 'dataset', dataset: sampleDataset });
    expect(at().repeat).toEqual({ mode: 'dataset', dataset: sampleDataset });
  });
});

describe('반복 양식은 낱장 조합에 낄 수 없다', () => {
  it('배정된 양식이 나중에 repeat으로 바뀌면 기본값으로 돌아간다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const first = s().activeId;
    s().addTemplate(insertFromPreset('M6'));
    const second = s().activeId;
    s().selectTemplate(first);
    s().assignSlot(0, second);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(second);

    // second가 반복 양식으로 바뀐 뒤에는 더 이상 낱장 조합에 낄 수 없다.
    s().selectTemplate(second);
    s().patchRepeat({ mode: 'repeat', count: 10 });
    s().selectTemplate(first);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(first);
  });

  it('세트형으로 바뀌어도 마찬가지다', () => {
    s().addTemplate(insertFromPreset('M6'));
    const first = s().activeId;
    s().addTemplate(insertFromPreset('M6'));
    const second = s().activeId;
    s().selectTemplate(first);
    s().assignSlot(0, second);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(second);

    s().selectTemplate(second);
    s().patchRepeat({
      mode: 'dataset',
      dataset: {
        kind: 'date',
        perPage: 7,
        start: '2027-01-01',
        end: '2027-12-31',
        step: 'day',
      },
    });
    s().selectTemplate(first);
    expect(resolveSlotTemplates(s(), 1)[0].id).toBe(first);
  });
});

describe('앞면·뒷면', () => {
  it('새 양식은 앞면부터 보여주고 뒷면이 없다', () => {
    s().addTemplate();
    expect(s().side).toBe('front');
    expect(at().back).toBeNull();
  });

  it('addBack으로 뒷면을 만든다', () => {
    s().addTemplate();
    s().addBack();
    expect(at().back).not.toBeNull();
    expect(at().back!.objects.present).toEqual([]);
  });

  it('이미 뒷면이 있으면 addBack이 덮어쓰지 않는다', () => {
    s().addTemplate();
    s().addBack();
    s().setSide('back');
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);

    s().addBack();
    expect(at().back!.objects.present).toHaveLength(1);
  });

  it('뒷면이 없으면 뒷면 쪽에 그려도 아무 일도 없다', () => {
    s().addTemplate();
    s().setSide('back');
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    expect(at().back).toBeNull();
  });

  it('그린 것이 앞뒤 따로 쌓인다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().addBack();
    s().setSide('back');
    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]);

    expect(at().objects.present).toHaveLength(1);
    expect(at().back!.objects.present).toHaveLength(1);
    expect(at().back!.objects.present[0]).toMatchObject({ y1: 20 });

    s().setSide('front');
    expect(at().objects.present[0]).toMatchObject({ y1: 10 });
  });

  it('격자는 앞뒤가 공유한다 — 어느 쪽에서 고쳐도 둘 다 바뀐다', () => {
    s().addTemplate();
    s().addBack();
    s().setSide('back');
    s().patchDotGrid({ spacing: 2 });
    // 뒷면에서 고쳤지만 공유값이라 앞면에서 봐도 바뀌어 있다.
    expect(at().dotGrid.spacing).toBe(2);

    s().setSide('front');
    expect(at().dotGrid.spacing).toBe(2);
    s().patchDotGrid({ spacing: 7 });
    s().setSide('back');
    expect(at().dotGrid.spacing).toBe(7);
  });

  it('실행취소가 앞뒤 따로다', () => {
    s().addTemplate();
    s().drawLines([{ x1: 10, y1: 10, x2: 70, y2: 10 }]);
    s().addBack();
    s().setSide('back');
    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]);

    s().undo();
    expect(at().back!.objects.present).toHaveLength(0);

    s().setSide('front');
    expect(at().objects.present).toHaveLength(1);
  });

  it('removeBack이 뒷면을 지우고 앞면으로 돌아간다', () => {
    s().addTemplate();
    s().addBack();
    s().setSide('back');
    s().removeBack();
    expect(at().back).toBeNull();
    expect(s().side).toBe('front');
  });

  it('selectTemplate은 앞면으로 돌아간다', () => {
    s().addTemplate();
    const id = s().activeId;
    s().addBack();
    s().setSide('back');
    s().selectTemplate(id);
    expect(s().side).toBe('front');
  });

  it('addTemplate은 앞면부터 보여준다', () => {
    s().addTemplate();
    s().addBack();
    s().setSide('back');
    s().addTemplate();
    expect(s().side).toBe('front');
  });

  it('copyTemplate한 사본도 앞면부터 보여준다', () => {
    s().addTemplate();
    s().addBack();
    s().setSide('back');
    s().copyTemplate(s().activeId);
    expect(s().side).toBe('front');
  });

  it('loadProject 뒤에는 앞면부터 보여준다', () => {
    s().addTemplate();
    s().setSide('back');
    s().loadProject({
      version: 1,
      savedAt: '',
      templates: [
        { id: 'x1', name: '가', insert: insertFromPreset('M6'), dotGrid: DEFAULT_DOT_GRID, objects: [] },
      ],
      print: {},
      fonts: [],
    });
    expect(s().side).toBe('front');
  });
});

describe('경계를 넘어 이은 선', () => {
  it('반쪽 둘을 각자의 쪽에 커밋하고, 준 쪽으로 초점을 옮긴다', () => {
    s().addTemplate();
    s().addBack();
    s().commitCrossBoundaryLine({ x1: 70, y1: 10, x2: 80, y2: 15 }, { x1: 0, y1: 15, x2: 10, y2: 20 }, 'front');

    s().setSide('back');
    expect(at().back!.objects.present).toHaveLength(1);
    expect(at().back!.objects.present[0]).toMatchObject({ x1: 70, y1: 10, x2: 80, y2: 15 });

    s().setSide('front');
    expect(at().objects.present).toHaveLength(1);
    expect(at().objects.present[0]).toMatchObject({ x1: 0, y1: 15, x2: 10, y2: 20 });

    expect(s().side).toBe('front');
  });

  it('한 번 되돌리면 반쪽 둘 다 없어진다', () => {
    s().addTemplate();
    s().addBack();
    s().commitCrossBoundaryLine({ x1: 70, y1: 10, x2: 80, y2: 15 }, { x1: 0, y1: 15, x2: 10, y2: 20 }, 'front');

    s().undo();
    expect(at().objects.present).toHaveLength(0);
    s().setSide('back');
    expect(at().back!.objects.present).toHaveLength(0);
  });

  it('다시실행하면 반쪽 둘 다 돌아온다', () => {
    s().addTemplate();
    s().addBack();
    s().commitCrossBoundaryLine({ x1: 70, y1: 10, x2: 80, y2: 15 }, { x1: 0, y1: 15, x2: 10, y2: 20 }, 'front');
    s().undo();

    s().redo();
    expect(at().objects.present).toHaveLength(1);
    s().setSide('back');
    expect(at().back!.objects.present).toHaveLength(1);
  });

  it('짝과 무관한 되돌리기는 그 쪽만 되돌린다(기존 원칙을 안 깬다)', () => {
    s().addTemplate();
    s().addBack();
    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]); // 앞면에 평범한 선 하나
    s().setSide('back');
    s().drawLines([{ x1: 20, y1: 20, x2: 60, y2: 20 }]); // 뒷면에도 평범한 선 하나

    s().setSide('front');
    s().undo();
    expect(at().objects.present).toHaveLength(0);
    s().setSide('back');
    expect(at().back!.objects.present).toHaveLength(1); // 뒷면은 그대로
  });

  it('짝 사이에 다른 그리기가 끼어도, 짝 차례가 되면 그때 함께 되돌린다', () => {
    s().addTemplate();
    s().addBack();
    s().commitCrossBoundaryLine({ x1: 70, y1: 10, x2: 80, y2: 15 }, { x1: 0, y1: 15, x2: 10, y2: 20 }, 'front');
    // 앞면에 짝과 무관한 선을 하나 더 긋는다.
    s().drawLines([{ x1: 30, y1: 30, x2: 50, y2: 30 }]);
    expect(at().objects.present).toHaveLength(2);

    s().undo(); // 방금 그은 무관한 선만 되돌린다
    expect(at().objects.present).toHaveLength(1);
    s().setSide('back');
    expect(at().back!.objects.present).toHaveLength(1); // 뒷면은 아직 그대로

    s().setSide('front');
    s().undo(); // 이제 짝 차례 — 앞뒤 둘 다 없어진다
    expect(at().objects.present).toHaveLength(0);
    s().setSide('back');
    expect(at().back!.objects.present).toHaveLength(0);
  });
});

describe('글자 커밋 — 비었는지만 trim으로 보고, 저장하는 값은 그대로 둔다', () => {
  const text = () => {
    const o = at().objects.present[0];
    if (!o || o.type !== 'text') throw new Error('글자가 없습니다');
    return o;
  };

  it('띄어쓰기로 끝나도(여러 칸이어도) 그대로 저장된다', () => {
    s().addTemplate();
    s().commitText({ x: 0, y: 0, width: 20, height: 10, text: '가   나   ' });
    expect(text().text).toBe('가   나   ');
  });

  it('공백만 있으면(빈 것과 같으므로) 만들지 않는다', () => {
    s().addTemplate();
    s().commitText({ x: 0, y: 0, width: 20, height: 10, text: '   ' });
    expect(at().objects.present).toHaveLength(0);
  });

  it('고치던 글자를 공백만 남기고 나가면 지워진다', () => {
    s().addTemplate();
    s().commitText({ x: 0, y: 0, width: 20, height: 10, text: '가' });
    const id = text().id;
    s().commitText({ x: 0, y: 0, width: 20, height: 10, text: '   ' }, id);
    expect(at().objects.present).toHaveLength(0);
  });
});

describe('자동 필드', () => {
  /** 방금 만든(유일한) 글자. 없거나 글자가 아니면 시험이 잘못 짜인 것이다. */
  const text = () => {
    const o = at().objects.present[0];
    if (!o || o.type !== 'text') throw new Error('글자가 없습니다');
    return o;
  };

  function makeText() {
    s().addTemplate();
    s().commitText({ x: 10, y: 10, width: 20, height: 10, text: '월' });
    return text().id;
  }

  it('고른 글자를 필드로 만든다', () => {
    const id = makeText();
    s().select([id]);
    s().setField({ offset: 3, format: 'M/D' });
    expect(text().field).toEqual({ offset: 3, format: 'M/D' });
  });

  it('필드로 만들어도 원래 글자는 남는다', () => {
    const id = makeText();
    s().select([id]);
    s().setField({ offset: 0, format: 'D' });
    expect(text().text).toBe('월');
  });

  it('null을 주면 필드를 떼어낸다', () => {
    const id = makeText();
    s().select([id]);
    s().setField({ offset: 0, format: 'D' });
    s().setField(null);
    expect(text().field).toBeUndefined();
  });

  it('아무것도 안 골랐으면 아무 일도 없다', () => {
    makeText();
    s().setField({ offset: 0, format: 'D' });
    expect(text().field).toBeUndefined();
  });

  it('실행취소가 된다', () => {
    const id = makeText();
    s().select([id]);
    s().setField({ offset: 0, format: 'D' });
    s().undo();
    expect(text().field).toBeUndefined();
  });

  it('여러 개를 골라 서식만 바꿔도 각자의 오프셋은 그대로다', () => {
    // 통째로 덮어쓰던 예전 버그: 서식만 바꿔도 전부 맨 위 글자의 오프셋을
    // 따라갔다. 이제는 준 키(format)만 바뀌어야 한다.
    s().addTemplate();
    s().commitText({ x: 0, y: 0, width: 10, height: 10, text: '월' });
    const a = at().objects.present[0].id;
    s().commitText({ x: 20, y: 0, width: 10, height: 10, text: '화' });
    const b = at().objects.present[1].id;

    s().select([a]);
    s().setField({ offset: 0, format: 'D' });
    s().select([b]);
    s().setField({ offset: 3, format: 'D' });

    s().select([a, b]);
    s().setField({ format: 'M/D' });

    const fieldOf = (id: string) => {
      const o = at().objects.present.find((x) => x.id === id);
      if (!o || o.type !== 'text') throw new Error('글자가 없습니다');
      return o.field;
    };
    expect(fieldOf(a)).toEqual({ offset: 0, format: 'M/D' });
    expect(fieldOf(b)).toEqual({ offset: 3, format: 'M/D' });
  });
});

describe('디자인 관리 — 이미지 저장/최근 사용', () => {
  const img = (id: string, extra: Partial<UserImage> = {}): UserImage => ({
    id,
    name: id,
    url: `data:${id}`,
    ...extra,
  });

  it('저장하지 않은 이미지가 10개를 넘으면 가장 오래 안 쓴 것부터 지운다', () => {
    for (let i = 0; i < 11; i++) s().addUserImage(img(`img${i}`, { usedAt: i }));

    const ids = s().userImages.map((i) => i.id);
    expect(ids).toHaveLength(10);
    expect(ids).not.toContain('img0'); // usedAt이 가장 작다 — 가장 오래됐다
    expect(ids).toContain('img10'); // 방금 등록한 것
  });

  it('저장(saved)한 이미지는 개수 제한에서 빠진다', () => {
    s().addUserImage(img('saved', { usedAt: 0, saved: true }));
    for (let i = 1; i <= 10; i++) s().addUserImage(img(`img${i}`, { usedAt: i }));

    const ids = s().userImages.map((i) => i.id);
    expect(ids).toHaveLength(11);
    expect(ids).toContain('saved');
  });

  it('지금 오브젝트에서 쓰는 중인 이미지는 가장 오래됐어도 자동으로 안 지워진다', () => {
    // 쓰는 중인 이미지는 "최근 사용" 개수 제한 대상에서 아예 빠진다 —
    // 10개 한도는 안 쓰는 중인 것끼리만 겨룬다.
    s().addTemplate();
    s().commitImage({ x: 0, y: 0, width: 10, height: 10 });
    s().styleImage('inUse');
    s().addUserImage(img('inUse', { usedAt: 0 }));
    for (let i = 1; i <= 11; i++) s().addUserImage(img(`img${i}`, { usedAt: i }));

    const ids = s().userImages.map((i) => i.id);
    expect(ids).toContain('inUse');
    expect(ids).not.toContain('img1'); // 안 쓰는 것 중 가장 오래된 것이 밀려난다
    expect(ids).toContain('img11');
  });

  it('renameUserImage가 목록에 보일 이름(label)을 바꾼다', () => {
    s().addUserImage(img('a'));
    s().renameUserImage('a', '내 사진');
    expect(s().userImages.find((i) => i.id === 'a')?.label).toBe('내 사진');
  });

  it('saveUserImage·unsaveUserImage가 저장 여부를 켜고 끈다', () => {
    s().addUserImage(img('a'));
    s().saveUserImage('a');
    expect(s().userImages.find((i) => i.id === 'a')?.saved).toBe(true);
    s().unsaveUserImage('a');
    expect(s().userImages.find((i) => i.id === 'a')?.saved).toBe(false);
  });

  it('removeUserImage는 지금 쓰는 중이면 지우지 않는다', () => {
    s().addTemplate();
    s().commitImage({ x: 0, y: 0, width: 10, height: 10 });
    s().styleImage('inUse');
    s().addUserImage(img('inUse'));

    s().removeUserImage('inUse');
    expect(s().userImages.map((i) => i.id)).toContain('inUse');
  });

  it('renameUserFont가 목록에 보일 이름(label)을 바꾼다', () => {
    s().addUserFont({ id: 'f1', name: 'MyFont', family: 'user-font-f1' });
    s().renameUserFont('f1', '내 글꼴');
    expect(s().userFonts.find((f) => f.id === 'f1')?.label).toBe('내 글꼴');
  });
});
