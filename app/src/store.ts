import { create } from 'zustand';
import { INSERT_PRESETS, PAPER_PRESETS, findInsertPreset, findPaperPreset } from './core/presets';
import { DEFAULT_PUNCH, type PunchSetting } from './core/punch';
import { computeLayout, type Align, type Layout } from './core/layout';
import { DEFAULT_DOT_GRID, type DotGrid } from './core/grid';
import { commit, initHistory, redo, undo, type History } from './core/history';
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

interface InsertState {
  presetId: string;
  width: Mm;
  height: Mm;
  punch: PunchSetting;
}

interface Settings {
  paper: PaperState;
  insert: InsertState;
  /**
   * 속지 안에 깔리는 도트 격자.
   *
   * 지금은 모든 칸이 같은 격자를 쓴다. 양식(Template)이 생기는 5단계에서
   * 각 양식의 페이지로 옮겨간다.
   */
  dotGrid: DotGrid;
  /**
   * 사용자가 그린 것들. 실행취소가 붙어 있다.
   *
   * 설정(용지·속지·격자)은 여기 들어가지 않는다. 되돌리는 게 아니라 다시 고르면
   * 되는 것들이라, 같이 취소되면 오히려 놀란다.
   */
  objects: History<DiaryObject[]>;
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
  patchInsert: (p: Partial<Omit<InsertState, 'punch'>>) => void;
  patchPunch: (p: Partial<PunchSetting>) => void;
  patchDotGrid: (p: Partial<DotGrid>) => void;
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

const firstPaper = PAPER_PRESETS[0];
const defaultInsert = findInsertPreset('M6')!;

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
  insert: {
    presetId: defaultInsert.id,
    width: defaultInsert.width,
    height: defaultInsert.height,
    punch: {
      ...DEFAULT_PUNCH,
      holeCount: defaultInsert.holeCount,
      groupGap: defaultInsert.groupGap,
      markSize: defaultInsert.markSize,
    },
  },
  dotGrid: { ...DEFAULT_DOT_GRID },
  objects: initHistory<DiaryObject[]>([]),
  tool: 'draw',
  selectedIds: [],
  drawStyle: {},
  textDraftStyle: {},
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
    set((s) => {
      const preset = findInsertPreset(id);
      if (!preset) return { insert: { ...s.insert, presetId: id } };
      return {
        insert: {
          presetId: id,
          width: preset.width,
          height: preset.height,
          punch: {
            ...s.insert.punch,
            holeCount: preset.holeCount,
            groupGap: preset.groupGap,
            markSize: preset.markSize,
          },
        },
      };
    }),

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
    set((s) => {
      const resized =
        (p.width !== undefined && p.width !== s.insert.width) ||
        (p.height !== undefined && p.height !== s.insert.height);
      return { insert: { ...s.insert, ...p, presetId: resized ? 'custom' : s.insert.presetId } };
    }),

  patchPunch: (p) => set((s) => ({ insert: { ...s.insert, punch: { ...s.insert.punch, ...p } } })),
  patchDotGrid: (p) => set((s) => ({ dotGrid: { ...s.dotGrid, ...p } })),

  // 도구를 바꾸면 고른 것을 놓는다. 그리기 중에 선택 테두리가 남아 있으면 헷갈린다.
  setTool: (tool) => set({ tool, selectedIds: [] }),

  drawLines: (segs) =>
    set((s) => {
      const next = toggleLines(s.objects.present, segs, s.drawStyle);
      if (next === s.objects.present) return {};
      return { objects: commit(s.objects, next) };
    }),

  setDrawStyle: (patch) => set((s) => ({ drawStyle: { ...s.drawStyle, ...patch } })),

  commitText: (box, id) =>
    set((s) => {
      const text = box.text.trim();
      const rest = id ? s.objects.present.filter((o) => o.id !== id) : s.objects.present;

      // 빈 채로 나가면 남기지 않는다. 고치다 비운 것도 마찬가지로 사라진다.
      if (text === '') {
        if (!id) return {};
        return { objects: commit(s.objects, rest), selectedIds: prune(s.selectedIds, rest) };
      }

      const next: TextObject = { id: id ?? newId('t'), type: 'text', ...box, text };
      // 고치는 중이면 원래 자리를 지킨다. 순서가 바뀌면 겹친 것이 위아래로 튄다.
      const objects = id
        ? s.objects.present.map((o) => (o.id === id ? next : o))
        : [...s.objects.present, next];
      return { objects: commit(s.objects, objects) };
    }),

  styleText: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = s.objects.present.map((o) => {
        if (o.type !== 'text' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof TextStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return { objects: commit(s.objects, next) };
    }),

  setTextDraftStyle: (patch) => set((s) => ({ textDraftStyle: { ...s.textDraftStyle, ...patch } })),

  select: (selectedIds) => set({ selectedIds }),

  deleteSelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const keep = s.objects.present.filter((o) => !s.selectedIds.includes(o.id));
      return { objects: commit(s.objects, keep), selectedIds: [] };
    }),

  moveSelected: (dx, dy) =>
    set((s) => {
      if (s.selectedIds.length === 0 || (dx === 0 && dy === 0)) return {};
      const moved = s.objects.present.map((o) =>
        s.selectedIds.includes(o.id) ? moveObject(o, dx, dy) : o,
      );
      return { objects: commit(s.objects, moved) };
    }),

  reshapeSelected: (id, end, p) =>
    set((s) => {
      const target = s.objects.present.find((o) => o.id === id);
      // 끝점 손잡이는 선에만 있다.
      if (!target || !isLine(target)) return {};

      const next = reshape(target, end, p);
      // 두 끝이 한 점으로 모이면 선이 아니다. 그런 상태는 만들지 않는다.
      if (isDegenerate(next)) return {};

      const replaced = s.objects.present.map((o) => (o.id === id ? next : o));
      const cleaned = dedupe(replaced);
      return {
        objects: commit(s.objects, cleaned),
        selectedIds: prune(s.selectedIds, cleaned),
      };
    }),

  styleSelected: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = s.objects.present.map((o) => {
        if (o.type !== 'line' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        // 값이 undefined면 키 자체를 지운다. 그래야 저장 파일에도 남지 않고
        // 나중에 기본값을 바꿨을 때 이 선도 같이 따라온다.
        for (const k of Object.keys(patch) as (keyof LineStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return { objects: commit(s.objects, next) };
    }),

  // 되돌리면 없어진 객체를 고른 채로 남을 수 있으므로 선택을 정리한다.
  undo: () =>
    set((s) => {
      const objects = undo(s.objects);
      return { objects, selectedIds: prune(s.selectedIds, objects.present) };
    }),
  redo: () =>
    set((s) => {
      const objects = redo(s.objects);
      return { objects, selectedIds: prune(s.selectedIds, objects.present) };
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

export function selectLayout(s: Settings): Layout {
  const { width, height } = paperSize(s.paper);
  return computeLayout({
    paperWidth: width,
    paperHeight: height,
    insertWidth: s.insert.width,
    insertHeight: s.insert.height,
    gap: s.gap,
    printMargin: s.paper.printMargin,
    allowRotate: s.allowRotate,
    align: s.align,
  });
}

export { INSERT_PRESETS, PAPER_PRESETS };
export type { Settings, PaperState, InsertState, UnprintableSetting };
