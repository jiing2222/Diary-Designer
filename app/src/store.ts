import { create } from 'zustand';
import { INSERT_PRESETS, PAPER_PRESETS, findPaperPreset } from './core/presets';
import type { PunchSetting } from './core/punch';
import { computeLayout, type Align, type Layout } from './core/layout';
import type { DotGrid } from './core/grid';
import { commit, redo, undo } from './core/history';
import {
  duplicateTemplate,
  insertFromPreset,
  newTemplate,
  uniqueName,
  type InsertSetting,
  type Template,
} from './core/template';
import { toTemplates, type SavedProject } from './core/project';
import { reserveIds } from './fonts/registry';
import {
  dedupe,
  isDegenerate,
  isLine,
  moveObject,
  newId,
  reshape,
  toggleLines,
  type DiaryObject,
  type LineSeg,
  type LineStyle,
  type TextObject,
  type TextStyle,
} from './core/objects';
import type { CropMode } from './core/crop';
import type { Mm } from './core/units';
import type { UserFont } from './fonts/registry';

interface PaperState {
  presetId: string;
  width: Mm;
  height: Mm;
  landscape: boolean;
  printMargin: Mm;
}

/**
 * 프린터가 물리적으로 찍지 못하는 가장자리.
 *
 * 타공 안내와 같은 성격이다. 화면에만 보이고 인쇄되지 않으며, 배치 계산에도
 * 관여하지 않는다. 여기에 걸리는 내용은 출력물에서 잘려나간다는 경고일 뿐이다.
 * 배치를 실제로 밀어내는 것은 paper.printMargin 쪽이다.
 */
interface UnprintableSetting {
  show: boolean;
  width: Mm;
}

interface Settings {
  paper: PaperState;
  /**
   * 만들어둔 양식들. **속지·격자·그린 것이 전부 이 안에 있다.**
   *
   * 양식은 용지를 모른다(설계문서 3장). 그래서 용지·배치 설정만 store 루트에
   * 남고, 속지 한 장에 대한 것은 모두 양식으로 들어갔다.
   *
   * 비지 않는다. 마지막 하나는 지워지지 않는다 — 편집 화면이 항상 무언가를
   * 보여줘야 하기 때문이다.
   */
  templates: Template[];
  /** 지금 편집 중인 양식. 이 id가 가리키는 것이 없으면 첫 번째로 돌아간다. */
  activeId: string;
  /**
   * 고르기 / 그리기.
   *
   * 그리기 안에서는 조작이 곧 종류다 — 점을 찍고 다른 점을 찍으면 선,
   * 점에서 끌면 면이다. 따로 도구를 오갈 필요가 없다.
   */
  tool: Tool;
  /**
   * 지금 고른 것들.
   *
   * **실행취소에 들어가지 않는다.** 문서가 바뀐 것이 아니므로 ⌘Z가
   * 선택 상태까지 되돌리면 오히려 놀란다.
   */
  selectedIds: string[];
  /**
   * 앞으로 그을 선의 모양.
   *
   * 값이 없는 키는 core/style의 기본값을 따른다. 그린 선에도 그 키가 들어가지 않으므로,
   * 나중에 기본값을 바꾸면 그때 그은 선들도 같이 따라온다.
   */
  drawStyle: LineStyle;
  /** 앞으로 쓸 글자의 모양. drawStyle의 글자 판이다. */
  textDraftStyle: TextStyle;
  /**
   * 이번 세션에 등록한 글꼴 목록.
   *
   * 파일 바이트는 여기 없다 — fonts/registry가 들고 있다. 상태에 수 MB짜리
   * 버퍼를 넣으면 구독하는 컴포넌트마다 그것을 들여다보게 된다.
   */
  userFonts: UserFont[];
  gap: Mm;
  allowRotate: boolean;
  align: Align;
  cropMark: CropMode;
  showRuler: boolean;
  unprintable: UnprintableSetting;
}

interface Store extends Settings {
  setPaperPreset: (id: string) => void;
  setInsertPreset: (id: string) => void;
  patchPaper: (p: Partial<PaperState>) => void;
  patchInsert: (p: Partial<Omit<InsertSetting, 'punch'>>) => void;
  patchPunch: (p: Partial<PunchSetting>) => void;
  patchDotGrid: (p: Partial<DotGrid>) => void;
  /* ── 양식 관리 ── */
  selectTemplate: (id: string) => void;
  /** 규격·이름을 주지 않으면 지금 양식의 규격과 자동 이름을 쓴다. */
  addTemplate: (insert?: InsertSetting, name?: string) => void;
  /** 규격을 주면 그 규격으로 복제한다. 원본은 손대지 않는다. */
  copyTemplate: (id: string, insert?: InsertSetting) => void;
  renameTemplate: (id: string, name: string) => void;
  /** 마지막 하나는 지워지지 않는다. */
  removeTemplate: (id: string) => void;
  setTool: (t: Tool) => void;
  /** 그으면 생기고 이미 있으면 지워진다. 선 하나든 면의 네 변이든 한 번으로 친다. */
  drawLines: (segs: LineSeg[]) => void;
  select: (ids: string[]) => void;
  deleteSelected: () => void;
  moveSelected: (dx: Mm, dy: Mm) => void;
  /** 고른 선 하나의 한쪽 끝을 옮긴다. */
  reshapeSelected: (id: string, end: 1 | 2, p: { x: Mm; y: Mm }) => void;
  /** 고른 선들의 굵기·색·모양. 값이 undefined면 기본값으로 되돌린다. */
  styleSelected: (patch: LineStyle) => void;
  /** 앞으로 그을 선의 모양. */
  setDrawStyle: (patch: LineStyle) => void;
  /**
   * 글자 상자를 확정한다.
   *
   * 비어 있으면 아무것도 만들지 않는다 — 빈 상자는 남기지 않는다는 규칙이다.
   * 이미 있는 글자를 고쳐 비우면 그 글자가 사라진다.
   */
  commitText: (box: Omit<TextObject, 'id' | 'type'>, id?: string) => void;
  /** 고른 글자들의 크기·정렬·색. */
  styleText: (patch: TextStyle) => void;
  /** 앞으로 쓸 글자의 모양. */
  setTextDraftStyle: (patch: TextStyle) => void;
  /** 등록을 마친 글꼴을 목록에 넣는다. 파일 읽기는 fonts/registry가 이미 끝냈다. */
  addUserFont: (font: UserFont) => void;
  /** 저장 파일에서 읽은 양식들로 통째로 갈아끼운다. */
  loadProject: (p: SavedProject) => void;
  undo: () => void;
  redo: () => void;
  patch: (
    p: Partial<Pick<Settings, 'gap' | 'allowRotate' | 'align' | 'cropMark' | 'showRuler'>>,
  ) => void;
  patchUnprintable: (p: Partial<UnprintableSetting>) => void;
}

export type Tool = 'select' | 'draw' | 'text';

/** 더 이상 존재하지 않는 id를 선택 목록에서 걷어낸다. */
function prune(ids: string[], objects: DiaryObject[]): string[] {
  return ids.filter((id) => objects.some((o) => o.id === id));
}

/**
 * 지금 편집 중인 양식.
 *
 * id가 가리키는 것이 없으면 첫 번째로 돌아간다. 양식 목록은 비지 않으므로
 * 이 함수는 언제나 무언가를 돌려준다 — 화면이 빈 상태를 다룰 필요가 없다.
 */
export function activeTemplate(s: Pick<Settings, 'templates' | 'activeId'>): Template {
  return s.templates.find((t) => t.id === s.activeId) ?? s.templates[0];
}

/**
 * 지금 양식만 고친다.
 *
 * 그리기·격자·속지 관련 동작이 전부 이걸 거친다. 양식마다 따로 들고 있는 값을
 * 고치는 자리가 한 군데뿐이어야 어느 양식이 바뀌는지 헷갈리지 않는다.
 */
function patchActive(
  s: Pick<Settings, 'templates' | 'activeId'>,
  fn: (t: Template) => Partial<Template>,
): Pick<Settings, 'templates'> {
  const id = activeTemplate(s).id;
  return { templates: s.templates.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)) };
}

/** 지금 양식의 그린 것들을 갈아끼우고 실행취소에 한 칸 쌓는다. */
function commitObjects(
  s: Pick<Settings, 'templates' | 'activeId'>,
  next: DiaryObject[],
): Pick<Settings, 'templates'> {
  return patchActive(s, (t) => ({ objects: commit(t.objects, next) }));
}

const firstPaper = PAPER_PRESETS[0];
const firstTemplate = newTemplate('양식 1');

export const useStore = create<Store>((set) => ({
  paper: {
    presetId: firstPaper.id,
    width: firstPaper.width,
    height: firstPaper.height,
    landscape: false,
    // 0이 기본이다. A4를 반으로 자르면 A5 두 장이 나오듯, 용지를 남김없이 쓰는 게
    // 이 프로그램의 기본 동작이다. 프린터가 가장자리를 못 찍는 만큼은 속지 안쪽에
    // 두는 여백(0.3~0.5mm)이 흡수한다.
    printMargin: 0,
  },
  templates: [firstTemplate],
  activeId: firstTemplate.id,
  tool: 'draw',
  selectedIds: [],
  drawStyle: {},
  textDraftStyle: {},
  userFonts: [],
  gap: 0,
  allowRotate: true,
  // 좌측 상단에 붙이면 자르는 횟수가 줄지만, 실제로 인쇄해보니 가운데가 낫다.
  // 프린터가 가장자리를 못 찍어서 한쪽으로 몰면 재단 표시가 잘려나간다.
  align: 'center',
  cropMark: 'mark',
  // 인쇄 정확도는 이미 검증됐다(50mm가 정확히 나오는 것을 확인함). 매번 다시
  // 잴 필요는 없으니 기본은 꺼둔다. 필요하면 배치 설정에서 언제든 켤 수 있다.
  showRuler: false,
  unprintable: { show: true, width: 3 },

  setPaperPreset: (id) =>
    set((s) => {
      const preset = findPaperPreset(id);
      if (!preset) return { paper: { ...s.paper, presetId: id } };
      return { paper: { ...s.paper, presetId: id, width: preset.width, height: preset.height } };
    }),

  setInsertPreset: (id) =>
    set((s) => patchActive(s, (t) => ({ insert: insertFromPreset(id, t.insert) }))),

  // 크기를 손으로 고치면 더 이상 프리셋이 아니다. 타공 위치는 알아서 다시 계산된다.
  //
  // 방향이나 여백은 크기가 아니므로 프리셋을 잃지 않는다. A4를 가로로 눕혔다고
  // "사용자 지정"이 되면 무엇을 고르고 있었는지 알 수 없게 된다.
  patchPaper: (p) =>
    set((s) => {
      const resized =
        (p.width !== undefined && p.width !== s.paper.width) ||
        (p.height !== undefined && p.height !== s.paper.height);
      return { paper: { ...s.paper, ...p, presetId: resized ? 'custom' : s.paper.presetId } };
    }),

  patchInsert: (p) =>
    set((s) =>
      patchActive(s, (t) => {
        const resized =
          (p.width !== undefined && p.width !== t.insert.width) ||
          (p.height !== undefined && p.height !== t.insert.height);
        return {
          insert: { ...t.insert, ...p, presetId: resized ? 'custom' : t.insert.presetId },
        };
      }),
    ),

  patchPunch: (p) =>
    set((s) => patchActive(s, (t) => ({ insert: { ...t.insert, punch: { ...t.insert.punch, ...p } } }))),

  patchDotGrid: (p) => set((s) => patchActive(s, (t) => ({ dotGrid: { ...t.dotGrid, ...p } }))),

  /* ─────────────────────────── 양식 관리 ─────────────────────────── */

  selectTemplate: (activeId) => set({ activeId, selectedIds: [] }),

  addTemplate: (insert, name) =>
    set((s) => {
      // 규격을 주지 않으면 지금 보던 양식의 규격을 물려받는다. 갤러리에서 크기
      // 그룹의 `+`를 누르는 경우가 그렇다 — 그 크기로 하나 더 만드는 뜻이다.
      const cur = activeTemplate(s).insert;
      const base = insert ?? { ...cur, punch: { ...cur.punch } };
      const made = newTemplate(uniqueName(s.templates, name?.trim() || '양식 1'), base);
      return { templates: [...s.templates, made], activeId: made.id, selectedIds: [] };
    }),

  copyTemplate: (id, insert) =>
    set((s) => {
      const source = s.templates.find((t) => t.id === id);
      if (!source) return {};
      const made = duplicateTemplate(source, uniqueName(s.templates, `${source.name} 사본`), insert);
      // 원본 바로 뒤에 넣는다. 목록 끝으로 보내면 어디 갔는지 찾게 된다.
      const at = s.templates.indexOf(source) + 1;
      const templates = [...s.templates.slice(0, at), made, ...s.templates.slice(at)];
      return { templates, activeId: made.id, selectedIds: [] };
    }),

  renameTemplate: (id, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return { templates: s.templates.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) };
    }),

  removeTemplate: (id) =>
    set((s) => {
      // 마지막 하나는 남긴다. 편집 화면이 항상 무언가를 보여줘야 한다.
      if (s.templates.length <= 1) return {};
      const templates = s.templates.filter((t) => t.id !== id);
      const activeId = templates.some((t) => t.id === s.activeId) ? s.activeId : templates[0].id;
      return { templates, activeId, selectedIds: [] };
    }),

  // 도구를 바꾸면 고른 것을 놓는다. 그리기 중에 선택 테두리가 남아 있으면 헷갈린다.
  setTool: (tool) => set({ tool, selectedIds: [] }),

  drawLines: (segs) =>
    set((s) => {
      const cur = activeTemplate(s).objects.present;
      const next = toggleLines(cur, segs, s.drawStyle);
      if (next === cur) return {};
      return commitObjects(s, next);
    }),

  setDrawStyle: (patch) => set((s) => ({ drawStyle: { ...s.drawStyle, ...patch } })),

  commitText: (box, id) =>
    set((s) => {
      const cur = activeTemplate(s).objects.present;
      const text = box.text.trim();
      const rest = id ? cur.filter((o) => o.id !== id) : cur;

      // 빈 채로 나가면 남기지 않는다. 고치다 비운 것도 마찬가지로 사라진다.
      if (text === '') {
        if (!id) return {};
        return { ...commitObjects(s, rest), selectedIds: prune(s.selectedIds, rest) };
      }

      const next: TextObject = { id: id ?? newId('t'), type: 'text', ...box, text };
      // 고치는 중이면 원래 자리를 지킨다. 순서가 바뀌면 겹친 것이 위아래로 튄다.
      return commitObjects(s, id ? cur.map((o) => (o.id === id ? next : o)) : [...cur, next]);
    }),

  styleText: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeTemplate(s).objects.present.map((o) => {
        if (o.type !== 'text' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof TextStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  setTextDraftStyle: (patch) => set((s) => ({ textDraftStyle: { ...s.textDraftStyle, ...patch } })),

  // 같은 id로 다시 등록하면(저장 파일을 열고 그 글꼴을 다시 찾아온 경우)
  // 목록에 하나 더 늘리지 않고 그 자리를 갈아끼운다.
  addUserFont: (font) =>
    set((s) => ({
      userFonts: s.userFonts.some((f) => f.id === font.id)
        ? s.userFonts.map((f) => (f.id === font.id ? font : f))
        : [...s.userFonts, font],
    })),

  loadProject: (p) =>
    set((s) => {
      const templates = toTemplates(p);
      // 글꼴은 이름만 살아 돌아온다. 파일은 사용자가 다시 등록해야 하고,
      // 그때까지 그 글자들은 기본 글꼴로 보인다(fonts/registry의 familyOf).
      const fonts = p.fonts ?? [];
      reserveIds(fonts.map((f) => f.id));
      return {
        templates,
        activeId: templates[0].id,
        selectedIds: [],
        userFonts: fonts.map((f) => ({ ...f, family: `user-font-${f.id}` })),
        // 용지·배치는 저장된 것이 있으면 덮어쓰고, 없는 값은 지금 것을 지킨다.
        ...(p.print as Partial<Settings>),
        paper: { ...s.paper, ...((p.print as { paper?: PaperState }).paper ?? {}) },
      };
    }),

  select: (selectedIds) => set({ selectedIds }),

  deleteSelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const keep = activeTemplate(s).objects.present.filter((o) => !s.selectedIds.includes(o.id));
      return { ...commitObjects(s, keep), selectedIds: [] };
    }),

  moveSelected: (dx, dy) =>
    set((s) => {
      if (s.selectedIds.length === 0 || (dx === 0 && dy === 0)) return {};
      const moved = activeTemplate(s).objects.present.map((o) =>
        s.selectedIds.includes(o.id) ? moveObject(o, dx, dy) : o,
      );
      return commitObjects(s, moved);
    }),

  reshapeSelected: (id, end, p) =>
    set((s) => {
      const cur = activeTemplate(s).objects.present;
      const target = cur.find((o) => o.id === id);
      // 끝점 손잡이는 선에만 있다.
      if (!target || !isLine(target)) return {};

      const next = reshape(target, end, p);
      // 두 끝이 한 점으로 모이면 선이 아니다. 그런 상태는 만들지 않는다.
      if (isDegenerate(next)) return {};

      const cleaned = dedupe(cur.map((o) => (o.id === id ? next : o)));
      return { ...commitObjects(s, cleaned), selectedIds: prune(s.selectedIds, cleaned) };
    }),

  styleSelected: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeTemplate(s).objects.present.map((o) => {
        if (o.type !== 'line' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        // 값이 undefined면 키 자체를 지운다. 그래야 저장 파일에도 남지 않고
        // 나중에 기본값을 바꿨을 때 이 선도 같이 따라온다.
        for (const k of Object.keys(patch) as (keyof LineStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  // 되돌리면 없어진 객체를 고른 채로 남을 수 있으므로 선택을 정리한다.
  // 실행취소는 **지금 양식의 것만** 되돌린다. 양식을 바꿨다가 ⌘Z를 눌렀는데
  // 다른 양식의 작업이 사라지면 무섭다.
  undo: () =>
    set((s) => {
      const objects = undo(activeTemplate(s).objects);
      return { ...patchActive(s, () => ({ objects })), selectedIds: prune(s.selectedIds, objects.present) };
    }),
  redo: () =>
    set((s) => {
      const objects = redo(activeTemplate(s).objects);
      return { ...patchActive(s, () => ({ objects })), selectedIds: prune(s.selectedIds, objects.present) };
    }),
  patch: (p) => set(p),
  patchUnprintable: (p) => set((s) => ({ unprintable: { ...s.unprintable, ...p } })),
}));

/** 현재 설정의 용지 크기. 가로 방향이면 뒤집는다. */
export function paperSize(paper: PaperState): { width: Mm; height: Mm } {
  return paper.landscape
    ? { width: paper.height, height: paper.width }
    : { width: paper.width, height: paper.height };
}

/**
 * 배치 계산.
 *
 * 칸 크기는 **지금 양식의 속지**에서 나온다. 칸마다 다른 양식을 넣는 것은 5c의
 * 일이고, 그때도 한 용지 안에서는 규격이 같아야 하므로 이 계산은 그대로다.
 */
export function selectLayout(s: Settings): Layout {
  const { width, height } = paperSize(s.paper);
  const insert = activeTemplate(s).insert;
  return computeLayout({
    paperWidth: width,
    paperHeight: height,
    insertWidth: insert.width,
    insertHeight: insert.height,
    gap: s.gap,
    printMargin: s.paper.printMargin,
    allowRotate: s.allowRotate,
    align: s.align,
  });
}

/*
 * 화면이 쓰는 지름길.
 *
 * `속지·격자·그린 것`이 양식 안으로 들어가면서 읽는 자리마다
 * `activeTemplate(s).insert`를 적게 됐다. 그 반복을 여기서 한 번만 한다.
 */
export const useActive = () => useStore(activeTemplate);
export const useInsert = () => useStore((s) => activeTemplate(s).insert);
export const useDotGrid = () => useStore((s) => activeTemplate(s).dotGrid);
export const useObjects = () => useStore((s) => activeTemplate(s).objects);

export { INSERT_PRESETS, PAPER_PRESETS };
export type { Settings, PaperState, UnprintableSetting };
export type { InsertSetting, Template };
