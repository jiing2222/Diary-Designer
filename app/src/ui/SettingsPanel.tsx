import { useEffect, useRef, useState } from 'react';
import { activeTemplate, INSERT_PRESETS, PAPER_PRESETS, useStore } from '../store';
import { holeCentersY, holeSpan, suggestGroupGap, topMargin } from '../core/punch';
import { gridArea, gridLattice, type GridStyle } from '../core/grid';
import type { Dash } from '../core/objects';
import { roundMm } from '../core/units';
import { GridIcon, InsertIcon, LayoutIcon, PaperIcon, PunchIcon } from './icons';

/**
 * 설정 도구.
 *
 * 항목이 계속 늘어나므로 한 줄로 다 펼쳐두지 않는다. 왼쪽에 아이콘만 세우고,
 * 누른 것의 설정만 옆에 말풍선으로 띄운다.
 *
 * 아이콘 오른쪽 위의 점은 **그 안내가 지금 화면에 보이는 중**이라는 표시다.
 * 켜고 끄는 것은 말풍선 안에서 한다.
 */

type GroupId = 'paper' | 'insert' | 'grid' | 'punch' | 'layout';

export function SettingsPanel() {
  const s = useStore();
  const [open, setOpen] = useState<GroupId | null>(null);
  const [top, setTop] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!open) return;

    function onDown(e: PointerEvent) {
      if (!railRef.current?.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = [
    { id: 'paper', label: '용지', icon: <PaperIcon />, on: s.unprintable.show },
    { id: 'insert', label: '속지', icon: <InsertIcon />, on: false },
    { id: 'grid', label: '도트 격자', icon: <GridIcon />, on: activeTemplate(s).dotGrid.showOnScreen },
    { id: 'punch', label: '타공 안내', icon: <PunchIcon />, on: activeTemplate(s).insert.punch.show },
    { id: 'layout', label: '배치 · 절취선', icon: <LayoutIcon />, on: s.showRuler },
  ] as const;

  function toggle(id: GroupId, e: React.MouseEvent<HTMLButtonElement>) {
    setTop(e.currentTarget.offsetTop);
    setOpen((cur) => (cur === id ? null : id));
  }

  return (
    <div className="rail-wrap" ref={railRef}>
      <div className="rail">
        {groups.map((g) => (
          <button
            key={g.id}
            className={`rail-btn ${open === g.id ? 'on' : ''}`}
            onClick={(e) => toggle(g.id, e)}
            title={g.label}
            aria-label={g.label}
            aria-pressed={open === g.id}
          >
            {g.icon}
            {g.on && <span className="rail-mark" />}
          </button>
        ))}
      </div>

      {open && (
        <div className="popover" style={{ top }}>
          <div className="popover-arrow" />
          <h2>{groups.find((g) => g.id === open)!.label}</h2>
          <div className="popover-body">
            {open === 'paper' && <PaperGroup />}
            {open === 'insert' && <InsertGroup />}
            {open === 'grid' && <GridGroup />}
            {open === 'punch' && <PunchGroup />}
            {open === 'layout' && <LayoutGroup />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 각 묶음 ─────────────────────────── */

function PaperGroup() {
  const s = useStore();
  return (
    <>
      <Row label="크기">
        <select value={s.paper.presetId} onChange={(e) => s.setPaperPreset(e.target.value)}>
          {PAPER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">사용자 지정</option>
        </select>
      </Row>
      <Row label="가로">
        <Num value={s.paper.width} onChange={(width) => s.patchPaper({ width })} />
      </Row>
      <Row label="세로">
        <Num value={s.paper.height} onChange={(height) => s.patchPaper({ height })} />
      </Row>
      <Row label="방향">
        <Check
          checked={s.paper.landscape}
          onChange={(landscape) => s.patchPaper({ landscape })}
          label="가로로 눕히기"
        />
      </Row>
      <Row label="여백" hint="용지 가장자리를 비워둘 폭. 0이면 용지를 남김없이 쓴다">
        <Num value={s.paper.printMargin} onChange={(printMargin) => s.patchPaper({ printMargin })} />
      </Row>

      <Divider />
      <p className="note">인쇄 불가 영역 — 화면에만 표시되고 배치에 영향을 주지 않습니다.</p>
      <Row label="표시">
        <Check
          checked={s.unprintable.show}
          onChange={(show) => s.patchUnprintable({ show })}
          label="프린터가 못 찍는 가장자리"
        />
      </Row>
      <Row label="폭">
        <Num value={s.unprintable.width} onChange={(width) => s.patchUnprintable({ width })} />
      </Row>
    </>
  );
}

function InsertGroup() {
  const s = useStore();
  return (
    <>
      <Row label="규격">
        <select value={activeTemplate(s).insert.presetId} onChange={(e) => s.setInsertPreset(e.target.value)}>
          {INSERT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">사용자 지정</option>
        </select>
      </Row>
      <Row label="가로">
        <Num value={activeTemplate(s).insert.width} onChange={(width) => s.patchInsert({ width })} />
      </Row>
      <Row label="세로">
        <Num value={activeTemplate(s).insert.height} onChange={(height) => s.patchInsert({ height })} />
      </Row>
    </>
  );
}

function GridGroup() {
  const s = useStore();
  return (
    <>
      <Row label="모양" hint="같은 격자에서 그리는 방식만 바뀐다">
        <select
          value={activeTemplate(s).dotGrid.style}
          onChange={(e) => s.patchDotGrid({ style: e.target.value as GridStyle })}
        >
          <option value="dot">도트</option>
          <option value="grid">그리드</option>
          <option value="horizontal">가로줄</option>
          <option value="vertical">세로줄</option>
        </select>
      </Row>
      <Row label="간격">
        <Num value={activeTemplate(s).dotGrid.spacing} min={1} onChange={(spacing) => s.patchDotGrid({ spacing })} />
      </Row>
      {activeTemplate(s).dotGrid.style !== 'dot' && (
        <Row label="선 모양">
          <select
            value={activeTemplate(s).dotGrid.dash}
            onChange={(e) => s.patchDotGrid({ dash: e.target.value as Dash })}
          >
            <option value="solid">실선</option>
            <option value="dashed">파선</option>
            <option value="dotted">점선</option>
          </select>
        </Row>
      )}
      <Row label="채우기" hint="모서리에서 시작해 끝까지 나아간다. 마지막 칸은 잘린다">
        <Check
          checked={activeTemplate(s).dotGrid.toEdge}
          onChange={(toEdge) => s.patchDotGrid({ toEdge })}
          label="여백 없이 끝까지"
        />
      </Row>
      {!activeTemplate(s).dotGrid.toEdge && (
        <Row
          label="최소 여백"
          hint="여백은 간격에서 따라 나온다. 이 값은 그 하한이라 정확히 이만큼은 아니다"
        >
          <Num
            value={activeTemplate(s).dotGrid.minMargin}
            min={0}
            max={20}
            onChange={(minMargin) => s.patchDotGrid({ minMargin })}
          />
        </Row>
      )}
      <Row label="타공" hint="구멍 쪽 안전영역을 비우고 그 안에서 다시 가운데 맞춘다">
        <Check
          checked={activeTemplate(s).dotGrid.avoidSafeZone}
          onChange={(avoidSafeZone) => s.patchDotGrid({ avoidSafeZone })}
          label="안전영역 비우기"
        />
      </Row>
      <Row label="화면">
        <Check
          checked={activeTemplate(s).dotGrid.showOnScreen}
          onChange={(showOnScreen) => s.patchDotGrid({ showOnScreen })}
          label="작업하면서 보기"
        />
      </Row>
      <Row label="인쇄">
        <Check
          checked={activeTemplate(s).dotGrid.print}
          onChange={(print) => s.patchDotGrid({ print })}
          label="인쇄물에 남기기"
        />
      </Row>
      <GridReadout />
    </>
  );
}

function PunchGroup() {
  const s = useStore();
  const insert = activeTemplate(s).insert;
  const punch = insert.punch;
  return (
    <>
      <p className="note">화면에만 표시됩니다. 인쇄되지 않습니다.</p>
      <Row label="표시">
        <Check
          checked={punch.show}
          onChange={(show) => s.patchPunch({ show })}
          label="타공 위치 보기"
        />
      </Row>
      <Row label="구멍 수">
        <Num
          value={punch.holeCount}
          step={1}
          unit="개"
          onChange={(holeCount) => s.patchPunch({ holeCount })}
        />
      </Row>
      <Row label="배치">
        <select
          value={punch.groupGap === null ? 'even' : 'grouped'}
          onChange={(e) =>
            s.patchPunch({
              groupGap:
                e.target.value === 'even'
                  ? null
                  : suggestGroupGap(insert.height, punch.holeCount),
            })
          }
        >
          <option value="even">균등 간격</option>
          <option value="grouped">묶음 (3 + 3)</option>
        </select>
      </Row>
      {punch.groupGap !== null && (
        <Row label="묶음 간격" hint="두 묶음 사이의 중심 간격">
          <Num value={punch.groupGap} onChange={(groupGap) => s.patchPunch({ groupGap })} />
        </Row>
      )}
      <Row label="안전영역">
        <Num
          value={punch.safeZoneWidth}
          onChange={(safeZoneWidth) => s.patchPunch({ safeZoneWidth })}
        />
      </Row>
      <PunchReadout />
    </>
  );
}

function LayoutGroup() {
  const s = useStore();
  return (
    <>
      <Row label="간격">
        <Num value={s.gap} onChange={(gap) => s.patch({ gap })} />
      </Row>
      <Row label="회전">
        <Check
          checked={s.allowRotate}
          onChange={(allowRotate) => s.patch({ allowRotate })}
          label="90도 돌려서 더 넣기"
        />
      </Row>
      <Row label="정렬" hint="좌측 상단에 붙이면 오른쪽과 아래만 자르면 된다">
        <select value={s.align} onChange={(e) => s.patch({ align: e.target.value as never })}>
          <option value="topLeft">좌측 상단</option>
          <option value="center">가운데</option>
        </select>
      </Row>
      <Row label="절취선">
        <select value={s.cropMark} onChange={(e) => s.patch({ cropMark: e.target.value as never })}>
          <option value="mark">십자 · 바깥만</option>
          <option value="markAll">십자 · 안쪽까지</option>
          <option value="line">재단선 전체</option>
          <option value="none">없음</option>
        </select>
      </Row>
      <Row label="눈금자">
        <Check
          checked={s.showRuler}
          onChange={(showRuler) => s.patch({ showRuler })}
          label="50mm 검증 눈금"
        />
      </Row>
    </>
  );
}

/* ─────────────────────────── 자동 계산 결과 ─────────────────────────── */

/**
 * 자동 계산된 격자를 보여준다.
 *
 * 여백은 입력값이 아니라 간격에서 나온 결과다. 눈으로 확인할 수 있어야
 * 원하는 간격을 찾아 넣을 수 있다.
 */
function GridReadout() {
  const insert = useStore((s) => activeTemplate(s).insert);
  const grid = useStore((s) => activeTemplate(s).dotGrid);

  const area = gridArea(insert, grid, insert.punch.safeZoneWidth);
  const { xs, ys } = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);

  if (xs.length === 0 || ys.length === 0) {
    return (
      <div className="readout readout-warn">
        <strong>격자가 들어가지 않습니다.</strong>
        <span>
          간격 {grid.spacing}mm는 격자 영역 {roundMm(area.width, 2)} × {roundMm(area.height, 2)}mm에
          비해 너무 넓습니다.
          {grid.avoidSafeZone && ' 안전영역 비우기를 끄면 넓어집니다.'}
        </span>
      </div>
    );
  }

  const count =
    grid.style === 'dot'
      ? `도트 ${xs.length} × ${ys.length}개`
      : grid.style === 'horizontal'
        ? `가로 ${ys.length}줄`
        : grid.style === 'vertical'
          ? `세로 ${xs.length}줄`
          : `${xs.length - 1} × ${ys.length - 1}칸`;

  // 속지 가장자리에서 바깥쪽 도트까지의 실제 거리를 보여준다.
  // 안전영역을 비우면 왼쪽만 그만큼 멀어지므로 좌우를 따로 적어야 한다.
  const left = xs[0];
  const right = insert.width - xs[xs.length - 1];
  const top = ys[0];
  const bottom = insert.height - ys[ys.length - 1];
  const r = (v: number) => roundMm(v, 2);
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  const margin = !same(left, right)
    ? `좌 ${r(left)} · 우 ${r(right)} · 상하 ${r(top)}mm`
    : same(left, top) && same(top, bottom)
      ? `${r(left)}mm`
      : `좌우 ${r(left)}mm · 상하 ${r(top)}mm`;

  const mismatch = grid.showOnScreen !== grid.print;

  return (
    <div className="readout">
      <span>
        {count} · 여백 <b>{margin}</b>
      </span>
      {mismatch ? (
        <span>
          <b>{grid.print ? '화면에는 없지만 인쇄됩니다.' : '화면에만 보이고 인쇄되지 않습니다.'}</b>
        </span>
      ) : (
        <span className="muted">
          {grid.minMargin > 0
            ? `여백은 간격에서 자동 계산됩니다. 최소 ${grid.minMargin}mm를 남겨 재단선에 도트가 걸리지 않게 합니다.`
            : '최소 여백이 0이라 바깥쪽이 재단선에 붙습니다. 자를 때 반쯤 날아갈 수 있습니다.'}
        </span>
      )}
    </div>
  );
}

/** 자동 계산된 타공 위치를 보여준다. 사용자가 입력하는 값이 아니다. */
function PunchReadout() {
  const insert = useStore((s) => activeTemplate(s).insert);
  const centers = holeCentersY(insert.height, insert.punch);
  const margin = topMargin(insert.height, insert.punch);

  if (centers.length === 0) return null;

  const overflow = margin < 0;
  const span = holeSpan(insert.punch);
  const grouped = insert.punch.groupGap !== null;

  return (
    <div className={`readout ${overflow ? 'readout-warn' : ''}`}>
      {overflow ? (
        <>
          <strong>구멍이 속지를 벗어납니다.</strong>
          <span>
            구멍 {insert.punch.holeCount}개를 {grouped ? '묶음' : '균등'} 배치하면{' '}
            {roundMm(span, 1)}mm가 필요한데 속지 세로는 {insert.height}mm입니다.{' '}
            {grouped ? '묶음 간격을 줄이거나 균등 배치로 바꾸세요.' : '속지를 키우세요.'}
          </span>
        </>
      ) : (
        <>
          <span>
            상하 여백 <b>{roundMm(margin, 1)}mm</b> · 자동 계산됨
          </span>
          <span className="muted">구멍 중심 {centers.map((c) => roundMm(c, 1)).join(' · ')}</span>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── 작은 조각들 ─────────────────────────── */

function Divider() {
  return <div className="divider" />;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <span className="row-label" title={hint}>
        {label}
      </span>
      <div className="row-field">{children}</div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Num({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max,
  unit = 'mm',
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <label className="num">
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      <span>{unit}</span>
    </label>
  );
}
