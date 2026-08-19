import { NOTEBOOK_TRIM_GUIDE } from '../core/notebook';
import type { Mm } from '../core/units';

/**
 * 노트 양식의 좌·우 재단여백 안내.
 *
 * **화면에만 보이고 인쇄되지 않는다.** 접었을 때 양 끝(좌·우)에 대략 이만큼
 * 여유가 있으면 좋다는 참고용 표시일 뿐, 실제 치수·재단선 계산에는 전혀
 * 관여하지 않는다(core/notebook.ts) — PunchGuide와 같은 자리의 화면 전용
 * 안내선이다. 위·아래는 접는 축과 무관해 표시하지 않는다.
 */
export function NotebookMarginGuide({ width, height }: { width: Mm; height: Mm }) {
  const w = NOTEBOOK_TRIM_GUIDE;
  if (w * 2 >= width) return null;

  return (
    <g className="trim-guide">
      <rect x={0} y={0} width={w} height={height} />
      <line x1={w} y1={0} x2={w} y2={height} className="trim-guide-edge" />
      <rect x={width - w} y={0} width={w} height={height} />
      <line x1={width - w} y1={0} x2={width - w} y2={height} className="trim-guide-edge" />
    </g>
  );
}
