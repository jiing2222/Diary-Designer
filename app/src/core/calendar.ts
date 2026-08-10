import {
  CALENDAR_SHOW_ADJACENT,
  CALENDAR_SIZE_SCALE,
  CALENDAR_WEEK_START,
  CALENDAR_WEEKDAY_LANG,
} from './style';
import { anchorX, baselineY } from './text';
import type { CalendarObject, WeekdayLang } from './objects';
import type { Mm } from './units';

/**
 * 월간 달력 오브젝트의 기하 계산.
 *
 * **박스 하나(가로×세로)만 주면 안에 들어갈 모든 글자의 자리와 크기가
 * 정해진다.** 42칸을 손으로 하나씩 놓는 대신, 이미지를 끌어서 키우듯
 * 오브젝트 하나의 크기만 조절하면 안의 글자가 전부 같이 커지고 작아진다.
 *
 * 위에서부터 제목 1줄 · 요일 머리글 1줄 · 날짜 6줄, 총 8줄로 나눈다
 * (설계문서 7장 "월간 달력은 따로 처리한다" — 달마다 칸 개수가 달라 6주
 * 그리드로 고정했다, core/dataset.ts 10a 참고). 실제 날짜 숫자는 이 파일이
 * 모른다 — 어디에 앉는지만 정하고, 무엇을 채울지는 `core/dataset.ts`의
 * `calendarCellAt`이 담당한다.
 */

export const CALENDAR_ROWS = 6;
export const CALENDAR_COLS = 7;
/** 제목 줄 + 요일 머리글 줄 + 날짜 6줄. */
const TOTAL_ROWS = CALENDAR_ROWS + 2;

/** 글자 하나가 앉을 자리. */
export interface CalendarCellPos {
  /** 가로 가운데. */
  cx: Mm;
  /** 밑선(baseline) 세로 좌표. */
  baseline: Mm;
}

export interface CalendarLayout {
  fontSize: Mm;
  title: CalendarCellPos;
  /** 7개, weekdayLabels와 같은 순서(시작 요일부터). */
  weekdays: CalendarCellPos[];
  /** 42개, 그리드 오프셋 0~41 순서(왼쪽 위부터 한 줄씩). */
  days: CalendarCellPos[];
}

/**
 * 박스를 8행 7열로 나누고 각 칸 가운데에 글자를 앉힌다.
 *
 * 글자 크기는 한 줄 높이의 절반에 `sizeScale`(배율, 정하지 않았으면 1)을
 * 곱한 값이다 — 위아래 여백이 남아야 줄끼리 붙어 보이지 않는다. 세로
 * 위치는 core/text의 `baselineY`(한 줄 가운데 정렬)를 그대로 쓴다 — 이
 * 프로그램의 다른 모든 글자와 같은 공식이어야 나중에 나란히 놔도
 * 어색하지 않다.
 */
export function calendarLayout(box: { width: Mm; height: Mm; sizeScale?: number }): CalendarLayout {
  const rowHeight = box.height / TOTAL_ROWS;
  const colWidth = box.width / CALENDAR_COLS;
  const fontSize = (rowHeight / 2) * sizeScaleOf(box);

  const rowBox = (row: number) => ({ y: row * rowHeight, height: rowHeight });
  const baselineOfRow = (row: number) => baselineY(rowBox(row), fontSize, 'middle');
  const cxOfCol = (col: number) => anchorX({ x: col * colWidth, width: colWidth }, 'center');

  const title: CalendarCellPos = { cx: box.width / 2, baseline: baselineOfRow(0) };
  const weekdays: CalendarCellPos[] = Array.from({ length: CALENDAR_COLS }, (_, col) => ({
    cx: cxOfCol(col),
    baseline: baselineOfRow(1),
  }));
  const days: CalendarCellPos[] = Array.from({ length: CALENDAR_ROWS * CALENDAR_COLS }, (_, i) => ({
    cx: cxOfCol(i % CALENDAR_COLS),
    baseline: baselineOfRow(2 + Math.floor(i / CALENDAR_COLS)),
  }));

  return { fontSize, title, weekdays, days };
}

/** 그리드 맨 왼쪽 줄의 요일. 정하지 않았으면 일요일. */
export function weekStartOf(o: CalendarObject): 'sun' | 'mon' {
  return o.weekStart ?? CALENDAR_WEEK_START;
}

/** 이번 달이 아닌 칸에도 날짜를 보여줄지. 정하지 않았으면 보여준다. */
export function showAdjacentOf(o: CalendarObject): boolean {
  return o.showAdjacent ?? CALENDAR_SHOW_ADJACENT;
}

/** 요일 이름 언어. 정하지 않았으면 한글. */
export function weekdayLangOf(o: CalendarObject): WeekdayLang {
  return o.weekdayLang ?? CALENDAR_WEEKDAY_LANG;
}

/** 글자 크기 배율. 정하지 않았으면 1(기본). */
export function sizeScaleOf(o: { sizeScale?: number }): number {
  return o.sizeScale ?? CALENDAR_SIZE_SCALE;
}

const WEEKDAY_NAMES: Record<WeekdayLang, string[]> = {
  // 일요일(0)부터.
  kr: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  // 월요일 시작으로 두면 M T W T F S S — 요일마다 한 글자, 겹치는 글자는
  // 자리로 구분한다(흔히 쓰는 표기).
  'en-short': ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  hanja: ['日', '月', '火', '水', '木', '金', '土'],
};

/** 시작 요일에 맞춰 정렬한 7개 요일 이름. */
export function weekdayLabels(lang: WeekdayLang, weekStart: 'sun' | 'mon'): string[] {
  const names = WEEKDAY_NAMES[lang];
  return weekStart === 'mon' ? [...names.slice(1), names[0]] : names;
}
