import { useState } from 'react';
import { activeTemplate, paperSize, selectLayout, useStore } from '../store';
import { SettingsPanel } from './SettingsPanel';
import { PaperPreview } from './PaperPreview';
import { EditorTab } from './EditorTab';
import { GalleryTab } from './GalleryTab';
import { buildPdf, downloadPdf } from '../pdf/export';
import { loadBodyFont, loadBoldFont } from '../fonts/load';
import { fontBytes as fontBytes_ } from '../fonts/registry';

type Tab = 'gallery' | 'edit' | 'print';

export function App() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('edit');
  /**
   * 인쇄하기 탭 전용. 켜면 지금 켜둔 도트·타공 화면 설정과 무관하게 **실제로
   * 인쇄될 모습만** 보여준다. 원래 설정은 그대로 두고 보는 방식만 잠깐 바꾸는
   * 것이라 store에 넣지 않는다 — 탭을 나가면 잊혀도 되는 값이다.
   */
  const [printPreview, setPrintPreview] = useState(true);

  const { width, height } = paperSize(s.paper);
  const layout = selectLayout(s);
  // 속지·격자·그린 것은 이제 양식 안에 있다. 인쇄는 지금 보고 있는 양식을
  // 모든 칸에 넣는다 — 칸마다 다른 양식을 넣는 것은 5c의 일이다.
  const active = activeTemplate(s);

  async function exportPdf() {
    setBusy(true);
    try {
      // 글자가 있을 때만 글꼴을 받는다. 하나에 2.7MB짜리라 괜히 받을 이유가 없다.
      // 굵기마다 파일이 따로라 Bold도 굵은 글자가 실제로 있을 때만 받는다.
      const texts = active.objects.present.filter((o) => o.type === 'text');
      const fontBytes = texts.length > 0 ? await loadBodyFont() : undefined;
      const boldFontBytes = texts.some((t) => t.bold) ? await loadBoldFont() : undefined;

      // 등록 글꼴은 실제로 쓰이는 것만 모은다. 등록소에 없는 id(새로고침 뒤에
      // 남은 글자)는 그냥 빠지고, PDF에서도 기본 글꼴로 그려진다.
      const userFonts = new Map<string, ArrayBuffer>();
      for (const t of texts) {
        const b = t.font ? fontBytes_(t.font) : undefined;
        if (t.font && b) userFonts.set(t.font, b);
      }

      const bytes = await buildPdf({
        paperWidth: width,
        paperHeight: height,
        layout,
        dotGrid: active.dotGrid,
        objects: active.objects.present,
        fontBytes,
        boldFontBytes,
        userFonts,
        safeZoneWidth: active.insert.punch.safeZoneWidth,
        cropMark: s.cropMark,
        showRuler: s.showRuler,
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
          <button className={tab === 'edit' ? 'tab on' : 'tab'} onClick={() => setTab('edit')}>
            양식 만들기
          </button>
          <button className={tab === 'print' ? 'tab on' : 'tab'} onClick={() => setTab('print')}>
            인쇄하기
          </button>
        </nav>

        <span className="stage">
          {/* 지금 무엇을 고치고 있는지. 양식이 여럿이 되면서 필요해졌다. */}
          {active.name} · {active.insert.width} × {active.insert.height}mm
        </span>
        <button onClick={exportPdf} disabled={busy || layout.count === 0}>
          {busy ? '만드는 중…' : 'PDF 내보내기'}
        </button>
      </header>

      <main>
        {/* 갤러리는 양식 하나를 고치는 화면이 아니라서 설정 패널이 필요 없다. */}
        {tab !== 'gallery' && <SettingsPanel />}

        {tab === 'gallery' ? (
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
            </div>

            <div className="stage-area">
              {layout.count === 0 ? (
                <div className="empty">속지가 용지보다 큽니다. 용지를 키우거나 속지를 줄이세요.</div>
              ) : (
                <div className="preview-wrap" style={{ aspectRatio: `${width} / ${height}` }}>
                  <PaperPreview
                    paper={{ ...s.paper, width, height }}
                    insert={active.insert}
                    dotGrid={active.dotGrid}
                    objects={active.objects.present}
                    layout={layout}
                    cropMark={s.cropMark}
                    showRuler={s.showRuler}
                    unprintable={s.unprintable}
                    mode={printPreview ? 'print' : 'edit'}
                  />
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
        <span>
          속지 {active.insert.width} × {active.insert.height}mm
        </span>
        <span>
          한 장에 <b>{layout.count}개</b> ({layout.cols} × {layout.rows})
          {layout.rotated && ' · 90도 회전'}
        </span>

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
