import { useMemo, useRef, useState } from 'react';
import { facesOf, useStore } from '../store';
import { DEFAULT_PROJECT_VIEW, isTrashed, projectsFor, rangeIds, type ProjectSort } from '../core/library';
import { diarySizeLabel } from '../core/diary';
import { resolveRuleColors } from '../core/colorRules';
import { resolveObjectColors } from '../core/colors';
import type { Work } from '../core/work';
import { InsertView } from './InsertView';
import { Modal } from './Modal';
import { loadWorksFromFile, saveWorksToFile } from './fileIO';
import { t } from '../lang';

type ActionKind = 'folder-new' | 'folder-name' | 'folder-remove' | 'menu' | 'name' | 'move' | 'copy-diary';
type Action = { kind: ActionKind; id?: string };

/** 끌어다 놓는 작업 id들(JSON) — 폴더 칸이 이 종류만 받는다. */
const DRAG_TYPE = 'application/x-rings-works';

/** 폴더 칸(분류 없음 포함)에 작업을 끌어다 놓는다. 놓을 수 있는 동안 강조한다. */
function useFolderDrop(folderId: string | null) {
  const moveWorkToFolder = useStore((s) => s.moveWorkToFolder);
  const showToast = useStore((s) => s.showToast);
  const [over, setOver] = useState(false);
  return {
    className: over ? 'drop-over' : '',
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      setOver(false);
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      const ids = JSON.parse(raw) as string[];
      ids.forEach((id) => moveWorkToFolder(id, folderId));
      showToast(t(`작업 ${ids.length}개를 옮겼어요.`, `Moved ${ids.length} work(s).`));
    },
  };
}

/** 폴더 칸 — 누르면 그 폴더만 보고, 작업 카드를 끌어다 놓으면 그 폴더로 옮긴다. */
function FolderFilter({ folderId, on, onClick, children }: { folderId: string | null; on: boolean; onClick: () => void; children: React.ReactNode }) {
  const { className, ...drop } = useFolderDrop(folderId);
  return (
    <button {...drop} className={`project-filter ${on ? 'on' : ''} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** Projects: 폴더는 정리를, 다이어리는 종이 치수를 맡는다(세부계획 B2). */
export function Projects() {
  const works = useStore((s) => s.works);
  const folders = useStore((s) => s.folders);
  const diaries = useStore((s) => s.diaries);
  const view = useStore((s) => s.projectView);
  const patch = useStore((s) => s.patch);
  const startNewWork = useStore((s) => s.startNewWork);
  const [action, setAction] = useState<Action | null>(null);
  const showToast = useStore((s) => s.showToast);
  // 고른 작업 — 이 화면에만 둔다. 지금 보이는 것만 센다(폴더·검색을 바꾸면 안 보이는 것은 저절로 빠진다).
  const [picked, setPicked] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const live = useMemo(() => works.filter((w) => !isTrashed(w)), [works]);
  const shown = useMemo(() => projectsFor(works, view), [works, view]);
  const pickedShown = shown.filter((w) => picked.includes(w.id)).map((w) => w.id);
  const togglePick = (id: string, range: boolean) => {
    const order = shown.map((w) => w.id);
    if (range) setPicked([...new Set([...pickedShown, ...rangeIds(order, anchor.current, id)])]);
    else setPicked(pickedShown.includes(id) ? pickedShown.filter((x) => x !== id) : [...pickedShown, id]);
    anchor.current = id;
  };
  const setView = (p: Partial<typeof view>) => patch({ projectView: { ...view, ...p } });
  const folder = folders.find((f) => f.id === view.folderId);
  const title = view.folderId === null ? t('분류 없음', 'Unfiled') : (folder?.name ?? 'Projects');

  return (
    <div className="library-projects">
      <aside className="projects-panel" aria-label={t('작업 필터', 'Filter works')}>
        <h2>Projects</h2>
        <button
          className={`project-filter ${view.folderId === undefined ? 'on' : ''}`}
          onClick={() => setView({ folderId: undefined })}
        >
          <span>{t('모든 작업', 'All works')}</span>
          <span className="filter-count">{live.length}</span>
        </button>
        <FolderFilter folderId={null} on={view.folderId === null} onClick={() => setView({ folderId: null })}>
          <span>{t('분류 없음', 'Unfiled')}</span>
          <span className="filter-count">{live.filter((w) => !w.folderId).length}</span>
        </FolderFilter>
        <div className="projects-panel-heading">
          <h3>{t('폴더', 'Folders')}</h3>
          <button
            className="ghost"
            aria-label={t('폴더 만들기', 'New folder')}
            title={t('폴더 만들기', 'New folder')}
            onClick={() => setAction({ kind: 'folder-new' })}
          >
            +
          </button>
        </div>
        {folders.map((f) => (
          <div className="project-folder" key={f.id}>
            <FolderFilter folderId={f.id} on={view.folderId === f.id} onClick={() => setView({ folderId: f.id })}>
              <span>{f.name}</span>
              <span className="filter-count">{live.filter((w) => w.folderId === f.id).length}</span>
            </FolderFilter>
            <span className="folder-actions">
              <button
                className="ghost"
                aria-label={t(`${f.name} 폴더 이름 바꾸기`, `Rename folder ${f.name}`)}
                title={t('이름 바꾸기', 'Rename')}
                onClick={() => setAction({ kind: 'folder-name', id: f.id })}
              >
                ✎
              </button>
              <button
                className="ghost"
                aria-label={t(`${f.name} 폴더 삭제`, `Delete folder ${f.name}`)}
                title={t('폴더 삭제', 'Delete folder')}
                onClick={() => setAction({ kind: 'folder-remove', id: f.id })}
              >
                ×
              </button>
            </span>
          </div>
        ))}
        <h3 className="projects-panel-heading">{t('다이어리', 'Diaries')}</h3>
        <button
          className={`project-filter ${view.diaryId === null ? 'on' : ''}`}
          onClick={() => setView({ diaryId: null })}
        >
          {t('모든 다이어리', 'All diaries')}
        </button>
        {diaries.map((d) => (
          <button
            key={d.id}
            className={`project-filter ${view.diaryId === d.id ? 'on' : ''}`}
            onClick={() => setView({ diaryId: d.id })}
            title={diarySizeLabel(d)}
          >
            <span className="filter-name">
              <span className="diary-dot" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="filter-count">{live.filter((w) => w.diaryId === d.id).length}</span>
          </button>
        ))}
      </aside>
      <div className="library-pane projects-content">
        <div className="library-head">
          <h2>
            {title} <span className="projects-count">{t(`${shown.length}개`, `${shown.length}`)}</span>
          </h2>
          {/*
            작업 파일(.rings) — 다른 사람에게 보내거나 백업한다. 저장은 **지금 보이는 목록**(폴더·다이어리·검색을
            건 그대로)을 한 파일로. 하나만 보내려면 카드의 ⋯에서.
          */}
          <span className="projects-file">
            <button className="ghost" onClick={() => fileInput.current?.click()}>
              {t('파일 불러오기', 'Open file')}
            </button>
            <button
              className="ghost"
              disabled={shown.length === 0}
              onClick={() => {
                const n = saveWorksToFile(shown.map((w) => w.id), title === 'Projects' ? t('Rings 작업', 'Rings works') : title);
                showToast(n ? t(`작업 ${n}개를 파일로 저장했어요.`, `Saved ${n} work(s) to a file.`) : t('저장할 작업이 없어요.', 'Nothing to save.'));
              }}
            >
              {t('목록을 파일로 저장', 'Save list to file')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".rings,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) showToast(await loadWorksFromFile(f));
              }}
            />
          </span>
          <button className="primary" onClick={() => startNewWork()}>
            {t('+ 새 작업', '+ New work')}
          </button>
        </div>
        {pickedShown.length > 0 ? (
          <BulkBar ids={pickedShown} allShown={shown.map((w) => w.id)} onPick={setPicked} title={title} />
        ) : (
        <div className="projects-toolbar">
          <input
            type="search"
            aria-label={t('작업 검색', 'Search works')}
            placeholder={t('작업 이름 검색', 'Search by name')}
            value={view.query}
            onChange={(e) => setView({ query: e.target.value })}
          />
          <select
            aria-label={t('작업 정렬', 'Sort works')}
            value={view.sort}
            onChange={(e) => setView({ sort: e.target.value as ProjectSort })}
          >
            <option value="updated">{t('최근 수정순', 'Last edited')}</option>
            <option value="created">{t('최근 만든순', 'Newest')}</option>
            <option value="name">{t('이름순', 'Name')}</option>
          </select>
        </div>
        )}
        {shown.length > 0 ? (
          <div className="work-grid">
            {shown.map((w) => (
              <WorkCard
                key={w.id}
                work={w}
                onAction={setAction}
                picked={pickedShown.includes(w.id)}
                picking={pickedShown.length > 0}
                onPick={(range) => togglePick(w.id, range)}
                dragIds={pickedShown.includes(w.id) ? pickedShown : [w.id]}
              />
            ))}
          </div>
        ) : (
          <div className="projects-empty">
            <p className="muted">
              {live.length === 0
                ? t('아직 작업이 없어요. 새 작업으로 시작해요.', 'No works yet. Start with a new one.')
                : folder && !view.query.trim() && view.diaryId === null
                  ? t('아직 이 폴더에 작업이 없어요. 작업 메뉴에서 폴더로 옮길 수 있어요.', 'This folder is empty. Move works here from their ⋯ menu.')
                  : t('조건에 맞는 작업이 없어요.', 'No works match.')}
            </p>
            {live.length > 0 && (
              <button
                className="ghost"
                onClick={() => patch({ projectView: { ...DEFAULT_PROJECT_VIEW, sort: view.sort } })}
              >
                {t('모든 작업 보기', 'Show all works')}
              </button>
            )}
          </div>
        )}
      </div>
      {action && (
        <ProjectDialog
          key={`${action.kind}-${action.id}`}
          action={action}
          onAction={setAction}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

/**
 * 고른 작업들에 한 번에 — 폴더로 옮기기·파일로 저장·휴지통으로. 지우기는 영구 삭제가 아니라 휴지통이라
 * 30일 안에는 되살릴 수 있다(확인 창을 두지 않는다).
 */
function BulkBar({ ids, allShown, onPick, title }: { ids: string[]; allShown: string[]; onPick: (ids: string[]) => void; title: string }) {
  const folders = useStore((s) => s.folders);
  const moveWorkToFolder = useStore((s) => s.moveWorkToFolder);
  const trashWorkById = useStore((s) => s.trashWorkById);
  const showToast = useStore((s) => s.showToast);
  const all = ids.length === allShown.length;
  return (
    <div className="projects-toolbar bulk-bar" role="toolbar" aria-label={t('고른 작업', 'Selected works')}>
      <b>{t(`${ids.length}개 고름`, `${ids.length} selected`)}</b>
      <button className="ghost" onClick={() => onPick(all ? [] : allShown)}>
        {all ? t('모두 풀기', 'Deselect all') : t('모두 고르기', 'Select all')}
      </button>
      <select
        aria-label={t('폴더로 옮기기', 'Move to folder')}
        value=""
        onChange={(e) => {
          const to = e.target.value === '__none' ? null : e.target.value;
          ids.forEach((id) => moveWorkToFolder(id, to));
          showToast(t(`작업 ${ids.length}개를 옮겼어요.`, `Moved ${ids.length} work(s).`));
          onPick([]);
        }}
      >
        <option value="" disabled>
          {t('폴더로 옮기기…', 'Move to folder…')}
        </option>
        <option value="__none">{t('분류 없음', 'Unfiled')}</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <button
        className="ghost"
        onClick={() => {
          const n = saveWorksToFile(ids, title === 'Projects' ? t('Rings 작업', 'Rings works') : title);
          showToast(t(`작업 ${n}개를 파일로 저장했어요.`, `Saved ${n} work(s) to a file.`));
        }}
      >
        {t('파일로 저장', 'Save to file')}
      </button>
      <button
        className="ghost danger"
        onClick={() => {
          ids.forEach((id) => trashWorkById(id));
          showToast(
            t(
              `작업 ${ids.length}개를 휴지통으로 옮겼어요. 30일 안에 되살릴 수 있어요.`,
              `Moved ${ids.length} work(s) to the trash. You can restore them within 30 days.`,
            ),
          );
          onPick([]);
        }}
      >
        {t('휴지통으로', 'Move to trash')}
      </button>
      <button className="ghost" onClick={() => onPick([])} aria-label={t('고르기 그만', 'Clear selection')}>
        ×
      </button>
    </div>
  );
}

/** 작업 카드에는 이름과 다이어리 색 점, 앞 두 페이지를 둔다. 정리는 ⋯에서 한다. */
function WorkCard({
  work,
  onAction,
  picked,
  picking,
  onPick,
  dragIds,
}: {
  work: Work;
  onAction: (a: Action) => void;
  picked: boolean;
  /** 하나라도 골랐으면 카드를 누르는 것이 열기가 아니라 고르기다. */
  picking: boolean;
  onPick: (range: boolean) => void;
  /** 이 카드를 끌면 함께 옮길 작업들(고른 카드면 고른 것 전부). */
  dragIds: string[];
}) {
  const openWork = useStore((s) => s.openWork);
  const openPrint = useStore((s) => s.openPrint);
  const diary = useStore((s) => s.diaries.find((d) => d.id === work.diaryId));
  const today = useStore((s) => s.today);
  const faces = useMemo(() => facesOf(work, today), [work, today]);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const diaryInfo = diary ? `${diary.name} · ${diary.width}×${diary.height}mm` : '';

  return (
    <article
      className={`work-card ${picked ? 'picked' : ''} ${picking ? 'picking' : ''}`}
      aria-label={work.name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className="work-preview">
        <input
          type="checkbox"
          className="work-pick"
          checked={picked}
          aria-label={t(`${work.name} 고르기`, `Select ${work.name}`)}
          onChange={() => {}}
          onClick={(e) => onPick(e.shiftKey)}
        />
        <button
          className="work-thumb"
          onClick={(e) => (picking ? onPick(e.shiftKey) : openWork(work.id))}
          aria-label={picking ? t(`${work.name} 고르기`, `Select ${work.name}`) : t(`${work.name} 열기`, `Open ${work.name}`)}
        >
          {diary &&
            faces.slice(0, 2).map((f) => (
              <svg key={f.key} viewBox={`0 0 ${diary.width} ${diary.height}`} className="work-thumb-face">
                <rect width={diary.width} height={diary.height} className="sheet-bg" />
                <InsertView
                  insert={diary}
                  grid={f.background}
                  objects={resolveObjectColors(f.objects, work.palette)}
                  safeZoneWidth={diary.punch.safeZoneWidth}
                  mode="print"
                  calendarContext={{
                    year: f.month.year,
                    page: f.month.month - 1,
                    rules: f.colorRules ?? resolveRuleColors(work.colorRules, work.palette),
                  }}
                />
              </svg>
            ))}
          <span className="work-pages">{t(`${faces.length}페이지`, faces.length === 1 ? '1 page' : `${faces.length} pages`)}</span>
        </button>
        <div className="work-actions">
          <button className="ghost" onClick={() => openWork(work.id)} aria-label={t(`${work.name} 편집`, `Edit ${work.name}`)}>
            {t('열기', 'Open')}
          </button>
          <button className="ghost work-print" onClick={() => openPrint(work.id)} aria-label={`${work.name} Print`}>
            Print
          </button>
          <button
            className="ghost"
            onClick={() => onAction({ kind: 'menu', id: work.id })}
            aria-label={t(`${work.name} 작업 메뉴`, `${work.name} menu`)}
          >
            ⋯
          </button>
        </div>
      </div>
      <div className="work-meta">
        {diary && (
          <span className="work-diary">
            <button
              className="diary-dot diary-dot-button"
              style={{ background: diary.color }}
              title={diaryInfo}
              aria-label={t(`${diary.name} 다이어리 정보`, `${diary.name} diary info`)}
              aria-expanded={diaryOpen}
              onClick={() => setDiaryOpen((v) => !v)}
              onBlur={() => setDiaryOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDiaryOpen(false);
              }}
            />
            {diaryOpen && <span className="work-diary-note">{diaryInfo}</span>}
          </span>
        )}
        <span className="work-name" title={work.name} onDoubleClick={() => onAction({ kind: 'name', id: work.id })}>
          {work.name}
        </span>
      </div>
    </article>
  );
}

/** 이름·이동·복제는 작은 입력 창에서 확인하고 확정한다. */
function ProjectDialog({
  action,
  onAction,
  onClose,
}: {
  action: Action;
  onAction: (a: Action) => void;
  onClose: () => void;
}) {
  // 필요한 값만 구독한다(store 전체를 구독하면 창이 열린 동안 무엇이 바뀌든 다시 그린다).
  const works = useStore((st) => st.works);
  const folders = useStore((st) => st.folders);
  const diaries = useStore((st) => st.diaries);
  const projectView = useStore((st) => st.projectView);
  // 액션은 바뀌지 않는 함수라 구독하지 않고 꺼내 쓴다.
  const s = useStore.getState();
  const work = works.find((w) => w.id === action.id);
  const folder = folders.find((f) => f.id === action.id);
  const [name, setName] = useState(
    action.kind === 'folder-name' ? (folder?.name ?? '') : action.kind === 'name' ? (work?.name ?? '') : '',
  );
  const [choice, setChoice] = useState(
    action.kind === 'move' ? (work?.folderId ?? '') : (diaries.find((d) => d.id !== work?.diaryId)?.id ?? ''),
  );
  const title: Record<ActionKind, string> = {
    'folder-new': t('폴더 만들기', 'New folder'),
    'folder-name': t('폴더 이름 바꾸기', 'Rename folder'),
    'folder-remove': t('폴더 삭제', 'Delete folder'),
    menu: work?.name ?? t('작업', 'Work'),
    name: t('작업 이름 바꾸기', 'Rename work'),
    move: t('폴더로 이동', 'Move to folder'),
    'copy-diary': t('다른 다이어리로 복제', 'Copy to another diary'),
  };

  const save = () => {
    if (action.kind === 'folder-new') {
      const id = s.addFolder(name);
      if (id) s.patch({ projectView: { ...projectView, folderId: id, query: '' } });
    } else if (action.kind === 'folder-name' && folder) s.renameFolder(folder.id, name);
    else if (action.kind === 'folder-remove' && folder) s.removeFolder(folder.id);
    else if (action.kind === 'name' && work) s.renameWork(work.id, name);
    else if (action.kind === 'move' && work) s.moveWorkToFolder(work.id, choice || null);
    else if (action.kind === 'copy-diary' && work) {
      const id = s.duplicateWork(work.id, choice);
      if (id) {
        s.openWork(id);
        s.showToast(t('사본을 만들었어요. 페이지 배치를 확인해 주세요.', 'Copy made. Check how the pages fit.'));
      }
    }
    onClose();
  };

  return (
    <Modal title={title[action.kind]} onClose={onClose}>
      {action.kind === 'menu' && work ? (
        <div className="project-menu">
          <button className="ghost" onClick={() => onAction({ kind: 'name', id: work.id })}>
            {t('이름 바꾸기', 'Rename')}
          </button>
          <button
            className="ghost"
            onClick={() => {
              s.duplicateWork(work.id);
              s.showToast(t('사본을 만들었어요.', 'Copy made.'));
              onClose();
            }}
          >
            {t('복제', 'Duplicate')}
          </button>
          <button className="ghost" onClick={() => onAction({ kind: 'copy-diary', id: work.id })}>
            {t('다른 다이어리로 복제', 'Copy to another diary')}
          </button>
          <button className="ghost" onClick={() => onAction({ kind: 'move', id: work.id })}>
            {t('폴더로 이동', 'Move to folder')}
          </button>
          <button
            className="ghost"
            onClick={() => {
              saveWorksToFile([work.id], work.name);
              onClose();
            }}
          >
            {t('파일로 저장', 'Save to file')}
          </button>
          <button
            className="ghost danger"
            onClick={() => {
              s.trashWorkById(work.id);
              onClose();
            }}
          >
            {t('휴지통으로', 'Move to trash')}
          </button>
        </div>
      ) : (
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {action.kind === 'folder-remove' ? (
            <p>
              {t(
                `‘${folder?.name}’ 폴더를 지워요. 그 안의 작업 ${works.filter((w) => w.folderId === folder?.id).length}개는 ‘분류 없음’으로 옮겨지며 그대로 남아요.`,
                `Delete the folder “${folder?.name}”. Its ${works.filter((w) => w.folderId === folder?.id).length} work(s) move to Unfiled and stay as they are.`,
              )}
            </p>
          ) : action.kind === 'move' ? (
            <label>
              {t('이동할 폴더', 'Folder')}
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">{t('분류 없음', 'Unfiled')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          ) : action.kind === 'copy-diary' ? (
            <>
              <label>
                {t('사본의 다이어리', 'Diary for the copy')}
                <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!choice}>
                  {!choice && <option value="">{t('다른 다이어리가 없어요', 'No other diary')}</option>}
                  {diaries
                    .filter((d) => d.id !== work?.diaryId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.width}×{d.height}mm
                      </option>
                    ))}
                </select>
              </label>
              <p className="modal-note">
                {t(
                  '원본은 그대로 남아요. 내용은 같은 위치에 복사되므로 크기가 달라지면 배치가 어긋날 수 있어요. 복제 후 확인해 주세요.',
                  'The original stays as it is. Everything is copied to the same position, so things may not fit if the size differs. Check after copying.',
                )}
              </p>
            </>
          ) : (
            <label>
              {t('이름', 'Name')}
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
          )}
          <div className="project-form-actions">
            <button type="button" className="ghost" onClick={onClose}>
              {t('취소', 'Cancel')}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={
                action.kind === 'copy-diary'
                  ? !choice
                  : ['folder-new', 'folder-name', 'name'].includes(action.kind) && !name.trim()
              }
            >
              {action.kind === 'folder-remove'
                ? t('폴더만 삭제', 'Delete folder only')
                : action.kind === 'copy-diary'
                  ? t('복제하고 열기', 'Copy and open')
                  : action.kind === 'move'
                    ? t('이동', 'Move')
                    : t('저장', 'Save')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
