import { useMemo, useState } from 'react';
import { useActiveDiary, useActiveWork, useFaces, useInsert, useStore } from '../store';
import { backLayoutOf, cardAt, paperSize, sheetCount } from '../core/print';
import { cropModeForSide, type CropMode } from '../core/crop';
import { PAPER_PRESETS } from '../core/presets';
import { cardsToPrint, workExportInput, type WorkPrintSettings } from '../pdf/fromWork';
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
  return useMemo(
    () => ({ paper, gap, allowRotate, align, cropMark, cropFrontOnly, showRuler, backTurn180, cutStack, cutStackGroup, blankBackGrid }),
    [paper, gap, allowRotate, align, cropMark, cropFrontOnly, showRuler, backTurn180, cutStack, cutStackGroup, blankBackGrid],
  );
}

/** 이번 인쇄의 재료 — PDF와 미리보기가 같이 쓴다. */
function usePrintJob() {
  const work = useActiveWork();
  const diary = useActiveDiary();
  const faces = useFaces();
  const settings = usePrintSettings();
  return useMemo(() => {
    if (!work || !diary) return null;
    const input = workExportInput(work, diary, faces, settings, null);
    const slots = input.layout.slots.length;
    const cards = input.datasetPages ?? 0;
    return {
      // 속지 번호 → 앞·뒤 면 번호(PDF 재료와 같은 함수) — 미리보기에서 속지를 누르면 그 페이지로 간다.
      printed: cardsToPrint(work, faces.length, null),
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
  }, [work, diary, faces, settings]);
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

  if (!job) return <p className="muted center">작업을 찾을 수 없어요.</p>;
  const { work, input, slots, cards, sheets, backLayout, faces } = job;
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
      </div>

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
        {faces.length}페이지 → {paperName} {sheets}장 ({work.duplex ? '양면' : '단면'}) · 속지 {slots}개/장
        <span className="muted"> · 속지를 누르면 그 페이지를 고쳐요</span>
      </div>
    </div>
  );
}
