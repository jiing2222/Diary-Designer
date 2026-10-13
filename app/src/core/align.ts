import type { Box } from './objects';
import { roundMm, type Mm } from './units';

/**
 * 맞춤 안내선(리뉴얼 9-2, 기능후보 5). 옮기는 것의 왼쪽·가운데·오른쪽(위·가운데·아래)이 다른 객체의 같은
 * 자리나 페이지 가운데와 `threshold` 안으로 가까우면 거기에 붙이고, 그 줄을 안내선으로 돌려준다.
 *
 * 평소엔 도트에 붙고, **Alt를 누른 채 옮길 때만** 이것을 쓴다(2026-10-13 결정) — 이 프로그램은 ‘모든 것이
 * 도트 위’가 원칙이라(core/snap) 객체 맞춤은 일부러 고를 때만.
 */

export interface AlignGuide {
  /** 'x'면 세로선(x = at), 'y'면 가로선(y = at). */
  axis: 'x' | 'y';
  at: Mm;
  /** 선이 그어지는 범위(다른 축의 mm). */
  from: Mm;
  to: Mm;
}

interface Line {
  at: Mm;
  /** 이 줄을 가진 상자의 다른 축 범위 — 안내선을 어디서 어디까지 그을지. */
  span: [Mm, Mm];
}

const linesX = (b: Box): Line[] =>
  [b.x, b.x + b.width / 2, b.x + b.width].map((at) => ({ at, span: [b.y, b.y + b.height] }));
const linesY = (b: Box): Line[] =>
  [b.y, b.y + b.height / 2, b.y + b.height].map((at) => ({ at, span: [b.x, b.x + b.width] }));

/** 한 축에서 가장 가까운 맞춤 — 보정량, 맞은 줄, 그 줄을 가진 상대들의 범위. 없으면 null. */
function bestOn(mine: Line[], theirs: Line[], threshold: Mm): { shift: Mm; at: Mm; spans: [Mm, Mm][] } | null {
  let best: { shift: Mm; at: Mm } | null = null;
  for (const m of mine) {
    for (const t of theirs) {
      const shift = t.at - m.at;
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: t.at };
    }
  }
  if (!best) return null;
  const at = best.at;
  return { shift: best.shift, at, spans: theirs.filter((t) => Math.abs(t.at - at) < 1e-6).map((t) => t.span) };
}

/**
 * `moving`(옮긴 뒤의 자리)을 `others`·페이지 가운데에 맞춘다. 반환하는 dx·dy는 **더 옮길 양**이다.
 * `threshold`는 붙는 거리(mm) — 화면에서 같은 손맛이 나도록 부르는 쪽이 확대에 맞춰 준다.
 * 안내선은 맞춘 뒤의 자리에서, 옮기는 것과 맞은 상대들을 모두 지나도록 긋는다.
 */
export function alignBox(
  moving: Box,
  others: Box[],
  page: { width: Mm; height: Mm },
  threshold: Mm,
): { dx: Mm; dy: Mm; guides: AlignGuide[] } {
  const x = bestOn(linesX(moving), [...others.flatMap(linesX), { at: page.width / 2, span: [0, page.height] }], threshold);
  const y = bestOn(linesY(moving), [...others.flatMap(linesY), { at: page.height / 2, span: [0, page.width] }], threshold);
  const dx = x?.shift ?? 0;
  const dy = y?.shift ?? 0;
  const guides: AlignGuide[] = [];
  if (x) {
    const top = moving.y + dy;
    guides.push({
      axis: 'x',
      at: roundMm(x.at),
      from: Math.min(top, ...x.spans.map((s) => s[0])),
      to: Math.max(top + moving.height, ...x.spans.map((s) => s[1])),
    });
  }
  if (y) {
    const left = moving.x + dx;
    guides.push({
      axis: 'y',
      at: roundMm(y.at),
      from: Math.min(left, ...y.spans.map((s) => s[0])),
      to: Math.max(left + moving.width, ...y.spans.map((s) => s[1])),
    });
  }
  return { dx: roundMm(dx), dy: roundMm(dy), guides };
}
