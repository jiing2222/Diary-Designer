/**
 * 도구 아이콘.
 *
 * 20 × 20 안에 선으로만 그린다. 채우기를 쓰지 않아 켜짐/꺼짐 상태를
 * 색 하나로 바꿀 수 있다.
 */

const box = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** 용지 — 세로로 선 종이 한 장에 안쪽 여백선 */
export function PaperIcon() {
  return (
    <svg {...box}>
      <rect x={4.5} y={2.5} width={11} height={15} rx={1} />
      <rect x={7} y={5} width={6} height={10} strokeDasharray="1.6 1.4" opacity={0.55} />
    </svg>
  );
}

/** 속지 — 왼쪽에 구멍이 뚫린 작은 종이 */
export function InsertIcon() {
  return (
    <svg {...box}>
      <rect x={5.5} y={3} width={10} height={14} rx={1} />
      <circle cx={8} cy={7} r={0.9} />
      <circle cx={8} cy={10} r={0.9} />
      <circle cx={8} cy={13} r={0.9} />
    </svg>
  );
}

/** 도트 격자 — 3 × 3 점 */
export function GridIcon() {
  return (
    <svg {...box} fill="currentColor" stroke="none">
      {[5, 10, 15].map((y) =>
        [5, 10, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.25} />),
      )}
    </svg>
  );
}

/** 타공 — 구멍 세 개와 그 오른쪽의 안전영역 경계 */
export function PunchIcon() {
  return (
    <svg {...box}>
      <circle cx={6.5} cy={5} r={1.9} />
      <circle cx={6.5} cy={10} r={1.9} />
      <circle cx={6.5} cy={15} r={1.9} />
      <line x1={12.5} y1={2.5} x2={12.5} y2={17.5} strokeDasharray="2 1.6" opacity={0.65} />
    </svg>
  );
}

/** 배치 — 용지에 속지 네 장, 모서리에 재단 표시 */
export function LayoutIcon() {
  return (
    <svg {...box}>
      <rect x={3} y={3.5} width={6} height={6} />
      <rect x={11} y={3.5} width={6} height={6} />
      <rect x={3} y={11} width={6} height={6} />
      <rect x={11} y={11} width={6} height={6} />
    </svg>
  );
}

/** 글자 — 대문자 T */
export function TextIcon() {
  return (
    <svg {...box} strokeWidth={1.6}>
      <line x1={4.5} y1={4.5} x2={15.5} y2={4.5} />
      <line x1={10} y1={4.5} x2={10} y2={15.5} />
    </svg>
  );
}

/** 고르기 — 화살표 커서 */
export function CursorIcon() {
  return (
    <svg {...box}>
      <path d="M5.5 3.5 L14 11 L10 11.4 L12.2 15.6 L10.4 16.5 L8.3 12.3 L5.5 14.6 Z" />
    </svg>
  );
}

/** 선 긋기 — 두 점을 잇는 선 */
export function LineIcon() {
  return (
    <svg {...box}>
      <line x1={5} y1={15} x2={15} y2={5} />
      <circle cx={5} cy={15} r={1.8} fill="currentColor" stroke="none" />
      <circle cx={15} cy={5} r={1.8} fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 표 — 칸이 나뉜 사각형. 도트 격자(점 3×3)와 헷갈리지 않게 선으로 그린다. */
export function TableIcon() {
  return (
    <svg {...box}>
      <rect x={3.5} y={3.5} width={13} height={13} />
      <line x1={3.5} y1={9.5} x2={16.5} y2={9.5} />
      <line x1={9.5} y1={3.5} x2={9.5} y2={16.5} />
    </svg>
  );
}

/** 자동 필드 — 편집 화면의 자리표시(⟨+0⟩)와 같은 꺾쇠·더하기 모양. */
export function FieldIcon() {
  return (
    <svg {...box} strokeWidth={1.5}>
      <path d="M7.5 5 L3.5 10 L7.5 15" />
      <path d="M12.5 5 L16.5 10 L12.5 15" />
      <line x1={10} y1={8.3} x2={10} y2={11.7} />
      <line x1={8.3} y1={10} x2={11.7} y2={10} />
    </svg>
  );
}

/** 이미지 — 액자 안에 해와 산. */
export function ImageIcon() {
  return (
    <svg {...box}>
      <rect x={3.5} y={3.5} width={13} height={13} rx={1} />
      <circle cx={7.5} cy={7.5} r={1.3} fill="currentColor" stroke="none" />
      <path d="M3.5 13.5 L8 9 L11.5 12.5 L13.5 10.5 L16.5 13.5" />
    </svg>
  );
}

/** 달력 — 위에 고리 두 개, 머리글 줄이 나뉜 사각형. */
export function CalendarIcon() {
  return (
    <svg {...box}>
      <rect x={3.5} y={4.5} width={13} height={12} rx={1} />
      <line x1={3.5} y1={8} x2={16.5} y2={8} />
      <line x1={7} y1={2.5} x2={7} y2={5.5} />
      <line x1={13} y1={2.5} x2={13} y2={5.5} />
    </svg>
  );
}

/** 도형 — 각진 사각형과 원이 겹친 모양. 둥글기 0~4단계(사각형→원)를 그대로 보여준다. */
export function ShapeIcon() {
  return (
    <svg {...box}>
      <rect x={3.5} y={3.5} width={10} height={10} />
      <circle cx={13} cy={13} r={4.5} />
    </svg>
  );
}

/** 체크박스 — 네모 안에 체크 표시. */
export function CheckboxIcon() {
  return (
    <svg {...box}>
      <rect x={3.5} y={3.5} width={13} height={13} rx={1.5} />
      <path d="M6.5 10.3 L9 13 L14 7.5" />
    </svg>
  );
}

/** 반복 — 겹쳐 쌓인 종이 두 장. 여러 장 찍는다는 뜻이다. 다른 아이콘처럼 선으로만 그린다. */
export function RepeatIcon() {
  return (
    <svg {...box}>
      <rect x={6.5} y={2.5} width={10} height={13} rx={1} opacity={0.55} />
      <rect x={3.5} y={5.5} width={10} height={13} rx={1} />
    </svg>
  );
}
