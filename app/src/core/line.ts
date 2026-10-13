import type { Dash, LineObject } from './objects';
import { OBJECT_LINE_COLOR, OBJECT_LINE_WIDTH, SKETCH_AMPLITUDE, SKETCH_STEP } from './style';
import type { Mm } from './units';

/**
 * 선을 어떻게 그릴지.
 *
 * **화면과 PDF가 반드시 같은 모양으로 그려야 한다.** 둘은 그리는 방법이 전혀 다르다 —
 * 화면은 SVG의 stroke 속성에 맡기고, PDF는 pdf-lib에 pt로 넘긴다. 그래도 "이 선이
 * 실제로 몇 mm 굵기이고 무슨 색인가"는 하나뿐이므로 여기서 한 번만 정한다.
 *
 * 이 파일이 생긴 이유가 있다. 한동안 `OBJECT_LINE_CAP`을 화면만 `round`로 두고
 * PDF는 `butt`로 둬서 **인쇄물에서만** 굵은 선의 꼭짓점이 끊겼다. 그건 값을
 * core/style 한 군데로 모아 고쳤는데, `?? 기본값`과 점선 비율은 여전히 두 뷰에
 * 각각 적혀 있었다. 주석으로 "화면과 같은 값을 쓴다"고 적어둬도 강제가 아니다.
 *
 * 글자 쪽의 core/text(`sizeOf`·`alignOf`·`valignOf`·`lineHeightOf`)와 같은 역할이다.
 */

/** 이 선의 굵기. 정하지 않았으면 기본값. */
export function widthOf(o: LineObject): Mm {
  return o.width ?? OBJECT_LINE_WIDTH;
}

/** 이 선의 색. 정하지 않았으면 기본값. */
export function colorOf(o: LineObject): string {
  return o.color ?? OBJECT_LINE_COLOR;
}

/** 이 선의 모양. 정하지 않았으면 실선. */
export function dashOf(o: LineObject): Dash {
  return o.dash ?? 'solid';
}

/**
 * 점선의 [그리는 길이, 띄는 길이]. 실선이면 없다.
 *
 * **굵기에 비례한다.** 고정 길이로 두면 0.1mm 선에서는 점선이 뭉개지고 0.8mm
 * 선에서는 뚝뚝 끊겨 보인다. 비율로 두면 어느 굵기에서나 비슷하게 읽힌다.
 *
 * mm로 돌려준다. 화면은 그대로 이어 붙이고, PDF는 pt로 바꿔서 쓴다.
 *
 * 굵기를 따로 받는 이유는 **격자선도 이 함수를 쓰기 때문**이다. 격자선은 객체가
 * 아니고, 게다가 화면과 인쇄에서 굵기가 다르다(SCREEN_GRID_LINE_WIDTH 대
 * GRID_LINE_WIDTH). 그래도 점선 비율은 한 군데서 나와야 한다.
 */
export function dashPattern(dash: Dash, width: Mm): [Mm, Mm] | undefined {
  if (dash === 'dashed') return [width * 6, width * 4];
  if (dash === 'dotted') return [width, width * 3];
  return undefined;
}

/** 그은 선 하나의 점선 간격. 굵기와 모양을 그 선에서 꺼내 쓴다. */
export function dashPatternOf(o: LineObject): [Mm, Mm] | undefined {
  return dashPattern(dashOf(o), widthOf(o));
}

/** 문자열에서 만든 고정된 씨앗 — 같은 id면 언제나 같은 수. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 씨앗에서 0~1 수를 차례로 — 매번 같은 차례(mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 손그림 선의 꺾은선 점들(리뉴얼 9-3, 기능후보 1). 손그림이 아니면 null.
 *
 * 곧은 선을 `SKETCH_STEP` 남짓씩 나눠, 선에 수직으로 `SKETCH_AMPLITUDE` 안에서 부드럽게 흔든다(사인 두 개의
 * 합 — 점마다 따로 흔들면 톱니처럼 보인다). **양 끝은 그대로** — 선은 도트에서 시작해 도트에서 끝난다.
 * **흔들림은 객체 id에서 정한다** — 다시 그리거나 PDF로 뽑아도 같은 모양이다. 화면(InsertView)과
 * PDF(export)가 이 점들을 그대로 잇는다.
 */
export function sketchPoints(o: LineObject): { x: Mm; y: Mm }[] | null {
  if (dashOf(o) !== 'sketch') return null;
  const dx = o.x2 - o.x1;
  const dy = o.y2 - o.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
  const n = Math.max(2, Math.ceil(length / SKETCH_STEP));
  const next = random(seedOf(o.id));
  // 긴 선일수록 물결이 여러 번 — 하지만 한 물결이 너무 짧으면 떨림으로 보인다.
  const f1 = 0.5 + next() + length / 40;
  const f2 = 1.5 + 2 * next() + length / 15;
  const p1 = next() * Math.PI * 2;
  const p2 = next() * Math.PI * 2;
  const nx = -dy / length;
  const ny = dx / length;
  const out: { x: Mm; y: Mm }[] = [];
  out.push({ x: o.x1, y: o.y1 });
  for (let i = 1; i < n; i++) {
    const t = i / n;
    // 끝으로 갈수록 0 — 양 끝 가까이에서 꺾이지 않게(양 끝 점 자체는 위에서 그대로 넣었다).
    const envelope = Math.sin(Math.PI * t);
    const wave = 0.65 * Math.sin(2 * Math.PI * f1 * t + p1) + 0.35 * Math.sin(2 * Math.PI * f2 * t + p2);
    const off = SKETCH_AMPLITUDE * envelope * wave;
    out.push({ x: o.x1 + dx * t + nx * off, y: o.y1 + dy * t + ny * off });
  }
  out.push({ x: o.x2, y: o.y2 });
  return out;
}
