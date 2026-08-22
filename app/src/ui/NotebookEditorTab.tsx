import { useEffect, useRef, useState } from 'react';
import {
  notebookPageWidth,
  paddedPageCount,
  type NotebookHalf,
  type NotebookSlotRef,
} from '../core/notebook';
import type { InsertSetting } from '../core/template';
import { useActive, useStore } from '../store';
import { InsertView } from './InsertView';
import { NotebookHalfEditor } from './NotebookHalfEditor';
import { NotebookMarginGuide } from './NotebookMarginGuide';
import { PX_PER_MM_AT_100 } from './pixels';

/** 지금 편집 중인 반쪽을 손보지 않은 채로 볼 때(작은 미리보기)의 배율. */
const THUMB_SCALE = PX_PER_MM_AT_100 * 0.6;
/** 지금 편집 중인 반쪽을 직접 그릴 때(NotebookHalfEditor)의 배율. */
const EDIT_SCALE = PX_PER_MM_AT_100 * 1.8;

function sameSlot(a: NotebookSlotRef, b: NotebookSlotRef): boolean {
  if (a.part === 'cover' && b.part === 'cover') return a.side === b.side;
  if (a.part === 'page' && b.part === 'page') return a.index === b.index;
  return false;
}

/**
 * 노트 제작 — 표지부터 마지막 쪽까지 스크롤하며 그린다.
 *
 * **한 판(왼쪽·오른쪽 쪽)을 화면에서는 나란히 보여주지만, 데이터로는
 * 완전히 남남이다.** 각 반쪽(NotebookHalf)이 자기 그린 것·격자·되돌리기
 * 이력을 따로 갖는다 — 속지의 앞면·뒷면과 같은 원리를 반쪽마다 적용한
 * 것이다. 인쇄될 때는 이 좌우 배치와 전혀 다른 자리(어느 물리적 장의
 * 앞/뒤 어느 쪽)에 놓인다 — `core/notebook`의 `notebookImposition`이 낸
 * 표를 인쇄 쪽(다음 단계)이 따른다.
 *
 * **한 번에 하나의 반쪽만 실제로 그릴 수 있다.** 나머지는 작은 정적
 * 미리보기(InsertView만 그리고 손은 못 댄다)이고, 누르면 그 반쪽으로
 * 옮겨간다 — 지금 손보던 반쪽이 있으면 먼저 그 결과를 저장한다
 * (`store.ts`의 `shadowTemplate`을 그대로 재사용 — `beginShadowEdit`
 * 으로 반쪽 하나를 그림자에 채워 넣고, `NotebookHalfEditor`가 그린다).
 */
export function NotebookEditorTab() {
  const active = useActive();
  const setNotebookHalf = useStore((s) => s.setNotebookHalf);
  const setNotebookPageCount = useStore((s) => s.setNotebookPageCount);
  const beginShadowEdit = useStore((s) => s.beginShadowEdit);
  const endShadowEdit = useStore((s) => s.endShadowEdit);

  const [editingSlot, setEditingSlot] = useState<NotebookSlotRef | null>(null);
  const editingSlotRef = useRef(editingSlot);
  editingSlotRef.current = editingSlot;

  /** 지금 그림자에 담긴 내용을 그 반쪽 자리에 저장하고 그림자를 끝낸다. */
  function finishEditing() {
    const slot = editingSlotRef.current;
    const shadow = useStore.getState().shadowTemplate;
    if (slot && shadow) {
      setNotebookHalf(slot, { objects: shadow.objects, dotGrid: shadow.dotGrid });
    }
    endShadowEdit();
    setEditingSlot(null);
  }

  // 다른 양식으로 넘어가거나(양식 목록에서 다른 노트를 고르는 등) 이 탭을
  // 벗어나면(App.tsx가 이 컴포넌트 자체를 걷어낸다) 손보던 반쪽을 저장하고
  // 끝낸다 — 안 그러면 그림자가 남아 다른 화면의 그리기가 엉뚱하게 그림자를
  // 향하게 된다(store.ts의 patchActiveSide가 그림자를 최우선으로 보기 때문).
  useEffect(() => {
    return () => {
      if (editingSlotRef.current) finishEditing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (!active || !active.cover || !active.pages) return null;

  const insertHeight = active.insert.height;
  const pageWidth = notebookPageWidth(active.insert.width);
  const halfInsert: InsertSetting = {
    ...active.insert,
    width: pageWidth,
    punch: { ...active.insert.punch, show: false },
  };

  function startEditing(target: NotebookSlotRef, half: NotebookHalf) {
    if (editingSlotRef.current) finishEditing(); // 딴 반쪽을 손보던 중이면 먼저 저장
    beginShadowEdit(halfInsert, half.dotGrid, half.objects.present, 'front');
    setEditingSlot(target);
  }

  function renderHalf(target: NotebookSlotRef, half: NotebookHalf, edge: 'left' | 'right', label: string) {
    const isEditing = editingSlot && sameSlot(editingSlot, target);
    return (
      <div className={`notebook-half-slot ${edge}`}>
        <span className="notebook-half-label">{label}</span>
        {isEditing ? (
          <NotebookHalfEditor scale={EDIT_SCALE} onFinish={finishEditing} />
        ) : (
          <button
            type="button"
            className="notebook-half-preview"
            onClick={() => startEditing(target, half)}
            title={`${label} — 눌러서 그리기`}
          >
            <svg
              viewBox={`0 0 ${pageWidth} ${insertHeight}`}
              width={pageWidth * THUMB_SCALE}
              height={insertHeight * THUMB_SCALE}
            >
              <rect x={0} y={0} width={pageWidth} height={insertHeight} className="sheet-bg" />
              <InsertView
                insert={{ width: pageWidth, height: insertHeight }}
                grid={half.dotGrid}
                objects={half.objects.present}
                safeZoneWidth={0}
              />
              <NotebookMarginGuide width={pageWidth} height={insertHeight} edge={edge} />
            </svg>
          </button>
        )}
      </div>
    );
  }

  const pages = active.pages;
  const spreadCount = pages.length / 2;

  return (
    <div className="notebook-editor">
      <PageCountField
        value={active.pageCount ?? pages.length}
        actualLength={pages.length}
        onCommit={setNotebookPageCount}
      />

      <div className="notebook-scroll">
        <section className="notebook-spread">
          <h3>표지</h3>
          <div className="notebook-spread-row">
            {renderHalf({ part: 'cover', side: 'back' }, active.cover.back, 'left', '뒤표지')}
            {renderHalf({ part: 'cover', side: 'front' }, active.cover.front, 'right', '앞표지')}
          </div>
        </section>

        {Array.from({ length: spreadCount }, (_, k) => (
          <section className="notebook-spread" key={k}>
            <div className="notebook-spread-row">
              {renderHalf({ part: 'page', index: 2 * k }, pages[2 * k], 'left', `${2 * k + 1}쪽`)}
              {renderHalf({ part: 'page', index: 2 * k + 1 }, pages[2 * k + 1], 'right', `${2 * k + 2}쪽`)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * 총 쪽수 입력칸.
 *
 * **글자를 치는 중간값으로는 바꾸지 않는다.** `setNotebookPageCount`는
 * 쪽이 줄면 뒤쪽 내용을 그대로 잘라내므로(`resizePages`), "20"을 치는
 * 동안 "2"가 먼저 적용되면 3쪽 이후 내용이 사라진다. 그래서 blur·Enter
 * 에서만 확정한다 — StyleBar의 NumField와 같은 규칙이다.
 */
function PageCountField({
  value,
  actualLength,
  onCommit,
}: {
  value: number;
  actualLength: number;
  onCommit: (count: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit(raw: string) {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n > 0) onCommit(n);
    else setDraft(String(value));
  }

  const padded = paddedPageCount(value);

  return (
    <div className="notebook-editor-toolbar">
      <label className="numfield">
        총 쪽수
        <input
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
        />
        <span>쪽</span>
      </label>
      {padded !== value ? (
        <span className="notebook-editor-hint">
          한 장(종이 하나)이 4쪽씩이라, {padded}쪽({padded / 4}장)으로 맞춰 남는 {padded - value}쪽은
          비워둡니다.
        </span>
      ) : (
        <span className="notebook-editor-hint">
          {actualLength}쪽 · 종이 {actualLength / 4}장
        </span>
      )}
    </div>
  );
}
