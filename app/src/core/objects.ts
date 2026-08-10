import type { Mm } from './units';

/**
 * 속지 위에 놓이는 객체들.
 *
 * 좌표는 전부 속지 왼쪽 위를 원점으로 한 mm다. 칸으로 옮기는 일은 core/place가 하고,
 * 이 파일은 용지도 화면도 모른다.
 *
 * 배열 순서가 곧 그리는 순서다(뒤가 위). 도트 격자는 언제나 이 객체들보다 아래에 깔린다.
 */

/** 두 점을 잇는 자리. 아직 객체가 아니다. */
export interface LineSeg {
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
}

export type Dash = 'solid' | 'dashed' | 'dotted';

export interface LineObject extends LineSeg {
  id: string;
  type: 'line';
  /**
   * 굵기·색·모양.
   *
   * **값이 없으면 core/style의 기본값을 따른다.** 손대지 않은 선은 값을 갖지 않으므로,
   * 나중에 기본값을 바꾸면 전부 같이 따라온다. 따로 정한 선만 자기 값을 지닌다.
   *
   * 실제로 쓰이는 값을 꺼낼 때는 core/line의 `widthOf`·`colorOf`·`dashOf`를 쓴다.
   * 화면과 PDF가 각자 `?? 기본값`을 적으면 언젠가 한쪽만 바뀐다.
   */
  width?: Mm;
  color?: string;
  dash?: Dash;
  /**
   * 잠갔는가. 정하지 않았으면(대부분) 잠기지 않은 것이다.
   *
   * **포토샵의 레이어 잠금과 같은 생각이다.** 잠근 오브젝트는 클릭으로도,
   * 감싸기(마퀴)로도 골라지지 않는다 — 나중에 다른 걸 작업하다 실수로
   * 건드리지 않게 하기 위해서다. 잠금을 풀어야만 다시 손댈 수 있다.
   */
  locked?: boolean;
}

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

/**
 * 글자 상자.
 *
 * 상자는 도트가 만드는 칸이다. 한 칸을 누르면 그 칸, 여러 칸을 끌면 걸친 칸 전체다.
 *
 * **글자는 상자를 넘칠 수 있다.** 줄바꿈하지 않는다 — 선을 끈 자리에 긴 제목을
 * 쓰기 위해서다(설계문서 6장). 상자는 글자를 가두는 틀이 아니라 정렬의 기준이다.
 *
 * 빈 상자는 남지 않는다. 아무것도 입력하지 않고 나가면 객체가 만들어지지 않는다.
 * 그래서 "글자를 클릭해서 고른다"는 규칙이 모호해지지 않는다.
 */
export interface TextObject {
  id: string;
  type: 'text';
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
  text: string;
  /** 글자 크기. 입력은 pt로 받고 여기에는 mm로 담는다. */
  size?: Mm;
  align?: Align;
  valign?: VAlign;
  color?: string;
  /**
   * 굵게.
   *
   * **가짜 굵게가 아니라 Bold 글꼴 파일을 쓴다.** 브라우저는 획을 부풀려 굵은
   * 척을 할 수 있지만 pdf-lib에는 그런 기능이 없다. 화면만 굵고 인쇄물은 그대로
   * 나오는 사고를 막으려면 양쪽이 같은 파일을 봐야 한다.
   *
   * 그래서 **등록한 글꼴에는 쓸 수 없다.** 그 글꼴의 Bold 파일이 없기 때문이다.
   * 굵은 글꼴이 필요하면 Bold 파일을 따로 등록해서 고른다.
   */
  bold?: boolean;
  /**
   * 사용자가 등록한 글꼴의 id. 없으면 기본 글꼴(Pretendard)이다.
   *
   * **이번 세션에만 유효하다.** 새로고침하면 등록소가 비므로 기본 글꼴로
   * 되돌아간다. 자세한 이유는 fonts/registry에 있다.
   */
  font?: string;
  /**
   * 줄 간격 (⇧Enter로 나뉜 줄 사이 거리).
   *
   * **만들 때의 도트 간격을 여기에 새겨둔다.** 그리는 순간마다 현재 도트 간격을
   * 읽어오면, 20mm 도트에서 쓴 글이 5mm로 바꾸는 순간 줄이 소급해서 좁아진다 —
   * 이미 만들어둔 양식이 설정 하나에 무너지는 셈이다.
   *
   * 다른 값들과 같은 규칙이다. 값이 있으면 그것을 쓰고, 없으면 기본값을 따른다.
   */
  lineHeight?: Mm;
  /**
   * 자동 필드 — 값을 직접 쓰는 대신 데이터셋에서 순서대로 꺼내 채운다(설계문서 7장).
   *
   * **`text`는 손대지 않는다.** 필드로 바꿔도 원래 쓴 글자가 사라지지 않고
   * 그대로 남아 있다 — 다시 끄면 원래 글자로 돌아온다. 실제로 보이는 값은
   * core/text의 `displayText`가 정한다: 편집 화면은 언제나 `⟨+오프셋⟩` 자리표시,
   * 인쇄 미리보기·PDF는 데이터셋에서 뽑은 진짜 값(8c에서 붙는다).
   */
  field?: { offset: number; format: string };
  /**
   * 90도 단위 회전 — 0(정하지 않았으면 이 값)·90(시계 방향)·270(반시계 방향).
   *
   * 상자의 가운데를 축으로 돈다. 정렬·줄바꿈 등 다른 계산은 전부 회전하지
   * 않은 자기 상자 기준 그대로다 — 회전은 그린 결과를 통째로 돌리는
   * 마지막 한 단계일 뿐이다(이 파일의 `rotationOf`).
   */
  rotate?: 90 | 270;
  /** 잠갔는가. LineObject의 `locked` 참고 — 모든 오브젝트 종류가 같은 규칙을 쓴다. */
  locked?: boolean;
}

export type WeekdayLang = 'kr' | 'en' | 'en-short' | 'hanja';

/**
 * 월간 달력 오브젝트.
 *
 * 박스(x, y, width, height) 하나만 있으면 안의 요일 머리글·42칸·제목이
 * core/calendar의 `calendarLayout`으로 전부 자동 배치된다 — 이미지를 끌어서
 * 키우듯 이 박스 크기만 바꾸면 안의 글자도 같이 커지고 작아진다.
 *
 * `weekStart`·`showAdjacent`·`weekdayLang`은 "어떻게 보일까"에 가까운
 * 값이라 데이터셋이 아니라 이 오브젝트가 직접 지닌다 — core/dataset.ts의
 * `CalendarDataset`은 연도만 안다(10단계).
 */
export interface CalendarObject {
  id: string;
  type: 'calendar';
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
  /** 그리드 맨 왼쪽 줄의 요일. 정하지 않았으면 일요일. */
  weekStart?: 'sun' | 'mon';
  /** 이번 달이 아닌 칸에도 날짜를 보여줄지. 정하지 않았으면 보여준다. */
  showAdjacent?: boolean;
  /** 요일 이름 언어. 정하지 않았으면 한글. */
  weekdayLang?: WeekdayLang;
  color?: string;
  /**
   * 글자 크기 배율. 정하지 않았으면 1(기본).
   *
   * 절대 크기(pt)가 아니라 **배율**이다 — 글자 크기는 원래 상자 높이에서
   * 자동으로 정해지므로(core/calendar의 `calendarLayout`), 절대값을
   * 따로 두면 상자 크기를 바꿀 때마다 다시 어긋난다. 배율은 그 자동값에
   * 곱해질 뿐이라 상자를 늘리고 줄여도 여전히 맞는다.
   */
  sizeScale?: number;
  /** 잠갔는가. LineObject의 `locked` 참고. */
  locked?: boolean;
}

/**
 * 사용자가 올린 이미지.
 *
 * 박스(x, y, width, height)와 `imageId`(images/registry가 들고 있는 파일을
 * 가리키는 id)뿐이다. 달력 오브젝트와 똑같이 모서리를 끌어 크기를 바꾼다
 * (core/objects의 `resizeBox`, ui/gestures의 `boxHandle`을 그대로 함께 쓴다).
 *
 * **`imageId`는 정하지 않을 수 있다.** 달력·도형처럼 자리부터 그린 뒤(빈
 * 상자, 점선 자리표시로 보인다), 그 상자를 클릭하면 파일 선택 창이 뜬다 —
 * 사진을 먼저 골라야 상자를 그릴 수 있던 것과 반대 순서다.
 */
export interface ImageObject {
  id: string;
  type: 'image';
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
  imageId?: string;
  /**
   * 자유로운 각도(도, 시계 방향). 정하지 않았으면 0.
   *
   * 글자(0·90·270도만)와 달리 이미지는 어떤 각도든 된다 — 사진·로고를
   * 비스듬히 놓는 것은 흔한 일이라 굳이 90도 단위로 막을 이유가 없다.
   * 계산은 글자와 같은 `rotationOf`·`pdfRotateOf`를 그대로 쓴다.
   */
  rotate?: number;
  /** 잠갔는가. LineObject의 `locked` 참고. */
  locked?: boolean;
}

/** 도형의 모서리 둥글기 단계. 0(각짐)~3(점점 더 둥긂), 4(원·타원). core/shape의 `cornerRadiusOf` 참고. */
export type CornerRoundness = 0 | 1 | 2 | 3 | 4;

/**
 * 도형 — 사각형과 타원을 하나로 다룬다.
 *
 * `roundness`를 0에서 4까지 올리면 각진 사각형이 점점 둥근 사각형을
 * 거쳐 4에서 원·타원이 된다 — 사각형·타원을 서로 다른 종류로 나누지
 * 않고 값 하나로 잇는다(core/shape의 `roundedRectPath`). 지금은 테두리만
 * 그린다 — 채우기는 없다.
 */
export interface ShapeObject {
  id: string;
  type: 'shape';
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
  /** 모서리 둥글기. 정하지 않았으면 0(각짐). */
  roundness?: CornerRoundness;
  /** 테두리 굵기·색·모양. LineObject와 같은 규칙 — 값이 없으면 core/shape의 기본값. */
  strokeWidth?: Mm;
  color?: string;
  dash?: Dash;
  /** 잠갔는가. LineObject의 `locked` 참고. */
  locked?: boolean;
}

/** 체크박스에 찍을 수 있는 아이콘 모양. */
export type CheckboxIcon = 'square' | 'circle' | 'triangle' | 'diamond' | 'star' | 'heart';

/**
 * 체크박스 — 표처럼 칸 범위를 드래그하면 그 칸마다 하나씩 찍히는 도장.
 *
 * 인쇄물이라 켜고 끄는 상태(토글)가 없다 — 나중에 손으로 표시한다. 상자는
 * 도장 찍힌 칸 자체가 아니라 그 칸보다 살짝 작게 줄인 자리다(core/checkbox의
 * `checkboxIconBox`가 찍을 때 미리 계산해 넣는다).
 */
export interface CheckboxObject {
  id: string;
  type: 'checkbox';
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
  /** 아이콘 모양. 정하지 않았으면 네모. */
  icon?: CheckboxIcon;
  /** 테두리 굵기·색. ShapeObject와 같은 규칙 — 값이 없으면 core/shape의 기본값. */
  strokeWidth?: Mm;
  color?: string;
  /** 잠갔는가. LineObject의 `locked` 참고. */
  locked?: boolean;
}

export type DiaryObject =
  | LineObject
  | TextObject
  | CalendarObject
  | ImageObject
  | ShapeObject
  | CheckboxObject;

export function isLine(o: DiaryObject): o is LineObject {
  return o.type === 'line';
}

export function isText(o: DiaryObject): o is TextObject {
  return o.type === 'text';
}

export function isCalendar(o: DiaryObject): o is CalendarObject {
  return o.type === 'calendar';
}

export function isImage(o: DiaryObject): o is ImageObject {
  return o.type === 'image';
}

export function isShape(o: DiaryObject): o is ShapeObject {
  return o.type === 'shape';
}

export function isCheckbox(o: DiaryObject): o is CheckboxObject {
  return o.type === 'checkbox';
}

/** 모서리 손잡이로 크기를 바꿀 수 있는 오브젝트인가. 체크박스는 아직 아니다(찍을 때만 크기가 정해진다). */
export function isBoxResizable(
  o: DiaryObject,
): o is CalendarObject | ImageObject | ShapeObject | TextObject {
  return isCalendar(o) || isImage(o) || isShape(o) || isText(o);
}

/** 자기 상자(x·y·width·height)로 클릭 판정을 하는 오브젝트인가. 크기조정 가능 여부와는 다르다 — 체크박스는 상자로 골라지지만 손잡이는 없다. */
export function isBoxShaped(o: DiaryObject): o is CalendarObject | ImageObject | ShapeObject | CheckboxObject {
  return isBoxResizable(o) || isCheckbox(o);
}

/** 잠겼는가. 정하지 않았으면(대부분) 잠기지 않은 것이다. */
export function isLocked(o: DiaryObject): boolean {
  return o.locked ?? false;
}

/** 이미지의 회전 각도(도, 시계 방향). 정하지 않았으면 0. */
export function imageRotateOf(o: { rotate?: number }): number {
  return o.rotate ?? 0;
}

/** 선마다 따로 정할 수 있는 것들. 키가 있고 값이 undefined면 기본값을 따른다. */
export type LineStyle = Partial<Pick<LineObject, 'width' | 'color' | 'dash'>>;
/**
 * 글자마다 따로 정할 수 있는 것들.
 *
 * `lineHeight`는 만들 때 도트 간격에서 자동으로 정해지지만(core/text의
 * `newTextStyle`), 속성 막대에서 손으로 고칠 수도 있다. 고친 값은 다른 값들과
 * 똑같이 객체에 새겨져 따라다닌다.
 */
export type TextStyle = Partial<
  Pick<TextObject, 'size' | 'align' | 'valign' | 'color' | 'lineHeight' | 'bold' | 'font' | 'rotate'>
>;
/** 달력마다 따로 정할 수 있는 것들. */
export type CalendarStyle = Partial<
  Pick<CalendarObject, 'weekStart' | 'showAdjacent' | 'weekdayLang' | 'color' | 'sizeScale'>
>;
/** 이미지마다 따로 정할 수 있는 것들. */
export type ImageStyle = Partial<Pick<ImageObject, 'rotate'>>;
/** 도형마다 따로 정할 수 있는 것들. */
export type ShapeStyle = Partial<Pick<ShapeObject, 'roundness' | 'strokeWidth' | 'color' | 'dash'>>;
/** 체크박스마다 따로 정할 수 있는 것들. */
export type CheckboxStyle = Partial<Pick<CheckboxObject, 'icon' | 'strokeWidth' | 'color'>>;

/**
 * undefined인 키를 걷어낸다. 객체에 값이 없어야 기본값을 따라간다.
 *
 * 선·글자 스타일 둘 다에 쓰므로 어느 쪽 모양이든 받는다. 이미 있는 스타일에
 * 패치를 얹어 병합할 때도 같은 함수를 쓴다 — `{...base, ...patch}`로 합친 뒤
 * 여기 통과시키면, patch가 `undefined`로 지운 키가 결과에서 완전히 사라진다.
 */
export function cleanStyle<T extends Record<string, unknown>>(style: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(style)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

let counter = 0;

/**
 * 객체 id.
 *
 * 저장 파일에 그대로 들어가므로 사람이 읽을 수 있는 편이 낫다.
 * 한 번에 한 사람만 쓰는 프로그램이라 전역 유일성까지는 필요 없다.
 */
export function newId(prefix = 'o'): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** 길이가 0인 선은 만들지 않는다. 클릭만 하고 끌지 않았을 때 생긴다. */
export function isDegenerate(s: LineSeg): boolean {
  return s.x1 === s.x2 && s.y1 === s.y2;
}

/**
 * 같은 자리의 선인가.
 *
 * 그은 방향은 상관없다. 왼쪽에서 오른쪽으로 긋든 반대로 긋든 같은 선이다.
 */
export function sameSegment(a: LineSeg, b: LineSeg): boolean {
  const forward = a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
  const backward = a.x1 === b.x2 && a.y1 === b.y2 && a.x2 === b.x1 && a.y2 === b.y1;
  return forward || backward;
}

/**
 * 두 점을 마주보는 모서리로 하는 네모의 네 변.
 *
 * 면은 사각형 한 덩어리가 아니라 **선 네 개**다. 이래야 아랫변만 골라 지우면
 * 도트가 다시 드러난다 — 설계문서 6장이 표에서 쓰는 방식 그대로다.
 *
 * 한 줄로 끌면(가로나 세로가 0) 변이 겹치므로 선 하나만 만든다.
 */
export function rectLines(a: { x: Mm; y: Mm }, b: { x: Mm; y: Mm }): LineSeg[] {
  const flat = a.y === b.y;
  const thin = a.x === b.x;
  if (flat && thin) return [];
  if (flat || thin) return [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }];

  const [l, r] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
  const [t, bt] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
  return [
    { x1: l, y1: t, x2: r, y2: t },
    { x1: l, y1: bt, x2: r, y2: bt },
    { x1: l, y1: t, x2: l, y2: bt },
    { x1: r, y1: t, x2: r, y2: bt },
  ];
}

/**
 * 그으면 생기고, 이미 있으면 지워진다.
 *
 * **하나라도 없으면 없는 것만 채우고, 전부 이미 있으면 전부 지운다.**
 * 면을 반쯤 겹쳐 그렸을 때 일부는 생기고 일부는 사라지는 혼란을 막는다.
 * 겹쳐 그어도 같은 자리에 선이 중복으로 쌓이지 않는다.
 */
export function toggleLines(
  objects: DiaryObject[],
  incoming: LineSeg[],
  style: LineStyle = {},
): DiaryObject[] {
  const drawable = incoming.filter((s) => !isDegenerate(s));
  if (drawable.length === 0) return objects;

  // 글자는 겹침 판정에 끼지 않는다. 같은 자리를 다시 긋는 것은 선끼리의 이야기다.
  const lines = objects.filter(isLine);
  const missing = drawable.filter((s) => !lines.some((o) => sameSegment(o, s)));

  if (missing.length === 0) {
    return objects.filter((o) => !(isLine(o) && drawable.some((s) => sameSegment(o, s))));
  }
  const added = cleanStyle(style);
  return [
    ...objects,
    ...missing.map((s) => ({ id: newId('l'), type: 'line' as const, ...s, ...added })),
  ];
}

/** 선의 길이. */
export function segmentLength(s: LineSeg): Mm {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

/**
 * 여러 선을 감싸는 가장 작은 네모.
 *
 * 면은 선 네 개라 "면의 크기"라는 값이 따로 없다. 감싸는 네모가 곧 그 크기다.
 */
export function boundsOf(segs: LineSeg[]): Box | null {
  if (segs.length === 0) return null;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const s of segs) {
    left = Math.min(left, s.x1, s.x2);
    right = Math.max(right, s.x1, s.x2);
    top = Math.min(top, s.y1, s.y2);
    bottom = Math.max(bottom, s.y1, s.y2);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface Box {
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
}

/**
 * 객체 하나가 차지하는 자리. 선은 두 끝점을 감싸는 네모, 글자·달력은 상자 그대로.
 */
export function boxOf(o: DiaryObject): Box {
  if (isLine(o)) return boundsOf([o])!;
  return { x: o.x, y: o.y, width: o.width, height: o.height };
}

/** 여러 객체를 감싸는 가장 작은 네모. */
export function boundsOfObjects(objs: DiaryObject[]): Box | null {
  if (objs.length === 0) return null;
  const boxes = objs.map(boxOf);
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 글자 상자를 입력 중인 글자에 맞춘다 — 커지기도, 줄어들기도 한다.
 *
 * 칸 하나만 누르고 길게 쓰면 매번 손으로 상자를 늘리는 건 불편하다. 입력하는 동안
 * 실제로 필요한 크기(`required`)를 재서 격자 칸 단위로 맞춘다.
 *
 * **왼쪽 위(x, y)는 절대 움직이지 않는다.** 처음 누른 자리가 기준이고, 늘거나
 * 주는 방향은 오른쪽·아래쪽뿐이다.
 *
 * 속지 밖으로는 자라지 않는다. 그 너머는 화면·PDF 양쪽에서 잘려 보이지 않는 자리라
 * 상자를 키워봐야 의미가 없다.
 */
export function fitBox(
  base: Box,
  spacing: Mm,
  required: { width: Mm; height: Mm },
  maxWidth: Mm,
  maxHeight: Mm,
): Box {
  const quantize = (v: Mm) => (spacing > 0 ? Math.ceil(v / spacing) * spacing : v);
  const floor = spacing > 0 ? spacing : MIN_BOX_SIZE;
  const width = Math.min(Math.max(floor, quantize(required.width)), Math.max(floor, maxWidth - base.x));
  const height = Math.min(Math.max(floor, quantize(required.height)), Math.max(floor, maxHeight - base.y));
  return { ...base, width, height };
}

/** 객체를 통째로 옮긴다. 크기와 모양은 그대로다. */
export function moveObject(o: DiaryObject, dx: Mm, dy: Mm): DiaryObject {
  return isLine(o) ? moveSegment(o, dx, dy) : { ...o, x: o.x + dx, y: o.y + dy };
}

/** 모서리 이름 — 손잡이가 어느 꼭짓점인지. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** 모서리 손잡이로 크기를 바꿀 때, 너무 작아 안이 안 보이는 상자를 막는다. */
export const MIN_BOX_SIZE: Mm = 5;

/**
 * 상자의 한 모서리(`corner`)를 `to`로 끌었을 때의 새 상자.
 *
 * **맞은편 모서리는 움직이지 않는다.** 왼쪽 위를 끌면 오른쪽 아래가 고정된
 * 채로 자라거나 줄어든다 — 이미지 편집 프로그램에서 흔히 보는 동작이다.
 * 너무 작아지면(`MIN_BOX_SIZE` 아래) 그 이상은 줄지 않는다.
 */
export function resizeBox(box: Box, corner: Corner, to: { x: Mm; y: Mm }): Box {
  const opposite = {
    x: corner.includes('e') ? box.x : box.x + box.width,
    y: corner.includes('s') ? box.y : box.y + box.height,
  };
  const width = Math.max(MIN_BOX_SIZE, Math.abs(to.x - opposite.x));
  const height = Math.max(MIN_BOX_SIZE, Math.abs(to.y - opposite.y));
  const x = to.x >= opposite.x ? opposite.x : opposite.x - width;
  const y = to.y >= opposite.y ? opposite.y : opposite.y - height;
  return { x, y, width, height };
}

/** 화면(SVG 행렬)·PDF(좌표 변환)가 함께 쓰는 회전 변환. core/place의 `Placement`와 같은 모양이다. */
export interface RotationTransform {
  /** 회전 전 좌표 → 회전 후 좌표. PDF가 쓴다. */
  map(p: { x: Mm; y: Mm }): { x: Mm; y: Mm };
  /** 같은 변환의 SVG 표현. 빈 문자열이면 안 돌림. */
  svg: string;
}

/**
 * 상자를 그 가운데를 축으로, 시계 방향으로 `degrees`도만큼 돌리는 변환.
 *
 * 글자(90·270도만)·이미지(자유로운 각도) 둘 다 이 함수 하나를 쓴다 —
 * **화면과 PDF가 반드시 같은 손 방향으로 돌아야 한다.** core/place의
 * `placeSlot`과 똑같은 방식으로 여섯 숫자 하나에서 `map`(PDF용 좌표
 * 계산)과 `svg`(화면용 행렬)를 함께 낸다 — 따로 계산하면 언젠가 어긋난다.
 *
 * 0·90·180·270도는 부동소수점 오차 없이 정확한 값(0, 1, -1)으로
 * 계산한다 — `Math.cos(Math.PI/2)`는 부동소수점 오차로 정확히 0이
 * 아니어서, 그대로 쓰면 "회전 없음"이어야 할 값에 아주 작은 회전이
 * 섞여 들어간다.
 *
 * 90도(시계 방향)는 회전 배치(core/layout의 `mirrorLayout`이 쓰는 그
 * 회전)의 **거울상**이다 — 손 방향(반시계)이 반대라 부호가 다르다.
 * 270도가 오히려 회전 배치와 같은 손 방향이라, PDF에서 짝지어 쓰는
 * 각도(`pdfRotateOf`)는 270도 쪽이 9b 수정 4에서 이미 인쇄로 검증된
 * 조합(`rotate: degrees(90)`)을 그대로 재사용한다. 90도 쪽(거울상)과
 * 그 사이의 임의 각도는 아직 인쇄로 확인하지 못했다.
 */
export function rotationOf(box: Box, degrees: number): RotationTransform {
  const norm = ((degrees % 360) + 360) % 360;
  if (norm === 0) return { map: (p) => p, svg: '' };

  let cos: number;
  let sin: number;
  if (norm === 90) {
    cos = 0;
    sin = 1;
  } else if (norm === 180) {
    cos = -1;
    sin = 0;
  } else if (norm === 270) {
    cos = 0;
    sin = -1;
  } else {
    const rad = (norm * Math.PI) / 180;
    cos = Math.cos(rad);
    sin = Math.sin(rad);
  }

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const a = cos;
  const b = sin;
  const c = -sin;
  const d = cos;
  const e = cx - cx * cos + cy * sin;
  const f = cy - cx * sin - cy * cos;

  return {
    map: (p) => ({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }),
    svg: `matrix(${a} ${b} ${c} ${d} ${e} ${f})`,
  };
}

/**
 * PDF에서 이 회전과 함께 써야 하는 기울임 각도(pdf-lib의 `rotate`).
 *
 * `rotationOf`가 자리(좌표)를 옮기지만, pdf-lib은 글자·그림 자체를 그
 * 방향으로 돌려 그리라고 따로 말해주지 않으면 언제나 원래 방향으로
 * 그린다. 부호가 반대라 `-degrees`가 기본이지만, **9b 수정 4에서
 * 검증된 값(270도 → 90)과 정확히 같은 숫자가 나오도록** −180~180
 * 범위로 정규화한다 — `-270`도 수학적으로는 `90`과 같은 회전이지만,
 * 검증된 바로 그 숫자를 그대로 재사용하는 편이 더 믿을 만하다.
 */
export function pdfRotateOf(degrees: number): number {
  const n = ((-degrees % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
}

/**
 * 감싸기로 고를 수 있는가. 완전히 들어온 것만 친다.
 *
 * 글자는 상자로 판정한다. 글자가 실제로 그려진 크기는 글꼴이 정하므로
 * core가 알 수 없다 — 클릭으로 집는 것만 화면이 잰 크기를 쓴다.
 */
export function objectInRect(
  o: DiaryObject,
  rect: { x1: Mm; y1: Mm; x2: Mm; y2: Mm },
): boolean {
  if (isLine(o)) return segmentInRect(o, rect);

  const left = Math.min(rect.x1, rect.x2);
  const right = Math.max(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const bottom = Math.max(rect.y1, rect.y2);
  return o.x >= left && o.x + o.width <= right && o.y >= top && o.y + o.height <= bottom;
}

/**
 * 사각형 안에 완전히 들어온 선인가.
 *
 * 걸치기만 해도 잡히게 하면 격자 위에서 의도치 않게 딸려온다.
 * 양 끝이 모두 안에 있어야 고른 것으로 친다.
 */
export function segmentInRect(
  s: LineSeg,
  rect: { x1: Mm; y1: Mm; x2: Mm; y2: Mm },
): boolean {
  const left = Math.min(rect.x1, rect.x2);
  const right = Math.max(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const bottom = Math.max(rect.y1, rect.y2);

  const inside = (x: Mm, y: Mm) => x >= left && x <= right && y >= top && y <= bottom;
  return inside(s.x1, s.y1) && inside(s.x2, s.y2);
}

/**
 * 같은 자리에 겹친 선을 하나만 남긴다.
 *
 * 끝점을 끌다 보면 이미 있는 선과 같은 자리에 겹칠 수 있다. 그대로 두면
 * "겹쳐 그어도 쌓이지 않는다"는 규칙이 깨지고, 나중에 그 자리를 다시 그었을 때
 * 둘이 한꺼번에 사라져 무슨 일인지 알 수 없게 된다.
 *
 * 먼저 있던 것을 남긴다.
 */
export function dedupe(objects: DiaryObject[]): DiaryObject[] {
  const kept: DiaryObject[] = [];
  for (const o of objects) {
    // 글자는 같은 자리에 여러 개 있어도 겹친 것이 아니다.
    if (isLine(o) && kept.some((k) => isLine(k) && sameSegment(k, o))) continue;
    kept.push(o);
  }
  return kept;
}

/** 선의 한쪽 끝만 옮긴다. 길이와 각도가 바뀐다. */
export function reshape<T extends LineSeg>(s: T, end: 1 | 2, p: { x: Mm; y: Mm }): T {
  return end === 1 ? { ...s, x1: p.x, y1: p.y } : { ...s, x2: p.x, y2: p.y };
}

/** 선을 통째로 옮긴다. 길이와 각도는 그대로다. */
export function moveSegment<T extends LineSeg>(s: T, dx: Mm, dy: Mm): T {
  return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
}

/** 점에서 선까지의 거리. 클릭이 어느 선을 집었는지 고를 때 쓴다. */
export function distanceToSegment(s: LineSeg, px: Mm, py: Mm): Mm {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - s.x1, py - s.y1);

  // 선 위에서 가장 가까운 지점. 0~1 밖으로 나가면 끝점이 답이다.
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / lenSq));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}
