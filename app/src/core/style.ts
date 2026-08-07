import { ptToMm, type Mm } from './units';

/**
 * 색과 굵기를 한 군데 모아둔다.
 *
 * 화면과 PDF는 서로를 모르는 독립적인 뷰지만, 같은 색으로 그려야 한다.
 * 여기에는 계산이 없다. 값만 있다.
 */

/**
 * 속지 안에 그려지는 것들. 인쇄물에 그대로 남으므로 연하게 둔다.
 * 도트 위에 글씨를 쓰는 게 이 프로그램의 기본 동작이라, 도트가 진하면 방해가 된다.
 *
 * 셋을 따로 둔 이유는 나중에 개별 조정하기 위해서다. 지금은 같은 값이다.
 */
export const CONTENT_COLOR = {
  // 도트를 0.4에서 0.2mm로 줄이면서 같은 색인데도 훨씬 연해 보이게 됐다.
  // 작아진 만큼 색으로 되돌린다.
  dot: '#a6a6a6',
  line: '#a6a6a6',
  text: '#a6a6a6',
} as const;

/**
 * 도트 지름과 격자·줄 굵기.
 *
 * 잠정값이다. 도트가 굵으면 글씨를 방해하고 가늘면 안 보인다.
 * 인쇄해서 눈으로 보고 정할 값이라 여기 한 군데에만 둔다.
 */
export const DOT_SIZE: Mm = 0.2;
export const GRID_LINE_WIDTH: Mm = 0.12;

/**
 * 화면에서만 쓰는 격자 표시 — **의도적으로 실제보다 크고 진하다.**
 *
 * 인쇄되는 도트는 0.2mm다. 그대로 화면에 그리면 1픽셀도 되지 않아 어디에 붙는지
 * 보이지 않는다. 도트 위에 선을 긋는 것이 이 프로그램의 기본 동작이므로,
 * 화면에서는 안내선 역할이 우선이다.
 *
 * **위치는 조금도 달라지지 않는다.** 격자점 좌표는 화면과 PDF가 같은 core/grid에서
 * 받는다. 여기서 다른 것은 굵기와 색뿐이다. "화면과 PDF는 같은 데이터를 각자 그리는
 * 독립적인 뷰"라는 원칙은 데이터가 같다는 뜻이지 똑같이 보여야 한다는 뜻이 아니다.
 *
 * 인쇄물이 어떻게 보일지는 화면이 아니라 실제로 뽑아서 판단한다.
 */
export const SCREEN_DOT_SIZE: Mm = 0.6;
export const SCREEN_GRID_LINE_WIDTH: Mm = 0.2;
export const SCREEN_GRID_COLOR = '#8c8c8c';

/**
 * 마우스가 올라간 자리. 어디에 붙을지 미리 보여준다. 화면 전용이다.
 *
 * 도구마다 색을 다르게 둔다 — 그리기는 초록, 글자는 파랑. 지금 어느 도구로
 * 조작하는 중인지 커서만 보고도 알 수 있어야 한다.
 */
export const SNAP_DOT_SIZE: Mm = 1.6;
export const SNAP_COLOR = '#2f6f4f';
/**
 * 글자 도구의 파랑.
 *
 * 그리기 도구의 초록(SNAP_COLOR)과 짝이다. 값 자체는 styles.css의
 * `.text-hover`·`.text-drag`·`.editing-box`에 그대로 옮겨 적었다 — 선택 표시
 * (`.picked`·`.marquee`)가 이미 그렇게 하고 있어서 같은 방식을 따랐다.
 */
export const TEXT_SNAP_COLOR = '#3568c9';

/**
 * 사용자가 그은 선의 기본값.
 *
 * 도트와 색이 비슷해도 선은 이어져 있어서 훨씬 또렷하게 읽힌다.
 * 실제 시판 속지의 표 선도 도트보다 아주 조금 진한 정도다.
 *
 * 나중에 선마다 따로 정할 수 있게 되면 이 값이 '기본'이 된다.
 */
export const OBJECT_LINE_COLOR = '#9e9e9e';
export const OBJECT_LINE_WIDTH: Mm = 0.2;

/**
 * 선 끝 처리.
 *
 * 굵은 선의 꼭짓점이 끊기는 것을 막는다. 기본값인 butt는 끝을 딱 잘라서
 * 두 선이 만나는 자리에 굵기만 한 네모 구멍을 남긴다. 굵을수록 커진다.
 *
 * round는 끝을 굵기의 절반만큼 둥글게 연장하는데, **좌표를 늘리는 것이 아니라
 * 그리는 순간에만 연장한다.** 좌표를 늘리면 50mm 선이 실제로 50.8mm가 되어
 * 치수 표시가 거짓이 된다. 각도와 무관하게 채워지므로 대각선이 만나는 자리도 해결된다.
 *
 * **화면과 PDF가 반드시 같아야 한다.** 한동안 화면만 round이고 PDF는 butt라
 * 인쇄물에서만 꼭짓점이 끊겼다. 그래서 값을 여기 한 군데에 둔다.
 */
export const OBJECT_LINE_CAP = 'round' as const;

/**
 * 글자.
 *
 * 기본 크기는 9pt다. 손바닥만 한 속지에 쓰는 글씨라 문서 프로그램의 기본(11pt)보다 작다.
 * 저장은 mm로 하고 입력만 pt로 받는다 — 모든 좌표는 mm라는 규칙을 지키기 위해서다.
 */
export const TEXT_SIZE: Mm = ptToMm(9);
export const TEXT_COLOR = '#3a3a3a';

/**
 * 글꼴의 윗선·아랫선 비율 (글자 크기 대비).
 *
 * 세로 정렬을 화면과 PDF가 같은 자리에 놓기 위한 값이다. 화면 쪽에서 글꼴의 실제
 * 지표를 얻기 어려워서 비율로 고정한다. **두 뷰가 같은 값을 쓰는 것이 요점이고,**
 * 값 자체가 조금 어긋나도 둘이 함께 어긋나므로 눈에 띄지 않는다.
 */
export const TEXT_ASCENT = 0.76;
export const TEXT_DESCENT = 0.24;

/** 월간 달력 오브젝트의 기본값(core/calendar.ts). */
export const CALENDAR_WEEK_START = 'sun' as const;
export const CALENDAR_SHOW_ADJACENT = true;
export const CALENDAR_WEEKDAY_LANG = 'kr' as const;

/*
 * 줄 간격(여러 줄을 쓸 때 ⇧Enter로 나뉘는 줄 사이 거리)은 여기 상수로 두지 않는다.
 * core/text.ts의 effectiveLineHeight가 **도트 간격을 그대로 따르도록** 계산한다 —
 * 5mm 도트 위에서 줄마다 정확히 다음 도트 줄에 앉아야 여러 줄을 쓸수록 칸
 * 한가운데에서 위쪽으로 밀리지 않는다. 자세한 이유는 그 함수의 주석에 있다.
 */

/**
 * 화면에 담아둔 기본 글꼴. PDF에도 **같은 파일**을 심는다.
 *
 * 굵기마다 파일이 따로다. 브라우저는 Regular만 주면 획을 부풀려 굵은 척을 해주지만
 * (synthetic bold) pdf-lib에는 그런 기능이 없다 — 그대로 두면 화면만 굵고 인쇄물은
 * 보통 굵기로 나온다. 그래서 Bold도 함께 담는다.
 *
 * 파일 하나에 2.7MB라 필요한 것만 받는다. Bold는 굵은 글자가 실제로 있을 때만
 * 내려받고, PDF에도 그때만 심는다.
 */
export const DEFAULT_FONT_FAMILY = 'Pretendard';
export const DEFAULT_FONT_URL = `${import.meta.env.BASE_URL}fonts/Pretendard-Regular.ttf`;
export const BOLD_FONT_URL = `${import.meta.env.BASE_URL}fonts/Pretendard-Bold.ttf`;

/** 화면(CSS)과 PDF가 함께 쓰는 굵기 값. @font-face 선언과 반드시 같아야 한다. */
export const FONT_WEIGHT = { regular: 400, bold: 700 } as const;

/** 재단선·십자 마크. 인쇄되지만 자르고 나면 대부분 사라진다. */
export const CROP_COLOR = '#8fb8de';
export const CROP_WIDTH: Mm = 0.1;
/** 십자 마크의 팔 하나 길이. 십자 전체 길이는 이것의 두 배(6mm)다. */
export const CROP_ARM: Mm = 3;

/**
 * 검증 눈금자. 자로 재야 하므로 연하게 하지 않는다.
 * 굵으면 눈금의 어디를 읽어야 할지 애매해지므로 최대한 가늘게 긋는다.
 */
export const RULER_COLOR = '#1c1c1a';
export const RULER_WIDTH: Mm = 0.1;

/** '#rrggbb' → pdf-lib이 쓰는 0~1 삼원색 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}
