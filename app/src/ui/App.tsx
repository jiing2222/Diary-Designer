import { useEffect, useRef, useState } from 'react';
import { activeTemplate, paperSize, resolveSlotTemplates, selectLayout, useStore, type Side } from '../store';
import {
  capacityPerSheet,
  cutStackPage,
  filledSlots,
  frontBackFilled,
  printModeOf,
  sheetsNeeded,
  type Template,
} from '../core/template';
import { mirrorLayout, turnLayout180 } from '../core/layout';
import { datasetPages } from '../core/dataset';
import { resolvePageObjects } from '../core/format';
import {
  allNotebookObjects,
  notebookImposition,
  notebookPageWidth,
  notebookPrintUnit,
  notebookPrintUnitCount,
  paddedPageCount,
} from '../core/notebook';
import { DEFAULT_DOT_GRID, type DotGrid } from '../core/grid';
import { SettingsPanel, InsertGroup, RepeatGroup, LayoutGroup } from './SettingsPanel';
import { PaperPreview, type PreviewSlotContent } from './PaperPreview';
import { PrintSlotEditor } from './PrintSlotEditor';
import { EditorTab, ToolRail, ZoomStepper } from './EditorTab';
import { NotebookEditorTab } from './NotebookEditorTab';
import { GalleryTab } from './GalleryTab';
import { ProjectFile } from './ProjectFile';
import { SlotAssign } from './SlotAssign';
import { RepeatPrint } from './RepeatPrint';
import { PX_PER_MM_AT_100 } from './pixels';
import { buildPdf, downloadPdf, type SlotContent } from '../pdf/export';
import { loadBodyFont, loadBoldFont } from '../fonts/load';
import { fontBytes as fontBytes_, restoreCachedFonts } from '../fonts/registry';
import {
  imageBytes as imageBytes_,
  imageKind as imageKind_,
  restoreCachedImages,
} from '../images/registry';
import type { DiaryObject, ImageObject, TextObject } from '../core/objects';

type Tab = 'gallery' | 'edit' | 'print';

/**
 * 인쇄하기에서 지금 칸(낱장 조합)·페이지(세트형)를 직접 손보는 중이면 그
 * 자리 정보. `store.ts`의 `shadowTemplate`이 실제 그리는 데이터를 들고
 * 있고, 여기는 "그 결과를 어디(칸 번호 또는 페이지 번호, 앞/뒤)로 옮겨
 * 담을지"만 기억한다 — 그림자 자체는 그 대상을 몰라도 되게 하려는
 * 것이다(PrintSlotEditor는 store만 보고 그린다).
 */
type EditingSession = {
  sheet: number;
  index: number;
  side: Side;
  /** 손보기 시작할 때의 내용 — 끝날 때 하나도 안 고쳤으면(참조가 그대로면)
   * override를 아예 만들지 않는다. 그냥 열어보기만 했는데 "손봤다"로
   * 남아 원본 양식 변경을 더는 안 따라가면 놀란다. */
  seed: DiaryObject[];
  /** 손보기 시작할 때 이미 override가 있었는가 — "되돌리기" 버튼을 보일지 정한다. */
  hadOverride: boolean;
} & ({ kind: 'combo' } | { kind: 'dataset'; page: number });

/** "되돌리기"가 막 지운 override — "되돌리기 취소"로 한 번 되살릴 수 있게 잠깐 기억해둔다. */
type LastReverted = {
  index: number;
  side: Side;
  objects: DiaryObject[];
} & ({ kind: 'combo' } | { kind: 'dataset'; page: number });

/**
 * 반복 인쇄에서 마지막 장의 남는 칸. 화면에서는 완전히 비워 보여준다.
 * pdf/export.ts의 `BLANK_SLOT`과 같은 생각이다 — 인쇄물과 미리보기가 같아야 한다.
 */
const BLANK_PREVIEW_GRID: DotGrid = { ...DEFAULT_DOT_GRID, showOnScreen: false, print: false };

/**
 * 헤더 가운데 — 양식 이름(클릭해서 바로 고치기)과 속지 크기.
 *
 * 규격을 정하는 곳은 하나뿐이어야 하므로, 크기 말풍선은 SettingsPanel의
 * `InsertGroup`을 그대로 가져다 쓴다(더 이상 왼쪽 도구바에는 없다).
 */
function TemplateInfo({ template }: { template: Template }) {
  const renameTemplate = useStore((s) => s.renameTemplate);
  const [renaming, setRenaming] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sizeOpen) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setSizeOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSizeOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [sizeOpen]);

  return (
    <div className="template-info" ref={wrapRef}>
      {renaming ? (
        <input
          className="template-name-input"
          defaultValue={template.name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            renameTemplate(template.id, e.target.value);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <button className="template-name" onClick={() => setRenaming(true)} title="클릭해서 이름 바꾸기">
          {template.name}
        </button>
      )}

      <button className="size-trigger" onClick={() => setSizeOpen((v) => !v)} title="속지 크기">
        {template.insert.width} × {template.insert.height}mm ▾
      </button>

      {sizeOpen && (
        <div className="popover popover-below">
          <h2>속지</h2>
          <div className="popover-body">
            <InsertGroup />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 인쇄하기 우측 패널 — 반복 · 배치 · 절취선.
 *
 * "몇 장을 어떻게 뽑는가"는 속지 제작 화면(왼쪽 아코디언)에서 뺐다 —
 * 인쇄 단계에서만 뜻이 있는 질문이라 여기로 옮겼다. **임시 자리다** —
 * 어디에 어떤 모양으로 둘지는 아직 정해지지 않았고, 지금은 기능이
 * 잘리지 않는 것만 우선한다.
 */
function PrintSidePanel() {
  return (
    <div className="print-side-panel">
      <section>
        <h2>반복</h2>
        <RepeatGroup />
      </section>
      <section>
        <h2>배치 · 절취선</h2>
        <LayoutGroup />
      </section>
    </div>
  );
}

export function App() {
  const s = useStore();
  const [busy, setBusy] = useState(false);

  // 새로고침 뒤 브라우저(IndexedDB)에 남아 있는 글꼴·이미지를 자동으로
  // 되살린다 — 예전에 등록했던 파일을 다시 고를 필요가 없어진다. 마운트에
  // 한 번만 하면 되므로 useStore.getState()로 리액트 구독 없이 store에 바로
  // 넣는다.
  useEffect(() => {
    restoreCachedFonts().then((fonts) => fonts.forEach((f) => useStore.getState().addUserFont(f)));
    restoreCachedImages().then((images) => images.forEach((i) => useStore.getState().addUserImage(i)));
  }, []);

  // 처음 열면 양식이 하나도 없다. 갤러리에서 시작해 첫 양식을 만들게 한다.
  const [tab, setTab] = useState<Tab>('gallery');
  /**
   * 인쇄하기 탭 전용. 켜면 지금 켜둔 도트·타공 화면 설정과 무관하게 **실제로
   * 인쇄될 모습만** 보여준다. 원래 설정은 그대로 두고 보는 방식만 잠깐 바꾸는
   * 것이라 store에 넣지 않는다 — 탭을 나가면 잊혀도 되는 값이다.
   */
  const [printPreview, setPrintPreview] = useState(true);
  /**
   * 인쇄하기 탭의 확대 배율. 숫자면 양식 만들기(EditorTab)의 zoom과 같은
   * 값(%)이고, `'fit'`이면 지금 화면 폭에 맞춰(양면이면 두 쪽이 다 보이게)
   * 자동으로 계산한다 — 기본값이다. 첫 화면부터 잘려 보이는 것보다 다
   * 보이는 편이 낫다. store에 넣지 않는 이유는 printPreview와 같다.
   */
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  /**
   * 양면일 때 뒷면을 왼쪽에 둘지 오른쪽에 둘지. 실제 인쇄되는 페이지 순서와는
   * 무관하다 — 화면에서 나란히 볼 때 어느 쪽에 두고 볼지 정하는 값이라 이것도
   * store에 넣지 않는다.
   */
  const [backOnLeft, setBackOnLeft] = useState(true);
  /**
   * 칸·페이지를 손보는 도구막대(PrintSlotEditor 안)가 자리 잡을 DOM 자리.
   * 손보는 칸이 어디 있든(`.stage-area`를 얼마나 스크롤했든) 이 자리는
   * 그 위, `.print-bar` 바로 아래에 고정돼 있다 — EditorTab의 `.editor-bar`와
   * 같은 위치 원칙이다. PrintSlotEditor가 `createPortal`로 도구막대를 실제로는
   * 여기(칸이 있는 자리가 아니라)에 그린다. state로 두는 이유는 ref만으로는
   * PrintSlotEditor의 첫 렌더 시점에 아직 이 <div>가 커밋되지 않아 null이기
   * 때문 — 콜백 ref로 실제 DOM 노드가 생기면 그때 다시 그려지게 한다.
   */
  const [editBarSlot, setEditBarSlot] = useState<HTMLDivElement | null>(null);
  /** `zoom === 'fit'`일 때 배율 계산의 기준이 되는, 지금 미리보기 영역의 실제 폭(px). */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
    // tab에 의존한다 — 처음 열었을 땐 기본 탭이 "양식 관리"라 .stage-area가
    // 아직 DOM에 없다(stageRef.current가 null). 빈 배열([])로 마운트 때
    // 한 번만 시도하면 그 순간엔 항상 실패하고 다시는 안 붙는다 — "인쇄하기"
    // 탭에 처음 들어올 때(탭이 바뀔 때) 다시 시도해야 그때는 진짜 DOM이 있다.
  }, [tab]);

  const { width, height } = paperSize(s.paper);
  const layout = selectLayout(s);
  const active = activeTemplate(s);

  /*
   * 낱장 조합·반복 인쇄(만년형)·세트형은 설계문서 8장의 원칙대로 한 인쇄에
   * 섞이지 않는다. `active.repeat.mode`가 어느 쪽인지 정한다 — 사용자가 따로
   * 고르지 않는다.
   */
  const printMode = printModeOf(active);
  const totalSlots = active?.repeat.mode === 'repeat' ? active.repeat.count : 0;
  const dataset = active?.repeat.mode === 'dataset' ? active.repeat.dataset : null;
  const totalPages = dataset ? datasetPages(dataset) : 0;
  /**
   * 노트 — 표지 1장 + `notebookImposition`이 정한 내지 장 수. 세트형의
   * "쪽"과 같은 자리(장 하나 = 인쇄 단위 하나)에서 쓰인다.
   */
  const notebookImp =
    printMode === 'notebook' && active?.pages ? notebookImposition(paddedPageCount(active.pageCount ?? active.pages.length)) : null;
  const totalNotebookUnits = notebookImp ? notebookPrintUnitCount(notebookImp) : 0;
  const notebookPageW = active ? notebookPageWidth(active.insert.width) : 0;

  const [editingSession, setEditingSession] = useState<EditingSession | null>(null);

  /**
   * 지금 손보던 것이 있으면 그 결과를 override로 옮기고 그림자를 지운다.
   *
   * **`s` 대신 `useStore.getState()`로 읽는다.** "완료" 버튼은 진행 중인
   * 글자 입력을 먼저 커밋(`finishEditing` → `commitText`)한 바로 뒤에 이
   * 함수를 부르는데, 그 커밋은 store를 그 자리에서 바로 바꾸지만 App.tsx의
   * `s`(컴포넌트 렌더 시점의 스냅샷)는 리액트가 다시 그릴 때까지 그 변화를
   * 모른다 — `getState()`로 읽어야 방금 커밋한 글자까지 포함해서 정확히
   * 옮겨 담는다.
   */
  function commitEdit() {
    const store = useStore.getState();
    if (!editingSession || !store.shadowTemplate) return;
    const data = store.shadowSide === 'front' ? store.shadowTemplate.objects : store.shadowTemplate.back?.objects;
    const objects = data?.present ?? [];
    // 하나도 안 고쳤으면(참조가 씨앗 그대로면) override를 만들지 않는다 —
    // 그냥 열어만 봤는데 원본 양식을 더는 안 따라가게 되면 놀란다.
    if (objects !== editingSession.seed) {
      if (editingSession.kind === 'combo') {
        store.setComboSlotOverride(editingSession.index, editingSession.side, objects);
      } else {
        store.setPageOverride(editingSession.page, editingSession.side, objects);
      }
    }
    store.endShadowEdit();
  }

  /** 다른 칸·페이지를 손보기 시작한다 — 손보던 것이 있으면 먼저 그 결과부터 저장한다. */
  function beginEdit(session: EditingSession, content: PreviewSlotContent) {
    commitEdit();
    useStore.getState().beginShadowEdit(content.insert, content.dotGrid, content.objects, session.side);
    setEditingSession(session);
  }

  /** "완료" — 저장하고 손보기를 마친다. */
  function finishEdit() {
    commitEdit();
    setEditingSession(null);
  }

  /**
   * 손보는 중에 그 칸이 아닌 바깥을 더블클릭하면 완료한다(Esc는 그대로 둔다,
   * 사용자 피드백). `.print-slot-editor-canvas`(지금 손보는 칸 자신)나
   * `.paper-slot-clickable`(다른 칸 — 그쪽은 이미 자기 onClick으로 옮겨가는
   * 중이다)에서 난 더블클릭은 지나친다. 진짜 빈 여백(용지 사이 간격,
   * .stage-area의 남는 자리)을 더블클릭했을 때만 완료한다.
   */
  function onStageDoubleClick(e: React.MouseEvent) {
    if (!editingSession) return;
    const target = e.target as Element;
    if (target.closest('.print-slot-editor-canvas') || target.closest('.paper-slot-clickable')) return;
    finishEdit();
  }

  /**
   * "되돌리기" 바로 직전의 override 내용 — "되돌리기 취소"로 한 번만
   * 되살릴 수 있다. 되돌린 슬롯이 없으면(새로 손보던 중이었으면) 없다.
   * 다시 손대기 시작하거나(activeId가 바뀌면 — pageOverrides는 양식에
   * 속하므로 다른 양식으로 넘어간 뒤 되살리면 엉뚱한 양식을 고치게 된다)
   * 인쇄하기 탭을 벗어나면 비운다.
   */
  const [lastReverted, setLastReverted] = useState<LastReverted | null>(null);

  /**
   * "되돌리기" — 지금 세션에서 그린 것은(이미 저장된 override든) 전부 버리고
   * 원본 양식을 다시 따르게 한다. `commitEdit`과 달리 그림자의 지금 내용을
   * override로 옮기지 않는다 — 정반대로, 있던 override를 지운다. 지우기
   * 전의 내용은 `lastReverted`에 담아 "되돌리기 취소"로 되살릴 수 있게 한다.
   */
  function revertEdit() {
    if (!editingSession) return;
    const store = useStore.getState();
    if (editingSession.kind === 'combo') {
      const existing =
        editingSession.side === 'front'
          ? store.comboSlotOverrides[editingSession.index]
          : store.comboSlotBackOverrides[editingSession.index];
      if (existing) {
        setLastReverted({ kind: 'combo', index: editingSession.index, side: editingSession.side, objects: existing });
      }
      store.clearComboSlotOverride(editingSession.index, editingSession.side);
    } else {
      const activeNow = store.templates.find((t) => t.id === store.activeId);
      const existing =
        editingSession.side === 'front'
          ? activeNow?.pageOverrides?.[editingSession.page]
          : activeNow?.pageBackOverrides?.[editingSession.page];
      if (existing) {
        setLastReverted({
          kind: 'dataset',
          index: editingSession.index,
          side: editingSession.side,
          page: editingSession.page,
          objects: existing,
        });
      }
      store.clearPageOverride(editingSession.page, editingSession.side);
    }
    store.endShadowEdit();
    setEditingSession(null);
  }

  /** "되돌리기 취소" — 방금 되돌리기로 지운 override를 그대로 되살린다. */
  function undoRevert() {
    if (!lastReverted) return;
    const store = useStore.getState();
    if (lastReverted.kind === 'combo') {
      store.setComboSlotOverride(lastReverted.index, lastReverted.side, lastReverted.objects);
    } else {
      store.setPageOverride(lastReverted.page, lastReverted.side, lastReverted.objects);
    }
    setLastReverted(null);
  }

  // pageOverrides는 양식에 속한 값이라, 다른 양식으로 넘어가면 되살릴 자리가
  // 없어진다(엉뚱한 양식을 고치게 두지 않는다) — 활성 양식이 바뀌면 비운다.
  useEffect(() => {
    setLastReverted(null);
  }, [active?.id]);

  // 인쇄하기 탭을 벗어나면(양식 만들기 등으로) 손보던 것을 저장하고 끝낸다.
  // 그림자 양식이 남아 있으면 그 사이 EditorTab의 그리기도 엉뚱하게 그림자를
  // 향하게 된다(store.ts의 patchActiveSide가 shadowTemplate을 먼저 본다).
  useEffect(() => {
    if (tab !== 'print') setLastReverted(null);
    if (tab !== 'print' && editingSession) {
      commitEdit();
      setEditingSession(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const previewOverrides = new Map<number, PreviewSlotContent>();
  const pdfOverrides = new Map<number, SlotContent>();
  /** 뒷면 쪽 override. 앞면과 같은 인덱스, 같은 채우는 규칙을 쓴다. */
  const previewBackOverrides = new Map<number, PreviewSlotContent>();
  const pdfBackOverrides = new Map<number, SlotContent | null>();
  /** 반복 인쇄가 아닐 때만 쓰인다. 글꼴을 모을 때 어느 양식들이 관여했는지 알아야 한다. */
  let slotTemplates: ReturnType<typeof resolveSlotTemplates> = [];

  /**
   * 뒷면이 없는 칸에 쓸 내용.
   *
   * 기본은 완전히 빈 칸(`undefined`)이다. `fillEmptyBack`을 켜면 대신 그 양식의
   * **앞면과 같은 도트·그리드**를 쓰되 그린 것은 넣지 않는다 — 뒷면을 따로
   * 디자인하지 않았어도 백지가 아니라 쓸 수 있는 면으로 찍고 싶을 때다.
   */
  const backFallback = (t: { dotGrid: DotGrid; insert: { punch: { safeZoneWidth: number } } }): SlotContent | undefined =>
    s.fillEmptyBack
      ? { dotGrid: t.dotGrid, objects: [], safeZoneWidth: t.insert.punch.safeZoneWidth }
      : undefined;

  /** 지금 양식의 뒷면. 없으면 backFallback(또는 완전히 빈 칸)을 쓴다. */
  const defaultBack: SlotContent | undefined = active?.back
    ? {
        dotGrid: active.dotGrid,
        objects: active.back.objects.present,
        safeZoneWidth: active.insert.punch.safeZoneWidth,
      }
    : active
      ? backFallback(active)
      : undefined;

  if (active && printMode === 'combo') {
    /*
     * 낱장 조합 — 칸마다 다른 양식.
     *
     * `resolveSlotTemplates`가 칸마다 실제로 쓸 양식을 정해준다(배정이 없거나
     * 규격이 다르면 지금 양식으로 대신한다). 화면 미리보기와 PDF가 **같은 배열을
     * 함께 본다** — 둘이 따로 계산하면 언젠가 어긋난다.
     *
     * 지금 양식과 같은 칸은 굳이 override에 넣지 않는다. 대부분의 칸이 지금
     * 양식을 그대로 쓰므로, 다른 칸만 골라내는 편이 다루기 쉽다.
     *
     * comboSheets만큼 찍어도 장마다 이 배치가 그대로 반복된다 — 그래서
     * 인쇄하기 탭의 장별 미리보기(sheetOverrides)는 이 값을 sheet 번호와
     * 무관하게 그대로 돌려준다.
     */
    slotTemplates = resolveSlotTemplates(s, layout.count);
    slotTemplates.forEach((t, i) => {
      // "인쇄하기"에서 그 칸을 직접 손봤으면(comboSlotOverrides) 배정된 양식이
      // 무엇이든 그 내용을 그대로 쓴다 — 지금 양식과 같은 칸이라도 손봤으면
      // 건너뛰지 않는다.
      const frontOverride = s.comboSlotOverrides[i];
      const backOverride = s.comboSlotBackOverrides[i];
      if (t.id === active.id && !frontOverride && !backOverride) return;

      const frontObjects = frontOverride ?? t.objects.present;
      previewOverrides.set(i, {
        insert: t.insert,
        dotGrid: t.dotGrid,
        objects: frontObjects,
        overridden: frontOverride !== undefined,
      });
      pdfOverrides.set(i, {
        dotGrid: t.dotGrid,
        objects: frontObjects,
        safeZoneWidth: t.insert.punch.safeZoneWidth,
      });
      // 배정된 양식에 뒷면이 없으면 지금 양식의 뒷면(defaultBack)이 아니라
      // 이 칸만의 backFallback을 쓴다 — fillEmptyBack이 꺼져 있으면 완전히 빈다.
      // 뒷면을 직접 손봤으면(backOverride) 원본에 뒷면이 없어도 그 내용을 쓴다.
      const backObjects = backOverride ?? (t.back ? t.back.objects.present : null);
      previewBackOverrides.set(
        i,
        backObjects
          ? { insert: t.insert, dotGrid: t.dotGrid, objects: backObjects, overridden: backOverride !== undefined }
          : { insert: t.insert, dotGrid: s.fillEmptyBack ? t.dotGrid : BLANK_PREVIEW_GRID, objects: [] },
      );
      pdfBackOverrides.set(
        i,
        backObjects
          ? { dotGrid: t.dotGrid, objects: backObjects, safeZoneWidth: t.insert.punch.safeZoneWidth }
          : (backFallback(t) ?? null),
      );
    });
  }

  /**
   * 인쇄하기 탭은 이제 장을 하나씩 넘겨보지 않고 전부 쌓아 스크롤로 본다 —
   * 그래서 "지금 보는 장"(previewPage) 하나가 아니라 장 번호를 인자로 받아
   * 그 장의 칸 내용을 낸다.
   *
   * 낱장 조합은 장마다 내용이 같으므로(comboSheets는 같은 배치의 반복) 위에서
   * 이미 계산해둔 previewOverrides·previewBackOverrides를 그대로 돌려준다.
   * 반복 인쇄·세트형은 장마다 달라서 그때그때 계산한다 — 세트형은 쪽수가
   * 아주 많으면(수백 쪽) 장마다 새로 계산하는 비용이 쌓일 수 있다. 지금은
   * "화면에 없는 장까지 다 그린다"는 단순한 방식을 쓴다 — 느려지면 그때
   * 화면에 보이는 장만 그리는 가상화로 개선한다.
   */
  function overridesForSheet(sheet: number): {
    previewOverrides: Map<number, PreviewSlotContent>;
    previewBackOverrides: Map<number, PreviewSlotContent>;
  } {
    if (!active) return { previewOverrides: new Map(), previewBackOverrides: new Map() };

    if (printMode === 'repeat') {
      const front = new Map<number, PreviewSlotContent>();
      const back = new Map<number, PreviewSlotContent>();
      const { front: frontFilled, back: backFilled } = frontBackFilled(sheet, totalSlots, layout.count, s.duplex);
      for (let i = frontFilled; i < layout.count; i++) {
        front.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
      }
      for (let i = backFilled; i < layout.count; i++) {
        back.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
      }
      return { previewOverrides: front, previewBackOverrides: back };
    }

    if (printMode === 'dataset' && dataset) {
      const front = new Map<number, PreviewSlotContent>();
      const back = new Map<number, PreviewSlotContent>();
      const filled = filledSlots(sheet, totalPages, layout.count);
      for (let i = 0; i < layout.count; i++) {
        const page = s.cutStack
          ? cutStackPage(sheet, i, totalPages, layout.count, s.cutStackGroup || undefined)
          : i < filled
            ? sheet * layout.count + i
            : null;

        if (page === null) {
          front.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
          back.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
          continue;
        }
        front.set(i, {
          insert: active.insert,
          dotGrid: active.dotGrid,
          objects: resolvePageObjects(active.objects.present, dataset, page, active.pageOverrides),
          calendarPage: page,
          overridden: active.pageOverrides?.[page] !== undefined,
        });
        // 뒷면을 직접 손봤으면(pageBackOverrides) 원본 양식에 뒷면이 없어도
        // 그 내용을 쓴다 — 낱장 조합의 comboSlotOverrides와 같은 원리다.
        const backOverride = active.pageBackOverrides?.[page];
        back.set(
          i,
          active.back || backOverride
            ? {
                insert: active.insert,
                dotGrid: active.dotGrid,
                objects: active.back
                  ? resolvePageObjects(active.back.objects.present, dataset, page, active.pageBackOverrides)
                  : backOverride!,
                calendarPage: page,
                overridden: backOverride !== undefined,
              }
            : {
                insert: active.insert,
                dotGrid: s.fillEmptyBack ? active.dotGrid : BLANK_PREVIEW_GRID,
                objects: [],
              },
        );
      }
      return { previewOverrides: front, previewBackOverrides: back };
    }

    if (printMode === 'notebook' && notebookImp && active.cover && active.pages) {
      const front = new Map<number, PreviewSlotContent>();
      const back = new Map<number, PreviewSlotContent>();
      const filled = filledSlots(sheet, totalNotebookUnits, layout.count);
      for (let i = 0; i < layout.count; i++) {
        const unit = i < filled ? sheet * layout.count + i : null;
        if (unit === null) {
          front.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
          back.set(i, { insert: active.insert, dotGrid: BLANK_PREVIEW_GRID, objects: [] });
          continue;
        }
        const content = notebookPrintUnit(active.cover, active.pages, notebookImp, notebookPageW, unit);
        front.set(i, { insert: active.insert, dotGrid: content.front.dotGrid, objects: content.front.objects });
        back.set(
          i,
          content.back
            ? { insert: active.insert, dotGrid: content.back.dotGrid, objects: content.back.objects }
            : {
                insert: active.insert,
                dotGrid: s.fillEmptyBack ? content.front.dotGrid : BLANK_PREVIEW_GRID,
                objects: [],
              },
        );
      }
      return { previewOverrides: front, previewBackOverrides: back };
    }

    return { previewOverrides, previewBackOverrides };
  }

  const sheets =
    printMode === 'repeat'
      ? sheetsNeeded(totalSlots, capacityPerSheet(layout.count, s.duplex))
      : printMode === 'dataset'
        ? sheetsNeeded(totalPages, layout.count)
        : printMode === 'notebook'
          ? sheetsNeeded(totalNotebookUnits, layout.count)
          : Math.max(1, s.comboSheets);

  /*
   * 인쇄하기 탭의 px/mm 배율. 'fit'이면 지금 미리보기 영역 폭(stageWidth)에
   * 맞춰 계산한다 — 양면이면 두 쪽이 나란히 다 들어가야 하므로 폭을 둘로
   * 나눈다. .stage-area의 padding(20px 양쪽)·.print-sheet의 gap(14px)을
   * 빼야 실제로 그릴 수 있는 폭이 나온다 — CSS 값이 바뀌면 여기도 맞춰야 한다.
   * 아직 폭을 못 쟀으면(첫 렌더) 100%로 잠깐 대신한다.
   */
  const pagesPerRow = s.duplex ? 2 : 1;
  const fitScale =
    stageWidth > 0
      ? Math.max(0.15, (stageWidth - 40 - (pagesPerRow - 1) * 14) / (width * pagesPerRow))
      : PX_PER_MM_AT_100;
  const scale = zoom === 'fit' ? fitScale : (zoom / 100) * PX_PER_MM_AT_100;

  async function exportPdf() {
    if (!active) return;
    setBusy(true);
    try {
      // 반복 인쇄·세트형이면 이 양식 하나의 글자만 본다. 낱장 조합이면 배정된
      // 모든 칸의 글자를 함께 본다 — 어느 칸에 글꼴이 필요한지는 core/pdf의
      // slotOverrides가 알아서 합쳐 보지만, 어떤 글꼴 파일을 받아와야 하는지는
      // 여기서 먼저 정한다.
      const uniqueTemplates =
        printMode !== 'combo'
          ? [active]
          : [...new Map(slotTemplates.map((t) => [t.id, t])).values()];
      const isText = (o: { type: string }): o is TextObject => o.type === 'text';
      // 뒷면 글자도 함께 본다 — 앞면만 보면 뒷면에만 있는 글꼴이 빠진다.
      // 노트는 objects·back이 아니라 표지·쪽에 실제로 그린 것이 있다
      // (core/notebook의 NotebookHalf) — 그래서 소스를 완전히 갈아 낀다.
      const allSourceObjects: DiaryObject[] =
        printMode === 'notebook' && active.cover && active.pages
          ? allNotebookObjects(active.cover, active.pages)
          : uniqueTemplates.flatMap((t) => [...t.objects.present, ...(t.back?.objects.present ?? [])]);
      const allTexts: TextObject[] = allSourceObjects.filter(isText);

      // 글자가 있을 때만 글꼴을 받는다. 하나에 2.7MB짜리라 괜히 받을 이유가 없다.
      // 굵기마다 파일이 따로라 Bold도 굵은 글자가 실제로 있을 때만 받는다.
      const fontBytes = allTexts.length > 0 ? await loadBodyFont() : undefined;
      const boldFontBytes = allTexts.some((t) => t.bold) ? await loadBoldFont() : undefined;

      // 등록 글꼴은 실제로 쓰이는 것만 모은다. 등록소에 없는 id(새로고침 뒤에
      // 남은 글자)는 그냥 빠지고, PDF에서도 기본 글꼴로 그려진다.
      const userFonts = new Map<string, ArrayBuffer>();
      for (const t of allTexts) {
        const b = t.font ? fontBytes_(t.font) : undefined;
        if (t.font && b) userFonts.set(t.font, b);
      }

      // 이미지도 같은 방식이다 — 등록소에 없는 id(새로고침 뒤 다시 등록하지
      // 않은 이미지)는 빠지고, PDF에서도 화면처럼 그 자리만 비게 된다.
      const isImageObj = (o: { type: string }): o is ImageObject => o.type === 'image';
      const allImages: ImageObject[] = allSourceObjects.filter(isImageObj);
      const userImages = new Map<string, { bytes: ArrayBuffer; kind: 'png' | 'jpg' }>();
      for (const o of allImages) {
        if (!o.imageId) continue; // 아직 사진을 안 고른 빈 상자.
        const bytes = imageBytes_(o.imageId);
        const kind = imageKind_(o.imageId);
        if (bytes && kind) userImages.set(o.imageId, { bytes, kind });
      }

      /*
       * 세트형 — 모든 쪽의 자동 필드를 실제 값으로 채운다.
       *
       * 미리보기(overridesForSheet)는 장마다 그때그때 계산하지만, 여기서는
       * PDF 한 번에 전체 쪽을 한꺼번에 계산해 넣는다 — 장별로 나눠 계산할
       * 이유가 없고, pdf/export.ts가 장·칸 번호로 이 안에서 골라 쓴다.
       */
      let datasetOverrides: Map<number, SlotContent> | undefined;
      let datasetBackOverrides: Map<number, SlotContent> | undefined;
      if (printMode === 'dataset' && dataset) {
        datasetOverrides = new Map();
        datasetBackOverrides = new Map();
        for (let page = 0; page < totalPages; page++) {
          datasetOverrides.set(page, {
            dotGrid: active.dotGrid,
            objects: resolvePageObjects(active.objects.present, dataset, page, active.pageOverrides),
            safeZoneWidth: active.insert.punch.safeZoneWidth,
          });
          // 미리보기(overridesForSheet)와 같은 원리 — 뒷면을 직접 손봤으면
          // 원본 양식에 뒷면이 없어도 그 내용을 쓴다.
          const backOverride = active.pageBackOverrides?.[page];
          if (active.back || backOverride) {
            datasetBackOverrides.set(page, {
              dotGrid: active.dotGrid,
              objects: active.back
                ? resolvePageObjects(active.back.objects.present, dataset, page, active.pageBackOverrides)
                : backOverride!,
              safeZoneWidth: active.insert.punch.safeZoneWidth,
            });
          }
        }
      }

      // 노트 — 표지 1장 + notebookImp가 정한 내지 장 수, 세트형과 같은 자리
      // (datasetOverrides/datasetBackOverrides)에 담는다. 표지 뒷면(안쪽)은
      // 아직 디자인할 자리가 없어 fillEmptyBack일 때만 빈 면으로 채운다.
      if (printMode === 'notebook' && notebookImp && active.cover && active.pages) {
        datasetOverrides = new Map();
        datasetBackOverrides = new Map();
        for (let unit = 0; unit < totalNotebookUnits; unit++) {
          const content = notebookPrintUnit(active.cover, active.pages, notebookImp, notebookPageW, unit);
          datasetOverrides.set(unit, { dotGrid: content.front.dotGrid, objects: content.front.objects, safeZoneWidth: 0 });
          if (content.back) {
            datasetBackOverrides.set(unit, { dotGrid: content.back.dotGrid, objects: content.back.objects, safeZoneWidth: 0 });
          } else if (s.fillEmptyBack) {
            datasetBackOverrides.set(unit, { dotGrid: content.front.dotGrid, objects: [], safeZoneWidth: 0 });
          }
        }
      }

      const bytes = await buildPdf({
        paperWidth: width,
        paperHeight: height,
        layout,
        dotGrid: active.dotGrid,
        objects: active.objects.present,
        // 낱장 조합(칸마다 다른 양식)·반복 인쇄(여러 장)·세트형(쪽마다 다른
        // 내용)은 섞이지 않는다.
        slotOverrides: printMode === 'combo' && pdfOverrides.size > 0 ? pdfOverrides : undefined,
        totalSlots: printMode === 'repeat' ? totalSlots : undefined,
        // 낱장 조합에서만 쓴다 — 반복 인쇄·세트형은 각자의 값이 우선이다(pdf/export.ts).
        sheets: printMode === 'combo' ? s.comboSheets : undefined,
        datasetOverrides,
        datasetBackOverrides,
        datasetPages:
          printMode === 'dataset' ? totalPages : printMode === 'notebook' ? totalNotebookUnits : undefined,
        calendarYear: dataset?.kind === 'calendar' ? dataset.year : undefined,
        // 겹치기 배치는 세트형에서만 고를 수 있다 — 노트는 자기만의 배치
        // (notebookImp)를 이미 따로 계산해 datasetOverrides에 담았으니, 여기
        // 순서를 또 바꾸면 안 된다. 반복 인쇄·낱장 조합도 모든 칸의 내용이
        // 같아 순서가 결과에 영향을 주지 않는다.
        cutStack: printMode === 'dataset' ? s.cutStack : undefined,
        cutStackGroup: printMode === 'dataset' ? s.cutStackGroup || undefined : undefined,
        fontBytes,
        boldFontBytes,
        userFonts,
        userImages,
        safeZoneWidth: active.insert.punch.safeZoneWidth,
        cropMark: s.cropMark,
        showRuler: s.showRuler,
        duplex: s.duplex,
        backTurn180: s.backTurn180,
        defaultBack,
        backSlotOverrides: printMode === 'combo' && pdfBackOverrides.size > 0 ? pdfBackOverrides : undefined,
      });
      const filePrefix = printMode === 'notebook' ? '노트' : '속지';
      downloadPdf(bytes, `${filePrefix}_${active.insert.presetId}_${s.paper.presetId}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>System Diary Designer</h1>

        {/* 고르고 → 그리고 → 인쇄한다. 탭 순서가 곧 작업 순서다. */}
        <nav className="tabs">
          <button className={tab === 'gallery' ? 'tab on' : 'tab'} onClick={() => setTab('gallery')}>
            양식 관리
          </button>
          {/*
            고칠 양식이 없으면 갈 수 없는 곳이다. 속지·노트는 같은 편집
            화면(EditorTab)을 쓰지만, 지금 고른 양식의 종류(kind)에 맞는
            버튼만 눌린다 — 다른 종류로 잘못 들어가는 일이 없게 한다.
          */}
          <button
            className={tab === 'edit' && active?.kind === 'insert' ? 'tab on' : 'tab'}
            onClick={() => setTab('edit')}
            disabled={!active || active.kind !== 'insert'}
          >
            속지 제작
          </button>
          <button
            className={tab === 'edit' && active?.kind === 'notebook' ? 'tab on' : 'tab'}
            onClick={() => setTab('edit')}
            disabled={!active || active.kind !== 'notebook'}
          >
            노트 제작
          </button>
          <button
            className={tab === 'print' ? 'tab on' : 'tab'}
            onClick={() => setTab('print')}
            disabled={!active}
          >
            인쇄하기
          </button>
        </nav>

        {active ? <TemplateInfo template={active} /> : <span className="stage" />}
        <ProjectFile />
        <button onClick={exportPdf} disabled={busy || !active || layout.count === 0}>
          {busy ? '만드는 중…' : 'PDF 내보내기'}
        </button>
      </header>

      <main>
        {/* 갤러리는 양식 하나를 고치는 화면이 아니라서 설정 패널이 필요 없다. */}
        {tab !== 'gallery' && active && (
          <div className="left-column">
            {/*
              그리기 도구는 실제로 그릴 캔버스가 떠 있을 때만 보여준다 —
              속지·노트 제작 화면은 늘 그렇지만, 인쇄하기는 칸을 직접
              손보는 중(editingSession)일 때만 그릴 자리가 있다.
            */}
            {(tab === 'edit' || editingSession) && <ToolRail />}
            <SettingsPanel />
          </div>
        )}

        {tab === 'gallery' || !active ? (
          <GalleryTab onEdit={() => setTab('edit')} />
        ) : tab === 'edit' ? (
          active.kind === 'notebook' ? <NotebookEditorTab /> : <EditorTab />
        ) : (
          <div className="print-tab">
            {/* 양식 만들기 화면의 상단 도구줄과 같은 자리 — 같은 위치에 있어야 찾기 쉽다. */}
            <div className="print-bar">
              <label className="preview-toggle">
                <input
                  type="checkbox"
                  checked={printPreview}
                  onChange={(e) => setPrintPreview(e.target.checked)}
                />
                실제 인쇄 모습만 보기
                <span className="preview-toggle-hint">
                  도트·타공 화면 설정과 무관하게 인쇄되는 것만 보여줍니다
                </span>
              </label>

              <label className="preview-toggle">
                <input
                  type="checkbox"
                  checked={s.duplex}
                  onChange={(e) => s.patch({ duplex: e.target.checked })}
                />
                양면 인쇄
              </label>

              {/* 양면을 껐으면 앞뒤가 나란해질 일이 없으니 순서를 고를 이유가 없다. */}
              {s.duplex && (
                <label className="preview-toggle">
                  <input
                    type="checkbox"
                    checked={backOnLeft}
                    onChange={(e) => setBackOnLeft(e.target.checked)}
                  />
                  뒷면을 왼쪽에
                </label>
              )}

              {s.duplex && (
                <label className="preview-toggle">
                  <input
                    type="checkbox"
                    checked={s.backTurn180}
                    onChange={(e) => s.patch({ backTurn180: e.target.checked })}
                  />
                  뒷면 반 바퀴 돌리기
                  <span className="preview-toggle-hint">
                    짧은 변으로 넘기는 프린터용. 한 장 뽑아 빛에 비춰 앞뒤
                    구멍자리가 겹치는 쪽으로 고르세요
                  </span>
                </label>
              )}

              {lastReverted && (
                <button
                  className="ghost"
                  onClick={undoRevert}
                  title="방금 되돌리기로 지운 내용을 다시 살립니다"
                >
                  되돌리기 취소
                </button>
              )}

              <button className="ghost" onClick={() => setZoom('fit')} disabled={zoom === 'fit'} title="화면에 맞춤">
                맞춤
              </button>
              <ZoomStepper zoom={zoom} onChange={setZoom} />
            </div>

            {printMode === 'repeat' ? (
              <RepeatPrint
                layout={layout}
                totalCount={totalSlots}
                unit="칸"
                sheets={sheets}
                hint={s.duplex && <> (양면이라 앞뒤 {layout.count * 2}칸)</>}
              />
            ) : printMode === 'dataset' ? (
              <RepeatPrint
                layout={layout}
                totalCount={totalPages}
                unit="쪽"
                sheets={sheets}
                hint={s.cutStack && <> · 겹치기</>}
              />
            ) : printMode === 'notebook' ? (
              <RepeatPrint
                layout={layout}
                totalCount={totalNotebookUnits}
                unit="장"
                sheets={sheets}
                hint={!s.duplex && <> · 양면 인쇄를 켜야 뒤쪽 쪽들이 함께 찍힙니다</>}
              />
            ) : (
              <SlotAssign layout={layout} />
            )}

            <div className="editor-bar-slot" ref={setEditBarSlot} />

            <div className="print-body">
            <div className="stage-area" ref={stageRef} onDoubleClick={onStageDoubleClick}>
              {layout.count === 0 ? (
                <div className="empty">속지가 용지보다 큽니다. 용지를 키우거나 속지를 줄이세요.</div>
              ) : (
                // 필요한 장수가 0이어도(반복 매수 0, 빈 세트형 등) 빈 칸이라도
                // 한 장은 보여준다 — 화면이 통째로 비어 있으면 뭘 봐야 할지 모른다.
                Array.from({ length: Math.max(1, sheets) }, (_, sheet) => {
                  const { previewOverrides: front, previewBackOverrides: back } = overridesForSheet(sheet);
                  const pageStyle = { width: width * scale, height: height * scale };
                  // 뒷면 배치. 짧은 변으로 넘기는 프린터면 반 바퀴 더 돌린다 —
                  // PDF도 같은 두 줄을 쓴다(pdf/export의 backLayout).
                  const mirrored = mirrorLayout(layout, width, height);
                  const backLayout = s.backTurn180
                    ? turnLayout180(mirrored, width, height)
                    : mirrored;

                  // 낱장 조합·세트형에서만 칸을 손볼 수 있다 — 반복 인쇄(만년형)는
                  // 모든 칸이 완전히 같은 내용이라(같은 양식 반복) "이 칸만" 손본다는
                  // 개념 자체가 없다.
                  const editable = printMode === 'combo' || printMode === 'dataset';
                  function onSlotClickFor(side: Side) {
                    return (index: number, content: PreviewSlotContent) => {
                      if (printMode === 'dataset') {
                        if (content.calendarPage === undefined) return; // 빈 칸 — 손볼 페이지가 없다
                        beginEdit(
                          {
                            kind: 'dataset',
                            sheet,
                            index,
                            side,
                            page: content.calendarPage,
                            seed: content.objects,
                            hadOverride: content.overridden ?? false,
                          },
                          content,
                        );
                      } else if (printMode === 'combo') {
                        beginEdit(
                          { kind: 'combo', sheet, index, side, seed: content.objects, hadOverride: content.overridden ?? false },
                          content,
                        );
                      }
                    };
                  }

                  const frontPage = (
                    <div className="print-sheet-page" style={pageStyle}>
                      <PaperPreview
                        paper={{ ...s.paper, width, height }}
                        insert={active.insert}
                        dotGrid={active.dotGrid}
                        objects={active.objects.present}
                        slotOverrides={front.size > 0 ? front : undefined}
                        layout={layout}
                        cropMark={s.cropMark}
                        showRuler={s.showRuler}
                        unprintable={s.unprintable}
                        mode={printPreview ? 'print' : 'edit'}
                        calendarYear={dataset?.kind === 'calendar' ? dataset.year : undefined}
                        onSlotClick={editable ? onSlotClickFor('front') : undefined}
                      />
                      {editingSession?.sheet === sheet && editingSession.side === 'front' && (
                        <PrintSlotEditor
                          slot={layout.slots[editingSession.index]}
                          rotated={layout.rotated}
                          scale={scale}
                          onFinish={finishEdit}
                          hasOverride={editingSession.hadOverride}
                          onRevert={revertEdit}
                          editBarSlot={editBarSlot}
                        />
                      )}
                    </div>
                  );

                  // 뒷면 — 칸 위치는 core/layout의 mirrorLayout으로 뒤집는다(회전
                  // 배치가 아니면 좌우만, 회전 배치면 좌우·상하 둘 다). 칸 안의
                  // 내용(도트·글자)은 뒤집지 않지만, 안전영역·타공 안내는 항상
                  // mirror로 표시한다(설계문서 8장) — 이쪽은 회전과 무관하게
                  // 항상 켠다.
                  const backPage = s.duplex && (
                    <div className="print-sheet-page" style={pageStyle}>
                      <PaperPreview
                        paper={{ ...s.paper, width, height }}
                        insert={active.insert}
                        // 격자는 앞뒤 공유값이라, 뒷면이 없어도(fillEmptyBack일 때) 그대로 쓴다.
                        dotGrid={active.back || s.fillEmptyBack ? active.dotGrid : BLANK_PREVIEW_GRID}
                        objects={active.back?.objects.present ?? []}
                        slotOverrides={back.size > 0 ? back : undefined}
                        layout={backLayout}
                        cropMark={s.cropMark}
                        showRuler={s.showRuler}
                        unprintable={s.unprintable}
                        mode={printPreview ? 'print' : 'edit'}
                        mirror
                        calendarYear={dataset?.kind === 'calendar' ? dataset.year : undefined}
                        onSlotClick={editable ? onSlotClickFor('back') : undefined}
                      />
                      {editingSession?.sheet === sheet && editingSession.side === 'back' && (
                        <PrintSlotEditor
                          slot={backLayout.slots[editingSession.index]}
                          rotated={backLayout.rotated}
                          turn180={backLayout.turn180}
                          scale={scale}
                          onFinish={finishEdit}
                          hasOverride={editingSession.hadOverride}
                          onRevert={revertEdit}
                          editBarSlot={editBarSlot}
                        />
                      )}
                    </div>
                  );

                  return (
                    <div className="print-sheet" key={sheet}>
                      {s.duplex ? (backOnLeft ? <>{backPage}{frontPage}</> : <>{frontPage}{backPage}</>) : frontPage}
                    </div>
                  );
                })
              )}
            </div>
            <PrintSidePanel />
            </div>
          </div>
        )}
      </main>

      <footer>
        <span>
          용지 {width} × {height}mm
        </span>
        {active && (
          <>
            <span>
              속지 {active.insert.width} × {active.insert.height}mm
            </span>
            <span>
              한 장에 <b>{layout.count}개</b> ({layout.cols} × {layout.rows})
              {layout.rotated && ' · 90도 회전'}
            </span>
          </>
        )}

        {/*
          인쇄 안내. 인쇄하기 탭에서만 띄운다 — 양식 만들기 중에는 상관없는 이야기다.
          맨 아래 줄에 두는 이유는 미리보기를 가리지 않기 위해서다.
        */}
        {tab === 'print' && (
          <span className="print-hint">
            인쇄 대화상자에서 <b>실제 크기 / 100%</b>를 고르세요 — “페이지에 맞춤”은 96~97%로
            축소됩니다
          </span>
        )}
      </footer>
    </div>
  );
}
