import { useState } from 'react';
import { useActiveDiary, useActiveSide, useDotGrid, useInsert, useStore } from '../store';
import { holeCentersY, holeSpan, suggestGroupGap, topMargin, type PunchSetting } from '../core/punch';
import { gridArea, gridLattice, spacingForCells, type GridStyle } from '../core/grid';
import type { Dash } from '../core/objects';
import { roundMm } from '../core/units';
import { ImportPagesButton } from './PageManager';
import { t } from '../lang';

/**
 * Page 패널 — 속지 종이 자체의 설정(리뉴얼, 세부계획 A5). 옛 Insert 탭.
 *
 * 하위 탭 Background / Margin / Punch / Guide로 묶는다. 속지 크기는 여기 없다 —
 * 모든 페이지에 걸리는 큰 변경이라 상단 바의 다이어리 칩에서만 바꾼다.
 *
 * **바탕은 면마다** 따로다(리뉴얼: 펼침면의 두 면이 서로 다른 페이지). 날짜 페이지에서
 * 바꾸면 그 묶음의 원본 면이 바뀐다(core/work의 writeBackground).
 * **구멍은 다이어리**의 값이라 같은 다이어리를 쓰는 작업이 모두 바뀐다.
 */
type PageTab = 'background' | 'margin' | 'punch' | 'guide';

const TABS: { id: PageTab; label: string }[] = [
  { id: 'background', label: 'Background' },
  { id: 'margin', label: 'Margin' },
  { id: 'punch', label: 'Punch' },
  { id: 'guide', label: 'Guide' },
];


export function PagePanel() {
  const [tab, setTab] = useState<PageTab>('background');
  return (
    <div className="page-panel">
      <ImportPagesButton />
      <div className="sub-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`sub-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'background' && <BackgroundGroup />}
      {tab === 'margin' && <MarginGroup />}
      {tab === 'punch' && <PunchGroup />}
      {tab === 'guide' && <GuideGroup />}
    </div>
  );
}

function BackgroundGroup() {
  const patchDotGrid = useStore((s) => s.patchDotGrid);
  const grid = useDotGrid(useActiveSide());
  return (
    <>
      <Row label={t('모양', 'Style')} hint={t('같은 격자에서 그리는 방식만 바뀐다', 'Only how the same grid is drawn changes')}>
        <select value={grid.style} onChange={(e) => patchDotGrid({ style: e.target.value as GridStyle })}>
          <option value="dot">{t('도트', 'Dots')}</option>
          <option value="grid">{t('그리드', 'Grid')}</option>
          <option value="horizontal">{t('가로줄', 'Lines')}</option>
          <option value="vertical">{t('세로줄', 'Vertical lines')}</option>
        </select>
      </Row>
      <Row label={t('간격', 'Spacing')}>
        <Num value={grid.spacing} min={0.5} onChange={(spacing) => patchDotGrid({ spacing })} />
      </Row>
      <CellCountRow />
      {grid.style !== 'dot' && (
        <Row label={t('선 모양', 'Line style')}>
          <select value={grid.dash} onChange={(e) => patchDotGrid({ dash: e.target.value as Dash })}>
            <option value="solid">{t('실선', 'Solid')}</option>
            <option value="dashed">{t('파선', 'Dashed')}</option>
            <option value="dotted">{t('점선', 'Dotted')}</option>
          </select>
        </Row>
      )}
      <Row label={t('인쇄', 'Print')}>
        <Check checked={grid.print} onChange={(print) => patchDotGrid({ print })} label={t('인쇄물에 남기기', 'Include when printing')} />
      </Row>
      <GridReadout />
    </>
  );
}

function MarginGroup() {
  const patchDotGrid = useStore((s) => s.patchDotGrid);
  const grid = useDotGrid(useActiveSide());
  return (
    <>
      <Row label={t('채우기', 'Fill')} hint={t('모서리에서 시작해 끝까지 나아간다. 마지막 칸은 잘린다', 'Starts at the corner and runs to the edge. The last cell is cut off')}>
        <Check checked={grid.toEdge} onChange={(toEdge) => patchDotGrid({ toEdge })} label={t('여백 없이 끝까지', 'Edge to edge')} />
      </Row>
      {!grid.toEdge && (
        <Row label={t('최소 여백', 'Minimum margin')} hint={t('여백은 간격에서 따라 나온다. 이 값은 그 하한이라 정확히 이만큼은 아니다', 'Margins follow from the spacing. This is a lower bound, not an exact value')}>
          <Num value={grid.minMargin} min={0} max={20} onChange={(minMargin) => patchDotGrid({ minMargin })} />
        </Row>
      )}
      <Row label={t('타공', 'Holes')} hint={t('구멍 쪽 안전영역을 비우고 그 안에서 다시 가운데 맞춘다', 'Keep the hole-side safe zone clear and re-center inside it')}>
        <Check
          checked={grid.avoidSafeZone}
          onChange={(avoidSafeZone) => patchDotGrid({ avoidSafeZone })}
          label={t('안전영역 비우기', 'Keep safe zone clear')}
        />
      </Row>
      <MarginReadout />
      <GridReadout />
    </>
  );
}

function PunchGroup() {
  const patchPunch = useStore((s) => s.patchPunch);
  const insert = useInsert();
  const diary = useActiveDiary();
  const punch = insert.punch;
  return (
    <>
      <p className="tool-panel-note">
        {t(
          `구멍은 다이어리 ${diary?.name ?? ''}의 설정이에요. 이 다이어리를 쓰는 작업이 모두 바뀌어요.`,
          `Holes belong to the diary ${diary?.name ?? ''}. Every work using this diary changes.`,
        )}
      </p>
      <PunchFields punch={punch} height={insert.height} onPatch={patchPunch} />
      <PunchReadout />
    </>
  );
}

/**
 * 구멍 설정 줄들 — 편집 화면의 Page 패널과 Library → Diaries가 같이 쓴다. 고친 값은 그 다이어리의 구멍이다.
 * 위치 미세 조정(가장자리~구멍·위아래 밀기)은 드물게 쓰므로 접어 둔다.
 */
export function PunchFields({
  punch,
  height,
  onPatch,
}: {
  punch: PunchSetting;
  height: number;
  onPatch: (p: Partial<PunchSetting>) => void;
}) {
  return (
    <>
      <Row label={t('구멍 수', 'Number of holes')}>
        <Num value={punch.holeCount} min={1} max={30} step={1} unit={t('개', '')} onChange={(holeCount) => onPatch({ holeCount })} />
      </Row>
      <Row label={t('배치', 'Layout')}>
        <select
          value={punch.groupGap === null ? 'even' : 'grouped'}
          onChange={(e) => onPatch({ groupGap: e.target.value === 'even' ? null : suggestGroupGap(height, punch.holeCount) })}
        >
          <option value="even">{t('균등 간격', 'Evenly spaced')}</option>
          <option value="grouped">
            {t('묶음', 'Grouped')} ({Math.ceil(punch.holeCount / 2)} + {Math.floor(punch.holeCount / 2)})
          </option>
        </select>
      </Row>
      {punch.groupGap !== null && (
        <Row label={t('묶음 간격', 'Group gap')} hint={t('두 묶음 사이의 중심 간격', 'Center distance between the two groups')}>
          <Num value={punch.groupGap} onChange={(groupGap) => onPatch({ groupGap })} />
        </Row>
      )}
      <Row label={t('안전영역', 'Safe zone')} hint={t('구멍 쪽에 아무것도 놓지 않는 폭', 'Width kept clear on the hole side')}>
        <Num value={punch.safeZoneWidth} onChange={(safeZoneWidth) => onPatch({ safeZoneWidth })} />
      </Row>
      <Row
        label={t('구멍 지름', 'Hole diameter')}
        hint={t('타공기 구멍 크기. 화면 안내와, PDF를 만들 때 고르면 인쇄되는 타공 표시에 쓰여요', "Your punch's hole size. Used for the on-screen guide and for printed hole marks if you turn them on in the PDF")}
      >
        <Num value={punch.markSize} min={3} max={6} step={0.5} onChange={(markSize) => onPatch({ markSize })} />
      </Row>
      <details className="diary-fine">
        <summary>{t('구멍 위치 미세 조정', 'Fine-tune hole position')}</summary>
        <Row label={t('가장자리~구멍', 'Edge to hole')} hint={t('속지 가장자리에서 구멍 가장자리까지', 'From the insert edge to the hole edge')}>
          <Num value={punch.edgeToHole} min={0} max={20} step={0.5} onChange={(edgeToHole) => onPatch({ edgeToHole })} />
        </Row>
        <Row label={t('위아래 밀기', 'Shift up/down')} hint={t('구멍 묶음 전체를 위(−)·아래(+)로', 'Move all holes up (−) or down (+)')}>
          <Num value={punch.offsetY} min={-20} max={20} step={0.5} onChange={(offsetY) => onPatch({ offsetY })} />
        </Row>
      </details>
    </>
  );
}

/** 화면에만 보이는 안내들 — 인쇄되지 않는다. */
function GuideGroup() {
  const patchDotGrid = useStore((s) => s.patchDotGrid);
  const patchPunch = useStore((s) => s.patchPunch);
  const grid = useDotGrid(useActiveSide());
  const insert = useInsert();
  return (
    <>
      <Row label={t('격자', 'Grid')}>
        <Check
          checked={grid.showOnScreen}
          onChange={(showOnScreen) => patchDotGrid({ showOnScreen })}
          label={t('화면에 보이기', 'Show on screen')}
        />
      </Row>
      <Row label={t('타공', 'Holes')}>
        <Check checked={insert.punch.show} onChange={(show) => patchPunch({ show })} label={t('화면에 보이기', 'Show on screen')} />
      </Row>
      <Row
        label={t('등분 안내', 'Division guides')}
        hint={t('속지를 가로·세로로 N등분한 자리를 안내선으로 보여줍니다. 화면에만 나오고 인쇄되지 않습니다. 0이면 끕니다', 'Guides that split the insert into N equal parts. Screen only, never printed. 0 turns them off')}
      >
        <div className="cells-row">
          <Num
            value={grid.divisionsX}
            step={1}
            min={0}
            unit={t('가로', 'across')}
            onChange={(n) => patchDotGrid({ divisionsX: Math.max(0, Math.round(n)) })}
          />
          <Num
            value={grid.divisionsY}
            step={1}
            min={0}
            unit={t('세로', 'down')}
            onChange={(n) => patchDotGrid({ divisionsY: Math.max(0, Math.round(n)) })}
          />
        </div>
      </Row>
    </>
  );
}

/**
 * 칸 수 — 간격을 거꾸로 계산한다. 간격은 가로·세로가 하나뿐이라 한 축을 고치면
 * 다른 축은 따라 움직인다(둘 다 정하면 정사각 격자가 아니게 된다).
 */
function CellCountRow() {
  const patchDotGrid = useStore((s) => s.patchDotGrid);
  const insert = useInsert();
  const side = useActiveSide();
  const grid = useDotGrid(side);
  const area = gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back');
  const { cols, rows } = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);
  const margin = grid.toEdge ? 0 : grid.minMargin;

  const setCells = (size: number, n: number) => {
    const spacing = spacingForCells(size, Math.max(1, Math.round(n)), margin);
    if (spacing > 0) patchDotGrid({ spacing });
  };

  return (
    <Row label={t('칸 수', 'Cells')} hint={t('고치면 간격이 거꾸로 계산된다. 간격은 하나뿐이라 다른 축도 따라 움직인다', "Changing this recalculates the spacing. There's one spacing, so the other axis moves too")}>
      <div className="cells-row">
        <Num value={cols} step={1} min={1} unit={t('가로', 'across')} onChange={(n) => setCells(area.width, n)} />
        <Num value={rows} step={1} min={1} unit={t('세로', 'down')} onChange={(n) => setCells(area.height, n)} />
      </div>
    </Row>
  );
}

/** 최소 여백이 실제로 어떤 여백으로 계산됐는지. */
function MarginReadout() {
  const insert = useInsert();
  const side = useActiveSide();
  const grid = useDotGrid(side);
  const area = gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back');
  const { xs, ys } = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);
  if (xs.length === 0 || ys.length === 0) return null;

  // 안전영역을 비우면 한쪽만(앞면은 왼쪽, 뒷면은 오른쪽) 멀어지므로 좌우를 따로 적는다.
  const left = xs[0];
  const right = insert.width - xs[xs.length - 1];
  const top = ys[0];
  const bottom = insert.height - ys[ys.length - 1];
  const r = (v: number) => roundMm(v, 2);
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const margin = !same(left, right)
    ? t(`좌 ${r(left)} · 우 ${r(right)} · 상하 ${r(top)}mm`, `L ${r(left)} · R ${r(right)} · T/B ${r(top)} mm`)
    : same(left, top) && same(top, bottom)
      ? `${r(left)}mm`
      : t(`좌우 ${r(left)}mm · 상하 ${r(top)}mm`, `L/R ${r(left)} mm · T/B ${r(top)} mm`);

  return (
    <div className="readout">
      <span>
        {t('여백', 'Margin')} <b>{margin}</b>
      </span>
      {grid.minMargin === 0 && !grid.toEdge && (
        <span className="muted">{t('최소 여백이 0이라 바깥쪽이 재단선에 붙습니다. 자를 때 반쯤 날아갈 수 있습니다.', 'With a minimum margin of 0, the outer dots sit on the trim line and may get cut in half.')}</span>
      )}
    </div>
  );
}

/** 격자가 아예 안 들어가는지만 알린다. */
function GridReadout() {
  const insert = useInsert();
  const side = useActiveSide();
  const grid = useDotGrid(side);
  const area = gridArea(insert, grid, insert.punch.safeZoneWidth, side === 'back');
  const { xs, ys } = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);
  if (xs.length > 0 && ys.length > 0) return null;
  return (
    <div className="readout readout-warn">
      <strong>{t('격자가 들어가지 않습니다.', "The grid doesn't fit.")}</strong>
      <span>
        {t(
          `간격 ${grid.spacing}mm는 격자 영역 ${roundMm(area.width, 2)} × ${roundMm(area.height, 2)}mm에 비해 너무 넓습니다.`,
          `A ${grid.spacing} mm spacing is too wide for the ${roundMm(area.width, 2)} × ${roundMm(area.height, 2)} mm grid area.`,
        )}
        {grid.avoidSafeZone && t(' 안전영역 비우기를 끄면 넓어집니다.', ' Turning off Keep safe zone clear gives more room.')}
      </span>
    </div>
  );
}

/** 자동 계산된 타공 위치. 사용자가 입력하는 값이 아니다. */
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
          <strong>{t('구멍이 속지를 벗어납니다.', "The holes don't fit on the insert.")}</strong>
          <span>
            {t(
              `구멍 ${insert.punch.holeCount}개를 ${grouped ? '묶음' : '균등'} 배치하면 ${roundMm(span, 1)}mm가 필요한데 속지 세로는 ${insert.height}mm입니다. ${grouped ? '묶음 간격을 줄이거나 균등 배치로 바꾸세요.' : '속지를 키우세요.'}`,
              `${insert.punch.holeCount} ${grouped ? 'grouped' : 'evenly spaced'} holes need ${roundMm(span, 1)} mm, but the insert is ${insert.height} mm tall. ${grouped ? 'Reduce the group gap or space them evenly.' : 'Make the insert taller.'}`,
            )}
          </span>
        </>
      ) : (
        <>
          <span>
            {t('상하 여백', 'Top/bottom margin')} <b>{roundMm(margin, 1)}mm</b> · {t('자동 계산됨', 'calculated')}
          </span>
          <span className="muted">{t('구멍 중심', 'Hole centers')} {centers.map((c) => roundMm(c, 1)).join(' · ')}</span>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── 작은 조각들 ─────────────────────────── */

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <span className="row-label" title={hint}>
        {label}
      </span>
      <div className="row-field">{children}</div>
    </div>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Num({
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
