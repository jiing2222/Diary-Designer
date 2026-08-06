import { boxOf, type DiaryObject } from './objects';
import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import { initHistory, type History } from './history';
import { DEFAULT_PUNCH, type PunchSetting } from './punch';
import { findInsertPreset, INSERT_PRESETS } from './presets';
import type { Mm } from './units';

/**
 * 양식 — 속지 한 장의 디자인.
 *
 * **양식은 용지를 전혀 모른다.** 어떤 용지에 몇 개씩 배치될지는 인쇄할 때 정해진다.
 * 그래서 양식이 아는 것은 자기 속지 규격 하나뿐이다(설계문서 3장).
 *
 * `위클리1`도 `데일리1`도 M6일 수 있다. 크기가 양식을 소유하는 것이 아니라
 * **양식이 크기를 속성으로 가진다.** 갤러리에서 크기별로 묶어 보여주는 것은
 * 그 속성으로 줄을 세우는 것뿐이다.
 *
 * 뒷면(설계문서의 `Template.back`)은 아직 없다. 양면 인쇄는 한참 뒤의 일이고,
 * 지금 넣으면 화면만 복잡해진다. 저장 파일에 판 번호를 박아두므로 나중에 생겨도
 * 옛 파일은 `뒷면 없음 = 단면`으로 읽으면 된다.
 */
export interface InsertSetting {
  presetId: string;
  width: Mm;
  height: Mm;
  punch: PunchSetting;
}

export interface Template {
  id: string;
  name: string;
  insert: InsertSetting;
  /** 이 양식에 깔리는 격자. 양식마다 다를 수 있다. */
  dotGrid: DotGrid;
  /**
   * 그린 것들. **실행취소가 양식마다 따로 붙는다.**
   *
   * 양식을 바꿨다가 ⌘Z를 눌렀는데 다른 양식의 작업이 되돌려지면 무섭다.
   */
  objects: History<DiaryObject[]>;
}

let counter = 0;

/** 규격 프리셋에서 속지 설정을 만든다. 없는 id면 지금 값을 그대로 둔다. */
export function insertFromPreset(id: string, base?: InsertSetting): InsertSetting {
  const preset = findInsertPreset(id);
  if (!preset) return base ? { ...base, presetId: id } : defaultInsert();
  return {
    presetId: id,
    width: preset.width,
    height: preset.height,
    punch: {
      ...(base?.punch ?? DEFAULT_PUNCH),
      holeCount: preset.holeCount,
      groupGap: preset.groupGap,
      markSize: preset.markSize,
    },
  };
}

export function defaultInsert(): InsertSetting {
  return insertFromPreset(INSERT_PRESETS.find((p) => p.id === 'M6') ? 'M6' : INSERT_PRESETS[0].id);
}

/** 빈 양식 하나. 규격을 주지 않으면 기본 규격이다. */
export function newTemplate(name: string, insert: InsertSetting = defaultInsert()): Template {
  counter += 1;
  return {
    id: `t${counter}`,
    name,
    insert,
    dotGrid: { ...DEFAULT_DOT_GRID },
    objects: initHistory<DiaryObject[]>([]),
  };
}

/**
 * 양식을 복제한다. 규격을 바꿔 복제할 수도 있다.
 *
 * **원본은 손대지 않는다.** 80×125로 만든 것을 75×125로도 뽑고 싶을 때, 원본을
 * 고치는 대신 사본을 만든다. 실패해도 잃는 것이 없다.
 *
 * 규격이 바뀌어도 **격자 간격도 글자 크기도 선 굵기도 변하지 않는다.** 비례로
 * 줄이면 5mm 격자가 4.69mm가 되어 격자의 의미가 사라진다. 좌표는 그대로 두고,
 * 새 크기 밖으로 나가는 것이 있으면 `outsideCount`로 세어 미리 알려준다.
 */
export function duplicateTemplate(t: Template, name: string, insert?: InsertSetting): Template {
  counter += 1;
  return {
    id: `t${counter}`,
    name,
    insert: insert ?? { ...t.insert, punch: { ...t.insert.punch } },
    dotGrid: { ...t.dotGrid },
    // 실행취소 이력은 물려주지 않는다. 사본은 지금 모습에서 새로 시작한다.
    objects: initHistory([...t.objects.present]),
  };
}

/**
 * 이 규격 밖으로 나가는 객체 수.
 *
 * 지우지도 옮기지도 않는다. 화면과 PDF 모두 속지 밖을 이미 잘라내고 있으므로
 * 동작은 안전하다. 몰라서 놀라는 것만 막으면 된다.
 *
 * 조금이라도 걸치면 센다. 오른쪽 끝이 1mm 잘리는 것도 사용자는 알고 싶어 한다.
 */
export function outsideCount(objects: DiaryObject[], insert: { width: Mm; height: Mm }): number {
  return objects.filter((o) => {
    const b = boxOf(o);
    return b.x < 0 || b.y < 0 || b.x + b.width > insert.width || b.y + b.height > insert.height;
  }).length;
}

/** 규격이 같은가. 갤러리에서 묶고, 인쇄에서 섞을 수 있는지 가른다. */
export function sameSize(a: { width: Mm; height: Mm }, b: { width: Mm; height: Mm }): boolean {
  return a.width === b.width && a.height === b.height;
}

export interface SizeGroup {
  /** `M6 · 80 × 125mm`처럼 사람이 읽는 이름 */
  label: string;
  width: Mm;
  height: Mm;
  templates: Template[];
}

/**
 * 크기별로 묶는다. **양식이 처음 나타난 순서를 지킨다.**
 *
 * 이름순으로 정렬하지 않는다. 방금 만든 것이 목록 어딘가로 사라지면 찾기 어렵다.
 */
export function groupBySize(templates: Template[]): SizeGroup[] {
  const groups: SizeGroup[] = [];
  for (const t of templates) {
    const found = groups.find((g) => sameSize(g, t.insert));
    if (found) {
      found.templates.push(t);
      continue;
    }
    groups.push({
      label: sizeLabel(t.insert),
      width: t.insert.width,
      height: t.insert.height,
      templates: [t],
    });
  }
  return groups;
}

/** `M6 · 80 × 125mm`. 프리셋과 크기가 맞으면 그 이름을 앞에 붙인다. */
export function sizeLabel(insert: { presetId: string; width: Mm; height: Mm }): string {
  const size = `${insert.width} × ${insert.height}mm`;
  const preset = findInsertPreset(insert.presetId);
  // presetId가 남아 있어도 크기를 손으로 고쳤으면 그 이름을 쓰면 안 된다.
  const named = preset && sameSize(preset, insert);
  return named ? `${preset.name} · ${size}` : size;
}

/**
 * 겹치지 않는 새 이름.
 *
 * 복제할 때는 `위클리1 사본`처럼 바탕을 준다. 이미 있으면 뒤에 번호를 붙인다.
 */
export function uniqueName(templates: Template[], base: string): string {
  const taken = new Set(templates.map((t) => t.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * 규격에서 뽑은 기본 이름. `M6-1`, `M5-2`처럼 붙는다.
 *
 * **규격마다 따로 센다.** 양식이 늘어나면 이름만 보고도 어느 속지용인지 알아야
 * 한다. `양식 1`·`양식 2`로는 목록에서 M6와 A5를 구분할 수 없다.
 *
 * 크기를 손으로 고쳤으면 프리셋 이름 대신 치수를 쓴다(`80x127-1`) — presetId가
 * 남아 있어도 치수가 다르면 그 이름은 거짓이다.
 */
export function defaultName(templates: Template[], insert: InsertSetting): string {
  const preset = findInsertPreset(insert.presetId);
  const prefix =
    preset && sameSize(preset, insert) ? preset.id : `${insert.width}x${insert.height}`;

  // 같은 앞자리를 쓰는 것 중 가장 큰 번호 다음. 중간을 지워도 번호가 겹치지 않는다.
  let max = 0;
  for (const t of templates) {
    const m = t.name.match(/^(.+)-(\d+)$/);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${max + 1}`;
}
