import { useEffect, useRef, useState } from 'react';
import {
  INSERT_PRESETS,
  PAPER_PRESETS,
  selectLayout,
  useDotGrid,
  useInsert,
  useRepeat,
  useSide,
  useStore,
} from '../store';
import { holeCentersY, holeSpan, suggestGroupGap, topMargin } from '../core/punch';
import { gridArea, gridLattice, spacingForCells, type GridStyle } from '../core/grid';
import { capacityPerSheet, sheetsNeeded } from '../core/template';
import type { Dash } from '../core/objects';
import { roundMm } from '../core/units';
import { GridIcon, InsertIcon, LayoutIcon, PaperIcon, PunchIcon, RepeatIcon } from './icons';

/**
 * 설정 도구.
 *
 * 항목이 계속 늘어나므로 한 줄로 다 펼쳐두지 않는다. 왼쪽에 아이콘만 세우고,
 * 누른 것의 설정만 옆에 말풍선으로 띄운다.
 *
 * 아이콘 오른쪽 위의 점은 **그 안내가 지금 화면에 보이는 중**이라는 표시다.
 * 켜고 끄는 것은 말풍선 안에서 한다.
 */

type GroupId = 'paper' | 'insert' | 'repeat' | 'grid' | 'punch' | 'layout';

export function SettingsPanel() {
  const s = useStore();
  const insert = useInsert();
  const grid = useDotGrid();
  const repeat = useRepeat();
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
    { id: 'repeat', label: '반복', icon: <RepeatIcon />, on: repeat.mode === 'repeat' },
    { id: 'grid', label: '도트 격자', icon: <GridIcon />, on: grid.showOnScreen },
    { id: 'punch', label: '타공 안내', icon: <PunchIcon />, on: insert.punch.show },
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
            {open === 'repeat' && <RepeatGroup />}
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
  const insert = useInsert();
  return (
    <>
      <Row label="규격">
        <select value={insert.presetId} onChange={(e) => s.setInsertPreset(e.target.value)}>
          {INSERT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">사용자 지정</option>
        </select>
      </Row>
      <Row label="가로">
        <Num value={insert.width} onChange={(width) => s.patchInsert({ width })} />
      </Row>
      <Row label="세로">
        <Num value={insert.height} onChange={(height) => s.patchInsert({ height })} />
      </Row>
    </>
  );
}

/**
 * 반복 인쇄 — 이 양식을 몇 번 찍을지.
 *
 * `single`(기본)은 지금까지와 같다. 인쇄하기 탭에서 다른 양식과 칸마다 섞어
 * 배정할 수 있다(낱장 조합).
 *
 * `repeat`으로 바꾸면 **이 양식 하나로만** 여러 장을 채운다. 53쪽짜리 위클리와
 * 1쪽짜리 메모를 한 인쇄 작업에 섞을 수 없다는 것이 설계문서의 원칙이라, 이
 * 순간 인쇄하기 탭의 낱장 조합(칸 배정) UI가 사라지고 매수 안내로 바뀐다.
 */
function RepeatGroup() {
  const s = useStore();
  const repeat = useRepeat();
  const layout = selectLayout(s);
  const count = repeat.mode === 'repeat' ? repeat.count : 1;

  return (
    <>
      <Row
        label="방식"
        hint="여러 장이면 이 양식 하나로만 채운다. 다른 양식과 섞이지 않는다"
      >
        <select
          value={repeat.mode}
          onChange={(e) =>
            s.patchRepeat(
              e.target.value === 'repeat'
                ? { mode: 'repeat', count: Math.max(1, count) }
                : { mode: 'single' },
            )
          }
        >
          <option value="single">한 번만 — 다른 양식과 섞어 배정</option>
          <option value="repeat">여러 장 — 이 양식만 반복</option>
        </select>
      </Row>

      {repeat.mode === 'repeat' && (
        <>
          <Row label="매수" hint="총 몇 칸(장)이 필요한지. 만년형이면 원하는 쪽수만큼">
            <Num
              value={repeat.count}
              step={1}
              min={1}
              unit="칸"
              onChange={(n) => s.patchRepeat({ mode: 'repeat', count: Math.max(1, Math.round(n)) })}
            />
          </Row>
          <div className="readout">
            <span>
              한 장에 <b>{layout.count}칸</b>
              {s.duplex && <>(양면이라 앞뒤 {layout.count * 2}칸)</>}이니{' '}
              <b>{sheetsNeeded(count, capacityPerSheet(layout.count, s.duplex))}장</b>이 필요합니다.
            </span>
            <span className="muted">
              마지막 장에서 모자라는 칸은 비웁니다. 속지를 필요한 만큼만 뽑기 위해서입니다.
            </span>
          </div>
        </>
      )}
    </>
  );
}

function GridGroup() {
  const s = useStore();
  const grid = useDotGrid();
  return (
    <>
      <Row label="모양" hint="같은 격자에서 그리는 방식만 바뀐다">
        <select
          value={grid.style}
          onChange={(e) => s.patchDotGrid({ style: e.target.value as GridStyle })}
        >
          <option value="dot">도트</option>
          <option value="grid">그리드</option>
          <option value="horizontal">가로줄</option>
          <option value="vertical">세로줄</option>
        </select>
      </Row>
      <Row label="간격">
        <Num value={grid.spacing} min={0.5} onChange={(spacing) => s.patchDotGrid({ spacing })} />
      </Row>
      <CellCountRow />
      {grid.style !== 'dot' && (
        <Row label="선 모양">
          <select
            value={grid.dash}
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
          checked={grid.toEdge}
          onChange={(toEdge) => s.patchDotGrid({ toEdge })}
          label="여백 없이 끝까지"
        />
      </Row>
      {!grid.toEdge && (
        <Row
          label="최소 여백"
          hint="여백은 간격에서 따라 나온다. 이 값은 그 하한이라 정확히 이만큼은 아니다"
        >
          <Num
            value={grid.minMargin}
            min={0}
            max={20}
            onChange={(minMargin) => s.patchDotGrid({ minMargin })}
          />
        </Row>
      )}
      <Row label="타공" hint="구멍 쪽 안전영역을 비우고 그 안에서 다시 가운데 맞춘다">
        <Check
          checked={grid.avoidSafeZone}
          onChange={(avoidSafeZone) => s.patchDotGrid({ avoidSafeZone })}
          label="안전영역 비우기"
        />
      </Row>
      <Row label="화면">
        <Check
          checked={grid.showOnScreen}
          onChange={(showOnScreen) => s.patchDotGrid({ showOnScreen })}
          label="작업하면서 보기"
        />
      </Row>
      <Row label="인쇄">
        <Check
          checked={grid.print}
          onChange={(print) => s.patchDotGrid({ print })}
          label="인쇄물에 남기기"
        />
      </Row>
      <Row label="뒷면 없으면" hint="양면 인쇄에서만 의미가 있습니다. 뒷면을 안 만든 칸도 백지 대신 앞면과 같은 도트·그리드로 찍습니다">
        <Check
          checked={s.fillEmptyBack}
          onChange={(fillEmptyBack) => s.patch({ fillEmptyBack })}
          label="도트만 찍기"
        />
      </Row>
      <GridReadout />
    </>
  );
}

function PunchGroup() {
  const s = useStore();
  const insert = useInsert();
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
      {/* 양면 인쇄는 인쇄하기 탭 상단(print-bar)으로 옮겼다 — 자주 켜고 끄는
          값이라 여기 팝오버 안쪽보다 눈에 띄는 자리가 낫다. */}
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
/**
 * 칸 수로 간격 정하기.
 *
 * 지금 몇 칸인지 보여주고, 고치면 간격이 거꾸로 계산된다(core/grid의
 * `spacingForCells`). `가로 10칸`처럼 세는 편이 자연스러운 양식이 있다.
 *
 * **간격은 가로·세로가 하나뿐이라** 한 축을 고치면 다른 축은 따라 움직인다.
 * 둘 다 마음대로 정하면 칸이 정사각형이 아니게 되고, 그러면 도트 격자가 아니다.
 * 그래서 두 칸을 나란히 두되 고친 쪽을 기준으로 삼는다.
 */
function CellCountRow() {
  const s = useStore();
  const insert = useInsert();
  const grid = useDotGrid();
  const side = useSide();

  const area = gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back');
  const { cols, rows } = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);
  const margin = grid.toEdge ? 0 : grid.minMargin;

  const setCells = (size: number, n: number) => {
    const spacing = spacingForCells(size, Math.max(1, Math.round(n)), margin);
    if (spacing > 0) s.patchDotGrid({ spacing });
  };

  return (
    <Row label="칸 수" hint="고치면 간격이 거꾸로 계산된다. 간격은 하나뿐이라 다른 축도 따라 움직인다">
      <div className="cells-row">
        <Num value={cols} step={1} min={1} unit="가로" onChange={(n) => setCells(area.width, n)} />
        <Num value={rows} step={1} min={1} unit="세로" onChange={(n) => setCells(area.height, n)} />
      </div>
    </Row>
  );
}

function GridReadout() {
  const insert = useInsert();
  const grid = useDotGrid();
  const side = useSide();

  const area = gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back');
  const { xs, ys, cols, rows } = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);

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
          : `${cols} × ${rows}칸`;

  // 속지 가장자리에서 바깥쪽 도트까지의 실제 거리를 보여준다.
  // 안전영역을 비우면 한쪽만(앞면은 왼쪽, 뒷면은 오른쪽) 그만큼 멀어지므로
  // 좌우를 따로 적어야 한다. area가 이미 mirror를 반영하므로 xs·ys는 그대로 쓴다.
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
  const insert = useInsert();
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
