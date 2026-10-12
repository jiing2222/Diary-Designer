import { newId, type DiaryObject } from './objects';
import type { Lattice } from './grid';
import { ptToMm, type Mm } from './units';

/**
 * 기본 속지 세트 — 홍보용 핀과 첫 사용자를 위한 양식 12종(미국 대상이라 글은 영어).
 *
 * **모든 좌표는 격자점에서 고른다.** 다이어리마다 크기가 달라도 같은 양식이 그 격자에 맞게
 * 나오고, 사용자가 열어서 고칠 때 손으로 그은 선처럼 도트에 딱 붙는다. 칸 수는 격자에 따라
 * 줄거나 늘어난다(작은 속지에선 시간표가 짧아지는 식).
 */

export interface StarterTemplate {
  /** 작업 이름이자 핀 제목에 들어가는 양식 이름(영어). */
  name: string;
  objects: DiaryObject[];
}

const LABEL = ptToMm(8);
const TITLE = ptToMm(12);

interface G {
  xs: Mm[];
  ys: Mm[];
  s: Mm;
  L: Mm;
  R: Mm;
}

const line = (x1: Mm, y1: Mm, x2: Mm, y2: Mm): DiaryObject => ({ id: newId('l'), type: 'line', x1, y1, x2, y2 });
const text = (x: Mm, y: Mm, width: Mm, height: Mm, t: string, title = false): DiaryObject => ({
  id: newId('t'),
  type: 'text',
  x,
  y,
  width,
  height,
  text: t,
  size: title ? TITLE : LABEL,
  ...(title ? { bold: true } : {}),
  valign: 'middle',
});
const check = (x: Mm, y: Mm, s: Mm): DiaryObject => ({ id: newId('cb'), type: 'checkbox', x, y, width: s, height: s });
const box = (x: Mm, y: Mm, width: Mm, height: Mm): DiaryObject => ({ id: newId('sh'), type: 'shape', x, y, width, height });

/** 맨 위 두 줄: 제목 글자와 그 밑줄. 다음 내용이 시작할 줄 번호를 돌려준다. */
function header(g: G, out: DiaryObject[], title: string): number {
  out.push(text(g.L, g.ys[0], g.R - g.L, g.s, title, true), line(g.L, g.ys[1], g.R, g.ys[1]));
  return 2;
}

/** 줄 `from`부터 끝까지 `n`칸으로 나눈 경계 줄 번호들(n+1개). */
function split(g: G, from: number, n: number): number[] {
  const last = g.ys.length - 1;
  return Array.from({ length: n + 1 }, (_, i) => from + Math.round(((last - from) * i) / n));
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const TEMPLATES: { name: string; draw: (g: G, out: DiaryObject[]) => void }[] = [
  {
    name: 'Weekly Vertical',
    draw: (g, out) => {
      const top = header(g, out, 'WEEK OF');
      const b = split(g, top, 7);
      DAYS.forEach((d, i) => {
        out.push(text(g.L, g.ys[b[i]], g.s * 3, g.s, d));
        if (i < 6) out.push(line(g.L, g.ys[b[i + 1]], g.R, g.ys[b[i + 1]]));
      });
    },
  },
  {
    name: 'Daily Schedule',
    draw: (g, out) => {
      const top = header(g, out, 'TODAY');
      const todoRows = 4;
      const hours = Math.max(0, Math.min(16, g.ys.length - 1 - top - todoRows - 1));
      for (let i = 0; i < hours; i++) {
        const y = g.ys[top + i];
        const h = (6 + i) % 12 || 12;
        out.push(text(g.L, y, g.s * 2, g.s, `${h}${6 + i < 12 ? 'a' : 'p'}`), line(g.xs[2], g.ys[top + i + 1], g.R, g.ys[top + i + 1]));
      }
      const t = top + hours + 1;
      out.push(text(g.L, g.ys[t - 1], g.s * 4, g.s, 'TO DO'));
      for (let i = 0; i < todoRows && t + i < g.ys.length - 1; i++) {
        out.push(check(g.L, g.ys[t + i], g.s), line(g.xs[1], g.ys[t + i + 1], g.R, g.ys[t + i + 1]));
      }
    },
  },
  {
    name: 'To-Do List',
    draw: (g, out) => {
      const top = header(g, out, 'TO DO');
      for (let r = top; r < g.ys.length - 1; r++) {
        out.push(check(g.L, g.ys[r], g.s), line(g.xs[1], g.ys[r + 1], g.R, g.ys[r + 1]));
      }
    },
  },
  {
    name: 'Habit Tracker',
    draw: (g, out) => {
      const top = header(g, out, 'HABITS');
      const labelCols = 3;
      const days = Math.min(31, g.xs.length - 1 - labelCols);
      // 아래 끝까지 습관 줄로 채운다(작은 속지면 줄이 적다).
      const rows = g.ys.length - 1 - top - 1;
      const yb = g.ys[top + 1 + rows];
      for (let d = 0; d < days; d++) out.push(text(g.xs[labelCols + d], g.ys[top], g.s, g.s, String(d + 1)));
      out.push(box(g.L, g.ys[top + 1], g.R - g.L, yb - g.ys[top + 1]));
      for (let r = 1; r < rows; r++) out.push(line(g.L, g.ys[top + 1 + r], g.R, g.ys[top + 1 + r]));
      for (let d = 0; d < days; d++) out.push(line(g.xs[labelCols + d], g.ys[top + 1], g.xs[labelCols + d], yb));
    },
  },
  {
    name: 'Monthly Calendar',
    draw: (g, out) => {
      const top = header(g, out, 'MONTH');
      const calEnd = top + Math.round((g.ys.length - 1 - top) * 0.65);
      out.push({
        id: newId('c'),
        type: 'calendar',
        x: g.L,
        y: g.ys[top],
        width: g.R - g.L,
        height: g.ys[calEnd] - g.ys[top],
        weekdayLang: 'en-short',
        // 자동 제목은 "2026년 10월"처럼 한국어로만 나온다 — 미국용이라 숨기고, 위의 MONTH 줄에 손으로 쓰게 한다.
        title: '',
      });
      out.push(text(g.L, g.ys[calEnd + 1], g.s * 4, g.s, 'NOTES'));
      for (let r = calEnd + 2; r < g.ys.length; r++) out.push(line(g.L, g.ys[r], g.R, g.ys[r]));
    },
  },
  {
    name: 'Lined Notes',
    draw: (g, out) => {
      const top = header(g, out, 'NOTES');
      for (let r = top + 1; r < g.ys.length; r++) out.push(line(g.L, g.ys[r], g.R, g.ys[r]));
    },
  },
  {
    name: 'Meal Planner',
    draw: (g, out) => {
      const top = header(g, out, 'MEALS');
      // 요일 이름 두 칸 뒤부터 끝까지를 아침·점심·저녁 세 칸으로.
      const c = [0, 1, 2, 3].map((i) => g.xs[2 + Math.round(((g.xs.length - 3) * i) / 3)]);
      ['B', 'L', 'D'].forEach((m, i) => out.push(text(c[i], g.ys[top], c[i + 1] - c[i], g.s, m)));
      const b = split(g, top + 1, 7);
      DAYS.forEach((d, i) => {
        out.push(text(g.L, g.ys[b[i]], g.s * 2, g.s, d), line(g.L, g.ys[b[i]], g.R, g.ys[b[i]]));
      });
      out.push(line(g.L, g.ys[b[7]], g.R, g.ys[b[7]]));
      for (const x of c.slice(0, 3)) out.push(line(x, g.ys[b[0]], x, g.ys[b[7]]));
    },
  },
  {
    name: 'Budget Tracker',
    draw: (g, out) => {
      const top = header(g, out, 'BUDGET');
      const cols = [g.L, g.xs[Math.min(3, g.xs.length - 1)], g.xs[Math.max(0, g.xs.length - 4)], g.R];
      ['DATE', 'ITEM', 'AMOUNT'].forEach((h, i) => out.push(text(cols[i], g.ys[top], cols[i + 1] - cols[i], g.s, h)));
      for (let r = top + 1; r < g.ys.length; r++) out.push(line(g.L, g.ys[r], g.R, g.ys[r]));
      for (const x of cols.slice(1, 3)) out.push(line(x, g.ys[top], x, g.ys[g.ys.length - 1]));
    },
  },
  {
    name: 'Goals',
    draw: (g, out) => {
      const top = header(g, out, 'GOALS');
      const b = split(g, top, 3);
      for (let i = 0; i < 3; i++) {
        const y0 = b[i];
        const y1 = b[i + 1] - (i < 2 ? 1 : 0);
        out.push(box(g.L, g.ys[y0], g.R - g.L, g.ys[y1] - g.ys[y0]), text(g.xs[1], g.ys[y0], g.s * 4, g.s, `GOAL ${i + 1}`));
        for (let k = 1; k <= 3 && y0 + k + 1 <= y1; k++) {
          const r = y0 + k;
          out.push(check(g.xs[1], g.ys[r], g.s), line(g.xs[2], g.ys[r + 1], g.xs[g.xs.length - 2], g.ys[r + 1]));
        }
      }
    },
  },
  {
    name: 'Reading Log',
    draw: (g, out) => {
      const top = header(g, out, 'READING LOG');
      const cols = [g.L, g.xs[Math.round((g.xs.length - 1) * 0.55)], g.xs[Math.max(0, g.xs.length - 3)], g.R];
      ['TITLE', 'AUTHOR', 'RATING'].forEach((h, i) => out.push(text(cols[i], g.ys[top], cols[i + 1] - cols[i], g.s, h)));
      for (let r = top + 1; r < g.ys.length; r++) out.push(line(g.L, g.ys[r], g.R, g.ys[r]));
      for (const x of cols.slice(1, 3)) out.push(line(x, g.ys[top], x, g.ys[g.ys.length - 1]));
    },
  },
  {
    name: 'Gratitude Journal',
    draw: (g, out) => {
      const top = header(g, out, 'GRATITUDE');
      const b = split(g, top, 3);
      for (let i = 0; i < 3; i++) {
        out.push(text(g.L, g.ys[b[i]], g.s * 4, g.s, 'DATE'), line(g.xs[3], g.ys[b[i] + 1], g.R, g.ys[b[i] + 1]));
        for (let r = b[i] + 2; r <= b[i + 1] - 1 && r < g.ys.length; r++) out.push(line(g.L, g.ys[r], g.R, g.ys[r]));
      }
    },
  },
  {
    name: 'Week at a Glance',
    draw: (g, out) => {
      const top = header(g, out, 'THIS WEEK');
      const mid = g.xs[Math.round((g.xs.length - 1) / 2)];
      const b = split(g, top, 4);
      const names = [...DAYS, 'NOTES'];
      for (let i = 0; i < 4; i++) {
        const y0 = g.ys[b[i]];
        const y1 = g.ys[b[i + 1]];
        out.push(box(g.L, y0, mid - g.L, y1 - y0), box(mid, y0, g.R - mid, y1 - y0));
        out.push(text(g.L + g.s / 2, y0, g.s * 3, g.s, names[i * 2]), text(mid + g.s / 2, y0, g.s * 3, g.s, names[i * 2 + 1]));
      }
    },
  },
];

/** 이 격자에 맞춘 기본 세트. 격자가 너무 작아(가로·세로 6점 미만) 그릴 수 없으면 빈 목록. */
export function starterSet(lattice: Pick<Lattice, 'xs' | 'ys'>): StarterTemplate[] {
  const { xs, ys } = lattice;
  if (xs.length < 6 || ys.length < 6) return [];
  const g: G = { xs, ys, s: xs[1] - xs[0], L: xs[0], R: xs[xs.length - 1] };
  return TEMPLATES.map((t) => {
    const out: DiaryObject[] = [];
    t.draw(g, out);
    return { name: t.name, objects: out };
  });
}
