import { describe, expect, it } from 'vitest';
import { computeLayout, type Align } from './layout';
import { cropSegments } from './crop';
import { CROP_ARM } from './style';

const on = (
  insertWidth: number,
  insertHeight: number,
  align: Align = 'topLeft',
  allowRotate = true,
) =>
  computeLayout({
    paperWidth: 210,
    paperHeight: 297,
    insertWidth,
    insertHeight,
    gap: 0,
    printMargin: 0,
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

/** M6 네 장. A4에 딱 맞지 않아 오른쪽과 아래에 자투리가 남는다. */
const m6 = on(80, 125, 'topLeft', false);

/** 칸 사이 간격이 2mm뿐인 배치. 기본 팔 길이(3mm)면 양옆 표시가 겹친다. */
const tightGap = computeLayout({
  paperWidth: 210,
  paperHeight: 297,
  insertWidth: 80,
  insertHeight: 125,
  gap: 2,
  printMargin: 0,
  allowRotate: false,
  align: 'topLeft',
});

/** 마크가 찍힌 자리만 추려낸다. 십자 하나가 선 두 개라 절반만 본다. */
const points = (segs: ReturnType<typeof cropSegments>) => {
  const seen = new Set<string>();
  for (const s of segs) {
    if (s.y1 !== s.y2) continue; // 가로 팔만 세면 교차점당 하나가 된다
    seen.add(`${(s.x1 + s.x2) / 2},${s.y1}`);
  }
  return [...seen].sort();
};

describe('절취선', () => {
  it('여백 없이 A4에 두 장이 들어간다', () => {
    // 이게 안 되면 아래 시험들의 전제가 무너진다
    expect(halfA4.count).toBe(2);
    expect(halfA4.rotated).toBe(true);
  });

  it('자투리가 없으면 가운데 한 줄만 표시한다', () => {
    // 십자 두 개 = 선 네 개. 용지 네 귀퉁이에는 아무것도 그리지 않는다.
    expect(points(cropSegments(halfA4, 210, 297, 'mark'))).toEqual(['0,148.5', '210,148.5']);
  });

  it('용지 끝에 붙은 재단선은 자를 필요가 없으므로 건너뛴다', () => {
    const ys = points(cropSegments(halfA4, 210, 297, 'mark')).map((p) => Number(p.split(',')[1]));
    expect(ys).not.toContain(0);
    expect(ys).not.toContain(297);
  });

  it('규격 A5는 1mm가 남으므로 아래쪽에도 표시한다', () => {
    // 148 × 2 = 296. 좌측 상단에 붙였으므로 자투리 1mm가 전부 아래로 몰린다.
    expect(a5.slots[0].y).toBe(0);
    expect(points(cropSegments(a5, 210, 297, 'mark'))).toEqual([
      '0,148',
      '0,296',
      '210,148',
      '210,296',
    ]);
  });

  it('배치 안쪽에 갇힌 교차점은 그리지 않는다', () => {
    // 재단선 하나는 양 끝 표시 두 개로 자른다. 가운데 표시는 속지에 자국만 남긴다.
    expect(m6.count).toBe(4);
    expect(points(cropSegments(m6, 210, 297, 'mark'))).not.toContain('80,125');
  });

  it('바깥 테두리 표시는 남는다', () => {
    // 오른쪽(160)과 아래(250)는 실제로 잘라내야 하는 자투리 경계다
    const p = points(cropSegments(m6, 210, 297, 'mark'));
    expect(p).toEqual([
      '0,125', '0,250',
      '160,0', '160,125', '160,250',
      '80,0', '80,250',
    ].sort());
  });

  it('안쪽까지 옵션은 갇힌 교차점도 그린다', () => {
    // 프린터가 용지 가장자리를 못 찍으면 바깥 표시가 통째로 사라진다. 그때 쓴다.
    const p = points(cropSegments(m6, 210, 297, 'markAll'));
    expect(p).toContain('80,125');
    expect(p).toHaveLength(8); // 3 × 3 교차점에서 용지 모서리 (0,0) 하나만 빠진다
  });

  it('안쪽까지 옵션에서도 용지 끝은 그리지 않는다', () => {
    // 종이 끝이라 자를 것이 없다는 사실은 옵션과 무관하다
    const p = points(cropSegments(halfA4, 210, 297, 'markAll'));
    expect(p).toEqual(['0,148.5', '210,148.5']);
  });

  it('십자는 교차점을 중심으로 양쪽이 같다', () => {
    const [h, v] = cropSegments(m6, 210, 297, 'mark');
    expect(h.x2 - h.x1).toBeCloseTo(CROP_ARM * 2, 9);
    expect(h.y1).toBeCloseTo(h.y2, 9);
    expect(v.y2 - v.y1).toBeCloseTo(CROP_ARM * 2, 9);
    expect(v.x1).toBeCloseTo(v.x2, 9);
  });

  it('칸 사이 간격이 좁으면 십자 팔이 겹치지 않게 짧아진다', () => {
    // x=80(첫 칸 오른쪽 끝)과 x=82(다음 칸 왼쪽 끝) 사이는 2mm뿐이다.
    // 기본 3mm 팔이면 양쪽에서 뻗은 팔이 겹쳐, 잘라낼 부분(간격)에 끊기지
    // 않는 선 하나가 남는다 — 겹치지 않는 최대 반지름은 간격의 절반(1mm)이다.
    const segs = cropSegments(tightGap, 210, 297, 'mark');
    const h = segs.find((s) => s.y1 === s.y2 && s.y1 === 0 && (s.x1 + s.x2) / 2 === 80);
    expect(h).toBeDefined();
    expect(h!.x2 - h!.x1).toBeCloseTo(2, 9); // 반지름 1mm × 2
  });

  it('간격이 넓으면(0이어도 옆 칸까지 80mm) 기본 팔 길이를 그대로 쓴다', () => {
    const [h] = cropSegments(m6, 210, 297, 'mark');
    expect(h.x2 - h.x1).toBeCloseTo(CROP_ARM * 2, 9);
  });

  it('없음이면 아무것도 그리지 않는다', () => {
    expect(cropSegments(halfA4, 210, 297, 'none')).toHaveLength(0);
  });

  it('재단선 전체는 안쪽 선까지 모두 긋는다', () => {
    // 십자 마크와 달리 여기서는 하나도 빼지 않는다
    const segs = cropSegments(m6, 210, 297, 'line');
    expect(segs).toHaveLength(3 + 3); // 세로 3줄(0·80·160) + 가로 3줄(0·125·250)
  });
});
