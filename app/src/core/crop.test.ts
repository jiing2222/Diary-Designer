import { describe, expect, it } from 'vitest';
import { computeLayout, type Align } from './layout';
import { cropSegments, type Segment } from './crop';
import { CROP_MARK_GAP, CROP_MARK_LENGTH } from './style';

const on = (
  insertWidth: number,
  insertHeight: number,
  align: Align = 'topLeft',
  allowRotate = true,
  gap = 0,
  printMargin = 0,
) =>
  computeLayout({
    paperWidth: 210,
    paperHeight: 297,
    insertWidth,
    insertHeight,
    gap,
    printMargin,
    allowRotate,
    align,
  });

/**
 * A4를 정확히 반으로 가른 크기. 남는 자투리가 없다.
 *
 * ISO A5는 148mm지만 297의 절반은 148.5mm다. 규격이 반올림된 값이라
 * 148로 두면 1mm가 남는다.
 */
const halfA4 = on(148.5, 210);

/** 규격 그대로의 A5. 1mm가 남는다. */
const a5 = on(148, 210);

/** M6 네 장. A4에 딱 맞지 않아 오른쪽과 아래에 자투리가 남는다. 간격 없음. */
const m6 = on(80, 125, 'topLeft', false);

/** 여백(printMargin) 10mm를 준 M6 한 장짜리 — 바깥 모서리 둘레에 진짜 여백이 있다. */
const withMargin = on(80, 125, 'topLeft', false, 0, 10);

/** 칸 사이 간격이 2mm뿐인 배치 — GAP(1mm)의 절반씩도 못 낼 만큼 좁다. */
const tightGap = on(80, 125, 'topLeft', false, 2);

/** 칸 사이 간격이 4mm인 배치 — 절반(2mm)에서 GAP(1mm)를 뺀 1mm만큼만 그을 수 있다. */
const modestGap = on(80, 125, 'topLeft', false, 4);

/**
 * 이 좌표(모서리)에서 나가는 **평소 표시**(모서리에서 GAP만큼 띄운 것)를
 * {left,right,up,down: 길이}로 정리한다. 안쪽 끝(모서리에 더 가까운 쪽)이
 * "모서리 ± GAP"과 맞아야 그 방향으로 잡는다 — 예외 표시(모서리에 바로
 * 붙은 것, 아래 `fallbackAt` 참고)는 여기 안 걸린다.
 */
function marksAt(segs: Segment[], cx: number, cy: number) {
  const out = { left: 0, right: 0, up: 0, down: 0 };
  const closeTo = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  for (const s of segs) {
    if (closeTo(s.y1, cy) && closeTo(s.y2, cy)) {
      const [near, far] = Math.abs(s.x1 - cx) < Math.abs(s.x2 - cx) ? [s.x1, s.x2] : [s.x2, s.x1];
      if (closeTo(near, cx - CROP_MARK_GAP)) out.left = Math.abs(far - near);
      if (closeTo(near, cx + CROP_MARK_GAP)) out.right = Math.abs(far - near);
    }
    if (closeTo(s.x1, cx) && closeTo(s.x2, cx)) {
      const [near, far] = Math.abs(s.y1 - cy) < Math.abs(s.y2 - cy) ? [s.y1, s.y2] : [s.y2, s.y1];
      if (closeTo(near, cy - CROP_MARK_GAP)) out.up = Math.abs(far - near);
      if (closeTo(near, cy + CROP_MARK_GAP)) out.down = Math.abs(far - near);
    }
  }
  return out;
}

/**
 * 이 좌표(모서리)에서 나가는 **예외 표시**(속지가 용지 가장자리에 딱
 * 붙어, 그 방향에 종이 자체가 없을 때 GAP 없이 안쪽·내용 쪽으로 나가는
 * 것)를 {noLeftPaper,noRightPaper,noTopPaper,noBottomPaper: 길이}로
 * 정리한다. 키 이름은 "이 방향에 종이가 없어서" 나온 표시라는 뜻이다 —
 * 그래서 noLeftPaper는 실제로는 오른쪽(내용 쪽)으로 뻗은 표시를 가리킨다.
 */
function fallbackAt(segs: Segment[], cx: number, cy: number) {
  const out = { noLeftPaper: 0, noRightPaper: 0, noTopPaper: 0, noBottomPaper: 0 };
  const closeTo = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  for (const s of segs) {
    const atStart = closeTo(s.x1, cx) && closeTo(s.y1, cy);
    const atEnd = closeTo(s.x2, cx) && closeTo(s.y2, cy);
    if (!atStart && !atEnd) continue;
    const [ox, oy] = atStart ? [s.x2, s.y2] : [s.x1, s.y1];
    if (closeTo(oy, cy) && ox > cx) out.noLeftPaper = ox - cx;
    if (closeTo(oy, cy) && ox < cx) out.noRightPaper = cx - ox;
    if (closeTo(ox, cx) && oy > cy) out.noTopPaper = oy - cy;
    if (closeTo(ox, cx) && oy < cy) out.noBottomPaper = cy - oy;
  }
  return out;
}

describe('절취선', () => {
  it('여백 없이 A4에 두 장이 들어간다', () => {
    // 이게 안 되면 아래 시험들의 전제가 무너진다
    expect(halfA4.count).toBe(2);
    expect(halfA4.rotated).toBe(true);
  });

  it('자투리가 없으면 가운데 경계에 예외 표시가 있고, 용지 네 귀퉁이는 비어 있다', () => {
    // 두 칸이 위아래로 붙어 있다(회전 배치라 폭 210mm짜리가 한 칸씩) — 가운데
    // 경계(y=148.5)의 양 끝은 용지 가장자리(x=0·210)에 딱 붙어 있어 바깥으로
    // 낼 여백이 없다 — 예외로 안쪽(내용 쪽)에 표시가 나온다.
    const segs = cropSegments(halfA4, 210, 297, 'mark');
    expect(fallbackAt(segs, 0, 148.5).noLeftPaper).toBeGreaterThan(0);
    expect(fallbackAt(segs, 210, 148.5).noRightPaper).toBeGreaterThan(0);
    // 용지 귀퉁이(0,0)·(210,0)·(0,297)·(210,297)에는 아무 표시도 없다(용지 끝은 자를 게 없다).
    for (const [x, y] of [[0, 0], [210, 0], [0, 297], [210, 297]] as const) {
      const m = marksAt(segs, x, y);
      const f = fallbackAt(segs, x, y);
      expect(m.left + m.right + m.up + m.down).toBe(0);
      expect(f.noLeftPaper + f.noRightPaper + f.noTopPaper + f.noBottomPaper).toBe(0);
    }
  });

  it('규격 A5는 1mm가 남으므로 아래쪽 경계에도 예외 표시가 있다', () => {
    // 148 × 2 = 296. 좌측 상단에 붙였으므로 자투리 1mm가 전부 아래로 몰린다.
    // 폭(148)이 용지 폭(210)보다 좁지만 정렬이 좌측 상단이라 x=0은 여전히
    // 용지 가장자리에 딱 붙어 있다 — 왼쪽은 예외 표시가 나온다.
    expect(a5.slots[0].y).toBe(0);
    const segs = cropSegments(a5, 210, 297, 'mark');
    expect(fallbackAt(segs, 0, 148).noLeftPaper).toBeGreaterThan(0);
    expect(fallbackAt(segs, 0, 296).noLeftPaper).toBeGreaterThan(0);
  });

  it('예외 — 속지가 용지 왼쪽 가장자리에 딱 붙으면, 잘라낼 기준이 있도록 안쪽에 짧게 표시한다', () => {
    // (0,125)는 왼쪽 두 칸(위·아래)의 왼쪽 경계다. m6는 여백 없이 좌측
    // 상단에 붙어 있어 왼쪽엔 용지 자체가 없다 — "표시가 아예 없으면
    // 어디서 잘라야 할지 모른다"는 사용자 요청대로, 원칙(내용을 침범하지
    // 않는다)의 예외로 오른쪽(내용 쪽)에 CROP_MARK_LENGTH만큼 표시를 낸다.
    const segs = cropSegments(m6, 210, 297, 'mark');
    expect(fallbackAt(segs, 0, 125).noLeftPaper).toBeCloseTo(CROP_MARK_LENGTH, 9);
  });

  it('배치 안쪽에 갇힌 교차점(사방이 다 내용)은 그리지 않는다', () => {
    // 재단선 하나는 양 끝 표시 두 개로 충분하다. 게다가 사방이 다른 칸의
    // 내용이면 어느 방향으로도 내용을 안 건드리고 그을 자리가 없다.
    expect(m6.count).toBe(4);
    const m = marksAt(cropSegments(m6, 210, 297, 'mark'), 80, 125);
    expect(m).toEqual({ left: 0, right: 0, up: 0, down: 0 });
  });

  it('바깥 테두리 모서리 — 좌우는 내용이 막아 아무것도 없고, 위쪽은 용지 자체가 없어 예외 표시', () => {
    // (80,0)은 두 칸(왼쪽·오른쪽)의 위쪽 경계다 — 좌우는 내용이 막고, 위쪽은
    // m6가 여백(printMargin) 없이 좌측 상단으로 붙어 있어 용지 자체가 없다
    // — 평소 표시(marksAt) 대신 예외 표시(fallbackAt)로 나온다.
    const segs = cropSegments(m6, 210, 297, 'mark');
    const m = marksAt(segs, 80, 0);
    const f = fallbackAt(segs, 80, 0);
    expect(m).toEqual({ left: 0, right: 0, up: 0, down: 0 });
    expect(f.noTopPaper).toBeCloseTo(CROP_MARK_LENGTH, 9);
    expect(f.noLeftPaper + f.noRightPaper + f.noBottomPaper).toBe(0);
  });

  it('진짜 여백이 있으면(printMargin) 모서리에서 두 방향(바깥쪽)으로만 표시가 나온다', () => {
    // 왼쪽 위 모서리는 왼쪽·위가 여백이고 오른쪽·아래가 이 칸의 내용이다.
    const m = marksAt(cropSegments(withMargin, 210, 297, 'mark'), 10, 10);
    expect(m.left).toBeCloseTo(CROP_MARK_LENGTH, 9);
    expect(m.up).toBeCloseTo(CROP_MARK_LENGTH, 9);
    expect(m.right).toBe(0);
    expect(m.down).toBe(0);
  });

  it('표시는 모서리에 바로 붙지 않는다 — GAP만큼 떨어진 자리에서 시작한다', () => {
    const segs = cropSegments(withMargin, 210, 297, 'mark');
    const leftSeg = segs.find((s) => s.y1 === 10 && s.y2 === 10);
    expect(leftSeg).toBeDefined();
    // 모서리(10)에 가장 가까운 끝이 10 - GAP이어야 한다. 10 자체는 아니다.
    const nearEnd = Math.max(leftSeg!.x1, leftSeg!.x2);
    expect(nearEnd).toBeCloseTo(10 - CROP_MARK_GAP, 9);
  });

  it('안쪽까지 옵션 — 바깥 테두리는 mark와 완전히 똑같이(예외 표시 포함) 찍는다', () => {
    // (80,0)은 바깥 테두리(용지 위쪽 끝)다 — mark·markAll이 똑같이
    // 그려야 한다. 평소 표시도, 용지가 없어 나오는 예외 표시도 마찬가지다.
    const markSegs = cropSegments(m6, 210, 297, 'mark');
    const allSegs = cropSegments(m6, 210, 297, 'markAll');
    expect(marksAt(allSegs, 80, 0)).toEqual(marksAt(markSegs, 80, 0));
    expect(fallbackAt(allSegs, 80, 0)).toEqual(fallbackAt(markSegs, 80, 0));
    expect(fallbackAt(allSegs, 80, 0).noTopPaper).toBeCloseTo(CROP_MARK_LENGTH, 9);
  });

  it('안쪽까지 옵션 — 사방이 다 내용인 갇힌 교차점은 원래 모양(모서리에 걸친 십자)으로 찍는다', () => {
    // mark는 사방이 내용인 안쪽 교차점을 아예 건너뛴다.
    expect(marksAt(cropSegments(m6, 210, 297, 'mark'), 80, 125)).toEqual({
      left: 0, right: 0, up: 0, down: 0,
    });

    // markAll은 프린터가 가장자리를 못 찍을 때를 대비한 것이라, 이런
    // 갇힌 자리는 늘 뭔가 보이는 옛 방식(모서리 걸친 십자)을 쓴다 —
    // 속지 내용을 살짝 덮는 것은 감수한다. gap-오프셋 방식이 아니므로
    // marksAt으로는 안 잡히고, 십자 자체(교차점을 중심으로 좌우·상하가
    // 같은 길이)로 확인한다.
    const segs = cropSegments(m6, 210, 297, 'markAll');
    const h = segs.find((s) => s.y1 === 125 && s.y2 === 125 && (s.x1 + s.x2) / 2 === 80)!;
    const v = segs.find((s) => s.x1 === 80 && s.x2 === 80 && (s.y1 + s.y2) / 2 === 125)!;
    expect(h.x1).toBeCloseTo(80 - (h.x2 - 80), 9); // 80을 중심으로 좌우 대칭
    expect(v.y1).toBeCloseTo(125 - (v.y2 - 125), 9); // 125를 중심으로 상하 대칭
  });

  it('안쪽까지 옵션에서도 용지 끝은 그리지 않는다', () => {
    // 종이 끝이라 자를 것이 없다는 사실은 옵션과 무관하다
    const segs = cropSegments(halfA4, 210, 297, 'markAll');
    const m = marksAt(segs, 0, 0);
    expect(m.left + m.right + m.up + m.down).toBe(0);
  });

  it('칸 사이 간격이 넉넉하면(4mm) 절반(2mm)에서 GAP(1mm)를 뺀 만큼만 긋는다', () => {
    // 80(첫 칸 오른쪽 끝)과 84(다음 칸 왼쪽 끝) 사이는 4mm — 양쪽이 절반씩
    // (2mm)을 나눠 갖고, 그중 1mm는 GAP이라 실제로 그을 길이는 1mm뿐이다.
    const segs = cropSegments(modestGap, 210, 297, 'mark');
    const m = marksAt(segs, 80, 0);
    expect(m.right).toBeCloseTo(1, 9); // min(4, 4/2 - 1) = 1
    expect(m.right).toBeLessThan(CROP_MARK_LENGTH);
  });

  it('칸 사이 간격이 아주 좁으면(2mm) 그 방향은 GAP조차 못 내 생략하고, 위쪽은 용지가 없어 예외 표시', () => {
    // 2mm 간격(오른쪽 칸까지)이면 양쪽이 절반씩(1mm)을 나눠 갖는데, 그게
    // GAP 자체와 같아 실제로 그을 길이가 0이다 — 그 방향은 그냥 생략한다.
    // 위쪽은 간격과 무관하게 용지 자체가 없는 방향이라 예외 표시가 나온다.
    const segs = cropSegments(tightGap, 210, 297, 'mark');
    const m = marksAt(segs, 80, 0);
    const f = fallbackAt(segs, 80, 0);
    expect(m).toEqual({ left: 0, right: 0, up: 0, down: 0 });
    expect(f.noTopPaper).toBeCloseTo(CROP_MARK_LENGTH, 9);
  });

  it('평소 표시는 어느 칸의 내용도 침범하지 않는다 (모서리에 딱 붙는 예외 표시는 별도 시험)', () => {
    // 모든 표시 구간이, 그 축 위에서 어느 칸의 내용 범위 "안쪽"과도 안
    // 겹치는지 직접 확인한다(직접 계산한 openDistance에 기대지 않고, 실제
    // 칸 사각형과 좌표를 비교한다). 예외 표시(용지 가장자리에 딱 붙어
    // 안쪽으로 나가는 것)는 항상 칸의 "경계"에서 시작해 칸 경계 자체는
    // 침범 판정(strictly 안쪽)에 안 걸린다 — 그 표시가 실제로 내용을
    // 살짝 덮는다는 사실 자체는 위의 "예외" 시험들에서 이미 확인했다.
    for (const layout of [m6, withMargin, tightGap, modestGap]) {
      const segs = cropSegments(layout, 210, 297, 'mark');
      for (const s of segs) {
        for (const slot of layout.slots) {
          const insideX = (x: number) => x > slot.x + 1e-6 && x < slot.x + slot.width - 1e-6;
          const insideY = (y: number) => y > slot.y + 1e-6 && y < slot.y + slot.height - 1e-6;
          if (s.y1 === s.y2) {
            // 가로 구간 — y가 칸 세로 범위 "안쪽"이면, x 구간이 칸의 가로
            // 범위와 겹치면 안 된다.
            if (insideY(s.y1)) {
              const lo = Math.min(s.x1, s.x2);
              const hi = Math.max(s.x1, s.x2);
              const overlap = lo < slot.x + slot.width - 1e-6 && hi > slot.x + 1e-6;
              expect(overlap).toBe(false);
            }
          } else {
            if (insideX(s.x1)) {
              const lo = Math.min(s.y1, s.y2);
              const hi = Math.max(s.y1, s.y2);
              const overlap = lo < slot.y + slot.height - 1e-6 && hi > slot.y + 1e-6;
              expect(overlap).toBe(false);
            }
          }
        }
      }
    }
  });

  it('없음이면 아무것도 그리지 않는다', () => {
    expect(cropSegments(halfA4, 210, 297, 'none')).toHaveLength(0);
  });

  it('재단선 전체는 안쪽 선까지 모두 긋는다', () => {
    // 표시(mark)와 달리 여기서는 하나도 빼지 않는다
    const segs = cropSegments(m6, 210, 297, 'line');
    expect(segs).toHaveLength(3 + 3); // 세로 3줄(0·80·160) + 가로 3줄(0·125·250)
  });
});
