import { useEffect, useRef, useState } from 'react';
import { cellAt, cellsIn, gridArea, gridLattice, tableLines, tableSize, tableSplit } from '../core/grid';
import { checkboxIconBox } from '../core/checkbox';
import { holeCenterX } from '../core/punch';
import { moveDelta, snapToLattice } from '../core/snap';
import { canRedo, canUndo } from '../core/history';
import {
  boundsOfObjects,
  boxOf,
  cleanStyle,
  distanceToSegment,
  imageRotateOf,
  isBoxResizable,
  isBoxShaped,
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
  type Box,
  type Corner,
  type DiaryObject,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import { FONT_WEIGHT, SNAP_COLOR, SNAP_DOT_SIZE, TEXT_SIZE } from '../core/style';
import { roundMm, type Mm } from '../core/units';
import {
  boldOf,
  displayText,
  fieldPlaceholder,
  lineHeightOf,
  newTextStyle,
  parseFieldText,
  rotateOf,
  sizeOf,
} from '../core/text';
import {
  useDotGrid,
  useHasBack,
  useInsert,
  useObjects,
  useSide,
  useStore,
  useTemplateKind,
  type Side,
} from '../store';
import { InsertView } from './InsertView';
import { NotebookMarginGuide } from './NotebookMarginGuide';
import { PunchGuide } from './PunchGuide';
import { StyleBar } from './StyleBar';
import {
  CalendarIcon,
  CheckboxIcon,
  CursorIcon,
  FieldIcon,
  ImageIcon,
  LineIcon,
  TableIcon,
  TextIcon,
} from './icons';
import { measureTextBox } from './measureText';
import { familyOf } from '../fonts/registry';
import { PX_PER_MM_AT_100, ZOOMS } from './pixels';
import {
  editingFor,
  merge,
  preview,
  previewBox,
  rectOf,
  segProps,
  sizeLabelOf,
  toggleId,
  DRAG_START,
  GRAB,
  HANDLE_GRAB,
  HANDLE_SIZE,
  type Drag,
  type Editing,
  type Point,
} from './gestures';

/** 상자 가운데가 로고 정렬선에서 이만큼 안이면 달라붙는다. */
const LOGO_LINE_SNAP: Mm = 3;
/** 방향키로 미세이동할 때 한 번에 움직이는 양. ⇧를 누르면 이 값의 10배다. */
const NUDGE_STEP: Mm = 0.5;
const NUDGE_STEP_SHIFT: Mm = 5;

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
export function EditorTab() {
  // 속지·격자·그린 것은 지금 고르고 있는 양식의, 지금 보는 쪽(앞/뒤)의 것이다.
  const insert = useInsert();
  const kind = useTemplateKind();
  const side = useSide();
  const hasBack = useHasBack();
  // 뒷면이 없으면 side가 어떻든 무조건 앞면이 활성이다 — 뒷면 없이 'back'
  // 상태가 남아 있어도(이론상만 가능하다) 방어한다. 앞뒤를 나란히 그리는
  // 지금 화면에서, "지금 그리기·선택이 실제로 향하는 쪽"이 activeSide다.
  const activeSide: Side = hasBack ? side : 'front';
  const inactiveSide: Side = activeSide === 'back' ? 'front' : 'back';
  // 격자는 앞뒤가 공유하는 값이라 side 없이 하나뿐이다 — 양쪽 다 이걸 쓴다.
  const grid = useDotGrid();
  const history = useObjects(activeSide);
  // 활성이 아닌 쪽은 그린 것만 따로다. 정적으로만 그린다(손댈 수 없다) —
  // 클릭하면 그쪽이 활성이 된다. 뒷면이 없으면 hasBack이 false라 이 값은
  // 애초에 안 쓰인다.
  const inactiveHistory = useObjects(inactiveSide);
  const setSide = useStore((s) => s.setSide);
  const addBack = useStore((s) => s.addBack);
  const removeBack = useStore((s) => s.removeBack);
  const copyFrontToBack = useStore((s) => s.copyFrontToBack);
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
  const moveSelected = useStore((s) => s.moveSelected);
  const reshapeSelected = useStore((s) => s.reshapeSelected);
  const commitText = useStore((s) => s.commitText);
  const commitCalendar = useStore((s) => s.commitCalendar);
  const commitImage = useStore((s) => s.commitImage);
  const requestImagePick = useStore((s) => s.requestImagePick);
  const commitShape = useStore((s) => s.commitShape);
  const commitTable = useStore((s) => s.commitTable);
  const commitCheckboxes = useStore((s) => s.commitCheckboxes);
  const resizeObject = useStore((s) => s.resizeObject);
  const textDraftStyle = useStore((s) => s.textDraftStyle);
  const fieldDraftFormat = useStore((s) => s.fieldDraftFormat);
  const userFonts = useStore((s) => s.userFonts);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [zoom, setZoom] = useState(100);
  const svgRef = useRef<SVGSVGElement>(null);

  /** 마우스가 붙을 자리 */
  const [hover, setHover] = useState<Point | null>(null);
  /** 선의 첫 점을 찍어둔 상태. 다음 클릭에서 선이 완성된다. */
  const [pending, setPending] = useState<Point | null>(null);
  /**
   * 자동 필드 도구에서 다음에 찍을 오프셋. 찍을 때마다 하나씩 늘어난다 —
   * 위클리 한 쪽의 7칸을 순서대로 찍으면 저절로 0~6이 매겨진다. 도구로
   * 새로 들어올 때마다 0부터 다시 센다.
   */
  const [nextFieldOffset, setNextFieldOffset] = useState(0);
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

  const objects = history.present;
  const lockedCount = objects.filter(isLocked).length;
  const lattice = gridLattice(
    gridArea(insert, grid, insert.punch.safeZoneWidth, activeSide === 'back'),
    grid.spacing,
    grid.minMargin,
    grid.toEdge,
  );
  // 비활성 쪽의 격자 — 경계를 넘어 잇는 선의 둘째 점을 그 쪽 격자에 앉히려고
  // 있다. 없으면(빈 뒷면 등) 그 점은 안 붙는다.
  const inactiveLattice = gridLattice(
    gridArea(insert, grid, insert.punch.safeZoneWidth, inactiveSide === 'back'),
    grid.spacing,
    grid.minMargin,
    grid.toEdge,
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

  /**
   * 텍스트·이미지 상자의 **가운데**가 정렬선 근처면 그 줄에 정확히 맞춘다.
   *
   * 끄는 동안의 두 점(from·to)을 각각 줄에 붙이면 안 된다 — 둘 다 같은
   * x로 고정되어 상자 폭이 0이 되어버린다. 그래서 폭·높이를 다 정한
   * **완성된 상자**를 놓고, 그 가운데 x만 검사해서 옮긴다 — 폭은 그대로
   * 두고 왼쪽 x만 밀어서 가운데를 줄에 맞춘다.
   */
  function centerOnLogoLine<T extends { x: Mm; width: Mm }>(box: T): T {
    const cx = box.x + box.width / 2;
    return Math.abs(cx - logoLineX) <= LOGO_LINE_SNAP ? { ...box, x: logoLineX - box.width / 2 } : box;
  }

  /**
   * 글자 상자를 손잡이로 조절하면, 세로(높이) 비율만큼 글자 크기도 같이
   * 바뀐다 — 달력이 상자 높이로 글자 크기를 정하는 것과 같은 생각이다.
   * 가로만 늘리거나 줄이면 글자 크기는 그대로고 줄바꿈 폭(여백)만
   * 바뀐다 — 자동 줄바꿈은 하지 않으므로 실제로 줄 수가 바뀌지는 않는다.
   *
   * **상자는 지금 글자가 실제로 필요로 하는 크기보다 작아지지 않는다.**
   * 새 글자 크기에서 다시 재는 대신, 지금(옮기기 전) 크기에서 잰 값을
   * 비율만큼 그대로 늘려 쓴다 — 자동 줄바꿈이 없어 줄 수가 바뀌지
   * 않으므로 필요한 크기는 글자 크기에 정확히 비례한다(재측정과 같은
   * 값이 나온다), 다시 젤 필요가 없다.
   */
  function resizeTextBox(
    t: TextObject,
    corner: Corner,
    to: Point,
  ): { box: Box; size: Mm; lineHeight: Mm | undefined } {
    const oldBox = boxOf(t);
    const rawBox = resizeBox(oldBox, corner, to, MIN_FREE_BOX_SIZE);
    const oldSize = sizeOf(t);
    const required = measureTextBox(
      displayText(t),
      oldSize,
      lineHeightOf(t),
      boldOf(t),
      familyOf(userFonts, t.font),
    );
    const heightRatio = rawBox.height / oldBox.height;
    const width = Math.max(rawBox.width, required.width * heightRatio);
    const height = Math.max(rawBox.height, required.height * heightRatio);
    // 최소 크기에 걸려 raw보다 커지면, resizeBox와 같은 규칙으로 고정된
    // 모서리(반대쪽)가 밀리지 않게 x·y도 그만큼 보정한다 — 예를 들어
    // 오른쪽(east) 손잡이를 끌 때는 왼쪽이 고정이라 x는 그대로여야 하는데,
    // 폭만 늘리고 x를 안 옮기면 왼쪽 손잡이(west) 쪽 상자가 오른쪽으로
    // 밀려난 것처럼 보였다.
    const x = corner.includes('w') ? rawBox.x - (width - rawBox.width) : rawBox.x;
    const y = corner.includes('n') ? rawBox.y - (height - rawBox.height) : rawBox.y;
    const box: Box = { x, y, width, height };
    return {
      box,
      size: oldSize * heightRatio,
      lineHeight: t.lineHeight !== undefined ? t.lineHeight * heightRatio : undefined,
    };
  }

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
    // 필드를 그대로 지킨다. 바뀌었으면 ⟨+D0⟩ 같은 패턴이 있는지 새로 본다
    // — 있으면 자동 필드로, 없으면(지웠으면) 평범한 글자로 확정한다.
    const field = cur.text === (cur.originalText ?? '') ? cur.field : (parseFieldText(cur.text) ?? undefined);
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
    // 자동 필드 도구로 들어올 때마다 0부터 다시 센다.
    if (tool === 'field') setNextFieldOffset(0);
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
      // 방향키로 미세이동. ⇧를 누르면 큰 걸음(NUDGE_STEP_SHIFT), 아니면
      // 작은 걸음(NUDGE_STEP)이다. ⌘·Ctrl과 함께면(브라우저 단축키일 수
      // 있어) 건드리지 않는다.
      if (!e.metaKey && !e.ctrlKey && selectedIds.length > 0) {
        const step = e.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
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

  /** 이 오브젝트 자신의 회전 각도. 글자·이미지만 돈다. */
  function rotationDegOf(o: DiaryObject): number {
    if (isText(o)) return rotateOf(o);
    if (isImage(o)) return imageRotateOf(o);
    return 0;
  }

  /**
   * 화면(회전 후) 좌표를 이 오브젝트의 원래(회전 전, 자기 상자 기준) 좌표로
   * 되돌린다. 클릭 판정·모서리 손잡이·크기조정을 전부 이 "되돌린 자리"
   * 기준으로 계산한다 — 그래야 core/objects의 `resizeBox` 같은 계산을 회전
   * 여부와 상관없이 그대로 쓸 수 있다. 반대로(보여줄 때) 돌리는 쪽은 그리는
   * 자리에서 `rotationOf`를 직접 쓴다 — 크기조정 중에는 상자가 저장된
   * 값과 다를 수 있어(미리보기), 이 오브젝트의 저장된 상자가 아니라
   * **그 순간의 상자**를 축으로 돌려야 하기 때문이다.
   */
  function toLocal(o: DiaryObject, p: Point): Point {
    const rot = rotationDegOf(o);
    return rot === 0 ? p : rotationOf(boxOf(o), -rot).map(p);
  }

  function handleAt(p: Point): { id: string; end: 1 | 2 } | null {
    if (!lone || !isLine(lone)) return null;
    const d1 = Math.hypot(p.x - lone.x1, p.y - lone.y1);
    const d2 = Math.hypot(p.x - lone.x2, p.y - lone.y2);
    if (d1 <= HANDLE_GRAB && d1 <= d2) return { id: lone.id, end: 1 };
    if (d2 <= HANDLE_GRAB) return { id: lone.id, end: 2 };
    return null;
  }

  /**
   * `handleAt`과 달리 딱 하나 고른 것(lone)에 매이지 않는다 — 그리기 도구는
   * 고르지 않고도 계속 선을 잇는 게 자연스러운데, 그 상태에서 이미 그은
   * 선의 끝점 근처를 누르면(고르지 않았어도) 새 도형을 시작하는 대신 그
   * 선을 잡아 늘이게 한다. 아무 선의 끝점이든 가장 가까운 것 하나를 찾는다.
   */
  function anyLineHandleAt(p: Point): { id: string; end: 1 | 2 } | null {
    let best: { id: string; end: 1 | 2; dist: Mm } | null = null;
    for (const o of objects) {
      if (!isLine(o) || isLocked(o)) continue;
      const d1 = Math.hypot(p.x - o.x1, p.y - o.y1);
      const d2 = Math.hypot(p.x - o.x2, p.y - o.y2);
      if (d1 <= HANDLE_GRAB && (!best || d1 < best.dist)) best = { id: o.id, end: 1, dist: d1 };
      if (d2 <= HANDLE_GRAB && (!best || d2 < best.dist)) best = { id: o.id, end: 2, dist: d2 };
    }
    return best && { id: best.id, end: best.end };
  }

  /**
   * 딱 하나 고른 상자(달력·이미지)의 네 모서리 손잡이. 선의 끝점 손잡이와 짝이다.
   *
   * 이미지는 돌아가 있을 수 있다 — 화면 좌표(`p`)를 먼저 그 이미지의
   * 원래(회전 전) 좌표로 되돌린 다음, 항상 원래 좌표에 있는 네 모서리와 견준다.
   */
  function boxHandleAt(p: Point): { id: string; corner: Corner } | null {
    if (!lone || !isBoxResizable(lone)) return null;
    const b = boxOf(lone);
    const test = toLocal(lone, p);
    const corners: { corner: Corner; x: number; y: number }[] = [
      { corner: 'nw', x: b.x, y: b.y },
      { corner: 'ne', x: b.x + b.width, y: b.y },
      { corner: 'sw', x: b.x, y: b.y + b.height },
      { corner: 'se', x: b.x + b.width, y: b.y + b.height },
    ];
    for (const c of corners) {
      if (Math.hypot(test.x - c.x, test.y - c.y) <= HANDLE_GRAB) return { id: lone.id, corner: c.corner };
    }
    return null;
  }

  /** 상자 테두리(네 변)까지의 최소 거리. */
  function distanceToBoxEdge(b: Box, p: Point): Mm {
    const edges = rectLines({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height });
    return Math.min(...edges.map((e) => distanceToSegment(e, p.x, p.y)));
  }

  /**
   * 그 자리에서 집히는 것. 가장 가까운 것 하나만 고른다.
   *
   * 글자는 **실제로 그려진 크기**로 판정한다. 그 크기는 글꼴이 정하므로 core가 알 수
   * 없지만, 화면에는 이미 그려져 있으니 브라우저에 물어보면 된다. viewBox가 mm라
   * getBBox()가 곧 mm를 돌려준다.
   *
   * 글자를 먼저 본다. 글자가 선 위에 얹혀 있을 때 글자를 집을 수 없으면 곤란하다.
   * 달력·이미지는 자기 상자가 곧 자리라 글꼴이 그린 크기를 잴 필요가 없다.
   *
   * **도형만은 안이 아니라 테두리를 눌러야 집힌다.** 표의 테두리도 도형이고,
   * 그 안에 안쪽 칸 선이 그대로 깔려 있다 — 안을 채워서 판정하면 그 선을 다시
   * 고를 수 없다(늘 테두리가 먼저 집힌다). 도형 안에 직접 그려 넣은 장식선도
   * 같은 문제라, 도형은 아예 테두리 근처(GRAB)만 집히게 한다.
   */
  function hitAt(p: Point): DiaryObject | null {
    const svg = svgRef.current;
    if (svg) {
      for (const el of [...svg.querySelectorAll<SVGTextElement>('text[data-id]')].reverse()) {
        const found = objects.find((o) => o.id === el.dataset.id);
        if (!found || !isText(found) || isLocked(found)) continue;
        // getBBox()는 <text>의 회전 전(자기 상자 기준) 자리를 돌려준다 — 화면에
        // 보이는 회전한 자리가 아니다. 그래서 클릭 지점을 반대로 먼저 돌려
        // "회전 전이라면 어디를 짚은 셈인지"로 바꾼 다음 견준다.
        const test = toLocal(found, p);
        const b = el.getBBox();
        if (test.x >= b.x && test.x <= b.x + b.width && test.y >= b.y && test.y <= b.y + b.height) {
          return found;
        }
      }
    }

    for (const o of [...objects].reverse()) {
      if (!isBoxShaped(o) || isLocked(o)) continue;
      const b = boxOf(o);
      // 이미지는 돌아가 있을 수 있다 — 회전 전 좌표로 되돌려 상자와 견준다.
      const test = toLocal(o, p);
      if (isShape(o)) {
        if (distanceToBoxEdge(b, test) <= GRAB) return o;
        continue;
      }
      if (test.x >= b.x && test.x <= b.x + b.width && test.y >= b.y && test.y <= b.y + b.height) return o;
    }

    let best: DiaryObject | null = null;
    let bestGap = GRAB;
    for (const o of objects) {
      if (!isLine(o) || isLocked(o)) continue;
      const gap = distanceToSegment(o, p.x, p.y);
      if (gap <= bestGap) {
        best = o;
        bestGap = gap;
      }
    }
    return best;
  }

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
    // 격자에 앉힐 기준점 — 함께 옮길 것들을 감싸는 네모의 왼쪽 위.
    // select()는 다음 렌더에나 반영되므로 지금 고른 것을 여기서 직접 센다.
    const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
    const box = boundsOfObjects(objects.filter((o) => ids.includes(o.id)));
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
      const hit = hitAt(raw);
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
      const grip = anyLineHandleAt(raw);
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
      const hit = hitAt(raw);
      if (hit && isText(hit)) {
        finishEditing();
        setEditing(editingFor(hit));
        return;
      }
      // 입력 중이었다면 먼저 확정한다. 그래야 빈 상자가 남지 않는다.
      finishEditing();
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    if (tool === 'field') {
      // 이미 있는 글자를 클릭하면 고르기만 한다 — 자동 필드는 타이핑할 게
      // 없으니 새로 겹쳐 쓰는 대신 속성 막대에서 만지도록 안내한다.
      const hit = hitAt(raw);
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
      const boxGripHit = boxHandleAt(raw);
      if (boxGripHit) {
        // 크기조정은 회전 전 자리 기준으로 계산한다(resizeBox와 짝이 맞아야 한다).
        // 격자에 앉힌 점(snap)을 쓴다 — raw 그대로 쓰면 손을 대는 순간(아직
        // 움직이기 전)만 격자에서 살짝 벗어난 값으로 시작해, 짧게 끌고 놓을
        // 때 도트에 잘 안 붙는 것처럼 느껴졌다.
        const to = lone ? toLocal(lone, snap ?? raw) : (snap ?? raw);
        setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to });
        return;
      }
      // 이미 있는 것을 클릭하면 고르고, 끌면 옮길 수 있게 한다.
      const hit = hitAt(raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    // 달력 모서리 손잡이가 몸통보다 먼저다. 겹쳐 있을 때 손잡이를 못 잡으면
    // 늘이려다 매번 통째로 옮겨진다 — 끝점 손잡이와 같은 이유다.
    const boxGripHit = boxHandleAt(raw);
    if (boxGripHit) {
      // snap을 쓰는 이유는 위 이미지·달력 분기와 같다.
      const to = lone ? toLocal(lone, snap ?? raw) : (snap ?? raw);
      setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to });
      return;
    }

    // 끝점 손잡이가 선 몸통보다 먼저다. 겹쳐 있을 때 손잡이를 못 잡으면
    // 늘이려다 매번 통째로 옮겨진다.
    const grip = handleAt(raw);
    if (grip) {
      setDragBoth({ kind: 'handle', id: grip.id, end: grip.end, to: raw });
      return;
    }

    // 고르기 — 선 위에서 시작하면 옮기기, 빈 곳이면 감싸기
    const hit = hitAt(raw);
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

    if (d.kind === 'draw' || d.kind === 'handle' || d.kind === 'textbox' || d.kind === 'boxHandle') {
      const snap = snapped(e);
      if (!snap) return;
      // 모서리를 끄는 대상이 돌아가 있으면(이미지) 회전 전 자리로 되돌려서 저장한다.
      const target = d.kind === 'boxHandle' ? objects.find((o) => o.id === d.id) : null;
      const to = target ? toLocal(target, snap) : snap;
      setDragBoth({ ...d, to });
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
        const centered = centerOnLogoLine(moved);
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
        const { box, size, lineHeight } = resizeTextBox(target, d.corner, d.to);
        resizeObject(d.id, box, { size, lineHeight });
      } else if (target) {
        const minSize = isShape(target) ? MIN_FREE_BOX_SIZE : undefined;
        resizeObject(d.id, resizeBox(boxOf(target), d.corner, d.to, minSize));
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

      if (tool === 'field') {
        // 타이핑 없이 바로 확정한다. 오프셋은 자동으로 매겨지고 찍을 때마다
        // 하나씩 늘어난다 — 칸을 순서대로 찍으면 위클리 7칸이 저절로 0~6이 된다.
        // 서식은 속성 막대에서 미리 골라둔 것(fieldDraftFormat)을 쓴다.
        const field = { offset: nextFieldOffset, format: fieldDraftFormat };
        commitText({ ...box, text: fieldPlaceholder(field), field, ...draftStyle });
        setNextFieldOffset((n) => n + 1);
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
        commitCheckboxes(cellsIn(lattice, d.from, d.to).map(checkboxIconBox));
      }
      return;
    }

    // 그리기 — 같은 점에서 뗐으면 클릭(선을 잇는다), 다른 점이면
    // 끌기(사각형 = 도형 하나). 도형은 이 그리기 도구에 합쳐져 있다,
    // 따로 도구가 없다 — 끌어서 나온 사각형은 둥글기가 0(각짐)이어도
    // 그냥 도형 하나로 다뤄서, 나중에 골라 둥글기를 바로 바꿀 수 있다.
    const moved = d.from.x !== d.to.x || d.from.y !== d.to.y;
    if (moved) {
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
    const hit = hitAt(raw);
    setPending(null);
    setDragBoth(null);

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
          grid={grid}
          objects={inactiveHistory.present}
          safeZoneWidth={insert.punch.safeZoneWidth}
          mirror={inactiveSide === 'back'}
        />
        <PunchGuide
          width={insert.width}
          height={insert.height}
          punch={insert.punch}
          mirror={inactiveSide === 'back'}
        />
        {kind === 'notebook' && <NotebookMarginGuide width={insert.width} height={insert.height} />}
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
  const boxGrip = drag?.kind === 'boxHandle' ? drag : null;
  const textDrag = drag?.kind === 'textbox' ? drag : null;
  // 끄는 중인 상자의 미리보기.
  const textDragBox = textDrag && {
    x: Math.min(textDrag.from.x, textDrag.to.x),
    y: Math.min(textDrag.from.y, textDrag.to.y),
    width: Math.abs(textDrag.to.x - textDrag.from.x) || grid.spacing,
    height: Math.abs(textDrag.to.y - textDrag.from.y) || grid.spacing,
  };

  // 글자·자동 필드 도구에서 마우스가 올라간 칸. 어디에 쓰일지 미리 보여준다.
  // 이미 상자를 끄는 중이면 그 몸짓(textDrag)이 같은 자리를 대신 보여준다.
  const hoverCell =
    (tool === 'text' || tool === 'field') && hover && !editing && !textDrag
      ? cellAt(lattice, hover.x, hover.y)
      : null;

  /**
   * 선의 mm 치수 뒤에 몇 칸짜리인지도 붙인다. 표(tableSize)와 같은 계산을
   * 그대로 쓴다 — 가로나 세로 어느 한쪽으로만 그은(대개의 경우) 선은 그
   * 방향 칸 수 하나만, 대각선처럼 둘 다 걸치면 표처럼 "가로 × 세로"로 보여준다.
   */
  function withCells(mmLabel: string | null, from: Point, to: Point): string | null {
    if (!mmLabel) return null;
    const { cols, rows } = tableSize(lattice, from, to);
    const cellPart = cols === 1 ? `${rows}칸` : rows === 1 ? `${cols}칸` : `${cols} × ${rows}칸`;
    return `${mmLabel} · ${cellPart}`;
  }

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
      return withCells(sizeLabelOf([s]), { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    }
    if (boxGrip && lone && isBoxResizable(lone)) {
      const b = previewBox({ id: lone.id, ...boxOf(lone) }, boxGrip);
      return `${roundMm(b.width, 1)} × ${roundMm(b.height, 1)}mm`;
    }
    if (pending && hover) {
      return withCells(
        sizeLabelOf([{ x1: pending.x, y1: pending.y, x2: hover.x, y2: hover.y }]),
        pending,
        hover,
      );
    }
    return null;
  })();

  return (
    <div className="editor">
      <SideBar
        activeSide={activeSide}
        hasBack={hasBack}
        removeBack={removeBack}
        copyFrontToBack={copyFrontToBack}
      />
      <div className="editor-bar">
        <div className="editor-bar-tools">
          <div className="tools">
            <ToolBtn on={tool === 'select'} onClick={() => setTool('select')} title="고르기 (V)">
              <CursorIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'draw'} onClick={() => setTool('draw')} title="그리기 (D)">
              <LineIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'table'} onClick={() => setTool('table')} title="표 (G)">
              <TableIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'text'} onClick={() => setTool('text')} title="글자 (T)">
              <TextIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'calendar'} onClick={() => setTool('calendar')} title="달력 (C)">
              <CalendarIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'image'} onClick={() => setTool('image')} title="이미지 (I)">
              <ImageIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'checkbox'} onClick={() => setTool('checkbox')} title="체크박스 (X)">
              <CheckboxIcon />
            </ToolBtn>
            <ToolBtn on={tool === 'field'} onClick={() => setTool('field')} title="자동 필드 (F)">
              <FieldIcon />
            </ToolBtn>
          </div>

          {!hasBack && (
            <button className="ghost" onClick={addBack} title="지금 양식에 뒷면을 만듭니다">
              뒷면 만들기
            </button>
          )}
          <button
            className="ghost"
            onClick={deleteSelected}
            disabled={selectedIds.length === 0}
            title="지우기 (Delete)"
          >
            지우기
          </button>
          <button
            className="ghost"
            onClick={lockSelected}
            disabled={selectedIds.length === 0}
            title="잠그면 클릭으로도 감싸기로도 골라지지 않습니다. 나중에 다른 작업을 하다 실수로 건드리지 않게 됩니다"
          >
            잠그기
          </button>
          {lockedCount > 0 && (
            <button className="ghost" onClick={unlockAll} title="잠긴 것을 전부 풉니다">
              잠긴 것 {lockedCount}개 · 전부 해제
            </button>
          )}
          <button className="ghost" onClick={undo} disabled={!canUndo(history)} title="실행취소 (⌘Z)">
            ↶
          </button>
          <button className="ghost" onClick={redo} disabled={!canRedo(history)} title="다시실행 (⇧⌘Z)">
            ↷
          </button>

          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
        </div>

        <div className="editor-bar-style">
          {selectedIds.length > 0 ||
          tool === 'draw' ||
          tool === 'table' ||
          tool === 'text' ||
          tool === 'field' ||
          tool === 'calendar' ||
          tool === 'image' ||
          tool === 'checkbox' ? (
            <StyleBar
              editing={editing}
              setEditingStyle={setEditingStyle}
              draftStyle={draftStyle}
              refocusText={refocusText}
            />
          ) : (
            <span className="editor-hint">
              {noGrid
                ? '격자가 없어 그릴 수 없습니다. 도트 간격을 줄이세요.'
                : '선택 | 클릭해서 고르고, 빈 곳에서 끌어 여러 개를 감쌉니다.'}
            </span>
          )}
        </div>
      </div>

      <div
        className="editor-canvas"
        onPointerDown={onOutsideDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
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
                objects={objects}
                safeZoneWidth={insert.punch.safeZoneWidth}
                // 뒷면이면 항상 뒤집는다. 뒤집는 축(좌우/상하)은 인쇄 화면에서
                // core/layout의 mirrorLayout이 정한다 — 편집 화면은 칸 하나만
                // 보여줄 뿐 용지 배치를 모르므로, 속지 자신의 가로축(구멍이 있는
                // 축)을 뒤집는다는 사실만 다루면 된다.
                mirror={activeSide === 'back'}
                // 고치는 중인 글자는 감춘다. 입력칸이 같은 자리에 겹쳐 있어서, 둘 다
                // 보이면 어느 게 지금 치는 내용인지 헷갈린다. 목록에서 빼지 않고
                // 감추기만 하는 이유는 InsertView의 hiddenId 주석에 있다.
                hiddenId={editing?.id}
              />

              <PunchGuide
                width={insert.width}
                height={insert.height}
                punch={insert.punch}
                mirror={activeSide === 'back'}
              />
              {kind === 'notebook' && <NotebookMarginGuide width={insert.width} height={insert.height} />}

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
                    const raw = previewBox({ id: o.id, ...boxOf(o) }, boxGrip);
                    const b = { ...raw, x: raw.x + (nudge?.dx ?? 0), y: raw.y + (nudge?.dy ?? 0) };
                    const rot = rotationDegOf(o);
                    const rect = (
                      <rect
                        key={rot === 0 ? o.id : undefined}
                        x={b.x}
                        y={b.y}
                        width={b.width}
                        height={b.height}
                        className={isImage(o) ? 'image-picked' : undefined}
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
                  const b = previewBox({ id: lone.id, ...boxOf(lone) }, boxGrip);
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

      <div className="editor-foot">
        <span>
          속지 {insert.width} × {insert.height}mm
        </span>
        <span>
          칸 {noGrid ? '없음' : `${cellCols} × ${cellRows}개`}
        </span>
        <span>그린 것 {objects.length}개</span>
        {selectedIds.length > 0 && <span>고른 것 {selectedIds.length}개</span>}
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
              {hover.x} , {hover.y} mm
            </span>
          )
        )}
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
 * 자리는 SVG에게 물어본다 — 확대와 스크롤을 우리가 다시 계산하면 어긋난다.
 */
export function TextInput({
  editing,
  scale,
  svg,
  inputRef,
  onChange,
  onDone,
}: {
  editing: Editing;
  scale: number;
  svg: SVGSVGElement | null;
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

  if (!svg) return null;
  const wrap = svg.parentElement!.getBoundingClientRect();
  const at = svg.getBoundingClientRect();
  const baseLeft = at.left - wrap.left;
  const baseTop = at.top - wrap.top;
  // 회전한 글자를 고치는 중이면 입력칸도 같이 돌아가 있어야 한다 — 안 그러면
  // 타이핑하는 자리와 실제로 저장될 자리가 달라 보여서 "상자 밖에서 고치는"
  // 것처럼 보인다. CSS의 rotate() 부호는 core/objects의 rotationOf가 화면에
  // 쓰는 SVG matrix()와 같은 손 방향이다(둘 다 브라우저 좌표계라 그대로 맞는다).
  const rotate = rotateOf(editing.style);
  const cssRotate = rotate === 90 ? 90 : rotate === 270 ? -90 : 0;

  const left = baseLeft + box.x * scale;
  const top = baseTop + box.y * scale;

  const textarea = (
    <textarea
      ref={ref}
      className="text-input"
      value={editing.text}
      style={{
        left,
        top,
        width: box.width * scale,
        height: box.height * scale,
        fontSize: size * scale,
        fontFamily: familyOf(userFonts, editing.style.font),
        fontWeight: editing.style.bold ? FONT_WEIGHT.bold : FONT_WEIGHT.regular,
        // 이 글자에 새겨둔 줄 간격을 그대로 쓴다 — 타이핑 중과 커밋 후가
        // 같은 자리로 보여야 한다.
        lineHeight: `${(editing.style.lineHeight ?? size) * scale}px`,
        transform: cssRotate ? `rotate(${cssRotate}deg)` : undefined,
        transformOrigin: cssRotate ? 'center' : undefined,
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
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

/**
 * 지금 어느 쪽이 활성인지 + 뒷면 관련 버튼.
 *
 * 탭으로 전환하지 않는다 — 뒷면·앞면 캔버스가 나란히 있어서 그 캔버스를
 * 클릭하는 것 자체가 전환이다(EditorTab의 onInactivePointerDown).
 */
function SideBar({
  activeSide,
  hasBack,
  removeBack,
  copyFrontToBack,
}: {
  activeSide: Side;
  hasBack: boolean;
  removeBack: () => void;
  copyFrontToBack: () => void;
}) {
  return (
    <div className="side-bar">
      <span className="active-side-label">지금 · {activeSide === 'back' ? '뒷면' : '앞면'}</span>
      {activeSide === 'back' && (
        <button
          className="ghost"
          onClick={copyFrontToBack}
          title="지금 뒷면에 그린 것을 지우고 앞면과 똑같이 만듭니다"
        >
          앞면 그대로 복사
        </button>
      )}
      {activeSide === 'back' && hasBack && (
        <button className="ghost" onClick={removeBack} title="뒷면 지우기">
          뒷면 지우기
        </button>
      )}
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
