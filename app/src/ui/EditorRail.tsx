import { useEffect, useRef, useState } from 'react';
import { useActiveWork, useStore, type Tool } from '../store';
import { BASE_KEYS, keyLabel, nextPointKey, refOf } from '../core/colors';
import { colorRefUsage } from '../core/work';
import { todayFrom } from '../core/dated';
import { PagePanel } from './PagePanel';
import { ImageCategoryBody } from './Editor';
import { ColorDefiner } from './ColorControls';
import {
  BracesIcon,
  CalendarIcon,
  CheckboxIcon,
  FieldIcon,
  ImageIcon,
  InsertIcon,
  LineIcon,
  PaletteIcon,
  RoundCursorIcon,
  TableIcon,
  TextIcon,
} from './icons';

/**
 * 작업 탭의 레일과 패널(리뉴얼, 세부계획 A1 결정 · 디자인.md ‘탭’).
 *
 * 레일은 아이콘만 둔다(이름은 마우스를 올리면). 순서는 Select · Page · Draw · Text ·
 * AutoField · Image, 맨 아래에 Colors. 레일 메뉴를 누르면 옆 패널에 그 내용이 열린다.
 * 꾸미기(굵기·색·글꼴 등)는 패널이 아니라 캔버스 위 상황별 막대에 있다(A0 결정).
 */
type Category = 'page' | 'draw' | 'text' | 'auto' | 'image' | 'colors';

const DRAW_TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'draw', label: 'Line · Shape (D)', icon: <LineIcon /> },
  { tool: 'table', label: 'Table (G)', icon: <TableIcon /> },
  { tool: 'checkbox', label: 'Checkbox (X)', icon: <CheckboxIcon /> },
];

const AUTO_TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'field', label: 'Date (F)', icon: <FieldIcon /> },
  { tool: 'calendar', label: 'Calendar (C)', icon: <CalendarIcon /> },
];

/** 도구가 바뀌면 그 도구의 패널이 저절로 열린다 — 단축키로 바꿔도 패널이 따라온다. */
function categoryOfTool(tool: Tool): Category | null {
  if (tool === 'draw' || tool === 'table' || tool === 'checkbox') return 'draw';
  if (tool === 'text') return 'text';
  if (tool === 'field' || tool === 'calendar') return 'auto';
  if (tool === 'image') return 'image';
  return null;
}

export function EditorRail() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const [open, setOpen] = useState<Category | null>(null);

  useEffect(() => {
    const cat = categoryOfTool(tool);
    if (cat) setOpen(cat);
  }, [tool]);

  function toggle(cat: Category, defaultTool?: Tool) {
    if (open === cat) {
      setOpen(null);
      return;
    }
    setOpen(cat);
    if (defaultTool && categoryOfTool(tool) !== cat) setTool(defaultTool);
  }

  const btn = (cat: Category | 'select', title: string, icon: React.ReactNode, onClick: () => void, on: boolean) => (
    <button key={cat} className={`rail-icon ${on ? 'on' : ''}`} onClick={onClick} title={title} aria-label={title}>
      {icon}
    </button>
  );

  return (
    <>
      <div className="rail-icons">
        {btn('select', 'Select (V)', <RoundCursorIcon />, () => {
          setTool('select');
          setOpen(null);
        }, tool === 'select' && open === null)}
        <div className="rail-gap" />
        {btn('page', 'Page', <InsertIcon />, () => toggle('page'), open === 'page')}
        {btn('draw', 'Draw', <LineIcon />, () => toggle('draw', 'draw'), open === 'draw')}
        {btn('text', 'Text (T)', <TextIcon />, () => toggle('text', 'text'), open === 'text')}
        {btn('auto', 'AutoField', <BracesIcon />, () => toggle('auto', 'field'), open === 'auto')}
        {btn('image', 'Image (I)', <ImageIcon />, () => toggle('image', 'image'), open === 'image')}
        <div className="rail-spacer" />
        {btn('colors', 'Colors', <PaletteIcon />, () => toggle('colors'), open === 'colors')}
      </div>
      {open && (
        <aside className="rail-panel">
          <h2 className="rail-panel-title">{TITLES[open]}</h2>
          {open === 'page' && <PagePanel />}
          {open === 'draw' && <ToolTiles items={DRAW_TOOLS} />}
          {open === 'text' && (
            <p className="tool-panel-note">페이지를 눌러 그 칸에 글자를 놓아요. 끌면 여러 칸에 걸친 상자가 돼요. 글꼴·크기·간격은 위쪽 막대에서 바꿔요.</p>
          )}
          {open === 'auto' && (
            <>
              <ToolTiles items={AUTO_TOOLS} />
              <p className="tool-panel-note">칸을 차례로 누르면 날짜가 하나씩 이어져요. 형식은 위쪽 막대에서 골라요.</p>
            </>
          )}
          {open === 'image' && <ImageCategoryBody />}
          {open === 'colors' && <ColorsPanel />}
        </aside>
      )}
    </>
  );
}

const TITLES: Record<Category, string> = {
  page: 'Page',
  draw: 'Draw',
  text: 'Text',
  auto: 'AutoField',
  image: 'Image',
  colors: 'Colors',
};

function ToolTiles({ items }: { items: { tool: Tool; label: string; icon: React.ReactNode }[] }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="tool-tiles">
      {items.map((it) => (
        <button key={it.tool} className={`tool-tile ${tool === it.tool ? 'on' : ''}`} onClick={() => setTool(it.tool)} title={it.label}>
          {it.icon}
          <span>{it.label.replace(/ \(.\)$/, '')}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 작업 색상(세부계획 A13 결정).
 *
 * 칸을 누르면 색 고르기가 열리고, **고르는 동안 미리보기**로 그 칸을 쓰는 객체가 함께
 * 바뀐다. 저장을 누르거나 창 밖을 누르면 확정, 취소(또는 Esc)는 원래 색으로 되돌린다.
 * 칸을 바꾸면 그 칸(이름표)을 쓰는 객체는 찾을 필요 없이 전부 바뀐다.
 */
function ColorsPanel() {
  const work = useActiveWork();
  const today = useStore((s) => s.today);
  const setPaletteColor = useStore((s) => s.setPaletteColor);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const removePaletteColor = useStore((s) => s.removePaletteColor);
  const [editing, setEditing] = useState<{ key: string; original: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 창 밖을 누르면 확정(저장)한다 — 미리보기로 이미 바뀌어 있으므로 닫기만 하면 된다.
  useEffect(() => {
    if (!editing) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setEditing(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && editing) {
        setPaletteColor(editing.key, editing.original);
        setEditing(null);
      }
    }
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [editing, setPaletteColor]);

  if (!work) return null;
  const palette = work.palette;
  const colorOf = (key: string) =>
    (BASE_KEYS as readonly string[]).includes(key)
      ? palette.base[key as (typeof BASE_KEYS)[number]]
      : (palette.points.find((p) => p.key === key)?.color ?? '#000000');

  const usage = editing ? colorRefUsage(work, refOf(editing.key), todayFrom(today)) : null;

  return (
    <div className="colors-panel" ref={boxRef}>
      <div className="colors-label">기본</div>
      <div className="colors-row">
        {BASE_KEYS.map((key) => (
          <button
            key={key}
            className={`color-slot ${editing?.key === key ? 'on' : ''}`}
            style={{ background: palette.base[key] }}
            title={keyLabel(key)}
            onClick={() => setEditing({ key, original: palette.base[key] })}
          />
        ))}
      </div>
      <div className="colors-label">POINT</div>
      <div className="colors-row">
        {palette.points.map((p) => (
          <span key={p.key} className="color-point">
            <button
              className={`color-slot round ${editing?.key === p.key ? 'on' : ''}`}
              style={{ background: p.color }}
              title={`포인트 ${p.key}`}
              onClick={() => setEditing({ key: p.key, original: p.color })}
            />
            <span className="color-point-key">{p.key}</span>
          </span>
        ))}
        <button
          className="color-slot round add"
          title="포인트 색 추가"
          onClick={() => {
            const next = nextPointKey(palette.points);
            addPaletteColor('#8ea8c6');
            setEditing({ key: next, original: '#8ea8c6' });
          }}
        >
          +
        </button>
      </div>

      {editing && (
        <div className="color-editor">
          <div className="color-editor-head">
            <b>{keyLabel(editing.key)}</b>
            {usage && (
              <span className="muted">
                요소 {usage.objects}개 · {usage.faces}페이지
              </span>
            )}
          </div>
          <ColorDefiner
            key={editing.key}
            initial={colorOf(editing.key)}
            onCommit={(c) => setPaletteColor(editing.key, c)}
          />
          <div className="color-editor-actions">
            <button
              className="ghost"
              onClick={() => {
                setPaletteColor(editing.key, editing.original);
                setEditing(null);
              }}
            >
              취소
            </button>
            {!(BASE_KEYS as readonly string[]).includes(editing.key) && (
              <button
                className="ghost danger"
                onClick={() => {
                  if (!window.confirm(`${editing.key}를 지울까요? ${editing.key}를 쓰던 요소는 지금 색으로 고정돼요.`)) return;
                  removePaletteColor(editing.key, colorOf(editing.key));
                  setEditing(null);
                }}
              >
                지우기
              </button>
            )}
            <button className="primary" onClick={() => setEditing(null)}>
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
