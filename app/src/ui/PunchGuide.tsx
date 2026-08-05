import { holeCenterX, holeCentersY, type PunchSetting } from '../core/punch';
import type { Mm } from '../core/units';

/**
 * 타공 위치 안내.
 *
 * **화면에만 보이고 인쇄되지 않는다.** 글자가 구멍에 잘리는 걸 막는 안내선이다.
 * 편집 화면과 인쇄 미리보기가 둘 다 이것을 쓴다.
 *
 * 좌표는 속지 왼쪽 위가 원점인 mm다. 칸으로 옮기는 일은 core/place가 한다.
 */
export function PunchGuide({ height, punch }: { height: Mm; punch: PunchSetting }) {
  if (!punch.show) return null;

  const cx = holeCenterX(punch);

  return (
    <g>
      <rect x={0} y={0} width={punch.safeZoneWidth} height={height} className="safe-zone" />
      <line
        x1={punch.safeZoneWidth}
        y1={0}
        x2={punch.safeZoneWidth}
        y2={height}
        className="safe-zone-edge"
      />
      {holeCentersY(height, punch).map((cy, i) => (
        <circle key={i} cx={cx} cy={cy} r={punch.markSize / 2} className="hole" />
      ))}
    </g>
  );
}
