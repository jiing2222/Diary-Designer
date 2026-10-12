import { useMemo, useState } from 'react';
import { useActiveDiary, useActiveWork, useFaces, useInsert, useStore } from '../store';
import { backLayoutOf, cardAt, paperSize, parsePageRange, sheetCount } from '../core/print';
import { cropModeForSide, type CropMode } from '../core/crop';
import { PAPER_PRESETS } from '../core/presets';
import { cardsToPrint, workExportInput, type WorkPrintSettings } from '../pdf/fromWork';
import { buildPdf, downloadPdf, type ExportInput } from '../pdf/export';
import { loadBodyFont } from '../fonts/load';
import { fontBytes } from '../fonts/registry';
import { imageBytes, imageKind } from '../images/registry';
import { Modal } from './Modal';
import { PaperPreview, type PreviewSlotContent } from './PaperPreview';
import { Check, Num, Row } from './PagePanel';
import { LayoutIcon, MarksIcon, PaperIcon, SidesIcon } from './icons';

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
    }),
    [paper, gap, allowRotate, align, cropMark, cropFrontOnly, showRuler, backTurn180, cutStack, cutStackGroup, blankBackGrid, sides, choice],
  );
}

/** 이번 인쇄의 재료 — PDF와 미리보기가 같이 쓴다. */
function usePrintJob() {
  const work = useActiveWork();
  const diary = useActiveDiary();
  const faces = useFaces();
  const settings = usePrintSettings();
  const range = useStore((s) => s.printRange);
  return useMemo(() => {
    if (!work || !diary) return null;
    // 출력 범위 — 페이지 선택이면 고른 페이지가 든 속지만(양면이면 앞·뒤 함께). 못 읽으면 전체로 보이고 PDF는 막는다.
    const parsed = range.mode === 'pick' ? parsePageRange(range.text, faces.length) : null;
    const picked = parsed && 'faces' in parsed ? parsed.faces : null;
    const rangeError = parsed && 'error' in parsed ? parsed.error : range.mode === 'pick' && picked?.length === 0 ? '' : null;
    const input = workExportInput(work, diary, faces, settings, rangeError === null ? picked : null);
    const slots = input.layout.slots.length;
    const cards = input.datasetPages ?? 0;
    return {
      // 속지 번호 → 앞·뒤 면 번호(PDF 재료와 같은 함수) — 미리보기에서 속지를 누르면 그 페이지로 간다.
      printed: cardsToPrint(work, faces.length, rangeError === null ? picked : null),
      pickedCount: rangeError === null && picked ? picked.length : faces.length,
      /** 고른 페이지(면 번호) — 전체면 null. PDF를 만들 때 미리보기와 같은 범위로. */
      pickedFaces: rangeError === null ? picked : null,
      rangeError,
      work,
      diary,
      faces,
      settings,
      input,
      slots,
      cards,
      sheets: sheetCount(cards, slots),
      backLayout: backLayoutOf(input.layout, input.paperWidth, input.paperHeight, settings.backTurn180),
    };
  }, [work, diary, faces, settings, range]);
}

/* ────────────────────────── 레일과 패널 ────────────────────────── */

export function PrintRail() {
  const [open, setOpen] = useState<PrintTab | null>('paper');
  return (
    <>
      <div className="rail-icons">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`rail-icon ${open === t.id ? 'on' : ''}`}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            title={t.label}
            aria-label={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>
      {open && (
        <aside className="rail-panel print-panel">
          <h2 className="rail-panel-title">{TABS.find((t) => t.id === open)!.label}</h2>
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
      <h3 className="panel-sub">용지</h3>
      <Row label="크기">
        <select value={paper.presetId} onChange={(e) => setPaperPreset(e.target.value)}>
          {PAPER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.width}×{p.height})
            </option>
          ))}
          {paper.presetId === 'custom' && <option value="custom">직접 ({paper.width}×{paper.height})</option>}
        </select>
      </Row>
      <Row label="가로">
        <Num value={paper.width} min={50} max={600} step={1} onChange={(width) => patchPaper({ width })} />
      </Row>
      <Row label="세로">
        <Num value={paper.height} min={50} max={600} step={1} onChange={(height) => patchPaper({ height })} />
      </Row>
      <Row label="방향">
        <span className="seg">
          <button className={!paper.landscape ? 'on' : ''} onClick={() => patchPaper({ landscape: false })}>
            세로
          </button>
          <button className={paper.landscape ? 'on' : ''} onClick={() => patchPaper({ landscape: true })}>
            가로
          </button>
        </span>
      </Row>
      <Row label="여백" hint="속지를 놓지 않는 용지 가장자리">
        <Num value={paper.printMargin} min={0} max={30} onChange={(printMargin) => patchPaper({ printMargin })} />
      </Row>
      <Check checked={unprintable.show} onChange={(show) => patchUnprintable({ show })} label="인쇄 불가 가장자리 표시" />
      {unprintable.show && (
        <Row label="가장자리 폭">
          <Num value={unprintable.width} min={0} max={15} onChange={(width) => patchUnprintable({ width })} />
        </Row>
      )}
      <p className="tool-panel-note">인쇄 대화상자에서 ‘실제 크기(100%)’로 찍어야 mm가 맞아요. Marks의 50mm 눈금으로 확인할 수 있어요.</p>
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
      <h3 className="panel-sub">출력 범위</h3>
      <span className="seg">
        <button className={range.mode === 'all' ? 'on' : ''} onClick={() => set({ mode: 'all' })}>
          전체
        </button>
        <button className={range.mode === 'pick' ? 'on' : ''} onClick={() => set({ mode: 'pick' })}>
          페이지 선택
        </button>
      </span>
      {range.mode === 'pick' && (
        <>
          <input
            className="range-input"
            type="text"
            value={range.text}
            placeholder="예: 1-5, 8"
            onChange={(e) => set({ text: e.target.value })}
          />
          <p className={`tool-panel-note ${job?.rangeError !== null ? 'warn' : ''}`}>
            {job?.rangeError
              ? `‘${job.rangeError}’을 알아볼 수 없어요. 1-5, 8처럼 써요.`
              : job?.rangeError === ''
                ? '페이지 번호를 써요(편집 화면의 p.1, p.2…).'
                : `${job?.pickedCount}페이지 · 속지 ${job?.cards}장${job?.work.duplex ? ' — 양면이라 고른 페이지의 앞·뒤가 함께 나와요' : ''}`}
          </p>
        </>
      )}
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
      <Row label="속지">
        <span className="seg">
          <button className={work.duplex ? 'on' : ''} onClick={() => setDuplex(true)}>
            양면
          </button>
          <button className={!work.duplex ? 'on' : ''} onClick={() => setDuplex(false)}>
            단면
          </button>
        </span>
      </Row>
      <p className="tool-panel-note">이 작업의 설정이에요 — 양면이면 페이지 1·2가 첫 장의 앞·뒤예요(편집 화면의 양면과 같아요).</p>
      {work.duplex && (
        <>
          <Check checked={backTurn180} onChange={(v) => patch({ backTurn180: v })} label="뒷면 반 바퀴 돌리기" />
          <p className="tool-panel-note">짧은 변으로 넘기는 프린터에서 앞뒤 구멍이 어긋나면 켜요.</p>
          <Check checked={blankBackGrid} onChange={(v) => patch({ blankBackGrid: v })} label="빈 뒷면에 배경(도트) 찍기" />
          <p className="tool-panel-note">페이지 수가 홀수일 때 마지막 장의 뒷면이에요. 끄면 빈 종이예요.</p>
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
      <Row label="간격" hint="속지 사이">
        <Num value={gap} min={0} max={30} onChange={(v) => patch({ gap: v })} />
      </Row>
      <Check checked={allowRotate} onChange={(v) => patch({ allowRotate: v })} label="90도 돌려 더 넣기" />
      <Row label="정렬">
        <span className="seg">
          <button className={align === 'center' ? 'on' : ''} onClick={() => patch({ align: 'center' })}>
            가운데
          </button>
          <button className={align === 'topLeft' ? 'on' : ''} onClick={() => patch({ align: 'topLeft' })}>
            왼쪽 위
          </button>
        </span>
      </Row>
      <h3 className="panel-sub">고급</h3>
      <Check checked={cutStack} onChange={(v) => patch({ cutStack: v })} label="자른 뒤 쌓으면 순서대로" />
      {cutStack && (
        <Row label="무더기" hint="몇 장씩 한 무더기로 자를지(0 = 전체)">
          <Num value={cutStackGroup} min={0} max={500} step={1} unit="장" onChange={(v) => patch({ cutStackGroup: v })} />
        </Row>
      )}
    </div>
  );
}

const CROP_MODES: { id: CropMode; label: string }[] = [
  { id: 'none', label: '없음' },
  { id: 'mark', label: '모서리 표시' },
  { id: 'markAll', label: '모든 칸 표시' },
  { id: 'line', label: '선' },
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
      <Row label="절취선">
        <select value={cropMark} onChange={(e) => patch({ cropMark: e.target.value as CropMode })}>
          {CROP_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>
      {cropMark !== 'none' && <Check checked={cropFrontOnly} onChange={(v) => patch({ cropFrontOnly: v })} label="앞면에만" />}
      <Check checked={showRuler} onChange={(v) => patch({ showRuler: v })} label="50mm 검증 눈금" />
      <p className="tool-panel-note">인쇄한 뒤 눈금을 자로 재서 50mm인지 확인해요.</p>
      {duplex && (
        <>
          <Row label="출력 면">
            <span className="seg">
              {(
                [
                  ['both', '둘 다'],
                  ['front', '앞면만'],
                  ['back', '뒷면만'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={printSides === id ? 'on' : ''} onClick={() => patch({ printSides: id })}>
                  {label}
                </button>
              ))}
            </span>
          </Row>
          <p className="tool-panel-note">프린터가 양면을 못 하면 앞면만 찍고, 종이를 뒤집어 넣은 뒤 뒷면만 찍어요.</p>
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
  const [sheet, setSheet] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [guides, setGuides] = useState(false);
  const [asking, setAsking] = useState(false);

  if (!job) return <p className="muted center">작업을 찾을 수 없어요.</p>;
  const { work, input, slots, cards, sheets, backLayout } = job;
  const at = Math.min(sheet, Math.max(0, sheets - 1));
  const back = work.duplex && side === 'back';
  const cardsList = input.datasetOverrides!;
  const backsList = input.datasetBackOverrides!;

  // 이 장·이 면의 칸마다 무엇이 들어가는지 — PDF와 같은 칸 배정(cardAt).
  const slotContent = new Map<number, PreviewSlotContent>();
  const slotFace = new Map<number, number>();
  for (let i = 0; i < slots; i++) {
    const card = cardAt(at, i, cards, slots, { on: job.settings.cutStack, group: job.settings.cutStackGroup || undefined });
    const content = card === null ? undefined : (back ? backsList : cardsList).get(card);
    if (card !== null) {
      const face = back ? job.printed[card]?.back : job.printed[card]?.front;
      if (face !== null && face !== undefined) slotFace.set(i, face);
    }
    slotContent.set(
      i,
      content
        ? {
            insert,
            dotGrid: content.dotGrid,
            objects: content.objects,
            calendar: content.month
              ? { year: content.month.year, page: content.month.month - 1, rules: input.colorRules }
              : undefined,
          }
        : { insert, dotGrid: { ...input.dotGrid, print: false, showOnScreen: false }, objects: [] },
    );
  }

  const size = paperSize(paper);
  const paperName = paper.presetId === 'custom' ? `${size.width}×${size.height}` : paper.presetId;

  return (
    <div className="print">
      <div className="print-bar">
        <button className="ghost print-back" onClick={closePrint}>
          ← 편집으로
        </button>
        <span className="print-title">{work.name}</span>
        <span className="print-bar-gap" />
        <button
          className="primary"
          disabled={job.rangeError !== null || cards === 0}
          title={job.rangeError !== null ? '출력 범위를 먼저 고쳐 주세요' : undefined}
          onClick={() => setAsking(true)}
        >
          Export PDF
        </button>
      </div>
      {asking && <ExportDialog job={job} onClose={() => setAsking(false)} />}

      <div className="print-stage">
        {sheets === 0 ? (
          <p className="muted center">찍을 페이지가 없어요.</p>
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
        <button className="ghost" disabled={at <= 0} onClick={() => setSheet(at - 1)} aria-label="앞 장">
          ‹
        </button>
        <span>
          {sheets === 0 ? 0 : at + 1} / {sheets}장
        </span>
        <button className="ghost" disabled={at >= sheets - 1} onClick={() => setSheet(at + 1)} aria-label="다음 장">
          ›
        </button>
        {work.duplex && (
          <span className="seg">
            <button className={side === 'front' ? 'on' : ''} onClick={() => setSide('front')}>
              앞면
            </button>
            <button className={side === 'back' ? 'on' : ''} onClick={() => setSide('back')}>
              뒷면
            </button>
          </span>
        )}
        <label className="check">
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
          인쇄되지 않는 안내 보기
        </label>
      </div>

      <div className="print-foot">
        {job.pickedCount}페이지 → {paperName} {sheets}장 ({work.duplex ? '양면' : '단면'}) · 속지 {slots}개/장
        <span className="muted"> · 속지를 누르면 그 페이지를 고쳐요</span>
      </div>
    </div>
  );
}

/* ────────────────────────── PDF 전 확인 창 ────────────────────────── */

type PrintJob = NonNullable<ReturnType<typeof usePrintJob>>;

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
      downloadPdf(bytes, `${job.work.name}_${job.diary.presetId}_${paperName}.pdf`);
      onClose();
    } catch {
      showToast('PDF를 만들지 못했어요. 다시 해 볼래요?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="PDF 만들기" onClose={onClose}>
      <div className="export-dialog">
        <label className="check">
          <input type="checkbox" checked={punch} onChange={(e) => setPunch(e.target.checked)} />
          타공 표시를 인쇄할까요?
        </label>
        <p className="tool-panel-note">구멍 자리에 얇은 원을 찍어요. 타공기를 맞출 때 봐요.</p>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
          배경 격자(도트·그리드)를 인쇄할까요?
        </label>
        <p className="tool-panel-note">끄면 모든 페이지의 배경을 찍지 않아요. 켜면 페이지마다 정한 대로예요.</p>
        <p className="export-summary">
          {job.pickedCount}페이지 · {job.sheets}장 ({job.work.duplex ? (job.settings.sides === 'both' ? '양면' : job.settings.sides === 'front' ? '앞면만' : '뒷면만') : '단면'})
        </p>
        <div className="card-dialog-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="primary" onClick={() => void make()} disabled={busy}>
            {busy ? '만드는 중…' : 'PDF 만들기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** PDF에 심을 파일들 — 기본 글꼴, 그리고 실제로 쓰인 등록 글꼴·이미지만(안 쓴 것까지 심으면 무거워진다). */
async function filesFor(faces: PrintJob['faces']): Promise<Pick<ExportInput, 'fontBytes' | 'userFonts' | 'userImages'>> {
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
