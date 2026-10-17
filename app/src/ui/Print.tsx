import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveDiary, useActiveWork, useFaces, useInsert, useStore } from '../store';
import { formatPageRange, paperSize, parsePageRange } from '../core/print';
import { faceLabel } from '../core/work';
import { cropModeForSide, type CropMode } from '../core/crop';
import { PAPER_PRESETS, findInsertPreset } from '../core/presets';
import { workExportInput, type WorkPrintSettings } from '../pdf/fromWork';
import { buildPdf, downloadPdf, type ExportInput } from '../pdf/export';
import { loadBodyFont } from '../fonts/load';
import { fontBytes } from '../fonts/registry';
import { imageBytes, imageKind } from '../images/registry';
import { Modal } from './Modal';
import { PaperPreview } from './PaperPreview';
import { printJob, sheetFaces, sheetSlots, type PrintJob } from './printPreview';
import { Check, Num, Row } from './PagePanel';
import { LayoutIcon, MarksIcon, PaperIcon, SidesIcon } from './icons';
import { t } from '../lang';

/**
 * Print 화면(리뉴얼 6단계, 세부계획 A14 · 디자인.md ‘탭’).
 *
 * 작업 탭 안에서 편집 화면과 바뀐다. 레일은 Paper · Sides · Layout · Marks, 가운데는 종이 미리보기,
 * 아래는 장수 요약 한 줄. Print는 **종이에 어떻게 찍을지만** 다룬다 — 내용을 고치려면 미리보기에서
 * 속지를 눌러 그 페이지의 편집 화면으로 간다.
 *
 * 미리보기는 PDF와 **같은 재료**(pdf/fromWork의 workExportInput)와 같은 칸 배정(core/print의
 * cardAt)·뒷면 배치(backLayoutOf)로 그린다 — 화면에서 본 대로 인쇄된다.
 */
type PrintTab = 'paper' | 'sides' | 'layout' | 'marks';

const TABS: { id: PrintTab; label: string; icon: React.ReactNode }[] = [
  { id: 'paper', label: 'Paper', icon: <PaperIcon /> },
  { id: 'sides', label: 'Sides', icon: <SidesIcon /> },
  { id: 'layout', label: 'Layout', icon: <LayoutIcon /> },
  { id: 'marks', label: 'Marks', icon: <MarksIcon /> },
];

/** 지금 인쇄 설정(store) — PDF 재료를 만들 때 쓰는 모양으로. */
function usePrintSettings(): WorkPrintSettings {
  const paper = useStore((s) => s.paper);
  const gap = useStore((s) => s.gap);
  const allowRotate = useStore((s) => s.allowRotate);
  const align = useStore((s) => s.align);
  const cropMark = useStore((s) => s.cropMark);
  const cropFrontOnly = useStore((s) => s.cropFrontOnly);
  const showRuler = useStore((s) => s.showRuler);
  const backTurn180 = useStore((s) => s.backTurn180);
  const cutStack = useStore((s) => s.cutStack);
  const cutStackGroup = useStore((s) => s.cutStackGroup);
  const blankBackGrid = useStore((s) => s.blankBackGrid);
  const sides = useStore((s) => s.printSides);
  const choice = useStore((s) => s.exportChoice);
  const copies = useStore((s) => s.printCopies);
  return useMemo(
    () => ({
      paper,
      gap,
      allowRotate,
      align,
      cropMark,
      cropFrontOnly,
      showRuler,
      backTurn180,
      cutStack,
      cutStackGroup,
      blankBackGrid,
      sides,
      // 미리보기도 PDF 전 확인 창에서 지난번에 고른 대로 그린다 — 화면에서 본 대로 인쇄된다.
      printGrid: choice.grid,
      printPunch: choice.punch,
      copies,
    }),
    [
      paper,
      gap,
      allowRotate,
      align,
      cropMark,
      cropFrontOnly,
      showRuler,
      backTurn180,
      cutStack,
      cutStackGroup,
      blankBackGrid,
      sides,
      choice,
      copies,
    ],
  );
}

/** 이번 인쇄의 재료 — PDF와 미리보기가 같이 쓴다. */
/** 어느 면을 찍는지 — 양면이어도 ‘앞면만’·‘뒷면만’이면 그렇게 적는다(아래 요약 줄과 PDF 창이 같이 쓴다). */
function sidesLabel(job: PrintJob): string {
  if (!job.work.duplex) return t('단면', 'single-sided');
  if (job.settings.sides === 'front') return t('앞면만', 'fronts only');
  if (job.settings.sides === 'back') return t('뒷면만', 'backs only');
  return t('양면', 'double-sided');
}

function usePrintJob(ignoreRange = false) {
  const work = useActiveWork();
  const diary = useActiveDiary();
  const faces = useFaces();
  const settings = usePrintSettings();
  const storedRange = useStore((s) => s.printRange);
  // ‘모든 장’에서 페이지를 고르는 중에는 전체를 펼쳐 보인다(고른 것만 보이면 더 고를 수 없다).
  const range = ignoreRange ? ALL_PAGES : storedRange;
  return useMemo(
    () => (work && diary ? printJob(work, diary, faces, settings, range) : null),
    [work, diary, faces, settings, range],
  );
}

const ALL_PAGES = { mode: 'all' as const, text: '' };

/* ────────────────────────── 레일과 패널 ────────────────────────── */

export function PrintRail() {
  const [open, setOpen] = useState<PrintTab | null>('paper');
  return (
    <>
      <div className="rail-icons">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`rail-icon ${open === tab.id ? 'on' : ''}`}
            onClick={() => setOpen(open === tab.id ? null : tab.id)}
            data-tip={tab.label}
            aria-label={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      {open && (
        <aside className="rail-panel print-panel">
          <h2 className="rail-panel-title">{TABS.find((tab) => tab.id === open)!.label}</h2>
          {open === 'paper' && <PaperPanel />}
          {open === 'sides' && <SidesPanel />}
          {open === 'layout' && <LayoutPanel />}
          {open === 'marks' && <MarksPanel />}
        </aside>
      )}
    </>
  );
}

function PaperPanel() {
  const paper = useStore((s) => s.paper);
  const unprintable = useStore((s) => s.unprintable);
  const setPaperPreset = useStore((s) => s.setPaperPreset);
  const patchPaper = useStore((s) => s.patchPaper);
  const patchUnprintable = useStore((s) => s.patchUnprintable);
  return (
    <div className="panel-rows">
      <RangeSection />
      <h3 className="panel-sub">{t('용지', 'Paper')}</h3>
      <Row label={t('크기', 'Size')}>
        <select value={paper.presetId} onChange={(e) => setPaperPreset(e.target.value)}>
          {PAPER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {paper.presetId === 'custom' && (
            <option value="custom">
              {t('직접', 'Custom')} ({paper.width}×{paper.height})
            </option>
          )}
        </select>
      </Row>
      <Row label={t('가로', 'Width')}>
        <Num value={paper.width} min={50} max={600} step={1} onChange={(width) => patchPaper({ width })} />
      </Row>
      <Row label={t('세로', 'Height')}>
        <Num value={paper.height} min={50} max={600} step={1} onChange={(height) => patchPaper({ height })} />
      </Row>
      <Row label={t('방향', 'Orientation')}>
        <span className="seg">
          <button className={!paper.landscape ? 'on' : ''} onClick={() => patchPaper({ landscape: false })}>
            {t('세로', 'Portrait')}
          </button>
          <button className={paper.landscape ? 'on' : ''} onClick={() => patchPaper({ landscape: true })}>
            {t('가로', 'Landscape')}
          </button>
        </span>
      </Row>
      <Row label={t('여백', 'Margin')} hint={t('속지를 놓지 않는 용지 가장자리', 'Paper edge kept free of inserts')}>
        <Num value={paper.printMargin} min={0} max={30} onChange={(printMargin) => patchPaper({ printMargin })} />
      </Row>
      <Check
        checked={unprintable.show}
        onChange={(show) => patchUnprintable({ show })}
        label={t('인쇄 불가 가장자리 표시', 'Show unprintable edge')}
      />
      {unprintable.show && (
        <Row label={t('가장자리 폭', 'Edge width')}>
          <Num value={unprintable.width} min={0} max={15} onChange={(width) => patchUnprintable({ width })} />
        </Row>
      )}
      <p className="tool-panel-note">
        {t('인쇄 대화상자에서 ‘실제 크기(100%)’로 찍어야 mm가 맞아요. Marks의 50mm 눈금으로 확인할 수 있어요.', 'Print at Actual size (100%) in the print dialog so the measurements are right. Check with the 50 mm ruler in Marks.')}
      </p>
    </div>
  );
}

/** 출력 범위 — 전체 / 페이지 선택(`1-5, 8`, 세부계획 A14 결정). */
function RangeSection() {
  const range = useStore((s) => s.printRange);
  const patch = useStore((s) => s.patch);
  const job = usePrintJob();
  const set = (p: Partial<typeof range>) => patch({ printRange: { ...range, ...p } });
  return (
    <>
      <h3 className="panel-sub">{t('출력 범위', 'Pages')}</h3>
      <span className="seg">
        <button className={range.mode === 'all' ? 'on' : ''} onClick={() => set({ mode: 'all' })}>
          {t('전체', 'All')}
        </button>
        <button className={range.mode === 'pick' ? 'on' : ''} onClick={() => set({ mode: 'pick' })}>
          {t('페이지 선택', 'Choose pages')}
        </button>
      </span>
      {range.mode === 'pick' && (
        <>
          <input
            className="range-input"
            type="text"
            value={range.text}
            placeholder={t('예: 1-5, 8', 'e.g. 1-5, 8')}
            onChange={(e) => set({ text: e.target.value })}
          />
          <p className={`tool-panel-note ${job?.rangeError !== null ? 'warn' : ''}`}>
            {job?.rangeError
              ? t(`‘${job.rangeError}’을 알아볼 수 없어요. 1-5, 8처럼 써요.`, `Can't read “${job.rangeError}”. Write it like 1-5, 8.`)
              : job?.rangeError === ''
                ? t('페이지 번호를 써요(편집 화면의 p.1, p.2…).', 'Enter page numbers (p.1, p.2… in the editor).')
                : t(
                `${job?.pickedCount}페이지 · 속지 ${job?.cards}장${job?.work.duplex ? ' — 양면이라 고른 페이지의 앞·뒤가 함께 나와요' : ''}`,
                `${job?.pickedCount} page(s) · ${job?.cards} insert(s)${job?.work.duplex ? ' (double-sided, so the front and back of each page come together)' : ''}`,
              )}
          </p>
        </>
      )}
      <CopiesRow />
    </>
  );
}

/**
 * 속지마다 몇 부 — 양식 하나를 용지에 가득(칸이 4개면 4부) 찍을 때 쓴다(옛 ‘반복 인쇄’ 자리).
 * 같은 속지가 이어서 놓이므로 4부면 한 장이 그 속지 4개로 찬다.
 */
function CopiesRow() {
  const copies = useStore((s) => s.printCopies);
  const patch = useStore((s) => s.patch);
  const job = usePrintJob();
  const perSheet = job?.slots ?? 0;
  const set = (n: number) => patch({ printCopies: Math.min(999, Math.max(1, Math.floor(n) || 1)) });
  return (
    <>
      <h3 className="panel-sub">{t('속지마다', 'Copies per insert')}</h3>
      <span className="copies-row">
        <input
          className="range-input copies-input"
          type="number"
          min={1}
          max={999}
          value={copies}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={t('속지마다 몇 부', 'Copies per insert')}
        />
        <span>{t('부', 'copies')}</span>
        {perSheet > 1 && copies !== perSheet && (
          <button className="ghost" onClick={() => set(perSheet)} title={t('용지 한 장을 같은 속지로 가득 채운다', 'Fill a whole sheet with the same insert')}>
            {t(`한 장 가득(${perSheet}부)`, `Fill a sheet (${perSheet})`)}
          </button>
        )}
      </span>
      {copies > 1 && <p className="tool-panel-note">{t(`속지 ${job?.cards}장 → 용지 ${job?.sheets}장. 같은 속지가 이어서 놓여요.`, `${job?.cards} insert(s) → ${job?.sheets} sheet(s). Copies of the same insert sit together.`)}</p>}
    </>
  );
}

function SidesPanel() {
  const work = useActiveWork();
  const setDuplex = useStore((s) => s.setDuplex);
  const backTurn180 = useStore((s) => s.backTurn180);
  const blankBackGrid = useStore((s) => s.blankBackGrid);
  const patch = useStore((s) => s.patch);
  if (!work) return null;
  return (
    <div className="panel-rows">
      <Row label={t('속지', 'Inserts')}>
        <span className="seg">
          <button className={work.duplex ? 'on' : ''} onClick={() => setDuplex(true)}>
            {t('양면', 'Double-sided')}
          </button>
          <button className={!work.duplex ? 'on' : ''} onClick={() => setDuplex(false)}>
            {t('단면', 'Single-sided')}
          </button>
        </span>
      </Row>
      {work.duplex && (
        <>
          <Check checked={backTurn180} onChange={(v) => patch({ backTurn180: v })} label={t('뒷면 반 바퀴 돌리기', 'Rotate backs 180°')} />
          <Check
            checked={blankBackGrid}
            onChange={(v) => patch({ blankBackGrid: v })}
            label={t('빈 뒷면에 배경(도트) 찍기', 'Print the background (dots) on blank backs')}
          />
        </>
      )}
    </div>
  );
}

function LayoutPanel() {
  const gap = useStore((s) => s.gap);
  const allowRotate = useStore((s) => s.allowRotate);
  const align = useStore((s) => s.align);
  const cutStack = useStore((s) => s.cutStack);
  const cutStackGroup = useStore((s) => s.cutStackGroup);
  const patch = useStore((s) => s.patch);
  return (
    <div className="panel-rows">
      <Row label={t('간격', 'Gap')} hint={t('속지 사이', 'Between inserts')}>
        <Num value={gap} min={0} max={30} onChange={(v) => patch({ gap: v })} />
      </Row>
      <Check checked={allowRotate} onChange={(v) => patch({ allowRotate: v })} label={t('90도 돌려 더 넣기', 'Rotate 90° to fit more')} />
      <Row label={t('정렬', 'Align')}>
        <span className="seg">
          <button className={align === 'center' ? 'on' : ''} onClick={() => patch({ align: 'center' })}>
            {t('가운데', 'Center')}
          </button>
          <button className={align === 'topLeft' ? 'on' : ''} onClick={() => patch({ align: 'topLeft' })}>
            {t('왼쪽 위', 'Top left')}
          </button>
        </span>
      </Row>
      <h3 className="panel-sub">{t('고급', 'Advanced')}</h3>
      <Check checked={cutStack} onChange={(v) => patch({ cutStack: v })} label={t('자른 뒤 쌓으면 순서대로', 'In order after cutting and stacking')} />
      {cutStack && (
        <Row label={t('무더기', 'Stack size')} hint={t('몇 장씩 한 무더기로 자를지(0 = 전체)', 'How many sheets to cut per stack (0 = all)')}>
          <Num
            value={cutStackGroup}
            min={0}
            max={500}
            step={1}
            unit={t('장', 'sheets')}
            onChange={(v) => patch({ cutStackGroup: v })}
          />
        </Row>
      )}
    </div>
  );
}

// 함수로 둔다 — 모듈을 읽을 때 한 번 정하면 언어가 바뀌어도 그대로 남는다.
const cropModes = (): { id: CropMode; label: string }[] => [
  { id: 'none', label: t('없음', 'None') },
  { id: 'mark', label: t('모서리 표시', 'Corner marks') },
  { id: 'markAll', label: t('모든 칸 표시', 'Marks on every cell') },
  { id: 'line', label: t('선', 'Lines') },
];

function MarksPanel() {
  const cropMark = useStore((s) => s.cropMark);
  const cropFrontOnly = useStore((s) => s.cropFrontOnly);
  const showRuler = useStore((s) => s.showRuler);
  const printSides = useStore((s) => s.printSides);
  const duplex = useActiveWork()?.duplex ?? false;
  const patch = useStore((s) => s.patch);
  return (
    <div className="panel-rows">
      <Row label={t('절취선', 'Crop marks')}>
        <select value={cropMark} onChange={(e) => patch({ cropMark: e.target.value as CropMode })}>
          {cropModes().map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>
      {cropMark !== 'none' && (
        <Check checked={cropFrontOnly} onChange={(v) => patch({ cropFrontOnly: v })} label={t('앞면에만', 'Fronts only')} />
      )}
      <Check checked={showRuler} onChange={(v) => patch({ showRuler: v })} label={t('50mm 검증 눈금', '50 mm test ruler')} />
      {duplex && (
        <>
          <Row label={t('출력 면', 'Print sides')}>
            <span className="seg">
              {(
                [
                  ['both', t('둘 다', 'Both')],
                  ['front', t('앞면만', 'Fronts only')],
                  ['back', t('뒷면만', 'Backs only')],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={printSides === id ? 'on' : ''} onClick={() => patch({ printSides: id })}>
                  {label}
                </button>
              ))}
            </span>
          </Row>
        </>
      )}
    </div>
  );
}

/* ────────────────────────── 가운데: 미리보기 ────────────────────────── */

export function PrintMain() {
  const job = usePrintJob();
  const insert = useInsert();
  const paper = useStore((s) => s.paper);
  const unprintable = useStore((s) => s.unprintable);
  const closePrint = useStore((s) => s.closePrint);
  const goToFace = useStore((s) => s.goToFace);
  const range = useStore((s) => s.printRange);
  const patch = useStore((s) => s.patch);
  const [sheet, setSheet] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [guides, setGuides] = useState(false);
  const [asking, setAsking] = useState(false);
  const [view, setView] = useState<'one' | 'all'>('one');
  const [picking, setPicking] = useState(false);

  if (!job) return <p className="muted center">{t('작업을 찾을 수 없어요.', 'Work not found.')}</p>;
  const { work, input, slots, sheets, backLayout } = job;
  const at = Math.min(sheet, Math.max(0, sheets - 1));
  const back = work.duplex && side === 'back';

  const { content: slotContent, face: slotFace } =
    view === 'one' ? sheetSlots(job, at, back, insert) : { content: undefined, face: new Map<number, number>() };

  const size = paperSize(paper);
  const paperName = paper.presetId === 'custom' ? `${size.width}×${size.height}` : paper.presetId;

  return (
    <div className="print">
      <div className="print-bar">
        <button className="ghost print-back" onClick={closePrint}>
          {t('← 편집으로', '← Back to editing')}
        </button>
        <span className="print-title">{work.name}</span>
        <span className="print-bar-gap" />
        <button
          className="primary"
          disabled={job.rangeError !== null || sheets === 0}
          title={
            job.rangeError !== null
              ? t('출력 범위를 먼저 고쳐 주세요', 'Fix the page range first')
              : slots === 0
                ? t('속지가 들어가는 용지를 골라 주세요', 'Choose a paper the inserts fit on')
                : undefined
          }
          onClick={() => setAsking(true)}
        >
          Export PDF
        </button>
      </div>
      {asking && <ExportDialog job={job} onClose={() => setAsking(false)} />}

      <div className={`print-stage ${view === 'all' ? 'all' : ''}`}>
        {view === 'all' ? (
          <AllSheets picking={picking} />
        ) : sheets === 0 ? (
          <p className="muted center">
            {slots === 0 ? t('이 용지에는 속지가 들어가지 않아요. 용지 크기를 바꿔 주세요.', "The inserts don't fit on this paper. Choose a different paper size.") : t('찍을 페이지가 없어요.', 'No pages to print.')}
          </p>
        ) : (
          <PaperPreview
            paper={{ ...paper, ...size }}
            insert={insert}
            dotGrid={input.dotGrid}
            objects={[]}
            layout={back ? backLayout : input.layout}
            cropMark={cropModeForSide(input.cropMark, input.cropFrontOnly ?? false, back)}
            showRuler={input.showRuler}
            unprintable={unprintable}
            slotOverrides={slotContent}
            mode={guides ? 'edit' : 'print'}
            mirror={back}
            onSlotClick={(i) => {
              const face = slotFace.get(i);
              if (face !== undefined) goToFace(face);
            }}
          />
        )}
      </div>

      <div className="print-nav">
        <span className="seg">
          <button className={view === 'one' ? 'on' : ''} onClick={() => setView('one')}>
            {t('한 장씩', 'One sheet')}
          </button>
          <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>
            {t('모든 장', 'All sheets')}
          </button>
        </span>
        {view === 'all' ? (
          <label className="check">
            <input
              type="checkbox"
              checked={picking}
              onChange={(e) => {
                const enabled = e.target.checked;
                if (enabled && range.mode === 'all') patch({ printRange: { mode: 'pick', text: '' } });
                setPicking(enabled);
              }}
            />
            {t('눌러서 출력할 페이지 고르기', 'Click to choose pages to print')}
          </label>
        ) : (
          <>
            <button className="ghost" disabled={at <= 0} onClick={() => setSheet(at - 1)} aria-label={t('앞 장', 'Previous sheet')}>
              ‹
            </button>
            <span>
              {sheets === 0 ? 0 : at + 1} / {sheets}
            </span>
            <button className="ghost" disabled={at >= sheets - 1} onClick={() => setSheet(at + 1)} aria-label={t('다음 장', 'Next sheet')}>
              ›
            </button>
            {work.duplex && (
              <span className="seg">
                <button className={side === 'front' ? 'on' : ''} onClick={() => setSide('front')}>
                  {t('앞면', 'Front')}
                </button>
                <button className={side === 'back' ? 'on' : ''} onClick={() => setSide('back')}>
                  {t('뒷면', 'Back')}
                </button>
              </span>
            )}
            <label className="check">
              <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
              {t('인쇄되지 않는 안내 보기', 'Show non-printing guides')}
            </label>
          </>
        )}
      </div>

      <div className="print-foot">
        {t(
          `${job.pickedCount}페이지 → ${paperName} ${sheets}장 (${sidesLabel(job)}) · 속지 ${slots}개/장`,
          `${job.pickedCount} page(s) → ${sheets} ${paperName} sheet(s) (${sidesLabel(job)}) · ${slots} insert(s)/sheet`,
        )}
        <span className="muted">
          {' '}
          · {view === 'all' && picking ? t('속지를 눌러 출력할 페이지를 골라요', 'Click inserts to choose pages to print') : t('속지를 누르면 그 페이지를 고쳐요', 'Click an insert to edit that page')}
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────── 모든 장 ────────────────────────── */

/**
 * 모든 종이를 작은 그림으로(세부계획 A14 결정 2026-10-06) — 종이마다 어떤 속지(p.3 · 10/5)가 앞·뒤
 * 어디에 들어가는지 본다. 속지를 누르면 그 페이지의 편집 화면으로, ‘눌러서 고르기’를 켜면 출력 범위에
 * 넣고 뺀다(세부계획 A14 결정 2026-10-12). 고르는 중에는 전체를 펼쳐 보인다.
 */
function AllSheets({ picking }: { picking: boolean }) {
  const job = usePrintJob(picking);
  const insert = useInsert();
  const paper = useStore((s) => s.paper);
  const range = useStore((s) => s.printRange);
  const patch = useStore((s) => s.patch);
  const goToFace = useStore((s) => s.goToFace);
  if (!job) return null;
  const size = paperSize(paper);

  const parsed = range.mode === 'pick' ? parsePageRange(range.text, job.faces.length) : null;
  const picked = new Set(
    range.mode === 'all' ? job.faces.map((_, i) => i) : parsed && 'faces' in parsed ? parsed.faces : [],
  );
  const toggle = (face: number) => {
    const next = new Set(picked);
    if (next.has(face)) next.delete(face);
    else next.add(face);
    patch({ printRange: { mode: 'pick', text: formatPageRange([...next]) } });
  };
  const click = (face: number | undefined) => {
    if (face === undefined) return;
    if (picking) toggle(face);
    else goToFace(face);
  };

  if (job.sheets === 0)
    return (
      <p className="muted center">
        {job.slots === 0 ? t('이 용지에는 속지가 들어가지 않아요. 용지 크기를 바꿔 주세요.', "The inserts don't fit on this paper. Choose a different paper size.") : t('찍을 페이지가 없어요.', 'No pages to print.')}
      </p>
    );
  return (
    <div className="all-sheets">
      {Array.from({ length: job.sheets }, (_, sheet) => {
        const sides = job.work.duplex ? ([false, true] as const) : ([false] as const);
        return (
          <LazySheet key={sheet} label={t(`${sheet + 1}장`, `Sheet ${sheet + 1}`)}>
            {(visible) =>
              sides.map((back) => {
                // 설명은 늘 남겨 카드 높이를 유지하고, 화면 밖의 무거운 SVG만 내려놓는다.
                const face = sheetFaces(job, sheet, back);
                const names = [...face.values()].map((f) => faceLabel(job.faces[f], f));
                return (
                  <figure key={String(back)} className="sheet-side">
                    <div className="sheet-picture" style={{ height: (150 * size.height) / size.width }}>
                      {visible ? (
                        <PaperPreview
                          paper={{ ...paper, ...size }}
                          insert={insert}
                          dotGrid={job.input.dotGrid}
                          objects={[]}
                          layout={back ? job.backLayout : job.input.layout}
                          cropMark={cropModeForSide(job.input.cropMark, job.input.cropFrontOnly ?? false, back)}
                          showRuler={job.input.showRuler}
                          unprintable={{ show: false, width: 0 }}
                          slotOverrides={sheetSlots(job, sheet, back, insert, picking ? picked : undefined).content}
                          mode="print"
                          mirror={back}
                          onSlotClick={(i) => click(face.get(i))}
                        />
                      ) : (
                        <div className="sheet-placeholder" />
                      )}
                    </div>
                    <figcaption>
                      <b>{back ? t('뒤', 'Back') : t('앞', 'Front')}</b> {names.length > 0 ? names.join(' · ') : t('비어 있음', 'Empty')}
                    </figcaption>
                  </figure>
                );
              })
            }
          </LazySheet>
        );
      })}
    </div>
  );
}

/** 화면에 들어올 때만 안을 그린다 — 장이 많아도(100장 이상) 가볍게(세부계획 A14). */
function LazySheet({ label, children }: { label: string; children: (visible: boolean) => React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((e) => e.isIntersecting));
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className="sheet-card">
      <h3 className="sheet-card-title">{label}</h3>
      <div className="sheet-card-body">{children(visible)}</div>
    </section>
  );
}

/* ────────────────────────── PDF 전 확인 창 ────────────────────────── */

/**
 * PDF를 만들기 직전에 묻는다 — 타공 표시·배경 격자를 찍을지(기능후보 9 결정: 잊기 쉬워 매번 묻고,
 * 지난번 선택을 미리 체크해 둔다). 고른 것은 기억해서 미리보기도 그대로 그린다.
 */
function ExportDialog({ job, onClose }: { job: PrintJob; onClose: () => void }) {
  const choice = useStore((s) => s.exportChoice);
  const patch = useStore((s) => s.patch);
  const showToast = useStore((s) => s.showToast);
  const paper = useStore((s) => s.paper);
  const [grid, setGrid] = useState(choice.grid);
  const [punch, setPunch] = useState(choice.punch);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    patch({ exportChoice: { grid, punch } });
    try {
      const settings = { ...job.settings, printGrid: grid, printPunch: punch };
      const files = await filesFor(job.faces);
      const input = workExportInput(job.work, job.diary, job.faces, settings, job.pickedFaces, files);
      const bytes = await buildPdf(input);
      const paperName = paper.presetId === 'custom' ? `${paper.width}x${paper.height}` : paper.presetId;
      // 파일 이름에는 화면에서 보는 규격 이름을(‘Pocket (M6)’ → ‘Pocket-M6’) — 내부 코드(DA6 등)가 아니라.
      const sizeName = (findInsertPreset(job.diary.presetId)?.name ?? job.diary.presetId).replace(/[()]/g, '').trim().replace(/\s+/g, '-');
      downloadPdf(bytes, `${job.work.name}_${sizeName}_${paperName}.pdf`);
      onClose();
    } catch {
      showToast(t('PDF를 만들지 못했어요. 다시 해 볼래요?', "Couldn't make the PDF. Try again?"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('PDF 만들기', 'Make PDF')} onClose={onClose}>
      <div className="export-dialog">
        <label className="check">
          <input type="checkbox" checked={punch} onChange={(e) => setPunch(e.target.checked)} />
          {t('타공 표시를 인쇄할까요?', 'Print hole marks?')}
        </label>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
          {t('배경 격자(도트·그리드)를 인쇄할까요?', 'Print the background grid (dots or grid)?')}
        </label>
        <p className="export-summary">
          {t(`${job.pickedCount}페이지 · ${job.sheets}장`, `${job.pickedCount} page(s) · ${job.sheets} sheet(s)`)} (
          {sidesLabel(job)}
          )
        </p>
        <div className="card-dialog-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>
            {t('취소', 'Cancel')}
          </button>
          <button className="primary" onClick={() => void make()} disabled={busy}>
            {busy ? t('만드는 중…', 'Making…') : t('PDF 만들기', 'Make PDF')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** PDF에 심을 파일들 — 기본 글꼴, 그리고 실제로 쓰인 등록 글꼴·이미지만(안 쓴 것까지 심으면 무거워진다). */
async function filesFor(
  faces: PrintJob['faces'],
): Promise<Pick<ExportInput, 'fontBytes' | 'userFonts' | 'userImages'>> {
  const fontIds = new Set<string>();
  const imageIds = new Set<string>();
  for (const f of faces) {
    for (const o of f.objects) {
      if ((o.type === 'text' || o.type === 'calendar') && o.font) fontIds.add(o.font);
      if (o.type === 'image' && o.imageId) imageIds.add(o.imageId);
    }
  }
  const userFonts = new Map<string, ArrayBuffer>();
  for (const id of fontIds) {
    const b = fontBytes(id);
    if (b) userFonts.set(id, b);
  }
  const userImages = new Map<string, { bytes: ArrayBuffer; kind: 'png' | 'jpg' }>();
  for (const id of imageIds) {
    const b = imageBytes(id);
    const kind = imageKind(id);
    if (b && kind) userImages.set(id, { bytes: b, kind });
  }
  return { fontBytes: await loadBodyFont(), userFonts, userImages };
}
