import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cellAt, cellsIn, gridArea, gridLattice, tableLines, tableSize, tableSplit } from '../core/grid';
import { holeCenterX } from '../core/punch';
import { moveDelta, nudgeStep, snapToLattice } from '../core/snap';
import {
  boxOf,
  cleanStyle,
  groupIdOf,
  isCalendar,
  isMoon,
  isBoxResizable,
  isImage,
  isLine,
  isLocked,
  isShape,
  isText,
  MIN_FREE_BOX_SIZE,
  objectInRect,
  rectLines,
  resizeBox,
  rotationOf,
  splitAtBoundary,
  type DiaryObject,
  type TextStyle,
} from '../core/objects';
import { FONT_WEIGHT, SNAP_COLOR, SNAP_DOT_SIZE, TEXT_SIZE } from '../core/style';
import { roundMm, type Mm } from '../core/units';
import { fakeBoldStrokeOf, letterSpacingOfText, newTextStyle, rotateOf } from '../core/text';
import {
  useActiveWork,
  useCursor,
  useDisplayFace,
  useDotGrid,
  useEditObjects,
  useFaces,
  useHasBack,
  useInsert,
  usePalette,
  useSide,
  useSpreads,
  useStore,
  type Side,
} from '../store';
import { resolveObjectColors } from '../core/colors';
import { changedIds, faceLabel, type ResolvedFace } from '../core/work';
import { resolveRuleColors, type ColorRules } from '../core/colorRules';
import type { DotGrid } from '../core/grid';
import type { InsertSetting } from '../core/template';
import { IMAGE_ACCEPT, hasImage, registerImage } from '../images/registry';
import { InsertView } from './InsertView';
import { ImageThumbGrid } from './ImagePickerDialog';
import { PunchGuide } from './PunchGuide';
import { StyleBar } from './StyleBar';
import { Modal } from './Modal';
import { measureTextBox } from './measureText';
import { familyOf } from '../fonts/registry';
import { PX_PER_MM_AT_100, ZOOMS } from './pixels';
import {
  anyLineHandleAt,
  boxHandleAnchor,
  boxHandleAt,
  centerOnLogoLine,
  editingFor,
  handleAt,
  hiddenLineIdsFor,
  hitAt,
  merge,
  preview,
  previewBox,
  rectOf,
  resizeTextBoxTo,
  rotationDegOf,
  screenBoundsOfObjects,
  segProps,
  sizeLabelOf,
  toggleId,
  withCells,
  DRAG_START,
  HANDLE_SIZE,
  type Drag,
  type Editing,
  type Point,
} from './gestures';

/**
 * 이미지 손잡이가 도트로 붙는 문턱값.
 *
 * core/snap.ts의 나머지 스냅(이동 등)은 문턱값이 없다 — 늘 가장 가까운
 * 점으로 간다. 이미지 크기조정만 예외다(사용자 요청) — 도트에 이 거리
 * 안쪽이면 붙고, 벗어나면 도트와 무관하게 자유롭다. NotebookHalfEditor·
 * PrintSlotEditor도 같은 몸짓 코드를 저마다 가지고 있어 이 값을 가져다 쓴다.
 */
export const IMAGE_RESIZE_SNAP_DIST: Mm = 2;

/**
 * 양식 만들기 화면.
 *
 * 속지 한 장을 크게 띄우고 그 위에 그린다. 용지도 배치도 여기서는 모른다 —
 * 몇 개가 어떻게 인쇄될지는 인쇄 화면이 정한다.
 *
 * 그리기에서는 **조작이 곧 종류다.**
 *   점 클릭 → 점 클릭   선
 *   점에서 끌기          면 (선 네 개)
 * 둘 다 같은 자리에 이미 있으면 지워진다.
 */
export function Editor() {
  // 속성 막대(StyleBar)는 캔버스 위 상황별 막대 자리로 portal한다(세부계획 A0 결정: 꾸미기는 위쪽).
  const [stylePanelSlot, setStylePanelSlot] = useState<HTMLDivElement | null>(null);
  // 속지·격자·그린 것은 지금 고르고 있는 양식의, 지금 보는 쪽(앞/뒤)의 것이다.
  const insert = useInsert();
  const side = useSide();
  const hasBack = useHasBack();
  // 뒷면이 없으면 side가 어떻든 무조건 앞면이 활성이다 — 뒷면 없이 'back'
  // 상태가 남아 있어도(이론상만 가능하다) 방어한다. 앞뒤를 나란히 그리는
  // 지금 화면에서, "지금 그리기·선택이 실제로 향하는 쪽"이 activeSide다.
  const activeSide: Side = hasBack ? side : 'front';
  const inactiveSide: Side = activeSide === 'back' ? 'front' : 'back';
  // 리뉴얼: 펼침면의 두 면은 서로 다른 페이지라 격자도 면마다 따로다.
  const grid = useDotGrid(activeSide);
  const inactiveGrid = useDotGrid(inactiveSide);
  // 고르기·옮기기·지우기는 **고칠 객체**(원본 — 자동 필드가 살아 있는 것)로 판단하고,
  // 그리기는 **보일 면**(날짜가 채워지고 팔레트 이름표가 풀린 것)으로 한다. 둘은
  // 자리·크기가 같고 글자만 다르다(core/work의 editableObjects·expandWork).
  const objects = useEditObjects(activeSide);
  const activeFace = useDisplayFace(activeSide);
  const inactiveFace = useDisplayFace(inactiveSide);
  const palette = usePalette();
  const calendarRules = useCalendarRules(palette);
  const activeDisplay = useDisplayObjects(activeFace, palette);
  const inactiveDisplay = useDisplayObjects(inactiveFace, palette);
  const setSide = useStore((s) => s.setSide);
  const tool = useStore((s) => s.tool);
  const selectedIds = useStore((s) => s.selectedIds);
  const setTool = useStore((s) => s.setTool);
  const drawLines = useStore((s) => s.drawLines);
  const commitCrossBoundaryLine = useStore((s) => s.commitCrossBoundaryLine);
  const select = useStore((s) => s.select);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const copySelected = useStore((s) => s.copySelected);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const lockSelected = useStore((s) => s.lockSelected);
  const unlockAll = useStore((s) => s.unlockAll);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupSelected = useStore((s) => s.ungroupSelected);
  const moveSelected = useStore((s) => s.moveSelected);
  const reshapeSelected = useStore((s) => s.reshapeSelected);
  const commitText = useStore((s) => s.commitText);
  const commitCalendar = useStore((s) => s.commitCalendar);
  const commitImage = useStore((s) => s.commitImage);
  const requestImagePick = useStore((s) => s.requestImagePick);
  const commitShape = useStore((s) => s.commitShape);
  const commitTable = useStore((s) => s.commitTable);
  const commitCheckboxes = useStore((s) => s.commitCheckboxes);
  const commitMoon = useStore((s) => s.commitMoon);
  const resizeObject = useStore((s) => s.resizeObject);
  const textDraftStyle = useStore((s) => s.textDraftStyle);
  const fieldDraft = useStore((s) => s.fieldDraft);
  const showToast = useStore((s) => s.showToast);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [zoom, setZoom] = useState(100);
  const svgRef = useRef<SVGSVGElement>(null);

  /** 마우스가 붙을 자리 */
  const [hover, setHover] = useState<Point | null>(null);
  /** 선의 첫 점을 찍어둔 상태. 다음 클릭에서 선이 완성된다. */
  const [pending, setPending] = useState<Point | null>(null);
  // 자동 필드 도구로 다음에 찍을 순번과 ‘찍을 때마다 다음 날짜로’ — AutoField 패널과 같이 쓴다.
  const fieldNext = useStore((s) => s.fieldNext);
  const setFieldNext = useStore((s) => s.setFieldNext);
  /** 지금 끌고 있는 몸짓. 판단은 ref로, 미리보기는 state로 한다. */
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  /** 입력 중인 글자 상자. 확정하기 전까지는 객체가 아니다. */
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;

  /** 입력칸 자체. 속성 막대를 쓰고 나서 다시 글자로 돌아오기 위해 잡아둔다. */
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 더블클릭으로 도구를 'text'로 바꾸면서 동시에 입력을 여는 순간에만 쓴다.
   *
   * 도구가 바뀌면 아래 useEffect가 진행 중이던 입력을 확정하고 닫는데, 그 도구
   * 전환 자체가 "입력을 열기 위한" 것이면 방금 연 입력이 곧바로 닫혀버린다.
   * 이 순간만 그 정리를 건너뛴다.
   */
  const skipToolResetRef = useRef(false);

  const lockedCount = objects.filter(isLocked).length;
  const canUngroup = objects.some((o) => selectedIds.includes(o.id) && groupIdOf(o));
  const lattice = gridLattice(
    gridArea(insert, grid, insert.punch.safeZoneWidth, activeSide === 'back'),
    grid.spacing,
    grid.minMargin,
    grid.toEdge,
  );
  // 비활성 쪽의 격자 — 경계를 넘어 잇는 선의 둘째 점을 그 쪽 격자에 앉히려고
  // 있다. 없으면(빈 뒷면 등) 그 점은 안 붙는다.
  const inactiveLattice = gridLattice(
    gridArea(insert, inactiveGrid, insert.punch.safeZoneWidth, inactiveSide === 'back'),
    inactiveGrid.spacing,
    inactiveGrid.minMargin,
    inactiveGrid.toEdge,
  );
  const scale = (zoom / 100) * PX_PER_MM_AT_100;
  const noGrid = lattice.xs.length === 0 || lattice.ys.length === 0;

  // 옮길 때 격자에 앉히는 기준. 격자점 목록이 아니라 첫 점과 간격만 넘긴다 —
  // 목록은 여백 앞에서 끝나므로, 그것에 맞추면 여백 쪽으로 밀어낼 수 없게 된다.
  const gridPhase = noGrid
    ? null
    : { x0: lattice.xs[0], y0: lattice.ys[0], spacing: grid.spacing };

  // 격자점 사이 칸 개수. 도트든 그리드든 줄이든 모양과 무관하게 같은 격자에서 나온다.
  // core가 세어준다. 끝까지 채울 때 가장자리에 붙는 잘린 띠는 칸이 아니다.
  const cellCols = lattice.cols;
  const cellRows = lattice.rows;

  // 로고 정렬선 — 구멍과 같은 세로줄. PunchGuide가 이미 점선으로 보여주고
  // 있다. 텍스트·이미지를 **옮길 때**(만들 때는 아니다) 상자 가운데가 이
  // 줄 근처로 오면 정확히 그 줄에 맞춰진다(centerOnLogoLine, onUp의
  // move 처리 참고). 만들 때는 뺐다 — 갓 만든 상자는 타이핑하며 자라는데
  // (growBox, 왼쪽 위 고정·오른쪽으로만 자람), 만드는 순간 맞춘 가운데가
  // 다 타이핑한 뒤에는 다시 어긋나기 때문이다(12h에서 겪은 문제). 다 쓴
  // 뒤 그 상자를 줄 쪽으로 끌어다 놓는 쪽이 항상 정확하다.
  const logoLineX = holeCenterX(insert.punch, insert.width, activeSide === 'back');

  // 새로 쓸 글자에 붙일 스타일. 줄 간격을 따로 정해두지 않았으면 지금 도트 간격이 새겨진다.
  const draftStyle = newTextStyle(textDraftStyle, grid.spacing);

  function setDragBoth(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
  }

  /**
   * 입력을 끝낸다.
   *
   * 비어 있으면 아무것도 남기지 않는다. 그래서 "글자를 클릭해서 고른다"는 규칙이
   * 성립한다 — 보이지 않는 빈 상자가 없기 때문이다.
   */
  function finishEditing() {
    const cur = editingRef.current;
    if (!cur) return;
    // 글자를 안 바꿨으면(자동 필드를 열어봤다가 그대로 닫은 경우 등) 있던
    // 필드를 그대로 지킨다. 바뀌었으면 평범한 글자로 확정한다 — 글자에 `<+D0>`를
    // 쳐서 필드를 만드는 길은 없앴다(세부계획 A4.6 결정 5). 필드는 AutoField 도구로만.
    const field = cur.text === (cur.originalText ?? '') ? cur.field : undefined;
    commitText({ ...cur.box, text: cur.text, ...cur.style, ...(field ? { field } : {}) }, cur.id);
    setEditing(null);
    editingRef.current = null;
  }

  /** 지금 입력 중인 상자의 크기·정렬·색을 고친다. 아직 커밋 전이라 store를 거치지 않는다. */
  function setEditingStyle(patch: TextStyle) {
    setEditing((cur) => (cur ? { ...cur, style: cleanStyle({ ...cur.style, ...patch }) } : cur));
  }

  /**
   * 속성 막대를 쓰고 나면 다시 글자로 돌아온다.
   *
   * 드롭다운을 고르면 포커스가 그 드롭다운에 남는다. 그대로 두면 이어서 칠 수도
   * 없고 Esc로 확정할 수도 없다 — 방금 무엇을 고쳤는지는 보이는데 손이 갈
   * 곳이 없다.
   */
  function refocusText() {
    textInputRef.current?.focus();
  }

  // 도구를 바꾸면 긋다 만 선을 버리고 입력 중인 글자를 확정한다.
  // 고르기로 갔는데 "다음 점을 누르세요"가 남아 있으면 무엇을 기다리는지 알 수 없다.
  useEffect(() => {
    if (skipToolResetRef.current) {
      skipToolResetRef.current = false;
      return;
    }
    setPending(null);
    setDragBoth(null);
    finishEditing();
    // 자동 필드·달 도구로 들어올 때마다 첫째 날짜부터 다시 센다.
    if (tool === 'field' || tool === 'moon') setFieldNext({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      // 아래 도구 단축키 분기(맨 아래, e.metaKey||e.ctrlKey면 return)보다 먼저
      // 잡아야 한다 — 안 그러면 ⌘V가 그 분기에서 조용히 삼켜진다(그 분기의
      // 주석 참고).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (e.key === 'Escape') {
        setPending(null);
        setDragBoth(null);
        select([]);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
      // 방향키로 미세이동. ⇧를 누르면 격자 한 칸, 아니면 그 1/10이다
      // (core/snap의 nudgeStep — 고정 mm값이면 격자 간격에 따라 도트를
      // 벗어난다). ⌘·Ctrl과 함께면(브라우저 단축키일 수 있어) 건드리지 않는다.
      if (!e.metaKey && !e.ctrlKey && selectedIds.length > 0) {
        const step = nudgeStep(grid.spacing, e.shiftKey);
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveSelected(-step, 0);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveSelected(step, 0);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveSelected(0, -step);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveSelected(0, step);
          return;
        }
      }
      /*
       * 도구 단축키는 **글쇠 하나로만** 받는다.
       *
       * 여기서 수정키를 보지 않던 탓에 `⌘V`(붙여넣기)·`⌘T`(새 탭)·`⌘L`(주소창)에도
       * 함께 반응해서, 브라우저 단축키를 쓸 때마다 도구가 멋대로 바뀌었다.
       * 크롬이 우리 것을 뺏어간 게 아니라 우리가 크롬 것에 끼어든 쪽이었다.
       *
       * 맨 글자는 브라우저가 쓰지 않으므로 부딪히지 않는다. `⌘⇧T`(닫은 탭 열기)
       * 같은 조합으로 옮기는 것은 답이 아니다 — 그것도 크롬이 쓰고, 게다가
       * ⌘T·⌘N·⌘W는 웹페이지가 preventDefault로 막을 수도 없다.
       */
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 왼손만으로 다 닿는 자리에 둔다. L은 오른손 끝이라 멀어서 D로 옮겼다.
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'd') setTool('draw');
      if (e.key.toLowerCase() === 't') setTool('text');
      if (e.key.toLowerCase() === 'g') setTool('table');
      if (e.key.toLowerCase() === 'f') setTool('field');
      if (e.key.toLowerCase() === 'c') setTool('calendar');
      if (e.key.toLowerCase() === 'i') setTool('image');
      if (e.key.toLowerCase() === 'x') setTool('checkbox');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    undo,
    redo,
    deleteSelected,
    copySelected,
    pasteClipboard,
    select,
    setTool,
    moveSelected,
    selectedIds,
    grid.spacing,
  ]);

  /**
   * 마우스 위치를 지금 svgRef의 좌표계 그대로(mm)로. "속지" 모드에서는
   * viewBox가 이미 속지 mm라 이것이 곧 속지 좌표다. "용지" 모드에서는
   * viewBox가 용지 mm라 이것은 용지 좌표다(칸 안 좌표로 바꾸는 건 rawMm의 몫).
   *
   * viewBox를 mm로 잡아둔 덕분에 브라우저가 직접 mm를 돌려준다.
   * 이것이 SVG를 그대로 쓰기로 한 이유다 — 픽셀을 거치는 통역이 없다.
   */
  function rawSvgMm(e: React.PointerEvent): Point | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  /** 마우스 위치를 속지 좌표(mm)로 — 그리기 로직 전체가 받는 좌표다. */
  function rawMm(e: React.PointerEvent): Point | null {
    return rawSvgMm(e);
  }

  function snapped(e: React.PointerEvent): Point | null {
    const raw = rawMm(e);
    return raw && snapToLattice(lattice, raw.x, raw.y);
  }

  /**
   * 비활성 쪽(따로 있는 svg)을 클릭해서 초점을 옮긴다. 오늘까지의 탭
   * 전환과 같은 뜻이라, 탭을 눌렀을 때처럼 진행 중이던 것들을 정리한다.
   */
  function switchSide(next: Side) {
    setPending(null);
    setDragBoth(null);
    finishEditing();
    select([]);
    setSide(next);
  }

  /**
   * 뒷면 끝에서 앞면 끝으로(또는 반대로) 한 번에 그은 선 — 두 쪽 경계에서
   * 만나는 반쪽 두 개로 쪼개 각자의 쪽에 커밋한다. 실행취소가 앞뒤로 따로
   * 붙는 원칙(설계문서 8장) 그대로, 반쪽씩 두 번 커밋된다.
   *
   * `pending`은 activeSide 로컬, `clickLocal`은 inactiveSide(따로 있는 svg 자신의
   * viewBox) 로컬이다 — 두 svg가 떨어져 있어(뒷면·앞면 각자 0~insert.width) 하나로
   * 합친 좌표가 없다. 대신 **경계까지의 거리**로 비율을 구한다 — 어느 쪽
   * 좌표계인지와 무관하게, "경계에서 몇 mm 떨어졌는지"는 두 쪽 다 셀 수 있다.
   */
  function completeCrossBoundaryLine(clickLocal: Point) {
    if (!pending) return;
    const edgeXOf = (s: Side) => (s === 'back' ? insert.width : 0);
    const { aSeg, bSeg } = splitAtBoundary(
      {
        ...pending,
        distToBoundary: activeSide === 'back' ? insert.width - pending.x : pending.x,
        edgeX: edgeXOf(activeSide),
      },
      {
        ...clickLocal,
        distToBoundary: inactiveSide === 'back' ? insert.width - clickLocal.x : clickLocal.x,
        edgeX: edgeXOf(inactiveSide),
      },
    );

    // 반쪽 둘을 한 번에 커밋한다 — 되돌리기가 하나로 묶이려면(store.ts의
    // crossBoundaryPairs) 두 쪽 다 같은 액션 안에서 새로 생겨야 한다.
    const backSeg = activeSide === 'back' ? aSeg : bSeg;
    const frontSeg = activeSide === 'back' ? bSeg : aSeg;
    commitCrossBoundaryLine(backSeg, frontSeg, inactiveSide);

    setPending(null);
  }

  /**
   * 딱 하나만 골랐을 때의 끝점 손잡이.
   *
   * 여러 개 골라놓고 손잡이가 잔뜩 뜨면 어느 것을 잡는지 알 수 없다.
   */
  const lone =
    selectedIds.length === 1 ? (objects.find((o) => o.id === selectedIds[0]) ?? null) : null;

  /**
   * 이미 있는 것을 클릭했을 때 — 고르고, 끌면 옮길 수 있게 몸짓을 시작한다.
   *
   * 달력·이미지 도구에서도 이 몸짓을 그대로 쓴다. 예전엔 그 도구일 때
   * 고르기만 하고 옮기기는 시작하지 않아서, 도구를 select로 바꾸지 않으면
   * 방금 놓은 것을 끌어 옮길 수 없는 버그가 있었다.
   */
  function startMove(hit: DiaryObject, raw: Point, e: React.PointerEvent) {
    if (e.shiftKey) {
      select(toggleId(selectedIds, hit.id));
      return;
    }
    // 이미 고른 것 중 하나면 선택을 그대로 두고 함께 끈다.
    if (!selectedIds.includes(hit.id)) select([hit.id]);
    // 격자에 앉힐 기준점 — 함께 옮길 것들이 화면에서 차지하는 자리(회전
    // 반영)를 감싸는 네모의 왼쪽 위. select()는 다음 렌더에나 반영되므로
    // 지금 고른 것을 여기서 직접 센다.
    const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
    const box = screenBoundsOfObjects(objects.filter((o) => ids.includes(o.id)));
    setDragBoth({
      kind: 'move',
      origin: raw,
      anchor: box ? { x: box.x, y: box.y } : raw,
      dx: 0,
      dy: 0,
      hitId: hit.id,
      free: false,
      moved: false,
    });
  }

  function onDown(e: React.PointerEvent) {
    const raw = rawMm(e);
    const snap = snapped(e);
    if (!raw) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    // 이미 찍은 체크박스를 클릭하면(달력·이미지·도형처럼) 고르고 옮길 수
    // 있게 한다 — 빈 곳이면 표와 같은 몸짓(칸 범위 드래그)으로 새로 찍는다.
    if (tool === 'checkbox') {
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'draw', from: snap, to: snap });
      return;
    }

    // 그리기 도구는 고르지 않고도 계속 선을 잇는 게 보통이라, 이미 그은
    // 선의 끝점 근처를 누르면 새로 긋는 대신 그 선을 잡아 늘인다 — 안
    // 그러면 끝점을 끌었을 뿐인데 엉뚱한 새 도형이 하나 더 생긴다.
    if (tool === 'draw' && !pending) {
      const grip = anyLineHandleAt(objects, raw);
      if (grip) {
        setDragBoth({ kind: 'handle', id: grip.id, end: grip.end, to: raw });
        return;
      }
    }

    // 표도 몸짓은 그리기(면)와 똑같이 점에서 끄는 드래그다. 그 사이에서
    // 실제로 무엇이 생기는지는 onUp이 지금 도구를 보고 가른다.
    if (tool === 'draw' || tool === 'table') {
      if (snap) setDragBoth({ kind: 'draw', from: snap, to: snap });
      return;
    }

    if (tool === 'text') {
      // 이미 있는 글자를 클릭하면 그 자리에서 바로 고친다 — 새로 겹쳐 쓰지 않는다.
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit && isText(hit)) {
        finishEditing();
        // 자동 필드는 칠 글자가 없다 — 고르기만 하고 속성 막대에서 만진다.
        if (hit.field) select([hit.id]);
        else setEditing(editingFor(hit));
        return;
      }
      // 입력 중이었다면 먼저 확정한다. 그래야 빈 상자가 남지 않는다.
      finishEditing();
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    if (tool === 'field' || tool === 'moon') {
      // 이미 있는 글자를 클릭하면 고르기만 한다 — 자동 필드는 타이핑할 게
      // 없으니 새로 겹쳐 쓰는 대신 속성 막대에서 만지도록 안내한다.
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit) {
        select([hit.id]);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    if (tool === 'calendar' || tool === 'image') {
      // 방금 놓은(또는 고른) 달력·이미지면 모서리 손잡이가 몸통보다 먼저다 —
      // 도구를 select로 바꾸지 않고도 이어서 바로 크기를 다듬을 수 있다.
      const boxGripHit = boxHandleAt(lone, raw);
      if (boxGripHit) {
        // 격자에 앉힌 점(snap)을 쓴다 — raw 그대로 쓰면 손을 대는 순간(아직
        // 움직이기 전)만 격자에서 살짝 벗어난 값으로 시작해, 짧게 끌고 놓을
        // 때 도트에 잘 안 붙는 것처럼 느껴졌다. anchor(반대쪽 모서리의 화면
        // 자리)는 지금 한 번만 재고 드래그 내내 안 바꾼다 — gestures의
        // boxHandleAnchor·core/objects의 resizeBox 주석 참고.
        const to = snap ?? raw;
        const anchor = lone ? boxHandleAnchor(lone, boxGripHit.corner) : to;
        setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, anchor, to });
        return;
      }
      // 이미 있는 것을 클릭하면 고르고, 끌면 옮길 수 있게 한다.
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    // 달력 모서리 손잡이가 몸통보다 먼저다. 겹쳐 있을 때 손잡이를 못 잡으면
    // 늘이려다 매번 통째로 옮겨진다 — 끝점 손잡이와 같은 이유다.
    const boxGripHit = boxHandleAt(lone, raw);
    if (boxGripHit) {
      // snap을 쓰는 이유·anchor를 여기서 재는 이유는 위 이미지·달력 분기와 같다.
      const to = snap ?? raw;
      const anchor = lone ? boxHandleAnchor(lone, boxGripHit.corner) : to;
      setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, anchor, to });
      return;
    }

    // 끝점 손잡이가 선 몸통보다 먼저다. 겹쳐 있을 때 손잡이를 못 잡으면
    // 늘이려다 매번 통째로 옮겨진다.
    const grip = handleAt(lone, raw);
    if (grip) {
      setDragBoth({ kind: 'handle', id: grip.id, end: grip.end, to: raw });
      return;
    }

    // 고르기 — 선 위에서 시작하면 옮기기, 빈 곳이면 감싸기
    const hit = hitAt(svgRef.current, objects, raw);
    if (hit) {
      startMove(hit, raw, e);
      return;
    }
    if (!e.shiftKey) select([]);
    setDragBoth({ kind: 'marquee', from: raw, to: raw });
  }

  function onMove(e: React.PointerEvent) {
    setHover(snapped(e));
    const d = dragRef.current;
    const raw = rawMm(e);
    if (!d || !raw) return;

    if (d.kind === 'boxHandle') {
      const target = objects.find((o) => o.id === d.id);
      // 이미지만 예외 — 도트 근처면 붙고, 멀면 자유롭게 크기가 바뀐다.
      // to는 화면 자리 그대로 둔다 — anchor와 함께 core/objects의
      // resizeBox가 회전을 감안해 회전 전 크기를 계산한다.
      if (target && isImage(target)) {
        const snap = snapped(e);
        const near = snap && Math.hypot(raw.x - snap.x, raw.y - snap.y) <= IMAGE_RESIZE_SNAP_DIST;
        setDragBoth({ ...d, to: near ? snap! : raw });
        return;
      }
      const snap = snapped(e);
      if (!snap) return;
      setDragBoth({ ...d, to: snap });
    } else if (d.kind === 'draw' || d.kind === 'handle' || d.kind === 'textbox') {
      const snap = snapped(e);
      if (!snap) return;
      setDragBoth({ ...d, to: snap });
    } else if (d.kind === 'marquee') {
      setDragBoth({ ...d, to: raw });
    } else {
      // 손떨림으로 옮겨지지 않게, 한 번 넘기기 전까지는 누른 것으로 둔다.
      const moved = d.moved || Math.hypot(raw.x - d.origin.x, raw.y - d.origin.y) > DRAG_START;
      // ⌘(윈도우는 Ctrl)을 누른 채 끌면 격자를 벗어나 원하는 자리에 놓을 수 있다.
      // 끄는 도중에 눌러도 되고 떼도 된다 — 매번 다시 계산하므로 즉시 바뀐다.
      const free = e.metaKey || e.ctrlKey;
      setDragBoth({
        ...d,
        free,
        moved,
        ...(moved
          ? moveDelta(d.origin, raw, d.anchor, free ? null : gridPhase)
          : { dx: 0, dy: 0 }),
      });
    }
  }

  function onUp(e: React.PointerEvent) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const d = dragRef.current;
    setDragBoth(null);
    if (!d) return;

    if (d.kind === 'move') {
      // 끌지 않고 그냥 눌렀다 뗐으면, 여럿 중 그 하나만 남긴다.
      // 여러 개를 함께 끌 수 있으려면 누를 때는 선택을 줄이지 않아야 하므로
      // 판단이 여기로 온다.
      //
      // 이동량이 0인지가 아니라 **손이 움직였는지**로 가른다. 격자를 벗어나 있던
      // 것은 제자리로 돌아오느라 이동량이 0이 아니어서, 그걸로 재면 클릭만 해도
      // 옮겨진 것으로 친다.
      if (!d.moved) {
        if (d.hitId) select([d.hitId]);
        return;
      }
      let { dx, dy } = d;
      // 딱 하나 고른 텍스트·이미지를 옮기는 중이면, 그 가운데가 정렬선
      // 근처로 오는 순간 정확히 그 줄에 맞춘다. 여럿을 한꺼번에 옮길
      // 때는(lone이 없다) 어느 것 기준으로 맞출지 애매해 손대지 않는다.
      if (lone && (isText(lone) || isImage(lone))) {
        const b = boxOf(lone);
        const moved = { ...b, x: b.x + dx };
        const centered = centerOnLogoLine(moved, logoLineX);
        dx += centered.x - moved.x;
      }
      moveSelected(dx, dy);
      return;
    }

    if (d.kind === 'handle') {
      reshapeSelected(d.id, d.end, d.to);
      return;
    }

    if (d.kind === 'boxHandle') {
      const target = objects.find((o) => o.id === d.id);
      if (target && isText(target)) {
        const { box } = resizeTextBoxTo(target, d.anchor, d.to);
        resizeObject(d.id, box);
      } else if (target) {
        // 도형·이미지는 도트 한 칸까지 작아져도 된다 — 달력만 숫자 여러 칸이
        // 든 표라 그 밑으로 가면 못 알아보게 돼 기본값(MIN_BOX_SIZE)을 지킨다.
        const minSize = isShape(target) || isImage(target) ? MIN_FREE_BOX_SIZE : undefined;
        resizeObject(d.id, resizeBox(rotationDegOf(target), d.anchor, d.to, minSize));
      }
      return;
    }

    if (d.kind === 'textbox') {
      // 한 점에서 뗐으면 그 점이 든 칸 하나, 끌었으면 걸친 칸 전체가 상자다.
      const same = d.from.x === d.to.x && d.from.y === d.to.y;

      if (tool === 'calendar' || tool === 'image') {
        // 표처럼 실제로 끌어야 만들어진다 — 그냥 눌렀다 뗀 칸 하나는 너무 작다.
        if (same) return;
        const box = {
          x: Math.min(d.from.x, d.to.x),
          y: Math.min(d.from.y, d.to.y),
          width: Math.abs(d.to.x - d.from.x),
          height: Math.abs(d.to.y - d.from.y),
        };
        if (tool === 'calendar') commitCalendar(box);
        // 이미지는 사진 없이 빈 채로 만든다 — 상자를 클릭하면 파일 선택
        // 창이 뜬다(ui/StyleBar의 ImageControls).
        else commitImage(box);
        return;
      }

      const box = same
        ? cellAt(lattice, d.from.x, d.from.y)
        : {
            x: Math.min(d.from.x, d.to.x),
            y: Math.min(d.from.y, d.to.y),
            width: Math.abs(d.to.x - d.from.x),
            height: Math.abs(d.to.y - d.from.y),
          };
      if (!box) return;

      // 달 — 누른 칸 하나(끌었으면 걸친 칸 전체) 가운데에 그 날의 달을 놓는다.
      if (tool === 'moon') {
        commitMoon(box);
        return;
      }

      if (tool === 'field') {
        // 기준일 없는 D-day는 값이 빈칸이라 놓으면 보이지 않는 칸이 된다 — 먼저 정하게 한다.
        if (fieldDraft.kind === 'dday' && !fieldDraft.target) {
          showToast('D-day 기준일을 먼저 정해 주세요(왼쪽 AutoField 패널).');
          return;
        }
        // 타이핑 없이 바로 확정한다. 순번은 패널의 ‘이 페이지의 n번째’, ‘찍을 때마다 다음
        // 날짜로’를 켜 두면 하나씩 늘어난다 — 위클리 7칸을 차례로 찍으면 저절로 0~6이 된다.
        // 종류·형식은 AutoField 패널에서 미리 골라둔 것(fieldDraft)을 쓴다.
        const field = { offset: fieldNext.offset, ...fieldDraft };
        // 글자는 비워 둔다 — 보이는 값은 언제나 날짜를 채워서 그린다(core/work). 예전처럼
        // 자리표시(⟨+D0⟩)를 넣으면 기본 글꼴에 없는 ⟨⟩ 때문에 ‘안 보이는 글자’ 안내가 잘못 떴다.
        commitText({ ...box, text: '', field, ...draftStyle });
        if (fieldNext.advance) setFieldNext({ offset: fieldNext.offset + 1 });
        return;
      }

      setEditing({ box, text: '', style: draftStyle });
      return;
    }

    if (d.kind === 'marquee') {
      const inside = objects.filter((o) => !isLocked(o) && objectInRect(o, rectOf(d.from, d.to)));
      select(e.shiftKey ? merge(selectedIds, inside.map((o) => o.id)) : inside.map((o) => o.id));
      return;
    }

    /*
     * 표 — 끈 범위의 안쪽 칸 선까지 전부 채운다. 테두리는 도형(둥글기가
     * 되는) 하나로, 안쪽 칸 선은 그대로 선으로 나눈다(tableSplit) —
     * 테두리만 모서리를 둥글게 할 수 있어야 한다는 요청이었다.
     *
     * 표는 최소 2칸은 돼야 의미가 있으므로, 끌지 않고 그냥 눌렀다 뗐으면
     * (점 하나) 아무 일도 하지 않는다 — 그리기 도구의 "점 찍고 다음 점"
     * 같은 대기 상태를 두지 않는다.
     */
    if (tool === 'table') {
      if (d.from.x !== d.to.x || d.from.y !== d.to.y) {
        const split = tableSplit(lattice, d.from, d.to);
        if (split) {
          // 테두리(도형)와 안쪽 칸 선을 한 번에 만들고, 같이 고른다 —
          // 테두리만 고르면 초록 선택 테두리가 겉에만 둘러져 다르게 보인다.
          commitTable(split.border, split.innerLines);
        } else {
          // 한 줄로만 끌었다(테두리조차 없다) — 선 하나 그대로.
          drawLines(tableLines(lattice, d.from, d.to));
        }
      }
      return;
    }

    /*
     * 체크박스 — 표와 같은 몸짓(칸 범위 드래그)이지만, 안쪽 칸 선 대신
     * 칸마다 하나씩 아이콘을 찍는다. 표와 같은 이유로 끌지 않으면(점
     * 하나) 아무 일도 하지 않는다 — 1칸이라도 그 칸의 두 대각 모서리를
     * 끌어야 찍힌다.
     */
    if (tool === 'checkbox') {
      if (d.from.x !== d.to.x || d.from.y !== d.to.y) {
        // 칸 그대로 저장한다 — 아이콘 자리로 줄이지 않는다. 줄인 상자를
        // 그대로 저장하면 나중에 옮길 때 격자 스냅이 그 줄어든 모서리를
        // 도트에 붙여버려서, 칸 가운데 있어 보이게 하던 여백이 사라지고
        // 아이콘이 도트에 달라붙어 보인다. 실제 아이콘은 그릴 때만
        // core/checkbox의 checkboxIconBox로 줄인다(InsertView·PDF 공통).
        commitCheckboxes(cellsIn(lattice, d.from, d.to));
      }
      return;
    }

    // 그리기 — 같은 점에서 뗐으면 클릭(선을 잇는다), 다른 점이면
    // 끌기(사각형 = 도형 하나). 도형은 이 그리기 도구에 합쳐져 있다,
    // 따로 도구가 없다 — 끌어서 나온 사각형은 둥글기가 0(각짐)이어도
    // 그냥 도형 하나로 다뤄서, 나중에 골라 둥글기를 바로 바꿀 수 있다.
    const moved = d.from.x !== d.to.x || d.from.y !== d.to.y;
    if (moved) {
      // 한 축으로만 끌었으면(가로나 세로로 일직선) 폭 또는 높이가 0인
      // 도형이 아니라 선이어야 한다 — 안 그러면 화면엔 선처럼 보이는데
      // 실제로는 높이(또는 폭) 0인 도형이라, 나중에 손잡이를 끌면 진짜
      // 네모로 자란다("선이 면이 된다"는 신고가 이 경로였다).
      if (d.from.x === d.to.x || d.from.y === d.to.y) {
        drawLines([{ x1: d.from.x, y1: d.from.y, x2: d.to.x, y2: d.to.y }]);
        setPending(null);
        return;
      }
      commitShape({
        x: Math.min(d.from.x, d.to.x),
        y: Math.min(d.from.y, d.to.y),
        width: Math.abs(d.to.x - d.from.x),
        height: Math.abs(d.to.y - d.from.y),
      });
      setPending(null);
      return;
    }
    if (pending) {
      drawLines([{ x1: pending.x, y1: pending.y, x2: d.to.x, y2: d.to.y }]);
      setPending(null);
    } else {
      setPending(d.to);
    }
  }

  /**
   * 속지 바깥(여백)에서 시작하는 드래그. 감싸기(마퀴)만 지원한다 — 도구가
   * select일 때만 뜻이 있고, 속지 안에서 시작한 클릭은 svg 자신의
   * onPointerDown이 이미 처리하므로 여기서는 건너뛴다.
   *
   * 손을 옮기고 떼는 나머지는 기존 onMove·onUp을 그대로 재사용한다 —
   * 어느 태그가 손잡이를 쥐었는지와 무관하게 dragRef만 보고 판단하기
   * 때문이다. svg에서 시작한 드래그도 이 div까지 거품처럼 올라오지만,
   * 그때는 이미 dragRef가 비어 있어 조용히 아무 일도 하지 않는다.
   */
  function onOutsideDown(e: React.PointerEvent) {
    if (tool !== 'select') return;
    if (svgRef.current?.contains(e.target as Node)) return;
    const raw = rawMm(e);
    if (!raw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!e.shiftKey) select([]);
    setDragBoth({ kind: 'marquee', from: raw, to: raw });
  }

  /*
   * 더블클릭 — 도구가 무엇이든 바로 글자를 쓸 수 있게 한다.
   *
   * 기존 글자를 더블클릭하면 고치기, 빈 칸을 더블클릭하면 새로 쓰기다.
   * 둘 다 도구를 'text'로 바꾼다. skipToolResetRef로 그 전환이 지금 막
   * 여는 입력을 지우지 않게 한다.
   */
  function onDoubleClickCanvas(e: React.MouseEvent) {
    const pe = e as unknown as React.PointerEvent;
    const raw = rawMm(pe);
    if (!raw) return;
    const hit = hitAt(svgRef.current, objects, raw);
    setPending(null);
    setDragBoth(null);

    if (hit && isText(hit) && hit.field) {
      select([hit.id]);
      return;
    }
    if (hit && isText(hit)) {
      if (tool !== 'text') {
        skipToolResetRef.current = true;
        setTool('text');
      }
      setEditing(editingFor(hit));
      return;
    }

    // 빈 이미지 상자를 더블클릭하면 파일 선택 창을 연다 — 글자
    // 도구로 바뀌지 않는다. 그리자마자 바로 열리면 여러 개를 잇달아
    // 그릴 때 방해가 돼서, 그리기와 파일 고르기를 분리했다.
    if (hit && isImage(hit) && !hit.imageId) {
      select([hit.id]);
      requestImagePick(hit.id);
      return;
    }

    if (tool !== 'text') {
      const cell = cellAt(lattice, raw.x, raw.y);
      if (!cell) return;
      skipToolResetRef.current = true;
      setTool('text');
      setEditing({ box: cell, text: '', style: draftStyle });
    }
  }

  /**
   * 비활성 쪽(따로 있는, 정적으로만 그려진 svg)의 pointerDown.
   *
   * 그리기 도구로 선의 첫 점(pending)을 찍어둔 채로 여기를 클릭하면 경계를
   * 넘어 선을 잇는다. 그 외에는 초점만 옮긴다 — 오늘까지의 탭 클릭과 같다.
   * 캔버스 자신의 CTM으로 좌표를 재는 것은 rawMm과 같은 방식이지만, 이
   * svg는 활성 쪽이 아니라서 rawMm(activeSide 기준)을 그대로 쓸 수 없다.
   *
   * **격자에 앉힌다.** 활성 쪽에서 선을 그을 때(onDown)는 늘
   * snapToLattice를 거치는데, 처음 이 함수를 짤 때 그걸 빠뜨려서 경계를
   * 넘는 선의 둘째 점만 격자에 안 붙고 클릭한 픽셀 그대로 박혔다 — 왼쪽은
   * 점에 딱 붙는데 오른쪽으로 갈수록 살짝 기울어 보이던 버그가 이거였다.
   *
   * stopPropagation을 꼭 해야 한다 — 안 그러면 이 클릭이 .editor-canvas의
   * onOutsideDown까지 거품처럼 올라가, select 도구일 때 활성 쪽 좌표계로
   * 엉뚱한 마퀴가 동시에 시작된다.
   */
  function onInactivePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.stopPropagation();
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      switchSide(inactiveSide);
      return;
    }
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(ctm.inverse());
    const snap = snapToLattice(inactiveLattice, local.x, local.y);

    if (tool === 'draw' && pending && snap) {
      completeCrossBoundaryLine(snap);
      return;
    }
    switchSide(inactiveSide);
  }

  /**
   * 비활성 쪽 위에서 마우스가 움직일 때 — 선을 잇는 중(pending)이면 활성
   * 쪽의 잇는 선 미리보기(hover)가 경계를 넘어서도 커서를 계속 따라가게 한다.
   *
   * hover는 activeSide 로컬 좌표다. 비활성 쪽의 로컬 좌표를, "경계에서 몇
   * mm 떨어졌는지"를 거쳐 activeSide 좌표계로 그대로 연장한 값(insert.width를
   * 넘거나 0보다 작아짐)으로 바꿔치기한다 — completeCrossBoundaryLine이
   * 두 좌표계를 잇는 것과 같은 방식이다.
   *
   * pending이 없을 때는(다른 도구, 또는 그냥 지나가는 중) 아무 일도 하지
   * 않는다 — 비활성 쪽은 평소엔 정적이다.
   */
  function onInactivePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!(tool === 'draw' && pending)) return;
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(ctm.inverse());
    const distFromBoundary = inactiveSide === 'back' ? insert.width - local.x : local.x;
    const activeLocalX = activeSide === 'back' ? insert.width + distFromBoundary : -distFromBoundary;
    setHover({ x: activeLocalX, y: local.y });
  }

  /**
   * 비활성 쪽 — 정적으로만 그린다(손댈 수 없다). 클릭하면
   * onInactivePointerDown이 초점을 옮기거나 경계를 넘는 선을 잇는다.
   *
   * 오버플로가 활성 쪽 위로 보이도록(예: 경계를 넘어가는 pending 선 미리보기),
   * 활성 쪽 svg를 항상 나중에 그려 위로 올린다 — CSS의 z-index로 한다
   * (뒷면이 활성일 땐 왼쪽 svg가 먼저라 그냥 두면 오른쪽 정적 앞면에 가려진다).
   */
  function renderInactiveCanvas() {
    return (
      <svg
        className={`insert-sheet inactive-canvas ${tool}`}
        viewBox={`0 0 ${insert.width} ${insert.height}`}
        width={insert.width * scale}
        height={insert.height * scale}
        onPointerDown={onInactivePointerDown}
        onPointerMove={onInactivePointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <rect x={0} y={0} width={insert.width} height={insert.height} className="sheet-bg" />
        <InsertView
          insert={insert}
          grid={inactiveGrid}
          objects={inactiveDisplay}
          safeZoneWidth={insert.punch.safeZoneWidth}
          mirror={inactiveSide === 'back'}
          calendarContext={calendarContextOf(inactiveFace, calendarRules)}
        />
        <PunchGuide
          width={insert.width}
          height={insert.height}
          punch={insert.punch}
          mirror={inactiveSide === 'back'}
        />
      </svg>
    );
  }

  const marquee = drag?.kind === 'marquee' ? rectOf(drag.from, drag.to) : null;
  // 표·체크박스를 끄는 중이면 미리보기도 안쪽 칸 선까지 함께 보여준다 —
  // 몇 칸짜리(체크박스면 몇 개가 찍힐지)를 손을 떼기 전에 알아야 한다.
  const ghost =
    drag?.kind === 'draw'
      ? tool === 'table' || tool === 'checkbox'
        ? tableLines(lattice, drag.from, drag.to)
        : rectLines(drag.from, drag.to)
      : null;
  const nudge = drag?.kind === 'move' ? drag : null;
  const grip = drag?.kind === 'handle' ? drag : null;
  const hiddenLineIds = hiddenLineIdsFor(objects, selectedIds, grip, nudge);
  const boxGrip = drag?.kind === 'boxHandle' ? drag : null;
  const textDrag = drag?.kind === 'textbox' ? drag : null;
  // 끄는 중인 상자의 미리보기.
  const textDragBox = textDrag && {
    x: Math.min(textDrag.from.x, textDrag.to.x),
    y: Math.min(textDrag.from.y, textDrag.to.y),
    width: Math.abs(textDrag.to.x - textDrag.from.x) || grid.spacing,
    height: Math.abs(textDrag.to.y - textDrag.from.y) || grid.spacing,
  };

  // 글자·자동 필드·달 도구에서 마우스가 올라간 칸. 어디에 쓰일지 미리 보여준다.
  // 이미 상자를 끄는 중이면 그 몸짓(textDrag)이 같은 자리를 대신 보여준다.
  const hoverCell =
    (tool === 'text' || tool === 'field' || tool === 'moon') && hover && !editing && !textDrag
      ? cellAt(lattice, hover.x, hover.y)
      : null;

  // 지금 그리는 것의 치수. 면이면 가로 × 세로, 선이면 길이(+몇 칸인지).
  const sizeLabel = (() => {
    if (drag?.kind === 'draw') {
      // 표·체크박스는 mm가 아니라 몇 칸인지가 더 궁금하다. 그리기(선·면)는 지금처럼 mm.
      if (tool === 'table' || tool === 'checkbox') {
        const { cols, rows } = tableSize(lattice, drag.from, drag.to);
        return tool === 'checkbox' ? `${cols * rows}개` : `${cols} × ${rows}칸`;
      }
      return sizeLabelOf(rectLines(drag.from, drag.to));
    }
    if (grip && lone && isLine(lone)) {
      const s = preview(lone, null, grip);
      return withCells(lattice, sizeLabelOf([s]), { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    }
    if (boxGrip && lone && isBoxResizable(lone)) {
      const b = previewBox(lone, boxGrip);
      return `${roundMm(b.width, 1)} × ${roundMm(b.height, 1)}mm`;
    }
    if (pending && hover) {
      return withCells(
        lattice,
        sizeLabelOf([{ x1: pending.x, y1: pending.y, x2: hover.x, y2: hover.y }]),
        pending,
        hover,
      );
    }
    return null;
  })();

  /*
   * 회전 보기(rotateView). 90·270도면 화면에 차지하는 자리가 가로세로
   * 바뀐다 — 이 바깥 상자(canvas-rotate-frame)에 바뀐 크기를 직접 주고
   * 가운데 두면, 안쪽(insert-sheets)은 원래 크기 그대로 자기 중심으로만
   * 돌면 된다. 0·180도는 자리가 그대로라 굳이 크기를 지정하지 않는다
   * (기존처럼 내용에 맞춰 저절로 정해지게 둔다).
   */

  return (
    <div className="editor">
      <div className="editor-bar">
        <div className="editor-bar-tools">
          <button
            className="ghost"
            onClick={deleteSelected}
            disabled={selectedIds.length === 0}
            title="Erase (Delete)"
          >
            Erase
          </button>
          <button
            className="ghost"
            onClick={lockSelected}
            disabled={selectedIds.length === 0}
            title="Locked objects can't be clicked or box-selected — safe from accidental edits later"
          >
            Lock
          </button>
          {lockedCount > 0 && (
            <button className="ghost" onClick={unlockAll} title="Unlock everything that's locked">
              {lockedCount} locked · Unlock all
            </button>
          )}
          <button
            className="ghost"
            onClick={groupSelected}
            disabled={selectedIds.length < 2}
            title="Group several into one — clicking any of them selects the whole group"
          >
            Group
          </button>
          {canUngroup && (
            <button
              className="ghost"
              onClick={ungroupSelected}
              title="Ungroup the selection"
            >
              Ungroup
            </button>
          )}
          <ScopeNote />
        </div>
        <div className="style-bar-slot" ref={setStylePanelSlot} />

        {/*
          속성 칸(StyleBar)은 더 이상 여기서 직접 그리지 않는다 — 왼쪽 ToolRail의
          탭 안(stylePanelSlot)으로 portal한다. 탭이 닫혀 있으면(고를 것도 쓰는
          중인 도구도 없으면) slot이 null이라 아무것도 안 그려진다 — 예전에
          여기 있던 "selectedIds.length > 0 || tool === ..." 조건과 같은 뜻이다.
        */}
        {stylePanelSlot &&
          createPortal(
            <StyleBar
              editing={editing}
              setEditingStyle={setEditingStyle}
              draftStyle={draftStyle}
              refocusText={refocusText}
            />,
            stylePanelSlot,
          )}
      </div>

      <div
        className="editor-canvas"
        onPointerDown={onOutsideDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <SpreadPreviews where="before" insert={insert} scale={scale} />
        <SpreadHeader />
        <div className="canvas-rotate-frame">
        <div className="insert-sheets">
        {(() => {
          /*
           * 칸 안에 실제로 그려지는 것 전부 — "속지" 모드에서는 이것이 곧
           * svg의 전체 내용이고, "용지" 모드에서는 활성 칸의 <g transform>
           * 안에 그대로 다시 쓰인다. 좌표는 항상 속지 로컬 mm다(0~insert.
           * width/height) — 용지 모드든 아니든 이 안의 JSX는 손댈 일이 없다,
           * rawMm이 이미 용지 좌표를 칸 안 좌표로 바꿔서 넘겨주기 때문이다.
           */
          const canvasContent = (
            <>
              <rect x={0} y={0} width={insert.width} height={insert.height} className="sheet-bg" />

              <InsertView
                insert={insert}
                grid={grid}
                objects={activeDisplay}
                safeZoneWidth={insert.punch.safeZoneWidth}
                calendarContext={calendarContextOf(activeFace, calendarRules)}
                // 뒷면이면 항상 뒤집는다. 뒤집는 축(좌우/상하)은 인쇄 화면에서
                // core/layout의 mirrorLayout이 정한다 — 편집 화면은 칸 하나만
                // 보여줄 뿐 용지 배치를 모르므로, 속지 자신의 가로축(구멍이 있는
                // 축)을 뒤집는다는 사실만 다루면 된다.
                mirror={activeSide === 'back'}
                // 고치는 중인 글자는 감춘다. 입력칸이 같은 자리에 겹쳐 있어서, 둘 다
                // 보이면 어느 게 지금 치는 내용인지 헷갈린다. 목록에서 빼지 않고
                // 감추기만 하는 이유는 InsertView의 hiddenId 주석에 있다.
                hiddenId={editing?.id}
                hiddenLineIds={hiddenLineIds}
              />

              <PunchGuide
                width={insert.width}
                height={insert.height}
                punch={insert.punch}
                mirror={activeSide === 'back'}
              />

              {/* 고른 것 표시. 옮기거나 끝점을 끄는 중이면 갈 자리에 미리 보여준다.
                  선은 선 자체를, 글자·이미지는 상자를 두른다 — 돌아가 있으면
                  테두리도 같은 만큼 돈다(글자·이미지 자신과 같은 축·각도). */}
              <g className="picked">
                {objects
                  .filter((o) => selectedIds.includes(o.id))
                  .map((o) => {
                    if (isLine(o)) {
                      const s = preview(o, nudge, grip);
                      return <line key={o.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
                    }
                    const raw = previewBox(o, boxGrip);
                    const b = { ...raw, x: raw.x + (nudge?.dx ?? 0), y: raw.y + (nudge?.dy ?? 0) };
                    const rot = rotationDegOf(o);
                    const rect = (
                      <rect
                        key={rot === 0 ? o.id : undefined}
                        x={b.x}
                        y={b.y}
                        width={b.width}
                        height={b.height}
                        className={
                          isImage(o)
                            ? 'image-picked'
                            : isCalendar(o) || isMoon(o) || activeFace?.fieldIds.includes(o.id)
                              ? 'auto-picked'
                              : undefined
                        }
                      />
                    );
                    if (rot === 0) return rect;
                    return (
                      <g key={o.id} transform={rotationOf(b, rot).svg}>
                        {rect}
                      </g>
                    );
                  })}
              </g>

              {/* 끝점 손잡이. 선 하나만 골랐을 때만 나온다. */}
              {lone &&
                isLine(lone) &&
                (() => {
                  const s = preview(lone, nudge, grip);
                  return (
                    <g className="handles">
                      <rect
                        x={s.x1 - HANDLE_SIZE / 2}
                        y={s.y1 - HANDLE_SIZE / 2}
                        width={HANDLE_SIZE}
                        height={HANDLE_SIZE}
                      />
                      <rect
                        x={s.x2 - HANDLE_SIZE / 2}
                        y={s.y2 - HANDLE_SIZE / 2}
                        width={HANDLE_SIZE}
                        height={HANDLE_SIZE}
                      />
                    </g>
                  );
                })()}

              {/*
                모서리 손잡이. 달력·이미지 하나만 골랐을 때만 나온다 — 끝점
                손잡이와 짝이다. 이미지가 돌아가 있으면 손잡이도 같이 돈
                자리에 그린다 — 안 그러면 눈에 보이는 모서리와 실제로 잡히는
                자리(boxHandleAt)가 어긋난다.
              */}
              {lone &&
                isBoxResizable(lone) &&
                (() => {
                  const b = previewBox(lone, boxGrip);
                  const rot = rotationDegOf(lone);
                  const toDisplay = rot === 0 ? null : rotationOf(b, rot);
                  const corners = [
                    { x: b.x, y: b.y },
                    { x: b.x + b.width, y: b.y },
                    { x: b.x, y: b.y + b.height },
                    { x: b.x + b.width, y: b.y + b.height },
                  ].map((c) => (toDisplay ? toDisplay.map(c) : c));
                  return (
                    <g className="handles">
                      {corners.map((c, i) => (
                        <rect
                          key={i}
                          x={c.x - HANDLE_SIZE / 2}
                          y={c.y - HANDLE_SIZE / 2}
                          width={HANDLE_SIZE}
                          height={HANDLE_SIZE}
                        />
                      ))}
                    </g>
                  );
                })()}

              {/* 지금 그리고 있는 것 */}
              {ghost?.map((l, i) => (
                <line key={i} {...segProps(l)} stroke={SNAP_COLOR} strokeWidth={0.3} />
              ))}
              {pending && hover && !drag && (
                <line
                  x1={pending.x}
                  y1={pending.y}
                  x2={hover.x}
                  y2={hover.y}
                  stroke={SNAP_COLOR}
                  strokeWidth={0.3}
                  strokeLinecap="round"
                />
              )}

              {/* 입력 중인 상자의 테두리. 어디에 쓰는 중인지 보여준다. */}
              {editing && (
                <rect
                  x={editing.box.x}
                  y={editing.box.y}
                  width={editing.box.width}
                  height={editing.box.height}
                  className="editing-box"
                />
              )}

              {marquee && (
                <rect
                  x={Math.min(marquee.x1, marquee.x2)}
                  y={Math.min(marquee.y1, marquee.y2)}
                  width={Math.abs(marquee.x2 - marquee.x1)}
                  height={Math.abs(marquee.y2 - marquee.y1)}
                  className="marquee"
                />
              )}

              {/* 글자 도구 — 어느 칸에 쓰일지 미리 보여준다. 그리기 도구의 초록 점과 짝이다. */}
              {hoverCell && (
                <rect
                  x={hoverCell.x}
                  y={hoverCell.y}
                  width={hoverCell.width}
                  height={hoverCell.height}
                  className="text-hover"
                />
              )}
              {textDragBox && (
                <rect
                  x={textDragBox.x}
                  y={textDragBox.y}
                  width={textDragBox.width}
                  height={textDragBox.height}
                  className={tool === 'image' ? 'image-drag' : 'text-drag'}
                />
              )}

              {/* 붙을 자리 미리보기. 도트를 꺼둬도 어디에 붙는지 보인다. */}
              {(tool === 'draw' || tool === 'table') && hover && (
                <circle cx={hover.x} cy={hover.y} r={SNAP_DOT_SIZE / 2} fill={SNAP_COLOR} />
              )}
              {pending && <circle cx={pending.x} cy={pending.y} r={SNAP_DOT_SIZE / 2} fill={SNAP_COLOR} />}

              {/* 지금 그리는 것의 치수. 커서 오른쪽에 붙는다. */}
              {sizeLabel && hover && (
                <text
                  x={hover.x + 9 / scale}
                  y={hover.y - 4 / scale}
                  fontSize={11 / scale}
                  strokeWidth={3 / scale}
                  fill={SNAP_COLOR}
                  className="size-label"
                >
                  {sizeLabel}
                </text>
              )}
            </>
          );

          const activeSvg = (
            <svg
              ref={svgRef}
              className={`insert-sheet active-canvas ${tool}`}
              viewBox={`0 0 ${insert.width} ${insert.height}`}
              width={insert.width * scale}
              height={insert.height * scale}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onPointerDown={onDown}
              onPointerUp={onUp}
              onPointerCancel={() => setDragBoth(null)}
              onDoubleClick={onDoubleClickCanvas}
            >
              {canvasContent}
            </svg>
          );

          // 뒷면이 없으면 앞면만 보여준다 — "아직 뒷면이 없습니다" 안내는
          // 없앴다(사용자 요청). 뒷면은 도구막대의 "뒷면 만들기" 버튼으로 만든다.
          if (!hasBack) return activeSvg;
          // 뒷면이 왼쪽, 앞면이 오른쪽 — activeSvg가 어느 쪽이냐에 따라 순서가 바뀐다.
          return activeSide === 'back' ? (
            <>
              {activeSvg}
              {renderInactiveCanvas()}
            </>
          ) : (
            <>
              {renderInactiveCanvas()}
              {activeSvg}
            </>
          );
        })()}

        {/*
          글자 입력칸.
          SVG 안에서는 글자를 고칠 수 없어서, 상자와 같은 자리에 진짜 입력칸을 겹쳐 놓는다.
          글꼴·크기·정렬을 똑같이 맞춰서 치는 동안에도 결과와 같아 보이게 한다.
        */}
        {editing && (
          <TextInput
            editing={editing}
            scale={scale}
            svg={svgRef.current}
            // 뒷면이 왼쪽, 앞면이 오른쪽(activeSvg 렌더 순서와 같은 규칙) — 앞면이
            // 활성이고 뒷면도 있으면 활성 캔버스가 한 칸만큼 오른쪽에 있다.
            canvasOffsetX={hasBack && activeSide === 'front' ? insert.width * scale : 0}
            inputRef={textInputRef}
            // 새로 만드는 중이든 이미 있던 글자를 고치는 중이든, 상자는 손을 댄
            // 그대로 둔다 — 글자는 상자를 넘칠 수 있다는 원칙 그대로다. 타이핑할
            // 때마다 상자가 저절로 커지거나 줄어들면 직접 그린 상자 크기가
            // 흐트러진다(사용자 피드백 — 칸을 지정해서 만들었는데 안 지켜졌다).
            onChange={(text) => setEditing({ ...editing, text })}
            onDone={finishEditing}
          />
        )}
        </div>
        </div>
        <SpreadPreviews where="after" insert={insert} scale={scale} />
        <AddPageButton />
      </div>

      <div className="editor-foot">
        <span>
          속지 {insert.width} × {insert.height}mm
        </span>
        <span>
          {grid.style === 'dot' ? '도트' : '칸'} {noGrid ? '없음' : `${cellCols} × ${cellRows}개`}
        </span>
        <MarginReadout lattice={lattice} insert={insert} />
        <span>그린 것 {objects.length}개</span>
        {selectedIds.length > 0 && <span>고른 것 {selectedIds.length}개</span>}
        {/*
          도구도 안 쓰고 고른 것도 없을 때(왼쪽 탭이 저절로 닫혀 있는 상태)
          안내가 아예 없으면 뭘 해야 할지 알 수 없다 — 예전엔 위쪽 도구줄에
          늘 떠 있던 문구였는데, 그 자리가 지금은 탭이 열렸을 때만 보이는
          속성 칸으로 바뀌면서 조용히 사라졌었다.
        */}
        {tool === 'select' && selectedIds.length === 0 && (
          <span className="foot-hint">
            {noGrid
              ? '격자가 없어 그릴 수 없습니다. 도트 간격을 줄이세요.'
              : '클릭해서 고르고, 빈 곳에서 끌어 여러 개를 감쌉니다.'}
          </span>
        )}
        {/*
          여기서부터 오른쪽 끝 — 왼쪽은 "무엇이 있나", 오른쪽은 "어디를
          보고 있나"다(디자인의 줄 나눔 그대로).
        */}
        <div className="status-gap" />
        {/*
          옮기는 중이면 얼마나 옮겼는지 띄운다. ⌘로 격자를 푸는 기능은 눌러보기
          전에는 있는지조차 알 수 없으므로, 여기서 지금 어느 쪽인지 알려준다.
        */}
        {nudge ? (
          <span className={nudge.free ? 'accent' : undefined}>
            옮김 {roundMm(nudge.dx, 2)} , {roundMm(nudge.dy, 2)} mm
            {nudge.free ? ' · 격자 해제' : ' · ⌘로 격자 해제'}
          </span>
        ) : (
          hover && (
            <span>
              {roundMm(hover.x, 2)} , {roundMm(hover.y, 2)} mm
            </span>
          )
        )}
        <ViewToggles />
        <ZoomStepper zoom={zoom} onChange={setZoom} />
      </div>
    </div>
  );
}

/**
 * 글자 입력칸.
 *
 * SVG 안에서는 글자를 고칠 수 없다. 상자와 같은 자리에 진짜 `<textarea>`를 겹쳐 놓고,
 * 글꼴·크기·줄간격을 똑같이 맞춰서 치는 동안에도 결과와 같아 보이게 한다.
 *
 * **Enter는 그냥 줄바꿈이다.** 메모·할일목록처럼 여러 줄을 쓰는 일이 흔해서
 * textarea 기본 동작 그대로 뒀다 — 확정은 Esc를 누르거나 바깥으로 포커스가
 * 나갈 때(onBlur)뿐이다.
 *
 * 자리는 SVG의 크기·확대율에서 그대로 따라온다 — 확대와 스크롤을 우리가
 * 다시 계산하면 어긋난다. 다만 **캔버스가 왼쪽에서 얼마나 떨어져 있는지**
 * (canvasOffsetX)만은 호출한 화면이 직접 알려준다 — 화면 돌려보기
 * (rotateView, EditorTab)로 캔버스가 90/270도 돌아가 있으면 getBoundingClientRect
 * 같은 화면 기준 사각형은 가로·세로가 뒤바뀐 자리를 돌려주므로 쓸 수 없고,
 * 대신 몇 번째 칸인지(앞뒤 나란히 편집할 때 활성 쪽이 왼쪽·오른쪽 어느
 * 쪽인지)는 이미 호출한 화면이 알고 있는 값이라 다시 물을 필요가 없다.
 */
export function TextInput({
  editing,
  scale,
  svg,
  canvasOffsetX,
  inputRef,
  onChange,
  onDone,
}: {
  editing: Editing;
  scale: number;
  svg: SVGSVGElement | null;
  /** 지금 고치는 캔버스가 .insert-sheets 왼쪽 끝에서 떨어진 거리(px). 앞뒤가 나란한 화면에서만 0이 아니다. */
  canvasOffsetX: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const ref = inputRef;
  const { box } = editing;
  // 치는 동안에도 확정한 뒤와 같은 글꼴로 보여야 한다.
  const userFonts = useStore((s) => s.userFonts);
  const size = editing.style.size ?? TEXT_SIZE;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 고치기 시작할 때 커서를 끝에 둔다. 안 그러면 전체가 선택되어 한 글자만
    // 눌러도 다 지워질 수 있다.
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  /**
   * 잰 크기(`measured`, 아래)로 꼭 맞춰 칸을 키우면 실제로 브라우저가
   * `<textarea>`를 그릴 때는 그보다 살짝(1px 안팎) 모자랄 수 있다 — 캔버스로
   * 재는 것과 실제 글자폭 계산이 완전히 같지 않아서다(특히 한글, 굵게, 등록한
   * 글꼴). 모자라면 `<textarea>`는 `overflow: visible`을 못 받는 태생 때문에
   * 그 즉시 스크롤이 생긴다(위 설명 참고) — 게다가 한쪽(가로)에서 스크롤바가
   * 생기면 그만큼 반대쪽(세로) 칸이 줄어 거기에도 스크롤바가 번진다(실제로
   * 재현: 글자가 늘수록 모자라는 양도 늘어, 고정된 여유 몇 mm로는 어느
   * 길이에서든 안전할 수 없었다).
   *
   * 그래서 미리 얼마나 넉넉히 잡을지 계산하지 않는다 — **매번 그린 뒤
   * 실제로 스크롤이 생겼는지 재서, 생겼으면 그 모자란 만큼만 더하고
   * 다시 그린다.** 어떤 글꼴·글자 수·확대 배율에서도 같은 방식으로
   * 맞는다. 글이나 글꼴이 바뀌면(줄어들 수도 있으니) 처음부터 다시 잰다.
   */
  const [extraPx, setExtraPx] = useState({ w: 0, h: 0 });
  useEffect(() => {
    setExtraPx({ w: 0, h: 0 });
  }, [editing.text, size, editing.style.lineHeight, editing.style.bold, editing.style.font]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dw = Math.max(0, el.scrollWidth - el.clientWidth);
    const dh = Math.max(0, el.scrollHeight - el.clientHeight);
    if (dw > 0 || dh > 0) setExtraPx((e) => ({ w: e.w + dw, h: e.h + dh }));
  });

  if (!svg) return null;
  const baseLeft = canvasOffsetX;
  const baseTop = 0;
  // 회전한 글자를 고치는 중이면 입력칸도 같이 돌아가 있어야 한다 — 안 그러면
  // 타이핑하는 자리와 실제로 저장될 자리가 달라 보여서 "상자 밖에서 고치는"
  // 것처럼 보인다. CSS의 rotate() 부호는 core/objects의 rotationOf가 화면에
  // 쓰는 SVG matrix()와 같은 손 방향이다(둘 다 브라우저 좌표계라 그대로 맞는다).
  const rotate = rotateOf(editing.style);
  const cssRotate = rotate === 90 ? 90 : rotate === 270 ? -90 : 0;

  const left = baseLeft + box.x * scale;
  const top = baseTop + box.y * scale;
  const family = familyOf(userFonts, editing.style.font);
  const lineHeight = editing.style.lineHeight ?? size;

  /*
   * 타이핑 중인 칸의 크기는 상자(box)가 아니라 **지금 친 글자가 실제로
   * 차지하는 크기**로 키운다.
   *
   * `<textarea>`는 CSS `overflow: visible`을 받아주지 않는다 — 브라우저가
   * 조용히 `auto`(스크롤)로 바꿔버려서, 상자보다 긴 글은 넘치는 게 아니라
   * 상자 안에 잘린 채 스크롤된다(작은 상자에 여러 글자를 치면 거의 안
   * 보이던 문제의 진짜 원인 — 2026-08-22, 실제로 재현해서 확인했다).
   * 상자 자체를 여기서 늘리면 클릭할 것도 없이 항상 다 보인다.
   *
   * **저장되는 상자(box)는 그대로다** — 여기서 만드는 값은 화면에 보여줄
   * 칸의 크기일 뿐, `onDone`이 커밋하는 객체는 여전히 손을 댄 상자 그대로다
   * (상자 크기 조정 때 글자가 따라 커지지 않게 한 것과 같은 원칙 — 그
   * 반대 방향도 상자가 저절로 안 바뀌어야 한다).
   */
  const spacing = letterSpacingOfText(editing.style);
  const measured = measureTextBox(editing.text, size, lineHeight, family, spacing);
  // extraPx는 위 useLayoutEffect가 실측으로 채운다 — 처음 그릴 때는 0이다.
  const liveWidth = Math.max(box.width, measured.width + extraPx.w / scale);
  const liveHeight = Math.max(box.height, measured.height + extraPx.h / scale);

  const textarea = (
    <textarea
      ref={ref}
      className="text-input"
      value={editing.text}
      style={{
        left,
        top,
        width: liveWidth * scale,
        height: liveHeight * scale,
        fontSize: size * scale,
        fontFamily: family,
        fontWeight: FONT_WEIGHT.regular,
        letterSpacing: spacing ? `${spacing * scale}px` : undefined,
        // 가짜 굵게 — 다 쓴 뒤 그려질 모습(core/text의 fakeBoldStrokeOf)과 같게 테두리를 덧그린다.
        WebkitTextStroke: editing.style.bold ? `${fakeBoldStrokeOf(editing.style, size) * scale}px currentColor` : undefined,
        // 이 글자에 새겨둔 줄 간격을 그대로 쓴다 — 타이핑 중과 커밋 후가
        // 같은 자리로 보여야 한다.
        lineHeight: `${lineHeight * scale}px`,
        transform: cssRotate ? `rotate(${cssRotate}deg)` : undefined,
        transformOrigin: cssRotate ? 'center' : undefined,
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          // 확정 직후 이 키가 window까지 거품처럼 올라가 ToolRail의 Escape
          // 처리(방금 골라진 것에 맞춰 막 열린 탭)까지 함께 닫아버리지 않게 막는다.
          e.stopPropagation();
          onDone();
          return;
        }
        // Enter는 이제 그냥 줄바꿈이다(textarea 기본 동작에 맡긴다) — 막지
        // 않는다. 확정은 Esc를 누르거나 바깥으로 포커스가 나갈 때(onBlur)뿐이다.
        e.stopPropagation();
      }}
      /*
       * 포커스가 **바깥으로** 나갈 때만 확정한다.
       *
       * 속성 막대의 드롭다운을 누르는 것도 입력칸에게는 포커스를 잃는 일이다.
       * 그때 확정해버리면 막대가 이미 `쓰는 중`에서 `쓸 글자`로 바뀌어 있어서,
       * 크기를 골라도 방금 쓴 글이 아니라 다음에 쓸 글에 걸렸다.
       *
       * 막대 안쪽으로 옮겨가는 포커스는 여전히 이 글자를 고치는 중이라고 본다.
       * 캔버스나 다른 화면으로 나가면(relatedTarget이 막대 밖이거나 없으면) 확정한다.
       */
      onBlur={(e) => {
        if ((e.relatedTarget as HTMLElement | null)?.closest('.editor-bar')) return;
        onDone();
      }}
    />
  );

  return textarea;
}

/** 이미지 파일의 원본 가로세로(px). 못 읽으면(깨진 파일 등) null. */
function naturalSizeOf(url: string | undefined): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * "이미지" 탭 안 — 자주 쓰는 이미지 썸네일 그리드. 클릭하면 그 자리에서
 * 바로 속지 가운데에 적당한 크기로 놓는다(`commitImage`+`styleImage`를
 * 이어 부른다 — 둘 다 지금 편집 중인 쪽을 그림자 유무로 알아서 찾는다,
 * store.ts의 `activeObjects` 참고). 드래그로 빈 상자를 그려 나중에 고르는
 * 기존 방식(ObjectControls의 ImageControls)도 그대로 남아 있다 — 도구
 * 자체는 여전히 'image'라 캔버스에 바로 끌 수 있다.
 */
export function ImageCategoryBody() {
  const userImages = useStore((s) => s.userImages);
  const addUserImage = useStore((s) => s.addUserImage);
  const commitImage = useStore((s) => s.commitImage);
  const styleImage = useStore((s) => s.styleImage);
  const insert = useInsert();
  const side = useSide();
  const hasBack = useHasBack();
  // 편집 화면 본체와 같은 규칙 — 뒷면 자리에 면이 없으면 앞면이 지금 그리는 쪽이다.
  const activeSide: Side = hasBack ? side : 'front';
  const grid = useDotGrid(activeSide);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const usable = userImages.filter((i) => i.url);

  /**
   * `url`은 방금 등록해 아직 `userImages`(store) 반영 전인 이미지를 놓을 때
   * 직접 넘긴다(`take` 참고) — `addUserImage` 직후에는 이 컴포넌트가 든
   * `userImages`가 아직 그 이미지를 못 봐서, id만으로 찾으면 못 찾는다.
   */
  async function placeCentered(imageId: string, url?: string) {
    // 속지의 60% 안에, 원본 가로세로 비율을 살려 최대한 크게 놓는다.
    // 정확한 크기는 놓은 뒤 손잡이로 다시 조절해도 된다 — 이건 시작점일
    // 뿐이다. 비율을 몰라야(불러오기 실패 등) 이 60%×60% 사각형 자체의
    // 비율로 되돌아간다(예전과 같은 결과).
    const maxWidth = insert.width * 0.6;
    const maxHeight = insert.height * 0.6;
    const natural = await naturalSizeOf(url ?? userImages.find((i) => i.id === imageId)?.url);
    const ratio = natural ? natural.width / natural.height : maxWidth / maxHeight;
    const fit =
      maxWidth / maxHeight > ratio
        ? { width: maxHeight * ratio, height: maxHeight }
        : { width: maxWidth, height: maxWidth / ratio };

    // **놓인 자리는 도트 위여야 한다.** 그냥 가운데 계산(나누기 2)만
    // 하면 도트 간격의 배수가 아닌 자리에 떨어진다 — 그러면 그 뒤로
    // 손잡이를 아무리 도트에 맞춰 끌어도, 반대쪽 모서리가 이미 어긋나
    // 있어서 크기가 늘 어중간해진다. 화면(EditorTab 본체)이 손잡이를
    // 끌 때 쓰는 것과 같은 격자(gridArea·gridLattice)로 자리부터 맞춘다.
    const lattice = gridLattice(
      gridArea(insert, grid, insert.punch.safeZoneWidth, activeSide === 'back'),
      grid.spacing,
      grid.minMargin,
      grid.toEdge,
    );
    const roundToGrid = (v: Mm) =>
      grid.spacing > 0 ? Math.max(grid.spacing, Math.round(v / grid.spacing) * grid.spacing) : v;
    const width = roundToGrid(fit.width);
    const height = roundToGrid(fit.height);
    const centered = { x: (insert.width - width) / 2, y: (insert.height - height) / 2 };
    const { x, y } = snapToLattice(lattice, centered.x, centered.y) ?? centered;
    commitImage({ x, y, width, height });
    styleImage(imageId);
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const name = file.name.replace(/\.[^.]+$/, '');
      const orphan = userImages.find((i) => i.name === name && !hasImage(i.id));
      const image = await registerImage(file, orphan?.id);
      addUserImage(image);
      await placeCentered(image.id, image.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 읽지 못했습니다');
    }
  }

  return (
    <>
      {usable.length === 0 ? (
        <p className="tool-panel-note">아직 자주 쓰는 이미지가 없습니다. 파일을 불러오면 다음부터 여기 뜹니다.</p>
      ) : (
        <ImageThumbGrid images={usable} onPick={placeCentered} />
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button className="ghost tool-panel-add-file" onClick={() => fileRef.current?.click()} title={error ?? undefined}>
        Upload
      </button>
    </>
  );
}

/**
 * 확대 배율 −/+ 버튼. ZOOMS 목록을 한 칸씩 오간다 — 편집 화면·인쇄하기가 함께 쓴다.
 *
 * 인쇄하기 탭은 "화면에 맞춤"(fit)도 고를 수 있다 — 그 상태에서는 100%를 기준으로
 * 한 칸 움직인 값을 준다(다음 클릭부터는 그 구체적인 배율로 이어간다).
 */
export function ZoomStepper({
  zoom,
  onChange,
}: {
  zoom: number | 'fit';
  onChange: (z: number) => void;
}) {
  const idx = zoom === 'fit' ? -1 : ZOOMS.indexOf(zoom);
  const i = idx === -1 ? ZOOMS.indexOf(100) : idx;
  return (
    <div className="zoom-stepper">
      <button className="ghost" onClick={() => onChange(ZOOMS[Math.max(0, i - 1)])} disabled={i <= 0} title="축소">
        −
      </button>
      <span className="zoom-readout">{zoom === 'fit' ? '맞춤' : `${ZOOMS[i]}%`}</span>
      <button
        className="ghost"
        onClick={() => onChange(ZOOMS[Math.min(ZOOMS.length - 1, i + 1)])}
        disabled={i >= ZOOMS.length - 1}
        title="확대"
      >
        +
      </button>
    </div>
  );
}

export function ToolBtn({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button className={`tool-btn ${on ? 'on' : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/* ────────────────────────── 리뉴얼: 여러 페이지 편집 ────────────────────────── */

/** 보일 면의 객체 — 팔레트 이름표를 실제 색으로 푼다(core/colors). 같은 면·같은 팔레트면 같은 참조. */
function useDisplayObjects(face: ResolvedFace | null, palette: ReturnType<typeof usePalette>): DiaryObject[] {
  return useMemo(
    () => (face ? (palette ? resolveObjectColors(face.objects, palette) : face.objects) : NO_OBJECTS),
    [face, palette],
  );
}
const NO_OBJECTS: DiaryObject[] = [];

/** 달력 객체가 그릴 달과 색 규칙 — InsertView는 연도와 0부터 센 달을 받는다. */
function calendarContextOf(
  face: ResolvedFace | null,
  rules: ColorRules | undefined,
): { year: number; page: number; rules?: ColorRules } | undefined {
  return face ? { year: face.month.year, page: face.month.month - 1, rules } : undefined;
}

/** 작업의 색 규칙을 실제 색으로 푼 것(달력 칸이 쓴다). 날짜 칸은 core/work가 이미 칠해 둔다. */
function useCalendarRules(palette: ReturnType<typeof usePalette>): ColorRules | undefined {
  const rules = useActiveWork()?.colorRules;
  return useMemo(() => (palette ? resolveRuleColors(rules, palette) : rules), [rules, palette]);
}

/**
 * 지금 무엇을 고치는 중인지 — 날짜 페이지에서는 ‘이 날짜만’, 원본 편집 중이면 전체에
 * 걸린다는 띠(세부계획 A4.6 2-1). 보통 페이지면 아무것도 안 보인다.
 */
function ScopeNote() {
  const work = useActiveWork();
  const cursor = useCursor();
  const face = useDisplayFace('front');
  const back = useDisplayFace('back');
  const side = useSide();
  const enterSourceEdit = useStore((s) => s.enterSourceEdit);
  const exitSourceEdit = useStore((s) => s.exitSourceEdit);
  const revertSelectedToSource = useStore((s) => s.revertSelectedToSource);
  const selectedIds = useStore((s) => s.selectedIds);
  const faces = useFaces();
  if (!work || !cursor) return null;

  if (cursor.source) {
    const count = faces.filter((f) => f.itemId === cursor.source?.itemId).length;
    const own = faces.filter((f) => f.itemId === cursor.source?.itemId && f.period);
    const first = own[0] && faceLabel(own[0], 0).split(' · ')[1];
    const last = own.length > 0 && faceLabel(own[own.length - 1], 0).split(' · ')[1];
    return (
      <div className="scope-note source">
        <span>
          ✎ 원본 편집 중 — {count}장{first ? `(${first}~${last})` : ''} 모두 바뀌어요
        </span>
        <button onClick={exitSourceEdit}>완료</button>
      </div>
    );
  }

  const current = side === 'back' ? back : face;
  if (!current?.period) return null;
  const label = faceLabel(current, faces.indexOf(current)).split(' · ')[1];
  // 고른 것 중 이 날짜에서 바꾼 것 — 고른 것에만 표시한다(고르지 않으면 화면이 인쇄물과 같게).
  const changed = changedIds(work, { kind: 'face', face: current }).filter((id) => selectedIds.includes(id));
  return (
    <div className="scope-note">
      <span>{label} · 이 날짜만 고치는 중</span>
      {changed.length > 0 && (
        <>
          <span className="scope-changed">● 고른 것 중 {changed.length}개를 이 날짜에서 바꿨어요</span>
          <button className="ghost" onClick={revertSelectedToSource}>
            원본으로 되돌리기
          </button>
        </>
      )}
      <button className="ghost" onClick={() => enterSourceEdit(current.itemId, current.period!.faceIndex)}>
        원본 편집
      </button>
    </div>
  );
}

/** 면 하나를 정적으로 그린다 — 지금 고르지 않은 펼침면의 미리보기. */
function StaticFace({
  face,
  insert,
  scale,
  mirror,
  onPick,
}: {
  face: ResolvedFace;
  insert: InsertSetting;
  scale: number;
  mirror: boolean;
  onPick: () => void;
}) {
  const palette = usePalette();
  const calendarRules = useCalendarRules(palette);
  const objects = useDisplayObjects(face, palette);
  return (
    <svg
      className="insert-sheet static-face"
      viewBox={`0 0 ${insert.width} ${insert.height}`}
      width={insert.width * scale}
      height={insert.height * scale}
      onPointerDown={(e) => {
        // 편집 영역 바깥 감싸기(onOutsideDown)로 번지지 않게 한다.
        e.stopPropagation();
        onPick();
      }}
    >
      <rect x={0} y={0} width={insert.width} height={insert.height} className="sheet-bg" />
      <InsertView
        insert={insert}
        grid={face.background as DotGrid}
        objects={objects}
        safeZoneWidth={insert.punch.safeZoneWidth}
        mirror={mirror}
        calendarContext={calendarContextOf(face, calendarRules)}
      />
      <PunchGuide width={insert.width} height={insert.height} punch={insert.punch} mirror={mirror} />
    </svg>
  );
}

/**
 * 지금 펼침면 앞(before)·뒤(after)의 다른 펼침면들. 누르면 그 펼침면으로 간다 —
 * 세로로 이어진 페이지들 중 하나만 손이 닿고 나머지는 그림이다. 원본 편집 중에는
 * 원본 하나만 보이므로 그리지 않는다.
 */
function SpreadPreviews({ where, insert, scale }: { where: 'before' | 'after'; insert: InsertSetting; scale: number }) {
  const cursor = useCursor();
  const spreads = useSpreads();
  const faces = useFaces();
  const goTo = useStore((s) => s.goTo);
  if (!cursor || cursor.source) return null;
  const list = spreads
    .map((sp, i) => ({ sp, i }))
    .filter(({ i }) => (where === 'before' ? i < cursor.spread : i > cursor.spread));
  return (
    <>
      {list.map(({ sp, i }) => (
        <div key={i} className="spread-row">
          <FaceLabels spread={sp} faces={faces} />
          <div className="spread-sheets">
            {sp.map((faceIndex, k) => {
              const face = faceIndex === null ? null : faces[faceIndex];
              const side: Side = k === 0 ? 'back' : 'front';
              return face ? (
                <StaticFace
                  key={face.key}
                  face={face}
                  insert={insert}
                  scale={scale}
                  mirror={side === 'back'}
                  onPick={() => goTo(i, side)}
                />
              ) : (
                <div key={k} className="spread-gap" style={{ width: insert.width * scale }} />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/** 펼침면 위의 이름표 줄 — 면마다 이름과 페이지 버튼. */
function FaceLabels({ spread, faces }: { spread: [number | null, number | null]; faces: ResolvedFace[] }) {
  return (
    <div className="spread-labels">
      {spread.map((faceIndex, k) =>
        faceIndex === null ? (
          <span key={k} className="face-label empty" />
        ) : (
          <FaceActions key={k} face={faces[faceIndex]} index={faceIndex} />
        ),
      )}
    </div>
  );
}

/** 지금 펼침면의 이름표 줄. */
function SpreadHeader() {
  const cursor = useCursor();
  const spreads = useSpreads();
  const faces = useFaces();
  if (!cursor) return null;
  if (cursor.source) return <div className="spread-labels"><span className="face-label">원본</span></div>;
  const sp = spreads[cursor.spread];
  return sp ? <FaceLabels spread={sp} faces={faces} /> : null;
}

/**
 * 면 하나의 이름과 페이지 버튼(세부계획 A11: 페이지 가까이에 복제·이동·삭제).
 * 날짜 묶음의 면이면 버튼은 묶음 전체에 걸린다 — 그래서 이름에 몇 장짜리인지 적는다.
 */
function FaceActions({ face, index }: { face: ResolvedFace; index: number }) {
  const work = useActiveWork();
  const faces = useFaces();
  const duplicateItemAt = useStore((s) => s.duplicateItemAt);
  const removeItemAt = useStore((s) => s.removeItemAt);
  const moveItemTo = useStore((s) => s.moveItemTo);
  const enterSourceEdit = useStore((s) => s.enterSourceEdit);
  if (!work) return null;
  const itemIndex = work.items.findIndex((i) => i.id === face.itemId);
  const item = work.items[itemIndex];
  const dated = item?.kind === 'dated';
  const groupSize = dated ? faces.filter((f) => f.itemId === face.itemId).length : 1;
  return (
    <span className="face-label">
      <span className="face-label-name">{faceLabel(face, index)}</span>
      <span className="face-label-actions">
        {dated && face.period && (
          <button className="ghost" title="원본 편집 — 이 묶음의 모든 날짜가 바뀝니다" onClick={() => enterSourceEdit(face.itemId, face.period!.faceIndex)}>
            원본
          </button>
        )}
        <button className="ghost" title={dated ? `묶음(${groupSize}장) 복제` : '복제'} onClick={() => duplicateItemAt(itemIndex)}>
          ⧉
        </button>
        <button className="ghost" title="앞으로" disabled={itemIndex <= 0} onClick={() => moveItemTo(itemIndex, itemIndex - 1)}>
          ↑
        </button>
        <button
          className="ghost"
          title="뒤로"
          disabled={itemIndex >= work.items.length - 1}
          onClick={() => moveItemTo(itemIndex, itemIndex + 1)}
        >
          ↓
        </button>
        <button
          className="ghost danger"
          title={dated ? `묶음(${groupSize}장) 지우기` : '지우기'}
          onClick={() => {
            if (dated && !window.confirm(`날짜 묶음 ${groupSize}장이 모두 지워져요. 지울까요?`)) return;
            removeItemAt(itemIndex);
          }}
        >
          ×
        </button>
      </span>
    </span>
  );
}

/** 맨 아래 ‘+ 페이지 추가’. 맨 뒤에 붙는다 — 양면이면 앞·뒤 두 면(종이 한 장)이 함께 생긴다. */
function AddPageButton() {
  const cursor = useCursor();
  const work = useActiveWork();
  const addPagesAtEnd = useStore((s) => s.addPagesAtEnd);
  if (!cursor || cursor.source || !work) return null;
  return (
    <button className="add-page" onPointerDown={(e) => e.stopPropagation()} onClick={addPagesAtEnd}>
      + 페이지 추가{work.duplex ? ' (앞·뒤)' : ''}
    </button>
  );
}

/** 하단 상태 막대의 계산된 여백(세부계획 A5: 늘 보이게). 격자의 첫 점까지가 여백이다. */
function MarginReadout({ lattice, insert }: { lattice: ReturnType<typeof gridLattice>; insert: InsertSetting }) {
  if (lattice.xs.length === 0 || lattice.ys.length === 0) return null;
  const left = lattice.xs[0];
  const right = insert.width - lattice.xs[lattice.xs.length - 1];
  const top = lattice.ys[0];
  const bottom = insert.height - lattice.ys[lattice.ys.length - 1];
  const r = (v: Mm) => roundMm(v, 1);
  return (
    <span title="격자의 첫 점·끝 점까지의 거리">
      여백 ←{r(left)} →{r(right)} ↑{r(top)} ↓{r(bottom)}mm
    </span>
  );
}

/**
 * 하단 상태 막대의 보기 전환 — 양면/단면(작업의 값), 펼침면/일렬(탭마다 보기, 기능후보 8),
 * 한눈에 보기(세부계획 A11).
 */
function ViewToggles() {
  const work = useActiveWork();
  const cursor = useCursor();
  const setView = useStore((s) => s.setView);
  const setDuplex = useStore((s) => s.setDuplex);
  const [overview, setOverview] = useState(false);
  if (!work || !cursor) return null;
  return (
    <>
      <label className="check foot-check" title="양면이면 면이 앞·뒤로 짝지어 인쇄돼요">
        <input type="checkbox" checked={work.duplex} onChange={(e) => setDuplex(e.target.checked)} />
        양면
      </label>
      {work.duplex && (
        <span className="seg">
          <button className={cursor.view === 'spread' ? 'on' : ''} onClick={() => setView('spread')} title="다이어리를 펼친 모습">
            펼침면
          </button>
          <button className={cursor.view === 'single' ? 'on' : ''} onClick={() => setView('single')} title="한 면씩 아래로">
            일렬
          </button>
        </span>
      )}
      <button className="ghost" onClick={() => setOverview(true)} title="모든 페이지 한눈에 보기">
        ⊞
      </button>
      {overview && <Overview onClose={() => setOverview(false)} />}
    </>
  );
}

/**
 * 한눈에 보기 — 모든 면을 작게 늘어놓고, 누르면 그 면으로 간다(세부계획 A11).
 * 순서 바꾸기·여러 장 고르기는 페이지 이름표의 버튼으로 한다(끌어 옮기기는 나중에).
 */
function Overview({ onClose }: { onClose: () => void }) {
  const faces = useFaces();
  const spreads = useSpreads();
  const insert = useInsert();
  const palette = usePalette();
  const calendarRules = useCalendarRules(palette);
  const goTo = useStore((s) => s.goTo);
  const scale = 140 / insert.height;
  return (
    <Modal title={`모든 페이지 · ${faces.length}면`} onClose={onClose} size="large">
      <div className="overview-grid">
        {faces.map((face, i) => {
          const spread = spreads.findIndex((sp) => sp.includes(i));
          const side: Side = spreads[spread]?.[0] === i ? 'back' : 'front';
          return (
            <button
              key={face.key}
              className="overview-item"
              onClick={() => {
                goTo(Math.max(0, spread), side);
                onClose();
              }}
            >
              <svg viewBox={`0 0 ${insert.width} ${insert.height}`} width={insert.width * scale} height={insert.height * scale}>
                <rect width={insert.width} height={insert.height} className="sheet-bg" />
                <InsertView
                  insert={insert}
                  grid={face.background as DotGrid}
                  objects={palette ? resolveObjectColors(face.objects, palette) : face.objects}
                  safeZoneWidth={insert.punch.safeZoneWidth}
                  mode="print"
                  calendarContext={calendarContextOf(face, calendarRules)}
                />
              </svg>
              <span>{faceLabel(face, i)}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
