import { useEffect, useRef, useState } from 'react';
import { cellAt, gridArea, gridLattice, tableLines, tableSize } from '../core/grid';
import { moveDelta, snapToLattice } from '../core/snap';
import { canRedo, canUndo } from '../core/history';
import {
  boundsOfObjects,
  boxOf,
  cleanStyle,
  distanceToSegment,
  growBox,
  isCalendar,
  isLine,
  isText,
  objectInRect,
  rectLines,
  resizeBox,
  type Corner,
  type DiaryObject,
  type TextStyle,
} from '../core/objects';
import { FONT_WEIGHT, SNAP_COLOR, SNAP_DOT_SIZE, TEXT_SIZE } from '../core/style';
import { roundMm } from '../core/units';
import { DEFAULT_FIELD_FORMAT, fieldPlaceholder, newTextStyle } from '../core/text';
import { useDotGrid, useHasBack, useInsert, useObjects, useSide, useStore, type Side } from '../store';
import { InsertView } from './InsertView';
import { PunchGuide } from './PunchGuide';
import { StyleBar } from './StyleBar';
import { CalendarIcon, CursorIcon, FieldIcon, LineIcon, TableIcon, TextIcon } from './icons';
import { measureTextBox } from './measureText';
import { familyOf } from '../fonts/registry';
import { PX_PER_MM_AT_100 } from './pixels';
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

const ZOOMS = [50, 75, 100, 150, 200, 300, 400];

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
  const grid = useDotGrid();
  const history = useObjects();
  const side = useSide();
  const hasBack = useHasBack();
  const setSide = useStore((s) => s.setSide);
  const addBack = useStore((s) => s.addBack);
  const removeBack = useStore((s) => s.removeBack);
  const tool = useStore((s) => s.tool);
  const selectedIds = useStore((s) => s.selectedIds);
  const setTool = useStore((s) => s.setTool);
  const drawLines = useStore((s) => s.drawLines);
  const select = useStore((s) => s.select);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const moveSelected = useStore((s) => s.moveSelected);
  const reshapeSelected = useStore((s) => s.reshapeSelected);
  const commitText = useStore((s) => s.commitText);
  const commitCalendar = useStore((s) => s.commitCalendar);
  const resizeObject = useStore((s) => s.resizeObject);
  const textDraftStyle = useStore((s) => s.textDraftStyle);
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
  const lattice = gridLattice(
    gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back'),
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
    commitText({ ...cur.box, text: cur.text, ...cur.style }, cur.id);
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
   * 드롭다운을 고르면 포커스가 그 드롭다운에 남는다. 그대로 두면 이어서 칠 수도,
   * Enter로 확정할 수도 없다 — 방금 무엇을 고쳤는지는 보이는데 손이 갈 곳이 없다.
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
      if (e.key === 'Escape') {
        setPending(null);
        setDragBoth(null);
        select([]);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
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
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelected, select, setTool]);

  /**
   * 마우스 위치를 속지 좌표(mm)로.
   *
   * viewBox를 mm로 잡아둔 덕분에 브라우저가 직접 mm를 돌려준다.
   * 이것이 SVG를 그대로 쓰기로 한 이유다 — 픽셀을 거치는 통역이 없다.
   */
  function rawMm(e: React.PointerEvent): Point | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function snapped(e: React.PointerEvent): Point | null {
    const raw = rawMm(e);
    return raw && snapToLattice(lattice, raw.x, raw.y);
  }

  /**
   * 딱 하나만 골랐을 때의 끝점 손잡이.
   *
   * 여러 개 골라놓고 손잡이가 잔뜩 뜨면 어느 것을 잡는지 알 수 없다.
   */
  const lone =
    selectedIds.length === 1 ? (objects.find((o) => o.id === selectedIds[0]) ?? null) : null;

  function handleAt(p: Point): { id: string; end: 1 | 2 } | null {
    if (!lone || !isLine(lone)) return null;
    const d1 = Math.hypot(p.x - lone.x1, p.y - lone.y1);
    const d2 = Math.hypot(p.x - lone.x2, p.y - lone.y2);
    if (d1 <= HANDLE_GRAB && d1 <= d2) return { id: lone.id, end: 1 };
    if (d2 <= HANDLE_GRAB) return { id: lone.id, end: 2 };
    return null;
  }

  /** 딱 하나 고른 달력의 네 모서리 손잡이. 선의 끝점 손잡이와 짝이다. */
  function boxHandleAt(p: Point): { id: string; corner: Corner } | null {
    if (!lone || !isCalendar(lone)) return null;
    const b = boxOf(lone);
    const corners: { corner: Corner; x: number; y: number }[] = [
      { corner: 'nw', x: b.x, y: b.y },
      { corner: 'ne', x: b.x + b.width, y: b.y },
      { corner: 'sw', x: b.x, y: b.y + b.height },
      { corner: 'se', x: b.x + b.width, y: b.y + b.height },
    ];
    for (const c of corners) {
      if (Math.hypot(p.x - c.x, p.y - c.y) <= HANDLE_GRAB) return { id: lone.id, corner: c.corner };
    }
    return null;
  }

  /**
   * 그 자리에서 집히는 것. 가장 가까운 것 하나만 고른다.
   *
   * 글자는 **실제로 그려진 크기**로 판정한다. 그 크기는 글꼴이 정하므로 core가 알 수
   * 없지만, 화면에는 이미 그려져 있으니 브라우저에 물어보면 된다. viewBox가 mm라
   * getBBox()가 곧 mm를 돌려준다.
   *
   * 글자를 먼저 본다. 글자가 선 위에 얹혀 있을 때 글자를 집을 수 없으면 곤란하다.
   * 달력은 자기 상자가 곧 자리라 글꼴이 그린 크기를 잴 필요가 없다.
   */
  function hitAt(p: Point): DiaryObject | null {
    const svg = svgRef.current;
    if (svg) {
      for (const el of [...svg.querySelectorAll<SVGTextElement>('text[data-id]')].reverse()) {
        const b = el.getBBox();
        if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) {
          const found = objects.find((o) => o.id === el.dataset.id);
          if (found) return found;
        }
      }
    }

    for (const o of [...objects].reverse()) {
      if (!isCalendar(o)) continue;
      const b = boxOf(o);
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) return o;
    }

    let best: DiaryObject | null = null;
    let bestGap = GRAB;
    for (const o of objects) {
      if (!isLine(o)) continue;
      const gap = distanceToSegment(o, p.x, p.y);
      if (gap <= bestGap) {
        best = o;
        bestGap = gap;
      }
    }
    return best;
  }

  function onDown(e: React.PointerEvent) {
    const raw = rawMm(e);
    const snap = snapped(e);
    if (!raw) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    // 표도 몸짓은 그리기(면)와 똑같이 점에서 끄는 드래그다. 그 사이에서
    // 실제로 무엇이 생기는지(테두리만인지 안쪽 칸 선까지인지)는 onUp이
    // 지금 도구를 보고 가른다.
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

    if (tool === 'calendar') {
      // 방금 놓은(또는 고른) 달력이면 모서리 손잡이가 몸통보다 먼저다 —
      // 도구를 select로 바꾸지 않고도 이어서 바로 크기를 다듬을 수 있다.
      const boxGripHit = boxHandleAt(raw);
      if (boxGripHit) {
        setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to: raw });
        return;
      }
      // 이미 있는 달력을 클릭하면 고르기만 한다.
      const hit = hitAt(raw);
      if (hit) {
        select([hit.id]);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    // 달력 모서리 손잡이가 몸통보다 먼저다. 겹쳐 있을 때 손잡이를 못 잡으면
    // 늘이려다 매번 통째로 옮겨진다 — 끝점 손잡이와 같은 이유다.
    const boxGripHit = boxHandleAt(raw);
    if (boxGripHit) {
      setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to: raw });
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
      if (snap) setDragBoth({ ...d, to: snap });
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
      } else {
        moveSelected(d.dx, d.dy);
      }
      return;
    }

    if (d.kind === 'handle') {
      reshapeSelected(d.id, d.end, d.to);
      return;
    }

    if (d.kind === 'boxHandle') {
      const target = objects.find((o) => o.id === d.id);
      if (target) resizeObject(d.id, resizeBox(boxOf(target), d.corner, d.to));
      return;
    }

    if (d.kind === 'textbox') {
      // 한 점에서 뗐으면 그 점이 든 칸 하나, 끌었으면 걸친 칸 전체가 상자다.
      const same = d.from.x === d.to.x && d.from.y === d.to.y;

      if (tool === 'calendar') {
        // 표처럼 실제로 끌어야 만들어진다 — 그냥 눌렀다 뗀 칸 하나는 너무 작다.
        if (same) return;
        commitCalendar({
          x: Math.min(d.from.x, d.to.x),
          y: Math.min(d.from.y, d.to.y),
          width: Math.abs(d.to.x - d.from.x),
          height: Math.abs(d.to.y - d.from.y),
        });
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
        const field = { offset: nextFieldOffset, format: DEFAULT_FIELD_FORMAT };
        commitText({ ...box, text: fieldPlaceholder(field), field, ...draftStyle });
        setNextFieldOffset((n) => n + 1);
        return;
      }

      setEditing({ box, text: '', style: draftStyle });
      return;
    }

    if (d.kind === 'marquee') {
      const inside = objects.filter((o) => objectInRect(o, rectOf(d.from, d.to)));
      select(e.shiftKey ? merge(selectedIds, inside.map((o) => o.id)) : inside.map((o) => o.id));
      return;
    }

    /*
     * 표 — 끈 범위의 안쪽 칸 선까지 전부 채운다.
     *
     * 표는 최소 2칸은 돼야 의미가 있으므로, 끌지 않고 그냥 눌렀다 뗐으면
     * (점 하나) 아무 일도 하지 않는다 — 그리기 도구의 "점 찍고 다음 점"
     * 같은 대기 상태를 두지 않는다.
     */
    if (tool === 'table') {
      if (d.from.x !== d.to.x || d.from.y !== d.to.y) {
        drawLines(tableLines(lattice, d.from, d.to));
      }
      return;
    }

    // 그리기 — 같은 점에서 뗐으면 클릭(선), 다른 점이면 끌기(면)
    const moved = d.from.x !== d.to.x || d.from.y !== d.to.y;
    if (moved) {
      drawLines(rectLines(d.from, d.to));
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

  const marquee = drag?.kind === 'marquee' ? rectOf(drag.from, drag.to) : null;
  // 표를 끄는 중이면 미리보기도 안쪽 칸 선까지 함께 보여준다 — 몇 칸짜리
  // 표가 될지 손을 떼기 전에 알아야 한다.
  const ghost =
    drag?.kind === 'draw'
      ? tool === 'table'
        ? tableLines(lattice, drag.from, drag.to)
        : rectLines(drag.from, drag.to)
      : null;
  const nudge = drag?.kind === 'move' ? drag : null;
  const grip = drag?.kind === 'handle' ? drag : null;
  const boxGrip = drag?.kind === 'boxHandle' ? drag : null;
  const textDrag = drag?.kind === 'textbox' ? drag : null;

  // 글자·자동 필드 도구에서 마우스가 올라간 칸. 어디에 쓰일지 미리 보여준다.
  // 이미 상자를 끄는 중이면 그 몸짓(textDrag)이 같은 자리를 대신 보여준다.
  const hoverCell =
    (tool === 'text' || tool === 'field') && hover && !editing && !textDrag
      ? cellAt(lattice, hover.x, hover.y)
      : null;

  // 지금 그리는 것의 치수. 면이면 가로 × 세로, 선이면 길이.
  const sizeLabel = (() => {
    if (drag?.kind === 'draw') {
      // 표는 mm가 아니라 몇 칸인지가 더 궁금하다. 그리기(선·면)는 지금처럼 mm.
      if (tool === 'table') {
        const { cols, rows } = tableSize(lattice, drag.from, drag.to);
        return `${cols} × ${rows}칸`;
      }
      return sizeLabelOf(rectLines(drag.from, drag.to));
    }
    if (grip && lone && isLine(lone)) return sizeLabelOf([preview(lone, null, grip)]);
    if (boxGrip && lone && isCalendar(lone)) {
      const b = previewBox({ id: lone.id, ...boxOf(lone) }, boxGrip);
      return `${roundMm(b.width, 1)} × ${roundMm(b.height, 1)}mm`;
    }
    if (pending && hover) {
      return sizeLabelOf([{ x1: pending.x, y1: pending.y, x2: hover.x, y2: hover.y }]);
    }
    return null;
  })();

  if (side === 'back' && !hasBack) {
    return (
      <div className="editor">
        <SideBar side={side} setSide={setSide} hasBack={hasBack} removeBack={removeBack} />
        <div className="editor-canvas back-empty">
          <div className="back-empty-msg">
            <p>아직 뒷면이 없습니다.</p>
            <button onClick={addBack}>뒷면 만들기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <SideBar side={side} setSide={setSide} hasBack={hasBack} removeBack={removeBack} />
      <div className="editor-bar">
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
          <ToolBtn on={tool === 'field'} onClick={() => setTool('field')} title="자동 필드 (F)">
            <FieldIcon />
          </ToolBtn>
          <ToolBtn on={tool === 'calendar'} onClick={() => setTool('calendar')} title="달력 (C)">
            <CalendarIcon />
          </ToolBtn>
        </div>

        {selectedIds.length > 0 ||
        tool === 'draw' ||
        tool === 'table' ||
        tool === 'text' ||
        tool === 'field' ||
        tool === 'calendar' ? (
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
              : '클릭해서 고르고, 빈 곳에서 끌어 여러 개를 감쌉니다.'}
          </span>
        )}

        <button
          className="ghost"
          onClick={deleteSelected}
          disabled={selectedIds.length === 0}
          title="지우기 (Delete)"
        >
          지우기
        </button>
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

      <div className="editor-canvas">
        <svg
          ref={svgRef}
          className={`insert-sheet ${tool}`}
          viewBox={`0 0 ${insert.width} ${insert.height}`}
          width={insert.width * scale}
          height={insert.height * scale}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={() => setDragBoth(null)}
          /*
           * 더블클릭 — 도구가 무엇이든 바로 글자를 쓸 수 있게 한다.
           *
           * 기존 글자를 더블클릭하면 고치기, 빈 칸을 더블클릭하면 새로 쓰기다.
           * 둘 다 도구를 'text'로 바꾼다. skipToolResetRef로 그 전환이 지금 막
           * 여는 입력을 지우지 않게 한다.
           */
          onDoubleClick={(e) => {
            const raw = rawMm(e as unknown as React.PointerEvent);
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

            if (tool !== 'text') {
              const cell = cellAt(lattice, raw.x, raw.y);
              if (!cell) return;
              skipToolResetRef.current = true;
              setTool('text');
              setEditing({ box: cell, text: '', style: draftStyle });
            }
          }}
        >
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
            mirror={side === 'back'}
            // 고치는 중인 글자는 감춘다. 입력칸이 같은 자리에 겹쳐 있어서, 둘 다
            // 보이면 어느 게 지금 치는 내용인지 헷갈린다. 목록에서 빼지 않고
            // 감추기만 하는 이유는 InsertView의 hiddenId 주석에 있다.
            hiddenId={editing?.id}
          />

          <PunchGuide
            width={insert.width}
            height={insert.height}
            punch={insert.punch}
            mirror={side === 'back'}
          />

          {/* 고른 것 표시. 옮기거나 끝점을 끄는 중이면 갈 자리에 미리 보여준다.
              선은 선 자체를, 글자는 상자를 두른다. */}
          <g className="picked">
            {objects
              .filter((o) => selectedIds.includes(o.id))
              .map((o) => {
                if (isLine(o)) {
                  const s = preview(o, nudge, grip);
                  return <line key={o.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
                }
                const b = previewBox({ id: o.id, ...boxOf(o) }, boxGrip);
                return (
                  <rect
                    key={o.id}
                    x={b.x + (nudge?.dx ?? 0)}
                    y={b.y + (nudge?.dy ?? 0)}
                    width={b.width}
                    height={b.height}
                  />
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

          {/* 모서리 손잡이. 달력 하나만 골랐을 때만 나온다 — 끝점 손잡이와 짝이다. */}
          {lone &&
            isCalendar(lone) &&
            (() => {
              const b = previewBox({ id: lone.id, ...boxOf(lone) }, boxGrip);
              const corners = [
                { x: b.x, y: b.y },
                { x: b.x + b.width, y: b.y },
                { x: b.x, y: b.y + b.height },
                { x: b.x + b.width, y: b.y + b.height },
              ];
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
          {textDrag && (
            <rect
              x={Math.min(textDrag.from.x, textDrag.to.x)}
              y={Math.min(textDrag.from.y, textDrag.to.y)}
              width={Math.abs(textDrag.to.x - textDrag.from.x) || grid.spacing}
              height={Math.abs(textDrag.to.y - textDrag.from.y) || grid.spacing}
              className="text-drag"
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
        </svg>

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
            onChange={(text) => {
              // 칸 하나만 누르고 길게 써도 매번 손으로 늘릴 필요가 없다 — 실제로
              // 필요한 크기를 재서 모자라면 격자 칸 단위로 키운다. 왼쪽 위는 그대로다.
              const size = editing.style.size ?? TEXT_SIZE;
              const required = measureTextBox(
                text,
                size,
                editing.style.lineHeight ?? size,
                editing.style.bold,
                familyOf(userFonts, editing.style.font),
              );
              const box = growBox(editing.box, grid.spacing, required, insert.width, insert.height);
              setEditing({ ...editing, text, box });
            }}
            onDone={finishEditing}
          />
        )}
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
 * **Enter로 확정, ⇧Enter로 줄바꿈이다.** 메모·할일목록처럼 여러 줄을 쓰는 일이
 * 흔해서 Enter 쪽을 확정에 준다 — 문서 프로그램(엑셀 등)과는 반대 배정이다.
 *
 * 자리는 SVG에게 물어본다 — 확대와 스크롤을 우리가 다시 계산하면 어긋난다.
 */
function TextInput({
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
  const left = at.left - wrap.left + box.x * scale;
  const top = at.top - wrap.top + box.y * scale;

  return (
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
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onDone();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onDone();
          return;
        }
        // ⇧Enter는 여기서 막지 않는다 — textarea 기본 동작(줄바꿈)에 맡긴다.
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
}

/** 앞면·뒷면 전환. 뒷면을 보는 중이면 지우는 버튼도 함께 나온다. */
function SideBar({
  side,
  setSide,
  hasBack,
  removeBack,
}: {
  side: Side;
  setSide: (side: Side) => void;
  hasBack: boolean;
  removeBack: () => void;
}) {
  return (
    <div className="side-bar">
      <div className="tabs">
        <button className={side === 'front' ? 'tab on' : 'tab'} onClick={() => setSide('front')}>
          앞면
        </button>
        <button className={side === 'back' ? 'tab on' : 'tab'} onClick={() => setSide('back')}>
          뒷면
        </button>
      </div>
      {side === 'back' && hasBack && (
        <button className="ghost" onClick={removeBack} title="뒷면 지우기">
          뒷면 지우기
        </button>
      )}
    </div>
  );
}

function ToolBtn({
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
