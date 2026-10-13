import { useEffect, useState } from 'react';
import { LIBRARY_TAB } from '../core/workspace';
import { useActiveDiary, useActiveWork, useCursor, useStore } from '../store';
import { boot, flushAutosave, startAutosave } from './persist';
import { startCloudSync } from './cloudSync';
import { SyncAsk } from './SyncAsk';
import { Home } from './Home';
import { Editor } from './Editor';
import { EditorRail } from './EditorRail';
import { PrintMain, PrintRail } from './Print';
import { LIBRARY_RAIL, LibraryMain, type LibrarySection } from './Library';
import { DiaryChip } from './DiaryChip';
import { Modal } from './Modal';
import { Onboarding } from './Onboarding';
import { Toast } from './Toast';
import { RingsLogo } from './icons';
import { CloudPanel } from './CloudPanel';

/**
 * 앱 틀(리뉴얼, design/리뉴얼/디자인.md ‘앱 틀’·‘탭’).
 *
 * 상단 바와 왼쪽 레일이 같은 그레이지로 이어진 ㄱ자 틀이 모든 화면을 감싸고, 그 안에
 * 아이보리 작업 공간이 들어간다. 상단 바의 이름 자리가 탭 줄이다 — 맨 앞에 닫을 수 없는
 * Library 탭, 그 뒤로 연 작업 탭들. 레일은 지금 탭에 맞는 메뉴만 보인다.
 *
 * 홈(토성)은 탭이 아니다 — 앱을 처음 열 때 보이고 로고를 누르면 간다.
 */
type Screen = 'home' | 'tabs' | 'learn';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [section, setSection] = useState<LibrarySection>('projects');
  const [notice, setNotice] = useState<string | null>(null);
  const [bootError, setBootError] = useState(false);
  const ready = useStore((s) => s.ready);
  const tabs = useStore((s) => s.tabs);
  const startNewWork = useStore((s) => s.startNewWork);
  const activateTab = useStore((s) => s.activateTab);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let stopSync: (() => void) | null = null;
    let alive = true;
    void boot().then(({ skippedNotebooks }) => {
      if (!alive) return;
      stop = startAutosave();
      // 계정 동기화는 이 기기 자료를 다 읽은 뒤에 시작한다(빈 상태를 서버와 맞추지 않게).
      stopSync = startCloudSync();
      if (skippedNotebooks.length > 0) {
        setNotice(`노트 ${skippedNotebooks.length}개(${skippedNotebooks.join(', ')})는 새 버전으로 옮기지 않았어요. 옛 버전에는 그대로 있어요.`);
      }
    }).catch(() => {
      if (alive) setBootError(true);
    });
    return () => {
      alive = false;
      stop?.();
      stopSync?.();
    };
  }, []);

  // 탭을 고르면(작업을 열면) 홈에서 탭 화면으로 넘어간다.
  useEffect(() => {
    if (ready && tabs.active !== LIBRARY_TAB) setScreen('tabs');
  }, [ready, tabs.active, tabs.open.length]);

  if (bootError) return <div className="app-loading"><p>저장한 작업을 읽지 못했어요.</p><button className="primary" onClick={() => window.location.reload()}>다시 열기</button></div>;
  if (!ready) return <div className="app-loading">Rings</div>;

  const onLibrary = screen === 'tabs' && tabs.active === LIBRARY_TAB;

  return (
    <div className="app-frame">
      <header className="frame-top">
        <button className="frame-logo" onClick={() => setScreen('home')} title="Home">
          <RingsLogo />
        </button>
        {screen === 'home' ? (
          <div className="frame-brand">
            <span className="brand-name">Rings</span>
            <span className="brand-tag">make your own system</span>
          </div>
        ) : (
          <TabBar
            onLibrary={() => {
              activateTab(LIBRARY_TAB);
              setScreen('tabs');
            }}
            libraryOn={onLibrary}
            onNew={() => {
              // 다이어리가 없으면 온보딩 창이 뜬다(작업은 등록한 뒤에 열린다).
              if (startNewWork()) setScreen('tabs');
            }}
          />
        )}
        <div className="frame-right">
          {screen === 'tabs' && tabs.active !== LIBRARY_TAB && (
            <WorkStatus
              onManageDiaries={() => {
                activateTab(LIBRARY_TAB);
                setSection('diaries');
              }}
            />
          )}
          {onLibrary && <SaveState />}
          <CloudPanel />
        </div>
      </header>

      <div className="frame-body">
        {screen === 'tabs' && (
          <nav className="frame-rail">
            {onLibrary ? <LibraryRail section={section} setSection={setSection} /> : <WorkRail />}
          </nav>
        )}
        <main className={`frame-main ${screen === 'home' ? 'is-home' : ''}`}>
          {screen === 'home' && (
            <Home
              onCreate={() => {
                // 처음이면 홈 위에 첫 다이어리 온보딩이 뜬다(기본계획 7장: 처음 Create를 누를 때).
                if (startNewWork()) setScreen('tabs');
              }}
              onLibrary={() => {
                activateTab(LIBRARY_TAB);
                setSection('projects');
                setScreen('tabs');
              }}
              onLearn={() => setScreen('learn')}
            />
          )}
          {screen === 'learn' && <LibraryMain section="learn" />}
          {screen === 'tabs' && (onLibrary ? <LibraryMain section={section} /> : <EditorArea />)}
        </main>
      </div>

      <PendingOpen />
      <Onboarding />
      <SyncAsk />
      {notice && (
        <Modal title="옮기기 안내" onClose={() => setNotice(null)}>
          <p className="modal-note">{notice}</p>
          <button className="primary" onClick={() => setNotice(null)}>
            확인
          </button>
        </Modal>
      )}
      <Toast />
    </div>
  );
}

/** 작업 탭이 열려 있지만 그 작업이 사라졌으면(휴지통 등) 빈 안내를 보여준다. */
function EditorArea() {
  const work = useActiveWork();
  const printing = useCursor()?.printing ?? false;
  if (!work) return <p className="muted center">열린 작업이 없어요.</p>;
  // 작업 탭 안에서 편집 ↔ Print가 바뀐다(세부계획 A14 결정 2026-10-06).
  return printing ? <PrintMain key={work.id} /> : <Editor key={work.id} />;
}

/** 작업 탭의 레일 — 편집 중이면 편집 도구, Print 중이면 Paper · Sides · Layout · Marks. */
function WorkRail() {
  const printing = useCursor()?.printing ?? false;
  return printing ? <PrintRail /> : <EditorRail />;
}

function TabBar({ onLibrary, libraryOn, onNew }: { onLibrary: () => void; libraryOn: boolean; onNew: () => void }) {
  const tabs = useStore((s) => s.tabs);
  const works = useStore((s) => s.works);
  const activateTab = useStore((s) => s.activateTab);
  const closeWorkTab = useStore((s) => s.closeWorkTab);
  return (
    <div className="tab-bar">
      <button className={`tab fixed ${libraryOn ? 'on' : ''}`} onClick={onLibrary}>
        Library
      </button>
      {tabs.open.map((id) => {
        const work = works.find((w) => w.id === id);
        if (!work) return null;
        return (
          <span key={id} className={`tab ${tabs.active === id ? 'on' : ''}`}>
            <button className="tab-name" onClick={() => activateTab(id)} title={work.name}>
              {work.name}
            </button>
            <button className="tab-close" onClick={() => closeWorkTab(id)} title="탭 닫기" aria-label={`${work.name} 탭 닫기`}>
              ×
            </button>
          </span>
        );
      })}
      <button className="tab add" onClick={onNew} title="새 작업">
        +
      </button>
    </div>
  );
}

/** 작업과 Library 모두 실제 자동 저장 결과·실패 시 다시 저장을 보여준다. */
function SaveState() {
  const saveStatus = useStore((s) => s.saveStatus);
  return (
    <>
      <span className={`save-state ${saveStatus === 'error' ? 'error' : ''}`} role="status" aria-live="polite" title="이 브라우저에 저장돼요">
        {saveStatus === 'saved' ? '☁ 저장됨' : saveStatus === 'error' ? '저장 실패' : '저장 중…'}
      </span>
      {saveStatus === 'error' && <button className="ghost" onClick={() => void flushAutosave()}>다시 저장</button>}
    </>
  );
}

/** 고른 작업 탭의 이름·저장 상태·다이어리 칩·Print(상단 바 오른쪽). */
function WorkStatus({ onManageDiaries }: { onManageDiaries: () => void }) {
  const work = useActiveWork();
  const diary = useActiveDiary();
  const renameWork = useStore((s) => s.renameWork);
  const openPrint = useStore((s) => s.openPrint);
  const printing = useCursor()?.printing ?? false;
  if (!work) return null;
  return (
    <>
      <button
        className="ghost work-title"
        title="이름 바꾸기"
        onClick={() => {
          const name = window.prompt('작업 이름', work.name);
          if (name) renameWork(work.id, name);
        }}
      >
        {work.name}
      </button>
      <SaveState />
      {diary && <DiaryChip work={work} diary={diary} onManage={onManageDiaries} />}
      {!printing && (
        <button className="primary print-btn" onClick={() => openPrint()} title="종이에 어떻게 찍을지 정하고 PDF로">
          Print
        </button>
      )}
    </>
  );
}

function LibraryRail({ section, setSection }: { section: LibrarySection; setSection: (s: LibrarySection) => void }) {
  return (
    <div className="rail-icons">
      {LIBRARY_RAIL.map((it) => (
        <button
          key={it.id}
          className={`rail-icon text ${section === it.id ? 'on' : ''}`}
          onClick={() => setSection(it.id)}
          title={it.label}
          aria-label={it.label}
        >
          {it.icon}
        </button>
      ))}
      <div className="rail-spacer" />
      <button className={`rail-icon text ${section === 'learn' ? 'on' : ''}`} onClick={() => setSection('learn')} title="Learn" aria-label="Learn">
        ?
      </button>
    </div>
  );
}

/** 탭이 꽉 찼을 때 — 가장 오래 안 본 탭을 닫고 열지 묻는다(기능후보 11). */
function PendingOpen() {
  const pending = useStore((s) => s.pendingOpen);
  const works = useStore((s) => s.works);
  const resolve = useStore((s) => s.resolvePendingOpen);
  if (!pending) return null;
  const victim = works.find((w) => w.id === pending.victim);
  return (
    <Modal title="탭이 꽉 찼어요" onClose={() => resolve(false)}>
      <p className="modal-note">
        작업 탭은 10개까지 열 수 있어요. 가장 오래 안 본 ‘{victim?.name ?? ''}’ 탭을 닫고 열까요?
      </p>
      <div className="card-dialog-actions">
        <button className="ghost" onClick={() => resolve(false)}>
          취소
        </button>
        <button className="primary" onClick={() => resolve(true)}>
          닫고 열기
        </button>
      </div>
    </Modal>
  );
}
