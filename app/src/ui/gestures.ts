import {
  boundsOf,
  boxOf,
  cleanStyle,
  distanceToSegment,
  imageRotateOf,
  isBoxResizable,
  isBoxShaped,
  isImage,
  isLine,
  isLocked,
  isShape,
  isText,
  MIN_FREE_BOX_SIZE,
  rectLines,
  resizeBox,
  rotationOf,
  segmentLength,
  type Box,
  type Corner,
  type DiaryObject,
  type LineObject,
  type LineSeg,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import { boldOf, displayText, lineHeightOf, rotateOf, sizeOf } from '../core/text';
import { roundMm, type Mm } from '../core/units';
import { tableSize, type Lattice } from '../core/grid';
import { familyOf, type UserFont } from '../fonts/registry';
import { measureTextBox } from './measureText';

/**
 * 확정되기 전의 것들.
 *
 * 편집 화면에서는 **손을 떼기 전까지 아무것도 진짜가 아니다.** 끌고 있는 선도,
 * 치고 있는 글자도 아직 객체가 아니다. 진짜 값은 놓는 순간 한 번만 바뀐다 —
 * 끄는 동안 상태를 계속 고치면 실행취소가 마우스 움직임 하나하나로 쪼개진다.
 *
 * 그 "아직 아닌 것"들의 모양과, 그것을 화면에 그려 보이기 위한 계산이 여기 있다.
 * EditorTab에서 떼어낸 이유는 그 파일이 컴포넌트 하나로 650줄이었기 때문이다.
 * 여기에는 React가 없다 — 순수한 계산뿐이라 눈으로 읽고 따라갈 수 있다.
 */

/** 속지 위의 한 점. 좌표는 언제나 mm다. */
export type Point = { x: Mm; y: Mm };

/**
 * 선을 집었다고 볼 거리. 0.2mm 선은 손으로 정확히 찍을 수 없다.
 *
 * 골랐다가 옮기려 할 때 자꾸 놓친다는 피드백으로 1.6 → 2.0으로 늘렸다.
 */
export const GRAB: Mm = 2.0;
/** 끝점 손잡이를 집었다고 볼 거리. 선 몸통보다 먼저 집혀야 한다. */
export const HANDLE_GRAB: Mm = 2.2;
/** 손잡이로 보이는 사각형 크기. 잡는 범위(HANDLE_GRAB)와는 다른 값이다 —
 *  작은 글자 상자에서 손잡이가 두꺼워 보인다는 피드백으로 줄였다. 줄여도
 *  잡는 범위는 그대로라 잡기 어려워지지 않는다. */
export const HANDLE_SIZE: Mm = 1.2;

/**
 * 이만큼 움직이기 전까지는 끈 것이 아니라 **누른 것**이다.
 *
 * 고르려고 누르는 순간에도 손은 미세하게 떨린다. 그 떨림을 이동으로 받으면,
 * 격자를 벗어나 있던 것이 클릭만 해도 제자리로 튄다 — 도착지를 격자에 맞추므로
 * 아주 조금만 움직여도 최대 반 칸이 밀린다. 누른 것과 끈 것을 여기서 가른다.
 *
 * 붙는 자리를 정하는 스냅에는 여전히 문턱값이 없다. 이것은 **몸짓을 가르는**
 * 문턱이지 좌표를 정하는 문턱이 아니다.
 */
export const DRAG_START: Mm = 1;

/** 상자 가운데가 로고 정렬선에서 이만큼 안이면 달라붙는다. */
export const LOGO_LINE_SNAP: Mm = 3;

/**
 * 지금 입력 중인 글자 상자. 확정하기 전까지는 객체가 아니다.
 *
 * `originalText`는 편집을 시작할 때의 글자다 — 손을 대지 않고 그대로
 * 확정하면(예: 자동 필드를 열어봤다가 아무것도 안 고치고 Esc) 자동
 * 필드 자리표시를 다시 인식하지 않는다. 다시 인식하면 갈래 글자만으로는
 * 서식을 하나로 정할 수 없어(core/text의 `CATEGORY_DEFAULT_FORMAT`)
 * 사용자가 따로 골라둔 서식이 기본값으로 되돌아가 버린다.
 */
export type Editing = {
  box: Box;
  text: string;
  style: TextStyle;
  id?: string;
  field?: { offset: number; format: string };
  originalText?: string;
};

/**
 * 있는 글자를 고치기 시작할 때, 그 글자의 스타일을 그대로 물려받는다.
 *
 * **`TextStyle`의 모든 키를 다 챙겨야 한다.** `finishEditing`(EditorTab)이
 * 이 스타일로 객체를 통째로 새로 만들기 때문에, 여기서 빠진 값은 그냥
 * 안 보이는 게 아니라 고치고 나면 실제로 지워진다 — 글꼴(`font`)·
 * 굵게(`bold`)를 빠뜨렸을 때 글을 고칠 때마다 기본 글꼴로 되돌아가던
 * 사고가 이래서 났다.
 */
export function editingFor(t: TextObject): Editing {
  const shown = displayText(t);
  return {
    box: boxOf(t),
    text: shown,
    style: cleanStyle({
      size: t.size,
      align: t.align,
      valign: t.valign,
      color: t.color,
      lineHeight: t.lineHeight,
      bold: t.bold,
      font: t.font,
      rotate: t.rotate,
    }),
    id: t.id,
    field: t.field,
    originalText: shown,
  };
}

export type Drag =
  | { kind: 'draw'; from: Point; to: Point }
  | { kind: 'textbox'; from: Point; to: Point }
  | { kind: 'marquee'; from: Point; to: Point }
  /**
   * 고른 것을 통째로 옮기는 중.
   *
   * `anchor` — 고른 것 전체를 감싸는 네모의 왼쪽 위. **이 점이 격자에 앉는다.**
   * `free`   — ⌘(Ctrl)을 누른 채라 격자를 벗어난 자리에 놓인다.
   * `moved`  — DRAG_START를 넘겼다. 넘기기 전까지는 누른 것으로 본다.
   */
  | {
      kind: 'move';
      origin: Point;
      anchor: Point;
      dx: Mm;
      dy: Mm;
      hitId: string | null;
      free: boolean;
      moved: boolean;
    }
  | { kind: 'handle'; id: string; end: 1 | 2; to: Point }
  /** 상자(달력 등)의 모서리 손잡이를 끄는 중. `preview()`의 상자 버전은 `previewBox`. */
  | { kind: 'boxHandle'; id: string; corner: Corner; to: Point };

export function rectOf(a: Point, b: Point) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * 치수 글자.
 *
 * 선 하나면 길이, 여러 개면 감싸는 네모의 가로 × 세로.
 * 면은 선 네 개라 "면의 크기"라는 값이 따로 없고 감싸는 네모가 곧 그 크기다.
 */
export function sizeLabelOf(segs: LineSeg[]): string | null {
  if (segs.length === 0) return null;
  const mm = (v: number) => roundMm(v, 1);

  if (segs.length === 1) {
    const s = segs[0];
    // 가로선·세로선은 길이만으로 충분하다. 대각선은 몇 칸짜리인지도 알아야 한다.
    if (s.x1 === s.x2 || s.y1 === s.y2) return `${mm(segmentLength(s))}mm`;
    const b = boundsOf(segs)!;
    return `${mm(b.width)} × ${mm(b.height)}mm`;
  }

  const b = boundsOf(segs);
  return b ? `${mm(b.width)} × ${mm(b.height)}mm` : null;
}

/**
 * 지금 끄는 중이면 놓았을 때의 모습, 아니면 있는 그대로.
 *
 * 진짜 값은 손을 뗄 때 한 번만 바꾼다. 끄는 동안 상태를 계속 고치면
 * 실행취소가 마우스 움직임 하나하나로 쪼개진다.
 */
export function preview(o: LineObject, nudge: { dx: Mm; dy: Mm } | null, grip: GripDrag | null): LineSeg {
  if (grip && grip.id === o.id) {
    return grip.end === 1
      ? { x1: grip.to.x, y1: grip.to.y, x2: o.x2, y2: o.y2 }
      : { x1: o.x1, y1: o.y1, x2: grip.to.x, y2: grip.to.y };
  }
  const dx = nudge?.dx ?? 0;
  const dy = nudge?.dy ?? 0;
  return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
}

export type BoxHandleDrag = Extract<Drag, { kind: 'boxHandle' }>;

/** 상자 모서리를 끄는 중이면 놓았을 때의 크기, 아니면 있는 그대로. `preview()`의 상자 버전. */
export function previewBox(o: { id: string } & Box, boxHandle: BoxHandleDrag | null): Box {
  if (boxHandle && boxHandle.id === o.id) return resizeBox(o, boxHandle.corner, boxHandle.to);
  return o;
}

export type GripDrag = Extract<Drag, { kind: 'handle' }>;

export function segProps(l: LineSeg) {
  return { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 };
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function merge(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/*
 * 아래부터는 EditorTab·PrintSlotEditor·NotebookHalfEditor 세 화면이 각자
 * 거의 똑같이 들고 있던 히트테스트·리사이즈 계산이다(37단계 전면검토 —
 * diff로 재보니 PrintSlotEditor·NotebookHalfEditor는 90% 가까이 동일했고,
 * 이번 세션에 겪은 resizeTextBox·타공 mirror 버그를 세 곳에 각각 고쳐야
 * 했던 이유도 이 중복이었다). 컴포넌트 상태(objects·lone·svg 등)를
 * 클로저로 가두지 않고 인자로 받는다 — 그래야 세 화면이 그대로 가져다
 * 쓸 수 있다.
 */

/** 이 오브젝트 자신의 회전 각도. 글자·이미지만 돈다. */
export function rotationDegOf(o: DiaryObject): number {
  if (isText(o)) return rotateOf(o);
  if (isImage(o)) return imageRotateOf(o);
  return 0;
}

/**
 * 화면(회전 후) 좌표를 이 오브젝트의 원래(회전 전, 자기 상자 기준) 좌표로
 * 되돌린다. 클릭 판정·모서리 손잡이·크기조정을 전부 이 "되돌린 자리"
 * 기준으로 계산한다 — 그래야 core/objects의 `resizeBox` 같은 계산을 회전
 * 여부와 상관없이 그대로 쓸 수 있다. 반대로(보여줄 때) 돌리는 쪽은 그리는
 * 자리에서 `rotationOf`를 직접 쓴다 — 크기조정 중에는 상자가 저장된
 * 값과 다를 수 있어(미리보기), 이 오브젝트의 저장된 상자가 아니라
 * **그 순간의 상자**를 축으로 돌려야 하기 때문이다.
 */
export function toLocal(o: DiaryObject, p: Point): Point {
  const rot = rotationDegOf(o);
  return rot === 0 ? p : rotationOf(boxOf(o), -rot).map(p);
}

/** 상자 테두리(네 변)까지의 최소 거리. */
export function distanceToBoxEdge(b: Box, p: Point): Mm {
  const edges = rectLines({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height });
  return Math.min(...edges.map((e) => distanceToSegment(e, p.x, p.y)));
}

/** 딱 하나 고른 선의 끝점 손잡이. */
export function handleAt(lone: DiaryObject | null, p: Point): { id: string; end: 1 | 2 } | null {
  if (!lone || !isLine(lone)) return null;
  const d1 = Math.hypot(p.x - lone.x1, p.y - lone.y1);
  const d2 = Math.hypot(p.x - lone.x2, p.y - lone.y2);
  if (d1 <= HANDLE_GRAB && d1 <= d2) return { id: lone.id, end: 1 };
  if (d2 <= HANDLE_GRAB) return { id: lone.id, end: 2 };
  return null;
}

/**
 * `handleAt`과 달리 딱 하나 고른 것(lone)에 매이지 않는다 — 그리기 도구는
 * 고르지 않고도 계속 선을 잇는 게 자연스러운데, 그 상태에서 이미 그은
 * 선의 끝점 근처를 누르면(고르지 않았어도) 새 도형을 시작하는 대신 그
 * 선을 잡아 늘이게 한다. 아무 선의 끝점이든 가장 가까운 것 하나를 찾는다.
 */
export function anyLineHandleAt(
  objects: DiaryObject[],
  p: Point,
): { id: string; end: 1 | 2 } | null {
  let best: { id: string; end: 1 | 2; dist: Mm } | null = null;
  for (const o of objects) {
    if (!isLine(o) || isLocked(o)) continue;
    const d1 = Math.hypot(p.x - o.x1, p.y - o.y1);
    const d2 = Math.hypot(p.x - o.x2, p.y - o.y2);
    if (d1 <= HANDLE_GRAB && (!best || d1 < best.dist)) best = { id: o.id, end: 1, dist: d1 };
    if (d2 <= HANDLE_GRAB && (!best || d2 < best.dist)) best = { id: o.id, end: 2, dist: d2 };
  }
  return best && { id: best.id, end: best.end };
}

/**
 * 딱 하나 고른 상자(달력·이미지)의 네 모서리 손잡이. 선의 끝점 손잡이와 짝이다.
 *
 * 이미지는 돌아가 있을 수 있다 — 화면 좌표(`p`)를 먼저 그 이미지의
 * 원래(회전 전) 좌표로 되돌린 다음, 항상 원래 좌표에 있는 네 모서리와 견준다.
 */
export function boxHandleAt(lone: DiaryObject | null, p: Point): { id: string; corner: Corner } | null {
  if (!lone || !isBoxResizable(lone)) return null;
  const b = boxOf(lone);
  const test = toLocal(lone, p);
  const corners: { corner: Corner; x: number; y: number }[] = [
    { corner: 'nw', x: b.x, y: b.y },
    { corner: 'ne', x: b.x + b.width, y: b.y },
    { corner: 'sw', x: b.x, y: b.y + b.height },
    { corner: 'se', x: b.x + b.width, y: b.y + b.height },
  ];
  for (const c of corners) {
    if (Math.hypot(test.x - c.x, test.y - c.y) <= HANDLE_GRAB) return { id: lone.id, corner: c.corner };
  }
  return null;
}

/**
 * 그 자리에서 집히는 것. 가장 가까운 것 하나만 고른다.
 *
 * 글자는 **실제로 그려진 크기**로 판정한다. 그 크기는 글꼴이 정하므로 core가 알 수
 * 없지만, 화면에는 이미 그려져 있으니 브라우저에 물어보면 된다. viewBox가 mm라
 * getBBox()가 곧 mm를 돌려준다.
 *
 * 글자를 먼저 본다. 글자가 선 위에 얹혀 있을 때 글자를 집을 수 없으면 곤란하다.
 * 달력·이미지는 자기 상자가 곧 자리라 글꼴이 그린 크기를 잴 필요가 없다.
 *
 * **도형만은 안이 아니라 테두리를 눌러야 집힌다.** 표의 테두리도 도형이고,
 * 그 안에 안쪽 칸 선이 그대로 깔려 있다 — 안을 채워서 판정하면 그 선을 다시
 * 고를 수 없다(늘 테두리가 먼저 집힌다). 도형 안에 직접 그려 넣은 장식선도
 * 같은 문제라, 도형은 아예 테두리 근처(GRAB)만 집히게 한다.
 */
export function hitAt(svg: SVGSVGElement | null, objects: DiaryObject[], p: Point): DiaryObject | null {
  if (svg) {
    for (const el of [...svg.querySelectorAll<SVGTextElement>('text[data-id]')].reverse()) {
      const found = objects.find((o) => o.id === el.dataset.id);
      if (!found || !isText(found) || isLocked(found)) continue;
      // getBBox()는 <text>의 회전 전(자기 상자 기준) 자리를 돌려준다 — 화면에
      // 보이는 회전한 자리가 아니다. 그래서 클릭 지점을 반대로 먼저 돌려
      // "회전 전이라면 어디를 짚은 셈인지"로 바꾼 다음 견준다.
      const test = toLocal(found, p);
      const b = el.getBBox();
      if (test.x >= b.x && test.x <= b.x + b.width && test.y >= b.y && test.y <= b.y + b.height) {
        return found;
      }
    }
  }

  for (const o of [...objects].reverse()) {
    if (!isBoxShaped(o) || isLocked(o)) continue;
    const b = boxOf(o);
    // 이미지는 돌아가 있을 수 있다 — 회전 전 좌표로 되돌려 상자와 견준다.
    const test = toLocal(o, p);
    if (isShape(o)) {
      if (distanceToBoxEdge(b, test) <= GRAB) return o;
      continue;
    }
    if (test.x >= b.x && test.x <= b.x + b.width && test.y >= b.y && test.y <= b.y + b.height) return o;
  }

  let best: DiaryObject | null = null;
  let bestGap = GRAB;
  for (const o of objects) {
    if (!isLine(o) || isLocked(o)) continue;
    const gap = distanceToSegment(o, p.x, p.y);
    if (gap <= bestGap) {
      best = o;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * 글자 상자를 손잡이로 조절해도 **글자 크기는 그대로 둔다.** 예전엔
 * 세로(높이) 비율만큼 글자 크기도 같이 바뀌었는데, 상자만 조절하려는
 * 건데 글자까지 저절로 커지거나 작아진다는 피드백으로 뺐다.
 *
 * **상자는 지금 글자가 실제로 필요로 하는 크기보다 작아지지 않는다.**
 * 그 밑으로 끌면 글자가 상자를 넘친다 — 이미 있는 원칙이다(25단계,
 * `core/text`의 "글자는 상자를 넘칠 수 있다").
 */
export function resizeTextBoxTo(
  t: TextObject,
  corner: Corner,
  to: Point,
  userFonts: UserFont[],
): { box: Box } {
  const oldBox = boxOf(t);
  const rawBox = resizeBox(oldBox, corner, to, MIN_FREE_BOX_SIZE);
  const required = measureTextBox(
    displayText(t),
    sizeOf(t),
    lineHeightOf(t),
    boldOf(t),
    familyOf(userFonts, t.font),
  );
  const width = Math.max(rawBox.width, required.width);
  const height = Math.max(rawBox.height, required.height);
  // 최소 크기에 걸려 raw보다 커지면, resizeBox와 같은 규칙으로 고정된
  // 모서리(반대쪽)가 밀리지 않게 x·y도 그만큼 보정한다 — 예를 들어
  // 오른쪽(east) 손잡이를 끌 때는 왼쪽이 고정이라 x는 그대로여야 하는데,
  // 폭만 늘리고 x를 안 옮기면 왼쪽 손잡이(west) 쪽 상자가 오른쪽으로
  // 밀려난 것처럼 보였다.
  const x = corner.includes('w') ? rawBox.x - (width - rawBox.width) : rawBox.x;
  const y = corner.includes('n') ? rawBox.y - (height - rawBox.height) : rawBox.y;
  return { box: { x, y, width, height } };
}

/** 치수 글자 뒤에 몇 칸짜리인지도 붙인다. */
export function withCells(
  lattice: Lattice,
  mmLabel: string | null,
  from: Point,
  to: Point,
): string | null {
  if (!mmLabel) return null;
  const { cols, rows } = tableSize(lattice, from, to);
  const cellPart = cols === 1 ? `${rows}칸` : rows === 1 ? `${cols}칸` : `${cols} × ${rows}칸`;
  return `${mmLabel} · ${cellPart}`;
}

/** 상자 가운데가 로고 정렬선(logoLineX) 가까이 오면 달라붙는다. */
export function centerOnLogoLine<T extends { x: Mm; width: Mm }>(box: T, logoLineX: Mm): T {
  const cx = box.x + box.width / 2;
  return Math.abs(cx - logoLineX) <= LOGO_LINE_SNAP ? { ...box, x: logoLineX - box.width / 2 } : box;
}

