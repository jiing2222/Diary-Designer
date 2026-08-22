import { create } from 'zustand';
import { INSERT_PRESETS, PAPER_PRESETS, findPaperPreset } from './core/presets';
import type { PunchSetting } from './core/punch';
import { computeLayout, type Align, type Layout } from './core/layout';
import { DEFAULT_DOT_GRID, type DotGrid } from './core/grid';
import { DEFAULT_PALETTE, type ColorPalette } from './core/palette';
import { duplicateNotebookHalf, resizePages, type NotebookHalf, type NotebookSlotRef } from './core/notebook';
import { DEFAULT_FIELD_FORMAT } from './core/text';
import { canRedo, canUndo, commit, initHistory, redo, undo, type History } from './core/history';
import {
  backFromFront,
  defaultInsert,
  defaultName,
  duplicateTemplate,
  ensureTemplateIdCounterAbove,
  insertFromPreset,
  newBack,
  newTemplate,
  refreshTemplateIds,
  sameSize,
  uniqueName,
  SINGLE_REPEAT,
  type InsertSetting,
  type RepeatSetting,
  type Template,
  type TemplateKind,
} from './core/template';
import { toTemplates, type SavedProject } from './core/project';
import { persistFontLabel, reserveIds } from './fonts/registry';
import { persistImageMeta, removeImage, reserveImageIds } from './images/registry';
import {
  cloneObject,
  dedupe,
  ensureIdCounterAbove,
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
   * 복사한 객체들. 앱 안에서만 도는 클립보드다(OS 클립보드가 아니다) — 저장
   * 파일에는 들어가지 않는다.
   */
  clipboard: DiaryObject[];
  /**
   * 복사할 때 어느 "면"이었는지. 붙여넣을 때 여기와 지금이 같은 면이면
   * 살짝 밀어서 겹치지 않게 하고(기존 동작), 다른 면(앞↔뒤, 노트의 다른
   * 쪽)이면 **자리를 그대로 유지한다** — "이전 면과 같은 위치에" 붙여
   * 넣고 싶다는 사용자 피드백. `null`이면 아직 아무것도 안 복사했다.
   */
  clipboardOrigin: ClipboardOrigin | null;
  /**
   * 뒷면·앞면 경계를 넘어 이어 그은 선의 반쪽 쌍들. `commitCrossBoundaryLine`이
   * 쌓고, `undo`·`redo`가 이 목록을 보고 반쪽 하나를 되돌릴 때 반대쪽도
   * 함께 되돌린다(하나의 선으로 보였으니 하나의 되돌리기여야 한다).
   * Template에 속하지 않는 세션 한정 값이라 저장 파일에는 들어가지 않는다 —
   * 다시 열면 두 반쪽은 그냥 독립된 선 두 개가 된다, 문제없다.
   */
  crossBoundaryPairs: { backId: string; frontId: string }[];
  /**
   * 앞으로 그을 선의 모양이자, 앞으로 끌 도형의 모양.
   *
   * 값이 없는 키는 core/style의 기본값을 따른다. 그린 선에도 그 키가 들어가지 않으므로,
   * 나중에 기본값을 바꾸면 그때 그은 선들도 같이 따라온다.
   *
   * **그리기 도구로 클릭해서 이으면 선, 사각형으로 끌면 도형이다** — 도형은
   * 따로 도구를 두지 않고 여기 합쳤다. 끌어서 나온 사각형은 둥글기가
   * 0(각짐)이어도 도형(ShapeObject) 하나로 만든다 — 그래야 나중에 그
   * 사각형을 골라 둥글기를 바로 바꿀 수 있다(선 4개였다면 나중에 하나로
   * 묶어 둥글게 할 수 없다). `roundness`는 LineObject에는 없는 속성이라,
   * 도형이 만들어질 때만 옮겨 붙는다. `width`는 그 도형의 `strokeWidth`가 된다.
   */
  drawStyle: DrawStyle;
  /** 앞으로 찍을 체크박스의 모양. drawStyle의 체크박스 판이다. */
  checkboxDraftStyle: CheckboxStyle;
  /** 앞으로 쓸 글자의 모양. drawStyle의 글자 판이다. */
  textDraftStyle: TextStyle;
  /** 자동 필드 도구로 다음에 찍을 서식. drawStyle의 자동 필드 판이다. */
  fieldDraftFormat: string;
  /**
   * 이번 세션에 등록한 글꼴 목록.
   *
   * 파일 바이트는 여기 없다 — fonts/registry가 들고 있다. 상태에 수 MB짜리
   * 버퍼를 넣으면 구독하는 컴포넌트마다 그것을 들여다보게 된다.
   */
  userFonts: UserFont[];
  /** 이번 세션에 등록한 이미지 목록. 파일 바이트는 images/registry가 들고 있다(userFonts와 같은 이유). */
  userImages: UserImage[];
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
  /**
   * 낱장 조합에서, 특정 칸만 "인쇄하기"에서 직접 손본 내용. 키는 슬롯 번호
   * (slotAssignment와 같은 번호 매김). 값이 있으면 그 칸에 배정된 양식이
   * 무엇이든(또는 나중에 바뀌어도) 이 내용을 그대로 쓴다.
   *
   * `slotAssignment`(어느 양식을 배정했는지)와 따로 두는 이유는 `Template.
   * pageOverrides`와 같다 — 배정을 바꾼다고 애써 손본 칸이 같이 지워지면
   * 안 된다. 양식이 아니라 이 조합 자체(store 루트)에 속한 값이라
   * slotAssignment와 같은 자리에 둔다.
   */
  comboSlotOverrides: Record<number, DiaryObject[]>;
  /** 뒷면 쪽의 comboSlotOverrides. */
  comboSlotBackOverrides: Record<number, DiaryObject[]>;
  /**
   * 인쇄하기에서 칸·페이지 하나를 직접 손보는 중일 때만 값이 있다. 실제
   * 양식 목록(`templates`)에는 들어가지 않는다 — 갤러리에도 저장 파일에도
   * 안 보인다.
   *
   * 이게 있는 동안은 `undo`·`redo`와 그리기 관련 액션들(drawLines·commitText
   * 등, `patchActiveSide`·`activeObjects`를 거치는 전부)이 `activeId` 대신
   * 이 그림자 양식을 고친다 — 그 함수들의 코드는 하나도 안 바꿨다. 그래서
   * 진짜 `activeId`는 그대로 남아, 인쇄하기 화면의 나머지 부분(다른 칸·
   * 페이지, 인쇄 설정 전체)은 손보는 동안에도 하나도 안 바뀐 채 보인다.
   */
  shadowTemplate: Template | null;
  /** shadowTemplate이 있을 때, 그중 지금 손보는 쪽(앞/뒤). */
  shadowSide: Side;
  /**
   * `beginShadowEdit`을 부를 때마다 하나씩 올라간다. 그림자 세션끼리(인쇄
   * 하기의 칸·페이지 손보기, 노트 반쪽 편집) 서로 구별하는 값이다 —
   * `shadowTemplate` 자체는 세션마다 새로 채워질 뿐 "몇 번째 세션인지"를
   * 모르므로, 복사·붙여넣기가 "같은 자리를 다시 손보는 중"인지 "다른
   * 자리로 옮겨왔는지" 가리는 데 쓴다(`clipboardOrigin`).
   */
  shadowToken: number;
}

interface Store extends Settings {
  setPaperPreset: (id: string) => void;
  setInsertPreset: (id: string) => void;
  patchPaper: (p: Partial<PaperState>) => void;
  patchInsert: (p: Partial<Omit<InsertSetting, 'punch'>>) => void;
  patchPunch: (p: Partial<PunchSetting>) => void;
  patchDotGrid: (p: Partial<DotGrid>) => void;
  /** 지금 양식의 메인색을 정한다. */
  setPaletteMain: (color: string) => void;
  /** 지금 양식의 색상판에 서브색을 하나 더한다. 이미 있는 색이면 다시 넣지 않는다. */
  addPaletteColor: (color: string) => void;
  /** 지금 양식의 색상판에서 서브색 하나를 지운다. */
  removePaletteColor: (index: number) => void;
  /** 이 양식을 몇 번 찍을지. `repeat`으로 바꾸면 낱장 조합(칸 배정)은 더 이상 쓰이지 않는다. */
  patchRepeat: (repeat: RepeatSetting) => void;
  /** 지금 양식의 편집 화면 보기를 90도씩 돌린다. 인쇄물·좌표에는 영향이 없다. */
  rotateView: (dir: 'left' | 'right') => void;
  /** 지금 양식의 앞면·뒷면 중 어느 쪽을 편집할지. */
  setSide: (side: Side) => void;
  /** 지금 양식에 뒷면을 만든다. 이미 있으면 아무 일도 하지 않는다. */
  addBack: () => void;
  /** 지금 양식의 뒷면을 지우고 단면으로 되돌린다. 뒷면에 그린 것도 함께 사라진다. */
  removeBack: () => void;
  /** 지금 앞면을 그대로 뒷면으로 만든다(없으면 새로 만들고, 있으면 덮어쓴다). */
  copyFrontToBack: () => void;
  /* ── 양식 관리 ── */
  selectTemplate: (id: string) => void;
  /** 규격·이름·격자를 주지 않으면 지금 양식의 것과 자동 이름을 쓴다. */
  addTemplate: (insert?: InsertSetting, name?: string, grid?: DotGrid, kind?: TemplateKind) => void;
  /** 지금 양식(노트)의 표지·쪽 중 한 반쪽을 통째로 갈아끼운다. */
  setNotebookHalf: (target: NotebookSlotRef, half: NotebookHalf) => void;
  /** 지금 양식(노트)의 쪽수를 바꾼다. 4의 배수가 아니면 빈 쪽으로 채워 맞춘다. */
  setNotebookPageCount: (count: number) => void;
  /**
   * 지금 양식(노트)의 쪽 하나(`sourceIndex`)를 여러 쪽(`targetIndices`)에
   * 복사한다. `half`는 소스 쪽에도 그대로 반영된다 — 아직 "완료"를 안
   * 누른 지금 그린 내용까지 함께 복사·저장하려는 것이다.
   */
  copyNotebookPage: (half: NotebookHalf, sourceIndex: number, targetIndices: number[]) => void;
  /** 규격을 주면 그 규격으로 복제한다. 원본은 손대지 않는다. */
  copyTemplate: (id: string, insert?: InsertSetting) => void;
  renameTemplate: (id: string, name: string) => void;
  removeTemplate: (id: string) => void;
  /** 낱장 조합에서 이 칸에 넣을 양식. `null`이면 배정을 지우고 기본값(activeId)으로 돌린다. */
  assignSlot: (index: number, templateId: string | null) => void;
  /** 낱장 조합의 그 칸을 "인쇄하기"에서 직접 손본 내용으로 남긴다. */
  setComboSlotOverride: (index: number, side: Side, objects: DiaryObject[]) => void;
  /** 손본 내용을 지우고 다시 배정된 양식을 자동으로 따르게 한다. */
  clearComboSlotOverride: (index: number, side: Side) => void;
  /** 세트형의 그 페이지를 "인쇄하기"에서 직접 손본 내용으로 남긴다. */
  setPageOverride: (page: number, side: Side, objects: DiaryObject[]) => void;
  /** 손본 페이지를 지우고 다시 원본 양식에서 자동 계산하게 한다. */
  clearPageOverride: (page: number, side: Side) => void;
  /**
   * 인쇄하기에서 칸·페이지 하나를 직접 손보기 시작한다. 지금 그 칸·페이지에
   * 보이는 내용(objects)으로 그림자 양식을 채운다 — 자동 계산됐든 이미 손본
   * 것이든 상관없이, 지금 보이는 그대로가 손보기 시작하는 값이다.
   */
  beginShadowEdit: (insert: InsertSetting, dotGrid: DotGrid, objects: DiaryObject[], side: Side) => void;
  /**
   * 그림자 양식을 버린다. 결과를 comboSlotOverrides·pageOverrides 등으로
   * 옮기는 것은 부르는 쪽(App.tsx)의 몫이다 — 이 액션 자체는 그냥 지운다.
   */
  endShadowEdit: () => void;
  setTool: (t: Tool) => void;
  /** 그으면 생기고 이미 있으면 지워진다. 선 하나든 면의 네 변이든 한 번으로 친다. */
  drawLines: (segs: LineSeg[]) => void;
  /**
   * 뒷면·앞면 경계를 넘어 이은 선 — 반쪽 둘을 각자의 쪽에 한 번에 커밋하고,
   * 초점을 focusSide로 옮긴다. toggleLines처럼 이미 있으면 지우는 동작은
   * 하지 않는다 — 늘 새로 긋는다.
   */
  commitCrossBoundaryLine: (backSeg: LineSeg, frontSeg: LineSeg, focusSide: Side) => void;
  select: (ids: string[]) => void;
  deleteSelected: () => void;
  /** 고른 객체를 클립보드에 담는다. 아무것도 못 골랐으면 아무 일도 하지 않는다. */
  copySelected: () => void;
  /** 클립보드를 지금 편집 중인 쪽에 붙여넣는다. 새 id를 받고, 겹치지 않게 살짝 옮겨진다. */
  pasteClipboard: () => void;
  /**
   * 고른 것들을 잠근다. 잠근 것은 클릭으로도 감싸기로도 골라지지 않는다
   * (ui/EditorTab의 hitAt·marquee 필터) — 그래서 잠그는 순간 고른 상태를
   * 비운다. 다시 손대려면 `unlockAll`로 전부 풀어야 한다.
   */
  lockSelected: () => void;
  /** 잠긴 것을 전부 푼다. 하나씩 푸는 대신 전부 한 번에 — 목록 UI 없이도 되돌릴 수 있게. */
  unlockAll: () => void;
  moveSelected: (dx: Mm, dy: Mm) => void;
  /** 고른 선 하나의 한쪽 끝을 옮긴다. */
  reshapeSelected: (id: string, end: 1 | 2, p: { x: Mm; y: Mm }) => void;
  /** 고른 선들의 굵기·색·모양. 값이 undefined면 기본값으로 되돌린다. */
  styleSelected: (patch: LineStyle) => void;
  /** 앞으로 그을 선(또는 둥글기를 주면 도형)의 모양. */
  setDrawStyle: (patch: DrawStyle) => void;
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
  /** 자동 필드 도구로 다음에 찍을 서식을 바꾼다. */
  setFieldDraftFormat: (format: string) => void;
  /** 새 달력 오브젝트를 이 박스 크기로 만든다. */
  commitCalendar: (box: Box) => void;
  /**
   * 상자 모양 오브젝트(글자·달력·이미지·도형) 하나의 크기·자리를 통째로 바꾼다.
   *
   * 모서리 손잡이로 끄는 동안은 미리보기만 하고(gestures의 `previewBox`),
   * 손을 뗄 때 이 액션으로 한 번만 진짜 값을 바꾼다 — 다른 몸짓들과 같은 규칙이다.
   *
   * `extra`는 상자 말고 같이 바뀌는 값이 있을 때만 쓴다 — 글자는 세로 비율로
   * 글자 크기(`size`)·줄 간격(`lineHeight`)도 같이 바뀐다(`ui/EditorTab.tsx`의
   * `resizeTextBox`). 상자와 한 번의 되돌리기(undo)로 묶으려고 여기서 함께 받는다.
   */
  resizeObject: (id: string, box: Box, extra?: Partial<TextObject>) => void;
  /** 고른 달력들의 시작 요일·이전달 표시·요일 언어·색. */
  styleCalendar: (patch: CalendarStyle) => void;
  /** 등록을 마친 글꼴을 목록에 넣는다. 파일 읽기는 fonts/registry가 이미 끝냈다. */
  addUserFont: (font: UserFont) => void;
  /** 글꼴 이름(라벨)을 바꾼다. */
  renameUserFont: (id: string, label: string) => void;
  /**
   * 등록을 마친 이미지를 목록에 넣는다. 파일 읽기는 images/registry가 이미 끝냈다.
   *
   * 디자인 관리에서 저장하지 않은("최근 사용") 이미지가 RECENT_IMAGE_CAP개를
   * 넘으면, 지금 쓰는 중이 아닌 것 중 가장 오래된 것부터 자동으로 지운다.
   */
  addUserImage: (image: UserImage) => void;
  /**
   * 자주 쓰는 이미지 목록에서 하나를 뺀다.
   *
   * 지금 프로젝트 어딘가(앞뒤 어느 쪽이든)에서 쓰는 중이면 아무 일도 하지
   * 않는다 — 지우면 그 자리가 빈 이미지로 깨지기 때문이다.
   */
  removeUserImage: (id: string) => void;
  /** 이미지 이름(라벨)을 바꾼다. */
  renameUserImage: (id: string, label: string) => void;
  /** 디자인 관리에서 "저장"을 켠다 — "최근 사용" 개수 제한을 벗어나 영구히 남는다. */
  saveUserImage: (id: string) => void;
  /** 저장을 끈다 — 다시 "최근 사용" 취급이 되어, 오래되면 자동으로 지워질 수 있다. */
  unsaveUserImage: (id: string) => void;
  /**
   * 새 이미지 오브젝트를 이 박스 크기로 만든다.
   *
   * 사진 없이 빈 채로 만든다 — 달력·도형처럼 자리부터 그린다. 사진은
   * 그 상자를 클릭해서(`styleImage`) 나중에 고른다.
   */
  commitImage: (box: Box) => void;
  /** 고른 이미지들의 사진을 바꾼다. */
  styleImage: (imageId: string) => void;
  /**
   * 방금 더블클릭한 빈 이미지 상자의 id — 파일 선택 창을 스스로 열라는 신호다.
   *
   * 선택 상태(selectedIds)만으로는 "같은 상자를 다시 더블클릭했다"를 구분할
   * 수 없다(값이 그대로면 리액트가 이펙트를 다시 부르지 않는다). 그래서
   * 더블클릭할 때마다 이 값을 새로 세팅하고, 연 뒤에는(ImageControls) 다시
   * null로 되돌려 다음 더블클릭에서도 켜지게 한다. 그리는 순간에는 켜지지
   * 않는다 — 여러 개를 잇달아 그릴 때 방해가 된다.
   */
  pickImageFor: string | null;
  requestImagePick: (id: string | null) => void;
  /** 고른 이미지들의 회전 각도(도, 시계 방향)를 바꾼다. 0이면 값을 아예 지운다. */
  styleImageRotate: (rotate: number) => void;
  /** 새 도형 오브젝트를 이 박스 크기로 만든다. */
  commitShape: (box: Box) => void;
  /**
   * 표 — 테두리(도형 하나)와 안쪽 칸 선을 한 번에 만든다.
   *
   * `commitShape` + `drawLines`를 각각 부르지 않는 이유는 둘이다: 되돌리기
   * (undo) 한 번으로 묶여야 하고, **막 그린 표를 고르면 테두리만이 아니라
   * 안쪽 칸 선까지 다 함께 고른 상태**가 되어야 한다 — 테두리만 고르면
   * 초록 선택 테두리가 겉에만 둘러져 안쪽과 다르게 보인다.
   */
  commitTable: (border: Box, innerLines: LineSeg[]) => void;
  /** 고른 도형들의 둥글기·테두리 굵기·색·모양. */
  styleShape: (patch: ShapeStyle) => void;
  /** 앞으로 찍을 체크박스의 모양. */
  setCheckboxDraftStyle: (patch: CheckboxStyle) => void;
  /** 걸친 칸마다 하나씩 새 체크박스 오브젝트를 만든다(표처럼 범위 드래그). */
  commitCheckboxes: (boxes: Box[]) => void;
  /** 고른 체크박스들의 아이콘·테두리 굵기·색. */
  styleCheckbox: (patch: CheckboxStyle) => void;
  /** 저장 파일에서 읽은 양식들로 통째로 갈아끼운다. */
  loadProject: (p: SavedProject) => void;
  /** 저장 파일에서 읽은 양식들을 지금 프로젝트 끝에 더한다(갈아끼우지 않는다). */
  importTemplates: (templates: Template[]) => void;
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

export type Tool =
  | 'select'
  | 'draw'
  | 'text'
  | 'table'
  | 'field'
  | 'calendar'
  | 'image'
  | 'checkbox';
export type Side = 'front' | 'back';

/** `clipboardOrigin` 참고 — 복사한 순간의 "면"을 가리키는 값. */
export type ClipboardOrigin =
  | { kind: 'template'; id: string; side: Side }
  | { kind: 'shadow'; token: number };

/** 그리기 도구의 다음 몸짓에 쓰일 모양 — LineStyle에 도형 여부를 가르는 둥글기만 더한다. */
export type DrawStyle = LineStyle & { roundness?: CornerRoundness };

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
/** 붙여넣을 때 원본과 겹치지 않게 옮기는 양. */
const PASTE_OFFSET: Mm = 5;

const NO_INSERT = defaultInsert();
const NO_GRID: DotGrid = { ...DEFAULT_DOT_GRID };
const NO_PALETTE: ColorPalette = { ...DEFAULT_PALETTE };
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

/**
 * 앞면·뒷면이 각자 갖는 것 — 그린 것뿐이다. 격자는 이제 앞뒤가 공유하는
 * 값이라(`Template.dotGrid`) 여기 들어오지 않는다, `patchActive`가 다룬다.
 */
type SideData = { objects: History<DiaryObject[]> };

/** 지금 편집 중인 쪽의 데이터. 뒷면인데 아직 없으면 `null`이다. */
function activeSideData(t: Template, side: Side): SideData | null {
  return side === 'front' ? { objects: t.objects } : t.back;
}

/**
 * 지금 편집 중인 쪽(앞/뒤)의 그린 것만 고친다.
 *
 * 그리기·실행취소가 전부 이걸 거친다. **뒷면인데 아직 만들지 않았으면
 * 조용히 아무 일도 하지 않는다** — 화면이 `뒷면 만들기` 버튼으로 먼저 만들게
 * 하므로, 여기까지 오는 것은 사실상 일어나지 않는 경우에 대한 방어선이다.
 *
 * **그림자 양식(`shadowTemplate`)이 있으면 `activeId` 대신 그쪽을 고친다.**
 * 인쇄하기에서 칸·페이지를 직접 손보는 동안 이 함수를 쓰는 그리기 액션들
 * (drawLines·commitText 등)은 하나도 안 바꾸고, 이 안의 분기 하나로 전부
 * 그림자를 향하게 한다.
 */
function patchActiveSide(
  s: Pick<Settings, 'templates' | 'activeId' | 'side' | 'shadowTemplate' | 'shadowSide'>,
  fn: (data: SideData) => Partial<SideData>,
): Partial<Pick<Settings, 'templates' | 'shadowTemplate'>> {
  if (s.shadowTemplate) {
    const data = activeSideData(s.shadowTemplate, s.shadowSide);
    if (!data) return {};
    return s.shadowSide === 'front'
      ? { shadowTemplate: { ...s.shadowTemplate, ...fn(data) } }
      : { shadowTemplate: { ...s.shadowTemplate, back: { ...s.shadowTemplate.back!, ...fn(data) } } };
  }

  const active = activeTemplate(s);
  if (!active) return { templates: s.templates };

  if (s.side === 'front') {
    return {
      templates: s.templates.map((t) => (t.id === active.id ? { ...t, ...fn({ objects: t.objects }) } : t)),
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
  s: Pick<Settings, 'templates' | 'activeId' | 'side' | 'shadowTemplate' | 'shadowSide'>,
  next: DiaryObject[],
): Partial<Pick<Settings, 'templates' | 'shadowTemplate'>> {
  return patchActiveSide(s, (d) => ({ objects: commit(d.objects, next) }));
}

/** 지금 편집 중인 쪽의 그린 것들. 없으면(양식이 없거나 뒷면이 없으면) 빈 목록이다. */
function activeObjects(
  s: Pick<Settings, 'templates' | 'activeId' | 'side' | 'shadowTemplate' | 'shadowSide'>,
): DiaryObject[] {
  if (s.shadowTemplate) return activeSideData(s.shadowTemplate, s.shadowSide)?.objects.present ?? [];
  const active = activeTemplate(s);
  if (!active) return [];
  return activeSideData(active, s.side)?.objects.present ?? [];
}

/** 지금 어느 "면"을 편집 중인지 — `clipboardOrigin`과 견줘 같은 면인지 가른다. */
function activeContext(
  s: Pick<Settings, 'activeId' | 'side' | 'shadowTemplate' | 'shadowToken'>,
): ClipboardOrigin {
  if (s.shadowTemplate) return { kind: 'shadow', token: s.shadowToken };
  return { kind: 'template', id: s.activeId, side: s.side };
}

function sameContext(a: ClipboardOrigin, b: ClipboardOrigin): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'template' && b.kind === 'template'
    ? a.id === b.id && a.side === b.side
    : a.kind === 'shadow' && b.kind === 'shadow' && a.token === b.token;
}

/** "디자인 관리"에서 저장하지 않은 이미지가 이 개수를 넘으면, 안 쓰는 중인 것부터 오래된 순으로 지운다. */
const RECENT_IMAGE_CAP = 10;

/** 이 이미지를 지금 어느 템플릿(앞·뒤 어느 쪽이든)이 실제로 쓰고 있는가. */
function imageInUse(templates: Template[], id: string): boolean {
  return templates.some((t) =>
    [...t.objects.present, ...(t.back?.objects.present ?? [])].some((o) => isImage(o) && o.imageId === id),
  );
}

/**
 * "최근 사용" 칸(저장 안 한 이미지)이 RECENT_IMAGE_CAP을 넘으면 넘치는 만큼
 * 지운다 — 쓰는 중인 이미지는 저장한 것과 같이 취급해 후보에서 뺀다(그래야
 * 화면에 그려진 이미지가 갑자기 사라지지 않는다). 나머지 중 `usedAt`이
 * 오래된 것부터 지운다.
 */
function evictExcessRecent(
  images: UserImage[],
  templates: Template[],
): { kept: UserImage[]; evicted: UserImage[] } {
  const recent = images.filter((i) => !i.saved && !imageInUse(templates, i.id));
  if (recent.length <= RECENT_IMAGE_CAP) return { kept: images, evicted: [] };

  const oldestFirst = [...recent].sort((a, b) => (a.usedAt ?? 0) - (b.usedAt ?? 0));
  const evictIds = new Set(oldestFirst.slice(0, recent.length - RECENT_IMAGE_CAP).map((i) => i.id));
  return {
    kept: images.filter((i) => !evictIds.has(i.id)),
    evicted: images.filter((i) => evictIds.has(i.id)),
  };
}

/**
 * `before`에서 `after`로 갈 때 새로 생긴(before엔 없던) 객체가 딱 하나면 그 id.
 * 여럿이거나 없으면 undefined — 그 경우엔 반쪽짜리 선 되돌리기 짝을 찾지 않는다.
 *
 * undo는 (past의 목표 상태, 지금 present) 순서로, redo는 (지금 present, future의
 * 목표 상태) 순서로 넘기면 "이 한 걸음이 지우는/살리는 객체"가 나온다.
 */
function soleChangedId(before: DiaryObject[], after: DiaryObject[]): string | undefined {
  const beforeIds = new Set(before.map((o) => o.id));
  const changed = after.filter((o) => !beforeIds.has(o.id));
  return changed.length === 1 ? changed[0].id : undefined;
}

/** id가 경계를 넘어 이은 선의 반쪽이면 반대쪽 정보를. 아니면 null. */
function findPairPartner(
  pairs: { backId: string; frontId: string }[],
  side: Side,
  id: string,
): { otherSide: Side; otherId: string } | null {
  const pair = pairs.find((p) => (side === 'back' ? p.backId : p.frontId) === id);
  if (!pair) return null;
  return { otherSide: side === 'back' ? 'front' : 'back', otherId: side === 'back' ? pair.frontId : pair.backId };
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
    // 노트도 마찬가지다 — repeat은 single로 남아 있지만 표지+쪽 전체가 하나의
    // 인쇄 단위라 다른 양식과 섞일 수 없다(printModeOf가 kind를 우선 본다).
    const valid = t && t.repeat.mode === 'single' && t.kind !== 'notebook' && sameSize(t.insert, base.insert);
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
  clipboard: [],
  clipboardOrigin: null,
  crossBoundaryPairs: [],
  drawStyle: {},
  checkboxDraftStyle: {},
  textDraftStyle: {},
  fieldDraftFormat: DEFAULT_FIELD_FORMAT,
  userFonts: [],
  userImages: [],
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
  comboSlotOverrides: {},
  comboSlotBackOverrides: {},
  shadowTemplate: null,
  shadowSide: 'front',
  shadowToken: 0,

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

  // 격자는 앞뒤가 공유하는 값이다 — 속지 크기·구멍과 같은 이유(같은 종이
  // 한 장의 배경 무늬가 앞뒤마다 다를 리 없다). side와 무관하게 늘 고친다.
  // useDotGrid와 같은 예외 — 노트 반쪽을 손보는 중이면 그 반쪽의 격자를 고친다.
  patchDotGrid: (p) =>
    set((s) => {
      const active = activeTemplate(s);
      if (active?.kind === 'notebook' && s.shadowTemplate) {
        return { shadowTemplate: { ...s.shadowTemplate, dotGrid: { ...s.shadowTemplate.dotGrid, ...p } } };
      }
      return patchActive(s, (t) => ({ dotGrid: { ...t.dotGrid, ...p } }));
    }),
  setPaletteMain: (color) =>
    set((s) => patchActive(s, (t) => ({ palette: { ...t.palette, main: color } }))),
  addPaletteColor: (color) =>
    set((s) =>
      patchActive(s, (t) =>
        t.palette.subs.includes(color) ? {} : { palette: { ...t.palette, subs: [...t.palette.subs, color] } },
      ),
    ),
  removePaletteColor: (index) =>
    set((s) =>
      patchActive(s, (t) => ({ palette: { ...t.palette, subs: t.palette.subs.filter((_, i) => i !== index) } })),
    ),

  patchRepeat: (repeat) => set((s) => patchActive(s, () => ({ repeat }))),

  rotateView: (dir) =>
    set((s) =>
      patchActive(s, (t) => {
        const now = t.viewRotation ?? 0;
        const delta = dir === 'right' ? 90 : -90;
        const next = ((now + delta + 360) % 360) as 0 | 90 | 180 | 270;
        return next === 0 ? { viewRotation: undefined } : { viewRotation: next };
      }),
    ),

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

  copyFrontToBack: () =>
    set((s) => {
      const active = activeTemplate(s);
      if (!active) return {};
      const templates = s.templates.map((t) =>
        t.id === active.id ? { ...t, back: backFromFront(t) } : t,
      );
      return { templates };
    }),

  /* ─────────────────────────── 양식 관리 ─────────────────────────── */

  // 양식을 바꾸면 앞면으로 돌아간다. 방금 만진 양식의 뒷면 탭에 남아 있다가
  // 뒷면 없는 다른 양식으로 넘어가면 헷갈린다.
  selectTemplate: (activeId) => set({ activeId, side: 'front', selectedIds: [] }),

  addTemplate: (insert, name, grid, kind) =>
    set((s) => {
      // 규격을 주지 않으면 지금 보던 양식의 규격을 물려받는다. 갤러리에서 크기
      // 그룹의 `+`를 누르는 경우가 그렇다 — 그 크기로 하나 더 만드는 뜻이다.
      const cur = activeTemplate(s)?.insert ?? NO_INSERT;
      const base = insert ?? { ...cur, punch: { ...cur.punch } };
      const made = newTemplate(
        uniqueName(s.templates, name?.trim() || defaultName(s.templates, base)),
        base,
        kind,
      );
      if (grid) made.dotGrid = { ...grid };
      return { templates: [...s.templates, made], activeId: made.id, side: 'front', selectedIds: [] };
    }),

  setNotebookHalf: (target, half) =>
    set((s) =>
      patchActive(s, (t) => {
        if (target.part === 'cover') {
          if (!t.cover) return {};
          return { cover: { ...t.cover, [target.side]: half } };
        }
        if (!t.pages) return {};
        const pages = [...t.pages];
        pages[target.index] = half;
        return { pages };
      }),
    ),

  setNotebookPageCount: (count) =>
    set((s) =>
      patchActive(s, (t) =>
        t.pages ? { pageCount: count, pages: resizePages(t.pages, count) } : {},
      ),
    ),

  copyNotebookPage: (half, sourceIndex, targetIndices) =>
    set((s) =>
      patchActive(s, (t) => {
        if (!t.pages) return {};
        const pages = [...t.pages];
        pages[sourceIndex] = half;
        // 각자 되돌리기 이력을 새로 시작한다 — 복제할 때와 같은 원칙이다.
        // 같은 History 참조를 여러 쪽이 나눠 가지면, 한 쪽에서 되돌리기를
        // 눌렀을 때 다른 쪽까지 함께 바뀐다.
        for (const i of targetIndices) {
          if (i !== sourceIndex && i >= 0 && i < pages.length) pages[i] = duplicateNotebookHalf(half);
        }
        return { pages };
      }),
    ),

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

  setComboSlotOverride: (index, side, objects) =>
    set((s) => {
      const key = side === 'back' ? 'comboSlotBackOverrides' : 'comboSlotOverrides';
      return { [key]: { ...s[key], [index]: objects } };
    }),

  clearComboSlotOverride: (index, side) =>
    set((s) => {
      const key = side === 'back' ? 'comboSlotBackOverrides' : 'comboSlotOverrides';
      const next = { ...s[key] };
      delete next[index];
      return { [key]: next };
    }),

  setPageOverride: (page, side, objects) =>
    set((s) =>
      patchActive(s, () => {
        const key = side === 'back' ? 'pageBackOverrides' : 'pageOverrides';
        const active = activeTemplate(s);
        return { [key]: { ...active?.[key], [page]: objects } };
      }),
    ),

  clearPageOverride: (page, side) =>
    set((s) =>
      patchActive(s, () => {
        const key = side === 'back' ? 'pageBackOverrides' : 'pageOverrides';
        const active = activeTemplate(s);
        const next = { ...active?.[key] };
        delete next[page];
        return { [key]: next };
      }),
    ),

  beginShadowEdit: (insert, dotGrid, objects, side) =>
    set((s) => ({
      shadowTemplate: {
        id: '__shadow__',
        name: '',
        kind: 'insert',
        insert,
        dotGrid,
        palette: { ...DEFAULT_PALETTE },
        objects: side === 'front' ? initHistory(objects) : initHistory([]),
        repeat: SINGLE_REPEAT,
        back: side === 'back' ? { objects: initHistory(objects) } : null,
      },
      shadowSide: side,
      // 세션마다 하나씩 올린다 — 예를 들어 노트 쪽 A를 손보다 쪽 B로
      // 넘어가면 shadowSide는 둘 다 'front'라 이걸로만 구별한다.
      shadowToken: s.shadowToken + 1,
      selectedIds: [],
    })),

  endShadowEdit: () => set({ shadowTemplate: null, selectedIds: [] }),

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
      const active = activeTemplate(s);
      if (!active || !active.back) return {};
      const backLine: LineObject = { id: newId('l'), type: 'line', ...backSeg, ...s.drawStyle };
      const frontLine: LineObject = { id: newId('l'), type: 'line', ...frontSeg, ...s.drawStyle };
      const templates = s.templates.map((t) => {
        if (t.id !== active.id || !t.back) return t;
        return {
          ...t,
          objects: commit(t.objects, [...t.objects.present, frontLine]),
          back: { ...t.back, objects: commit(t.back.objects, [...t.back.objects.present, backLine]) },
        };
      });
      return {
        templates,
        side: focusSide,
        selectedIds: [focusSide === 'back' ? backLine.id : frontLine.id],
        crossBoundaryPairs: [...s.crossBoundaryPairs, { backId: backLine.id, frontId: frontLine.id }],
      };
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

  setFieldDraftFormat: (format) => set({ fieldDraftFormat: format }),

  commitCalendar: (box) =>
    set((s) => {
      const next: CalendarObject = { id: newId('c'), type: 'calendar', ...box };
      // 곧바로 고른 상태로 둔다. 놓자마자 크기부터 다듬는 일이 흔해서,
      // 손잡이가 바로 보여야 한 번 더 클릭하지 않고 이어서 끌 수 있다.
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

  // 같은 id로 다시 등록하면(저장 파일을 열고 그 글꼴을 다시 찾아온 경우)
  // 목록에 하나 더 늘리지 않고 그 자리를 갈아끼운다.
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
      const { kept, evicted } = evictExcessRecent(next, s.templates);
      for (const i of evicted) removeImage(i.name);
      return { userImages: kept };
    }),

  removeUserImage: (id) =>
    set((s) => {
      if (imageInUse(s.templates, id)) return {};
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
      const { kept, evicted } = evictExcessRecent(next, s.templates);
      for (const i of evicted) removeImage(i.name);
      return { userImages: kept };
    }),

  commitImage: (box) =>
    set((s) => {
      // 'im' 접두사를 쓴다 — images/registry가 등록한 파일의 id('img1' 등)와
      // 헷갈리지 않게 다른 접두사를 쓴다. imageId는 아직 없다 — 곧바로 고른
      // 상태로만 둔다(달력과 같은 이유). 파일 선택 창은 그리자마자 열지
      // 않는다 — 더블클릭해야 연다(pickImageFor, EditorTab.tsx의 onDoubleClick).
      const next: ImageObject = { id: newId('im'), type: 'image', ...box };
      return {
        ...commitObjects(s, [...activeObjects(s), next]),
        selectedIds: [next.id],
      };
    }),

  styleImage: (imageId) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) =>
        o.type === 'image' && s.selectedIds.includes(o.id) ? { ...o, imageId } : o,
      );
      // 다시 씌우는 것도 "쓴다"로 친다 — 최근 사용 순서에서 다시 맨 앞으로
      // 온다. 저장한 이미지는 usedAt이 뜻이 없지만(개수 제한에서 이미 빠져
      // 있다) 갱신해도 해가 없어 조건 없이 한다.
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

  pickImageFor: null,
  requestImagePick: (id) => set({ pickImageFor: id }),

  styleImageRotate: (rotate) =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) => {
        if (o.type !== 'image' || !s.selectedIds.includes(o.id)) return o;
        const merged: ImageObject = { ...o, rotate };
        // 0이면 키 자체를 지운다 — 손대지 않은 이미지와 같은 모양이 된다.
        if (rotate === 0) delete merged.rotate;
        return merged;
      });
      return commitObjects(s, next);
    }),

  commitShape: (box) =>
    set((s) => {
      // 도형은 그리기 도구를 사각형으로 끌 때 만들어진다 — drawStyle의
      // 값을 그대로 물려받는다. width는 그대로 도형의 strokeWidth가 된다.
      const next: ShapeObject = { id: newId('sh'), type: 'shape', ...box };
      if (s.drawStyle.roundness) next.roundness = s.drawStyle.roundness;
      if (s.drawStyle.width !== undefined) next.strokeWidth = s.drawStyle.width;
      if (s.drawStyle.color !== undefined) next.color = s.drawStyle.color;
      if (s.drawStyle.dash !== undefined) next.dash = s.drawStyle.dash;
      // 달력·이미지와 같은 이유로 곧바로 고른 상태로 둔다.
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
      // 방금 그은 안쪽 칸 선들의 id를 찾는다 — 같은 자리를 다시 그으면
      // 토글로 지워질 수 있으니(드문 경우), 실제로 남은 것만 고른다.
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

  setCheckboxDraftStyle: (patch) =>
    set((s) => ({ checkboxDraftStyle: { ...s.checkboxDraftStyle, ...patch } })),

  commitCheckboxes: (boxes) =>
    set((s) => {
      if (boxes.length === 0) return {};
      const next: CheckboxObject[] = boxes.map((box) => ({
        id: newId('ch'),
        type: 'checkbox',
        ...box,
        ...s.checkboxDraftStyle,
      }));
      // 표와 같은 이유로 찍자마자 전부 고른 상태로 둔다.
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

  loadProject: (p) =>
    set((s) => {
      const templates = toTemplates(p);
      // 글꼴은 이름만 살아 돌아온다. 파일은 사용자가 다시 등록해야 하고,
      // 그때까지 그 글자들은 기본 글꼴로 보인다(fonts/registry의 familyOf).
      const fonts = p.fonts ?? [];
      reserveIds(fonts.map((f) => f.id));
      // 이미지도 같은 사정이다 — 이름만 돌아오고, url이 없어 그때까지는 빈 채로 보인다.
      const images = p.images ?? [];
      reserveImageIds(images.map((i) => i.id));
      // 새로고침하면 newId·양식 id 카운터가 0부터 다시 시작하는데, 불러온
      // 파일에는 이미 l1·t3 같은 id가 들어 있다 — 그대로 두면 불러온 뒤
      // 처음 그리는 것이 파일 속 어떤 객체와 같은 id를 받는다(글꼴·이미지와
      // 같은 사정이라 위와 같은 방식으로 막는다).
      ensureTemplateIdCounterAbove(templates.map((t) => t.id));
      ensureIdCounterAbove(
        templates.flatMap((t) => [
          ...t.objects.present.map((o) => o.id),
          ...(t.back?.objects.present.map((o) => o.id) ?? []),
          ...Object.values(t.pageOverrides ?? {}).flatMap((objs) => objs.map((o) => o.id)),
          ...Object.values(t.pageBackOverrides ?? {}).flatMap((objs) => objs.map((o) => o.id)),
        ]),
      );
      const print = p.print as Partial<Settings>;
      return {
        templates,
        activeId: templates[0]?.id ?? '',
        selectedIds: [],
        userFonts: fonts.map((f) => ({ ...f, family: `user-font-${f.id}` })),
        userImages: images.map((i) => ({ ...i, url: '' })),
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

  importTemplates: (incoming) =>
    set((s) => {
      // 새 id를 준 뒤에 이름 겹침을 검사해야, 한 번에 여러 파일을 더할 때도
      // 방금 더한 것끼리도 서로 이름이 겹치지 않는다.
      let pool = s.templates;
      const added: Template[] = [];
      for (const t of incoming) {
        const fresh = refreshTemplateIds(t);
        const named = { ...fresh, name: uniqueName(pool, fresh.name) };
        pool = [...pool, named];
        added.push(named);
      }
      if (added.length === 0) return {};
      return {
        templates: pool,
        activeId: added[added.length - 1].id,
        selectedIds: [],
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

  copySelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const picked = activeObjects(s).filter((o) => s.selectedIds.includes(o.id));
      return { clipboard: picked, clipboardOrigin: activeContext(s) };
    }),

  pasteClipboard: () =>
    set((s) => {
      if (s.clipboard.length === 0) return {};
      // 복사할 때와 지금이 같은 면이면(예: 그대로 붙여넣기) 살짝 밀어서
      // 겹치지 않게 한다 — 다른 면(앞↔뒤, 노트의 다른 쪽)이면 "이전 면과
      // 같은 위치에" 붙여 넣고 싶다는 피드백대로 자리를 그대로 둔다.
      const samePlace = s.clipboardOrigin !== null && sameContext(s.clipboardOrigin, activeContext(s));
      const offset = samePlace ? PASTE_OFFSET : 0;
      const pasted = s.clipboard.map((o) => cloneObject(o, offset, offset));
      return {
        ...commitObjects(s, [...activeObjects(s), ...pasted]),
        selectedIds: pasted.map((o) => o.id),
      };
    }),

  lockSelected: () =>
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const next = activeObjects(s).map((o) =>
        s.selectedIds.includes(o.id) ? { ...o, locked: true } : o,
      );
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
  //
  // **예외 — 경계를 넘어 이은 선.** 반쪽 하나를 지우는 되돌리기인데 반대쪽도
  // 지금 그 짝을 지우는 차례면, 하나의 선으로 보였던 것이니 함께 되돌린다.
  undo: () =>
    set((s) => {
      // 그림자 양식을 손보는 중이면 그쪽만 되돌린다 — 앞뒤 경계를 넘는 선은
      // 그림자에서 생기지 않으므로(한 세션에 한 쪽만 손본다) 짝 찾기 없이 바로 끝난다.
      if (s.shadowTemplate) {
        const data = activeSideData(s.shadowTemplate, s.shadowSide);
        if (!data || !canUndo(data.objects)) return {};
        const objects = undo(data.objects);
        return {
          ...patchActiveSide(s, () => ({ objects })),
          selectedIds: prune(s.selectedIds, objects.present),
        };
      }

      const active = activeTemplate(s);
      const data = active && activeSideData(active, s.side);
      if (!active || !data || !canUndo(data.objects)) return {};

      const soleId = soleChangedId(data.objects.past[data.objects.past.length - 1], data.objects.present);
      const partner = soleId ? findPairPartner(s.crossBoundaryPairs, s.side, soleId) : null;
      const otherData = partner && activeSideData(active, partner.otherSide);
      const otherMatches =
        otherData &&
        canUndo(otherData.objects) &&
        soleChangedId(otherData.objects.past[otherData.objects.past.length - 1], otherData.objects.present) ===
          partner!.otherId;

      if (partner && otherData && otherMatches) {
        const objects = undo(data.objects);
        const otherObjects = undo(otherData.objects);
        const templates = s.templates.map((t) => {
          if (t.id !== active.id || !t.back) return t;
          return s.side === 'front'
            ? { ...t, objects, back: { ...t.back, objects: otherObjects } }
            : { ...t, objects: otherObjects, back: { ...t.back, objects } };
        });
        return { templates, selectedIds: prune(s.selectedIds, objects.present) };
      }

      const objects = undo(data.objects);
      return {
        ...patchActiveSide(s, () => ({ objects })),
        selectedIds: prune(s.selectedIds, objects.present),
      };
    }),
  redo: () =>
    set((s) => {
      if (s.shadowTemplate) {
        const data = activeSideData(s.shadowTemplate, s.shadowSide);
        if (!data || !canRedo(data.objects)) return {};
        const objects = redo(data.objects);
        return {
          ...patchActiveSide(s, () => ({ objects })),
          selectedIds: prune(s.selectedIds, objects.present),
        };
      }

      const active = activeTemplate(s);
      const data = active && activeSideData(active, s.side);
      if (!active || !data || !canRedo(data.objects)) return {};

      const soleId = soleChangedId(data.objects.present, data.objects.future[0]);
      const partner = soleId ? findPairPartner(s.crossBoundaryPairs, s.side, soleId) : null;
      const otherData = partner && activeSideData(active, partner.otherSide);
      const otherMatches =
        otherData &&
        canRedo(otherData.objects) &&
        soleChangedId(otherData.objects.present, otherData.objects.future[0]) === partner!.otherId;

      if (partner && otherData && otherMatches) {
        const objects = redo(data.objects);
        const otherObjects = redo(otherData.objects);
        const templates = s.templates.map((t) => {
          if (t.id !== active.id || !t.back) return t;
          return s.side === 'front'
            ? { ...t, objects, back: { ...t.back, objects: otherObjects } }
            : { ...t, objects: otherObjects, back: { ...t.back, objects } };
        });
        return { templates, selectedIds: prune(s.selectedIds, objects.present) };
      }

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
/**
 * 격자는 앞뒤가 공유하는 값이라 side를 받지 않는다 — 어느 쪽에서 읽어도 같다.
 *
 * **노트(`kind === 'notebook'`)는 예외다.** 반쪽마다 격자를 따로 갖는다
 * (NotebookHalf.dotGrid — 사용자 요청). 그림자 양식으로 반쪽 하나를 손보는
 * 중이면 그 반쪽의 격자를 보여준다 — `useInsert`가 여전히 그림자를 안 보는
 * 것과 다른 이유다: 노트의 그림자는 인쇄하기의 칸 손보기(다른 용도)가 아니라
 * 이 반쪽 자체를 그리는 화면(NotebookHalfEditor)이 직접 SettingsPanel도
 * 함께 쓰므로, 여기서 어긋날 다른 화면이 없다. 속지(`kind === 'insert'`)는
 * 전혀 안 건드린다 — 인쇄하기의 그림자 편집이 여전히 진짜 양식의 격자를
 * 그대로 보여줘야 하기 때문이다(바로 위 주석 참고).
 */
export const useDotGrid = () =>
  useStore((s) => {
    const active = activeTemplate(s);
    if (active?.kind === 'notebook' && s.shadowTemplate) return s.shadowTemplate.dotGrid;
    return active?.dotGrid ?? NO_GRID;
  });
export const usePalette = () => useStore((s) => activeTemplate(s)?.palette ?? NO_PALETTE);
/** 지금 양식의 편집 화면 회전 각도. 대부분 0(안 돌림)이다. */
export const useViewRotation = () => useStore((s) => activeTemplate(s)?.viewRotation ?? 0);
export const useTemplateKind = () => useStore((s) => activeTemplate(s)?.kind ?? 'insert');
/**
 * side를 주지 않으면 지금 편집 중인 쪽(s.side, 그림자가 있으면 s.shadowSide)이다.
 * 앞뒤를 동시에 보여줄 때는 명시해서 그 쪽과 무관하게 양쪽을 각각 읽는다.
 *
 * **그림자 양식(`shadowTemplate`)이 있으면 그쪽을 우선한다** — `StyleBar`가
 * 인쇄하기의 칸 편집 화면(PrintSlotEditor)에서도 그대로 재사용되기 때문이다.
 * `useInsert`·`useDotGrid`는 일부러 그림자를 안 본다 — `SettingsPanel`이
 * 인쇄하기 탭에서도 함께 떠 있는데(App.tsx), 그 훅들까지 그림자를 보면 칸을
 * 손보는 동안 그 패널이 그림자의 속지 설정을 보여주면서 실제로는(patchInsert
 * 등은 그림자를 모른다) 진짜 활성 양식을 고치는 어긋난 상태가 된다. 그림자의
 * insert·dotGrid가 필요한 곳(PrintSlotEditor)은 `shadowTemplate`을 직접 읽는다.
 */
export const useObjects = (side?: Side) =>
  useStore((s) => {
    if (s.shadowTemplate) {
      return activeSideData(s.shadowTemplate, side ?? s.shadowSide)?.objects ?? NO_OBJECTS;
    }
    const active = activeTemplate(s);
    return (active && activeSideData(active, side ?? s.side)?.objects) ?? NO_OBJECTS;
  });
export const useRepeat = () => useStore((s) => activeTemplate(s)?.repeat ?? NO_REPEAT);
export const useSide = () => useStore((s) => s.side);
export const useHasBack = () => useStore((s) => activeTemplate(s)?.back != null);

export { INSERT_PRESETS, PAPER_PRESETS };
export type { Settings, PaperState, UnprintableSetting };
export type { InsertSetting, RepeatSetting, Template };
