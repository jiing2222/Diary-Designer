import { useState } from 'react';
import { useActiveWork, useCursor, useDisplayFace, useActiveSide, useStore } from '../store';
import { dateKey, MAX_DATED_PAGES, periodSummary, suggestPerPage, todayFrom, type Boundary } from '../core/dated';
import { addDays, addMonths, type DateDataset } from '../core/dataset';
import type { DatedItem, PageItem } from '../core/work';
import { PopRow } from './Popover';

/**
 * 날짜로 펼치기 / 기간 바꾸기(세부계획 A4.6 · A4.8). AutoField 패널 아래에 붙는다.
 *
 * 보통 페이지면 ‘이 페이지를 원본으로 기간만큼 펼치기’. 기간을 고치는 것은 원본 편집
 * 화면에서만 한다(세부계획 A4.6 2-1) — 날짜 페이지에서는 지금 기간과 [원본 편집]만 보인다.
 * 날짜별 수정은 날짜에 붙어 있어서 기간을 바꿔도 같은 날짜면 남는다.
 */
export function PeriodPanel() {
  const work = useActiveWork();
  const cursor = useCursor();
  const activeSide = useActiveSide();
  const face = useDisplayFace(activeSide);
  const enterSourceEdit = useStore((s) => s.enterSourceEdit);
  const item = work?.items.find((i) => i.id === face?.itemId);
  if (!item || !face) return null;
  if (item.kind === 'dated' && item.dataset.kind !== 'date') {
    return <p className="tool-panel-note">옛 달력 양식에서 옮긴 묶음이라 여기서는 기간을 바꿀 수 없어요.</p>;
  }
  if (item.kind === 'dated' && !cursor?.source) {
    const sum = periodSummary(item.dataset, item.boundary);
    return (
      <div className="period-panel">
        <h3 className="panel-sub">기간</h3>
        <div className="period-summary">
          {sum.pages}장 · {short(sum.first)}~{short(sum.last)}
        </div>
        <p className="tool-panel-note">기간은 원본 편집에서 바꿔요. 바꿔도 날짜마다 고친 것은 그 날짜에 남아요.</p>
        <button className="ghost" onClick={() => enterSourceEdit(item.id, face.period?.faceIndex ?? 0)}>
          원본 편집
        </button>
      </div>
    );
  }
  // 항목이 바뀌면(다른 페이지로 가면) 입력을 새로 채운다.
  return <PeriodForm key={item.id} item={item as PageItem | (DatedItem & { dataset: DateDataset })} />;
}

type Step = DateDataset['step'];

const STEPS: { id: Step; label: string }[] = [
  { id: 'day', label: '하루씩' },
  { id: 'week', label: '한 주씩' },
  { id: 'month', label: '한 달씩' },
];

function PeriodForm({ item }: { item: PageItem | (DatedItem & { dataset: DateDataset }) }) {
  const today = useStore((s) => s.today);
  const setDatedPeriod = useStore((s) => s.setDatedPeriod);
  const initial = initialDraft(item, today);
  const [draft, setDraft] = useState(initial);

  const dataset: DateDataset = {
    kind: 'date',
    start: draft.start,
    end: draft.end,
    step: draft.step,
    perPage: Math.max(1, Math.floor(draft.perPage) || 1),
  };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) && /^\d{4}-\d{2}-\d{2}$/.test(draft.end);
  const sum = valid ? periodSummary(dataset, draft.boundary) : null;
  const tooMany = !!sum && sum.pages > MAX_DATED_PAGES;
  const empty = !sum || sum.pages === 0;
  const changed = JSON.stringify({ ...initial }) !== JSON.stringify({ ...draft });
  const isPage = item.kind === 'page';

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="period-panel">
      <h3 className="panel-sub">{isPage ? '날짜로 펼치기' : '기간'}</h3>
      {isPage && (
        <p className="tool-panel-note">이 페이지를 원본으로, 기간의 날짜마다 한 장씩 만들어요. 놓아둔 날짜 칸이 그 날짜로 채워져요.</p>
      )}
      <PopRow label="시작">
        <input type="date" value={draft.start} onChange={(e) => patch({ start: e.target.value })} />
      </PopRow>
      <PopRow label="끝">
        <input type="date" value={draft.end} onChange={(e) => patch({ end: e.target.value })} />
      </PopRow>
      <PopRow label="날짜 간격">
        <select value={draft.step} onChange={(e) => patch({ step: e.target.value as Step })}>
          {STEPS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </PopRow>
      <PopRow label="한 페이지에">
        <input
          type="number"
          min={1}
          max={42}
          value={draft.perPage}
          onChange={(e) => patch({ perPage: Number(e.target.value) })}
        />
        <span className="unit">개</span>
      </PopRow>
      <PopRow label="달이 바뀌면">
        <span className="seg">
          {(
            [
              ['continue', '이어서'],
              ['blank', '공백'],
            ] as [Boundary, string][]
          ).map(([id, label]) => (
            <button key={id} className={draft.boundary === id ? 'on' : ''} onClick={() => patch({ boundary: id })}>
              {label}
            </button>
          ))}
        </span>
      </PopRow>
      <p className="tool-panel-note">
        {draft.boundary === 'continue'
          ? '남는 칸에 다음 달 날짜를 바로 이어 채워요.'
          : '그 달 날짜만 채우고 남는 칸은 비워요. 다음 달은 다음 장부터.'}
      </p>
      <div className="period-summary">
        {!valid
          ? '날짜를 넣어 주세요.'
          : tooMany
            ? `${sum!.pages}장이 넘어요 — 한 번에 ${MAX_DATED_PAGES}장까지 만들 수 있어요.`
            : empty
              ? '이 기간에는 날짜가 없어요.'
              : `${sum!.pages}장 · ${short(sum!.first)}~${short(sum!.last)}`}
      </div>
      <button
        className="primary"
        disabled={!valid || tooMany || empty || (!isPage && !changed)}
        onClick={() => setDatedPeriod(item.id, dataset, draft.boundary)}
      >
        {isPage ? '펼치기' : '기간 바꾸기'}
      </button>
    </div>
  );
}

type Draft = { start: string; end: string; step: Step; perPage: number; boundary: Boundary };

/** 보통 페이지는 이번 달 1일~말일, 한 페이지에 놓인 날짜 칸 수만큼. 날짜 묶음은 지금 기간. */
function initialDraft(item: PageItem | (DatedItem & { dataset: DateDataset }), today: string): Draft {
  if (item.kind === 'dated') {
    const d = item.dataset;
    return { start: d.start, end: d.end, step: d.step, perPage: d.perPage, boundary: item.boundary };
  }
  const t = todayFrom(today);
  const first = { year: t.year, month: t.month, day: 1 };
  const last = addDays(addMonths(first, 1), -1);
  return {
    start: dateKey(first),
    end: dateKey(last),
    step: 'day',
    perPage: suggestPerPage(item.face.objects),
    boundary: 'continue',
  };
}

function short(d: { month: number; day: number } | null): string {
  return d ? `${d.month}/${d.day}` : '';
}
