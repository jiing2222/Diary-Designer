import type { Mm } from './units';
import { findInsertPreset } from './presets';

/**
 * 핀터레스트 홍보용 핀의 글(미국 대상, 영어). ui/PinStudio가 이미지를 그리고, 여기서는 글만 정한다.
 *
 * 규격 이름은 앱과 같은 미국식 이름(core/presets — ‘DA6’ 대신 ‘Personal’, ‘M6’ 대신 ‘Pocket (M6)’)이다. 보드 이름은 계정 준비 문서에서 만든 8개 중 하나와 글자까지 같아야 한다.
 */

export const PIN_BOARDS = {
  a5: 'A5 Planner Inserts',
  personal: 'Personal Size Planner Inserts',
  pocket: 'Pocket and Mini 6 Planner Inserts',
  weekly: 'Weekly Planner Printables',
  grid: 'Dot Grid and Grid Inserts',
  habit: 'Habit Tracker and To-Do Printables',
  setup: 'Ring Planner Setup Ideas',
  printing: 'Planner Printing Tips',
} as const;

/** 핀 세트의 한 장 — 기본 속지 세트(core/starterSet)의 양식 이름. `title`이 있으면 자동 제목 대신 쓴다. */
export interface PinPage {
  template: string;
  title?: string;
}

/**
 * 홍보용 핀 세트 — 보드마다 작업 하나, 작업마다 다섯 면(= 다섯 핀). 작업 이름이 보드 이름이라
 * Pin Studio가 이름으로 찾아 면마다 양식 이름·보드를 붙인다.
 * 주제 보드는 크기를 섞어 ‘모든 링 규격’을 보여준다. 인쇄 요령 보드는 앱의 강점(실제 크기·구멍 맞춤·양면)을 제목으로.
 */
export const PIN_SET: { board: string; presetId: string; pages: PinPage[] }[] = [
  {
    board: PIN_BOARDS.a5,
    presetId: 'A5',
    pages: ['Weekly Vertical', 'Daily Schedule', 'Monthly Calendar', 'Meal Planner', 'Budget Tracker'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.personal,
    presetId: 'DA6',
    pages: ['Week at a Glance', 'To-Do List', 'Goals', 'Reading Log', 'Gratitude Journal'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.pocket,
    presetId: 'M6',
    pages: ['To-Do List', 'Daily Schedule', 'Lined Notes', 'Habit Tracker', 'Weekly Vertical'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.weekly,
    presetId: 'A5',
    pages: ['Weekly Vertical', 'Weekly Columns', 'Week at a Glance', 'Weekly To-Do', 'Meal Planner'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.grid,
    presetId: 'M6',
    pages: ['Dot Grid', 'Grid Paper', 'Lined Notes', 'Cornell Notes', 'Two-Column Notes'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.habit,
    presetId: 'A5',
    pages: ['Habit Tracker', 'To-Do List', 'Weekly To-Do', 'Cleaning Checklist', 'Goals'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.setup,
    presetId: 'DA6',
    pages: ['Index', 'Monthly Calendar', 'Goals', 'Budget Tracker', 'Reading Log'].map((template) => ({ template })),
  },
  {
    board: PIN_BOARDS.printing,
    presetId: 'A5',
    pages: [
      { template: 'Daily Schedule', title: 'How to Print Planner Inserts at True Size' },
      { template: 'Weekly Vertical', title: 'Planner Inserts with Punch Holes That Line Up' },
      { template: 'Habit Tracker', title: 'Print Double-Sided Planner Pages the Right Way' },
      { template: 'Lined Notes', title: 'A5 6-Ring Planner Hole Spacing Guide' },
      { template: 'Dot Grid', title: 'How to Punch Planner Inserts at Home' },
    ],
  },
];

/** 프리셋 id → 보드. 이름은 앱과 같은 규격 이름(core/presets)을 쓴다 — 핀을 보고 들어온 사람이 앱에서 같은 이름을 보게. */
const SIZE_BOARDS: Record<string, string> = {
  A5: PIN_BOARDS.a5,
  DA6: PIN_BOARDS.personal,
  TA6: PIN_BOARDS.pocket,
  M6: PIN_BOARDS.pocket,
  M5: PIN_BOARDS.pocket,
  DA9: PIN_BOARDS.pocket,
};

/** 인치, 소수 둘째 자리까지(미국은 인치로 검색한다). */
export function inches(mm: Mm): string {
  return String(Math.round((mm / 25.4) * 100) / 100);
}

export interface PinText {
  title: string;
  description: string;
  board: string;
  /** 이미지 아래에 찍는 규격 줄. */
  sizeLine: string;
}

/**
 * 한 면의 핀 글. `page`는 1부터, 한 작업에서 여러 핀이 나올 때 제목이 겹치지 않게 붙인다.
 * 아직 파일을 나눠주지 않으므로 ‘free download’ 같은 말은 쓰지 않는다(계정 준비 문서).
 */
export function pinText(
  diary: { presetId: string; width: Mm; height: Mm; holeCount: number },
  page: number,
  pageCount: number,
  /** 양식 이름(예: 'Weekly Vertical'). 있으면 제목·설명에 넣는다 — 사람들은 양식 이름으로 검색한다. */
  kind?: string,
): PinText {
  const preset = SIZE_BOARDS[diary.presetId] ? findInsertPreset(diary.presetId) : undefined;
  const size = preset?.name ?? `${diary.width} x ${diary.height} mm`;
  const board = SIZE_BOARDS[diary.presetId] ?? PIN_BOARDS.pocket;
  const dims = `${diary.width} x ${diary.height} mm / ${inches(diary.width)} x ${inches(diary.height)} in`;
  const suffix = pageCount > 1 ? ` – Page ${page}` : '';
  // 'Meal Planner'처럼 이미 Planner로 끝나는 양식이면 한 번만 — "Meal Planner Planner Insert"가 되지 않게.
  const what = kind ? (/planner$/i.test(kind) ? `${kind} ` : `${kind} Planner `) : 'Planner ';
  return {
    title: `${size} ${what}Insert${suffix}`,
    description:
      `Printable ${size} ${what.toLowerCase()}insert (${dims}) for ${diary.holeCount}-ring binders. ` +
      'Designed with Rings: a dot grid editor with punch holes that line up and double-sided pages that print the right way around. Launching soon.',
    board,
    sizeLine: `${size} · ${dims}`,
  };
}

/**
 * 제목을 두 줄 안으로 나눈다(단어 단위). `max`자 안이면 한 줄, 넘으면 **두 줄 길이가 가장 비슷한**
 * 자리에서 자른다 — 앞에서부터 채우면 "… Planner / Insert"처럼 한 단어만 떨어졌다.
 */
export function titleLines(title: string, max = 26): string[] {
  if (title.length <= max) return [title];
  const words = title.split(' ');
  let best = [title];
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const len = Math.max(a.length, b.length);
    if (len < bestLen) {
      best = [a, b];
      bestLen = len;
    }
  }
  return best;
}
