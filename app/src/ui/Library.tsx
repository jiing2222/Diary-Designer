import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { facesOf } from '../store';
import { daysLeft, isTrashed } from '../core/library';
import { diarySizeLabel } from '../core/diary';
import { resolveObjectColors } from '../core/colors';
import { InsertView } from './InsertView';
import { FontManagePanel, ImageManagePanel } from './DesignLibraryDialog';
import type { Work } from '../core/work';
import type { DotGrid } from '../core/grid';

/**
 * Library 탭(리뉴얼, 세부계획 B). 맨 앞에 고정된 탭이다(디자인.md ‘탭’).
 *
 * 2단계에서는 작업을 열고 정리하는 데 꼭 필요한 것만 둔다 — 작업 목록·휴지통·이미지·글꼴.
 * 폴더·다이어리·팔레트 저장은 7단계에서 채운다.
 */
export type LibrarySection = 'projects' | 'diaries' | 'images' | 'fonts' | 'colors' | 'trash' | 'learn';

export const LIBRARY_RAIL: { id: LibrarySection; label: string; icon: string }[] = [
  { id: 'projects', label: 'Projects', icon: '▤' },
  { id: 'diaries', label: 'Diaries', icon: '◎' },
  { id: 'images', label: 'Images', icon: '▣' },
  { id: 'fonts', label: 'Fonts', icon: 'Aa' },
  { id: 'colors', label: 'Colors', icon: '◐' },
  { id: 'trash', label: 'Trash', icon: '⌫' },
];

export function LibraryMain({ section }: { section: LibrarySection }) {
  if (section === 'projects') return <Projects />;
  if (section === 'trash') return <Trash />;
  if (section === 'images') return <div className="library-pane"><h2>Images</h2><ImageManagePanel /></div>;
  if (section === 'fonts') return <div className="library-pane"><h2>Fonts</h2><FontManagePanel /></div>;
  if (section === 'learn') return <Soon title="Learn" note="앱 사용법, 인쇄 팁, 다이어리 종이 이야기를 준비하고 있어요." />;
  if (section === 'diaries') return <Diaries />;
  return <Soon title="Colors" note="팔레트를 저장해 두는 곳이에요. 곧 열려요." />;
}

function Soon({ title, note }: { title: string; note: string }) {
  return (
    <div className="library-pane soon">
      <h2>{title}</h2>
      <p className="muted">{note}</p>
    </div>
  );
}

function Projects() {
  const works = useStore((s) => s.works);
  const createWork = useStore((s) => s.createWork);
  const live = useMemo(
    () => works.filter((w) => !isTrashed(w)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [works],
  );
  return (
    <div className="library-pane">
      <div className="library-head">
        <h2>Projects</h2>
        <button className="primary" onClick={() => createWork()}>
          + 새 작업
        </button>
      </div>
      {live.length === 0 ? (
        <p className="muted">아직 작업이 없어요. ‘새 작업’으로 시작해요.</p>
      ) : (
        <div className="work-grid">
          {live.map((w) => (
            <WorkCard key={w.id} work={w} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 작업 카드 — 앞쪽 두 면 썸네일, 페이지 수, 다이어리 색 점(이름은 마우스를 올리면). */
function WorkCard({ work }: { work: Work }) {
  const openWork = useStore((s) => s.openWork);
  const renameWork = useStore((s) => s.renameWork);
  const duplicateWork = useStore((s) => s.duplicateWork);
  const trashWorkById = useStore((s) => s.trashWorkById);
  const diary = useStore((s) => s.diaries.find((d) => d.id === work.diaryId));
  const today = useStore((s) => s.today);
  const faces = facesOf(work, today);

  return (
    <div className="work-card">
      <button className="work-thumb" onClick={() => openWork(work.id)} title="열기">
        {diary &&
          faces.slice(0, 2).map((f) => (
            <svg key={f.key} viewBox={`0 0 ${diary.width} ${diary.height}`} className="work-thumb-face">
              <rect width={diary.width} height={diary.height} className="sheet-bg" />
              <InsertView
                insert={diary}
                grid={f.background as DotGrid}
                objects={resolveObjectColors(f.objects, work.palette)}
                safeZoneWidth={diary.punch.safeZoneWidth}
                mode="print"
                calendarContext={{ year: f.month.year, page: f.month.month - 1 }}
              />
            </svg>
          ))}
        <span className="work-pages">{faces.length}</span>
      </button>
      <div className="work-meta">
        {diary && <span className="diary-dot" style={{ background: diary.color }} title={`${diary.name} · ${diarySizeLabel(diary)}`} />}
        <span className="work-name" onDoubleClick={() => {
          const name = window.prompt('작업 이름', work.name);
          if (name) renameWork(work.id, name);
        }}>{work.name}</span>
        <span className="work-actions">
          <button className="ghost" title="이름 바꾸기" onClick={() => {
            const name = window.prompt('작업 이름', work.name);
            if (name) renameWork(work.id, name);
          }}>✎</button>
          <button className="ghost" title="복제" onClick={() => duplicateWork(work.id)}>⧉</button>
          <button className="ghost danger" title="휴지통으로" onClick={() => trashWorkById(work.id)}>×</button>
        </span>
      </div>
    </div>
  );
}

function Trash() {
  const works = useStore((s) => s.works);
  const restore = useStore((s) => s.restoreWorkById);
  const destroy = useStore((s) => s.deleteWorkForever);
  const [now] = useState(() => new Date().toISOString());
  const trashed = works.filter(isTrashed);
  return (
    <div className="library-pane">
      <div className="library-head">
        <h2>Trash</h2>
        {trashed.length > 0 && (
          <button
            className="ghost"
            onClick={() => {
              if (window.confirm(`휴지통의 작업 ${trashed.length}개를 완전히 지울까요? 되돌릴 수 없어요.`)) {
                trashed.forEach((w) => destroy(w.id));
              }
            }}
          >
            휴지통 비우기
          </button>
        )}
      </div>
      <p className="muted">지운 작업은 30일 뒤 완전히 지워져요.</p>
      {trashed.map((w) => (
        <div key={w.id} className="trash-row">
          <span className="work-name">{w.name}</span>
          <span className="muted">{daysLeft(w, now)}일 남음</span>
          <button className="ghost" onClick={() => restore(w.id)}>되살리기</button>
          <button
            className="ghost danger"
            onClick={() => {
              if (window.confirm(`‘${w.name}’을(를) 완전히 지울까요? 되돌릴 수 없어요.`)) destroy(w.id);
            }}
          >
            영구 삭제
          </button>
        </div>
      ))}
    </div>
  );
}

/** 2단계의 다이어리 목록 — 보기와 기본 다이어리 고르기만. 등록·실측 수정은 7단계. */
function Diaries() {
  const diaries = useStore((s) => s.diaries);
  const defaultId = useStore((s) => s.defaultDiaryId);
  const setDefault = useStore((s) => s.setDefaultDiary);
  return (
    <div className="library-pane">
      <h2>Diaries</h2>
      {diaries.length === 0 && <p className="muted">아직 다이어리가 없어요. 새 작업을 만들면 M6 다이어리가 하나 생겨요.</p>}
      {diaries.map((d) => (
        <div key={d.id} className="trash-row">
          <span className="diary-dot" style={{ background: d.color }} />
          <span className="work-name">{d.name}</span>
          <span className="muted">{diarySizeLabel(d)}</span>
          {d.id === defaultId ? (
            <span className="muted">★ 기본</span>
          ) : (
            <button className="ghost" onClick={() => setDefault(d.id)}>기본으로</button>
          )}
        </div>
      ))}
    </div>
  );
}
