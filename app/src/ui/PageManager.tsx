import { useEffect, useMemo, useRef, useState } from 'react';
import { facesOf, targetOf, useActiveDiary, useActiveWork, useStore } from '../store';
import { pageUnits, pairedItemIds, importAfterIndex, validImportPeriod, duplicatePageCount, type PageUnit } from '../core/pages';
import { faceCount, faceLabel, type ResolvedFace, type Work } from '../core/work';
import { outsideObjects, projectsFor } from '../core/library';
import { dateKey, MAX_DATED_PAGES, todayFrom } from '../core/dated';
import { addDays, addMonths, type Dataset } from '../core/dataset';
import { resolveObjectColors } from '../core/colors';
import { resolveRuleColors } from '../core/colorRules';
import { canRedo, canUndo } from '../core/history';
import type { Diary } from '../core/diary';
import { InsertView } from './InsertView';
import { Modal } from './Modal';

const unitLabel = (u: PageUnit) => u.count > 1 ? `p.${u.start + 1}~${u.start + u.count}` : `p.${u.start + 1}`;

/** 긴 작업에서는 보이는 썸네일만 그린다. 자리 크기는 그대로 남겨 스크롤을 유지한다. */
function PageThumb({ work, diary, face }: { work: Work; diary: Diary; face: ResolvedFace }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: '250px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const scale = Math.min(140 / diary.width, 140 / diary.height);
  return (
    <div className="page-thumb" ref={ref}>
      {visible && <svg viewBox={`0 0 ${diary.width} ${diary.height}`} width={diary.width * scale} height={diary.height * scale}>
        <rect width={diary.width} height={diary.height} className="sheet-bg" />
        <InsertView insert={diary} grid={face.background} objects={resolveObjectColors(face.objects, work.palette)}
          safeZoneWidth={diary.punch.safeZoneWidth} mode="print"
          calendarContext={{ year: face.month.year, page: face.month.month - 1, rules: face.colorRules ?? resolveRuleColors(work.colorRules, work.palette) }} />
      </svg>}
    </div>
  );
}

/** Page와 페이지 아래의 두 진입점이 같은 가져오기 창을 연다. */
export function ImportPagesButton({ atEnd = false }: { atEnd?: boolean }) {
  const work = useActiveWork();
  const [open, setOpen] = useState(false);
  const goToFace = useStore((s) => s.goToFace);
  const today = useStore((s) => s.today);
  if (!work) return null;
  return <>
    <button className="ghost page-import-button" onClick={() => {
      if (atEnd) goToFace(Math.max(0, facesOf(work, today).length - 1));
      setOpen(true);
    }}>다른 작업에서 페이지 가져오기</button>
    {open && <ImportPagesDialog key={work.id} target={work} onClose={() => setOpen(false)} />}
  </>;
}

function ImportPagesDialog({ target, onClose }: { target: Work; onClose: () => void }) {
  const works = useStore((s) => s.works);
  const folders = useStore((s) => s.folders);
  const diaries = useStore((s) => s.diaries);
  const [query, setQuery] = useState('');
  const [folderId, setFolder] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = projectsFor(works.filter((w) => w.id !== target.id), { query, folderId, diaryId: null, sort: 'updated' });
  const source = shown.find((w) => w.id === picked) ?? shown[0];
  return <Modal title="다른 작업에서 페이지 가져오기" onClose={onClose} size="large">
    <div className="page-import-layout">
      <aside className="page-import-works" aria-label="가져올 작업 고르기">
        <select aria-label="가져올 작업 폴더" value={folderId ?? ''} onChange={(e) => setFolder(e.target.value || undefined)}>
          <option value="">모든 폴더</option>
          {folders.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}
        </select>
        <input type="search" aria-label="가져올 작업 검색" placeholder="작업 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="page-import-work-list">
          {shown.map((w) => <button className={`page-import-work ${source?.id === w.id ? 'on' : ''}`} key={w.id} onClick={() => setPicked(w.id)}>
            <b>{w.name}</b><span>{faceCount(w)}페이지 · {diaries.find((d) => d.id === w.diaryId)?.name ?? '다이어리 없음'}</span>
          </button>)}
          {!shown.length && <p className="muted">가져올 작업이 없어요.</p>}
        </div>
      </aside>
      {source ? <ImportSelection key={source.id} source={source} target={target} onClose={onClose} />
        : <div className="page-import-content"><p>다른 작업의 페이지를 복사해서 넣는 곳이에요. 원래 작업은 그대로 남아요.</p></div>}
    </div>
    <div className="modal-actions"><button className="ghost" onClick={onClose}>닫기</button></div>
  </Modal>;
}

function newPeriods(work: Work, today: string): Record<string, Dataset> {
  const t = todayFrom(today);
  const first = { ...t, day: 1 };
  const last = addDays(addMonths(first, 1), -1);
  return Object.fromEntries(work.items.filter((i) => i.kind === 'dated').map((i) => [i.id,
    i.dataset.kind === 'calendar' ? { kind: 'calendar', year: t.year }
      : { ...i.dataset, start: dateKey(first), end: dateKey(last) },
  ]));
}

function ImportSelection({ source, target, onClose }: { source: Work; target: Work; onClose: () => void }) {
  const diaries = useStore((s) => s.diaries);
  const today = useStore((s) => s.today);
  const importPagesFrom = useStore((s) => s.importPagesFrom);
  const [selected, setSelected] = useState<string[]>([]);
  const [periods, setPeriods] = useState(() => newPeriods(source, today));
  // 가져올 때 묻는다 — 지금 작업의 색(팔레트·색 규칙)을 따를지, 원래 작업의 색 그대로일지(2026-10-13 결정).
  const [colors, setColors] = useState<'original' | 'current'>('current');
  const [error, setError] = useState('');
  const changeDate = (id: string, key: 'start' | 'end', value: string) => setPeriods((current) => {
    const period = current[id];
    return period?.kind === 'date' && period[key] !== value ? { ...current, [id]: { ...period, [key]: value } } : current;
  });
  const units = useMemo(() => pageUnits(source), [source]);
  const chosen = pairedItemIds(source, selected);
  const pickedItems = source.items.filter((i) => chosen.includes(i.id));
  const valid = pickedItems.every((i) => validImportPeriod(i, periods[i.id]));
  const prepared = pickedItems.map((i) => i.kind === 'dated' ? { ...i, dataset: periods[i.id] ?? i.dataset, overrides: {} } : i);
  const count = valid ? faceCount({ items: prepared }) : 0;
  const sourceDiary = diaries.find((d) => d.id === source.diaryId);
  const targetDiary = diaries.find((d) => d.id === target.diaryId);
  const faces = useMemo(() => facesOf(source, today), [source, today]);
  const outside = targetDiary ? outsideObjects({ items: prepared }, targetDiary) : 0;
  const current = targetOf(useStore.getState());
  const currentId = current?.kind === 'face' ? current.face.itemId : current?.itemId ?? null;
  const after = importAfterIndex(target, currentId);
  const at = faceCount({ items: target.items.slice(0, after + 1) });
  const toggle = (unit: PageUnit) => setSelected((ids) => chosen.includes(unit.id)
    ? ids.filter((id) => !pairedItemIds(source, unit.itemIds).includes(id)) : [...ids, ...unit.itemIds]);
  return <div className="page-import-content">
    <h3>{source.name}</h3>
    <p className="modal-note">{at ? `p.${at} 뒤` : '빈 작업'}에 사본으로 넣어요. 앞뒤는 함께 가져오며, 필요한 빈 뒷면도 추가해요.</p>
    <div className="page-manager-toolbar">
      <button className="ghost" onClick={() => setSelected(source.items.map((i) => i.id))}>전체 선택</button>
      <button className="ghost" onClick={() => setSelected([])}>선택 해제</button>
    </div>
    <div className="page-import-colors">
      <b>색은 어떻게 할까요?</b>
      <span className="seg" role="radiogroup" aria-label="가져온 페이지 색">
        <button role="radio" aria-checked={colors === 'current'} className={colors === 'current' ? 'on' : ''} onClick={() => setColors('current')}
          title="이 작업의 팔레트와 색 규칙(일·토·공휴일)을 따라요 — 나중에 바꾸면 함께 바뀌어요">지금 작업의 색 따르기</button>
        <button role="radio" aria-checked={colors === 'original'} className={colors === 'original' ? 'on' : ''} onClick={() => setColors('original')}
          title="원래 작업의 색과 색 규칙을 그대로 고정해요 — 이 작업의 색을 바꿔도 안 바뀌어요">원래 색 그대로</button>
      </span>
    </div>
    <div className="page-import-units">
      {units.map((u) => {
        const examples = faces.filter((f) => u.itemIds.includes(f.itemId)).slice(0, 2);
        return <label className={`page-import-unit ${chosen.includes(u.id) ? 'on' : ''}`} key={u.id}>
          <div className="page-unit-thumbs">{sourceDiary && examples.map((f) => <PageThumb key={f.key} work={source} diary={sourceDiary} face={f} />)}</div>
          <span><input type="checkbox" aria-label={`${unitLabel(u)} 가져오기`} checked={chosen.includes(u.id)} onChange={() => toggle(u)} /> {unitLabel(u)}{u.dated ? ' · 날짜 양식' : ''}</span>
        </label>;
      })}
      {!units.length && <p className="muted">이 작업에는 페이지가 없어요.</p>}
    </div>
    {pickedItems.filter((i) => i.kind === 'dated').map((item) => {
      const period = periods[item.id];
      const label = unitLabel(units.find((u) => u.itemIds.includes(item.id))!);
      return <fieldset className="page-import-period" key={item.id}>
        <legend>{label} · 가져올 기간</legend>
        <p className="modal-note">날짜 양식과 규칙만 복사해요. 이전 기간의 개별 수정은 가져오지 않아요.</p>
        {period?.kind === 'date' ? <div className="page-manager-toolbar">
          <label>시작 <input type="date" aria-label={`${label} 시작 날짜`} value={period.start}
            onChange={(e) => changeDate(item.id, 'start', e.target.value)} onInput={(e) => changeDate(item.id, 'start', e.currentTarget.value)}
            onBlur={(e) => changeDate(item.id, 'start', e.currentTarget.value)} /></label>
          <label>끝 <input type="date" aria-label={`${label} 끝 날짜`} value={period.end}
            onChange={(e) => changeDate(item.id, 'end', e.target.value)} onInput={(e) => changeDate(item.id, 'end', e.currentTarget.value)}
            onBlur={(e) => changeDate(item.id, 'end', e.currentTarget.value)} /></label>
          <span className="muted">{period.step === 'day' ? '하루' : period.step === 'week' ? '한 주' : '한 달'}씩 · {period.perPage}개/쪽</span>
        </div> : period?.kind === 'calendar' && <label>해 <input type="number" aria-label="가져올 달력 해" min={100} max={9999} value={period.year}
          onChange={(e) => setPeriods({ ...periods, [item.id]: { ...period, year: Number(e.target.value) } })} /></label>}
      </fieldset>;
    })}
    {sourceDiary && targetDiary && (sourceDiary.width !== targetDiary.width || sourceDiary.height !== targetDiary.height) &&
      <p className="modal-note warn">{sourceDiary.width}×{sourceDiary.height}mm → {targetDiary.width}×{targetDiary.height}mm. 크기에 맞춰 줄이지 않아요. 가져온 뒤 배치를 확인하세요.{outside > 0 && ` 요소 ${outside}개가 속지 밖에 걸쳐요.`}</p>}
    {!valid && <p className="modal-note warn">기간을 확인해 주세요. 날짜 양식은 한 번에 {MAX_DATED_PAGES}쪽까지 가져올 수 있어요.</p>}
    {count > MAX_DATED_PAGES && <p className="modal-note warn">한 번에 {MAX_DATED_PAGES}페이지까지 가져올 수 있어요.</p>}
    {error && <p role="alert" className="modal-note warn">{error}</p>}
    <div className="modal-actions">
      <span>{count}페이지 선택</span>
      <button className="primary" disabled={!count || !valid || count > MAX_DATED_PAGES || !sourceDiary || !targetDiary}
        onClick={() => {
          if (importPagesFrom(source.id, chosen, { periods, colors })) onClose();
          else setError('원래 작업이나 기간이 바뀌었어요. 선택을 다시 확인해 주세요.');
        }}>선택한 페이지 가져오기</button>
    </div>
  </div>;
}

/** 원래 순서를 유지해 여러 장을 다루고, 한 번의 실행 취소로 되돌린다. */
export function PageOverview({ onClose }: { onClose: () => void }) {
  const work = useActiveWork();
  const diary = useActiveDiary();
  const today = useStore((s) => s.today);
  const histories = useStore((s) => s.histories);
  const goToFace = useStore((s) => s.goToFace);
  const [selected, setSelected] = useState<string[]>([]);
  const [copies, setCopies] = useState(1);
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState<string[]>([]);
  if (!work || !diary) return null;
  const faces = facesOf(work, today);
  const units = pageUnits(work);
  const chosen = pairedItemIds(work, selected);
  const count = faceCount({ items: work.items.filter((i) => chosen.includes(i.id)) });
  const duplicateCount = duplicatePageCount(work, chosen, copies);
  const history = histories[work.id];
  const toggle = (unit: PageUnit) => { setRemoving(false); setSelected((ids) => chosen.includes(unit.id) ? ids.filter((id) => !pairedItemIds(work, unit.itemIds).includes(id)) : [...ids, ...unit.itemIds]); };
  const move = (ids: string[], before: string | null) => { useStore.getState().moveSelectedPages(ids, before); setSelected([]); setRemoving(false); };
  return <Modal title={`모든 페이지 · ${faces.length}면`} onClose={onClose} size="large">
    <p className="modal-note">썸네일을 누르면 그 페이지로 가요. 체크하면 앞뒤 짝·날짜 묶음을 함께 선택해요. 선택한 페이지를 끌거나 ‘이동’을 써 순서를 바꿀 수 있어요.</p>
    <div className="page-manager-toolbar">
      <button className="ghost" onClick={() => { setSelected(work.items.map((i) => i.id)); setRemoving(false); }}>전체 선택</button>
      <button className="ghost" onClick={() => { setSelected([]); setRemoving(false); }}>선택 해제</button>
      <span>{count}페이지 선택</span>
      <button className="ghost" disabled={!history || !canUndo(history)} onClick={() => { useStore.getState().undo(); setSelected([]); setRemoving(false); }}>실행 취소</button>
      <button className="ghost" disabled={!history || !canRedo(history)} onClick={() => { useStore.getState().redo(); setSelected([]); setRemoving(false); }}>다시 실행</button>
    </div>
    <div className="page-manager-toolbar">
      <label>추가할 세트 수 <input type="number" aria-label="추가할 세트 수" min={1} max={Math.floor(MAX_DATED_PAGES / (count || 1))} value={copies} onChange={(e) => setCopies(Number(e.target.value))} /></label>
      <button className="ghost" disabled={!duplicateCount || duplicateCount > MAX_DATED_PAGES}
        onClick={() => { useStore.getState().duplicateSelectedPages(chosen, copies); setSelected([]); }}>선택 복제</button>
      <select aria-label="선택한 페이지 이동" value="" disabled={!count} onChange={(e) => move(chosen, e.target.value === 'end' ? null : e.target.value)}>
        <option value="">이동…</option>{units.filter((u) => !chosen.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{unitLabel(u)} 앞</option>)}<option value="end">맨 뒤</option>
      </select>
      <button className="ghost danger" disabled={!count} onClick={() => setRemoving(true)}>선택 삭제</button>
    </div>
    {count > 0 && <p className="modal-note">원본 뒤에 선택한 순서대로 {duplicateCount}페이지를 추가해요{duplicateCount > count * copies ? ' (빈 뒷면 포함)' : ''}. 한 번에 {MAX_DATED_PAGES}페이지까지 복제할 수 있어요.</p>}
    {removing && <div className="page-remove-confirm" role="alert">
      <span>선택한 {count}페이지를 모두 지울까요? 실행 취소로 되돌릴 수 있어요.</span>
      <button className="ghost" onClick={() => setRemoving(false)}>취소</button>
      <button className="primary" onClick={() => { useStore.getState().removeSelectedPages(chosen); setSelected([]); setRemoving(false); }}>삭제하기</button>
    </div>}
    <div className="page-overview-grid">
      {faces.map((face, index) => {
        const unit = units.find((u) => u.itemIds.includes(face.itemId))!;
        return <article className={`page-overview-card ${chosen.includes(unit.id) ? 'on' : ''}`} key={face.key} draggable
          onDragStart={(e) => { const ids = chosen.includes(unit.id) ? chosen : unit.itemIds; setDragging(ids); e.dataTransfer.setData('text/plain', ids.join('\n')); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => setDragging([])} onDragOver={(e) => { if (dragging.length) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); move(dragging, unit.id); setDragging([]); }}>
          <button className="page-open" aria-label={`${faceLabel(face, index)} 열기`} onClick={() => { goToFace(index); onClose(); }}>
            <PageThumb work={work} diary={diary} face={face} /><span>{faceLabel(face, index)}</span>
          </button>
          <label><input type="checkbox" aria-label={`${faceLabel(face, index)} 선택`} checked={chosen.includes(unit.id)} onChange={() => toggle(unit)} /> {unit.dated ? `날짜 묶음 ${unit.count}면` : unit.count > 1 ? '앞뒤 함께' : '한 면'}</label>
        </article>;
      })}
      {!faces.length && <p className="muted">페이지가 없어요. 닫고 ‘+ 페이지 추가’로 시작할 수 있어요.</p>}
      {faces.length > 0 && <div className="page-drop-end" onDragOver={(e) => { if (dragging.length) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); move(dragging, null); setDragging([]); }}>맨 뒤로 이동</div>}
    </div>
    <div className="modal-actions"><button className="ghost" onClick={onClose}>닫기</button></div>
  </Modal>;
}
