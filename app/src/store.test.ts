import { beforeEach, describe, expect, it } from 'vitest';
import { activeTemplate, useStore } from './store';
import { insertFromPreset } from './core/template';
import { DEFAULT_DOT_GRID } from './core/grid';

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
