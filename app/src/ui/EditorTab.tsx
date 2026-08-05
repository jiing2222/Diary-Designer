import { useEffect, useRef, useState } from 'react';
import { cellAt, gridArea, gridLattice } from '../core/grid';
import { snapToLattice } from '../core/snap';
import { canRedo, canUndo } from '../core/history';
import {
  boundsOf,
  boundsOfObjects,
  boxOf,
  cleanStyle,
  distanceToSegment,
  growBox,
  isLine,
  isText,
  objectInRect,
  rectLines,
  segmentLength,
  type Box,
  type DiaryObject,
  type LineObject,
  type LineSeg,
  type LineStyle,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import { mmToPt, ptToMm, roundMm } from '../core/units';
import { OBJECT_LINE_WIDTH, SNAP_COLOR, SNAP_DOT_SIZE, TEXT_SIZE } from '../core/style';
import { effectiveLineHeight } from '../core/text';
import { useStore } from '../store';
import { InsertView } from './InsertView';
import { PunchGuide } from './PunchGuide';
import { CursorIcon, LineIcon, TextIcon } from './icons';
import { measureTextBox } from './measureText';
import { PX_PER_MM_AT_100 } from './pixels';
import type { Mm } from '../core/units';

const ZOOMS = [50, 75, 100, 150, 200, 300, 400];

/** 선을 집었다고 볼 거리. 0.2mm 선은 손으로 정확히 찍을 수 없다. */
const GRAB: Mm = 1.6;
/** 끝점 손잡이를 집었다고 볼 거리. 선 몸통보다 먼저 집혀야 한다. */
const HANDLE_GRAB: Mm = 2.2;
const HANDLE_SIZE: Mm = 1.8;

type Point = { x: Mm; y: Mm };

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
  const insert = useStore((s) => s.insert);
  const grid = useStore((s) => s.dotGrid);
  const history = useStore((s) => s.objects);
  const tool = useStore((s) => s.tool);
  const selectedIds = useStore((s) => s.selectedIds);
  const setTool = useStore((s) => s.setTool);
  const drawLines = useStore((s) => s.drawLines);
  const select = useStore((s) => s.select);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const moveSelected = useStore((s) => s.moveSelected);
  const reshapeSelected = useStore((s) => s.reshapeSelected);
  const commitText = useStore((s) => s.commitText);
  const textDraftStyle = useStore((s) => s.textDraftStyle);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const [zoom, setZoom] = useState(100);
  const svgRef = useRef<SVGSVGElement>(null);

  /** 마우스가 붙을 자리 */
  const [hover, setHover] = useState<Point | null>(null);
  /** 선의 첫 점을 찍어둔 상태. 다음 클릭에서 선이 완성된다. */
  const [pending, setPending] = useState<Point | null>(null);
  /** 지금 끌고 있는 몸짓. 판단은 ref로, 미리보기는 state로 한다. */
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  /** 입력 중인 글자 상자. 확정하기 전까지는 객체가 아니다. */
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;

  /**
   * 더블클릭으로 도구를 'text'로 바꾸면서 동시에 입력을 여는 순간에만 쓴다.
   *
   * 도구가 바뀌면 아래 useEffect가 진행 중이던 입력을 확정하고 닫는데, 그 도구
   * 전환 자체가 "입력을 열기 위한" 것이면 방금 연 입력이 곧바로 닫혀버린다.
   * 이 순간만 그 정리를 건너뛴다.
   */
  const skipToolResetRef = useRef(false);

  const objects = history.present;
  const lattice = gridLattice(gridArea(insert, grid, insert.punch.safeZoneWidth), grid.spacing);
  const scale = (zoom / 100) * PX_PER_MM_AT_100;
  const noGrid = lattice.xs.length === 0 || lattice.ys.length === 0;

  // 격자점 사이 칸 개수. 도트든 그리드든 줄이든 모양과 무관하게 같은 격자에서 나온다.
  const cellCols = Math.max(0, lattice.xs.length - 1);
  const cellRows = Math.max(0, lattice.ys.length - 1);

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
      // 손이 키보드에 있을 때 도구를 바꾼다.
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'l') setTool('draw');
      if (e.key.toLowerCase() === 't') setTool('text');
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

  /**
   * 그 자리에서 집히는 것. 가장 가까운 것 하나만 고른다.
   *
   * 글자는 **실제로 그려진 크기**로 판정한다. 그 크기는 글꼴이 정하므로 core가 알 수
   * 없지만, 화면에는 이미 그려져 있으니 브라우저에 물어보면 된다. viewBox가 mm라
   * getBBox()가 곧 mm를 돌려준다.
   *
   * 글자를 먼저 본다. 글자가 선 위에 얹혀 있을 때 글자를 집을 수 없으면 곤란하다.
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

    if (tool === 'draw') {
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
      setDragBoth({ kind: 'move', origin: raw, dx: 0, dy: 0, hitId: hit.id });
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

    if (d.kind === 'draw' || d.kind === 'handle' || d.kind === 'textbox') {
      const snap = snapped(e);
      if (snap) setDragBoth({ ...d, to: snap });
    } else if (d.kind === 'marquee') {
      setDragBoth({ ...d, to: raw });
    } else {
      // 이동량을 격자 칸 단위로 맞춘다. 선 자체를 다시 스냅하지 않으므로
      // 길이와 각도가 한 치도 변하지 않는다.
      const step = grid.spacing || 1;
      setDragBoth({
        ...d,
        dx: Math.round((raw.x - d.origin.x) / step) * step,
        dy: Math.round((raw.y - d.origin.y) / step) * step,
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
      if (d.dx === 0 && d.dy === 0) {
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

    if (d.kind === 'textbox') {
      // 한 점에서 뗐으면 그 점이 든 칸 하나, 끌었으면 걸친 칸 전체가 상자다.
      const same = d.from.x === d.to.x && d.from.y === d.to.y;
      const box = same
        ? cellAt(lattice, d.from.x, d.from.y)
        : {
            x: Math.min(d.from.x, d.to.x),
            y: Math.min(d.from.y, d.to.y),
            width: Math.abs(d.to.x - d.from.x),
            height: Math.abs(d.to.y - d.from.y),
          };
      if (box) setEditing({ box, text: '', style: cleanStyle(textDraftStyle) });
      return;
    }

    if (d.kind === 'marquee') {
      const inside = objects.filter((o) => objectInRect(o, rectOf(d.from, d.to)));
      select(e.shiftKey ? merge(selectedIds, inside.map((o) => o.id)) : inside.map((o) => o.id));
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
  const ghost = drag?.kind === 'draw' ? rectLines(drag.from, drag.to) : null;
  const nudge = drag?.kind === 'move' ? drag : null;
  const grip = drag?.kind === 'handle' ? drag : null;
  const textDrag = drag?.kind === 'textbox' ? drag : null;

  // 글자 도구에서 마우스가 올라간 칸. 어디에 쓰일지 미리 보여준다.
  // 이미 상자를 끄는 중이면 그 몸짓(textDrag)이 같은 자리를 대신 보여준다.
  const hoverCell =
    tool === 'text' && hover && !editing && !textDrag ? cellAt(lattice, hover.x, hover.y) : null;

  // 지금 그리는 것의 치수. 면이면 가로 × 세로, 선이면 길이.
  const sizeLabel = (() => {
    if (drag?.kind === 'draw') return sizeLabelOf(rectLines(drag.from, drag.to));
    if (grip && lone && isLine(lone)) return sizeLabelOf([preview(lone, null, grip)]);
    if (pending && hover) {
      return sizeLabelOf([{ x1: pending.x, y1: pending.y, x2: hover.x, y2: hover.y }]);
    }
    return null;
  })();

  return (
    <div className="editor">
      <div className="editor-bar">
        <div className="tools">
          <ToolBtn on={tool === 'select'} onClick={() => setTool('select')} title="고르기 (V)">
            <CursorIcon />
          </ToolBtn>
          <ToolBtn on={tool === 'draw'} onClick={() => setTool('draw')} title="그리기 (L)">
            <LineIcon />
          </ToolBtn>
          <ToolBtn on={tool === 'text'} onClick={() => setTool('text')} title="글자 (T)">
            <TextIcon />
          </ToolBtn>
        </div>

        {selectedIds.length > 0 || tool === 'draw' || tool === 'text' ? (
          <StyleBar editing={editing} setEditingStyle={setEditingStyle} />
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
              setEditing({ box: cell, text: '', style: cleanStyle(textDraftStyle) });
            }
          }}
        >
          <rect x={0} y={0} width={insert.width} height={insert.height} className="sheet-bg" />

          <InsertView
            insert={insert}
            grid={grid}
            // 고치는 중인 글자는 감춘다. 입력칸이 같은 자리에 겹쳐 있어서, 둘 다
            // 보이면 어느 게 지금 치는 내용인지 헷갈린다.
            objects={editing?.id ? objects.filter((o) => o.id !== editing.id) : objects}
            safeZoneWidth={insert.punch.safeZoneWidth}
          />

          <PunchGuide height={insert.height} punch={insert.punch} />

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
                const b = boxOf(o);
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
          {tool === 'draw' && hover && (
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
            spacing={grid.spacing}
            svg={svgRef.current}
            onChange={(text) => {
              // 칸 하나만 누르고 길게 써도 매번 손으로 늘릴 필요가 없다 — 실제로
              // 필요한 크기를 재서 모자라면 격자 칸 단위로 키운다. 왼쪽 위는 그대로다.
              const size = editing.style.size ?? TEXT_SIZE;
              const required = measureTextBox(text, size, grid.spacing);
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
        {hover && (
          <span>
            {hover.x} , {hover.y} mm
          </span>
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
  spacing,
  svg,
  onChange,
  onDone,
}: {
  editing: Editing;
  scale: number;
  spacing: Mm;
  svg: SVGSVGElement | null;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { box } = editing;
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
        // 도트 간격을 그대로 줄 간격으로 쓴다 — core/text의 effectiveLineHeight와
        // 같은 규칙이라야 타이핑 중과 커밋 후가 같은 자리로 보인다.
        lineHeight: `${effectiveLineHeight(size, spacing) * scale}px`,
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
      onBlur={onDone}
    />
  );
}

/* ─────────────────────────── 속성 막대 ─────────────────────────── */

const WIDTHS: Mm[] = [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8];
const TEXT_SIZES_PT = [6, 7, 8, 9, 10, 11, 12, 14, 18, 24];
const COLORS: { id: string; label: string }[] = [
  { id: '#cfcfcf', label: '아주 연하게' },
  { id: '#9e9e9e', label: '연하게' },
  { id: '#6e6e6e', label: '중간' },
  { id: '#3a3a3a', label: '진하게' },
  { id: '#000000', label: '검정' },
];

/**
 * 굵기·색·모양.
 *
 * 셋 중 하나를 보여준다.
 *   1. 지금 입력 중인 글자가 있으면 — 그 상자 자체의 스타일. 즉시 반영된다
 *   2. 고른 것이 있으면 — 그것들의 값
 *   3. 아무것도 없으면 — **앞으로 그릴/쓸 것**의 기본 모양. 도구가 선이면 선,
 *      글자면 글자다. 만들기 전에 무엇이 나올지 보이는 편이 낫다
 *
 * 정하지 않은 값은 `기본`이고 옆에 실제 값을 적어둔다. `기본`을 고르면 값을 지워서
 * 다시 core/style을 따라가게 만든다 — 나중에 기본값을 바꾸면 같이 따라온다.
 * 여러 개를 골랐는데 값이 서로 다르면 `—`로 두고, 고르면 전부에 적용한다.
 */
function StyleBar({
  editing,
  setEditingStyle,
}: {
  editing: Editing | null;
  setEditingStyle: (patch: TextStyle) => void;
}) {
  const objects = useStore((s) => s.objects.present);
  const selectedIds = useStore((s) => s.selectedIds);
  const styleSelected = useStore((s) => s.styleSelected);
  const styleText = useStore((s) => s.styleText);
  const drawStyle = useStore((s) => s.drawStyle);
  const setDrawStyle = useStore((s) => s.setDrawStyle);
  const textDraftStyle = useStore((s) => s.textDraftStyle);
  const setTextDraftStyle = useStore((s) => s.setTextDraftStyle);
  const tool = useStore((s) => s.tool);

  // 입력 중인 상자가 있으면 그것부터 — 지금 쓰고 있는 글자를 고치는 게 우선이다.
  if (editing) {
    return (
      <div className="stylebar">
        <span className="picked-count">쓰는 중</span>
        <span className="size-readout">
          {roundMm(editing.box.width, 1)} × {roundMm(editing.box.height, 1)}mm
        </span>
        <TextControls items={[editing.style]} apply={setEditingStyle} />
      </div>
    );
  }

  const picked = objects.filter((o) => selectedIds.includes(o.id));
  const pickedLines = picked.filter(isLine);
  const pickedTexts = picked.filter(isText);
  const size = boundsOfObjects(picked);

  // 글자를 골랐거나 글자 도구를 쓰는 중이면 글자 속성을, 아니면 선 속성을 보여준다.
  const showText = tool === 'text' || (pickedTexts.length > 0 && pickedLines.length === 0);

  return (
    <div className="stylebar">
      {picked.length > 0 ? (
        <>
          <span className="picked-count">{picked.length}개</span>
          {size && (
            <span className="size-readout">
              {roundMm(size.width, 1)} × {roundMm(size.height, 1)}mm
            </span>
          )}
        </>
      ) : (
        <span className="picked-count muted-label">{tool === 'text' ? '쓸 글자' : '그릴 선'}</span>
      )}

      {showText ? (
        <TextControls
          items={pickedTexts.length > 0 ? pickedTexts : [textDraftStyle]}
          apply={pickedTexts.length > 0 ? styleText : setTextDraftStyle}
        />
      ) : (
        <LineControls
          lines={pickedLines}
          draft={picked.length === 0 ? drawStyle : null}
          apply={picked.length > 0 ? styleSelected : setDrawStyle}
        />
      )}
    </div>
  );
}

/** 선의 굵기·색·모양. 고른 것이 없으면 앞으로 그을 선의 값이다. */
function LineControls({
  lines,
  draft,
  apply,
}: {
  lines: LineObject[];
  draft: LineStyle | null;
  apply: (patch: LineStyle) => void;
}) {
  const editing = lines.length > 0;
  const mixed = (key: 'width' | 'color' | 'dash') =>
    editing && !lines.every((o) => o[key] === lines[0][key]);
  const val = (key: 'width' | 'color' | 'dash') =>
    mixed(key) ? 'mixed' : ((editing ? lines[0][key] : draft?.[key]) ?? '');

  return (
    <>
      <select
        value={val('width')}
        onChange={(e) => apply({ width: e.target.value ? Number(e.target.value) : undefined })}
        title="굵기"
      >
        {mixed('width') && <option value="mixed">—</option>}
        <option value="">기본 {OBJECT_LINE_WIDTH}mm</option>
        {WIDTHS.map((w) => (
          <option key={w} value={w}>
            {w}mm
          </option>
        ))}
      </select>

      <select
        value={val('color')}
        onChange={(e) => apply({ color: e.target.value || undefined })}
        title="색"
      >
        {mixed('color') && <option value="mixed">—</option>}
        <option value="">기본 연회색</option>
        {COLORS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={val('dash')}
        onChange={(e) => apply({ dash: (e.target.value || undefined) as never })}
        title="모양"
      >
        {mixed('dash') && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
      </select>
    </>
  );
}

/**
 * 글자의 크기·정렬·색.
 *
 * `items`는 지금 값을 읽어올 대상들이다 — 고른 글자 여럿, 입력 중인 상자 하나,
 * 혹은 앞으로 쓸 글자의 기본값 하나. 무엇이든 굵기·색·모양과 같은 모양(TextStyle)
 * 이라 이 컴포넌트 하나로 다 다룬다.
 *
 * 크기만 pt로 주고받는다. 문서 프로그램에서 쓰던 단위라 감이 있기 때문이고,
 * 저장은 mm로 한다 — 모든 좌표는 mm라는 규칙을 지키기 위해서다.
 */
function TextControls({
  items,
  apply,
}: {
  items: TextStyle[];
  apply: (patch: TextStyle) => void;
}) {
  const mixed = (key: keyof TextStyle) => !items.every((o) => o[key] === items[0][key]);
  const val = (key: keyof TextStyle) => (mixed(key) ? 'mixed' : (items[0][key] ?? ''));

  const sizePt = mixed('size')
    ? 'mixed'
    : items[0].size
      ? String(Math.round(mmToPt(items[0].size) * 10) / 10)
      : '';

  return (
    <>
      <select
        value={sizePt}
        onChange={(e) => apply({ size: e.target.value ? ptToMm(Number(e.target.value)) : undefined })}
        title="크기"
      >
        {mixed('size') && <option value="mixed">—</option>}
        <option value="">기본 {Math.round(mmToPt(TEXT_SIZE))}pt</option>
        {TEXT_SIZES_PT.map((p) => (
          <option key={p} value={p}>
            {p}pt
          </option>
        ))}
      </select>

      <select
        value={val('align')}
        onChange={(e) => apply({ align: (e.target.value || undefined) as never })}
        title="가로 정렬"
      >
        {mixed('align') && <option value="mixed">—</option>}
        <option value="">왼쪽</option>
        <option value="center">가운데</option>
        <option value="right">오른쪽</option>
      </select>

      <select
        value={val('valign')}
        onChange={(e) => apply({ valign: (e.target.value || undefined) as never })}
        title="세로 정렬"
      >
        {mixed('valign') && <option value="mixed">—</option>}
        <option value="top">상단</option>
        <option value="">중단</option>
        <option value="bottom">하단</option>
      </select>

      <select
        value={val('color')}
        onChange={(e) => apply({ color: e.target.value || undefined })}
        title="색"
      >
        {mixed('color') && <option value="mixed">—</option>}
        <option value="">기본</option>
        {COLORS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </>
  );
}

/* ─────────────────────────── 몸짓 ─────────────────────────── */

/** 지금 입력 중인 글자 상자. 확정하기 전까지는 객체가 아니다. */
type Editing = { box: Box; text: string; style: TextStyle; id?: string };

/** 있는 글자를 고치기 시작할 때, 그 글자의 스타일을 그대로 물려받는다. */
function editingFor(t: TextObject): Editing {
  return {
    box: boxOf(t),
    text: t.text,
    style: cleanStyle({ size: t.size, align: t.align, valign: t.valign, color: t.color }),
    id: t.id,
  };
}

type Drag =
  | { kind: 'draw'; from: Point; to: Point }
  | { kind: 'textbox'; from: Point; to: Point }
  | { kind: 'marquee'; from: Point; to: Point }
  | { kind: 'move'; origin: Point; dx: Mm; dy: Mm; hitId: string | null }
  | { kind: 'handle'; id: string; end: 1 | 2; to: Point };

function rectOf(a: Point, b: Point) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * 치수 글자.
 *
 * 선 하나면 길이, 여러 개면 감싸는 네모의 가로 × 세로.
 * 면은 선 네 개라 "면의 크기"라는 값이 따로 없고 감싸는 네모가 곧 그 크기다.
 */
export function sizeLabelOf(segs: LineSeg[]): string | null {
  if (segs.length === 0) return null;
  const mm = (v: number) => roundMm(v, 1);

  if (segs.length === 1) {
    const s = segs[0];
    // 가로선·세로선은 길이만으로 충분하다. 대각선은 몇 칸짜리인지도 알아야 한다.
    if (s.x1 === s.x2 || s.y1 === s.y2) return `${mm(segmentLength(s))}mm`;
    const b = boundsOf(segs)!;
    return `${mm(b.width)} × ${mm(b.height)}mm`;
  }

  const b = boundsOf(segs);
  return b ? `${mm(b.width)} × ${mm(b.height)}mm` : null;
}

/**
 * 지금 끄는 중이면 놓았을 때의 모습, 아니면 있는 그대로.
 *
 * 진짜 값은 손을 뗄 때 한 번만 바꾼다. 끄는 동안 상태를 계속 고치면
 * 실행취소가 마우스 움직임 하나하나로 쪼개진다.
 */
function preview(o: LineObject, nudge: { dx: Mm; dy: Mm } | null, grip: GripDrag | null): LineSeg {
  if (grip && grip.id === o.id) {
    return grip.end === 1
      ? { x1: grip.to.x, y1: grip.to.y, x2: o.x2, y2: o.y2 }
      : { x1: o.x1, y1: o.y1, x2: grip.to.x, y2: grip.to.y };
  }
  const dx = nudge?.dx ?? 0;
  const dy = nudge?.dy ?? 0;
  return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
}

type GripDrag = Extract<Drag, { kind: 'handle' }>;

function segProps(l: LineSeg) {
  return { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 };
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function merge(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
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
