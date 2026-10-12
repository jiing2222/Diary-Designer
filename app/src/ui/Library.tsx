import { useState } from 'react';
import { useStore } from '../store';
import { daysLeft, isTrashed } from '../core/library';
import { FontManagePanel, ImageManagePanel } from './DesignLibraryDialog';
import { Projects } from './Projects';
import { Diaries } from './Diaries';

/**
 * Library 탭(리뉴얼, 세부계획 B). 맨 앞에 고정된 탭이다(디자인.md ‘탭’).
 *
 * Projects는 7-1에서 폴더·검색·정렬·다이어리 필터와 복제를 연결했다.
 * 다이어리 관리·팔레트·자료 정책은 뒤의 7단계 작업에서 채운다.
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

