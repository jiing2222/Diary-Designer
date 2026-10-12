import { useMemo, useState } from 'react';
import { facesOf, useStore } from '../store';
import { DEFAULT_PROJECT_VIEW, isTrashed, projectsFor, type ProjectSort } from '../core/library';
import { diarySizeLabel } from '../core/diary';
import { resolveRuleColors } from '../core/colorRules';
import { resolveObjectColors } from '../core/colors';
import type { Work } from '../core/work';
import { InsertView } from './InsertView';
import { LegacyLibrary } from './LegacyLibrary';
import { Modal } from './Modal';

type ActionKind = 'folder-new' | 'folder-name' | 'folder-remove' | 'menu' | 'name' | 'move' | 'copy-diary';
type Action = { kind: ActionKind; id?: string };

/** Projects: 폴더는 정리를, 다이어리는 종이 치수를 맡는다(세부계획 B2). */
export function Projects() {
  const works = useStore((s) => s.works);
  const folders = useStore((s) => s.folders);
  const diaries = useStore((s) => s.diaries);
  const view = useStore((s) => s.projectView);
  const patch = useStore((s) => s.patch);
  const startNewWork = useStore((s) => s.startNewWork);
  const [action, setAction] = useState<Action | null>(null);
  const live = useMemo(() => works.filter((w) => !isTrashed(w)), [works]);
  const shown = useMemo(() => projectsFor(works, view), [works, view]);
  const setView = (p: Partial<typeof view>) => patch({ projectView: { ...view, ...p } });
  const folder = folders.find((f) => f.id === view.folderId);
  const title = view.folderId === null ? '폴더 밖' : (folder?.name ?? 'Projects');

  return (
    <div className="library-projects">
      <aside className="projects-panel" aria-label="작업 필터">
        <h2>Projects</h2>
        <button
          className={`project-filter ${view.folderId === undefined ? 'on' : ''}`}
          onClick={() => setView({ folderId: undefined })}
        >
          <span>모든 작업</span>
          <span className="filter-count">{live.length}</span>
        </button>
        <button
          className={`project-filter ${view.folderId === null ? 'on' : ''}`}
          onClick={() => setView({ folderId: null })}
        >
          <span>폴더 밖</span>
          <span className="filter-count">{live.filter((w) => !w.folderId).length}</span>
        </button>
        <div className="projects-panel-heading">
          <h3>폴더</h3>
          <button
            className="ghost"
            aria-label="폴더 만들기"
            title="폴더 만들기"
            onClick={() => setAction({ kind: 'folder-new' })}
          >
            +
          </button>
        </div>
        {folders.map((f) => (
          <div className="project-folder" key={f.id}>
            <button
              className={`project-filter ${view.folderId === f.id ? 'on' : ''}`}
              onClick={() => setView({ folderId: f.id })}
            >
              <span>{f.name}</span>
              <span className="filter-count">{live.filter((w) => w.folderId === f.id).length}</span>
            </button>
            <span className="folder-actions">
              <button
                className="ghost"
                aria-label={`${f.name} 폴더 이름 바꾸기`}
                title="이름 바꾸기"
                onClick={() => setAction({ kind: 'folder-name', id: f.id })}
              >
                ✎
              </button>
              <button
                className="ghost"
                aria-label={`${f.name} 폴더 삭제`}
                title="폴더 삭제"
                onClick={() => setAction({ kind: 'folder-remove', id: f.id })}
              >
                ×
              </button>
            </span>
          </div>
        ))}
        <h3 className="projects-panel-heading">다이어리</h3>
        <button
          className={`project-filter ${view.diaryId === null ? 'on' : ''}`}
          onClick={() => setView({ diaryId: null })}
        >
          모든 다이어리
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
            {title} <span className="projects-count">{shown.length}개</span>
          </h2>
          <button className="primary" onClick={() => startNewWork()}>
            + 새 작업
          </button>
        </div>
        <div className="projects-toolbar">
          <input
            type="search"
            aria-label="작업 검색"
            placeholder="작업 이름 검색"
            value={view.query}
            onChange={(e) => setView({ query: e.target.value })}
          />
          <select
            aria-label="작업 정렬"
            value={view.sort}
            onChange={(e) => setView({ sort: e.target.value as ProjectSort })}
          >
            <option value="updated">최근 수정순</option>
            <option value="created">최근 만든순</option>
            <option value="name">이름순</option>
          </select>
        </div>
        <LegacyLibrary />
        {shown.length > 0 ? (
          <div className="work-grid">
            {shown.map((w) => (
              <WorkCard key={w.id} work={w} onAction={setAction} />
            ))}
          </div>
        ) : (
          <div className="projects-empty">
            <p className="muted">
              {live.length === 0
                ? '아직 작업이 없어요. 새 작업으로 시작해요.'
                : folder && !view.query.trim() && view.diaryId === null
                  ? '아직 이 폴더에 작업이 없어요. 작업 메뉴에서 폴더로 옮길 수 있어요.'
                  : '조건에 맞는 작업이 없어요.'}
            </p>
            {live.length > 0 && (
              <button
                className="ghost"
                onClick={() => patch({ projectView: { ...DEFAULT_PROJECT_VIEW, sort: view.sort } })}
              >
                모든 작업 보기
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

/** 작업 카드에는 이름과 다이어리 색 점, 앞 두 페이지를 둔다. 정리는 ⋯에서 한다. */
function WorkCard({ work, onAction }: { work: Work; onAction: (a: Action) => void }) {
  const openWork = useStore((s) => s.openWork);
  const openPrint = useStore((s) => s.openPrint);
  const diary = useStore((s) => s.diaries.find((d) => d.id === work.diaryId));
  const today = useStore((s) => s.today);
  const faces = useMemo(() => facesOf(work, today), [work, today]);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const diaryInfo = diary ? `${diary.name} · ${diary.width}×${diary.height}mm` : '';

  return (
    <article className="work-card" aria-label={work.name}>
      <div className="work-preview">
        <button className="work-thumb" onClick={() => openWork(work.id)} aria-label={`${work.name} 열기`}>
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
          <span className="work-pages">{faces.length}페이지</span>
        </button>
        <div className="work-actions">
          <button className="ghost" onClick={() => openWork(work.id)} aria-label={`${work.name} 편집`}>
            열기
          </button>
          <button className="ghost work-print" onClick={() => openPrint(work.id)} aria-label={`${work.name} Print`}>
            Print
          </button>
          <button
            className="ghost"
            onClick={() => onAction({ kind: 'menu', id: work.id })}
            aria-label={`${work.name} 작업 메뉴`}
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
              aria-label={`${diary.name} 다이어리 정보`}
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
    'folder-new': '폴더 만들기',
    'folder-name': '폴더 이름 바꾸기',
    'folder-remove': '폴더 삭제',
    menu: work?.name ?? '작업',
    name: '작업 이름 바꾸기',
    move: '폴더로 이동',
    'copy-diary': '다른 다이어리로 복제',
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
        s.showToast('사본을 만들었어요. 페이지 배치를 확인해 주세요.');
      }
    }
    onClose();
  };

  return (
    <Modal title={title[action.kind]} onClose={onClose}>
      {action.kind === 'menu' && work ? (
        <div className="project-menu">
          <button className="ghost" onClick={() => onAction({ kind: 'name', id: work.id })}>
            이름 바꾸기
          </button>
          <button
            className="ghost"
            onClick={() => {
              s.duplicateWork(work.id);
              s.showToast('사본을 만들었어요.');
              onClose();
            }}
          >
            복제
          </button>
          <button className="ghost" onClick={() => onAction({ kind: 'copy-diary', id: work.id })}>
            다른 다이어리로 복제
          </button>
          <button className="ghost" onClick={() => onAction({ kind: 'move', id: work.id })}>
            폴더로 이동
          </button>
          <button
            className="ghost danger"
            onClick={() => {
              s.trashWorkById(work.id);
              onClose();
            }}
          >
            휴지통으로
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
              ‘{folder?.name}’ 폴더를 지워요. 그 안의 작업 {works.filter((w) => w.folderId === folder?.id).length}개는
              폴더 밖으로 옮겨지며 그대로 남아요.
            </p>
          ) : action.kind === 'move' ? (
            <label>
              이동할 폴더
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">폴더 밖</option>
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
                사본의 다이어리
                <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!choice}>
                  {!choice && <option value="">다른 다이어리가 없어요</option>}
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
                원본은 그대로 남아요. 내용은 같은 위치에 복사되므로 크기가 달라지면 배치가 어긋날 수 있어요. 복제 후
                확인해 주세요.
              </p>
            </>
          ) : (
            <label>
              이름
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
          )}
          <div className="project-form-actions">
            <button type="button" className="ghost" onClick={onClose}>
              취소
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
                ? '폴더만 삭제'
                : action.kind === 'copy-diary'
                  ? '복제하고 열기'
                  : action.kind === 'move'
                    ? '이동'
                    : '저장'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
