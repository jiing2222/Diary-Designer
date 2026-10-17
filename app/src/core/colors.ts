/**
 * 작업 색상 — 색에 이름표를 붙여 한 번에 바꾼다(리뉴얼, design/리뉴얼/세부계획.md A13).
 *
 * 객체의 색 속성(`color`·`fillColor`)에는 두 가지가 들어갈 수 있다.
 * - 색 값 `#rrggbb` — 직접 고른 색. 그 객체만의 색이다.
 * - 이름표 `@base1`~`@base5`, `@A`·`@B`… — 작업 팔레트의 칸을 가리킨다.
 *
 * 화면·PDF는 그릴 때 `resolveColor`로 이름표를 지금 색으로 바꾼다. 그래서 A의 색을
 * 바꾸면 A를 쓰는 객체를 하나하나 찾지 않아도 전부 바뀐다. 두 뷰가 각자 바꾸면
 * 언젠가 한쪽만 바뀌므로 반드시 이 함수를 거친다(CLAUDE.md, core/line 원칙).
 */

/** 이름표 앞에 붙는 글자. 색 값(`#`)과 겹치지 않는다. */
const REF_PREFIX = '@';

/** 기본 5칸의 이름표. 연한 것부터. */
export const BASE_KEYS = ['base1', 'base2', 'base3', 'base4', 'base5'] as const;
export type BaseKey = (typeof BASE_KEYS)[number];

/** 기본 5칸의 처음 값 — 블랙 계열(지금 앱의 회색 5단계와 같다). */
export const DEFAULT_BASE: Record<BaseKey, string> = {
  base1: '#cfcfcf',
  base2: '#9e9e9e',
  base3: '#6e6e6e',
  base4: '#3a3a3a',
  base5: '#000000',
};

/** 포인트 색 한 칸. `key`는 A·B·C… — 지워도 다른 칸의 글자가 당겨지지 않는다. */
export interface PointColor {
  key: string;
  color: string;
}

export interface WorkPalette {
  base: Record<BaseKey, string>;
  points: PointColor[];
}

export function defaultWorkPalette(): WorkPalette {
  return { base: { ...DEFAULT_BASE }, points: [] };
}

/** 이름표 문자열. `refOf('A')` → `'@A'`. */
export function refOf(key: string): string {
  return REF_PREFIX + key;
}

/** 이름표면 칸 이름(`'A'`, `'base3'`), 색 값이면 null. */
export function keyOfRef(value: string): string | null {
  return value.startsWith(REF_PREFIX) ? value.slice(REF_PREFIX.length) : null;
}

/** 팔레트에서 칸의 지금 색. 없는 칸이면 null. */
export function colorOfKey(palette: WorkPalette, key: string): string | null {
  if ((BASE_KEYS as readonly string[]).includes(key)) return palette.base[key as BaseKey];
  return palette.points.find((p) => p.key === key)?.color ?? null;
}

/**
 * 객체에 적힌 색을 실제 색 값으로.
 *
 * 이름표가 가리키는 칸이 없으면(지운 칸) `fallback`을 쓴다 — 칸을 지울 때 이미
 * 다른 칸이나 고정 색으로 옮기게 하지만(`removePoint`), 옛 파일 등으로 남은
 * 이름표가 그림을 지우면 안 된다.
 */
export function resolveColor(value: string | undefined, palette: WorkPalette, fallback: string): string {
  if (value === undefined) return fallback;
  const key = keyOfRef(value);
  if (key === null) return value;
  return colorOfKey(palette, key) ?? fallback;
}

/** 다음 포인트 글자. 이미 쓴 글자를 피해서 A, B, … Z, AA, AB … */
export function nextPointKey(points: PointColor[]): string {
  const used = new Set(points.map((p) => p.key));
  for (let n = 0; ; n++) {
    const key = pointLabel(n);
    if (!used.has(key)) return key;
  }
}

function pointLabel(n: number): string {
  let s = '';
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

export function addPoint(palette: WorkPalette, color: string): WorkPalette {
  return { ...palette, points: [...palette.points, { key: nextPointKey(palette.points), color }] };
}

/** 칸의 색을 바꾼다(①). 이름표를 쓰는 객체는 손대지 않는다 — 그릴 때 저절로 바뀐다. */
export function setKeyColor(palette: WorkPalette, key: string, color: string): WorkPalette {
  if ((BASE_KEYS as readonly string[]).includes(key)) {
    return { ...palette, base: { ...palette.base, [key]: color } };
  }
  return { ...palette, points: palette.points.map((p) => (p.key === key ? { ...p, color } : p)) };
}

/** 객체에서 색이 들어가는 속성 이름들. 새 색 속성이 생기면 여기에 더한다. */
export const COLOR_PROPS = ['color', 'fillColor'] as const;

type Colored = Partial<Record<(typeof COLOR_PROPS)[number], string>>;

/**
 * 객체들의 색 값을 `map`으로 바꾼다. 바뀐 게 없으면 같은 객체를 그대로 돌려준다.
 *
 * ②(이름표 옮기기)·③(같은 색 모두 바꾸기)·칸 지우기가 모두 이 하나로 된다 —
 * 무엇을 무엇으로 바꿀지만 다르다.
 */
export function mapColors<T extends object>(objects: T[], map: (value: string) => string): T[] {
  return objects.map((o) => {
    const c = o as Colored;
    let next: Colored | null = null;
    for (const prop of COLOR_PROPS) {
      const value = c[prop];
      if (value === undefined) continue;
      const mapped = map(value);
      if (mapped !== value) {
        next ??= { ...c };
        next[prop] = mapped;
      }
    }
    return (next ?? o) as T;
  });
}

/** 같은 색인지 — 대소문자를 가리지 않는다(`#ABCDEF` = `#abcdef`). */
export function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 직접 고른 색 중 팔레트 칸과 정확히 같은 것에 이름표를 붙인다.
 *
 * 옛 양식을 옮길 때 쓴다(core/migrate) — 옛 팔레트(메인·서브)에서 골라 칠한 객체는
 * 색 값만 남아 있어서, 같은 색이면 그 칸에서 고른 것으로 본다. 기본 5칸은
 * 옛 회색 5단계와 값이 같으므로 함께 붙는다. 같은 색인 칸이 여럿이면 앞 칸.
 */
export function linkExactColors<T extends object>(objects: T[], palette: WorkPalette): T[] {
  const slots: { key: string; color: string }[] = [
    ...BASE_KEYS.map((key) => ({ key, color: palette.base[key] })),
    ...palette.points,
  ];
  return mapColors(objects, (value) => {
    if (keyOfRef(value) !== null) return value;
    const slot = slots.find((s) => sameColor(s.color, value));
    return slot ? refOf(slot.key) : value;
  });
}

/**
 * 그리기 직전에 객체들의 이름표를 실제 색으로 바꾼다.
 *
 * 화면(InsertView)과 PDF(pdf/export)는 색 값만 안다. 이름표를 아는 쪽은 여기 하나로
 * 두고, 두 뷰에는 바꾼 결과를 넘긴다 — 두 뷰가 각자 이름표를 풀면 언젠가 어긋난다.
 * 가리키는 칸이 없는 이름표(지운 칸)는 검정으로 그린다.
 */
export function resolveObjectColors<T extends object>(objects: T[], palette: WorkPalette): T[] {
  return mapColors(objects, (value) => {
    const key = keyOfRef(value);
    return key === null ? value : (colorOfKey(palette, key) ?? '#000000');
  });
}

/** 칸 이름을 사람이 읽는 이름으로 — `base3` → `기본 3`, `A` → `A`. `base`는 ‘기본’ 자리의 말(화면 언어). */
export function keyLabel(key: string, base = '기본'): string {
  const i = (BASE_KEYS as readonly string[]).indexOf(key);
  return i >= 0 ? `${base} ${i + 1}` : key;
}
