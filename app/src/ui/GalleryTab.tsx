import { useEffect, useState } from 'react';
import {
  insertFromPreset,
  outsideCount,
  sizeLabel,
  type InsertSetting,
  type Template,
  type TemplateKind,
} from '../core/template';
import {
  familyOf,
  SIZE_FAMILIES,
  type InsertPreset,
  type SizeFamilyId,
} from '../core/presets';
import { notebookInsertSize } from '../core/notebook';
import { INSERT_PRESETS, PAPER_PRESETS, useInsert, useStore } from '../store';
import {
  DEFAULT_DOT_GRID,
  gridArea,
  gridLattice,
  spacingForCells,
  type DotGrid,
  type GridStyle,
} from '../core/grid';
import { roundMm } from '../core/units';
import { InsertView } from './InsertView';
import { FontManagePanel, ImageManagePanel } from './DesignLibraryDialog';

/**
 * 왼쪽 줄에서 무엇을 보고 있는지.
 *
 * 규격 갈래(`SizeFamilyId`)와 나란히 두지 않고 따로 둔 이유는, 이미지·글꼴은
 * 양식이 아니라서 "규격으로 거른다"는 말 자체가 성립하지 않기 때문이다.
 */
type GalleryView = { kind: 'templates'; family: SizeFamilyId | 'all' } | { kind: 'images' } | { kind: 'fonts' };

/**
 * 규격 한 칸 — 화면에 실제로 그려지는 한 덩어리.
 *
 * 양식이 하나도 없는 규격도 칸을 만든다. 빈 칸에는 "New template"만 놓여서,
 * **아직 안 만든 규격이 무엇인지도 한눈에 보인다** — 예전에는 이미 만든
 * 규격만 나와서, M5로 하나 만들려면 새 양식 창을 열어 규격을 다시 골라야 했다.
 */
interface SizeSection {
  key: string;
  label: string;
  /** 이 칸의 `New template`이 쓸 규격. 프리셋이 없는(custom) 칸은 없다. */
  preset: InsertPreset | null;
  templates: Template[];
}

/**
 * 양식 관리 — 만들어둔 속지들을 한눈에 본다.
 *
 * **크기별로 묶어서 보여준다.** 양식이 크기를 소유하는 것이 아니라 크기를
 * 속성으로 가지므로(core/template), 여기서는 그 속성으로 줄을 세울 뿐이다.
 * 같은 M6 양식이 열 개여도 된다.
 *
 * 왼쪽 줄에서 규격 갈래를 골라 걸러 볼 수 있고, 이미지·글꼴 관리도 같은
 * 줄에 있다 — 예전에는 "디자인 관리" 버튼을 눌러 창을 띄웠는데, 창을 띄우면
 * 양식 목록이 가려져서 오가며 비교할 수가 없었다.
 *
 * 썸네일은 편집 화면과 **같은 InsertView**를 작게 그린 것이다. 따로 이미지를
 * 만들지 않는다 — 화면이 이미 SVG로 그리고 있어서 그대로 미리보기가 된다.
 * 양식이 수십 개가 되면 SVG를 수십 장 그리게 되는데, 느려지면 그때 손본다.
 */
export function GalleryTab({ onEdit }: { onEdit: () => void }) {
  const templates = useStore((s) => s.templates);
  const activeId = useStore((s) => s.activeId);
  const addTemplate = useStore((s) => s.addTemplate);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<GalleryView>({ kind: 'templates', family: 'all' });

  const sections = sizeSections(templates, view.kind === 'templates' ? view.family : 'all');

  function newFrom(section: SizeSection) {
    // 프리셋 칸은 그 규격으로 바로 만든다 — 규격을 이미 골라서 누른 것이라
    // 창을 한 번 더 띄우면 같은 것을 두 번 고르게 된다. 프리셋이 없는
    // custom 칸만 창을 띄운다(크기를 물어봐야 하므로).
    if (!section.preset) {
      setCreating(true);
      return;
    }
    addTemplate(insertFromPreset(section.preset.id), undefined, undefined, 'insert');
    onEdit();
  }

  return (
    <div className="gallery">
      <GalleryRail view={view} setView={setView} onNew={() => setCreating(true)} />

      <div className="gallery-body">
        {view.kind === 'images' ? (
          <ImageManagePanel />
        ) : view.kind === 'fonts' ? (
          <FontManagePanel />
        ) : (
          sections.map((s) => (
            <section key={s.key} className="gallery-group">
              <h2>
                {s.label}
                <span className="count">{s.templates.length}</span>
              </h2>
              <div className="gallery-grid">
                {s.templates.map((t) => (
                  <Card key={t.id} template={t} active={t.id === activeId} onEdit={onEdit} />
                ))}
                <button className="card-add" onClick={() => newFrom(s)} title={`New ${s.label} template`}>
                  <span className="card-add-plus">+</span>
                  <span>New template</span>
                </button>
              </div>
            </section>
          ))
        )}
      </div>

      {creating && (
        <NewTemplateDialog
          onClose={() => setCreating(false)}
          onCreate={(insert, name, grid, kind) => {
            addTemplate(insert, name, grid, kind);
            setCreating(false);
            onEdit();
          }}
        />
      )}
    </div>
  );
}

/**
 * 화면에 그릴 규격 칸들.
 *
 * 프리셋 순서를 그대로 따르고(presets.ts), 프리셋에 없는 크기로 만든 양식은
 * 맨 앞 `Custom` 칸에 모은다. 갈래를 고르면 그 갈래만 남긴다.
 *
 * **양식이 없는 프리셋 칸도 남긴다** — 그것이 이 화면의 요점이다(SizeSection
 * 주석). 다만 custom 칸은 양식이 있을 때만 만든다. 프리셋에 없는 크기는
 * 무한히 많아서 "아직 안 만든 것"을 보여준다는 말이 성립하지 않는다.
 */
function sizeSections(templates: Template[], family: SizeFamilyId | 'all'): SizeSection[] {
  const sections: SizeSection[] = [];

  for (const preset of INSERT_PRESETS) {
    if (family !== 'all' && familyOf(preset.id) !== family) continue;
    sections.push({
      key: preset.id,
      label: `${preset.name} · ${preset.width} × ${preset.height}mm`,
      preset,
      templates: templates.filter((t) => t.insert.presetId === preset.id),
    });
  }

  // 맨 끝에 둔다. 프리셋을 먼저 훑고 "여기 없네" 싶을 때 눈이 닿는 자리다.
  if (family === 'all' || family === 'custom') {
    sections.push({
      key: 'custom',
      label: 'Custom sizes',
      preset: null,
      templates: templates.filter((t) => familyOf(t.insert.presetId) === 'custom'),
    });
  }

  return sections;
}

/**
 * 왼쪽 줄 — 무엇을 볼지 고른다.
 *
 * 아이콘 아래에 아주 작은 글자를 붙인다. 아이콘만 두면 처음 온 사람은
 * 눌러보기 전까지 무엇인지 알 수 없고, 글자만 두면 이 좁은 줄에 안 들어간다.
 */
function GalleryRail({
  view,
  setView,
  onNew,
}: {
  view: GalleryView;
  setView: (v: GalleryView) => void;
  onNew: () => void;
}) {
  const isTemplates = view.kind === 'templates';

  return (
    <div className="gallery-rail">
      <RailBtn
        on={isTemplates && view.family === 'all'}
        label="All"
        onClick={() => setView({ kind: 'templates', family: 'all' })}
      >
        <AllIcon />
      </RailBtn>
      <RailBtn on={view.kind === 'images'} label="Images" onClick={() => setView({ kind: 'images' })}>
        <ImageIcon />
      </RailBtn>
      <RailBtn on={view.kind === 'fonts'} label="Fonts" onClick={() => setView({ kind: 'fonts' })}>
        <span className="rail-aa">Aa</span>
      </RailBtn>
      {/*
        이것만 화면을 바꾸지 않고 창을 띄운다 — 규격을 고르는 일이라
        "무엇을 볼지"와 성격이 다르다. 그래서 눌러도 켜진 채로 남지 않는다.
      */}
      <RailBtn on={false} label="New" onClick={onNew}>
        <PlusIcon />
      </RailBtn>

      <div className="rail-divider" />

      {SIZE_FAMILIES.map((f) => (
        <RailBtn
          key={f.id}
          on={isTemplates && view.family === f.id}
          label={f.label}
          onClick={() => setView({ kind: 'templates', family: f.id })}
        >
          <FamilyIcon id={f.id} />
        </RailBtn>
      ))}
    </div>
  );
}

function RailBtn({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`rail-tab ${on ? 'on' : ''}`} onClick={onClick} title={label} aria-pressed={on}>
      {children}
      <span className="rail-tab-label">{label}</span>
    </button>
  );
}

/* 갈래마다 속지 비율을 닮은 네모를 그린다 — 이름을 못 읽어도 모양으로 가늠된다. */
function FamilyIcon({ id }: { id: SizeFamilyId }) {
  if (id === 'custom') {
    return (
      <svg width="16" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2">
        <rect x="5" y="3" width="14" height="18" rx="1" />
      </svg>
    );
  }
  if (id === 'etc') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="8.5" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  // A5/A6는 넓적하고 M6/M5는 갸름하다 — 실제 비율을 따른다.
  const [x, w] = id === 'a5a6' ? [4, 16] : [7, 10];
  return (
    <svg width="18" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x={x} y="3" width={w} height="18" rx="1" />
    </svg>
  );
}

function AllIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="9" rx="1" />
      <rect x="13" y="4" width="7" height="6" rx="1" />
      <rect x="13" y="12" width="7" height="8" rx="1" />
      <rect x="4" y="15" width="7" height="5" rx="1" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M5 17l4.5-5 3 3 3-4 4.5 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * 새 양식 — 규격을 고르고 만든다.
 *
 * **처음부터 하나가 골라져 있다.** 지금 보던 양식의 규격이다. 대부분 한 규격으로
 * 계속 작업하므로, 그대로 `만들기`를 누르면 예전과 같은 결과가 된다. 규격을
 * 바꾸고 싶을 때만 손이 더 간다.
 *
 * 이름도 미리 채워둔다. 비워두면 자동 이름이 붙으므로 그냥 Enter를 쳐도 된다.
 */
function NewTemplateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (insert: InsertSetting, name: string, grid: DotGrid, kind: TemplateKind) => void;
}) {
  // 양식이 없으면(처음 열었을 때) 기본 규격에서 시작한다.
  const current = useInsert();
  const paper = useStore((s) => s.paper);
  const setPaperPreset = useStore((s) => s.setPaperPreset);

  const [kind, setKind] = useState<TemplateKind>('insert');
  const [presetId, setPresetId] = useState(current.presetId);
  // 노트일 때는 이 width·height가 "완성 페이지" 크기다 — 실제로 그리는
  // 양식의 가로는 이 값의 두 배다(notebookInsertSize).
  const [width, setWidth] = useState(current.width);
  const [height, setHeight] = useState(current.height);
  const [name, setName] = useState('');
  const [grid, setGrid] = useState<DotGrid>({ ...DEFAULT_DOT_GRID });
  /**
   * 간격을 직접 칠지, By cell count 셀지.
   *
   * **간격은 가로·세로가 하나뿐이다.** 그래서 한 축의 칸 수를 정하면 다른 축은
   * 거기서 따라 나온다. 둘 다 마음대로 정하면 칸이 정사각형이 아니게 되고,
   * 그러면 도트 격자라고 부를 수 없다.
   */
  const [byCells, setByCells] = useState(false);
  const [cellAxis, setCellAxis] = useState<'x' | 'y'>('x');
  const [cells, setCells] = useState(10);

  const insert: InsertSetting =
    kind === 'notebook'
      ? { presetId: 'custom', ...notebookInsertSize(width, height), punch: { ...current.punch, show: false } }
      : presetId === 'custom'
        ? { presetId, width, height, punch: { ...current.punch } }
        : { ...insertFromPreset(presetId, current), width, height };

  // By cell count 만들면 여기서 간격이 나온다. 딱 나누어떨어져 잘리는 칸이 없다.
  // 실제로 그려지는 양식 크기(insert)를 쓴다 — 노트는 완성 페이지(width state)의
  // 두 배라서, 여기서 페이지 크기를 쓰면 칸 수가 절반으로 어긋난다.
  const spacing = byCells
    ? spacingForCells(cellAxis === 'x' ? insert.width : insert.height, cells, grid.toEdge ? 0 : grid.minMargin)
    : grid.spacing;

  // 지금 값으로 만들면 실제로 몇 칸이 되는지. 다른 축은 여기서 따라 나온다.
  const area = gridArea(insert, grid, insert.punch.safeZoneWidth);
  const preview = gridLattice(area, spacing, grid.minMargin, grid.toEdge);

  function pickPreset(id: string) {
    setPresetId(id);
    if (id === 'custom') return;
    const next = insertFromPreset(id, current);
    setWidth(next.width);
    setHeight(next.height);
  }

  function create() {
    if (width <= 0 || height <= 0 || spacing <= 0) return;
    onCreate(insert, name, { ...grid, spacing }, kind);
  }

  return (
    <Modal title="New template" onClose={onClose}>
      <div className="modal-row">
        <label className="modal-check">
          <input type="radio" checked={kind === 'insert'} onChange={() => setKind('insert')} />
          Insert — sits in a ring binder
        </label>
        <label className="modal-check">
          <input type="radio" checked={kind === 'notebook'} onChange={() => setKind('notebook')} />
          Notebook — bound with staples/thread
        </label>
      </div>

      {kind === 'insert' ? (
        <>
          <p className="modal-note">Which insert size?</p>

          <div className="preset-list">
            {INSERT_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset ${presetId === p.id ? 'on' : ''}`}
                onClick={() => pickPreset(p.id)}
              >
                <b>{p.name}</b>
                <span>
                  {p.width} × {p.height}mm
                </span>
              </button>
            ))}
            <button
              className={`preset ${presetId === 'custom' ? 'on' : ''}`}
              onClick={() => pickPreset('custom')}
            >
              <b>Custom</b>
              <span>Enter size</span>
            </button>
          </div>

          {presetId === 'custom' && (
            <div className="card-dialog-size">
              <input
                type="number"
                value={width}
                min={10}
                step={1}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
              <span>×</span>
              <input
                type="number"
                value={height}
                min={10}
                step={1}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
              <span>mm</span>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="modal-note">Size of one finished page. No punch holes.</p>
          <div className="card-dialog-size">
            <input
              type="number"
              value={width}
              min={10}
              step={1}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
            <span>×</span>
            <input
              type="number"
              value={height}
              min={10}
              step={1}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
            <span>mm</span>
          </div>
          <p className="modal-note">
            Folded down the middle, so the sheet you draw on is{' '}
            <b>
              {insert.width} × {insert.height}mm
            </b>
            .
          </p>
        </>
      )}

      <div className="modal-divider" />
      <p className="modal-note">Paper — what you print on. Applies to the whole project.</p>
      <div className="modal-row">
        <select value={paper.presetId} onChange={(e) => setPaperPreset(e.target.value)}>
          {PAPER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.width} × {p.height}mm
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="modal-divider" />
      <p className="modal-note">Dot grid</p>

      <div className="modal-row">
        <select
          value={grid.style}
          onChange={(e) => setGrid({ ...grid, style: e.target.value as GridStyle })}
        >
          <option value="dot">Dots</option>
          <option value="grid">Grid</option>
          <option value="horizontal">Horizontal lines</option>
          <option value="vertical">Vertical lines</option>
        </select>

        <label className="modal-check">
          <input
            type="checkbox"
            checked={grid.toEdge}
            onChange={(e) => setGrid({ ...grid, toEdge: e.target.checked })}
          />
          Fill to edge
        </label>
      </div>

      <div className="modal-row">
        <label className="modal-check">
          <input type="radio" checked={!byCells} onChange={() => setByCells(false)} />
          By spacing
        </label>
        <label className="modal-check">
          <input type="radio" checked={byCells} onChange={() => setByCells(true)} />
          By cell count
        </label>
      </div>

      {byCells ? (
        <div className="modal-row">
          <select value={cellAxis} onChange={(e) => setCellAxis(e.target.value as 'x' | 'y')}>
            <option value="x">Cols</option>
            <option value="y">Rows</option>
          </select>
          <input
            type="number"
            className="modal-num"
            value={cells}
            min={1}
            step={1}
            onChange={(e) => setCells(Math.max(1, Math.round(Number(e.target.value))))}
          />
          <span className="modal-unit">cells</span>
        </div>
      ) : (
        <div className="modal-row">
          <input
            type="number"
            className="modal-num"
            value={grid.spacing}
            min={0.5}
            step={0.5}
            onChange={(e) => setGrid({ ...grid, spacing: Number(e.target.value) })}
          />
          <span className="modal-unit">mm</span>
        </div>
      )}

      {/* 지금 값으로 만들면 어떻게 되는지. 잘린 띠는 칸으로 세지 않는다. */}
      <p className="modal-result">
        {preview.cols > 0 && preview.rows > 0 ? (
          <>
            <b>
              {preview.cols} × {preview.rows} cells
            </b>
            {' · spacing '}
            {roundMm(spacing, 2)}mm
            {grid.toEdge ? '' : ` · margin ${roundMm(preview.marginX, 1)}mm`}
          </>
        ) : (
          <span className="warn">Spacing is wider than the insert — no grid fits.</span>
        )}
      </p>

      <div className="modal-divider" />
      <label className="modal-field">
        Name
        <input
          value={name}
          placeholder="Leave blank for an automatic name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
      </label>

      <div className="card-dialog-actions">
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" onClick={create}>
          Create
        </button>
      </div>
    </Modal>
  );
}

/**
 * 화면 한가운데 띄우는 창.
 *
 * 바깥을 누르거나 Esc로 닫힌다. 창 안쪽 클릭이 바깥으로 새어나가 저절로 닫히는
 * 일이 없도록 배경에서만 닫기를 받는다.
 */
export function Modal({
  title,
  onClose,
  children,
  size = 'normal',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 'large' — 디자인 관리처럼 훑어볼 게 많은 창. 기본은 지금까지의 좁은 팝업. */
  size?: 'normal' | 'large';
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className={`modal ${size === 'large' ? 'modal-large' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * 양식 하나.
 *
 * 누르면 그 양식으로 넘어가 편집 화면이 열린다.
 *
 * **관리 동작(이름·복제·삭제)은 마우스를 올려야 나타난다.** 늘 보이면 카드
 * 열 개가 늘어선 화면이 버튼 서른 개로 뒤덮인다 — 정작 봐야 할 썸네일보다
 * 버튼이 더 눈에 띈다. 키보드로 쓰는 사람을 위해 카드 안 어디든 초점이
 * 들어오면 함께 나타난다(`:focus-within`).
 *
 * 이름은 클릭하면 그 자리에서 고쳐진다 — 예전에는 "이름" 버튼을 눌러야
 * 입력칸으로 바뀌었는데, 이름을 고치려고 버튼을 찾는 것보다 이름을 직접
 * 누르는 쪽이 먼저 떠오른다.
 */
function Card({
  template,
  active,
  onEdit,
}: {
  template: Template;
  active: boolean;
  onEdit: () => void;
}) {
  const selectTemplate = useStore((s) => s.selectTemplate);
  const renameTemplate = useStore((s) => s.renameTemplate);
  const removeTemplate = useStore((s) => s.removeTemplate);

  const [renaming, setRenaming] = useState(false);
  const [copying, setCopying] = useState(false);

  const t = template;
  const objects = t.objects.present;

  return (
    <div className={`card ${active ? 'on' : ''}`}>
      <button
        className="card-thumb"
        onClick={() => {
          selectTemplate(t.id);
          onEdit();
        }}
        title="Open this template"
      >
        {/*
          속지 비율 그대로 그린다. viewBox가 mm라 크기만 줄이면 되고,
          내용은 편집 화면과 정확히 같은 그림이다.
        */}
        <svg viewBox={`0 0 ${t.insert.width} ${t.insert.height}`} preserveAspectRatio="xMidYMid meet">
          <rect x={0} y={0} width={t.insert.width} height={t.insert.height} className="sheet-bg" />
          <InsertView
            insert={t.insert}
            grid={t.dotGrid}
            objects={objects}
            safeZoneWidth={t.insert.punch.safeZoneWidth}
            mode="print"
          />
        </svg>
      </button>

      <div className="card-foot">
        {renaming ? (
          <input
            className="card-name-input"
            defaultValue={t.name}
            autoFocus
            onBlur={(e) => {
              renameTemplate(t.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button className="card-name" onClick={() => setRenaming(true)} title="Click to rename">
            {t.name}
          </button>
        )}

        {/*
          크기를 적는다. 예전엔 "그린 것 N개"였는데, 규격 칸 안에 이미 같은
          크기끼리 모여 있어서 그 안에서는 개수가 카드를 가르는 단서가 되지
          못했다. 크기는 규격 칸 제목과 겹치지만, 카드만 떼어 봐도 무엇인지
          알 수 있어야 한다.
        */}
        <span className="card-meta">
          {t.insert.width} × {t.insert.height}mm
        </span>

        <div className="card-actions">
          <IconBtn label="Rename" onClick={() => setRenaming(true)}>
            <PencilIcon />
          </IconBtn>
          <IconBtn label="Duplicate" onClick={() => setCopying(true)}>
            <CopyIcon />
          </IconBtn>
          <IconBtn label="Delete" danger onClick={() => removeTemplate(t.id)}>
            <TrashIcon />
          </IconBtn>
        </div>
      </div>

      {copying && <CopyDialog template={t} onClose={() => setCopying(false)} />}
    </div>
  );
}

/**
 * 카드 아래의 작은 동작 버튼.
 *
 * 아이콘만 있고 글자가 없으므로 `title`이 곧 이름이다 — 화면 낭독기도
 * 이걸 읽으므로 `aria-label`을 같이 준다.
 */
function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`card-action ${danger ? 'danger' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5z" />
      <path d="M13 5.5L18.5 11" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h14" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}

/**
 * 복제 — 규격을 바꿔서도 복제할 수 있다.
 *
 * 80×125로 만든 것을 75×125로도 뽑고 싶을 때 쓴다. **원본은 손대지 않는다.**
 *
 * 규격이 바뀌어도 격자 간격도 글자 크기도 선 굵기도 변하지 않는다. 비례로 줄이면
 * 5mm 격자가 4.69mm가 되어 격자의 의미가 사라진다. 대신 새 크기 밖으로 나가는
 * 것이 몇 개인지 **미리 세어서 알려준다** — 지우지도 옮기지도 않는다.
 */
function CopyDialog({ template, onClose }: { template: Template; onClose: () => void }) {
  const copyTemplate = useStore((s) => s.copyTemplate);
  const [presetId, setPresetId] = useState(template.insert.presetId);
  const [width, setWidth] = useState(template.insert.width);
  const [height, setHeight] = useState(template.insert.height);

  const changed = width !== template.insert.width || height !== template.insert.height;
  const lost = changed ? outsideCount(template.objects.present, { width, height }) : 0;

  function pickPreset(id: string) {
    setPresetId(id);
    const next = insertFromPreset(id, template.insert);
    setWidth(next.width);
    setHeight(next.height);
  }

  return (
    <div className="card-dialog">
      <label>
        Size
        <select value={presetId} onChange={(e) => pickPreset(e.target.value)}>
          {INSERT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      <div className="card-dialog-size">
        <input
          type="number"
          value={width}
          min={10}
          step={1}
          onChange={(e) => {
            setWidth(Number(e.target.value));
            setPresetId('custom');
          }}
        />
        <span>×</span>
        <input
          type="number"
          value={height}
          min={10}
          step={1}
          onChange={(e) => {
            setHeight(Number(e.target.value));
            setPresetId('custom');
          }}
        />
        <span>mm</span>
      </div>

      {lost > 0 && (
        <p className="card-dialog-warn">
          <b>{lost}</b> object(s) fall outside the new size. They are kept, but printing clips them.
        </p>
      )}

      <div className="card-dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            copyTemplate(
              template.id,
              changed || presetId !== template.insert.presetId
                ? { presetId, width, height, punch: { ...template.insert.punch } }
                : undefined,
            );
            onClose();
          }}
        >
          Duplicate
        </button>
      </div>
    </div>
  );
}

/** 갤러리 머리글에 쓰는 이름. store 밖에서도 같은 규칙으로 부른다. */
export { sizeLabel };
