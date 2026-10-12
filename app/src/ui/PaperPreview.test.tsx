import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { diaryFromPreset } from '../core/diary';
import { computeLayout } from '../core/layout';
import { holeMarks } from '../core/punch';
import { DEFAULT_DOT_GRID } from '../core/grid';
import { PUNCH_MARK_COLOR, PUNCH_MARK_WIDTH } from '../core/style';
import { PaperPreview } from './PaperPreview';

const insert = diaryFromPreset('d1', 'M6', '검증', '#000000');
const grid = { ...DEFAULT_DOT_GRID, print: false, showOnScreen: false };
const paper = { presetId: 'A4', width: 210, height: 297, landscape: false, printMargin: 5 };
const layout = computeLayout({ paperWidth: 210, paperHeight: 297, insertWidth: insert.width, insertHeight: insert.height, gap: 0, printMargin: 0, allowRotate: false, align: 'center' });

function preview(printPunch: boolean, mirror = false) {
  return renderToStaticMarkup(
    <PaperPreview
      paper={paper} insert={insert} dotGrid={grid} objects={[]} layout={layout}
      cropMark="none" showRuler={false} unprintable={{ show: false, width: 0 }} mode="print" mirror={mirror}
      slotOverrides={new Map(layout.slots.map((_, i) => [i, {
        insert, dotGrid: grid, objects: [],
        punch: printPunch && i === 0 ? insert.punch : undefined,
      }]))}
    />,
  );
}

describe('인쇄 미리보기의 타공 표시 — PDF와 같은 자리·색·굵기', () => {
  it('인쇄할 타공 표시만 그리며 빈 칸에는 그리지 않는다', () => {
    const html = preview(true);
    expect(html).toContain('class="print-punch-marks"');
    expect(html).toContain(`stroke="${PUNCH_MARK_COLOR}"`);
    expect(html).toContain(`stroke-width="${PUNCH_MARK_WIDTH}"`);
    expect(html.match(/<circle /g)).toHaveLength(holeMarks(insert.width, insert.height, insert.punch).length);
    expect(preview(false)).not.toContain('class="print-punch-marks"');
    expect(html).not.toContain('class="print-margin"');
  });

  it('뒷면 구멍은 core가 정한 오른쪽 위치로 간다', () => {
    const hole = holeMarks(insert.width, insert.height, insert.punch, true)[0];
    expect(preview(true, true)).toContain(`cx="${hole.cx}" cy="${hole.cy}" r="${hole.r}"`);
  });
});
