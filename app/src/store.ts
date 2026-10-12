import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import { INSERT_PRESETS, PAPER_PRESETS, findPaperPreset } from './core/presets';
import type { PunchSetting } from './core/punch';
import type { Align } from './core/layout';
import { DEFAULT_DOT_GRID, type DotGrid } from './core/grid';
import { DEFAULT_FIELD_DRAFT, patchField, type FieldDraft, type FieldSpec } from './core/fieldFormat';
import { applyToDraft, pickSavedStyle, stylePatchOf, type SavedTextStyle } from './core/textStyles';
import { clonePalette, mergePalette, newSavedPalette, type SavedPalette } from './core/palettes';
import { canRedo, canUndo, commit, initHistory, redo, undo, type History } from './core/history';
import type { InsertSetting } from './core/template';
import { persistFontMeta, removeFont } from './fonts/registry';
import { ensureCoverageFont } from './fonts/coverage';
import { hasUndrawableChar } from './core/fontCoverage';
import { persistImageMeta, removeImage } from './images/registry';
import { fontsInUse, imagesInUse, purgeable } from './core/assets';
import {
  cloneObject,
  dedupe,
  ensureIdCounterAbove,
  expandGroupSelection,
  isDegenerate,
  isLine,
  isText,
  moveObject,
  newId,
  reshape,
  sameSegment,
  toggleLines,
  type Box,
  type CalendarObject,
  type CalendarStyle,
  type CheckboxObject,
  type CheckboxStyle,
  type MoonObject,
  type MoonStyle,
  type CornerRoundness,
  type DiaryObject,
  type ImageObject,
  type LineSeg,
  type LineStyle,
  type ShapeObject,
  type ShapeStyle,
  type TextObject,
  type TextStyle,
} from './core/objects';
import type { CropMode } from './core/crop';
import type { Mm } from './core/units';
import type { UserFont } from './fonts/registry';
import type { UserImage } from './images/registry';
import {
  allIdsOf,
  cloneItem,
  duplicateItem,
  editableBackground,
  editableObjects,
  expandWork,
  insertItems,
  moveItem,
  newPage,
  newWork,
  removeItem,
  sourcePreview,
  spreadsOf,
  spreadByDates,
  revertToSource,
  writeBackground,
  writeObjects,
  type FaceTarget,
  type ResolvedFace,
  type Work,
  type WorkItem,
} from './core/work';
import { diaryFromPreset, nextDiaryColor, resizeDiary, type Diary } from './core/diary';
import { addPoint, colorOfKey, mapColors, refOf, setKeyColor, type WorkPalette } from './core/colors';
import { mapRuleColors, type RuleKey } from './core/colorRules';
import {
  DEFAULT_PROJECT_VIEW,
  isTrashed,
  restoreWork,
  trashWork,
  removeFolderFrom,
  worksUsingDiary,
  type Folder,
  type ProjectView,
} from './core/library';
import {
  activate,
  closeTab,
  emptyTabs,
  keepExisting,
  openTab,
  LIBRARY_TAB,
  type Cursor,
  type Side,
  type Tabs,
  type ViewMode,
} from './core/workspace';
import { todayFrom, type Boundary } from './core/dated';
import type { CalendarDate, DateDataset } from './core/dataset';
import {
  duplicatePages, importAfterIndex, importPages, movePages, pairedItemIds, type ImportPagesOptions,
} from './core/pages';

/**
 * 앱 상태 하나(CLAUDE.md: zustand 한 개) — 리뉴얼판.
 *
 * 옛 판은 "양식(Template) 목록 + 지금 양식"이었다. 이제는 **작업(Work) 목록 + 열린 탭**이고,
 * 편집 화면은 지금 탭의 작업에서 **고치는 자리(FaceTarget)** 하나를 고친다
 * (design/리뉴얼/세부계획.md A0·A4.6, 구현전략 1~3단계).
 *
 * 그리기·고르기·옮기기 같은 편집 동작은 옛 판의 몸체를 그대로 옮겼다. 바뀐 것은
 * 그 동작들이 읽고 쓰는 두 함수뿐이다 — `activeObjects`(읽기)와 `commitObjects`(쓰기).
 * 무엇을 어떻게 고치는지(보통 페이지·원본 편집·날짜 페이지)는 core/work의
 * `editableObjects`·`writeObjects`가 정한다.
 */

interface PaperState {
  presetId: string;
  width: Mm;
  height: Mm;
  landscape: boolean;
  printMargin: Mm;
}

interface UnprintableSetting {
  show: boolean;
  width: Mm;
}

export type Tool = 'select' | 'draw' | 'text' | 'table' | 'field' | 'calendar' | 'image' | 'checkbox' | 'moon';

// 탭마다 기억하는 편집 위치의 모양은 core/workspace에 둔다 — 저장소(storage/v2)도 같은 모양을 읽고 쓴다.
export type { Cursor, Side, ViewMode } from './core/workspace';

/** 복사한 자리 — 같은 자리에 다시 붙이면 살짝 밀고, 다른 자리면 같은 위치에 붙인다. */
export interface ClipboardOrigin {
  workId: string;
  faceKey: string;
}

export type DrawStyle = LineStyle & { roundness?: CornerRoundness };

interface Settings {
  /** 저장소에서 다 읽어왔는가. 그 전에는 저장하지 않는다(빈 상태로 덮어쓰지 않게). */
  ready: boolean;
  /** 브라우저 저장 결과(ui/persist가 갱신). 이 값 자체는 저장하지 않는다. */
  saveStatus: 'saved' | 'pending' | 'saving' | 'error';
  /** Colors에서 고르는 동안만 쓰는 팔레트. 작업·자동 저장에는 확정 전까지 넣지 않는다. */
  palettePreview: { workId: string; palette: WorkPalette } | null;
  /** 오늘 날짜 `YYYY-MM-DD`. 날짜 묶음이 아닌 페이지의 자동 필드가 보여준다. */
  today: string;

  works: Work[];
  diaries: Diary[];
  folders: Folder[];
  /** Projects의 검색·정렬·필터. 작업 탭을 오가도 이번 실행의 목록 위치를 기억한다. */
  projectView: ProjectView;
  /** 새 작업을 만들 때 쓰는 다이어리. */
  defaultDiaryId: string | null;
  tabs: Tabs;
  /** 작업마다 되돌리기 기록. 처음 고칠 때 만든다. */
  histories: Record<string, History<WorkItem[]>>;
  cursors: Record<string, Cursor>;
  /** 탭이 꽉 차서 열지 못한 작업과 닫을 후보 — 화면이 물어본다. */
  pendingOpen: { workId: string; victim: string; printing?: boolean } | null;

  tool: Tool;
  selectedIds: string[];
  clipboard: DiaryObject[];
  clipboardOrigin: ClipboardOrigin | null;
  toast: { message: string; key: number } | null;
  drawStyle: DrawStyle;
  checkboxDraftStyle: CheckboxStyle;
  calendarDraftStyle: CalendarStyle;
  textDraftStyle: TextStyle;
  /** AutoField 도구로 다음에 찍을 칸의 설정(종류·형식·기준일·시작 번호). */
  fieldDraft: FieldDraft;
  /**
   * 다음에 찍을 칸이 이 페이지의 몇째 날짜인지(0부터)와, 찍을 때마다 다음 날짜로 넘길지.
   * 넘기기는 기본이 꺼짐 — 같은 날의 월·일·요일 칸을 따로 놓을 때 모두 같은 날짜여야 한다
   * (세부계획 A4.3). 위클리처럼 칸마다 다른 날짜면 켠다.
   */
  fieldNext: { offset: number; advance: boolean };
  /**
   * 첫 다이어리 온보딩 창을 띄울지(기본계획 7장: 처음 Create를 누를 때). 다이어리가 없을 때 새 작업을
   * 누르면 켜진다. 저장하지 않는다.
   */
  onboarding: boolean;
  /** 저장한 글자 스타일 — 모든 작업 공통(core/textStyles). 앱 전체 설정과 함께 저장된다(ui/persist). */
  textStyles: SavedTextStyle[];
  /** 저장한 팔레트 — 모든 작업 공통(core/palettes). 앱 전체 설정과 함께 저장된다(ui/persist). */
  savedPalettes: SavedPalette[];
  userFonts: UserFont[];
  userImages: UserImage[];
  pickImageFor: string | null;

  /* 인쇄 설정 — Print 화면(6단계)이 쓴다. 지금 앱의 값 그대로. */
  paper: PaperState;
  gap: Mm;
  allowRotate: boolean;
  align: Align;
  cropMark: CropMode;
  cropFrontOnly: boolean;
  showRuler: boolean;
  backTurn180: boolean;
  cutStack: boolean;
  cutStackGroup: number;
  unprintable: UnprintableSetting;
  /** 양면 작업의 빈 뒷면(홀수 페이지의 마지막 장)에 바탕(도트)을 찍을지 — 끄면 빈 종이(세부계획 A14 결정). */
  blankBackGrid: boolean;
  /** 출력 면 — 수동 양면 인쇄용(Marks). */
  printSides: 'both' | 'front' | 'back';
  /** 출력 범위(Paper) — 전체 / 페이지 선택(`1-5, 8`). 작업마다가 아니라 지금 Print에 쓰는 값. */
  printRange: { mode: 'all' | 'pick'; text: string };
  /** 속지마다 몇 부 찍을지 — 출력 범위처럼 이번 실행에만 기억한다(저장하지 않는다). */
  printCopies: number;
  /** PDF 전 확인 창에서 지난번에 고른 것 — 다음에 미리 체크해 둔다(기능후보 9). 미리보기도 이대로 그린다. */
  exportChoice: { grid: boolean; punch: boolean };
}

interface Store extends Settings {
  /** 저장소에서 읽은 것으로 채운다. */
  hydrate: (data: {
    works: Work[];
    diaries: Diary[];
    folders: Folder[];
    tabs?: Tabs;
    defaultDiaryId?: string | null;
    textStyles?: SavedTextStyle[];
    savedPalettes?: SavedPalette[];
    fonts?: UserFont[];
    images?: UserImage[];
    /** 저장해 둔 인쇄 설정(용지·배치·표시·확인 창의 선택). */
    print?: Partial<SavedPrintSettings>;
    cursors?: Record<string, Cursor>;
  }) => void;
  setToday: (iso: string) => void;

  /* ── 탭 ── */
  openWork: (id: string) => void;
  /** 꽉 찬 탭에서 후보를 닫고 기다리던 작업을 연다. `false`면 열지 않고 그만둔다. */
  resolvePendingOpen: (closeVictim: boolean) => void;
  closeWorkTab: (id: string) => void;
  activateTab: (id: string) => void;

  /* ── 작업 ── */
  createWork: (name?: string) => string | null;
  /**
   * 화면의 ‘새 작업’(홈의 행성·탭의 +·Projects). 다이어리가 하나도 없으면 작업을 만들지 않고 첫 다이어리
   * 온보딩을 띄운다(null). 있으면 기본 다이어리로 만든다.
   */
  startNewWork: () => string | null;
  /** 온보딩을 마친다 — 다이어리를 등록해 기본으로 정하고 새 작업을 연다. `null`이면 창만 닫는다. */
  finishOnboarding: (diary: { presetId: string; name: string; size?: { width: Mm; height: Mm } } | null) => string | null;
  renameWork: (id: string, name: string) => void;
  /** 원본은 유지하고 등록된 다른 다이어리로도 복제할 수 있다. */
  duplicateWork: (id: string, diaryId?: string) => string | null;
  /** 작업의 다이어리를 바꾼다(편집기 다이어리 칩의 ‘이 작업을 바꾸기’). 좌표는 그대로 — 크기에 맞춰 줄이지 않는다. */
  setWorkDiary: (id: string, diaryId: string) => void;
  trashWorkById: (id: string) => void;
  restoreWorkById: (id: string) => void;
  deleteWorkForever: (id: string) => void;
  moveWorkToFolder: (id: string, folderId: string | null) => void;
  setDuplex: (duplex: boolean) => void;

  /* ── 폴더·다이어리 ── */
  addFolder: (name: string) => string | null;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  /** 규격에서 다이어리를 등록한다. 실측이 다르면 `size`로 — 기준 규격 이름표는 ±10mm로 다시 붙인다. */
  addDiary: (presetId: string, name: string, size?: { width: Mm; height: Mm }) => string;
  /** 이름·색·크기를 고친다. 크기를 바꾸면 기준 규격 이름표도 다시 붙인다(core/diary의 resizeDiary). */
  patchDiary: (id: string, patch: Partial<Omit<Diary, 'id' | 'punch' | 'presetId'>>) => void;
  /** 이 다이어리의 구멍 설정을 고친다(Library → Diaries). 같은 다이어리를 쓰는 작업이 모두 바뀐다. */
  patchDiaryPunch: (id: string, p: Partial<PunchSetting>) => void;
  /** 쓰는 작업이 없을 때만 지운다(휴지통 포함). 지웠으면 true. 기본이었으면 남은 첫 다이어리가 기본이 된다. */
  removeDiary: (id: string) => boolean;
  setDefaultDiary: (id: string) => void;

  /* ── 페이지 ── */
  /** 지금 보는 면이 속한 항목 바로 뒤에 빈 페이지. 면이 없으면 맨 뒤. */
  addPageAfterCurrent: () => void;
  /**
   * 맨 뒤에 빈 페이지 — 양면이면 앞·뒤 두 면(종이 한 장)을 함께. 새 페이지로 간다.
   * 바탕은 지금 보던 면(없으면 마지막 면)을 물려받는다.
   */
  addPagesAtEnd: () => void;
  duplicateItemAt: (index: number, count?: number) => void;
  removeItemAt: (index: number) => void;
  moveItemTo: (from: number, to: number) => void;
  duplicateSelectedPages: (ids: string[], count: number) => void;
  removeSelectedPages: (ids: string[]) => void;
  moveSelectedPages: (ids: string[], beforeId: string | null) => void;
  importPagesFrom: (sourceId: string, ids: string[], options: ImportPagesOptions) => boolean;
  /** 펼침면(일렬이면 면)으로 간다. 원본 편집 중이었으면 빠져나온다. */
  goTo: (spread: number, side?: Side) => void;
  setSide: (side: Side) => void;
  setView: (view: ViewMode) => void;
  enterSourceEdit: (itemId: string, faceIndex: number) => void;
  exitSourceEdit: () => void;
  /** 이 탭을 Print 화면으로 / 편집 화면으로. */
  openPrint: (workId?: string) => void;
  rememberViewport: (patch: Partial<Pick<Cursor, 'zoom' | 'scrollTop' | 'scrollLeft'>>) => void;
  closePrint: () => void;
  /** 편집 화면의 이 면(0부터)으로 간다 — Print 미리보기에서 속지를 누르면(‘이 페이지 편집’). */
  goToFace: (faceIndex: number) => void;
  /**
   * 보통 페이지를 날짜 묶음으로 펼친다(‘날짜로 펼치기’, 세부계획 A4.6). 되돌리기 된다.
   * 날짜 묶음이면 기간만 바꾼다 — 날짜별 수정은 날짜에 붙어 있어 같은 날짜면 따라간다.
   */
  setDatedPeriod: (itemId: string, dataset: DateDataset, boundary: Boundary) => void;
  /** 날짜 페이지에서 고른 객체를 원본으로 되돌린다(그 날짜에서 바꾼 속성을 지운다). */
  revertSelectedToSource: () => void;

  /* ── 바탕·속지 ── */
  patchDotGrid: (p: Partial<DotGrid>) => void;
  /** 지금 작업의 다이어리 구멍 설정. 같은 다이어리를 쓰는 작업이 모두 바뀐다. */
  patchPunch: (p: Partial<PunchSetting>) => void;

  /* ── 작업 색상 ── */
  addPaletteColor: (color: string) => void;
  setPaletteColor: (key: string, color: string) => void;
  previewPaletteColor: (key: string, color: string) => void;
  finishPalettePreview: (save: boolean) => void;
  /** 포인트 칸을 지운다. 그 칸을 쓰던 객체는 `replaceWith`(이름표나 색)로 옮긴다. */
  removePaletteColor: (key: string, replaceWith: string) => void;
  /** 색 규칙 하나를 정한다(값은 팔레트 이름표). undefined면 그 규칙을 끈다. 팔레트처럼 되돌리기 대상이 아니다. */
  setColorRule: (key: RuleKey, color: string | undefined) => void;

  /* ── 편집 ── */
  setTool: (t: Tool) => void;
  drawLines: (segs: LineSeg[]) => void;
  /** 펼침면의 두 면을 잇는 선 — 양쪽 반쪽을 한 번에 그린다(되돌리기도 한 번). */
  select: (ids: string[]) => void;
  deleteSelected: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  lockSelected: () => void;
  unlockAll: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  moveSelected: (dx: Mm, dy: Mm) => void;
  reshapeSelected: (id: string, end: 1 | 2, p: { x: Mm; y: Mm }) => void;
  styleSelected: (patch: LineStyle) => void;
  setDrawStyle: (patch: DrawStyle) => void;
  commitText: (box: Omit<TextObject, 'id' | 'type'>, id?: string) => void;
  showToast: (message: string) => void;
  dismissToast: (key: number) => void;
  styleText: (patch: TextStyle) => void;
  setField: (patch: Partial<FieldSpec> | null) => void;
  setTextDraftStyle: (patch: TextStyle) => void;
  setFieldDraft: (patch: Partial<FieldDraft>) => void;
  setFieldNext: (patch: Partial<{ offset: number; advance: boolean }>) => void;
  /** 글자 모양을 이름 붙여 저장한다(글꼴·크기·간격·색·B·I·U·S만). 저장한 것의 id. */
  saveTextStyle: (name: string, style: TextStyle) => string;
  /* ── 저장한 팔레트(Library → Colors, 7-4) ── */
  /** 지금 작업의 팔레트를 이름 붙여 보관한다(복사). 작업이 없으면 null. */
  savePalette: (name: string) => string | null;
  /** 새 팔레트(기본 5칸 + A)를 만든다. */
  createPalette: (name: string) => string;
  patchSavedPalette: (id: string, patch: Partial<Pick<SavedPalette, 'name' | 'palette'>>) => void;
  removeSavedPalette: (id: string) => void;
  /** 보관한 팔레트를 지금 작업에 복사해 넣는다 — 같은 칸만 덮어쓴다(core/palettes `mergePalette`). */
  loadPalette: (id: string) => void;
  removeTextStyle: (id: string) => void;
  /**
   * 저장한 스타일을 쓴다 — 고른 글자가 있으면 그 글자에(되돌리기 됨), 없으면 다음에 놓을 글자에
   * 쓰고 글자 도구를 든다(세부계획 A8 결정 2026-10-12).
   */
  applyTextStyle: (id: string) => void;
  commitCalendar: (box: Box) => void;
  resizeObject: (id: string, box: Box, extra?: Partial<TextObject>) => void;
  styleCalendar: (patch: CalendarStyle) => void;
  addUserFont: (font: UserFont) => void;
  renameUserFont: (id: string, label: string) => void;
  toggleFontFavorite: (id: string) => void;
  addUserImage: (image: UserImage) => void;
  renameUserImage: (id: string, label: string) => void;
  /**
   * Library에서 지운다(리뉴얼 7-3, core/assets). 쓰는 작업이 있으면(휴지통 포함) **목록에서만** 빼고
   * (`'hidden'`), 없으면 파일까지 지운다(`'deleted'`). 없는 id면 null.
   */
  removeUserImage: (id: string) => 'hidden' | 'deleted' | null;
  removeUserFont: (id: string) => 'hidden' | 'deleted' | null;
  /** 목록에서 뺀 이미지·글꼴 중 이제 아무도 안 쓰는 것의 파일을 지운다 — 영구 삭제 뒤·앱을 열 때. */
  purgeUnusedAssets: () => void;
  commitImage: (box: Box) => void;
  styleImage: (imageId: string) => void;
  requestImagePick: (id: string | null) => void;
  styleImageRotate: (rotate: number) => void;
  commitShape: (box: Box) => void;
  commitTable: (border: Box, innerLines: LineSeg[]) => void;
  styleShape: (patch: ShapeStyle) => void;
  setCheckboxDraftStyle: (patch: CheckboxStyle) => void;
  setCalendarDraftStyle: (patch: CalendarStyle) => void;
  commitCheckboxes: (boxes: Box[]) => void;
  styleCheckbox: (patch: CheckboxStyle) => void;
  /** 달 모양을 놓는다 — 날짜는 `fieldNext`의 순번(날짜 칸과 같이 쓴다). 놓은 것을 고른다. */
  commitMoon: (box: Box) => void;
  /** 고른 달의 크기·굵기·색·날짜 순번. undefined를 준 키는 지워 기본값으로. */
  styleMoon: (patch: MoonStyle) => void;
  undo: () => void;
  redo: () => void;

  /* ── 인쇄 설정 ── */
  setPaperPreset: (id: string) => void;
  patchPaper: (p: Partial<PaperState>) => void;
  patch: (p: Partial<Settings>) => void;
  patchUnprintable: (p: Partial<UnprintableSetting>) => void;
}

/* ────────────────────────── 인쇄 설정 저장 ────────────────────────── */

/** 앱 설정과 함께 저장하는 인쇄 설정 — 다음에 열어도 용지·배치·확인 창의 선택이 그대로다. */
export const SAVED_PRINT_KEYS = [
  'paper',
  'gap',
  'allowRotate',
  'align',
  'cropMark',
  'cropFrontOnly',
  'showRuler',
  'backTurn180',
  'cutStack',
  'cutStackGroup',
  'unprintable',
  'blankBackGrid',
  'printSides',
  'exportChoice',
] as const;
export type SavedPrintSettings = Pick<Settings, (typeof SAVED_PRINT_KEYS)[number]>;

/** 저장된 인쇄 설정에서 아는 키만(옛 값·모르는 키는 버린다). */
function pickPrintSettings(saved: Partial<SavedPrintSettings>): Partial<SavedPrintSettings> {
  const out: Record<string, unknown> = {};
  for (const key of SAVED_PRINT_KEYS) if (saved[key] !== undefined) out[key] = saved[key];
  return out as Partial<SavedPrintSettings>;
}

export function savedPrintSettingsOf(s: Settings): SavedPrintSettings {
  const out: Record<string, unknown> = {};
  for (const key of SAVED_PRINT_KEYS) out[key] = s[key];
  return out as SavedPrintSettings;
}

/* ────────────────────────── 지금 탭·지금 면 ────────────────────────── */

/** 지금 탭의 작업. Library 탭이면 null. */
export function activeWork(s: Pick<Settings, 'works' | 'tabs'>): Work | null {
  if (s.tabs.active === LIBRARY_TAB) return null;
  return s.works.find((w) => w.id === s.tabs.active) ?? null;
}

function defaultCursor(work: Work): Cursor {
  return { spread: 0, side: 'front', source: null, view: work.duplex ? 'spread' : 'single' };
}

export function cursorOf(s: Pick<Settings, 'cursors'>, work: Work): Cursor {
  return s.cursors[work.id] ?? defaultCursor(work);
}

/**
 * 커서를 지금 펼침면 개수 안으로 — 페이지를 지우거나 되돌리면 기억해 둔 펼침면 번호가
 * 끝을 넘을 수 있다. 넘으면 마지막 펼침면을 본다(빈 화면이 되지 않게).
 */
export function clampCursor(work: Work, cursor: Cursor, faceCount: number): Cursor {
  const count = spreadsFor(work, cursor, faceCount).length;
  if (count === 0 || cursor.spread < count) return cursor;
  return { ...cursor, spread: count - 1 };
}

/**
 * 작업의 펼친 면들. 같은 작업(참조)·같은 날이면 다시 계산하지 않는다 — 화면이 매번
 * 새 배열을 받으면 다시 그리기를 멈추지 못한다(zustand 선택자 규칙).
 */
const facesCache = new WeakMap<Work, { today: string; faces: ResolvedFace[] }>();
export function facesOf(work: Work, today: string): ResolvedFace[] {
  const hit = facesCache.get(work);
  if (hit && hit.today === today) return hit.faces;
  const faces = expandWork(work, parseToday(today));
  facesCache.set(work, { today, faces });
  return faces;
}

function parseToday(iso: string): CalendarDate {
  return todayFrom(iso);
}

/** 펼침면들 — 양면이면서 펼침면 보기면 (뒷면|앞면) 짝, 아니면 면마다 오른쪽에 하나씩. */
export function spreadsFor(work: Work, cursor: Cursor, faceCount: number): [number | null, number | null][] {
  if (work.duplex && cursor.view === 'spread') return spreadsOf(faceCount);
  return Array.from({ length: faceCount }, (_, i): [number | null, number | null] => [null, i]);
}

/** 지금 고치는 자리. `side`를 주지 않으면 커서의 쪽. 그 쪽에 면이 없으면 null. */
export function targetOf(s: Pick<Settings, 'works' | 'tabs' | 'cursors' | 'today'>, side?: Side): FaceTarget | null {
  const work = activeWork(s);
  if (!work) return null;
  const faces = facesOf(work, s.today);
  const cursor = clampCursor(work, cursorOf(s, work), faces.length);
  if (cursor.source) {
    // 원본 편집은 면 하나만 보여준다 — 오른쪽(앞면) 자리.
    if ((side ?? cursor.side) === 'back') return null;
    return { kind: 'source', itemId: cursor.source.itemId, faceIndex: cursor.source.faceIndex };
  }
  const spread = spreadsFor(work, cursor, faces.length)[cursor.spread];
  if (!spread) return null;
  const index = (side ?? cursor.side) === 'back' ? spread[0] : spread[1];
  const face = index === null ? undefined : faces[index];
  return face ? { kind: 'face', face } : null;
}

/** 화면에 보일 면 — 원본 편집이면 첫 날짜로 채운 원본, 아니면 펼친 면. */
export function displayFaceOf(s: Pick<Settings, 'works' | 'tabs' | 'cursors' | 'today'>, side?: Side): ResolvedFace | null {
  const work = activeWork(s);
  const target = targetOf(s, side);
  if (!work || !target) return null;
  if (target.kind === 'face') return target.face;
  const item = work.items.find((i) => i.id === target.itemId);
  return item?.kind === 'dated' ? sourcePreview(item, target.faceIndex, work.colorRules) : null;
}

function faceKeyOf(t: FaceTarget): string {
  return t.kind === 'face' ? t.face.key : `${t.itemId}:source:${t.faceIndex}`;
}

/** 지금 고치는 면의 객체. 없으면 빈 목록. */
function activeObjects(s: Settings, side?: Side): DiaryObject[] {
  const work = activeWork(s);
  const target = targetOf(s, side);
  return work && target ? editableObjects(work, target) : [];
}

/** 작업 하나를 새 항목들로 바꾸고 되돌리기에 한 칸 쌓는다. */
function commitItems(s: Settings, work: Work, items: WorkItem[]): Pick<Settings, 'works' | 'histories'> {
  const history = s.histories[work.id] ?? initHistory(work.items);
  const next: Work = { ...work, items, updatedAt: new Date().toISOString() };
  return {
    works: s.works.map((w) => (w.id === work.id ? next : w)),
    histories: { ...s.histories, [work.id]: commit(history, items) },
  };
}

/** 지금 고치는 면의 객체를 갈아 끼운다. */
function commitObjects(s: Settings, next: DiaryObject[], side?: Side): Partial<Settings> {
  const work = activeWork(s);
  const target = targetOf(s, side);
  if (!work || !target) return {};
  return commitItems(s, work, writeObjects(work, target, next));
}

/** 작업 자체(이름·색상·양면 등)만 바꾼다 — 되돌리기 대상이 아니다. */
function patchWork(s: Settings, id: string, fn: (w: Work) => Partial<Work>): Pick<Settings, 'works'> {
  return {
    works: s.works.map((w) => (w.id === id ? { ...w, ...fn(w), updatedAt: new Date().toISOString() } : w)),
  };
}

function patchActiveWork(s: Settings, fn: (w: Work) => Partial<Work>): Partial<Settings> {
  const work = activeWork(s);
  return work ? patchWork(s, work.id, fn) : {};
}

function setCursor(s: Settings, work: Work, patch: Partial<Cursor>): Pick<Settings, 'cursors' | 'selectedIds'> {
  const before = cursorOf(s, work);
  const moving = (patch.spread !== undefined && patch.spread !== before.spread)
    || (patch.view !== undefined && patch.view !== before.view)
    || (patch.source !== undefined && patch.source !== before.source);
  return {
    cursors: { ...s.cursors, [work.id]: { ...before, ...(moving ? { scrollTop: undefined, scrollLeft: undefined } : {}), ...patch, selectedIds: [] } },
    selectedIds: [],
  };
}

/** 더 이상 존재하지 않는 id를 선택 목록에서 걷어낸다. */
function prune(ids: string[], objects: DiaryObject[]): string[] {
  return ids.filter((id) => objects.some((o) => o.id === id));
}

/** 지금 고치는 면의 격자 — 붙여넣기가 도트에 맞춰 밀 양을 정할 때 쓴다. */
function activeGrid(s: Settings): DotGrid | null {
  const work = activeWork(s);
  const target = targetOf(s);
  return work && target ? editableBackground(work, target) : null;
}

/** 붙여넣을 때 원본과 겹치지 않게 옮기는 양. */
const PASTE_OFFSET: Mm = 5;

/** 파일을 보존할 참조 — 작업(휴지통 포함), 실행 취소·다시 실행, 복사한 요소. */
function assetDocuments(s: Settings): Pick<Work, 'items'>[] {
  const history = Object.values(s.histories).flatMap((h) => [...h.past, h.present, ...h.future].map((items) => ({ items })));
  return [...s.works, ...history, { items: [{ kind: 'page', id: 'clipboard', face: { id: 'clipboard', background: DEFAULT_DOT_GRID, objects: s.clipboard } }] }];
}

function imagesUsedBy(s: Settings): Set<string> { return imagesInUse(assetDocuments(s)); }

/** 글꼴은 저장한 글자 스타일·다음에 놓을 글자 설정도 참조한다. */
function fontsUsedBy(s: Settings): Set<string> {
  const used = fontsInUse(assetDocuments(s));
  for (const t of s.textStyles) if (t.style.font) used.add(t.style.font);
  if (s.textDraftStyle.font) used.add(s.textDraftStyle.font);
  return used;
}

/** 삭제 안내와 실제 파일 보존은 같은 참조를 판단한다. */
export function assetUseOf(s: Settings, kind: 'font' | 'image', id: string): { count: number; retained: boolean } {
  return {
    count: s.works.filter((w) => (kind === 'font' ? fontsInUse([w]) : imagesInUse([w])).has(id)).length,
    retained: (kind === 'font' ? fontsUsedBy(s) : imagesUsedBy(s)).has(id),
  };
}

/** 같은 이름이 있으면 ` 2`, ` 3`…을 붙인다. */
function uniqueWorkName(works: Work[], name: string): string {
  const names = new Set(works.map((w) => w.name));
  if (!names.has(name)) return name;
  for (let n = 2; ; n++) if (!names.has(`${name} ${n}`)) return `${name} ${n}`;
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 떠나는 탭의 선택을 기억하고 돌아오는 탭의 선택을 복원한다(기능후보 11). */
function withTabs(s: Settings, tabs: Tabs): Partial<Settings> {
  if (tabs.active === s.tabs.active) return { tabs, pendingOpen: null };
  const outgoing = activeWork(s);
  const cursors = outgoing
    ? { ...s.cursors, [outgoing.id]: { ...cursorOf(s, outgoing), selectedIds: s.selectedIds } }
    : s.cursors;
  const next = { ...s, tabs, cursors };
  const incoming = activeWork(next);
  return {
    tabs, cursors, pendingOpen: null,
    selectedIds: incoming ? prune(cursorOf(next, incoming).selectedIds ?? [], activeObjects(next)) : [],
  };
}

const firstPaper = PAPER_PRESETS[0];

export const useStore = create<Store>((set, get) => ({
  ready: false,
  saveStatus: 'saved',
  palettePreview: null,
  today: localToday(),
  works: [],
  diaries: [],
  folders: [],
  projectView: DEFAULT_PROJECT_VIEW,
  defaultDiaryId: null,
  tabs: emptyTabs(),
  histories: {},
  cursors: {},
  pendingOpen: null,

  tool: 'select',
  selectedIds: [],
  clipboard: [],
  clipboardOrigin: null,
  toast: null,
  drawStyle: {},
  checkboxDraftStyle: {},
  calendarDraftStyle: {},
  textDraftStyle: {},
  fieldDraft: DEFAULT_FIELD_DRAFT,
  fieldNext: { offset: 0, advance: false },
  onboarding: false,
  textStyles: [],
  savedPalettes: [],
  userFonts: [],
  userImages: [],
  pickImageFor: null,

  paper: {
    presetId: firstPaper.id,
    width: firstPaper.width,
    height: firstPaper.height,
    landscape: false,
    printMargin: 0,
  },
  gap: 0,
  allowRotate: true,
  align: 'center',
  cropMark: 'mark',
  cropFrontOnly: false,
  showRuler: false,
  backTurn180: false,
  cutStack: false,
  cutStackGroup: 0,
  unprintable: { show: true, width: 3 },
  blankBackGrid: false,
  printSides: 'both',
  printRange: { mode: 'all', text: '' },
  printCopies: 1,
  exportChoice: { grid: true, punch: false },

  hydrate: ({ works, diaries, folders, tabs, defaultDiaryId, textStyles = [], savedPalettes = [], fonts = [], images = [], print = {}, cursors = {} }) => {
    // 새로고침하면 id 카운터가 0부터 다시 시작한다 — 불러온 id들보다 위로 올려야
    // 새로 만드는 것이 불러온 것과 겹치지 않는다(옛 판 loadProject와 같은 이유).
    ensureIdCounterAbove([
      ...works.flatMap(allIdsOf),
      ...diaries.map((d) => d.id),
      ...folders.map((f) => f.id),
      ...textStyles.map((t) => t.id),
      ...savedPalettes.map((p) => p.id),
    ]);
    const exists = (id: string) => works.some((w) => w.id === id && !isTrashed(w));
    set({
      works,
      diaries,
      folders,
      defaultDiaryId: diaries.some((d) => d.id === defaultDiaryId) ? defaultDiaryId! : (diaries[0]?.id ?? null),
      tabs: keepExisting(tabs ?? emptyTabs(), exists),
      histories: {},
      cursors,
      selectedIds: [],
      textStyles,
      savedPalettes,
      userFonts: fonts,
      userImages: images,
      ...pickPrintSettings(print),
      ready: true,
    });
    const loaded = get();
    const work = activeWork(loaded);
    if (work) set({ selectedIds: prune(cursorOf(loaded, work).selectedIds ?? [], activeObjects(loaded)) });
  },

  setToday: (today) => set({ today }),

  openWork: (id) =>
    set((s) => {
      const result = openTab(s.tabs, id);
      if ('full' in result) return { pendingOpen: { workId: id, victim: result.full } };
      return withTabs(s, result.tabs);
    }),

  resolvePendingOpen: (closeVictim) =>
    set((s) => {
      if (!s.pendingOpen) return {};
      if (!closeVictim) return { pendingOpen: null };
      const closed = closeTab(s.tabs, s.pendingOpen.victim);
      const result = openTab(closed, s.pendingOpen.workId);
      if ('full' in result) return { pendingOpen: null };
      const next = { ...s, ...withTabs(s, result.tabs) };
      const work = activeWork(next);
      return s.pendingOpen.printing && work
        ? { ...withTabs(s, result.tabs), ...setCursor(next, work, { printing: true, source: null }) }
        : withTabs(s, result.tabs);
    }),

  closeWorkTab: (id) => set((s) => withTabs(s, closeTab(s.tabs, id))),

  activateTab: (id) => set((s) => withTabs(s, activate(s.tabs, id))),

  createWork: (name) => {
    const s = get();
    let diaries = s.diaries;
    let diaryId = s.defaultDiaryId;
    // 다이어리가 하나도 없으면 M6로 하나 만든다 — 온보딩(7단계)이 생기기 전까지의 받침.
    if (!diaryId || !diaries.some((d) => d.id === diaryId)) {
      const d = diaryFromPreset(newId('d'), 'M6', 'M6 (미니6)', nextDiaryColor([]));
      diaries = [...diaries, d];
      diaryId = d.id;
    }
    const now = new Date().toISOString();
    const work = newWork({ name: uniqueWorkName(s.works, name?.trim() || '새 작업'), diaryId, now });
    const result = openTab(s.tabs, work.id);
    set({
      works: [...s.works, work],
      diaries,
      defaultDiaryId: diaryId,
      ...('full' in result
        ? { pendingOpen: { workId: work.id, victim: result.full } }
        : withTabs({ ...s, works: [...s.works, work] }, result.tabs)),
    });
    return work.id;
  },

  startNewWork: () => {
    if (get().diaries.length === 0) {
      set({ onboarding: true });
      return null;
    }
    return get().createWork();
  },

  finishOnboarding: (diary) => {
    set({ onboarding: false });
    if (!diary) return null;
    const id = get().addDiary(diary.presetId, diary.name, diary.size);
    set({ defaultDiaryId: id });
    return get().createWork();
  },

  renameWork: (id, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return patchWork(s, id, () => ({ name: trimmed }));
    }),

  duplicateWork: (id, diaryId) => {
    const s = get();
    const source = s.works.find((w) => w.id === id);
    const targetDiaryId = diaryId ?? source?.diaryId;
    if (!source || !s.diaries.some((d) => d.id === targetDiaryId)) return null;
    const now = new Date().toISOString();
    const items = source.items.map(cloneItem);
    const copy: Work = {
      ...source,
      id: newId('w'),
      name: uniqueWorkName(s.works, `${source.name} 사본`),
      createdAt: now,
      updatedAt: now,
      diaryId: targetDiaryId!,
      palette: { base: { ...source.palette.base }, points: source.palette.points.map((p) => ({ ...p })) },
      items,
    };
    delete copy.trashedAt;
    const at = s.works.indexOf(source) + 1;
    set({ works: [...s.works.slice(0, at), copy, ...s.works.slice(at)] });
    return copy.id;
  },

  setWorkDiary: (id, diaryId) =>
    set((s) => (s.diaries.some((d) => d.id === diaryId) ? patchWork(s, id, () => ({ diaryId })) : {})),

  trashWorkById: (id) =>
    set((s) => {
      const now = new Date().toISOString();
      return {
        works: s.works.map((w) => (w.id === id ? trashWork(w, now) : w)),
        ...withTabs(s, closeTab(s.tabs, id)),
      };
    }),

  restoreWorkById: (id) => set((s) => ({ works: s.works.map((w) => (w.id === id ? restoreWork(w) : w)) })),

  deleteWorkForever: (id) => {
    set((s) => {
      const { [id]: _h, ...histories } = s.histories;
      const { [id]: _c, ...cursors } = s.cursors;
      const next = { ...s, works: s.works.filter((w) => w.id !== id), histories, cursors };
      return { works: next.works, histories, cursors, ...withTabs(next, closeTab(s.tabs, id)) };
    });
    // 이 작업만 쓰던, 목록에서 뺀 이미지·글꼴의 파일을 이제 지운다(core/assets).
    get().purgeUnusedAssets();
  },

  moveWorkToFolder: (id, folderId) =>
    set((s) => {
      if (folderId !== null && !s.folders.some((f) => f.id === folderId)) return {};
      if (s.works.find((w) => w.id === id)?.folderId === (folderId ?? undefined)) return {};
      return patchWork(s, id, () => ({ folderId: folderId ?? undefined }));
    }),

  setDuplex: (duplex) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      return {
        ...patchWork(s, work.id, () => ({ duplex })),
        ...setCursor(s, work, { spread: 0, view: duplex ? 'spread' : 'single', source: null }),
      };
    }),

  addFolder: (name) => {
    const trimmed = name.trim();
    if (trimmed === '') return null;
    const id = newId('fd');
    set((s) => ({ folders: [...s.folders, { id, name: trimmed }] }));
    return id;
  },

  renameFolder: (id, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return { folders: s.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)) };
    }),

  removeFolder: (id) =>
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      works: removeFolderFrom(s.works, id).map((w, i) => w === s.works[i] ? w : { ...w, updatedAt: new Date().toISOString() }),
      projectView: s.projectView.folderId === id ? { ...s.projectView, folderId: undefined } : s.projectView,
    })),

  addDiary: (presetId, name, size) => {
    const s = get();
    const base = diaryFromPreset(newId('d'), presetId, name.trim() || presetId, nextDiaryColor(s.diaries.map((x) => x.color)));
    const d = size && (size.width !== base.width || size.height !== base.height) ? resizeDiary(base, size.width, size.height) : base;
    set({ diaries: [...s.diaries, d], defaultDiaryId: s.defaultDiaryId ?? d.id });
    return d.id;
  },

  patchDiary: (id, patch) =>
    set((s) => ({
      diaries: s.diaries.map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch };
        return patch.width !== undefined || patch.height !== undefined ? resizeDiary(next, next.width, next.height) : next;
      }),
    })),

  patchDiaryPunch: (id, p) =>
    set((s) => ({ diaries: s.diaries.map((d) => (d.id === id ? { ...d, punch: { ...d.punch, ...p } } : d)) })),

  removeDiary: (id) => {
    const s = get();
    if (worksUsingDiary(s.works, id) > 0) return false;
    const diaries = s.diaries.filter((d) => d.id !== id);
    if (diaries.length === s.diaries.length) return false;
    set({
      diaries,
      defaultDiaryId: s.defaultDiaryId === id ? (diaries[0]?.id ?? null) : s.defaultDiaryId,
      projectView: s.projectView.diaryId === id ? { ...s.projectView, diaryId: null } : s.projectView,
    });
    return true;
  },

  setDefaultDiary: (id) => set({ defaultDiaryId: id }),

  addPageAfterCurrent: () =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const target = targetOf(s);
      const itemId = target ? (target.kind === 'face' ? target.face.itemId : target.itemId) : null;
      const index = itemId ? work.items.findIndex((i) => i.id === itemId) : work.items.length - 1;
      const background = target ? (editableBackground(work, target) ?? undefined) : undefined;
      const items = insertItems(work.items, index, [newPage(background)]);
      return commitItems(s, work, items);
    }),

  addPagesAtEnd: () =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const target = targetOf(s);
      const faces = facesOf(work, s.today);
      const background =
        (target ? editableBackground(work, target) : null) ?? faces[faces.length - 1]?.background ?? undefined;
      const added = Array.from({ length: work.duplex ? 2 : 1 }, () => newPage(background));
      const items = [...work.items, ...added];
      const next = commitItems(s, work, items);
      // 새 면(첫 번째)이 든 펼침면으로 간다.
      const nextWork = next.works.find((w) => w.id === work.id)!;
      const cursor = cursorOf(s, nextWork);
      const spreads = spreadsFor(nextWork, { ...cursor, source: null }, facesOf(nextWork, s.today).length);
      const firstNew = faces.length;
      const spread = spreads.findIndex((sp) => sp.includes(firstNew));
      return {
        ...next,
        cursors: {
          ...s.cursors,
          [work.id]: { ...cursor, source: null, spread: Math.max(0, spread), side: spreads[spread]?.[0] === firstNew ? 'back' : 'front' },
        },
        selectedIds: [],
      };
    }),

  duplicateItemAt: (index, count = 1) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const items = duplicateItem(work.items, index, count);
      return items === work.items ? {} : commitItems(s, work, items);
    }),

  removeItemAt: (index) =>
    set((s) => {
      const work = activeWork(s);
      if (!work || !work.items[index]) return {};
      return { ...commitItems(s, work, removeItem(work.items, index)), selectedIds: [] };
    }),

  moveItemTo: (from, to) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const items = moveItem(work.items, from, to);
      return items === work.items ? {} : commitItems(s, work, items);
    }),

  duplicateSelectedPages: (ids, count) => set((s) => {
    const work = activeWork(s);
    if (!work) return {};
    const items = duplicatePages(work.items, pairedItemIds(work, ids), count, work.duplex);
    return items === work.items ? {} : { ...commitItems(s, work, items), ...setCursor(s, work, { source: null }) };
  }),

  removeSelectedPages: (ids) => set((s) => {
    const work = activeWork(s);
    if (!work) return {};
    const chosen = pairedItemIds(work, ids);
    const items = work.items.filter((i) => !chosen.includes(i.id));
    return items.length === work.items.length ? {} : { ...commitItems(s, work, items), ...setCursor(s, work, { source: null }) };
  }),

  moveSelectedPages: (ids, beforeId) => set((s) => {
    const work = activeWork(s);
    if (!work) return {};
    const before = beforeId === null ? null : pairedItemIds(work, [beforeId])[0] ?? beforeId;
    const items = movePages(work.items, pairedItemIds(work, ids), before, work.duplex);
    return items === work.items ? {} : { ...commitItems(s, work, items), ...setCursor(s, work, { source: null }) };
  }),

  importPagesFrom: (sourceId, ids, options) => {
    const s = get();
    const work = activeWork(s);
    const source = s.works.find((w) => w.id === sourceId);
    if (!work || !source) return false;
    const target = targetOf(s);
    const itemId = target?.kind === 'face' ? target.face.itemId : target?.itemId ?? null;
    const result = importPages(work, source, ids, importAfterIndex(work, itemId), options);
    if (!result) return false;
    const next = { ...work, items: result.items };
    const faces = facesOf(next, s.today);
    const index = faces.findIndex((f) => f.itemId === result.firstId);
    const cur = cursorOf(s, work);
    const spreads = spreadsFor(next, cur, faces.length);
    const spread = Math.max(0, spreads.findIndex((pair) => pair.includes(index)));
    set({
      ...commitItems(s, work, result.items),
      ...setCursor(s, work, { source: null, spread, side: spreads[spread]?.[0] === index ? 'back' : 'front' }),
      toast: { message: `${result.addedFaces}페이지를 사본으로 가져왔어요. 원래 작업은 그대로예요.`, key: Date.now() },
    });
    return true;
  },

  goTo: (spread, side) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const cur = cursorOf(s, work);
      return setCursor(s, work, { spread, side: side ?? cur.side, source: null });
    }),

  setSide: (side) =>
    set((s) => {
      const work = activeWork(s);
      return work ? setCursor(s, work, { side }) : {};
    }),

  setView: (view) =>
    set((s) => {
      const work = activeWork(s);
      return work ? setCursor(s, work, { view, spread: 0 }) : {};
    }),

  enterSourceEdit: (itemId, faceIndex) =>
    set((s) => {
      const work = activeWork(s);
      return work ? setCursor(s, work, { source: { itemId, faceIndex }, side: 'front' }) : {};
    }),

  exitSourceEdit: () =>
    set((s) => {
      const work = activeWork(s);
      return work ? setCursor(s, work, { source: null }) : {};
    }),

  revertSelectedToSource: () =>
    set((s) => {
      const work = activeWork(s);
      const target = targetOf(s);
      if (!work || !target) return {};
      const items = revertToSource(work, target, s.selectedIds);
      return items === work.items ? {} : commitItems(s, work, items);
    }),

  rememberViewport: (patch) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const cursor = cursorOf(s, work);
      if (Object.entries(patch).every(([key, value]) => cursor[key as keyof Cursor] === value)) return {};
      return { cursors: { ...s.cursors, [work.id]: { ...cursor, ...patch } } };
    }),

  openPrint: (workId) =>
    set((s) => {
      const work = workId ? s.works.find((w) => w.id === workId && !isTrashed(w)) : activeWork(s);
      if (!work) return {};
      const result = openTab(s.tabs, work.id);
      if ('full' in result) return { pendingOpen: { workId: work.id, victim: result.full, printing: true } };
      const opened = withTabs(s, result.tabs);
      return { ...opened, ...setCursor({ ...s, ...opened }, work, { printing: true, source: null }) };
    }),

  closePrint: () =>
    set((s) => {
      const work = activeWork(s);
      return work ? setCursor(s, work, { printing: false }) : {};
    }),

  goToFace: (faceIndex) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const cursor = { ...cursorOf(s, work), source: null, printing: false };
      const spreads = spreadsFor(work, cursor, facesOf(work, s.today).length);
      const spread = Math.max(0, spreads.findIndex((sp) => sp.includes(faceIndex)));
      return setCursor(s, work, { ...cursor, spread, side: spreads[spread]?.[0] === faceIndex ? 'back' : 'front' });
    }),

  setDatedPeriod: (itemId, dataset, boundary) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const items = work.items.map((item): WorkItem => {
        if (item.id !== itemId) return item;
        return item.kind === 'page' ? spreadByDates(item, dataset, boundary) : { ...item, dataset, boundary };
      });
      return commitItems(s, work, items);
    }),

  // 바탕은 되돌리기 대상이 아니다(옛 판과 같다 — 고치면 바로 확정).
  patchDotGrid: (p) =>
    set((s) => {
      const work = activeWork(s);
      const target = targetOf(s);
      if (!work || !target) return {};
      return patchWork(s, work.id, () => ({ items: writeBackground(work, target, p) }));
    }),

  patchPunch: (p) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      return {
        diaries: s.diaries.map((d) => (d.id === work.diaryId ? { ...d, punch: { ...d.punch, ...p } } : d)),
      };
    }),

  addPaletteColor: (color) => set((s) => patchActiveWork(s, (w) => ({ palette: addPoint(w.palette, color) }))),

  setPaletteColor: (key, color) =>
    set((s) => patchActiveWork(s, (w) => ({ palette: setKeyColor(w.palette, key, color) }))),

  previewPaletteColor: (key, color) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const palette = s.palettePreview?.workId === work.id ? s.palettePreview.palette : work.palette;
      return { palettePreview: {
        workId: work.id,
        palette: colorOfKey(palette, key) === null ? addPoint(palette, color) : setKeyColor(palette, key, color),
      } };
    }),

  finishPalettePreview: (save) =>
    set((s) => {
      const preview = s.palettePreview;
      if (!preview) return {};
      const work = s.works.find((w) => w.id === preview.workId);
      return {
        palettePreview: null,
        ...(save && work && JSON.stringify(work.palette) !== JSON.stringify(preview.palette)
          ? patchWork(s, preview.workId, () => ({ palette: preview.palette })) : {}),
      };
    }),

  removePaletteColor: (key, replaceWith) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      const ref = refOf(key);
      const swap = <T extends object>(objs: T[]): T[] => mapColors(objs, (v) => (v === ref ? replaceWith : v));
      const items = work.items.map((item): WorkItem => {
        if (item.kind === 'page') return { ...item, face: { ...item.face, objects: swap(item.face.objects) } };
        return {
          ...item,
          faces: item.faces.map((f) => ({ ...f, objects: swap(f.objects) })),
          overrides: Object.fromEntries(
            Object.entries(item.overrides).map(([k, ov]) => [
              k,
              {
                ...ov,
                props: Object.fromEntries(Object.entries(ov.props).map(([id, p]) => [id, swap([p])[0]])),
                added: swap(ov.added),
              },
            ]),
          ),
        };
      });
      const palette: WorkPalette = { ...work.palette, points: work.palette.points.filter((p) => p.key !== key) };
      // 색 규칙이 이 이름표를 쓰고 있었으면 객체와 같이 지금 색으로 고정한다.
      const colorRules = mapRuleColors(work.colorRules, (v) => (v === ref ? replaceWith : v));
      return patchWork(s, work.id, () => ({ items, palette, colorRules }));
    }),

  setColorRule: (key, color) =>
    set((s) =>
      patchActiveWork(s, (w) => {
        const next = { ...w.colorRules, [key]: color };
        if (color === undefined) delete next[key];
        return { colorRules: next };
      }),
    ),

  // 도구를 바꾸면 고른 것을 놓는다. 그리기 중에 선택 테두리가 남아 있으면 헷갈린다.
  setTool: (tool) => set({ tool, selectedIds: [] }),

  drawLines: (segs) =>
    set((s) => {
      const cur = activeObjects(s);
      const next = toggleLines(cur, segs, s.drawStyle);
      if (next === cur) return {};
      // 새로 생긴 선을 고른 상태로 둔다 — 도형처럼, 그리기 도구 그대로 바로 끌어 옮길 수 있게
      // (편집기 onDown의 ‘고른 것의 몸통’). 같은 선을 다시 그어 지운 것이면 고른 것만 정리한다.
      const added = next.filter((o) => !cur.includes(o)).map((o) => o.id);
      const ids = new Set(next.map((o) => o.id));
      return {
        ...commitObjects(s, next),
        selectedIds: added.length > 0 ? added : s.selectedIds.filter((id) => ids.has(id)),
      };
    }),

  setDrawStyle: (patch) => set((s) => ({ drawStyle: { ...s.drawStyle, ...patch } })),

  commitText: (box, id) =>
    set((s) => {
      const cur = activeObjects(s);
      const rest = id ? cur.filter((o) => o.id !== id) : cur;
      // 빈 채로 나가면 남기지 않는다. 비었는지만 trim으로 보고 저장하는 글자는 손대지 않는다.
      // 자동 필드는 예외 — 글자를 비워 두고 보이는 값은 날짜로 채운다(core/work).
      if (box.text.trim() === '' && !box.field) {
        if (!id) return {};
        return { ...commitObjects(s, rest), selectedIds: prune(s.selectedIds, rest) };
      }
      const next: TextObject = { id: id ?? newId('t'), type: 'text', ...box };
      // 이 글꼴로 안 그려지는 글자(주로 색깔 이모지)가 있으면 알린다. 비동기라 따로 확인한다.
      // 자동 필드는 사람이 친 글자가 없다 — 보이는 값은 날짜라 검사할 것이 없다.
      if (!box.field) ensureCoverageFont(box.font)
        .then((font) => {
          if (font && hasUndrawableChar(box.text, font)) {
            useStore.getState().showToast('지금 글꼴로는 안 보이는 글자가 있어요 — 인쇄물에는 X로 나와요.');
          }
        })
        .catch(() => {});
      // 고치는 중이면 원래 자리를 지킨다. 순서가 바뀌면 겹친 것이 위아래로 튄다.
      return commitObjects(s, id ? cur.map((o) => (o.id === id ? next : o)) : [...cur, next]);
    }),

  showToast: (message) => set({ toast: { message, key: Date.now() } }),
  dismissToast: (key) => set((s) => (s.toast?.key === key ? { toast: null } : {})),

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
        const base = o.field ?? { offset: 0, ...DEFAULT_FIELD_DRAFT };
        return { ...o, field: patchField(base, patch) };
      });
      return commitObjects(s, next);
    }),

  setTextDraftStyle: (patch) => set((s) => ({ textDraftStyle: { ...s.textDraftStyle, ...patch } })),

  setFieldDraft: (patch) => set((s) => ({ fieldDraft: patchField(s.fieldDraft, patch) })),

  setFieldNext: (patch) => set((s) => ({ fieldNext: { ...s.fieldNext, ...patch } })),

  savePalette: (name) => {
    const work = activeWork(get());
    if (!work) return null;
    const id = newId('pl');
    set((s) => ({
      savedPalettes: [...s.savedPalettes, { id, name: name.trim() || '팔레트', palette: clonePalette(work.palette) }],
    }));
    return id;
  },

  createPalette: (name) => {
    const id = newId('pl');
    set((s) => ({ savedPalettes: [...s.savedPalettes, newSavedPalette(id, name.trim() || '팔레트')] }));
    return id;
  },

  patchSavedPalette: (id, patch) =>
    set((s) => ({
      savedPalettes: s.savedPalettes.map((p) => {
        if (p.id !== id) return p;
        const name = patch.name?.trim();
        return { ...p, ...(name ? { name } : {}), ...(patch.palette ? { palette: clonePalette(patch.palette) } : {}) };
      }),
    })),

  removeSavedPalette: (id) => set((s) => ({ savedPalettes: s.savedPalettes.filter((p) => p.id !== id) })),

  loadPalette: (id) =>
    set((s) => {
      const saved = s.savedPalettes.find((p) => p.id === id);
      if (!saved) return {};
      // 고르던 미리보기가 있으면 버린다 — 불러온 색 위에 옛 미리보기가 덮이지 않게.
      return { palettePreview: null, ...patchActiveWork(s, (w) => ({ palette: mergePalette(w.palette, saved.palette) })) };
    }),

  saveTextStyle: (name, style) => {
    const id = newId('ts');
    set((s) => ({ textStyles: [...s.textStyles, { id, name: name.trim() || '스타일', style: pickSavedStyle(style) }] }));
    return id;
  },

  removeTextStyle: (id) => set((s) => ({ textStyles: s.textStyles.filter((t) => t.id !== id) })),

  applyTextStyle: (id) => {
    const s = get();
    const saved = s.textStyles.find((t) => t.id === id);
    if (!saved) return;
    const pickedText = activeObjects(s).some((o) => o.type === 'text' && s.selectedIds.includes(o.id));
    if (pickedText) {
      s.styleText(stylePatchOf(saved.style));
      return;
    }
    set({ textDraftStyle: applyToDraft(s.textDraftStyle, saved.style) });
    if (s.tool !== 'text') s.setTool('text');
  },

  commitCalendar: (box) =>
    set((s) => {
      const next: CalendarObject = { id: newId('c'), type: 'calendar', ...box, ...s.calendarDraftStyle };
      // 곧바로 고른 상태로 둔다 — 놓자마자 크기부터 다듬는 일이 흔하다.
      return { ...commitObjects(s, [...activeObjects(s), next]), selectedIds: [next.id] };
    }),

  resizeObject: (id, box, extra) =>
    set((s) => {
      const cur = activeObjects(s);
      const target = cur.find((o) => o.id === id);
      if (!target || isLine(target)) return {};
      return commitObjects(
        s,
        cur.map((o) => {
          if (o.id !== id) return o;
          return isText(o) ? { ...o, ...box, ...extra } : { ...o, ...box };
        }),
      );
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

  addUserFont: (font) =>
    set((s) => ({
      userFonts: s.userFonts.some((f) => f.id === font.id)
        ? s.userFonts.map((f) => (f.id === font.id ? font : f))
        : [...s.userFonts, font],
    })),

  renameUserFont: (id, label) =>
    set((s) => {
      const font = s.userFonts.find((f) => f.id === id);
      if (!font) return {};
      persistFontMeta(id, font.name, { label, favorite: font.favorite, hidden: font.hidden });
      return { userFonts: s.userFonts.map((f) => (f.id === id ? { ...f, label } : f)) };
    }),

  toggleFontFavorite: (id) =>
    set((s) => {
      const font = s.userFonts.find((f) => f.id === id);
      if (!font) return {};
      const favorite = !font.favorite;
      persistFontMeta(id, font.name, { label: font.label, favorite, hidden: font.hidden });
      return { userFonts: s.userFonts.map((f) => (f.id === id ? { ...f, favorite } : f)) };
    }),

  addUserImage: (image) =>
    set((s) => ({
      userImages: s.userImages.some((i) => i.id === image.id)
        ? s.userImages.map((i) => (i.id === image.id ? image : i))
        : [...s.userImages, image],
    })),

  removeUserImage: (id) => {
    const s = get();
    const image = s.userImages.find((i) => i.id === id);
    if (!image) return null;
    if (imagesUsedBy(s).has(id)) {
      persistImageMeta(id, image.name, { label: image.label, usedAt: image.usedAt, hidden: true });
      set({ userImages: s.userImages.map((i) => (i.id === id ? { ...i, hidden: true } : i)) });
      return 'hidden';
    }
    removeImage(image.id, image.name);
    set({ userImages: s.userImages.filter((i) => i.id !== id) });
    return 'deleted';
  },

  removeUserFont: (id) => {
    const s = get();
    const font = s.userFonts.find((f) => f.id === id);
    if (!font) return null;
    if (fontsUsedBy(s).has(id)) {
      persistFontMeta(id, font.name, { label: font.label, favorite: font.favorite, hidden: true });
      set({ userFonts: s.userFonts.map((f) => (f.id === id ? { ...f, hidden: true } : f)) });
      return 'hidden';
    }
    removeFont(id, font.name);
    set({ userFonts: s.userFonts.filter((f) => f.id !== id) });
    return 'deleted';
  },

  purgeUnusedAssets: () => {
    const s = get();
    const images = purgeable(s.userImages, imagesUsedBy(s));
    const fonts = purgeable(s.userFonts, fontsUsedBy(s));
    if (images.length === 0 && fonts.length === 0) return;
    images.forEach((i) => removeImage(i.id, i.name));
    fonts.forEach((f) => removeFont(f.id, f.name));
    set({
      userImages: s.userImages.filter((i) => !images.includes(i)),
      userFonts: s.userFonts.filter((f) => !fonts.includes(f)),
    });
  },

  renameUserImage: (id, label) =>
    set((s) => {
      const image = s.userImages.find((i) => i.id === id);
      if (!image) return {};
      persistImageMeta(id, image.name, { usedAt: image.usedAt, hidden: image.hidden, label });
      return { userImages: s.userImages.map((i) => (i.id === id ? { ...i, label } : i)) };
    }),

  commitImage: (box) =>
    set((s) => {
      // 'im' 접두사 — images/registry의 파일 id('img1' 등)와 헷갈리지 않게.
      const next: ImageObject = { id: newId('im'), type: 'image', ...box };
      return { ...commitObjects(s, [...activeObjects(s), next]), selectedIds: [next.id] };
    }),

  styleImage: (imageId) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) =>
        o.type === 'image' && s.selectedIds.includes(o.id) ? { ...o, imageId } : o,
      );
      const image = s.userImages.find((i) => i.id === imageId);
      const userImages = image
        ? (() => {
            const usedAt = Date.now();
            persistImageMeta(imageId, image.name, { label: image.label, hidden: image.hidden, usedAt });
            return s.userImages.map((i) => (i.id === imageId ? { ...i, usedAt } : i));
          })()
        : s.userImages;
      return { ...commitObjects(s, next), userImages };
    }),

  requestImagePick: (id) => set({ pickImageFor: id }),

  styleImageRotate: (rotate) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'image' || !s.selectedIds.includes(o.id)) return o;
        const merged: ImageObject = { ...o, rotate };
        if (rotate === 0) delete merged.rotate;
        return merged;
      });
      return commitObjects(s, next);
    }),

  commitShape: (box) =>
    set((s) => {
      const next: ShapeObject = { id: newId('sh'), type: 'shape', ...box };
      if (s.drawStyle.roundness) next.roundness = s.drawStyle.roundness;
      if (s.drawStyle.width !== undefined) next.strokeWidth = s.drawStyle.width;
      if (s.drawStyle.color !== undefined) next.color = s.drawStyle.color;
      if (s.drawStyle.dash !== undefined) next.dash = s.drawStyle.dash;
      return { ...commitObjects(s, [...activeObjects(s), next]), selectedIds: [next.id] };
    }),

  commitTable: (border, innerLines) =>
    set((s) => {
      const borderObj: ShapeObject = { id: newId('sh'), type: 'shape', ...border };
      if (s.drawStyle.roundness) borderObj.roundness = s.drawStyle.roundness;
      if (s.drawStyle.width !== undefined) borderObj.strokeWidth = s.drawStyle.width;
      if (s.drawStyle.color !== undefined) borderObj.color = s.drawStyle.color;
      if (s.drawStyle.dash !== undefined) borderObj.dash = s.drawStyle.dash;
      const withBorder = [...activeObjects(s), borderObj];
      const withLines = toggleLines(withBorder, innerLines, s.drawStyle);
      const lineIds = withLines
        .filter(isLine)
        .filter((l) => innerLines.some((seg) => sameSegment(l, seg)))
        .map((l) => l.id);
      return { ...commitObjects(s, withLines), selectedIds: [borderObj.id, ...lineIds] };
    }),

  styleShape: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'shape' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof ShapeStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  setCheckboxDraftStyle: (patch) => set((s) => ({ checkboxDraftStyle: { ...s.checkboxDraftStyle, ...patch } })),

  setCalendarDraftStyle: (patch) => set((s) => ({ calendarDraftStyle: { ...s.calendarDraftStyle, ...patch } })),

  commitCheckboxes: (boxes) =>
    set((s) => {
      if (boxes.length === 0) return {};
      const next: CheckboxObject[] = boxes.map((box) => ({
        id: newId('ch'),
        type: 'checkbox',
        ...box,
        ...s.checkboxDraftStyle,
      }));
      return { ...commitObjects(s, [...activeObjects(s), ...next]), selectedIds: next.map((o) => o.id) };
    }),

  styleCheckbox: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'checkbox' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof CheckboxStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  commitMoon: (box) =>
    set((s) => {
      const next: MoonObject = { id: newId('mo'), type: 'moon', ...box, offset: s.fieldNext.offset };
      return {
        ...commitObjects(s, [...activeObjects(s), next]),
        selectedIds: [next.id],
        fieldNext: s.fieldNext.advance ? { ...s.fieldNext, offset: s.fieldNext.offset + 1 } : s.fieldNext,
      };
    }),

  styleMoon: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'moon' || !s.selectedIds.includes(o.id)) return o;
        const merged = { ...o, ...patch };
        for (const k of Object.keys(patch) as (keyof MoonStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  select: (ids) => set((s) => ({ selectedIds: expandGroupSelection(activeObjects(s), ids) })),

  deleteSelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const keep = activeObjects(s).filter((o) => !s.selectedIds.includes(o.id));
      return { ...commitObjects(s, keep), selectedIds: [] };
    }),

  copySelected: () =>
    set((s) => {
      const work = activeWork(s);
      const target = targetOf(s);
      if (s.selectedIds.length === 0 || !work || !target) return {};
      const picked = activeObjects(s).filter((o) => s.selectedIds.includes(o.id));
      return { clipboard: picked, clipboardOrigin: { workId: work.id, faceKey: faceKeyOf(target) } };
    }),

  pasteClipboard: () =>
    set((s) => {
      const work = activeWork(s);
      const target = targetOf(s);
      if (s.clipboard.length === 0 || !work || !target) return {};
      // 복사한 면에 그대로 붙이면 살짝 밀고, 다른 면(다른 작업 포함)이면 같은 자리에 붙인다.
      const samePlace =
        s.clipboardOrigin !== null &&
        s.clipboardOrigin.workId === work.id &&
        s.clipboardOrigin.faceKey === faceKeyOf(target);
      // 밀 양은 격자 간격의 배수로 올림한다 — 붙여넣은 것도 도트에 그대로 붙게.
      const spacing = activeGrid(s)?.spacing ?? 0;
      const gridOffset = spacing > 0 ? Math.ceil(PASTE_OFFSET / spacing) * spacing : PASTE_OFFSET;
      const offset = samePlace ? gridOffset : 0;
      // 그룹은 붙여넣은 것끼리만 묶인 새 그룹이 된다(원본 그룹과 갈라진다).
      const groupIdMap = new Map<string, string>();
      const pasted = s.clipboard.map((o) => {
        const cloned = cloneObject(o, offset, offset);
        if (!o.groupId) return cloned;
        const mapped = groupIdMap.get(o.groupId) ?? newId('g');
        groupIdMap.set(o.groupId, mapped);
        return { ...cloned, groupId: mapped };
      });
      return { ...commitObjects(s, [...activeObjects(s), ...pasted]), selectedIds: pasted.map((o) => o.id) };
    }),

  lockSelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => (s.selectedIds.includes(o.id) ? { ...o, locked: true } : o));
      return { ...commitObjects(s, next), selectedIds: [] };
    }),

  unlockAll: () =>
    set((s) => {
      const cur = activeObjects(s);
      if (!cur.some((o) => o.locked)) return {};
      const next = cur.map((o) => {
        if (!o.locked) return o;
        const rest = { ...o };
        delete rest.locked;
        return rest;
      });
      return commitObjects(s, next);
    }),

  groupSelected: () =>
    set((s) => {
      if (s.selectedIds.length < 2) return {};
      const groupId = newId('g');
      const next = activeObjects(s).map((o) => (s.selectedIds.includes(o.id) ? { ...o, groupId } : o));
      return commitObjects(s, next);
    }),

  ungroupSelected: () =>
    set((s) => {
      const cur = activeObjects(s);
      if (!cur.some((o) => s.selectedIds.includes(o.id) && o.groupId)) return {};
      const next = cur.map((o) => {
        if (!s.selectedIds.includes(o.id) || !o.groupId) return o;
        const rest = { ...o };
        delete rest.groupId;
        return rest;
      });
      return commitObjects(s, next);
    }),

  moveSelected: (dx, dy) =>
    set((s) => {
      if (s.selectedIds.length === 0 || (dx === 0 && dy === 0)) return {};
      const moved = activeObjects(s).map((o) => (s.selectedIds.includes(o.id) ? moveObject(o, dx, dy) : o));
      return commitObjects(s, moved);
    }),

  reshapeSelected: (id, end, p) =>
    set((s) => {
      const cur = activeObjects(s);
      const target = cur.find((o) => o.id === id);
      if (!target || !isLine(target)) return {};
      const next = reshape(target, end, p);
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
        // 값이 undefined면 키 자체를 지운다 — 나중에 기본값을 바꾸면 따라오게.
        for (const k of Object.keys(patch) as (keyof LineStyle)[]) {
          if (patch[k] === undefined) delete merged[k];
        }
        return merged;
      });
      return commitObjects(s, next);
    }),

  // 되돌리기는 **지금 탭의 작업만**, 그 작업 안에서는 모든 면에 걸쳐 한 줄로 쌓인다.
  undo: () =>
    set((s) => {
      const work = activeWork(s);
      const history = work && s.histories[work.id];
      if (!work || !history || !canUndo(history)) return {};
      const h = undo(history);
      const next: Settings = { ...s, works: s.works.map((w) => (w.id === work.id ? { ...w, items: h.present } : w)) };
      return {
        works: next.works,
        histories: { ...s.histories, [work.id]: h },
        selectedIds: prune(s.selectedIds, activeObjects(next)),
      };
    }),

  redo: () =>
    set((s) => {
      const work = activeWork(s);
      const history = work && s.histories[work.id];
      if (!work || !history || !canRedo(history)) return {};
      const h = redo(history);
      const next: Settings = { ...s, works: s.works.map((w) => (w.id === work.id ? { ...w, items: h.present } : w)) };
      return {
        works: next.works,
        histories: { ...s.histories, [work.id]: h },
        selectedIds: prune(s.selectedIds, activeObjects(next)),
      };
    }),

  setPaperPreset: (id) =>
    set((s) => {
      const preset = findPaperPreset(id);
      if (!preset) return { paper: { ...s.paper, presetId: id } };
      return { paper: { ...s.paper, presetId: id, width: preset.width, height: preset.height } };
    }),

  // 크기를 손으로 고치면 더 이상 프리셋이 아니다. 방향·여백은 크기가 아니므로 프리셋을 잃지 않는다.
  patchPaper: (p) =>
    set((s) => {
      const resized =
        (p.width !== undefined && p.width !== s.paper.width) ||
        (p.height !== undefined && p.height !== s.paper.height);
      return { paper: { ...s.paper, ...p, presetId: resized ? 'custom' : s.paper.presetId } };
    }),

  patch: (p) => set(p),
  patchUnprintable: (p) => set((s) => ({ unprintable: { ...s.unprintable, ...p } })),
}));

/* ────────────────────────── 화면이 쓰는 지름길 ────────────────────────── */

const NO_INSERT_PUNCH: PunchSetting = diaryFromPreset('', 'M6', '', '').punch;

/** 다이어리를 옛 화면 코드가 아는 속지 설정 모양으로 — 같은 다이어리면 같은 참조. */
const insertCache = new WeakMap<Diary, InsertSetting>();
function insertOf(diary: Diary | undefined): InsertSetting {
  if (!diary) return NO_INSERT;
  const hit = insertCache.get(diary);
  if (hit) return hit;
  const insert: InsertSetting = {
    presetId: diary.presetId,
    width: diary.width,
    height: diary.height,
    punch: diary.punch,
  };
  insertCache.set(diary, insert);
  return insert;
}
const NO_INSERT: InsertSetting = { presetId: 'M6', width: 80, height: 125, punch: NO_INSERT_PUNCH };

export const useActiveWork = () => useStore(activeWork);

export const useActiveDiary = () =>
  useStore((s) => {
    const work = activeWork(s);
    return work ? s.diaries.find((d) => d.id === work.diaryId) : undefined;
  });

/** 지금 작업의 속지(다이어리) 크기와 구멍. */
export const useInsert = () =>
  useStore((s) => {
    const work = activeWork(s);
    return insertOf(work ? s.diaries.find((d) => d.id === work.diaryId) : undefined);
  });

export const useCursor = (): Cursor | null => {
  const work = useActiveWork();
  const stored = useStore((s) => (work ? s.cursors[work.id] : undefined));
  const today = useStore((s) => s.today);
  return useMemo(
    () => (work ? clampCursor(work, stored ?? defaultCursor(work), facesOf(work, today).length) : null),
    [work, stored, today],
  );
};

/** 지금 작업의 펼친 면들. */
export const useFaces = (): ResolvedFace[] => {
  const work = useActiveWork();
  const today = useStore((s) => s.today);
  return useMemo(() => (work ? facesOf(work, today) : []), [work, today]);
};

/** 지금 작업의 펼침면 목록. */
export const useSpreads = (): [number | null, number | null][] => {
  const work = useActiveWork();
  const cursor = useCursor();
  const faces = useFaces();
  return useMemo(() => (work && cursor ? spreadsFor(work, cursor, faces.length) : []), [work, cursor, faces]);
};

/**
 * 편집 위치를 정하는 값들만 — 이것 말고 다른 값(고른 것·도구 등)이 바뀌어도 아래 훅들이
 * 다시 계산하지 않게 한다.
 */
function useEditCore(): Pick<Settings, 'works' | 'cursors' | 'tabs' | 'today'> {
  return useStore(useShallow((s) => ({ works: s.works, cursors: s.cursors, tabs: s.tabs, today: s.today })));
}

/** 이 쪽에서 고칠 객체(원본). 화면이 고르기·옮기기 판단에 쓴다. */
export const useEditObjects = (side: Side): DiaryObject[] => {
  const core = useEditCore();
  return useMemo(() => {
    const work = activeWork(core);
    const target = targetOf(core, side);
    return work && target ? editableObjects(work, target) : NO_OBJECTS;
  }, [core, side]);
};

/** 이 쪽에 보일 면(날짜가 채워진 것). 원본 편집이면 첫 날짜로 채운 원본. */
export const useDisplayFace = (side: Side): ResolvedFace | null => {
  const core = useEditCore();
  return useMemo(() => displayFaceOf(core, side), [core, side]);
};

/** 이 쪽 면의 바탕(격자). 면이 없으면 기본 격자. */
export const useDotGrid = (side?: Side): DotGrid => {
  const core = useEditCore();
  return useMemo(() => {
    const work = activeWork(core);
    const target = targetOf(core, side);
    return (work && target && editableBackground(work, target)) || DEFAULT_DOT_GRID;
  }, [core, side]);
};

export const useSide = (): Side => useCursor()?.side ?? 'front';

/** 지금 펼침면에 왼쪽(뒷면) 면이 있는가. */
export const useHasBack = (): boolean => {
  const core = useEditCore();
  return useMemo(() => targetOf(core, 'back') !== null, [core]);
};

export const usePalette = (): WorkPalette | null => useStore((s) => {
  const work = activeWork(s);
  return work ? (s.palettePreview?.workId === work.id ? s.palettePreview.palette : work.palette) : null;
});

const NO_OBJECTS: DiaryObject[] = [];

export { INSERT_PRESETS, PAPER_PRESETS };
export type { Settings, PaperState, UnprintableSetting };
