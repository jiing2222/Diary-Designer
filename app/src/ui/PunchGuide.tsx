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
 *
 * **구멍과 같은 세로줄에 정렬선도 함께 보여준다.** 로고·텍스트를 그 줄에
 * 맞춰 놓으라는 안내다 — 정확한 자리를 자동으로 만들어주는 대신(칸이
 * 작아 정밀하게 집기 어려웠다), 이 줄 근처로 끌면 달라붙기만 한다
 * (`ui/EditorTab.tsx`의 `snapToLogoLine`). 늘 옅게 보이지만 눈에 띄지
 * 않을 수 있어서, 편집 화면의 "로고 칸" 버튼을 누르면 `emphasizeLine`이
 * 잠깐 켜져 이 줄만 도드라져 보인다 — 도구는 바뀌지 않는다.
 */
export function PunchGuide({
  width,
  height,
  punch,
  mirror = false,
  emphasizeLine = false,
}: {
  width: Mm;
  height: Mm;
  punch: PunchSetting;
  mirror?: boolean;
  emphasizeLine?: boolean;
}) {
  if (!punch.show) return null;

  const cx = holeCenterX(punch, width, mirror);
  const zoneX = mirror ? width - punch.safeZoneWidth : 0;
  const edgeX = mirror ? width - punch.safeZoneWidth : punch.safeZoneWidth;

  return (
    <g>
      <rect x={zoneX} y={0} width={punch.safeZoneWidth} height={height} className="safe-zone" />
      <line x1={edgeX} y1={0} x2={edgeX} y2={height} className="safe-zone-edge" />
      <line
        x1={cx}
        y1={0}
        x2={cx}
        y2={height}
        className={emphasizeLine ? 'logo-line logo-line-emphasis' : 'logo-line'}
      />
      {holeCentersY(height, punch).map((cy, i) => (
        <circle key={i} cx={cx} cy={cy} r={punch.markSize / 2} className="hole" />
      ))}
    </g>
  );
}
