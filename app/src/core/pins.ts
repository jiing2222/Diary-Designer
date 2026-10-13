import type { Mm } from './units';

/**
 * 핀터레스트 홍보용 핀의 글(미국 대상, 영어). ui/PinStudio가 이미지를 그리고, 여기서는 글만 정한다.
 *
 * 규격 이름은 미국 플래너 커뮤니티가 검색하는 말로 바꾼다 — 한국에서 쓰는 ‘M6’ 대신 ‘Pocket’,
 * ‘DA6’ 대신 ‘Personal’. 보드 이름은 계정 준비 문서에서 만든 8개 중 하나와 글자까지 같아야 한다.
 */

export const PIN_BOARDS = {
  a5: 'A5 Planner Inserts',
  personal: 'Personal Size Planner Inserts',
  pocket: 'Pocket and Mini 6 Planner Inserts',
} as const;

/** 프리셋 id → 미국에서 부르는 이름과 보드. 모르는 규격은 크기 그대로 부른다. */
const SIZE_NAMES: Record<string, { name: string; board: string }> = {
  A5: { name: 'A5', board: PIN_BOARDS.a5 },
  DA6: { name: 'Personal', board: PIN_BOARDS.personal },
  TA6: { name: 'A6', board: PIN_BOARDS.pocket },
  M6: { name: 'Pocket (Mini 6)', board: PIN_BOARDS.pocket },
  M5: { name: 'Mini 5', board: PIN_BOARDS.pocket },
  DA9: { name: 'Micro', board: PIN_BOARDS.pocket },
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
  const known = SIZE_NAMES[diary.presetId];
  const size = known?.name ?? `${diary.width} x ${diary.height} mm`;
  const board = known?.board ?? PIN_BOARDS.pocket;
  const dims = `${diary.width} x ${diary.height} mm / ${inches(diary.width)} x ${inches(diary.height)} in`;
  const suffix = pageCount > 1 ? ` – Page ${page}` : '';
  const what = kind ? `${kind} ` : '';
  return {
    title: `${size} ${what}Planner Insert${suffix}`,
    description:
      `Printable ${size} ${what.toLowerCase()}planner insert (${dims}) for ${diary.holeCount}-ring binders. ` +
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
