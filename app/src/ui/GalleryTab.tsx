import { useEffect, useState } from 'react';
import {
  groupBySize,
  insertFromPreset,
  outsideCount,
  sizeLabel,
  type InsertSetting,
  type Template,
} from '../core/template';
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
import { DesignLibraryDialog } from './DesignLibraryDialog';

/**
 * 양식 관리 — 만들어둔 속지들을 한눈에 본다.
 *
 * **크기별로 묶어서 보여준다.** 양식이 크기를 소유하는 것이 아니라 크기를
 * 속성으로 가지므로(core/template), 여기서는 그 속성으로 줄을 세울 뿐이다.
 * 같은 M6 양식이 열 개여도 된다.
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
  const [managingDesign, setManagingDesign] = useState(false);

  const groups = groupBySize(templates);

  return (
    <div className="gallery">
      <div className="gallery-bar">
        {/*
          맨 위 버튼은 규격을 고르고 만든다. 크기 그룹의 `+`와 다른 점이다 —
          그쪽은 "이 크기로 하나 더"라는 뜻이라 바로 만드는 것이 맞다.
        */}
        <button className="primary" onClick={() => setCreating(true)}>
          + 새 양식
        </button>
        <button className="ghost" onClick={() => setManagingDesign(true)}>
          디자인 관리
        </button>
        <span className="gallery-hint">
          양식 {templates.length}개 · 클릭하면 그 양식으로 넘어갑니다
        </span>
      </div>

      {creating && (
        <NewTemplateDialog
          onClose={() => setCreating(false)}
          onCreate={(insert, name, grid) => {
            addTemplate(insert, name, grid);
            setCreating(false);
            onEdit();
          }}
        />
      )}

      {managingDesign && <DesignLibraryDialog onClose={() => setManagingDesign(false)} />}

      <div className="gallery-body">
        {templates.length === 0 && (
          <div className="gallery-empty">
            <p>아직 만든 양식이 없습니다.</p>
            <p className="muted">
              <b>+ 새 양식</b>을 눌러 속지 규격과 격자를 고르는 것부터 시작합니다.
            </p>
          </div>
        )}

        {groups.map((g) => (
          <section key={`${g.width}x${g.height}`} className="gallery-group">
            <h2>
              {g.label}
              <span className="count">{g.templates.length}개</span>
            </h2>
            <div className="gallery-grid">
              {g.templates.map((t) => (
                <Card key={t.id} template={t} active={t.id === activeId} onEdit={onEdit} />
              ))}
              {/* 이 크기로 하나 더. 규격을 다시 고르지 않아도 된다. */}
              <button
                className="card card-add"
                onClick={() => addTemplate({ ...g.templates[0].insert })}
                title={`${g.label} 규격으로 새 양식`}
              >
                +
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
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
  onCreate: (insert: InsertSetting, name: string, grid: DotGrid) => void;
}) {
  // 양식이 없으면(처음 열었을 때) 기본 규격에서 시작한다.
  const current = useInsert();
  const paper = useStore((s) => s.paper);
  const setPaperPreset = useStore((s) => s.setPaperPreset);

  const [presetId, setPresetId] = useState(current.presetId);
  const [width, setWidth] = useState(current.width);
  const [height, setHeight] = useState(current.height);
  const [name, setName] = useState('');
  const [grid, setGrid] = useState<DotGrid>({ ...DEFAULT_DOT_GRID });
  /**
   * 간격을 직접 칠지, 칸 수로 셀지.
   *
   * **간격은 가로·세로가 하나뿐이다.** 그래서 한 축의 칸 수를 정하면 다른 축은
   * 거기서 따라 나온다. 둘 다 마음대로 정하면 칸이 정사각형이 아니게 되고,
   * 그러면 도트 격자라고 부를 수 없다.
   */
  const [byCells, setByCells] = useState(false);
  const [cellAxis, setCellAxis] = useState<'x' | 'y'>('x');
  const [cells, setCells] = useState(10);

  const insert: InsertSetting =
    presetId === 'custom'
      ? { presetId, width, height, punch: { ...current.punch } }
      : { ...insertFromPreset(presetId, current), width, height };

  // 칸 수로 만들면 여기서 간격이 나온다. 딱 나누어떨어져 잘리는 칸이 없다.
  const spacing = byCells
    ? spacingForCells(cellAxis === 'x' ? width : height, cells, grid.toEdge ? 0 : grid.minMargin)
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
    onCreate(insert, name, { ...grid, spacing });
  }

  return (
    <Modal title="새 양식" onClose={onClose}>
      <p className="modal-note">어떤 규격의 속지를 만들까요?</p>

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
          <b>사용자 지정</b>
          <span>직접 입력</span>
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

      <div className="modal-divider" />
      <p className="modal-note">용지 — 인쇄할 종이입니다. 작업 전체에 적용됩니다.</p>
      <div className="modal-row">
        <select value={paper.presetId} onChange={(e) => setPaperPreset(e.target.value)}>
          {PAPER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.width} × {p.height}mm
            </option>
          ))}
          <option value="custom">사용자 지정</option>
        </select>
      </div>

      <div className="modal-divider" />
      <p className="modal-note">도트 격자</p>

      <div className="modal-row">
        <select
          value={grid.style}
          onChange={(e) => setGrid({ ...grid, style: e.target.value as GridStyle })}
        >
          <option value="dot">도트</option>
          <option value="grid">그리드</option>
          <option value="horizontal">가로줄</option>
          <option value="vertical">세로줄</option>
        </select>

        <label className="modal-check">
          <input
            type="checkbox"
            checked={grid.toEdge}
            onChange={(e) => setGrid({ ...grid, toEdge: e.target.checked })}
          />
          여백 없이 끝까지
        </label>
      </div>

      <div className="modal-row">
        <label className="modal-check">
          <input type="radio" checked={!byCells} onChange={() => setByCells(false)} />
          간격으로
        </label>
        <label className="modal-check">
          <input type="radio" checked={byCells} onChange={() => setByCells(true)} />
          칸 수로
        </label>
      </div>

      {byCells ? (
        <div className="modal-row">
          <select value={cellAxis} onChange={(e) => setCellAxis(e.target.value as 'x' | 'y')}>
            <option value="x">가로</option>
            <option value="y">세로</option>
          </select>
          <input
            type="number"
            className="modal-num"
            value={cells}
            min={1}
            step={1}
            onChange={(e) => setCells(Math.max(1, Math.round(Number(e.target.value))))}
          />
          <span className="modal-unit">칸</span>
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
              {preview.cols} × {preview.rows}칸
            </b>
            {' · 간격 '}
            {roundMm(spacing, 2)}mm
            {grid.toEdge ? '' : ` · 여백 ${roundMm(preview.marginX, 1)}mm`}
          </>
        ) : (
          <span className="warn">간격이 속지보다 넓어 격자가 들어가지 않습니다.</span>
        )}
      </p>

      <div className="modal-divider" />
      <label className="modal-field">
        이름
        <input
          value={name}
          placeholder="비워두면 자동으로 붙습니다"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
      </label>

      <div className="card-dialog-actions">
        <button className="ghost" onClick={onClose}>
          취소
        </button>
        <button className="primary" onClick={create}>
          만들기
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
 * 누르면 그 양식으로 넘어가 편집 화면이 열린다. 관리 동작(이름·복제·삭제)은
 * 카드 아래 줄에 둔다 — 썸네일을 가리지 않아야 무엇인지 보인다.
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
        title="이 양식 편집하기"
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
          <button className="card-name" onDoubleClick={() => setRenaming(true)} title="더블클릭해서 이름 바꾸기">
            {t.name}
          </button>
        )}

        <span className="card-meta">그린 것 {objects.length}개</span>

        <div className="card-actions">
          <button className="ghost" onClick={() => setRenaming(true)} title="이름 바꾸기">
            이름
          </button>
          <button className="ghost" onClick={() => setCopying(true)} title="복제 — 규격을 바꿔서도 됩니다">
            복제
          </button>
          <button className="ghost" onClick={() => removeTemplate(t.id)} title="삭제">
            삭제
          </button>
        </div>
      </div>

      {copying && <CopyDialog template={t} onClose={() => setCopying(false)} />}
    </div>
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
        규격
        <select value={presetId} onChange={(e) => pickPreset(e.target.value)}>
          {INSERT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">사용자 지정</option>
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
          객체 <b>{lost}개</b>가 새 크기 밖으로 나갑니다. 지워지지는 않고 인쇄에서만 잘립니다.
        </p>
      )}

      <div className="card-dialog-actions">
        <button onClick={onClose}>취소</button>
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
          복제
        </button>
      </div>
    </div>
  );
}

/** 갤러리 머리글에 쓰는 이름. store 밖에서도 같은 규칙으로 부른다. */
export { sizeLabel };
