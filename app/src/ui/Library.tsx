import { useRef, useState } from 'react';
import { useStore } from '../store';
import { daysLeft, isTrashed, rangeIds } from '../core/library';
import { LibraryFonts, LibraryImages } from './LibraryAssets';
import { LibraryColors } from './LibraryColors';
import { Projects } from './Projects';
import { Diaries } from './Diaries';
import { DiaryIcon, FontsIcon, ImageIcon, PaletteIcon, ProjectsIcon, TrashIcon } from './icons';
import { PinStudio } from './PinStudio';
import { useIsDeveloper } from './developer';
import { t } from '../lang';

/**
 * Library 탭(리뉴얼, 세부계획 B). 맨 앞에 고정된 탭이다(디자인.md ‘탭’).
 *
 * Projects는 7-1, Diaries는 7-2, Images·Fonts는 7-3(ui/LibraryAssets), Colors는 7-4(ui/LibraryColors)에서 채웠다.
 */
export type LibrarySection = 'projects' | 'diaries' | 'images' | 'fonts' | 'colors' | 'trash' | 'learn' | 'pins';

export const LIBRARY_RAIL: { id: LibrarySection; label: string; icon: React.ReactNode }[] = [
  { id: 'projects', label: 'Projects', icon: <ProjectsIcon /> },
  { id: 'diaries', label: 'Diaries', icon: <DiaryIcon /> },
  { id: 'images', label: 'Images', icon: <ImageIcon /> },
  { id: 'fonts', label: 'Fonts', icon: <FontsIcon /> },
  { id: 'colors', label: 'Colors', icon: <PaletteIcon /> },
  { id: 'trash', label: 'Trash', icon: <TrashIcon /> },
];

export function LibraryMain({ section }: { section: LibrarySection }) {
  if (section === 'projects') return <Projects />;
  if (section === 'trash') return <Trash />;
  if (section === 'images') return <LibraryImages />;
  if (section === 'fonts') return <LibraryFonts />;
  if (section === 'learn') return <Soon title="Learn" note={t('앱 사용법, 인쇄 팁, 다이어리 종이 이야기를 준비하고 있어요.', 'How-tos, printing tips and stories about planner paper are coming soon.')} />;
  if (section === 'diaries') return <Diaries />;
  if (section === 'pins') return <DeveloperOnly />;
  return <LibraryColors />;
}

/** 개발자 계정이 아니면(로그아웃 등) Pins 자리를 비운다 — 레일에서 빠져도 이 자리에 머물러 있을 수 있다. */
function DeveloperOnly() {
  return useIsDeveloper() ? <PinStudio /> : <Soon title="Pins" note={t('개발자 계정으로 로그인하면 보여요.', 'Sign in with a developer account to see this.')} />;
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
  // 고른 것 — 있으면 머리줄 단추가 ‘고른 것’에 대해 동작한다. 없으면 전부(휴지통 비우기).
  const [picked, setPicked] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const trashed = works.filter(isTrashed);
  const order = trashed.map((w) => w.id);
  const chosen = order.filter((id) => picked.includes(id));
  const pick = (id: string, range: boolean) => {
    setPicked(range ? [...new Set([...chosen, ...rangeIds(order, anchor.current, id)])] : chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
    anchor.current = id;
  };
  const destroyAll = (ids: string[]) => {
    if (window.confirm(t(`작업 ${ids.length}개를 완전히 지울까요? 되돌릴 수 없어요.`, `Permanently delete ${ids.length} work(s)? This can't be undone.`))) {
      ids.forEach((id) => destroy(id));
      setPicked([]);
    }
  };
  return (
    <div className="library-pane">
      <div className="library-head">
        <h2>Trash</h2>
        {chosen.length > 0 ? (
          <span className="bulk-bar">
            <b>{t(`${chosen.length}개 고름`, `${chosen.length} selected`)}</b>
            <button
              className="ghost"
              onClick={() => {
                chosen.forEach((id) => restore(id));
                setPicked([]);
              }}
            >
              {t('되살리기', 'Restore')}
            </button>
            <button className="ghost danger" onClick={() => destroyAll(chosen)}>
              {t('영구 삭제', 'Delete forever')}
            </button>
            <button className="ghost" onClick={() => setPicked([])} aria-label={t('고르기 그만', 'Clear selection')}>
              ×
            </button>
          </span>
        ) : (
          trashed.length > 0 && (
            <button className="ghost danger" onClick={() => destroyAll(order)}>
              {t('휴지통 비우기', 'Empty trash')}
            </button>
          )
        )}
      </div>
      {trashed.length === 0 && <div className="empty-card">{t('휴지통이 비어 있어요.', 'The trash is empty.')}</div>}
      {/* 한 줄이 한 카드 — 고르기, 이름, 남은 날(작은 태그), 오른쪽 끝에 단추들(2026-10-13 디자인 정리). */}
      {trashed.map((w) => (
        <div key={w.id} className="trash-row">
          <input
            type="checkbox"
            checked={chosen.includes(w.id)}
            aria-label={t(`${w.name} 고르기`, `Select ${w.name}`)}
            onChange={() => {}}
            onClick={(e) => pick(w.id, e.shiftKey)}
          />
          <span className="trash-name">{w.name}</span>
          <span className="tag">{t(`${daysLeft(w, now)}일 남음`, `${daysLeft(w, now)} days left`)}</span>
          <span className="trash-actions">
            <button className="ghost" onClick={() => restore(w.id)}>
              {t('되살리기', 'Restore')}
            </button>
            <button className="ghost danger" onClick={() => destroyAll([w.id])}>
              {t('영구 삭제', 'Delete forever')}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
