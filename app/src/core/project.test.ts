import { describe, expect, it } from 'vitest';
import { missingFonts, readProject, toProject, toTemplates, PROJECT_VERSION } from './project';
import { insertFromPreset, newBack, newTemplate } from './template';
import { commit } from './history';
import type { DiaryObject, TextObject } from './objects';

const line: DiaryObject = { id: 'l1', type: 'line', x1: 10, y1: 10, x2: 70, y2: 10, width: 0.4 };
const plain: TextObject = {
  id: 't1',
  type: 'text',
  x: 5,
  y: 5,
  width: 40,
  height: 10,
  text: '제목',
  bold: true,
};
const withFont: TextObject = { ...plain, id: 't2', font: 'f1' };

function sample(objects: DiaryObject[] = [line, plain]) {
  const t = newTemplate('위클리1', insertFromPreset('M6'));
  t.objects = commit(t.objects, objects);
  t.dotGrid = { ...t.dotGrid, spacing: 4, toEdge: true };
  return t;
}

const print = { paper: { presetId: 'A4', width: 210, height: 297 }, gap: 2 };

describe('저장', () => {
  it('판 번호와 저장 시각이 들어간다', () => {
    const p = toProject({ templates: [sample()], print, fonts: [] });
    expect(p.version).toBe(PROJECT_VERSION);
    expect(Number.isNaN(Date.parse(p.savedAt))).toBe(false);
  });

  it('그린 것과 격자 설정이 그대로 담긴다', () => {
    const p = toProject({ templates: [sample()], print, fonts: [] });
    expect(p.templates[0].objects).toEqual([line, plain]);
    expect(p.templates[0].dotGrid.spacing).toBe(4);
    expect(p.templates[0].dotGrid.toEdge).toBe(true);
    expect(p.templates[0].insert.width).toBe(80);
  });

  it('실행취소 이력은 담지 않는다', () => {
    // 파일을 열었을 때 남의 과거로 되돌아갈 수 있으면 놀란다.
    const p = toProject({ templates: [sample()], print, fonts: [] });
    expect(JSON.stringify(p)).not.toContain('"past"');
  });

  it('실제로 쓰인 글꼴만 담는다', () => {
    // 등록만 해놓고 안 쓴 글꼴까지 적으면 불러올 때 필요도 없는 파일을 찾게 된다.
    const fonts = [
      { id: 'f1', name: '쓰는글꼴' },
      { id: 'f9', name: '안쓰는글꼴' },
    ];
    const p = toProject({ templates: [sample([withFont])], print, fonts });
    expect(p.fonts).toEqual([{ id: 'f1', name: '쓰는글꼴' }]);
  });

  it('JSON으로 오갈 수 있다', () => {
    const p = toProject({ templates: [sample()], print, fonts: [] });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe('불러오기 — 깨진 파일 막기', () => {
  const bad = (raw: unknown) => {
    const r = readProject(raw);
    expect(r).toHaveProperty('error');
    return 'error' in r ? r.error : '';
  };

  it('JSON이지만 양식 파일이 아니면 거른다', () => {
    bad(null);
    bad(42);
    bad({ hello: 'world' });
  });

  it('양식이 하나도 없으면 거른다', () => {
    expect(bad({ version: 1, templates: [] })).toContain('양식이 하나도');
  });

  it('더 새로운 판은 판 번호를 알려주며 거른다', () => {
    // 앞으로 뒷면이나 표가 생기면 판이 오른다. 그때 옛 프로그램이 열면 안 된다.
    expect(bad({ version: 99, templates: [{}] })).toContain('v99');
  });

  it('속지 크기가 없으면 거른다', () => {
    expect(bad({ version: 1, templates: [{ name: '가', objects: [] }] })).toContain('속지 크기');
  });

  it('객체 배열이 아니면 거른다', () => {
    expect(
      bad({ version: 1, templates: [{ name: '가', objects: 'nope', insert: { width: 1, height: 1 } }] }),
    ).toContain('깨져');
  });

  it('멀쩡한 파일은 통과한다', () => {
    const p = toProject({ templates: [sample()], print, fonts: [] });
    expect(readProject(JSON.parse(JSON.stringify(p)))).toHaveProperty('ok');
  });
});

describe('저장했다 다시 열기', () => {
  it('그린 것이 하나도 빠지지 않는다', () => {
    const p = toProject({ templates: [sample()], print, fonts: [] });
    const back = toTemplates(p);
    expect(back[0].objects.present).toEqual([line, plain]);
    expect(back[0].name).toBe('위클리1');
    expect(back[0].dotGrid.spacing).toBe(4);
  });

  it('실행취소는 빈 채로 시작한다', () => {
    // 방금 연 파일이 첫 모습이다.
    const back = toTemplates(toProject({ templates: [sample()], print, fonts: [] }));
    expect(back[0].objects.past).toEqual([]);
    expect(back[0].objects.future).toEqual([]);
  });

  it('옛 판에 없던 격자 설정은 기본값으로 채운다', () => {
    // 판이 오를 때 옛 파일이 안 열리는 것이 아니라 새 설정의 기본값으로 열려야 한다.
    const old = {
      version: 1,
      savedAt: '',
      templates: [
        {
          id: 't1',
          name: '옛것',
          insert: insertFromPreset('M6'),
          // dash·toEdge·minMargin이 없던 시절의 파일
          dotGrid: { style: 'dot', spacing: 5 },
          objects: [],
        },
      ],
      print: {},
      fonts: [],
    };
    const r = readProject(old);
    expect(r).toHaveProperty('ok');
    const back = toTemplates((r as { ok: never }).ok);
    expect(back[0].dotGrid.minMargin).toBe(3);
    expect(back[0].dotGrid.toEdge).toBe(false);
    expect(back[0].dotGrid.dash).toBe('solid');
  });

  it('id가 비어 있어도 채워넣는다', () => {
    const r = readProject({
      version: 1,
      savedAt: '',
      templates: [{ id: '', name: '가', insert: insertFromPreset('M6'), objects: [] }],
      print: {},
      fonts: [],
    });
    const back = toTemplates((r as { ok: never }).ok);
    expect(back[0].id).toBeTruthy();
  });

  it('반복 설정이 그대로 돌아온다', () => {
    const t = sample();
    t.repeat = { mode: 'repeat', count: 54 };
    const back = toTemplates(toProject({ templates: [t], print, fonts: [] }));
    expect(back[0].repeat).toEqual({ mode: 'repeat', count: 54 });
  });

  it('7단계 이전 파일(반복 설정이 없는 파일)은 single로 읽는다', () => {
    const r = readProject({
      version: 1,
      savedAt: '',
      templates: [{ id: 't1', name: '옛것', insert: insertFromPreset('M6'), objects: [] }],
      print: {},
      fonts: [],
    });
    const restored = toTemplates((r as { ok: never }).ok);
    expect(restored[0].repeat).toEqual({ mode: 'single' });
  });

  it('뒷면이 그대로 돌아온다', () => {
    const t = sample();
    t.back = newBack();
    t.back.objects = commit(t.back.objects, [line]);
    t.back.dotGrid = { ...t.back.dotGrid, spacing: 3 };

    const restored = toTemplates(toProject({ templates: [t], print, fonts: [] }));
    expect(restored[0].back).not.toBeNull();
    expect(restored[0].back!.objects.present).toEqual([line]);
    expect(restored[0].back!.dotGrid.spacing).toBe(3);
  });

  it('뒷면이 없는 양식은 단면으로 돌아온다', () => {
    const restored = toTemplates(toProject({ templates: [sample()], print, fonts: [] }));
    expect(restored[0].back).toBeNull();
  });

  it('뒷면의 실행취소 이력은 담지 않는다', () => {
    const t = sample();
    t.back = newBack();
    t.back.objects = commit(t.back.objects, [line]);
    t.back.objects = commit(t.back.objects, [line, line]);

    const p = toProject({ templates: [t], print, fonts: [] });
    expect(JSON.stringify(p)).not.toContain('"past"');
  });

  it('9단계 이전 파일(뒷면이 없는 파일)은 단면으로 읽는다', () => {
    const r = readProject({
      version: 1,
      savedAt: '',
      templates: [{ id: 't1', name: '옛것', insert: insertFromPreset('M6'), objects: [] }],
      print: {},
      fonts: [],
    });
    const restored = toTemplates((r as { ok: never }).ok);
    expect(restored[0].back).toBeNull();
  });

  it('뒷면 내용이 깨져 있으면 거른다', () => {
    const r = readProject({
      version: 1,
      savedAt: '',
      templates: [
        {
          id: 't1',
          name: '가',
          insert: insertFromPreset('M6'),
          objects: [],
          back: { dotGrid: {}, objects: 'nope' },
        },
      ],
      print: {},
      fonts: [],
    });
    expect(r).toHaveProperty('error');
  });
});

describe('다시 등록해야 하는 글꼴', () => {
  const p = toProject({
    templates: [sample([withFont])],
    print,
    fonts: [{ id: 'f1', name: '내글꼴' }],
  });

  it('파일이 없으면 이름을 알려준다', () => {
    expect(missingFonts(p, () => false)).toEqual(['내글꼴']);
  });

  it('이미 들고 있으면 알리지 않는다', () => {
    expect(missingFonts(p, () => true)).toEqual([]);
  });
});
