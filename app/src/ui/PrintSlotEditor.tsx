import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cellAt, cellsIn, gridArea, gridLattice, tableLines, tableSize, tableSplit } from '../core/grid';
import { checkboxIconBox } from '../core/checkbox';
import { holeCenterX } from '../core/punch';
import { moveDelta, nudgeStep, snapToLattice } from '../core/snap';
import {
  boundsOfObjects,
  boxOf,
  cleanStyle,
  groupIdOf,
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
  type DiaryObject,
  type TextStyle,
} from '../core/objects';
import { SNAP_COLOR, SNAP_DOT_SIZE } from '../core/style';
import { roundMm } from '../core/units';
import { fieldPlaceholder, newTextStyle, parseFieldText } from '../core/text';
import { useObjects, useStore } from '../store';
import { defaultInsert } from '../core/template';
import { DEFAULT_DOT_GRID, type DotGrid } from '../core/grid';
import type { Slot } from '../core/layout';
import { placeSlot } from '../core/place';
import { InsertView } from './InsertView';
import { PunchGuide } from './PunchGuide';
import { StyleBar } from './StyleBar';
import { IMAGE_RESIZE_SNAP_DIST, TextInput } from './EditorTab';
import {
  anyLineHandleAt,
  boxHandleAt,
  centerOnLogoLine,
  editingFor,
  handleAt,
  hitAt,
  merge,
  preview,
  previewBox,
  rectOf,
  resizeTextBoxTo,
  rotationDegOf,
  segProps,
  sizeLabelOf,
  toggleId,
  toLocal,
  withCells,
  DRAG_START,
  HANDLE_SIZE,
  type Drag,
  type Editing,
  type Point,
} from './gestures';

// shadowTemplate이 없을 때만 쓰이는 값(실제로는 안 쓰인다 — 타입만 맞춘다).
const NO_INSERT = defaultInsert();
const NO_GRID: DotGrid = { ...DEFAULT_DOT_GRID };

/**
 * 인쇄하기에서 칸(낱장 조합)·페이지(세트형)를 직접 손보는 캔버스.
 *
 * `store.ts`의 `shadowTemplate`을 그린다 — 실제 그리기 액션(drawLines·
 * commitText 등)은 EditorTab과 똑같은 것을 그대로 부르지만, 그림자가 있는
 * 동안은 그 액션들이 `activeId`가 아니라 그림자를 고친다(store.ts의
 * `patchActiveSide`·`activeObjects` 참고) — 그래서 이 컴포넌트는 자신이
 * 무엇을 편집하는 중인지(낱장 조합 칸인지 세트형 페이지인지) 전혀 몰라도 된다.
 *
 * `EditorTab`의 "속지" 모드(양면 나란히·용지 모드는 뺀, 칸 하나만 그리는 가장
 * 단순한 형태) 그리기 로직을 그대로 옮겨왔다 — 그림자는 항상 앞면이든
 * 뒷면이든 한쪽만 손보는 세션이라(뒷면도 있는 세트형 페이지 등은 각각 별도
 * 세션) 경계를 넘는 선 잇기·양면 나란히는 필요 없다.
 *
 * **캔버스 자리 잡기**: 이 컴포넌트의 SVG는 `viewBox="0 0 insert.width
 * insert.height"`(칸 하나의 속지 mm) 그대로다. 용지 위 이 칸의 자리·회전은
 * 바깥 `<div>`의 CSS `matrix()`로 옮긴다 — `core/place`의 `placeSlot`이 내는
 * SVG `matrix()`를 그대로 CSS `matrix()`로 옮기는 것이다. 이렇게 하면
 * `getScreenCTM()`이 회전·이동을 전부 알아서 반영해줘서, 마우스 좌표가
 * 곧바로 이 칸의 속지 mm로 나온다 — `unplaceSlot`을 손으로 부를 필요가
 * 없다. `TextInput`은 이 바깥 `<div>`를 자기 `svg.parentElement`로 보고
 * 그 안에서 `box.x·y`만큼만 옮기면 되므로, 따로 회전·칸 배치를 알 필요가
 * 없다(EditorTab의 "속지" 모드와 완전히 같은 코드를 그대로 쓴다).
 *
 * **도구막대 자리 잡기**: 칸을 따라다니면 스크롤할 때마다 도구막대가 화면
 * 밖으로 나가버려 불편하다(써보고 나온 피드백). 그래서 도구막대는 이 칸의
 * 자리와 무관하게, `editBarSlot`(App.tsx가 `.print-bar` 바로 아래에 둔
 * 자리)에 `createPortal`로 그린다 — EditorTab의 `.editor-bar`처럼 스크롤
 * 영역(`.stage-area`) 밖에 있어 늘 같은 자리에 고정돼 보인다.
 */
export function PrintSlotEditor({
  slot,
  rotated,
  turn180 = false,
  scale,
  onFinish,
  hasOverride,
  onRevert,
  editBarSlot,
  stylePanelSlot,
}: {
  /** 이 칸의 용지 위 자리(mm). App.tsx가 layout.slots에서 그대로 넘긴다. */
  slot: Slot;
  rotated: boolean;
  /**
   * 반 바퀴 돌린 면(뒷면)의 칸이면 켠다. 미리보기가 그 칸을 돌려 그리므로
   * 편집판도 같이 돌아야 한다 — 안 그러면 손보기를 시작하는 순간 내용이
   * 제자리에서 반 바퀴 튄다.
   */
  turn180?: boolean;
  /** 인쇄하기 탭의 지금 확대 배율(px/mm). */
  scale: number;
  /** "완료" — 진행 중인 글자 입력을 먼저 확정한 뒤 부른다. */
  onFinish: () => void;
  /** 손보기 시작할 때 이미 override가 있었으면 true — "되돌리기" 버튼을 보인다. */
  hasOverride: boolean;
  /** "되돌리기" — override를 지우고 원본 양식을 다시 따르게 한다. */
  onRevert: () => void;
  /** 도구막대를 실제로 그릴 DOM 자리. 아직 안 붙었으면(첫 렌더) null. */
  editBarSlot: HTMLDivElement | null;
  /** 속성 칸(StyleBar)을 그릴 DOM 자리 — ToolRail의 탭 안. */
  stylePanelSlot: HTMLDivElement | null;
}) {
  // useInsert·useDotGrid 대신 그림자 양식을 직접 읽는다 — 그 두 훅은 일부러
  // 그림자를 안 본다(store.ts의 doc 참고, SettingsPanel이 인쇄하기 탭에서도
  // 함께 떠 있어서 그림자를 보면 어긋난 상태가 된다). 이 컴포넌트는
  // shadowTemplate이 있을 때만 부모(App.tsx)가 그려주므로 fallback은
  // 실제로 쓰이지 않는다 — 타입만 맞추는 값이다.
  const shadow = useStore((s) => s.shadowTemplate);
  const side = useStore((s) => s.shadowSide);
  const insert = shadow?.insert ?? NO_INSERT;
  const grid = shadow?.dotGrid ?? NO_GRID;
  const history = useObjects(side);
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
  const resizeObject = useStore((s) => s.resizeObject);
  const textDraftStyle = useStore((s) => s.textDraftStyle);
  const fieldDraftFormat = useStore((s) => s.fieldDraftFormat);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const svgRef = useRef<SVGSVGElement>(null);
  const objects = history.present;
  const lockedCount = objects.filter(isLocked).length;
  const canUngroup = objects.some((o) => selectedIds.includes(o.id) && groupIdOf(o));
  const lattice = gridLattice(
    gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back'),
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

  const logoLineX = holeCenterX(insert.punch, insert.width, side === 'back');

  const draftStyle = newTextStyle(textDraftStyle, grid.spacing);

  const lone = selectedIds.length === 1 ? (objects.find((o) => o.id === selectedIds[0]) ?? null) : null;

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
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'draw', from: snap, to: snap });
      return;
    }

    if (tool === 'draw' && !pending) {
      const grip = anyLineHandleAt(objects, raw);
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
      const hit = hitAt(svgRef.current, objects, raw);
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
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit) {
        select([hit.id]);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    if (tool === 'calendar' || tool === 'image') {
      const boxGripHit = boxHandleAt(lone, raw);
      if (boxGripHit) {
        const to = lone ? toLocal(lone, snap ?? raw) : (snap ?? raw);
        setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to });
        return;
      }
      const hit = hitAt(svgRef.current, objects, raw);
      if (hit) {
        startMove(hit, raw, e);
        return;
      }
      if (snap) setDragBoth({ kind: 'textbox', from: snap, to: snap });
      return;
    }

    const boxGripHit = boxHandleAt(lone, raw);
    if (boxGripHit) {
      const to = lone ? toLocal(lone, snap ?? raw) : (snap ?? raw);
      setDragBoth({ kind: 'boxHandle', id: boxGripHit.id, corner: boxGripHit.corner, to });
      return;
    }

    const grip = handleAt(lone, raw);
    if (grip) {
      setDragBoth({ kind: 'handle', id: grip.id, end: grip.end, to: raw });
      return;
    }

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
      // 이미지만 예외 — 도트 근처면 붙고, 멀면 자유롭게 크기가 바뀐다(EditorTab.tsx와 같은 규칙).
      if (target && isImage(target)) {
        const snap = snapped(e);
        const near = snap && Math.hypot(raw.x - snap.x, raw.y - snap.y) <= IMAGE_RESIZE_SNAP_DIST;
        const chosen = near ? snap! : raw;
        setDragBoth({ ...d, to: toLocal(target, chosen) });
        return;
      }
      const snap = snapped(e);
      if (!snap) return;
      const to = target ? toLocal(target, snap) : snap;
      setDragBoth({ ...d, to });
    } else if (d.kind === 'draw' || d.kind === 'handle' || d.kind === 'textbox') {
      const snap = snapped(e);
      if (!snap) return;
      setDragBoth({ ...d, to: snap });
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
      let { dx, dy } = d;
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
        const { box } = resizeTextBoxTo(target, d.corner, d.to);
        resizeObject(d.id, box);
      } else if (target) {
        // 도형·이미지는 도트 한 칸까지 작아져도 된다 — 달력만 숫자 여러 칸이
        // 든 표라 그 밑으로 가면 못 알아보게 돼 기본값(MIN_BOX_SIZE)을 지킨다.
        const minSize = isShape(target) || isImage(target) ? MIN_FREE_BOX_SIZE : undefined;
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
    const hit = hitAt(svgRef.current, objects, raw);
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

  // 이 칸의 용지 위 자리 — 회전은 여기서(바깥 wrapper의 CSS matrix) 한 번만
  // 반영하고, svg 안쪽(canvasContent)은 항상 회전 없는 속지 좌표를 쓴다.
  const [a, b, c, d, e, f] = placeSlot(slot, rotated, turn180)
    .svg.slice('matrix('.length, -1)
    .split(' ')
    .map(Number);
  const canvasTransform = `matrix(${a}, ${b}, ${c}, ${d}, ${e * scale}, ${f * scale})`;

  const toolbar = (
    <div className="editor-bar">
        <div className="editor-bar-tools">
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
          <button
            className="ghost"
            onClick={groupSelected}
            disabled={selectedIds.length < 2}
            title="여럿을 하나로 묶습니다. 묶은 것 중 하나만 클릭해도 전부 함께 골라집니다"
          >
            그룹화
          </button>
          {canUngroup && (
            <button
              className="ghost"
              onClick={ungroupSelected}
              title="고른 것의 그룹 묶음을 풉니다"
            >
              그룹 해제
            </button>
          )}
          {hasOverride && (
            <button
              className="ghost"
              onClick={onRevert}
              title="여기 직접 손본 내용을 지우고, 원본 양식을 다시 따르게 합니다"
            >
              되돌리기
            </button>
          )}
          <button onClick={finish}>완료</button>
        </div>
    </div>
  );

  return (
    <>
      {editBarSlot && createPortal(toolbar, editBarSlot)}
      {/* 속성 칸은 왼쪽 ToolRail의 탭 안(stylePanelSlot)으로 portal한다 — EditorTab.tsx와 같은 이유. */}
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

      <div
        className="print-slot-editor-canvas"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: canvasTransform,
          transformOrigin: '0 0',
        }}
      >
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
            mirror={side === 'back'}
            hiddenId={editing?.id}
          />

          <PunchGuide
            width={insert.width}
            height={insert.height}
            punch={insert.punch}
            mirror={side === 'back'}
          />

          <g className="picked">
            {objects
              .filter((o) => selectedIds.includes(o.id))
              .map((o) => {
                if (isLine(o)) {
                  const s = preview(o, nudge, grip);
                  return <line key={o.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
                }
                const raw = previewBox(o, boxGrip);
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
              const bb = previewBox(lone, boxGrip);
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
            canvasOffsetX={0}
            inputRef={textInputRef}
            onChange={(text) => setEditing({ ...editing, text })}
            onDone={finishEditing}
          />
        )}
      </div>
    </>
  );
}
