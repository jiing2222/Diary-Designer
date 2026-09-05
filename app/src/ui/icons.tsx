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

/** 클로드 디자인 handoff(design_handoff_main_and_inserts)의 아이콘과 같은 틀 — 24 기준, 선 굵기 1.7. */
const box24 = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
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

/** 글자 — 대문자 T. 클로드 디자인 handoff와 같은 모양(box24 참고). */
export function TextIcon() {
  return (
    <svg {...box24}>
      <line x1={5} y1={6} x2={19} y2={6} />
      <line x1={12} y1={6} x2={12} y2={19} />
    </svg>
  );
}

/** 고르기 — 화살표 커서. 클로드 디자인 handoff와 같은 모양. */
export function CursorIcon() {
  return (
    <svg {...box24}>
      <path d="M5 4l14 6-6 1.8L11 18z" />
    </svg>
  );
}

/** 선 긋기 — 두 점을 잇는 선. 클로드 디자인 handoff와 같은 모양. */
export function LineIcon() {
  return (
    <svg {...box24}>
      <line x1={6} y1={18} x2={18} y2={6} />
      <circle cx={6} cy={18} r={1.3} fill="currentColor" stroke="none" />
      <circle cx={18} cy={6} r={1.3} fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 표 — 칸이 나뉜 사각형. 클로드 디자인 handoff와 같은 모양. */
export function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x={4} y={4} width={16} height={16} />
      <line x1={4} y1={10.6} x2={20} y2={10.6} />
      <line x1={4} y1={17.2} x2={20} y2={17.2} />
      <line x1={10.6} y1={4} x2={10.6} y2={20} />
    </svg>
  );
}

/** 자동 필드 — 시계 모양. 클로드 디자인 handoff의 AutoField 아이콘과 같다. */
export function FieldIcon() {
  return (
    <svg {...box24}>
      <circle cx={12} cy={12} r={8} />
      <line x1={12} y1={12} x2={12} y2={7.5} />
      <line x1={12} y1={12} x2={15.2} y2={14} />
    </svg>
  );
}

/** 이미지 — 액자 안에 해와 산. 클로드 디자인 handoff와 같은 모양. */
export function ImageIcon() {
  return (
    <svg {...box24}>
      <rect x={4} y={5} width={16} height={14} rx={1.5} />
      <circle cx={9} cy={10} r={1.4} fill="currentColor" stroke="none" />
      <path d="M5 17l4.5-5 3 3 3-4 4.5 6" />
    </svg>
  );
}

/** 달력 — 위에 고리 두 개, 머리글 줄이 나뉜 사각형. 클로드 디자인 handoff와 같은 모양. */
export function CalendarIcon() {
  return (
    <svg {...box24}>
      <rect x={4} y={5} width={16} height={15} rx={1.5} />
      <line x1={4} y1={10} x2={20} y2={10} />
      <line x1={8} y1={3} x2={8} y2={7} />
      <line x1={16} y1={3} x2={16} y2={7} />
    </svg>
  );
}

/** 체크박스 — 네모 안에 체크 표시. 클로드 디자인 handoff와 같은 모양. */
export function CheckboxIcon() {
  return (
    <svg {...box24}>
      <rect x={5} y={5} width={14} height={14} rx={1.5} />
      <path d="M8.5 12.5l2.3 2.3 4.7-5.3" />
    </svg>
  );
}

/** 보임 — 뜬 눈. 포토샵 등에서 화면 표시를 켜고 끄는 눈알 표시와 같은 뜻이다. */
export function EyeIcon() {
  return (
    <svg {...box}>
      <path d="M2.5 10 C5 5.5, 15 5.5, 17.5 10 C15 14.5, 5 14.5, 2.5 10 Z" />
      <circle cx={10} cy={10} r={2.2} />
    </svg>
  );
}

/** 숨김 — 감은 눈(빗금 친 눈). EyeIcon과 짝이다. */
export function EyeOffIcon() {
  return (
    <svg {...box}>
      <path d="M2.5 10 C5 5.5, 15 5.5, 17.5 10 C15 14.5, 5 14.5, 2.5 10 Z" />
      <circle cx={10} cy={10} r={2.2} />
      <line x1={3.5} y1={4} x2={16.5} y2={16} />
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

/** 메뉴(햄버거) — 가로줄 세 개. 숨겨둔 탭 목록을 연다. */
export function MenuIcon() {
  return (
    <svg {...box}>
      <line x1={3} y1={6} x2={17} y2={6} />
      <line x1={3} y1={10} x2={17} y2={10} />
      <line x1={3} y1={14} x2={17} y2={14} />
    </svg>
  );
}

/** 로고 — 반지 두 개가 겹친 모양. 강조색·잉크색 고리 하나씩, 색은 고정이라 currentColor를 안 쓴다. */
export function RingsLogo() {
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} fill="none">
      <circle cx={7.3} cy={10} r={4.9} style={{ stroke: 'var(--accent)' }} strokeWidth={1.6} />
      <circle cx={12.7} cy={10} r={4.9} style={{ stroke: 'var(--ink)' }} strokeWidth={1.6} />
    </svg>
  );
}
