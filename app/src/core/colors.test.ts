import { describe, expect, it } from 'vitest';
import {
  addPoint,
  defaultWorkPalette,
  keyOfRef,
  linkExactColors,
  mapColors,
  nextPointKey,
  refOf,
  resolveColor,
  setKeyColor,
} from './colors';

describe('이름표', () => {
  it('색 값과 이름표를 구별한다', () => {
    expect(keyOfRef('@A')).toBe('A');
    expect(keyOfRef('#ff0000')).toBeNull();
    expect(refOf('base3')).toBe('@base3');
  });
});

describe('resolveColor', () => {
  const palette = addPoint(defaultWorkPalette(), '#8ea8c6');

  it('색 값은 그대로', () => {
    expect(resolveColor('#123456', palette, '#000000')).toBe('#123456');
  });

  it('이름표는 팔레트의 지금 색', () => {
    expect(resolveColor('@A', palette, '#000000')).toBe('#8ea8c6');
    expect(resolveColor('@base5', palette, '#ffffff')).toBe('#000000');
  });

  it('A의 색을 바꾸면 A를 쓰는 것이 저절로 바뀐다 (①)', () => {
    const changed = setKeyColor(palette, 'A', '#00ff00');
    expect(resolveColor('@A', changed, '#000000')).toBe('#00ff00');
  });

  it('기본 칸도 색을 바꿀 수 있다', () => {
    const changed = setKeyColor(palette, 'base1', '#eeeeee');
    expect(resolveColor('@base1', changed, '#000000')).toBe('#eeeeee');
  });

  it('없는 칸이면 기본값', () => {
    expect(resolveColor('@Z', palette, '#000000')).toBe('#000000');
  });

  it('값이 없으면 기본값', () => {
    expect(resolveColor(undefined, palette, '#111111')).toBe('#111111');
  });
});

describe('포인트 글자', () => {
  it('A부터 차례로', () => {
    let p = defaultWorkPalette();
    p = addPoint(p, '#1');
    p = addPoint(p, '#2');
    expect(p.points.map((x) => x.key)).toEqual(['A', 'B']);
  });

  it('지운 글자는 다시 쓰지만 남은 글자는 당겨지지 않는다', () => {
    const points = [
      { key: 'B', color: '#2' },
      { key: 'C', color: '#3' },
    ];
    expect(nextPointKey(points)).toBe('A');
  });

  it('Z 다음은 AA', () => {
    const points = Array.from({ length: 26 }, (_, i) => ({ key: String.fromCharCode(65 + i), color: '#0' }));
    expect(nextPointKey(points)).toBe('AA');
  });
});

describe('mapColors — 옮기기·모두 바꾸기', () => {
  const objs = [
    { id: '1', color: '@A' },
    { id: '2', color: '#ff0000', fillColor: '@A' },
    { id: '3' },
  ];

  it('A를 쓰는 것을 B로 (②)', () => {
    const out = mapColors(objs, (v) => (v === '@A' ? '@B' : v));
    expect(out.map((o) => [o.color, (o as { fillColor?: string }).fillColor])).toEqual([
      ['@B', undefined],
      ['#ff0000', '@B'],
      [undefined, undefined],
    ]);
  });

  it('바뀐 게 없으면 같은 객체', () => {
    const out = mapColors(objs, (v) => v);
    expect(out[0]).toBe(objs[0]);
    expect(out[2]).toBe(objs[2]);
  });
});

describe('linkExactColors — 옛 양식 옮기기', () => {
  it('팔레트와 정확히 같은 색에 이름표를 붙인다 (대소문자 무관)', () => {
    const palette = addPoint(defaultWorkPalette(), '#8EA8C6');
    const out = linkExactColors(
      [
        { color: '#8ea8c6' },
        { color: '#000000' },
        { color: '#8ea8c7' },
      ],
      palette,
    );
    expect(out.map((o) => o.color)).toEqual(['@A', '@base5', '#8ea8c7']);
  });
});
