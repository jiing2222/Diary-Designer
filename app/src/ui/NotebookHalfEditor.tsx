import { useEffect, useRef, useState } from 'react';
import { cellAt, cellsIn, gridArea, gridLattice, tableLines, tableSize, tableSplit } from '../core/grid';
import { checkboxIconBox } from '../core/checkbox';
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
  type Box,
  type Corner,
  type DiaryObject,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import { SNAP_COLOR, SNAP_DOT_SIZE } from '../core/style';
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
import { useObjects, useStore } from '../store';
import { defaultInsert } from '../core/template';
import { DEFAULT_DOT_GRID, type DotGrid } from '../core/grid';
import { InsertView } from './InsertView';
import { StyleBar } from './StyleBar';
import { TextInput, ToolBtn } from './EditorTab';
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

// shadowTemplate이 없을 때만 쓰이는 값(실제로는 안 쓰인다 — 타입만 맞춘다).
const NO_INSERT = defaultInsert();
const NO_GRID: DotGrid = { ...DEFAULT_DOT_GRID };

const NUDGE_STEP: Mm = 0.5;
const NUDGE_STEP_SHIFT: Mm = 5;

/**
 * 노트의 표지 앞·뒤, 또는 내지 한 쪽을 그리는 캔버스 — 늘 한 반쪽(완성
 * 페이지 폭 하나)만 다룬다.
 *
 * `PrintSlotEditor`(인쇄하기의 칸·페이지 손보기)를 그대로 옮겨왔다 —
 * 그것도 `store.ts`의 `shadowTemplate`을 그리는 "그림자 하나 = 한쪽만"
 * 편집 화면이라 구조가 완전히 같다. 다른 점은 둘뿐이다: 이 화면엔 용지
 * 위 자리(회전·매트릭스)도, 스크롤을 따라다니는 도구막대 포털도 필요
 * 없다 — 부모(`NotebookEditorTab`)가 이미 평범한 세로 목록 안에 놓아준다.
 *
 * `beginShadowEdit`을 부르는 쪽(부모)이 언제나 `side: 'front'`로만
 * 시작한다 — 표지 뒤·내지 오른쪽 같은 "물리적 반대쪽"이 아니라, 반쪽마다
 * 독립된 작은 속지 하나로 취급하기 때문이다(설계 결정 — core/notebook의
 * `NotebookHalf`). 그래서 이 컴포넌트는 `side`를 store에서 읽지 않고 늘
 * `'front'`로 고정한다.
 */
export function NotebookHalfEditor({
  scale,
  onFinish,
}: {
  /** 지금 확대 배율(px/mm). */
  scale: number;
  /** 진행 중인 글자 입력을 먼저 확정한 뒤 부른다 — "완료"·바깥 클릭·Esc가 부른다. */
  onFinish: () => void;
}) {
  // useInsert·useDotGrid 대신 그림자 양식을 직접 읽는다 — 그 두 훅은
  // 속지의 그림자 편집(인쇄하기 칸 손보기)에서 일부러 그림자를 안 본다.
  // 노트는 반대로 store.ts의 useDotGrid·patchDotGrid가 그림자를 보도록
  // 이미 예외를 뒀지만(도트 격자는 SettingsPanel을 그대로 재사용하려고),
  // insert는 애초에 격자만큼 자주 안 바뀌므로 여기서도 그냥 직접 읽는다.
  const shadow = useStore((s) => s.shadowTemplate);
  const insert = shadow?.insert ?? NO_INSERT;
  const grid = shadow?.dotGrid ?? NO_GRID;
  const history = useObjects('front');
  const tool = useStore((s) => s.tool);
  const selectedIds = useStore((s) => s.selectedIds);
  const setTool = useStore((s) => s.setTool);
  const drawLines = useStore((s) => s.drawLines);
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

  const svgRef = useRef<SVGSVGElement>(null);
  const objects = history.present;
  const lockedCount = objects.filter(isLocked).length;
  const lattice = gridLattice(
    gridArea(insert, grid, insert.punch.safeZoneWidth),
    grid.spacing,
    grid.minMargin,
    grid.toEdge,
  );
  const noGrid = lattice.xs.length === 0 || lattice.ys.length === 0;
  const gridPhase = noGrid ? null : { x0: lattice.xs[0], y0: lattice.ys[0], spacing: grid.spacing };

  const [hover, setHover] = useState<Point | null>(null);
  const [pending, setPending] = useState<Point | null>(null);
  const [nextFieldOffset, setNextFieldOffset] = useState(0);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const skipToolResetRef = useRef(false);

  function setDragBoth(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
  }

  function finishEditing() {
    const cur = editingRef.current;
    if (!cur) return;
    const field = cur.text === (cur.originalText ?? '') ? cur.field : (parseFieldText(cur.text) ?? undefined);
    commitText({ ...cur.box, text: cur.text, ...cur.style, ...(field ? { field } : {}) }, cur.id);
    setEditing(null);
    editingRef.current = null;
  }

  function setEditingStyle(patch: TextStyle) {
    setEditing((cur) => (cur ? { ...cur, style: cleanStyle({ ...cur.style, ...patch }) } : cur));
  }

  function refocusText() {
    textInputRef.current?.focus();
  }

  function finish() {
    finishEditing();
    onFinish();
  }

  useEffect(() => {
    if (skipToolResetRef.current) {
      skipToolResetRef.current = false;
      return;
    }
    setPending(null);
    setDragBoth(null);
    finishEditing();
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
        // 고르거나 긋던 것이 있으면 그것부터 정리한다. 이미 다 비어 있으면
        // Esc가 곧 "완료"다 — EditorTab에는 없는, 이 화면만의 탈출구다.
        if (pending || dragRef.current || selectedIds.length > 0) {
          setPending(null);
          setDragBoth(null);
          select([]);
        } else {
          finish();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, deleteSelected, copySelected, pasteClipboard, select, setTool, moveSelected, selectedIds, pending]);

  /** 마우스 자리를 이 칸의 속지 mm로. viewBox가 이미 그 좌표계다. */
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
    const x = corner.includes('w') ? rawBox.x - (width - rawBox.width) : rawBox.x;
    const y = corner.includes('n') ? rawBox.y - (height - rawBox.height) : rawBox.y;
    const box: Box = { x, y, width, height };
    return {
      box,
      size: oldSize * heightRatio,
      lineHeight: t.lineHeight !== undefined ? t.lineHeight * heightRatio : undefined,
    };
  }

  const draftStyle = newTextStyle(textDraftStyle, grid.spacing);

  const lone = selectedIds.length === 1 ? (objects.find((o) => o.id === selectedIds[0]) ?? null) : null;

  function rotationDegOf(o: DiaryObject): number {
    if (isText(o)) return rotateOf(o);
    if (isImage(o)) return imageRotateOf(o);
    return 0;
  }

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

  function distanceToBoxEdge(b: Box, p: Point): Mm {
    const edges = rectLines({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height });
    return Math.min(...edges.map((e) => distanceToSegment(e, p.x, p.y)));
  }

  function hitAt(p: Point): DiaryObject | null {
    const svg = svgRef.current;
    if (svg) {
      for (const el of [...svg.querySelectorAll<SVGTextElement>('text[data-id]')].reverse()) {
        const found = objects.find((o) => o.id === el.dataset.id);
        if (!found || !isText(found) || isLocked(found)) continue;
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

  function startMove(hit: DiaryObject, raw: Point, e: React.PointerEvent) {
    if (e.shiftKey) {
      select(toggleId(selectedIds, hit.id));
      return;
    }
    if (!selectedIds.includes(hit.id)) select([hit.id]);
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

    if (tool === 'checkbox') {
      const hit = hitAt(raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'draw', from: snap, to: snap });
      return;
    }

    if (tool === 'draw' && !pending) {
      const grip = anyLineHandleAt(raw);
      if (grip) {
        setDragBoth({ kind: 'handle', id: grip.id, end: grip.end, to: raw });
        return;
      }
    }

    if (tool === 'draw' || tool === 'table') {
      if (snap) setDragBoth({ kind: 'draw', from: snap, to: snap });
      return;
    }

    if (tool === 'text') {
      const hit = hitAt(raw);
      if (hit && isText(hit)) {
        finishEditing();
        setEditing(editingFor(hit));
        return;
      }
      finishEditing();
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    if (tool === 'field') {
      const hit = hitAt(raw);
      if (hit) {
        select([hit.id]);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    if (tool === 'calendar' || tool === 'image') {
      const boxGripHit = boxHandleAt(raw);
      if (boxGripHit) {
        const to = lone ? toLocal(lone, snap ?? raw) : (snap ?? raw);
        setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to });
        return;
      }
      const hit = hitAt(raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    const boxGripHit = boxHandleAt(raw);
    if (boxGripHit) {
      const to = lone ? toLocal(lone, snap ?? raw) : (snap ?? raw);
      setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to });
      return;
    }

    const grip = handleAt(raw);
    if (grip) {
      setDragBoth({ kind: 'handle', id: grip.id, end: grip.end, to: raw });
      return;
    }

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
      const target = d.kind === 'boxHandle' ? objects.find((o) => o.id === d.id) : null;
      const to = target ? toLocal(target, snap) : snap;
      setDragBoth({ ...d, to });
    } else if (d.kind === 'marquee') {
      setDragBoth({ ...d, to: raw });
    } else {
      const moved = d.moved || Math.hypot(raw.x - d.origin.x, raw.y - d.origin.y) > DRAG_START;
      const free = e.metaKey || e.ctrlKey;
      setDragBoth({
        ...d,
        free,
        moved,
        ...(moved ? moveDelta(d.origin, raw, d.anchor, free ? null : gridPhase) : { dx: 0, dy: 0 }),
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
      if (!d.moved) {
        if (d.hitId) select([d.hitId]);
        return;
      }
      // 타공이 없는 노트라 로고 정렬선에 달라붙는 기능은 없다(PrintSlotEditor와 다른 점).
      moveSelected(d.dx, d.dy);
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
      const same = d.from.x === d.to.x && d.from.y === d.to.y;

      if (tool === 'calendar' || tool === 'image') {
        if (same) return;
        const box = {
          x: Math.min(d.from.x, d.to.x),
          y: Math.min(d.from.y, d.to.y),
          width: Math.abs(d.to.x - d.from.x),
          height: Math.abs(d.to.y - d.from.y),
        };
        if (tool === 'calendar') commitCalendar(box);
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

    if (tool === 'table') {
      if (d.from.x !== d.to.x || d.from.y !== d.to.y) {
        const split = tableSplit(lattice, d.from, d.to);
        if (split) {
          commitTable(split.border, split.innerLines);
        } else {
          drawLines(tableLines(lattice, d.from, d.to));
        }
      }
      return;
    }

    if (tool === 'checkbox') {
      if (d.from.x !== d.to.x || d.from.y !== d.to.y) {
        commitCheckboxes(cellsIn(lattice, d.from, d.to).map(checkboxIconBox));
      }
      return;
    }

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

  const marquee = drag?.kind === 'marquee' ? rectOf(drag.from, drag.to) : null;
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
  const textDragBox = textDrag && {
    x: Math.min(textDrag.from.x, textDrag.to.x),
    y: Math.min(textDrag.from.y, textDrag.to.y),
    width: Math.abs(textDrag.to.x - textDrag.from.x) || grid.spacing,
    height: Math.abs(textDrag.to.y - textDrag.from.y) || grid.spacing,
  };
  const hoverCell =
    (tool === 'text' || tool === 'field') && hover && !editing && !textDrag
      ? cellAt(lattice, hover.x, hover.y)
      : null;

  function withCells(mmLabel: string | null, from: Point, to: Point): string | null {
    if (!mmLabel) return null;
    const { cols, rows } = tableSize(lattice, from, to);
    const cellPart = cols === 1 ? `${rows}칸` : rows === 1 ? `${cols}칸` : `${cols} × ${rows}칸`;
    return `${mmLabel} · ${cellPart}`;
  }

  const sizeLabel = (() => {
    if (drag?.kind === 'draw') {
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
      return withCells(sizeLabelOf([{ x1: pending.x, y1: pending.y, x2: hover.x, y2: hover.y }]), pending, hover);
    }
    return null;
  })();

  const toolbar = (
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
            title="잠그면 클릭으로도 감싸기로도 골라지지 않습니다"
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
          <button onClick={finish}>완료</button>
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
              {noGrid ? '격자가 없어 그릴 수 없습니다.' : '클릭해서 고르고, 빈 곳에서 끌어 여러 개를 감쌉니다.'}
            </span>
          )}
        </div>
    </div>
  );

  return (
    <div className="notebook-half-editor">
      {toolbar}

      <div className="notebook-half-editor-canvas">
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
          <rect x={0} y={0} width={insert.width} height={insert.height} className="sheet-bg" />

          <InsertView
            insert={insert}
            grid={grid}
            objects={objects}
            safeZoneWidth={insert.punch.safeZoneWidth}
            hiddenId={editing?.id}
          />

          <g className="picked">
            {objects
              .filter((o) => selectedIds.includes(o.id))
              .map((o) => {
                if (isLine(o)) {
                  const s = preview(o, nudge, grip);
                  return <line key={o.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
                }
                const raw = previewBox({ id: o.id, ...boxOf(o) }, boxGrip);
                const bb = { ...raw, x: raw.x + (nudge?.dx ?? 0), y: raw.y + (nudge?.dy ?? 0) };
                const rot = rotationDegOf(o);
                const rect = (
                  <rect
                    key={rot === 0 ? o.id : undefined}
                    x={bb.x}
                    y={bb.y}
                    width={bb.width}
                    height={bb.height}
                    className={isImage(o) ? 'image-picked' : undefined}
                  />
                );
                if (rot === 0) return rect;
                return (
                  <g key={o.id} transform={rotationOf(bb, rot).svg}>
                    {rect}
                  </g>
                );
              })}
          </g>

          {lone &&
            isLine(lone) &&
            (() => {
              const s = preview(lone, nudge, grip);
              return (
                <g className="handles">
                  <rect x={s.x1 - HANDLE_SIZE / 2} y={s.y1 - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} />
                  <rect x={s.x2 - HANDLE_SIZE / 2} y={s.y2 - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} />
                </g>
              );
            })()}

          {lone &&
            isBoxResizable(lone) &&
            (() => {
              const bb = previewBox({ id: lone.id, ...boxOf(lone) }, boxGrip);
              const rot = rotationDegOf(lone);
              const toDisplay = rot === 0 ? null : rotationOf(bb, rot);
              const corners = [
                { x: bb.x, y: bb.y },
                { x: bb.x + bb.width, y: bb.y },
                { x: bb.x, y: bb.y + bb.height },
                { x: bb.x + bb.width, y: bb.y + bb.height },
              ].map((c) => (toDisplay ? toDisplay.map(c) : c));
              return (
                <g className="handles">
                  {corners.map((c, i) => (
                    <rect key={i} x={c.x - HANDLE_SIZE / 2} y={c.y - HANDLE_SIZE / 2} width={HANDLE_SIZE} height={HANDLE_SIZE} />
                  ))}
                </g>
              );
            })()}

          {ghost?.map((l, i) => <line key={i} {...segProps(l)} stroke={SNAP_COLOR} strokeWidth={0.3} />)}
          {pending && hover && !drag && (
            <line x1={pending.x} y1={pending.y} x2={hover.x} y2={hover.y} stroke={SNAP_COLOR} strokeWidth={0.3} strokeLinecap="round" />
          )}

          {editing && (
            <rect x={editing.box.x} y={editing.box.y} width={editing.box.width} height={editing.box.height} className="editing-box" />
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

          {hoverCell && (
            <rect x={hoverCell.x} y={hoverCell.y} width={hoverCell.width} height={hoverCell.height} className="text-hover" />
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

          {(tool === 'draw' || tool === 'table') && hover && (
            <circle cx={hover.x} cy={hover.y} r={SNAP_DOT_SIZE / 2} fill={SNAP_COLOR} />
          )}
          {pending && <circle cx={pending.x} cy={pending.y} r={SNAP_DOT_SIZE / 2} fill={SNAP_COLOR} />}

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

        {editing && (
          <TextInput
            editing={editing}
            scale={scale}
            svg={svgRef.current}
            inputRef={textInputRef}
            onChange={(text) => setEditing({ ...editing, text })}
            onDone={finishEditing}
          />
        )}
      </div>
    </div>
  );
}
