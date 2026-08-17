import { beforeEach, describe, expect, it } from 'vitest';
import { activeTemplate, resolveSlotTemplates, useStore } from './store';
import { insertFromPreset } from './core/template';
import { DEFAULT_DOT_GRID } from './core/grid';
import type { UserImage } from './images/registry';

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

  it('양식이 하나도 없으면 빈 배열이다', () => {
    expect(resolveSlotTemplates(s(), 4)).toEqual([]);
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
