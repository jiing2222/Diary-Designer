import { holeCenterX, holeCentersY, type PunchSetting } from '../core/punch';
import type { Mm } from '../core/units';

/**
 * 타공 위치 안내.
 *
 * **화면에만 보이고 인쇄되지 않는다.** 글자가 구멍에 잘리는 걸 막는 안내선이다.
 * 편집 화면과 인쇄 미리보기가 둘 다 이것을 쓴다.
 *
 * 좌표는 속지 왼쪽 위가 원점인 mm다. 칸으로 옮기는 일은 core/place가 한다.
 *
 * `mirror`가 켜지면(뒷면) 안전영역과 구멍이 오른쪽에 표시된다 — core/grid의
 * `gridArea`와 같은 방향으로 뒤집는다.
 */
export function PunchGuide({
  width,
  height,
  punch,
  mirror = false,
}: {
  width: Mm;
  height: Mm;
  punch: PunchSetting;
  mirror?: boolean;
}) {
  if (!punch.show) return null;

  const cx = holeCenterX(punch, width, mirror);
  const zoneX = mirror ? width - punch.safeZoneWidth : 0;
  const edgeX = mirror ? width - punch.safeZoneWidth : punch.safeZoneWidth;

  return (
    <g>
      <rect x={zoneX} y={0} width={punch.safeZoneWidth} height={height} className="safe-zone" />
      <line x1={edgeX} y1={0} x2={edgeX} y2={height} className="safe-zone-edge" />
      {holeCentersY(height, punch).map((cy, i) => (
        <circle key={i} cx={cx} cy={cy} r={punch.markSize / 2} className="hole" />
      ))}
    </g>
  );
}
