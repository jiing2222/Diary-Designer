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

/** 용지 — 모서리를 접은 종이 한 장. 클로드 디자인의 Paper 아이콘과 같은 모양. */
export function PaperIcon() {
  return (
    <svg {...box24}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
    </svg>
  );
}

/**
 * 속지 — 도트 격자와 그 아래 타공 구멍 두 개.
 *
 * 이 탭 하나가 도트 격자와 타공 안내를 함께 담으므로(디자인의 Insert 탭)
 * 아이콘도 그 둘을 한 그림에 담는다. 클로드 디자인과 같은 모양.
 */
export function InsertIcon() {
  return (
    <svg {...box24}>
      {[7, 12].map((y) =>
        [7, 12, 17].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill="currentColor" stroke="none" />
        )),
      )}
      <circle cx={9} cy={18} r={1.6} />
      <circle cx={15} cy={18} r={1.6} />
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

/** 도트 판(9-4) — 3×3 점. */
export function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      {[6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => <circle key={`${x},${y}`} cx={x} cy={y} r={1.8} />))}
    </svg>
  );
}

/** 로고 — 반지 두 개가 겹친 모양. 강조색·잉크색 고리 하나씩, 색은 고정이라 currentColor를 안 쓴다. */
/** 토성 — 버터색 행성에 기울어진 링 하나(리뉴얼, design/리뉴얼/디자인.md). */
export function RingsLogo() {
  return (
    <svg viewBox="0 0 40 40" width={22} height={22} fill="none" aria-hidden="true">
      <circle cx={20} cy={20} r={9} style={{ fill: 'var(--butter)', stroke: 'var(--accent)' }} strokeWidth={1.4} />
      <ellipse
        cx={20}
        cy={21}
        rx={17}
        ry={5.5}
        style={{ stroke: 'var(--accent)' }}
        strokeWidth={1.4}
        transform="rotate(-18 20 21)"
      />
    </svg>
  );
}

/** 고르기 — 모서리가 둥근 화살표(리뉴얼, 디자인.md ‘아이콘’). */
export function RoundCursorIcon() {
  return (
    <svg {...box24}>
      <path d="M5.2 4.6c-.5-.3-1.1.2-.9.7l5.4 14.3c.2.6 1.1.6 1.3 0l1.9-5.1c.1-.3.3-.5.6-.6l5.1-1.9c.6-.2.6-1.1 0-1.3z" />
    </svg>
  );
}

/** AutoField — 채워지는 칸을 뜻하는 중괄호 `{ }`(리뉴얼, 디자인.md ‘아이콘’). */
export function BracesIcon() {
  return (
    <svg {...box24}>
      <path d="M9 4.5c-2 0-2.5 1-2.5 2.5v2.3c0 1.3-.7 2.2-2 2.7 1.3.5 2 1.4 2 2.7V17c0 1.5.5 2.5 2.5 2.5" />
      <path d="M15 4.5c2 0 2.5 1 2.5 2.5v2.3c0 1.3.7 2.2 2 2.7-1.3.5-2 1.4-2 2.7V17c0 1.5-.5 2.5-2.5 2.5" />
    </svg>
  );
}

/** Colors — 팔레트. */
export function PaletteIcon() {
  return (
    <svg {...box24}>
      <path d="M12 4a8 8 0 1 0 0 16c1.1 0 1.6-.8 1.3-1.7-.4-1 .3-1.8 1.3-1.8H17a3 3 0 0 0 3-3C20 7.4 16.4 4 12 4z" />
      <circle cx={8.2} cy={11} r={1} fill="currentColor" stroke="none" />
      <circle cx={10.8} cy={7.8} r={1} fill="currentColor" stroke="none" />
      <circle cx={14.6} cy={8.2} r={1} fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Library 레일(2026-10-13 — 편집 화면 레일과 같은 선 아이콘으로) ── */

/** Projects — 겹친 카드 두 장. */
export function ProjectsIcon() {
  return (
    <svg {...box24}>
      <rect x={4} y={7} width={13} height={13} rx={1.5} />
      <path d="M8 4h10.5A1.5 1.5 0 0 1 20 5.5V16" />
    </svg>
  );
}

/** Diaries — 링이 달린 다이어리. */
export function DiaryIcon() {
  return (
    <svg {...box24}>
      <rect x={6} y={4} width={13} height={16} rx={1.5} />
      <line x1={4} y1={8} x2={8} y2={8} />
      <line x1={4} y1={12} x2={8} y2={12} />
      <line x1={4} y1={16} x2={8} y2={16} />
    </svg>
  );
}

/** Fonts — 큰 A와 작은 a. */
export function FontsIcon() {
  return (
    <svg {...box24}>
      <path d="M3.5 18L8.5 5l5 13M5.4 13.5h6.2" />
      <circle cx={17.5} cy={15.2} r={2.6} />
      <line x1={20.1} y1={12.4} x2={20.1} y2={18} />
    </svg>
  );
}

/** Trash — 휴지통. */
export function TrashIcon() {
  return (
    <svg {...box24}>
      <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" />
      <line x1={10.5} y1={10.5} x2={10.5} y2={16} />
      <line x1={13.5} y1={10.5} x2={13.5} y2={16} />
    </svg>
  );
}

/** Learn — 물음표가 든 동그라미. */
export function LearnIcon() {
  return (
    <svg {...box24}>
      <circle cx={12} cy={12} r={8} />
      <path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7v.4" />
      <circle cx={12} cy={16.6} r={0.9} fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Print 레일(Paper · Sides · Layout · Marks) — Paper·Layout은 위의 PaperIcon·LayoutIcon ── */

/** Sides — 앞·뒤 두 장이 겹친 모양. */
export function SidesIcon() {
  return (
    <svg {...box24}>
      <rect x={4} y={6} width={11} height={14} rx={1.5} />
      <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h8A1.5 1.5 0 0 1 20 4.5v11a1.5 1.5 0 0 1-1.5 1.5H15" />
    </svg>
  );
}

/** Marks — 재단 표시(모서리의 십자). */
export function MarksIcon() {
  return (
    <svg {...box24}>
      <rect x={7} y={7} width={10} height={10} />
      <path d="M7 2.5v3M2.5 7h3M17 2.5v3M18.5 7h3M7 18.5v3M2.5 17h3M17 18.5v3M18.5 17h3" />
    </svg>
  );
}
