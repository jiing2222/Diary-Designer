import { create } from 'zustand';
import { INSERT_PRESETS, PAPER_PRESETS, findPaperPreset } from './core/presets';
import type { PunchSetting } from './core/punch';
import { computeLayout, type Align, type Layout } from './core/layout';
import { DEFAULT_DOT_GRID, type DotGrid } from './core/grid';
import { DEFAULT_FIELD_FORMAT } from './core/text';
import { commit, initHistory, redo, undo, type History } from './core/history';
import {
  defaultInsert,
  defaultName,
  duplicateTemplate,
  insertFromPreset,
  newBack,
  newTemplate,
  sameSize,
  uniqueName,
  SINGLE_REPEAT,
  type InsertSetting,
  type RepeatSetting,
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
  type Box,
  type CalendarObject,
  type CalendarStyle,
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
   * **처음에는 비어 있다.** 빈 갤러리에서 시작해 사용자가 첫 양식을 만든다.
   * 미리 하나를 만들어두면 원하지 않는 규격으로 시작하게 되고, 지우지도 못한다.
   */
  templates: Template[];
  /** 지금 편집 중인 양식. 하나도 없으면 빈 문자열이다. */
  activeId: string;
  /**
   * 지금 양식의 **어느 쪽**을 편집하는 중인지.
   *
   * 뒷면이 없는 양식에서는 의미가 없다 — 화면이 `앞면` 탭만 보여준다.
   * 양식을 바꾸면 `front`로 돌아간다. 방금 만진 양식의 뒷면 탭에 남아 있다가
   * 뒷면 없는 다른 양식으로 넘어가면 헷갈린다.
   */
  side: Side;
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
  /**
   * 양면 인쇄. 켜면 장마다 뒷면도 함께 뽑는다.
   *
   * 인쇄 작업(용지·간격·절취선과 같은 자리) 설정이라 양식이 아니라 store
   * 루트에 있다 — 뒷면이 없는 양식을 켜서 인쇄해도 그 칸만 빈 채로 찍힌다.
   */
  duplex: boolean;
  /**
   * 뒷면이 없는 칸도 완전히 비우지 않고 도트·그리드는 찍는다.
   *
   * 양면 인쇄에서만 의미가 있다. 기본은 꺼져 있어 지금까지처럼 백지로 나간다.
   * 켜면 뒷면이 없는 칸에 **그 칸 양식의 앞면과 같은 도트·그리드 설정**을
   * 쓰되 그린 것(objects)은 넣지 않는다 — 뒷면을 따로 디자인하지 않았어도
   * 최소한 쓸 수 있는 면으로 찍고 싶을 때를 위해서다.
   */
  fillEmptyBack: boolean;
  /**
   * 낱장 조합 — 지금 짜둔 칸 배정을 통째로 몇 장 찍을지.
   *
   * 양식의 `repeat`(이 양식 하나가 여러 장을 채우는 것)과는 다르다. 이건 여러
   * 양식이 섞인 조합 자체를 몇 벌 복사할지를 정하는, 인쇄 작업 설정이다 —
   * 그래서 어느 한 양식이 아니라 store 루트에 있다. 매번 완전히 채워진 장만
   * 나온다(자투리 칸이 생기지 않는다).
   */
  comboSheets: number;
  /**
   * 겹치기 배치 — 세트형(데이터셋) 인쇄에서 쪽 순서를 칸별로 재배열할지.
   *
   * 여러 쪽을 한 용지에 여러 칸씩 뽑으면 자른 뒤 순서가 안 맞는다(설계문서
   * 8장). 켜면 칸마다 연속된 구간을 담당해서, 자른 뒤 그 칸의 무더기를
   * 쌓기만 해도 순서대로 읽힌다. 반복 인쇄(만년형)·낱장 조합은 모든 칸의
   * 내용이 완전히 같아서 순서가 결과에 영향을 주지 않으므로 의미가 없다 —
   * 세트형에서만 쓴다.
   */
  cutStack: boolean;
  /**
   * 겹치기 배치에서 몇 장을 한 무더기로 볼지. `0`이면 전체를 한 무더기로
   * 본다. 재단기가 한 번에 자를 수 있는 장수가 제한적일 때만 정한다 — 예를
   * 들어 10을 넣으면 10장씩 잘라도 각 무더기 안이 이미 순서대로다.
   */
  cutStackGroup: number;
  unprintable: UnprintableSetting;
  /**
   * 낱장 조합 — 인쇄할 용지의 칸마다 어느 양식을 넣을지.
   *
   * 키는 슬롯 번호(0부터, 왼쪽 위에서 가로로). 값을 정하지 않은 칸은 **지금
   * 고른 양식(activeId)**을 쓴다 — 지금까지의 동작 그대로다.
   *
   * **같은 규격의 양식만 섞을 수 있다.** 배치 계산(칸 크기·개수)이 한 규격을
   * 기준으로 한 번만 일어나기 때문이다(설계문서 8장, "두 가지 작업" 중
   * 낱장 조합). 규격이 다른 양식을 가리키는 값은 조용히 무시하고 기본값으로
   * 돌아간다 — `resolveSlotTemplates`가 그 판단을 한다.
   */
  slotAssignment: Record<number, string>;
}

interface Store extends Settings {
  setPaperPreset: (id: string) => void;
  setInsertPreset: (id: string) => void;
  patchPaper: (p: Partial<PaperState>) => void;
  patchInsert: (p: Partial<Omit<InsertSetting, 'punch'>>) => void;
  patchPunch: (p: Partial<PunchSetting>) => void;
  patchDotGrid: (p: Partial<DotGrid>) => void;
  /** 이 양식을 몇 번 찍을지. `repeat`으로 바꾸면 낱장 조합(칸 배정)은 더 이상 쓰이지 않는다. */
  patchRepeat: (repeat: RepeatSetting) => void;
  /** 지금 양식의 앞면·뒷면 중 어느 쪽을 편집할지. */
  setSide: (side: Side) => void;
  /** 지금 양식에 뒷면을 만든다. 이미 있으면 아무 일도 하지 않는다. */
  addBack: () => void;
  /** 지금 양식의 뒷면을 지우고 단면으로 되돌린다. 뒷면에 그린 것도 함께 사라진다. */
  removeBack: () => void;
  /* ── 양식 관리 ── */
  selectTemplate: (id: string) => void;
  /** 규격·이름·격자를 주지 않으면 지금 양식의 것과 자동 이름을 쓴다. */
  addTemplate: (insert?: InsertSetting, name?: string, grid?: DotGrid) => void;
  /** 규격을 주면 그 규격으로 복제한다. 원본은 손대지 않는다. */
  copyTemplate: (id: string, insert?: InsertSetting) => void;
  renameTemplate: (id: string, name: string) => void;
  removeTemplate: (id: string) => void;
  /** 낱장 조합에서 이 칸에 넣을 양식. `null`이면 배정을 지우고 기본값(activeId)으로 돌린다. */
  assignSlot: (index: number, templateId: string | null) => void;
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
  /**
   * 고른 글자들의 자동 필드를 켜거나(patch를 주면) 끈다(`null`).
   *
   * **patch는 부분 값이다 — 준 키만 바뀐다.** 여러 글자를 한꺼번에 골라
   * 서식만 바꿔도 각자의 오프셋은 건드리지 않고 그대로 남는다 — 예전에는
   * 통째로 덮어써서 서식만 바꿔도 전부 맨 위 글자의 오프셋을 따라갔다.
   *
   * `styleText`와 갈라둔 이유는 필드가 스타일(굵기·색 같은 겉모양)이 아니라
   * **글자의 값이 어디서 오는지**를 바꾸는 일이기 때문이다. 만들 때 앞으로 쓸
   * 글자에 기본값으로 씌우는 것도 아니다 — 이미 있는 글자를 선택해서 켠다.
   */
  setField: (patch: Partial<{ offset: number; format: string }> | null) => void;
  /** 앞으로 쓸 글자의 모양. */
  setTextDraftStyle: (patch: TextStyle) => void;
  /** 새 달력 오브젝트를 이 박스 크기로 만든다. */
  commitCalendar: (box: Box) => void;
  /**
   * 상자 모양 오브젝트(글자·달력) 하나의 크기·자리를 통째로 바꾼다.
   *
   * 모서리 손잡이로 끄는 동안은 미리보기만 하고(gestures의 `previewBox`),
   * 손을 뗄 때 이 액션으로 한 번만 진짜 값을 바꾼다 — 다른 몸짓들과 같은 규칙이다.
   */
  resizeObject: (id: string, box: Box) => void;
  /** 고른 달력들의 시작 요일·이전달 표시·요일 언어·색. */
  styleCalendar: (patch: CalendarStyle) => void;
  /** 등록을 마친 글꼴을 목록에 넣는다. 파일 읽기는 fonts/registry가 이미 끝냈다. */
  addUserFont: (font: UserFont) => void;
  /** 저장 파일에서 읽은 양식들로 통째로 갈아끼운다. */
  loadProject: (p: SavedProject) => void;
  undo: () => void;
  redo: () => void;
  patch: (
    p: Partial<
      Pick<
        Settings,
        | 'gap'
        | 'allowRotate'
        | 'align'
        | 'cropMark'
        | 'showRuler'
        | 'duplex'
        | 'fillEmptyBack'
        | 'comboSheets'
        | 'cutStack'
        | 'cutStackGroup'
      >
    >,
  ) => void;
  patchUnprintable: (p: Partial<UnprintableSetting>) => void;
}

export type Tool = 'select' | 'draw' | 'text' | 'table' | 'field' | 'calendar';
export type Side = 'front' | 'back';

/** 더 이상 존재하지 않는 id를 선택 목록에서 걷어낸다. */
function prune(ids: string[], objects: DiaryObject[]): string[] {
  return ids.filter((id) => objects.some((o) => o.id === id));
}

/**
 * 지금 편집 중인 양식. **없을 수 있다** — 처음 열면 양식이 하나도 없다.
 *
 * id가 가리키는 것이 없으면 첫 번째로 돌아간다. 양식을 지우거나 파일을 불러온
 * 뒤에도 화면이 엉뚱한 것을 붙들고 있지 않게 한다.
 */
export function activeTemplate(s: Pick<Settings, 'templates' | 'activeId'>): Template | null {
  return s.templates.find((t) => t.id === s.activeId) ?? s.templates[0] ?? null;
}

/*
 * 양식이 없을 때 화면이 읽는 값.
 *
 * **참조가 고정이어야 한다.** 부를 때마다 새 객체를 만들면 zustand가 매번
 * 바뀐 것으로 보고 무한히 다시 그린다. 편집 화면은 양식이 있을 때만 열리므로
 * 이 값들이 실제로 쓰이는 일은 없고, 터지지 않게 받쳐두는 것뿐이다.
 */
const NO_INSERT = defaultInsert();
const NO_GRID: DotGrid = { ...DEFAULT_DOT_GRID };
const NO_OBJECTS = initHistory<DiaryObject[]>([]);
const NO_REPEAT: RepeatSetting = SINGLE_REPEAT;

/**
 * 지금 양식만 고친다.
 *
 * **양식 전체에 대한 것만** 여기로 온다 — 속지 규격·격자 모양 자체의 켜고 끄는
 * 값처럼 앞뒤가 공유하는 것들, 그리고 반복 설정처럼 쪽과 무관한 것들이다.
 * 앞면·뒷면처럼 **쪽마다 다른 내용**은 `patchActiveSide`가 대신 맡는다.
 */
function patchActive(
  s: Pick<Settings, 'templates' | 'activeId'>,
  fn: (t: Template) => Partial<Template>,
): Pick<Settings, 'templates'> {
  const active = activeTemplate(s);
  if (!active) return { templates: s.templates };
  return { templates: s.templates.map((t) => (t.id === active.id ? { ...t, ...fn(t) } : t)) };
}

/** 앞면·뒷면이 공유하는 모양. 격자와 그린 것을 한 덩어리로 다루기 위한 그릇이다. */
type SideData = { dotGrid: DotGrid; objects: History<DiaryObject[]> };

/** 지금 편집 중인 쪽의 데이터. 뒷면인데 아직 없으면 `null`이다. */
function activeSideData(t: Template, side: Side): SideData | null {
  return side === 'front' ? { dotGrid: t.dotGrid, objects: t.objects } : t.back;
}

/**
 * 지금 편집 중인 쪽(앞/뒤)만 고친다.
 *
 * 그리기·격자·실행취소가 전부 이걸 거친다. **뒷면인데 아직 만들지 않았으면
 * 조용히 아무 일도 하지 않는다** — 화면이 `뒷면 만들기` 버튼으로 먼저 만들게
 * 하므로, 여기까지 오는 것은 사실상 일어나지 않는 경우에 대한 방어선이다.
 */
function patchActiveSide(
  s: Pick<Settings, 'templates' | 'activeId' | 'side'>,
  fn: (data: SideData) => Partial<SideData>,
): Pick<Settings, 'templates'> {
  const active = activeTemplate(s);
  if (!active) return { templates: s.templates };

  if (s.side === 'front') {
    return {
      templates: s.templates.map((t) =>
        t.id === active.id ? { ...t, ...fn({ dotGrid: t.dotGrid, objects: t.objects }) } : t,
      ),
    };
  }

  if (!active.back) return { templates: s.templates };
  return {
    templates: s.templates.map((t) => {
      if (t.id !== active.id || !t.back) return t;
      return { ...t, back: { ...t.back, ...fn(t.back) } };
    }),
  };
}

/** 지금 편집 중인 쪽의 그린 것들을 갈아끼우고 실행취소에 한 칸 쌓는다. */
function commitObjects(
  s: Pick<Settings, 'templates' | 'activeId' | 'side'>,
  next: DiaryObject[],
): Pick<Settings, 'templates'> {
  return patchActiveSide(s, (d) => ({ objects: commit(d.objects, next) }));
}

/** 지금 편집 중인 쪽의 그린 것들. 없으면(양식이 없거나 뒷면이 없으면) 빈 목록이다. */
function activeObjects(s: Pick<Settings, 'templates' | 'activeId' | 'side'>): DiaryObject[] {
  const active = activeTemplate(s);
  if (!active) return [];
  return activeSideData(active, s.side)?.objects.present ?? [];
}

/** 더 이상 존재하지 않는 양식을 가리키는 칸 배정을 걷어낸다. */
function pruneSlotAssignment(
  templates: Template[],
  assignment: Record<number, string>,
): Record<number, string> {
  const ids = new Set(templates.map((t) => t.id));
  return Object.fromEntries(Object.entries(assignment).filter(([, id]) => ids.has(id)));
}

/**
 * 인쇄할 용지의 칸마다 실제로 쓸 양식.
 *
 * `count`개(레이아웃의 슬롯 수)를 채워서 돌려준다 — 배정이 없거나, 배정된
 * 양식이 지워졌거나, **규격이 지금 양식과 다르면** 전부 지금 양식(activeId)으로
 * 대신한다. 규격이 다른 양식을 섞으면 배치 계산(칸 크기)이 성립하지 않는다.
 */
export function resolveSlotTemplates(s: Settings, count: number): Template[] {
  const base = activeTemplate(s);
  if (!base) return [];
  const out: Template[] = [];
  for (let i = 0; i < count; i++) {
    const id = s.slotAssignment[i];
    const t = id ? s.templates.find((x) => x.id === id) : undefined;
    // 규격이 같고, 그 양식도 낱장 조합에 낄 수 있어야(single) 유효하다.
    // 반복(repeat) 양식은 자기 하나로만 여러 장을 채우는 것이라 낄 수 없다 —
    // 뒤늦게 repeat으로 바뀐 양식이 배정에 남아 있는 경우를 여기서 막는다.
    const valid = t && t.repeat.mode === 'single' && sameSize(t.insert, base.insert);
    out.push(valid ? t : base);
  }
  return out;
}

const firstPaper = PAPER_PRESETS[0];

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
  // 빈 갤러리에서 시작한다. 첫 양식은 사용자가 규격을 골라 만든다.
  templates: [],
  activeId: '',
  side: 'front',
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
  duplex: false,
  fillEmptyBack: false,
  comboSheets: 1,
  cutStack: false,
  cutStackGroup: 0,
  unprintable: { show: true, width: 3 },
  slotAssignment: {},

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

  // 격자는 앞뒤가 따로다. 뒷면을 줄노트로, 앞면은 도트로 두는 식이 가능해야 한다.
  patchDotGrid: (p) => set((s) => patchActiveSide(s, (d) => ({ dotGrid: { ...d.dotGrid, ...p } }))),

  patchRepeat: (repeat) => set((s) => patchActive(s, () => ({ repeat }))),

  setSide: (side) => set({ side, selectedIds: [] }),

  addBack: () =>
    set((s) => {
      const active = activeTemplate(s);
      if (!active || active.back) return {};
      return { templates: s.templates.map((t) => (t.id === active.id ? { ...t, back: newBack() } : t)) };
    }),

  removeBack: () =>
    set((s) => {
      const active = activeTemplate(s);
      if (!active || !active.back) return {};
      const templates = s.templates.map((t) => (t.id === active.id ? { ...t, back: null } : t));
      // 뒷면 탭을 보던 중이었다면 이제 볼 것이 없으니 앞면으로 돌아간다.
      return { templates, side: 'front' as const, selectedIds: [] };
    }),

  /* ─────────────────────────── 양식 관리 ─────────────────────────── */

  // 양식을 바꾸면 앞면으로 돌아간다. 방금 만진 양식의 뒷면 탭에 남아 있다가
  // 뒷면 없는 다른 양식으로 넘어가면 헷갈린다.
  selectTemplate: (activeId) => set({ activeId, side: 'front', selectedIds: [] }),

  addTemplate: (insert, name, grid) =>
    set((s) => {
      // 규격을 주지 않으면 지금 보던 양식의 규격을 물려받는다. 갤러리에서 크기
      // 그룹의 `+`를 누르는 경우가 그렇다 — 그 크기로 하나 더 만드는 뜻이다.
      const cur = activeTemplate(s)?.insert ?? NO_INSERT;
      const base = insert ?? { ...cur, punch: { ...cur.punch } };
      const made = newTemplate(
        uniqueName(s.templates, name?.trim() || defaultName(s.templates, base)),
        base,
      );
      if (grid) made.dotGrid = { ...grid };
      return { templates: [...s.templates, made], activeId: made.id, side: 'front', selectedIds: [] };
    }),

  copyTemplate: (id, insert) =>
    set((s) => {
      const source = s.templates.find((t) => t.id === id);
      if (!source) return {};
      const made = duplicateTemplate(source, uniqueName(s.templates, `${source.name} 사본`), insert);
      // 원본 바로 뒤에 넣는다. 목록 끝으로 보내면 어디 갔는지 찾게 된다.
      const at = s.templates.indexOf(source) + 1;
      const templates = [...s.templates.slice(0, at), made, ...s.templates.slice(at)];
      return { templates, activeId: made.id, side: 'front', selectedIds: [] };
    }),

  renameTemplate: (id, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return { templates: s.templates.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) };
    }),

  removeTemplate: (id) =>
    set((s) => {
      // 마지막 하나도 지울 수 있다. 빈 갤러리는 정상적인 상태다.
      const templates = s.templates.filter((t) => t.id !== id);
      const activeId = templates.some((t) => t.id === s.activeId)
        ? s.activeId
        : (templates[0]?.id ?? '');
      return {
        templates,
        activeId,
        selectedIds: [],
        // 지워진 양식을 가리키던 칸 배정도 함께 걷어낸다.
        slotAssignment: pruneSlotAssignment(templates, s.slotAssignment),
      };
    }),

  assignSlot: (index, templateId) =>
    set((s) => {
      const next = { ...s.slotAssignment };
      if (templateId) next[index] = templateId;
      else delete next[index];
      return { slotAssignment: next };
    }),

  // 도구를 바꾸면 고른 것을 놓는다. 그리기 중에 선택 테두리가 남아 있으면 헷갈린다.
  setTool: (tool) => set({ tool, selectedIds: [] }),

  drawLines: (segs) =>
    set((s) => {
      const cur = activeObjects(s);
      const next = toggleLines(cur, segs, s.drawStyle);
      if (next === cur) return {};
      return commitObjects(s, next);
    }),

  setDrawStyle: (patch) => set((s) => ({ drawStyle: { ...s.drawStyle, ...patch } })),

  commitText: (box, id) =>
    set((s) => {
      const cur = activeObjects(s);
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
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'text' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof TextStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  setField: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'text' || !s.selectedIds.includes(o.id)) return o;
        if (patch === null) {
          const merged = { ...o };
          delete merged.field;
          return merged;
        }
        // 준 키만 덮어쓴다. 오프셋은 그대로 두고 서식만 바꾸는 경우가 그렇다 —
        // 통째로 넣으면 여러 글자를 골랐을 때 전부 같은 오프셋으로 튄다.
        const base = o.field ?? { offset: 0, format: DEFAULT_FIELD_FORMAT };
        return { ...o, field: { ...base, ...patch } };
      });
      return commitObjects(s, next);
    }),

  setTextDraftStyle: (patch) => set((s) => ({ textDraftStyle: { ...s.textDraftStyle, ...patch } })),

  commitCalendar: (box) =>
    set((s) => {
      const next: CalendarObject = { id: newId('c'), type: 'calendar', ...box };
      // 곧바로 고른 상태로 둔다. 놓자마자 크기부터 다듬는 일이 흔해서,
      // 손잡이가 바로 보여야 한 번 더 클릭하지 않고 이어서 끌 수 있다.
      return { ...commitObjects(s, [...activeObjects(s), next]), selectedIds: [next.id] };
    }),

  resizeObject: (id, box) =>
    set((s) => {
      const cur = activeObjects(s);
      const target = cur.find((o) => o.id === id);
      if (!target || isLine(target)) return {};
      return commitObjects(s, cur.map((o) => (o.id === id ? { ...o, ...box } : o)));
    }),

  styleCalendar: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'calendar' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof CalendarStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

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
      const print = p.print as Partial<Settings>;
      return {
        templates,
        activeId: templates[0]?.id ?? '',
        selectedIds: [],
        userFonts: fonts.map((f) => ({ ...f, family: `user-font-${f.id}` })),
        // 용지·배치는 저장된 것이 있으면 덮어쓰고, 없는 값은 지금 것을 지킨다.
        ...print,
        paper: { ...s.paper, ...((p.print as { paper?: PaperState }).paper ?? {}) },
        // 칸 배정도 저장돼 있으면 함께 돌아온다. id는 양식과 함께 저장되므로
        // 대개 그대로 맞지만, 혹시 어긋난 것이 있으면 걷어낸다.
        slotAssignment: pruneSlotAssignment(templates, print.slotAssignment ?? {}),
        // side는 저장하지 않는 값이다. print를 펼친 뒤 마지막에 확실히 앞면으로 둔다.
        side: 'front' as const,
      };
    }),

  select: (selectedIds) => set({ selectedIds }),

  deleteSelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const keep = activeObjects(s).filter((o) => !s.selectedIds.includes(o.id));
      return { ...commitObjects(s, keep), selectedIds: [] };
    }),

  moveSelected: (dx, dy) =>
    set((s) => {
      if (s.selectedIds.length === 0 || (dx === 0 && dy === 0)) return {};
      const moved = activeObjects(s).map((o) =>
        s.selectedIds.includes(o.id) ? moveObject(o, dx, dy) : o,
      );
      return commitObjects(s, moved);
    }),

  reshapeSelected: (id, end, p) =>
    set((s) => {
      const cur = activeObjects(s);
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
      const next = activeObjects(s).map((o) => {
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
  // 실행취소는 **지금 양식의, 지금 편집 중인 쪽만** 되돌린다. 양식을 바꾸거나
  // 앞뒤를 넘나든 뒤 ⌘Z를 눌렀는데 다른 쪽의 작업이 사라지면 무섭다.
  undo: () =>
    set((s) => {
      const active = activeTemplate(s);
      const data = active && activeSideData(active, s.side);
      if (!data) return {};
      const objects = undo(data.objects);
      return {
        ...patchActiveSide(s, () => ({ objects })),
        selectedIds: prune(s.selectedIds, objects.present),
      };
    }),
  redo: () =>
    set((s) => {
      const active = activeTemplate(s);
      const data = active && activeSideData(active, s.side);
      if (!data) return {};
      const objects = redo(data.objects);
      return {
        ...patchActiveSide(s, () => ({ objects })),
        selectedIds: prune(s.selectedIds, objects.present),
      };
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
 * 칸 크기는 **지금 양식의 속지**에서 나온다. 낱장 조합으로 칸마다 다른 양식을
 * 넣어도(`resolveSlotTemplates`) 한 용지 안에서는 규격이 같아야 하므로 이
 * 계산은 그대로다 — 배치는 규격 하나로 한 번만 일어난다.
 */
export function selectLayout(s: Settings): Layout {
  const { width, height } = paperSize(s.paper);
  const insert = activeTemplate(s)?.insert ?? NO_INSERT;
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
export const useInsert = () => useStore((s) => activeTemplate(s)?.insert ?? NO_INSERT);
export const useDotGrid = () =>
  useStore((s) => {
    const active = activeTemplate(s);
    return (active && activeSideData(active, s.side)?.dotGrid) ?? NO_GRID;
  });
export const useObjects = () =>
  useStore((s) => {
    const active = activeTemplate(s);
    return (active && activeSideData(active, s.side)?.objects) ?? NO_OBJECTS;
  });
export const useRepeat = () => useStore((s) => activeTemplate(s)?.repeat ?? NO_REPEAT);
export const useSide = () => useStore((s) => s.side);
export const useHasBack = () => useStore((s) => activeTemplate(s)?.back != null);

export { INSERT_PRESETS, PAPER_PRESETS };
export type { Settings, PaperState, UnprintableSetting };
export type { InsertSetting, RepeatSetting, Template };
