import { NOTEBOOK_TRIM_GUIDE } from '../core/notebook';
import type { Mm } from '../core/units';

/**
 * 노트 양식의 접힘선·좌우 재단여백 안내.
 *
 * **화면에만 보이고 인쇄되지 않는다.** 둘 다 참고용 표시일 뿐 실제 치수·
 * 재단선 계산에는 전혀 관여하지 않는다(core/notebook.ts) — PunchGuide와
 * 같은 자리의 화면 전용 안내선이다. 위·아래는 접는 축과 무관해 표시하지 않는다.
 *
 * **가운데 접힘선이 좌·우를 가른다.** 이 선을 기준으로 왼쪽·오른쪽에 각각
 * 무엇을 그릴지 정해진다(표지는 오른쪽이 앞면·왼쪽이 뒷표지, 내지는 왼쪽·
 * 오른쪽이 서로 다른 쪽수다) — 그리는 동안 어디가 중심인지 늘 보여야 한다.
 */
export function NotebookMarginGuide({ width, height }: { width: Mm; height: Mm }) {
  const w = NOTEBOOK_TRIM_GUIDE;

  return (
    <g>
      <line x1={width / 2} y1={0} x2={width / 2} y2={height} className="fold-line" />
      {w * 2 < width && (
        <g className="trim-guide">
          <rect x={0} y={0} width={w} height={height} />
          <line x1={w} y1={0} x2={w} y2={height} className="trim-guide-edge" />
          <rect x={width - w} y={0} width={w} height={height} />
          <line x1={width - w} y1={0} x2={width - w} y2={height} className="trim-guide-edge" />
        </g>
      )}
    </g>
  );
}
