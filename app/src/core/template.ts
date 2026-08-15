import { boxOf, cloneObject, mirrorObjectX, type DiaryObject } from './objects';
import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import { initHistory, type History } from './history';
import { DEFAULT_PUNCH, type PunchSetting } from './punch';
import { findInsertPreset, INSERT_PRESETS } from './presets';
import type { Dataset } from './dataset';
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
 */
export interface InsertSetting {
  presetId: string;
  width: Mm;
  height: Mm;
  punch: PunchSetting;
}

/**
 * 뒷면.
 *
 * **`null`이면 단면이다.** 앞면(`Template.objects`)은 항상 있지만,
 * 뒷면은 만들어야만 생긴다 — 대부분의 양식은 단면이라 처음부터 빈 뒷면을
 * 들려주면 갤러리·저장 파일이 다 그만큼 무거워진다.
 *
 * 속지 크기(`insert`)는 앞뒤가 공유한다. 뒷면은 같은 종이의 반대쪽일 뿐 다른
 * 크기의 속지가 아니다 — 배치에서 자리만 반전된다(설계문서 8장, "뒷면 칸의
 * x = 용지폭 − 앞면 칸의 x − 속지폭"). 그 반전은 9b(PDF)에서 다룬다.
 *
 * **도트 격자도 앞뒤가 공유한다**(`Template.dotGrid`) — 같은 종이 한 장의
 * 배경 무늬가 앞뒤마다 다를 이유가 없다(구멍·속지 크기와 같은 이유). 격자를
 * 고치면 앞뒤 화면이 나란히 있는 지금 편집 화면에서 둘 다 즉시 바뀐다.
 *
 * **실행취소는(그린 것만) 앞면과 따로 붙는다.** 뒷면을 그리다 ⌘Z를 눌렀는데
 * 앞면 작업이 되돌려지면 무섭다 — 양식끼리 실행취소를 나눈 것과 같은
 * 이유다. 격자는 공유값이라 이 되돌리기 대상이 아니다(고치면 바로 확정).
 */
export interface BackPage {
  objects: History<DiaryObject[]>;
}

/**
 * 반복 인쇄 — 이 양식을 몇 번 찍을지.
 *
 * `single`이면 지금까지처럼 다른 양식과 한 장에 섞일 수 있다(낱장 조합, 5c).
 * `repeat`(만년형)이면 이 양식 **하나로만** 여러 장을 똑같이 채운다 — 개수만
 * 입력받는다. `dataset`(세트형, 8c)이면 자동 필드가 데이터셋에서 순서대로
 * 값을 뽑아 쪽마다 다른 내용으로 채운다.
 *
 * `single`이 아닌 둘은 이 양식 **하나로만** 인쇄한다 — 다른 양식과 섞이지
 * 않는다. 53쪽짜리 위클리와 1쪽짜리 메모를 한 인쇄 작업에 넣을 수 없다는 것이
 * 설계문서 8장의 원칙이라, 양식을 고르면 어느 쪽인지 저절로 정해지고 사용자가
 * 인쇄 모드를 따로 고르지 않는다.
 */
export type RepeatSetting =
  | { mode: 'single' }
  | { mode: 'repeat'; count: number }
  | { mode: 'dataset'; dataset: Dataset };

export const SINGLE_REPEAT: RepeatSetting = { mode: 'single' };

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
  /** 이 양식을 몇 번 찍을지. 기본은 `single`(한 번, 다른 양식과 섞일 수 있음). */
  repeat: RepeatSetting;
  /** 뒷면. 없으면(`null`) 단면이다. */
  back: BackPage | null;
}

let counter = 0;

/**
 * 카운터가 이 id들의 뒤에 붙은 숫자보다 낮으면 그만큼으로 올린다.
 * `core/objects`의 `ensureIdCounterAbove`와 같은 이유 — 저장 파일을
 * 불러온 뒤 새 양식이 파일 속 양식과 같은 id를 받지 않게 한다. 양식
 * id 카운터는 객체 id 카운터와 따로 논다(둘 다 't1' 모양일 수 있지만
 * 서로 다른 것을 가리키는 값이라 겹쳐도 상관없다).
 */
export function ensureTemplateIdCounterAbove(ids: Iterable<string>): void {
  for (const id of ids) {
    const m = id.match(/(\d+)$/);
    if (m) counter = Math.max(counter, Number(m[1]));
  }
}

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
    repeat: SINGLE_REPEAT,
    back: null,
  };
}

/** 이 양식에 뒷면을 만든다. 이미 있으면 아무 일도 하지 않는다. */
export function newBack(): BackPage {
  return { objects: initHistory<DiaryObject[]>([]) };
}

/**
 * 지금 앞면 그린 것을 그대로 뒷면으로 만든다. 이미 뒷면이 있어도 덮어쓴다.
 *
 * 격자는 앞뒤가 공유값이라 따로 옮길 게 없다 — 그린 것만 옮긴다.
 * `duplicateTemplate`이 뒷면을 물려받을 때와 같은 방식으로, 실행취소 이력은
 * 새로 시작한다(앞면에서 쌓아온 되돌리기까지 뒷면이 물려받으면 이상하다).
 *
 * **자리는 좌우로 뒤집는다.** 타공은 뒷면에서 반대쪽에 있다(core/punch의
 * `holeCenterX`) — 그대로 옮기면 타공 옆 여백에 맞춰 그린 그림이 뒷면에서는
 * 타공에서 먼 쪽에 놓여, 종이를 뒤집었을 때 타공과의 거리가 앞뒤가 서로
 * 달라진다. `mirrorObjectX`로 각 객체의 자리를 뒤집어 거리를 지킨다.
 */
export function backFromFront(t: Template): BackPage {
  return {
    objects: initHistory(t.objects.present.map((o) => mirrorObjectX(o, t.insert.width))),
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
    // 반복 설정도 물려받는다. 54장짜리 만년형을 디자인만 바꿔보고 싶을 때
    // 매번 장수를 다시 입력하지 않아도 된다.
    repeat: { ...t.repeat },
    // 뒷면도 그대로 물려받는다(격자는 공유값이라 이미 위에서 물려받았다).
    // 앞면과 마찬가지로 실행취소 이력은 새로 시작한다.
    back: t.back ? { objects: initHistory([...t.back.objects.present]) } : null,
  };
}

/**
 * 이 양식과 그 안의 객체 모두에 새 id를 준다. 다른 파일에서 불러와 지금
 * 프로젝트에 더할 때 쓴다.
 *
 * `newId`(core/objects)의 카운터는 프로그램을 새로 켤 때마다 0부터 다시
 * 시작한다 — 그래서 다른 날 따로 저장한 두 파일은 거의 항상 같은 id를
 * 쓴다. 원래 id를 그대로 두고 더하면 지금 프로젝트에 이미 있는 것과
 * 겹친다(마퀴 선택이 깨졌던 것과 같은 문제). 항상 새로 매기면 이 문제가
 * 아예 생기지 않는다.
 */
export function refreshTemplateIds(t: Template): Template {
  counter += 1;
  return {
    ...t,
    id: `t${counter}`,
    objects: initHistory(t.objects.present.map((o) => cloneObject(o, 0, 0))),
    back: t.back
      ? { objects: initHistory(t.back.objects.present.map((o) => cloneObject(o, 0, 0))) }
      : null,
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

/**
 * 필요한 칸 수를 채우려면 용지가 몇 장 있어야 하는지.
 *
 * `ceil(totalSlots ÷ 한 장의 칸 수)`. 나머지가 남으면 마지막 장은 일부만
 * 채우고 나머지 칸은 비운다(pdf/export의 `SlotContent` 쪽이 실제로 비운다) —
 * 필요 이상으로 속지를 뽑지 않기 위해서다.
 */
export function sheetsNeeded(totalSlots: number, slotsPerSheet: number): number {
  if (slotsPerSheet <= 0 || totalSlots <= 0) return 0;
  return Math.ceil(totalSlots / slotsPerSheet);
}

/**
 * 이 장(0부터 센다)에서 실제로 채울 칸 수. 마지막 장만 모자랄 수 있다.
 *
 * **화면 미리보기와 PDF가 이 함수 하나를 함께 쓴다.** 각자 계산하면 미리보기에서
 * 본 빈 칸이 실제 인쇄물과 어긋날 수 있다 — 이 프로젝트가 이미 여러 번 겪은
 * 종류의 사고다.
 */
export function filledSlots(sheet: number, totalSlots: number, slotsPerSheet: number): number {
  if (slotsPerSheet <= 0) return 0;
  return Math.max(0, Math.min(slotsPerSheet, totalSlots - sheet * slotsPerSheet));
}

/**
 * 용지 한 장이 담을 수 있는 총 칸 수. 양면이면 앞·뒤를 합쳐 두 배다
 * (설계문서 8장, "용지 매수 = ceil(총 쪽수 ÷ (단면이면 S, 양면이면 S × 2))").
 */
export function capacityPerSheet(slotsPerSide: number, duplex: boolean): number {
  return duplex ? slotsPerSide * 2 : slotsPerSide;
}

/**
 * 이 장에서 앞면·뒷면 각각 몇 칸을 채우는지.
 *
 * **앞을 다 채운 뒤에 뒤를 채운다.** 반복 인쇄는 모든 칸의 내용이 완전히
 * 같아서 채우는 순서가 결과에 영향을 주지 않는다 — 그중 가장 이해하기 쉬운
 * 순서를 골랐을 뿐이다. 단면이면 뒤는 언제나 0이다.
 *
 * 화면 미리보기(RepeatPrint)와 PDF(pdf/export)가 함께 쓴다.
 */
export function frontBackFilled(
  sheet: number,
  totalSlots: number,
  slotsPerSide: number,
  duplex: boolean,
): { front: number; back: number } {
  if (!duplex) return { front: filledSlots(sheet, totalSlots, slotsPerSide), back: 0 };
  const filled = filledSlots(sheet, totalSlots, capacityPerSheet(slotsPerSide, true));
  return { front: Math.min(slotsPerSide, filled), back: Math.max(0, filled - slotsPerSide) };
}

/**
 * 겹치기 배치 — 이 장(0부터)·이 칸(0부터)에 들어갈 쪽 번호(0부터). 없으면
 * (범위 밖) `null`.
 *
 * 여러 쪽을 한 용지에 여러 칸씩 뽑으면 자른 뒤 순서가 안 맞는다(설계문서
 * 8장). **칸마다 연속된 구간을 담당하게** 하면, 자른 뒤 그 칸의 무더기를
 * 쌓기만 해도 순서대로 읽힌다 — `칸당 담당 쪽수 = ceil(총 쪽수 ÷ 칸 수)`,
 * `n번째 칸 · m번째 장에 들어갈 쪽 = n × 담당쪽수 + m`.
 *
 * `groupSheets`를 주면 그만큼의 장을 한 무더기로 보고 그 안에서만 이 계산을
 * 적용한다 — 재단기가 한 번에 자를 수 있는 장수가 제한적일 때(예: 10장씩),
 * 무더기별로 나눠 잘라도 각 무더기 안은 이미 순서대로다. 무더기끼리는
 * 원래 순서 그대로 이어지므로, 전부 자른 뒤 무더기 순서대로 쌓으면 처음부터
 * 끝까지 순서대로 완성된다. 정하지 않으면 전체를 한 무더기로 본다.
 */
export function cutStackPage(
  sheet: number,
  slotIndex: number,
  totalPages: number,
  slotsPerSheet: number,
  groupSheets?: number,
): number | null {
  const totalSheets = sheetsNeeded(totalPages, slotsPerSheet);
  const group = Math.max(1, groupSheets ?? totalSheets);
  const groupIndex = Math.floor(sheet / group);
  const sheetInGroup = sheet % group;
  const groupStartSheet = groupIndex * group;
  const groupStartPage = groupStartSheet * slotsPerSheet;
  const sheetsInGroup = Math.min(group, totalSheets - groupStartSheet);
  const pagesInGroup = Math.min(totalPages - groupStartPage, sheetsInGroup * slotsPerSheet);
  if (pagesInGroup <= 0) return null;

  const perSlot = Math.ceil(pagesInGroup / slotsPerSheet);
  const localPage = slotIndex * perSlot + sheetInGroup;
  if (localPage >= pagesInGroup) return null;
  return groupStartPage + localPage;
}
