import { useEffect, useState } from 'react';
import { activeTemplate, paperSize, resolveSlotTemplates, selectLayout, useStore } from '../store';
import {
  capacityPerSheet,
  cutStackPage,
  filledSlots,
  frontBackFilled,
  sheetsNeeded,
} from '../core/template';
import { mirrorLayout } from '../core/layout';
import { datasetPages } from '../core/dataset';
import { resolveObjectsForPage } from '../core/format';
import { DEFAULT_DOT_GRID, type DotGrid } from '../core/grid';
import { SettingsPanel } from './SettingsPanel';
import { PaperPreview, type PreviewSlotContent } from './PaperPreview';
import { EditorTab } from './EditorTab';
import { GalleryTab } from './GalleryTab';
import { ProjectFile } from './ProjectFile';
import { SlotAssign } from './SlotAssign';
import { RepeatPrint } from './RepeatPrint';
import { buildPdf, downloadPdf, type SlotContent } from '../pdf/export';
import { loadBodyFont, loadBoldFont } from '../fonts/load';
import { fontBytes as fontBytes_, restoreCachedFonts } from '../fonts/registry';
import {
  imageBytes as imageBytes_,
  imageKind as imageKind_,
  restoreCachedImages,
} from '../images/registry';
import type { ImageObject, TextObject } from '../core/objects';

type Tab = 'gallery' | 'edit' | 'print';

/**
 * 반복 인쇄에서 마지막 장의 남는 칸. 화면에서는 완전히 비워 보여준다.
 * pdf/export.ts의 `BLANK_SLOT`과 같은 생각이다 — 인쇄물과 미리보기가 같아야 한다.
 */
const BLANK_PREVIEW_GRID: DotGrid = { ...DEFAULT_DOT_GRID, showOnScreen: false, print: false };

export function App() {
  const s = useStore();
  const [busy, setBusy] = useState(false);

  // 새로고침 뒤 브라우저(IndexedDB)에 남아 있는 글꼴·이미지를 자동으로
  // 되살린다 — 예전에 등록했던 파일을 다시 고를 필요가 없어진다. 마운트에
  // 한 번만 하면 되므로 useStore.getState()로 리액트 구독 없이 store에 바로
  // 넣는다.
  useEffect(() => {
    restoreCachedFonts().then((fonts) => fonts.forEach((f) => useStore.getState().addUserFont(f)));
    restoreCachedImages().then((images) => images.forEach((i) => useStore.getState().addUserImage(i)));
  }, []);

  // 처음 열면 양식이 하나도 없다. 갤러리에서 시작해 첫 양식을 만들게 한다.
  const [tab, setTab] = useState<Tab>('gallery');
  /**
   * 인쇄하기 탭 전용. 켜면 지금 켜둔 도트·타공 화면 설정과 무관하게 **실제로
   * 인쇄될 모습만** 보여준다. 원래 설정은 그대로 두고 보는 방식만 잠깐 바꾸는
   * 것이라 store에 넣지 않는다 — 탭을 나가면 잊혀도 되는 값이다.
   */
  const [printPreview, setPrintPreview] = useState(true);
  /**
   * 반복 인쇄 미리보기가 지금 몇 번째 장을 보여주는지.
   *
   * store에 넣지 않는다 — 실제 데이터가 아니라 "지금 뭘 보고 있는지"일 뿐이라,
   * 다른 양식으로 옮겨가면 잊혀도 상관없다. 범위를 벗어나도(매수를 줄인 뒤 등)
   * 아래에서 clamp하므로 따로 초기화하지 않는다.
   */
  const [previewPage, setPreviewPage] = useState(0);
  /**
   * 인쇄하기 탭 미리보기가 지금 앞면·뒷면 중 어느 쪽을 보여주는지.
   *
   * 양면을 껐다 켰다 해도 잊혀도 되는 값이라 store에 넣지 않는다 — 편집 화면의
   * `side`와 달리, 이건 그리는 대상이 아니라 "지금 뭘 보고 있는지"일 뿐이다.
   */
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');

  const { width, height } = paperSize(s.paper);
  const layout = selectLayout(s);
  const active = activeTemplate(s);

  /*
   * 낱장 조합·반복 인쇄(만년형)·세트형은 설계문서 8장의 원칙대로 한 인쇄에
   * 섞이지 않는다. `active.repeat.mode`가 어느 쪽인지 정한다 — 사용자가 따로
   * 고르지 않는다.
   */
  const printMode: 'combo' | 'repeat' | 'dataset' =
    active?.repeat.mode === 'repeat'
      ? 'repeat'
      : active?.repeat.mode === 'dataset'
        ? 'dataset'
        : 'combo';
  const totalSlots = active?.repeat.mode === 'repeat' ? active.repeat.count : 0;
  const dataset = active?.repeat.mode === 'dataset' ? active.repeat.dataset : null;
  const totalPages = dataset ? datasetPages(dataset) : 0;

  const previewOverrides = new Map<number, PreviewSlotContent>();
  const pdfOverrides = new Map<number, SlotContent>();
  /** 뒷면 쪽 override. 앞면과 같은 인덱스, 같은 채우는 규칙을 쓴다. */
  const previewBackOverrides = new Map<number, PreviewSlotContent>();
  const pdfBackOverrides = new Map<number, SlotContent | null>();
  /** 반복 인쇄가 아닐 때만 쓰인다. 글꼴을 모을 때 어느 양식들이 관여했는지 알아야 한다. */
  let slotTemplates: ReturnType<typeof resolveSlotTemplates> = [];

  /**
   * 뒷면이 없는 칸에 쓸 내용.
   *
   * 기본은 완전히 빈 칸(`undefined`)이다. `fillEmptyBack`을 켜면 대신 그 양식의
   * **앞면과 같은 도트·그리드**를 쓰되 그린 것은 넣지 않는다 — 뒷면을 따로
   * 디자인하지 않았어도 백지가 아니라 쓸 수 있는 면으로 찍고 싶을 때다.
   */
  const backFallback = (t: { dotGrid: DotGrid; insert: { punch: { safeZoneWidth: number } } }): SlotContent | undefined =>
    s.fillEmptyBack
      ? { dotGrid: t.dotGrid, objects: [], safeZoneWidth: t.insert.punch.safeZoneWidth }
      : undefined;

  /** 지금 양식의 뒷면. 없으면 backFallback(또는 완전히 빈 칸)을 쓴다. */
  const defaultBack: SlotContent | undefined = active?.back
    ? {
        dotGrid: active.dotGrid,
        objects: active.back.objects.present,
        safeZoneWidth: active.insert.punch.safeZoneWidth,
      }
    : active
      ? backFallback(active)
      : undefined;

  if (active && printMode === 'repeat') {
    /*
     * 반복 인쇄(만년형) — 이 양식 하나로 모든 칸을 채운다.
     *
     * 지금 미리보기 페이지에서 앞·뒤 각각 모자라는 칸만 완전히 비운다.
     * `frontBackFilled`를 core/template에서 가져와 쓴다 — pdf/export.ts도 같은
     * 함수로 마지막 장의 빈 칸을 정하므로, 미리보기에서 본 빈 칸이 실제
     * 인쇄물과 어긋나지 않는다.
     */
    const { front: frontFilled, back: backFilled } = frontBackFilled(
      previewPage,
      totalSlots,
      layout.count,
      s.duplex,
    );
    for (let i = frontFilled; i < layout.count; i++) {
      previewOverrides.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
    }
    for (let i = backFilled; i < layout.count; i++) {
      previewBackOverrides.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
    }
  } else if (active && printMode === 'dataset' && dataset) {
    /*
     * 세트형 — 칸마다 다른 쪽. previewPage는 지금 보는 장 번호다.
     *
     * 겹치기 배치(cutStack)가 꺼져 있으면 그 장의 칸 i는 전체 쪽 번호
     * `previewPage × 칸수 + i`를 가리킨다 — pdf/export.ts와 같은 셈법이다
     * (칸 하나 = 한 쪽의 앞뒤, 양면이어도 칸 수가 늘지 않는다). 켜져 있으면
     * `cutStackPage`가 칸마다 담당 쪽을 따로 정해준다.
     *
     * 여기서는 **지금 보는 장의 칸만** 계산한다. 전체 쪽(수십~수백)을 렌더마다
     * 다 계산하면 느려진다 — 전체는 exportPdf에서 실제로 내보낼 때만 계산한다.
     */
    const filled = filledSlots(previewPage, totalPages, layout.count);
    for (let i = 0; i < layout.count; i++) {
      const page = s.cutStack
        ? cutStackPage(previewPage, i, totalPages, layout.count, s.cutStackGroup || undefined)
        : i < filled
          ? previewPage * layout.count + i
          : null;

      if (page === null) {
        previewOverrides.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
        previewBackOverrides.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
        continue;
      }
      previewOverrides.set(i, {
        insert: active.insert,
        dotGrid: active.dotGrid,
        objects: resolveObjectsForPage(active.objects.present, dataset, page),
        calendarPage: page,
      });
      previewBackOverrides.set(
        i,
        active.back
          ? {
              insert: active.insert,
              dotGrid: active.dotGrid,
              objects: resolveObjectsForPage(active.back.objects.present, dataset, page),
              calendarPage: page,
            }
          : {
              insert: active.insert,
              dotGrid: s.fillEmptyBack ? active.dotGrid : BLANK_PREVIEW_GRID,
              objects: [],
            },
      );
    }
  } else if (active) {
    /*
     * 낱장 조합 — 칸마다 다른 양식.
     *
     * `resolveSlotTemplates`가 칸마다 실제로 쓸 양식을 정해준다(배정이 없거나
     * 규격이 다르면 지금 양식으로 대신한다). 화면 미리보기와 PDF가 **같은 배열을
     * 함께 본다** — 둘이 따로 계산하면 언젠가 어긋난다.
     *
     * 지금 양식과 같은 칸은 굳이 override에 넣지 않는다. 대부분의 칸이 지금
     * 양식을 그대로 쓰므로, 다른 칸만 골라내는 편이 다루기 쉽다.
     */
    slotTemplates = resolveSlotTemplates(s, layout.count);
    slotTemplates.forEach((t, i) => {
      if (t.id === active.id) return;
      previewOverrides.set(i, { insert: t.insert, dotGrid: t.dotGrid, objects: t.objects.present });
      pdfOverrides.set(i, {
        dotGrid: t.dotGrid,
        objects: t.objects.present,
        safeZoneWidth: t.insert.punch.safeZoneWidth,
      });
      // 배정된 양식에 뒷면이 없으면 지금 양식의 뒷면(defaultBack)이 아니라
      // 이 칸만의 backFallback을 쓴다 — fillEmptyBack이 꺼져 있으면 완전히 빈다.
      previewBackOverrides.set(
        i,
        t.back
          ? { insert: t.insert, dotGrid: t.dotGrid, objects: t.back.objects.present }
          : { insert: t.insert, dotGrid: s.fillEmptyBack ? t.dotGrid : BLANK_PREVIEW_GRID, objects: [] },
      );
      pdfBackOverrides.set(
        i,
        t.back
          ? { dotGrid: t.dotGrid, objects: t.back.objects.present, safeZoneWidth: t.insert.punch.safeZoneWidth }
          : (backFallback(t) ?? null),
      );
    });
  }

  async function exportPdf() {
    if (!active) return;
    setBusy(true);
    try {
      // 반복 인쇄·세트형이면 이 양식 하나의 글자만 본다. 낱장 조합이면 배정된
      // 모든 칸의 글자를 함께 본다 — 어느 칸에 글꼴이 필요한지는 core/pdf의
      // slotOverrides가 알아서 합쳐 보지만, 어떤 글꼴 파일을 받아와야 하는지는
      // 여기서 먼저 정한다.
      const uniqueTemplates =
        printMode !== 'combo'
          ? [active]
          : [...new Map(slotTemplates.map((t) => [t.id, t])).values()];
      const isText = (o: { type: string }): o is TextObject => o.type === 'text';
      // 뒷면 글자도 함께 본다 — 앞면만 보면 뒷면에만 있는 글꼴이 빠진다.
      const allTexts: TextObject[] = uniqueTemplates.flatMap((t) => [
        ...t.objects.present.filter(isText),
        ...(t.back?.objects.present.filter(isText) ?? []),
      ]);

      // 글자가 있을 때만 글꼴을 받는다. 하나에 2.7MB짜리라 괜히 받을 이유가 없다.
      // 굵기마다 파일이 따로라 Bold도 굵은 글자가 실제로 있을 때만 받는다.
      const fontBytes = allTexts.length > 0 ? await loadBodyFont() : undefined;
      const boldFontBytes = allTexts.some((t) => t.bold) ? await loadBoldFont() : undefined;

      // 등록 글꼴은 실제로 쓰이는 것만 모은다. 등록소에 없는 id(새로고침 뒤에
      // 남은 글자)는 그냥 빠지고, PDF에서도 기본 글꼴로 그려진다.
      const userFonts = new Map<string, ArrayBuffer>();
      for (const t of allTexts) {
        const b = t.font ? fontBytes_(t.font) : undefined;
        if (t.font && b) userFonts.set(t.font, b);
      }

      // 이미지도 같은 방식이다 — 등록소에 없는 id(새로고침 뒤 다시 등록하지
      // 않은 이미지)는 빠지고, PDF에서도 화면처럼 그 자리만 비게 된다.
      const isImageObj = (o: { type: string }): o is ImageObject => o.type === 'image';
      const allImages: ImageObject[] = uniqueTemplates.flatMap((t) => [
        ...t.objects.present.filter(isImageObj),
        ...(t.back?.objects.present.filter(isImageObj) ?? []),
      ]);
      const userImages = new Map<string, { bytes: ArrayBuffer; kind: 'png' | 'jpg' }>();
      for (const o of allImages) {
        if (!o.imageId) continue; // 아직 사진을 안 고른 빈 상자.
        const bytes = imageBytes_(o.imageId);
        const kind = imageKind_(o.imageId);
        if (bytes && kind) userImages.set(o.imageId, { bytes, kind });
      }

      /*
       * 세트형 — 모든 쪽의 자동 필드를 실제 값으로 채운다.
       *
       * 미리보기와 달리 **지금 보는 장만이 아니라 전체 쪽**을 계산해야 한다.
       * 렌더마다(previewPage 기준으로) 계산하면 느려지므로, 실제로 내보낼
       * 때(여기)만 전체를 계산한다.
       */
      let datasetOverrides: Map<number, SlotContent> | undefined;
      let datasetBackOverrides: Map<number, SlotContent> | undefined;
      if (printMode === 'dataset' && dataset) {
        datasetOverrides = new Map();
        datasetBackOverrides = new Map();
        for (let page = 0; page < totalPages; page++) {
          datasetOverrides.set(page, {
            dotGrid: active.dotGrid,
            objects: resolveObjectsForPage(active.objects.present, dataset, page),
            safeZoneWidth: active.insert.punch.safeZoneWidth,
          });
          if (active.back) {
            datasetBackOverrides.set(page, {
              dotGrid: active.dotGrid,
              objects: resolveObjectsForPage(active.back.objects.present, dataset, page),
              safeZoneWidth: active.insert.punch.safeZoneWidth,
            });
          }
        }
      }

      const bytes = await buildPdf({
        paperWidth: width,
        paperHeight: height,
        layout,
        dotGrid: active.dotGrid,
        objects: active.objects.present,
        // 낱장 조합(칸마다 다른 양식)·반복 인쇄(여러 장)·세트형(쪽마다 다른
        // 내용)은 섞이지 않는다.
        slotOverrides: printMode === 'combo' && pdfOverrides.size > 0 ? pdfOverrides : undefined,
        totalSlots: printMode === 'repeat' ? totalSlots : undefined,
        // 낱장 조합에서만 쓴다 — 반복 인쇄·세트형은 각자의 값이 우선이다(pdf/export.ts).
        sheets: printMode === 'combo' ? s.comboSheets : undefined,
        datasetOverrides,
        datasetBackOverrides,
        datasetPages: printMode === 'dataset' ? totalPages : undefined,
        calendarYear: dataset?.kind === 'calendar' ? dataset.year : undefined,
        // 겹치기 배치도 세트형에서만 의미가 있다 — 반복 인쇄·낱장 조합은 모든
        // 칸의 내용이 같아 순서가 결과에 영향을 주지 않는다.
        cutStack: printMode === 'dataset' ? s.cutStack : undefined,
        cutStackGroup: printMode === 'dataset' ? s.cutStackGroup || undefined : undefined,
        fontBytes,
        boldFontBytes,
        userFonts,
        userImages,
        safeZoneWidth: active.insert.punch.safeZoneWidth,
        cropMark: s.cropMark,
        showRuler: s.showRuler,
        duplex: s.duplex,
        defaultBack,
        backSlotOverrides: printMode === 'combo' && pdfBackOverrides.size > 0 ? pdfBackOverrides : undefined,
      });
      downloadPdf(bytes, `속지_${active.insert.presetId}_${s.paper.presetId}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>System Diary Designer</h1>

        {/* 고르고 → 그리고 → 인쇄한다. 탭 순서가 곧 작업 순서다. */}
        <nav className="tabs">
          <button className={tab === 'gallery' ? 'tab on' : 'tab'} onClick={() => setTab('gallery')}>
            양식 관리
          </button>
          {/* 고칠 양식이 없으면 갈 수 없는 곳이다. */}
          <button
            className={tab === 'edit' ? 'tab on' : 'tab'}
            onClick={() => setTab('edit')}
            disabled={!active}
          >
            양식 만들기
          </button>
          <button
            className={tab === 'print' ? 'tab on' : 'tab'}
            onClick={() => setTab('print')}
            disabled={!active}
          >
            인쇄하기
          </button>
        </nav>

        <span className="stage">
          {/* 지금 무엇을 고치고 있는지. 양식이 여럿이 되면서 필요해졌다. */}
          {active ? `${active.name} · ${active.insert.width} × ${active.insert.height}mm` : ''}
        </span>
        <ProjectFile />
        <button onClick={exportPdf} disabled={busy || !active || layout.count === 0}>
          {busy ? '만드는 중…' : 'PDF 내보내기'}
        </button>
      </header>

      <main>
        {/* 갤러리는 양식 하나를 고치는 화면이 아니라서 설정 패널이 필요 없다. */}
        {tab !== 'gallery' && active && <SettingsPanel />}

        {tab === 'gallery' || !active ? (
          <GalleryTab onEdit={() => setTab('edit')} />
        ) : tab === 'edit' ? (
          <EditorTab />
        ) : (
          <div className="print-tab">
            {/* 양식 만들기 화면의 상단 도구줄과 같은 자리 — 같은 위치에 있어야 찾기 쉽다. */}
            <div className="print-bar">
              <label className="preview-toggle">
                <input
                  type="checkbox"
                  checked={printPreview}
                  onChange={(e) => setPrintPreview(e.target.checked)}
                />
                실제 인쇄 모습만 보기
                <span className="preview-toggle-hint">
                  도트·타공 화면 설정과 무관하게 인쇄되는 것만 보여줍니다
                </span>
              </label>

              <label className="preview-toggle">
                <input
                  type="checkbox"
                  checked={s.duplex}
                  onChange={(e) => s.patch({ duplex: e.target.checked })}
                />
                양면 인쇄
              </label>

              {/* 양면을 껐으면 뒷면 자체가 없으니 토글을 보여줄 이유가 없다. */}
              {s.duplex && (
                <div className="tabs">
                  <button
                    className={previewSide === 'front' ? 'tab on' : 'tab'}
                    onClick={() => setPreviewSide('front')}
                  >
                    앞면
                  </button>
                  <button
                    className={previewSide === 'back' ? 'tab on' : 'tab'}
                    onClick={() => setPreviewSide('back')}
                  >
                    뒷면
                  </button>
                </div>
              )}
            </div>

            {printMode === 'repeat' ? (
              <RepeatPrint
                layout={layout}
                totalCount={totalSlots}
                unit="칸"
                sheets={sheetsNeeded(totalSlots, capacityPerSheet(layout.count, s.duplex))}
                hint={s.duplex && <> (양면이라 앞뒤 {layout.count * 2}칸)</>}
                page={previewPage}
                onPageChange={setPreviewPage}
              />
            ) : printMode === 'dataset' ? (
              <RepeatPrint
                layout={layout}
                totalCount={totalPages}
                unit="쪽"
                sheets={sheetsNeeded(totalPages, layout.count)}
                hint={s.cutStack && <> · 겹치기</>}
                page={previewPage}
                onPageChange={setPreviewPage}
              />
            ) : (
              <SlotAssign layout={layout} />
            )}

            <div className="stage-area">
              {layout.count === 0 ? (
                <div className="empty">속지가 용지보다 큽니다. 용지를 키우거나 속지를 줄이세요.</div>
              ) : (
                <div className="preview-wrap" style={{ aspectRatio: `${width} / ${height}` }}>
                  {previewSide === 'front' ? (
                    <PaperPreview
                      paper={{ ...s.paper, width, height }}
                      insert={active.insert}
                      dotGrid={active.dotGrid}
                      objects={active.objects.present}
                      slotOverrides={previewOverrides.size > 0 ? previewOverrides : undefined}
                      layout={layout}
                      cropMark={s.cropMark}
                      showRuler={s.showRuler}
                      unprintable={s.unprintable}
                      mode={printPreview ? 'print' : 'edit'}
                      calendarYear={dataset?.kind === 'calendar' ? dataset.year : undefined}
                    />
                  ) : (
                    // 뒷면 — 칸 위치는 core/layout의 mirrorLayout으로 뒤집는다(회전
                    // 배치가 아니면 좌우, 회전 배치면 상하). 칸 안의 내용(도트·글자)은
                    // 뒤집지 않지만, 안전영역·타공 안내는 항상 mirror로 표시한다
                    // (설계문서 8장) — mirrorLayout이 이미 회전 여부를 반영했으므로
                    // 이쪽은 회전과 무관하게 항상 켠다.
                    <PaperPreview
                      paper={{ ...s.paper, width, height }}
                      insert={active.insert}
                      // 격자는 앞뒤 공유값이라, 뒷면이 없어도(fillEmptyBack일 때) 그대로 쓴다.
                      dotGrid={active.back || s.fillEmptyBack ? active.dotGrid : BLANK_PREVIEW_GRID}
                      objects={active.back?.objects.present ?? []}
                      slotOverrides={previewBackOverrides.size > 0 ? previewBackOverrides : undefined}
                      layout={mirrorLayout(layout, width, height)}
                      cropMark={s.cropMark}
                      showRuler={s.showRuler}
                      unprintable={s.unprintable}
                      mode={printPreview ? 'print' : 'edit'}
                      mirror
                      calendarYear={dataset?.kind === 'calendar' ? dataset.year : undefined}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer>
        <span>
          용지 {width} × {height}mm
        </span>
        {active && (
          <>
            <span>
              속지 {active.insert.width} × {active.insert.height}mm
            </span>
            <span>
              한 장에 <b>{layout.count}개</b> ({layout.cols} × {layout.rows})
              {layout.rotated && ' · 90도 회전'}
            </span>
          </>
        )}

        {/*
          인쇄 안내. 인쇄하기 탭에서만 띄운다 — 양식 만들기 중에는 상관없는 이야기다.
          맨 아래 줄에 두는 이유는 미리보기를 가리지 않기 위해서다.
        */}
        {tab === 'print' && (
          <span className="print-hint">
            인쇄 대화상자에서 <b>실제 크기 / 100%</b>를 고르세요 — “페이지에 맞춤”은 96~97%로
            축소됩니다
          </span>
        )}
      </footer>
    </div>
  );
}
