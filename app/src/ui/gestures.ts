import {
  boundsOf,
  boxOf,
  cleanStyle,
  segmentLength,
  type Box,
  type LineObject,
  type LineSeg,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import { roundMm, type Mm } from '../core/units';

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

/** 선을 집었다고 볼 거리. 0.2mm 선은 손으로 정확히 찍을 수 없다. */
export const GRAB: Mm = 1.6;
/** 끝점 손잡이를 집었다고 볼 거리. 선 몸통보다 먼저 집혀야 한다. */
export const HANDLE_GRAB: Mm = 2.2;
export const HANDLE_SIZE: Mm = 1.8;

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

/** 지금 입력 중인 글자 상자. 확정하기 전까지는 객체가 아니다. */
export type Editing = { box: Box; text: string; style: TextStyle; id?: string };

/** 있는 글자를 고치기 시작할 때, 그 글자의 스타일을 그대로 물려받는다. */
export function editingFor(t: TextObject): Editing {
  return {
    box: boxOf(t),
    text: t.text,
    style: cleanStyle({
      size: t.size,
      align: t.align,
      valign: t.valign,
      color: t.color,
      lineHeight: t.lineHeight,
    }),
    id: t.id,
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
  | { kind: 'handle'; id: string; end: 1 | 2; to: Point };

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

