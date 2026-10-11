import { useEffect, useRef, useState } from 'react';
import { useActiveWork, useCursor, useDisplayFace, useEditObjects, useFaces, useHasBack, useSide, useStore, type Tool } from '../store';
import { isCalendar, isCheckbox, isText } from '../core/objects';
import { chipPatch, FIELD_CHIPS, tileOf } from '../core/fieldFormat';
import { AutoFieldTiles, FieldSettings, type AutoTile } from './AutoFieldPanel';
import { CalendarPanelControls, CheckboxIconGrid, FieldToggle } from './ObjectControls';
import { BASE_KEYS, colorOfKey, keyLabel, keyOfRef, nextPointKey, refOf } from '../core/colors';
import type { RuleKey } from '../core/colorRules';
import { HOLIDAY_YEARS, holidayCovered } from '../core/holidays';
import { PopRow } from './Popover';
import { colorRefUsage } from '../core/work';
import { todayFrom } from '../core/dated';
import { PagePanel } from './PagePanel';
import { PeriodPanel } from './PeriodPanel';
import { ImageCategoryBody } from './Editor';
import { ColorDefiner } from './ColorControls';
import {
  BracesIcon,
  CheckboxIcon,
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

  // 무엇을 고르면 그 설정이 있는 패널이 열린다 — 달력·날짜 필드는 AutoField, 체크박스는 Draw.
  const picked = usePicked();
  const fieldIds = usePickedFieldIds();
  const pickedKey = picked.map((o) => o.id).join(',');
  useEffect(() => {
    if (picked.some(isCalendar) || fieldIds.length > 0) setOpen('auto');
    else if (picked.length > 0 && picked.every(isCheckbox)) setOpen('draw');
    // 고른 것이 바뀔 때만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey]);

  // 원본 편집에 들어가면 기간을 고칠 수 있는 AutoField 패널이 열린다(세부계획 A4.6 2-1).
  const sourceKey = useCursor()?.source?.itemId ?? null;
  useEffect(() => {
    if (sourceKey) setOpen('auto');
  }, [sourceKey]);

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
          {open === 'draw' && (
            <>
              <ToolTiles items={DRAW_TOOLS} />
              <CheckboxPanel />
            </>
          )}
          {open === 'text' && <TextPanel />}
          {open === 'auto' && (
            <>
              <AutoFieldPanel />
              <PeriodPanel />
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

      <ColorRulesSection />

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

/**
 * 색 규칙 — 일요일·토요일·공휴일의 날짜 칸·달력 칸 색(세부계획 A13 결정, 작업마다 한 벌).
 * 색은 팔레트 칸 중에서 고른다(이름표라 칸 색을 바꾸면 따라온다). 직접 바꾼 색이 이긴다.
 */
function ColorRulesSection() {
  const work = useActiveWork();
  const setColorRule = useStore((s) => s.setColorRule);
  const faces = useFaces();
  if (!work) return null;
  const palette = work.palette;
  const keys = [...BASE_KEYS, ...palette.points.map((p) => p.key)];
  const swatch = (ref: string | undefined) => {
    if (!ref) return undefined;
    const key = keyOfRef(ref);
    return key === null ? ref : colorOfKey(palette, key);
  };
  // 이 작업의 날짜 중 공휴일 목록이 없는 해 — 그 해에는 공휴일 색이 들지 않는다고 알린다.
  const years = new Set<number>();
  for (const f of faces) for (const d of f.period?.dates ?? []) if (d) years.add(d.year);
  const uncovered = [...years].filter((y) => !holidayCovered(y)).sort();

  return (
    <div className="color-rules">
      <div className="colors-label">색 규칙</div>
      {RULES.map(({ key, label }) => {
        const value = work.colorRules?.[key];
        const known = value === undefined || keys.some((k) => refOf(k) === value);
        return (
          <PopRow key={key} label={label}>
            <span className="rule-swatch" style={{ background: swatch(value) ?? 'transparent' }} />
            <select value={value ?? ''} onChange={(e) => setColorRule(key, e.target.value || undefined)}>
              <option value="">없음</option>
              {keys.map((k) => (
                <option key={k} value={refOf(k)}>
                  {keyLabel(k)}
                </option>
              ))}
              {!known && <option value={value}>직접 고른 색</option>}
            </select>
          </PopRow>
        );
      })}
      <p className="tool-panel-note">
        날짜 칸(Day·Weekday)과 달력에 들어요. 한 날짜에서 직접 바꾼 색이 규칙보다 먼저예요. 공휴일 목록은{' '}
        {HOLIDAY_YEARS.join('·')}년이에요.
        {uncovered.length > 0 && ` ${uncovered.join('·')}년 날짜에는 공휴일 색이 들지 않아요.`}
      </p>
    </div>
  );
}

const RULES: { key: RuleKey; label: string }[] = [
  { key: 'sunday', label: '일요일' },
  { key: 'saturday', label: '토요일' },
  { key: 'holiday', label: '공휴일' },
];

/** 지금 고른 객체들(편집 화면 본체와 같은 쪽 규칙). */
function usePicked() {
  const side = useSide();
  const hasBack = useHasBack();
  const objects = useEditObjects(hasBack ? side : 'front');
  const selectedIds = useStore((s) => s.selectedIds);
  return objects.filter((o) => selectedIds.includes(o.id));
}

/**
 * 고른 것 중 자동 필드의 id. 날짜 페이지의 칸은 날짜가 채워져 `field`가 떨어져 있어서
 * 객체만 보고는 모른다 — 보일 면이 알려주는 `fieldIds`로 본다(core/work).
 */
function usePickedFieldIds(): string[] {
  const side = useSide();
  const hasBack = useHasBack();
  const face = useDisplayFace(hasBack ? side : 'front');
  const picked = usePicked();
  return picked.filter((o) => face?.fieldIds.includes(o.id)).map((o) => o.id);
}

/**
 * AutoField 패널 — 고민해서 정하는 값(종류·형식·몇째 날짜, 달력 구성)은 여기,
 * 글꼴·색·크기는 위쪽 막대(사용자 요청 2026-10-11). 맨 위는 종류 타일 3×3(세부계획 A4.2).
 */
function AutoFieldPanel() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const fieldDraft = useStore((s) => s.fieldDraft);
  const setFieldDraft = useStore((s) => s.setFieldDraft);
  const setField = useStore((s) => s.setField);
  const calendarDraftStyle = useStore((s) => s.calendarDraftStyle);
  const setCalendarDraftStyle = useStore((s) => s.setCalendarDraftStyle);
  const styleCalendar = useStore((s) => s.styleCalendar);
  const picked = usePicked();
  const calendars = picked.filter(isCalendar);
  const fields = picked.filter(isText).filter((t) => t.field);
  const fieldIds = usePickedFieldIds();
  const side = useSide();
  const hasBack = useHasBack();
  const face = useDisplayFace(hasBack ? side : 'front');
  // 날짜 페이지에서 원본의 날짜 칸을 고른 것 — 날짜가 채워져 field가 없다. 형식은 원본에 있다.
  const sourceFieldOnDatePage = fields.length === 0 && fieldIds.length > 0 && !!face?.period;

  const first = fields[0]?.field;
  const active: AutoTile | null =
    calendars.length > 0
      ? 'calendar'
      : first
        ? tileOf(first)
        : sourceFieldOnDatePage
          ? null
          : tool === 'calendar'
            ? 'calendar'
            : tool === 'field'
              ? tileOf(fieldDraft)
              : null;

  function pick(tile: AutoTile) {
    if (tile === 'moon') return;
    if (tile === 'calendar') {
      setTool('calendar');
      return;
    }
    const patch = chipPatch(FIELD_CHIPS[tile][0]);
    // 고른 칸이 있으면 그 칸의 종류를 바꾼다. 없으면 다음에 찍을 칸을 정하고 도구를 든다.
    if (fields.length > 0) {
      setField(patch);
      return;
    }
    setFieldDraft(patch);
    if (tool !== 'field') setTool('field');
  }

  let body: React.ReactNode = null;
  if (calendars.length > 0) {
    body = (
      <>
        <h3 className="panel-sub">달력</h3>
        <CalendarPanelControls items={calendars} apply={styleCalendar} />
      </>
    );
  } else if (first) {
    body = (
      <FieldSettings
        tile={tileOf(first)}
        spec={first}
        apply={setField}
        picked
        offsetMixed={!fields.every((t) => t.field?.offset === first.offset)}
        formatMixed={!fields.every((t) => t.field?.format === first.format && t.field?.kind === first.kind)}
      />
    );
  } else if (sourceFieldOnDatePage) {
    body = (
      <>
        <h3 className="panel-sub">날짜</h3>
        <p className="tool-panel-note">날짜 칸의 형식과 몇째 날짜인지는 원본 편집에서 정해요. 색·글꼴은 이 날짜만 바꿀 수 있어요.</p>
      </>
    );
  } else if (tool === 'calendar') {
    body = (
      <>
        <p className="tool-panel-note">페이지에서 끌어 달력 상자를 그려요. 아래 설정으로 그려져요.</p>
        <CalendarPanelControls items={[calendarDraftStyle]} apply={setCalendarDraftStyle} />
      </>
    );
  } else if (tool === 'field') {
    body = <FieldSettings tile={tileOf(fieldDraft)} spec={fieldDraft} apply={setFieldDraft} picked={false} />;
  } else {
    body = <p className="tool-panel-note">종류를 고르고 페이지를 눌러 칸을 놓아요.</p>;
  }

  return (
    <>
      <AutoFieldTiles active={active} onPick={pick} />
      {body}
    </>
  );
}

/** Draw 패널의 체크박스 아이콘 모양 — 고른 체크박스가 있으면 그것을, 없으면 다음에 찍을 모양. */
function CheckboxPanel() {
  const tool = useStore((s) => s.tool);
  const draft = useStore((s) => s.checkboxDraftStyle);
  const setDraft = useStore((s) => s.setCheckboxDraftStyle);
  const styleCheckbox = useStore((s) => s.styleCheckbox);
  const picked = usePicked().filter(isCheckbox);
  if (picked.length === 0 && tool !== 'checkbox') return null;
  return (
    <>
      <h3 className="panel-sub">체크박스 모양</h3>
      <CheckboxIconGrid items={picked.length > 0 ? picked : [draft]} apply={picked.length > 0 ? styleCheckbox : setDraft} />
    </>
  );
}

/** Text 패널 — 고른 글자를 날짜가 채워지는 글자로 바꿀 수 있다. */
function TextPanel() {
  const texts = usePicked().filter(isText);
  return (
    <>
      <p className="tool-panel-note">페이지를 눌러 그 칸에 글자를 놓아요. 끌면 여러 칸에 걸친 상자가 돼요. 글꼴·크기·색은 위쪽 막대에서 바꿔요.</p>
      {texts.length > 0 && <FieldToggle texts={texts} />}
    </>
  );
}
