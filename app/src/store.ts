import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import { INSERT_PRESETS, PAPER_PRESETS, findPaperPreset } from './core/presets';
import type { PunchSetting } from './core/punch';
import type { Align } from './core/layout';
import { DEFAULT_DOT_GRID, type DotGrid } from './core/grid';
import { DEFAULT_FIELD_DRAFT, patchField, type FieldDraft, type FieldSpec } from './core/fieldFormat';
import { applyToDraft, pickSavedStyle, stylePatchOf, type SavedTextStyle } from './core/textStyles';
import { canRedo, canUndo, commit, initHistory, redo, undo, type History } from './core/history';
import type { InsertSetting } from './core/template';
import { persistFontLabel } from './fonts/registry';
import { ensureCoverageFont } from './fonts/coverage';
import { hasUndrawableChar } from './core/fontCoverage';
import { persistImageMeta, removeImage } from './images/registry';
import {
  cloneObject,
  dedupe,
  ensureIdCounterAbove,
  expandGroupSelection,
  isDegenerate,
  isImage,
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
  type LineObject,
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
import { diaryFromPreset, nextDiaryColor, type Diary } from './core/diary';
import { addPoint, mapColors, refOf, setKeyColor, type WorkPalette } from './core/colors';
import { mapRuleColors, type RuleKey } from './core/colorRules';
import { isTrashed, restoreWork, trashWork, removeFolderFrom, type Folder } from './core/library';
import { activate, closeTab, emptyTabs, keepExisting, openTab, LIBRARY_TAB, type Tabs } from './core/workspace';
import { todayFrom, type Boundary } from './core/dated';
import type { CalendarDate, DateDataset } from './core/dataset';

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

/**
 * 펼침면의 어느 쪽인지. 다이어리를 펼치면 왼쪽은 앞 장의 **뒷면**, 오른쪽은 다음 장의
 * **앞면**이다(core/work의 `spreadsOf`). 옛 판의 앞면/뒷면 이름을 그대로 쓴다 —
 * 편집 화면의 경계를 넘는 선·뒷면 거울 같은 동작이 이 이름을 기준으로 짜여 있다.
 */
export type Side = 'front' | 'back';

/** 편집 화면 보기 — 펼침면(다이어리를 펼친 모습) 또는 일렬(한 면씩 아래로, 기능후보 8). */
export type ViewMode = 'spread' | 'single';

/** 작업 탭마다 기억하는 편집 위치(기능후보 11: 탭마다 따로). */
export interface Cursor {
  /** 지금 고르는 펼침면(일렬 보기면 면) 번호. */
  spread: number;
  side: Side;
  /** 원본 편집 중이면 그 날짜 묶음과 원본 면 번호(세부계획 A4.6 2-1). */
  source: { itemId: string; faceIndex: number } | null;
  view: ViewMode;
}

/** 복사한 자리 — 같은 자리에 다시 붙이면 살짝 밀고, 다른 자리면 같은 위치에 붙인다. */
export interface ClipboardOrigin {
  workId: string;
  faceKey: string;
}

export type DrawStyle = LineStyle & { roundness?: CornerRoundness };

interface Settings {
  /** 저장소에서 다 읽어왔는가. 그 전에는 저장하지 않는다(빈 상태로 덮어쓰지 않게). */
  ready: boolean;
  /** 오늘 날짜 `YYYY-MM-DD`. 날짜 묶음이 아닌 페이지의 자동 필드가 보여준다. */
  today: string;

  works: Work[];
  diaries: Diary[];
  folders: Folder[];
  /** 새 작업을 만들 때 쓰는 다이어리. */
  defaultDiaryId: string | null;
  tabs: Tabs;
  /** 작업마다 되돌리기 기록. 처음 고칠 때 만든다. */
  histories: Record<string, History<WorkItem[]>>;
  cursors: Record<string, Cursor>;
  /** 탭이 꽉 차서 열지 못한 작업과 닫을 후보 — 화면이 물어본다. */
  pendingOpen: { workId: string; victim: string } | null;

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
  /** 저장한 글자 스타일 — 모든 작업 공통(core/textStyles). 앱 전체 설정과 함께 저장된다(ui/persist). */
  textStyles: SavedTextStyle[];
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
  renameWork: (id: string, name: string) => void;
  duplicateWork: (id: string) => void;
  trashWorkById: (id: string) => void;
  restoreWorkById: (id: string) => void;
  deleteWorkForever: (id: string) => void;
  moveWorkToFolder: (id: string, folderId: string | null) => void;
  setDuplex: (duplex: boolean) => void;

  /* ── 폴더·다이어리 ── */
  addFolder: (name: string) => void;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  addDiary: (presetId: string, name: string) => string;
  patchDiary: (id: string, patch: Partial<Omit<Diary, 'id' | 'punch'>>) => void;
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
  /** 펼침면(일렬이면 면)으로 간다. 원본 편집 중이었으면 빠져나온다. */
  goTo: (spread: number, side?: Side) => void;
  setSide: (side: Side) => void;
  setView: (view: ViewMode) => void;
  enterSourceEdit: (itemId: string, faceIndex: number) => void;
  exitSourceEdit: () => void;
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
  /** 포인트 칸을 지운다. 그 칸을 쓰던 객체는 `replaceWith`(이름표나 색)로 옮긴다. */
  removePaletteColor: (key: string, replaceWith: string) => void;
  /** 색 규칙 하나를 정한다(값은 팔레트 이름표). undefined면 그 규칙을 끈다. 팔레트처럼 되돌리기 대상이 아니다. */
  setColorRule: (key: RuleKey, color: string | undefined) => void;

  /* ── 편집 ── */
  setTool: (t: Tool) => void;
  drawLines: (segs: LineSeg[]) => void;
  /** 펼침면의 두 면을 잇는 선 — 양쪽 반쪽을 한 번에 그린다(되돌리기도 한 번). */
  commitCrossBoundaryLine: (backSeg: LineSeg, frontSeg: LineSeg, focusSide: Side) => void;
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
  addUserImage: (image: UserImage) => void;
  removeUserImage: (id: string) => void;
  renameUserImage: (id: string, label: string) => void;
  saveUserImage: (id: string) => void;
  unsaveUserImage: (id: string) => void;
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
  return { cursors: { ...s.cursors, [work.id]: { ...cursorOf(s, work), ...patch } }, selectedIds: [] };
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

/** "디자인 관리"에서 저장하지 않은 이미지가 이 개수를 넘으면, 안 쓰는 중인 것부터 오래된 순으로 지운다. */
const RECENT_IMAGE_CAP = 10;

/** 이 이미지를 어느 작업(휴지통 포함)이 실제로 쓰고 있는가. */
function imageInUse(works: Work[], id: string): boolean {
  const uses = (objs: DiaryObject[]) => objs.some((o) => isImage(o) && o.imageId === id);
  return works.some((w) =>
    w.items.some((item) =>
      item.kind === 'page'
        ? uses(item.face.objects)
        : item.faces.some((f) => uses(f.objects)) || Object.values(item.overrides).some((ov) => uses(ov.added)),
    ),
  );
}

function evictExcessRecent(images: UserImage[], works: Work[]): { kept: UserImage[]; evicted: UserImage[] } {
  const recent = images.filter((i) => !i.saved && !imageInUse(works, i.id));
  if (recent.length <= RECENT_IMAGE_CAP) return { kept: images, evicted: [] };
  const oldestFirst = [...recent].sort((a, b) => (a.usedAt ?? 0) - (b.usedAt ?? 0));
  const evictIds = new Set(oldestFirst.slice(0, recent.length - RECENT_IMAGE_CAP).map((i) => i.id));
  return {
    kept: images.filter((i) => !evictIds.has(i.id)),
    evicted: images.filter((i) => evictIds.has(i.id)),
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

/** 열린 작업 탭이 바뀌면 그 탭의 커서를 지킨다(없으면 만든다). 선택은 탭마다 다르므로 놓는다. */
function withTabs(tabs: Tabs): Partial<Settings> {
  return { tabs, selectedIds: [], pendingOpen: null };
}

const firstPaper = PAPER_PRESETS[0];

export const useStore = create<Store>((set, get) => ({
  ready: false,
  today: localToday(),
  works: [],
  diaries: [],
  folders: [],
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
  textStyles: [],
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

  hydrate: ({ works, diaries, folders, tabs, defaultDiaryId, textStyles = [] }) => {
    // 새로고침하면 id 카운터가 0부터 다시 시작한다 — 불러온 id들보다 위로 올려야
    // 새로 만드는 것이 불러온 것과 겹치지 않는다(옛 판 loadProject와 같은 이유).
    ensureIdCounterAbove([
      ...works.flatMap(allIdsOf),
      ...diaries.map((d) => d.id),
      ...folders.map((f) => f.id),
      ...textStyles.map((t) => t.id),
    ]);
    const exists = (id: string) => works.some((w) => w.id === id && !isTrashed(w));
    set({
      works,
      diaries,
      folders,
      defaultDiaryId: diaries.some((d) => d.id === defaultDiaryId) ? defaultDiaryId! : (diaries[0]?.id ?? null),
      tabs: keepExisting(tabs ?? emptyTabs(), exists),
      histories: {},
      cursors: {},
      textStyles,
      ready: true,
    });
  },

  setToday: (today) => set({ today }),

  openWork: (id) =>
    set((s) => {
      const result = openTab(s.tabs, id);
      if ('full' in result) return { pendingOpen: { workId: id, victim: result.full } };
      return withTabs(result.tabs);
    }),

  resolvePendingOpen: (closeVictim) =>
    set((s) => {
      if (!s.pendingOpen) return {};
      if (!closeVictim) return { pendingOpen: null };
      const closed = closeTab(s.tabs, s.pendingOpen.victim);
      const result = openTab(closed, s.pendingOpen.workId);
      return 'full' in result ? { pendingOpen: null } : withTabs(result.tabs);
    }),

  closeWorkTab: (id) => set((s) => withTabs(closeTab(s.tabs, id))),

  activateTab: (id) => set((s) => withTabs(activate(s.tabs, id))),

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
        : { tabs: result.tabs, selectedIds: [] }),
    });
    return work.id;
  },

  renameWork: (id, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return patchWork(s, id, () => ({ name: trimmed }));
    }),

  duplicateWork: (id) =>
    set((s) => {
      const source = s.works.find((w) => w.id === id);
      if (!source) return {};
      const now = new Date().toISOString();
      const items = source.items.map(cloneItem);
      const copy: Work = {
        ...source,
        id: newId('w'),
        name: uniqueWorkName(s.works, `${source.name} 사본`),
        createdAt: now,
        updatedAt: now,
        items,
      };
      delete copy.trashedAt;
      const at = s.works.indexOf(source) + 1;
      return { works: [...s.works.slice(0, at), copy, ...s.works.slice(at)] };
    }),

  trashWorkById: (id) =>
    set((s) => {
      const now = new Date().toISOString();
      return {
        works: s.works.map((w) => (w.id === id ? trashWork(w, now) : w)),
        ...withTabs(closeTab(s.tabs, id)),
      };
    }),

  restoreWorkById: (id) => set((s) => ({ works: s.works.map((w) => (w.id === id ? restoreWork(w) : w)) })),

  deleteWorkForever: (id) =>
    set((s) => {
      const { [id]: _h, ...histories } = s.histories;
      const { [id]: _c, ...cursors } = s.cursors;
      return { works: s.works.filter((w) => w.id !== id), histories, cursors, ...withTabs(closeTab(s.tabs, id)) };
    }),

  moveWorkToFolder: (id, folderId) =>
    set((s) =>
      patchWork(s, id, () => ({ folderId: folderId ?? undefined })),
    ),

  setDuplex: (duplex) =>
    set((s) => {
      const work = activeWork(s);
      if (!work) return {};
      return {
        ...patchWork(s, work.id, () => ({ duplex })),
        ...setCursor(s, work, { spread: 0, view: duplex ? 'spread' : 'single', source: null }),
      };
    }),

  addFolder: (name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return { folders: [...s.folders, { id: newId('fd'), name: trimmed }] };
    }),

  renameFolder: (id, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (trimmed === '') return {};
      return { folders: s.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)) };
    }),

  removeFolder: (id) =>
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id), works: removeFolderFrom(s.works, id) })),

  addDiary: (presetId, name) => {
    const s = get();
    const d = diaryFromPreset(newId('d'), presetId, name.trim() || presetId, nextDiaryColor(s.diaries.map((x) => x.color)));
    set({ diaries: [...s.diaries, d], defaultDiaryId: s.defaultDiaryId ?? d.id });
    return d.id;
  },

  patchDiary: (id, patch) =>
    set((s) => ({ diaries: s.diaries.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),

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
      return commitObjects(s, next);
    }),

  commitCrossBoundaryLine: (backSeg, frontSeg, focusSide) =>
    set((s) => {
      const work = activeWork(s);
      const back = targetOf(s, 'back');
      const front = targetOf(s, 'front');
      if (!work || !back || !front) return {};
      const backLine: LineObject = { id: newId('l'), type: 'line', ...backSeg, ...s.drawStyle };
      const frontLine: LineObject = { id: newId('l'), type: 'line', ...frontSeg, ...s.drawStyle };
      // 두 면을 한 번에 쓰고 되돌리기는 한 칸만 쌓는다 — 하나의 선으로 보이므로
      // 되돌리면 양쪽이 함께 사라져야 한다(옛 판은 이를 위해 짝을 따로 기억했다).
      const afterBack = writeObjects(work, back, [...editableObjects(work, back), backLine]);
      const items = writeObjects({ items: afterBack }, front, [...editableObjects(work, front), frontLine]);
      const cursor = cursorOf(s, work);
      return {
        ...commitItems(s, work, items),
        cursors: { ...s.cursors, [work.id]: { ...cursor, side: focusSide } },
        selectedIds: [focusSide === 'back' ? backLine.id : frontLine.id],
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
      persistFontLabel(id, font.name, label);
      return { userFonts: s.userFonts.map((f) => (f.id === id ? { ...f, label } : f)) };
    }),

  addUserImage: (image) =>
    set((s) => {
      const next = s.userImages.some((i) => i.id === image.id)
        ? s.userImages.map((i) => (i.id === image.id ? image : i))
        : [...s.userImages, image];
      const { kept, evicted } = evictExcessRecent(next, s.works);
      for (const i of evicted) removeImage(i.name);
      return { userImages: kept };
    }),

  removeUserImage: (id) =>
    set((s) => {
      if (imageInUse(s.works, id)) return {};
      const image = s.userImages.find((i) => i.id === id);
      if (image) removeImage(image.name);
      return { userImages: s.userImages.filter((i) => i.id !== id) };
    }),

  renameUserImage: (id, label) =>
    set((s) => {
      const image = s.userImages.find((i) => i.id === id);
      if (!image) return {};
      persistImageMeta(id, image.name, { saved: image.saved, usedAt: image.usedAt, label });
      return { userImages: s.userImages.map((i) => (i.id === id ? { ...i, label } : i)) };
    }),

  saveUserImage: (id) =>
    set((s) => {
      const image = s.userImages.find((i) => i.id === id);
      if (!image) return {};
      persistImageMeta(id, image.name, { label: image.label, usedAt: image.usedAt, saved: true });
      return { userImages: s.userImages.map((i) => (i.id === id ? { ...i, saved: true } : i)) };
    }),

  unsaveUserImage: (id) =>
    set((s) => {
      const image = s.userImages.find((i) => i.id === id);
      if (!image) return {};
      persistImageMeta(id, image.name, { label: image.label, usedAt: image.usedAt, saved: false });
      const next = s.userImages.map((i) => (i.id === id ? { ...i, saved: false } : i));
      const { kept, evicted } = evictExcessRecent(next, s.works);
      for (const i of evicted) removeImage(i.name);
      return { userImages: kept };
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
            persistImageMeta(imageId, image.name, { label: image.label, saved: image.saved, usedAt });
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

export const usePalette = (): WorkPalette | null => useActiveWork()?.palette ?? null;

const NO_OBJECTS: DiaryObject[] = [];

export { INSERT_PRESETS, PAPER_PRESETS };
export type { Settings, PaperState, UnprintableSetting };
