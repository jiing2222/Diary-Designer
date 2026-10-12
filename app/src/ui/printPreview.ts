import { backLayoutOf, cardAt, parsePageRange, sheetCount } from '../core/print';
import type { Diary } from '../core/diary';
import type { ResolvedFace, Work } from '../core/work';
import { cardsToPrint, workExportInput, type WorkPrintSettings } from '../pdf/fromWork';
import type { PreviewSlotContent } from './PaperPreview';

/** 한 장씩·모든 장 보기 모두 PDF에 넘기는 재료로 출력 범위와 장수를 구한다. */
export function printJob(
  work: Work,
  diary: Diary,
  faces: ResolvedFace[],
  settings: WorkPrintSettings,
  range: { mode: 'all' | 'pick'; text: string },
) {
  const parsed = range.mode === 'pick' ? parsePageRange(range.text, faces.length) : null;
  const pickedFaces = parsed && 'faces' in parsed ? parsed.faces : null;
  // 잘못 쓴 범위는 전체를 임시로 보여주고, 빈 선택은 0장으로 센다. 둘 다 Export는 막는다.
  const rangeError = parsed && 'error' in parsed ? parsed.error : pickedFaces?.length === 0 ? '' : null;
  const input = workExportInput(work, diary, faces, settings, pickedFaces);
  const printed = cardsToPrint(work, faces.length, pickedFaces);
  const slots = input.layout.slots.length;
  const cards = input.datasetPages ?? 0;
  return {
    work,
    diary,
    faces,
    settings,
    input,
    printed,
    pickedFaces,
    rangeError,
    slots,
    cards,
    pickedCount: printed.reduce((n, card) => n + (card.back === null ? 1 : 2), 0),
    sheets: sheetCount(cards, slots),
    backLayout: backLayoutOf(input.layout, input.paperWidth, input.paperHeight, settings.backTurn180),
  };
}

export type PrintJob = ReturnType<typeof printJob>;

/** 칸 번호 → 원래 작업의 면 번호. 목록의 설명·클릭과 실제 내용이 같은 칸 배정을 쓴다. */
export function sheetFaces(job: PrintJob, sheet: number, back: boolean): Map<number, number> {
  const face = new Map<number, number>();
  for (let i = 0; i < job.slots; i++) {
    const card = cardAt(sheet, i, job.cards, job.slots, {
      on: job.settings.cutStack,
      group: job.settings.cutStackGroup || undefined,
    });
    const f = card === null ? null : back ? job.printed[card]?.back : job.printed[card]?.front;
    if (f !== null && f !== undefined) face.set(i, f);
  }
  return face;
}

/** 같은 칸에 PDF의 앞·뒤 내용, 달력 날짜, 실제 타공 표시를 싣는다. */
export function sheetSlots(
  job: PrintJob,
  sheet: number,
  back: boolean,
  insert: PreviewSlotContent['insert'],
  picked?: Set<number>,
): { content: Map<number, PreviewSlotContent>; face: Map<number, number> } {
  const { input, slots, cards } = job;
  const content = new Map<number, PreviewSlotContent>();
  const face = sheetFaces(job, sheet, back);
  for (let i = 0; i < slots; i++) {
    const card = cardAt(sheet, i, cards, slots, {
      on: job.settings.cutStack,
      group: job.settings.cutStackGroup || undefined,
    });
    const slot = card === null ? undefined : (back ? input.datasetBackOverrides! : input.datasetOverrides!).get(card);
    const f = face.get(i);
    content.set(
      i,
      slot
        ? {
            insert,
            dotGrid: slot.dotGrid,
            objects: slot.objects,
            punch: slot.punch,
            calendar: slot.month
              ? { year: slot.month.year, page: slot.month.month - 1, rules: slot.colorRules ?? input.colorRules }
              : undefined,
            selected: f !== undefined && picked?.has(f),
          }
        : {
            insert,
            dotGrid: { ...input.dotGrid, print: false, showOnScreen: false },
            objects: [],
          },
    );
  }
  return { content, face };
}
