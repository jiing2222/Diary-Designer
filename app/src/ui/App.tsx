import { useState } from 'react';
import { paperSize, selectLayout, useStore } from '../store';
import { SettingsPanel } from './SettingsPanel';
import { PaperPreview } from './PaperPreview';
import { EditorTab } from './EditorTab';
import { buildPdf, downloadPdf } from '../pdf/export';
import { loadBodyFont } from '../fonts/load';

type Tab = 'edit' | 'print';

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

  async function exportPdf() {
    setBusy(true);
    try {
      // 글자가 있을 때만 글꼴을 받는다. 2.7MB짜리라 괜히 받을 이유가 없다.
      const hasText = s.objects.present.some((o) => o.type === 'text');
      const fontBytes = hasText ? await loadBodyFont() : undefined;

      const bytes = await buildPdf({
        paperWidth: width,
        paperHeight: height,
        layout,
        dotGrid: s.dotGrid,
        objects: s.objects.present,
        fontBytes,
        safeZoneWidth: s.insert.punch.safeZoneWidth,
        cropMark: s.cropMark,
        showRuler: s.showRuler,
      });
      downloadPdf(bytes, `속지_${s.insert.presetId}_${s.paper.presetId}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>System Diary Designer</h1>

        <nav className="tabs">
          <button className={tab === 'edit' ? 'tab on' : 'tab'} onClick={() => setTab('edit')}>
            양식 만들기
          </button>
          <button className={tab === 'print' ? 'tab on' : 'tab'} onClick={() => setTab('print')}>
            인쇄하기
          </button>
        </nav>

        <span className="stage">4단계 · 그리기 도구</span>
        <button onClick={exportPdf} disabled={busy || layout.count === 0}>
          {busy ? '만드는 중…' : 'PDF 내보내기'}
        </button>
      </header>

      <main>
        <SettingsPanel />

        {tab === 'edit' ? (
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
                    insert={s.insert}
                    dotGrid={s.dotGrid}
                    objects={s.objects.present}
                    layout={layout}
                    cropMark={s.cropMark}
                    showRuler={s.showRuler}
                    unprintable={s.unprintable}
                    mode={printPreview ? 'print' : 'edit'}
                  />

                  <div className="notice notice-corner">
                    <b>“실제 크기 / 100%”로 인쇄하세요.</b>
                    <span>“페이지에 맞춤”은 96~97%로 축소됩니다.</span>
                  </div>
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
          속지 {s.insert.width} × {s.insert.height}mm
        </span>
        <span>
          한 장에 <b>{layout.count}개</b> ({layout.cols} × {layout.rows})
          {layout.rotated && ' · 90도 회전'}
        </span>
      </footer>
    </div>
  );
}
