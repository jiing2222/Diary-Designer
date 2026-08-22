import { NOTEBOOK_TRIM_GUIDE } from '../core/notebook';
import type { Mm } from '../core/units';

/**
 * 노트 반쪽 하나의 재단여백 안내 — 접히는 안쪽(책등)이 아니라 바깥쪽
 * 가장자리에만 뜬다.
 *
 * **화면에만 보이고 인쇄되지 않는다.** 접었을 때 이만큼 여유가 있으면
 * 좋다는 참고용 표시일 뿐, 실제 치수·재단선 계산에는 전혀 관여하지
 * 않는다(core/notebook.ts) — PunchGuide와 같은 자리의 화면 전용
 * 안내선이다. 위·아래는 접는 축과 무관해 표시하지 않는다.
 *
 * 반쪽마다 독립된 작은 캔버스로 그리므로(core/notebook의 NotebookHalf —
 * 왼쪽 쪽은 왼쪽 좌표만, 오른쪽 쪽은 오른쪽 좌표만 갖는다), 가운데
 * 접힘선은 이 컴포넌트가 아니라 두 반쪽을 나란히 놓는 바깥 레이아웃이
 * CSS로 그린다(NotebookEditorTab).
 */
export function NotebookMarginGuide({ width, height, edge }: { width: Mm; height: Mm; edge: 'left' | 'right' }) {
  const w = NOTEBOOK_TRIM_GUIDE;
  if (w * 2 >= width) return null;
  const x = edge === 'left' ? 0 : width - w;
  const edgeX = edge === 'left' ? w : width - w;

  return (
    <g className="trim-guide">
      <rect x={x} y={0} width={w} height={height} />
      <line x1={edgeX} y1={0} x2={edgeX} y2={height} className="trim-guide-edge" />
    </g>
  );
}
