import { activeWork, cursorOf, savedPrintSettingsOf, useStore } from '../store';
import {
  deleteFolder,
  deleteWork,
  loadAll,
  migrateFromV1,
  saveDiary,
  saveFolder,
  saveMeta,
  saveWork,
  v2Delete,
  type V2Meta,
} from '../storage/v2';
import { expiredTrash } from '../core/library';
import { reserveIds, restoreCachedFonts } from '../fonts/registry';
import { reserveImageIds, restoreCachedImages } from '../images/registry';
import type { Work } from '../core/work';
import type { Diary } from '../core/diary';
import type { Folder } from '../core/library';

/**
 * 리뉴얼 저장소(storage/v2)와 store를 잇는다 — 처음 열 때 읽고, 고칠 때마다 쓴다.
 *
 * store는 저장소를 모른다(CLAUDE.md의 층 구분과 같은 이유 — 계산·상태와 바깥 일을
 * 나눈다). 여기서 store를 바라보다가 **바뀐 작업만** 그 칸에 다시 쓴다.
 */

let meta: V2Meta = {};

/** 처음 열 때 한 번. 옛 저장소에서 옮기고, 읽고, 휴지통 기간이 지난 것을 지운다. */
export async function boot(): Promise<{ skippedNotebooks: string[] }> {
  const now = new Date().toISOString();
  await migrateFromV1(now);
  const data = await loadAll();
  meta = data.meta;

  // 휴지통 30일이 지난 것은 여기서 완전히 지운다(세부계획 B).
  const expired = new Set(expiredTrash(data.works, now));
  await Promise.all([...expired].map((id) => deleteWork(id)));
  const works = data.works.filter((w) => !expired.has(w.id));

  // 글꼴·이미지 파일은 이름으로 캐시돼 있고 객체는 id로 가리킨다 — 저장해둔 표로
  // 같은 이름에 같은 id를 돌려준다(fonts/registry의 restoreCachedFonts 주석).
  reserveIds((meta.fonts ?? []).map((f) => f.id));
  reserveImageIds((meta.images ?? []).map((i) => i.id));

  useStore.getState().hydrate({
    works,
    diaries: data.diaries,
    folders: data.folders,
    tabs: meta.tabs,
    defaultDiaryId: meta.defaultDiaryId,
    textStyles: meta.textStyles,
    print: meta.print,
    cursors: meta.cursors,
  });
  remember(useStore.getState());

  const [fonts, images] = await Promise.all([
    restoreCachedFonts((name) => meta.fonts?.find((f) => f.name === name)?.id),
    restoreCachedImages((name) => meta.images?.find((i) => i.name === name)?.id),
  ]);
  fonts.forEach((f) => useStore.getState().addUserFont(f));
  images.forEach((i) => useStore.getState().addUserImage(i));

  return { skippedNotebooks: meta.skippedNotebooks ?? [] };
}

/* ────────────────────────── 자동 저장 ────────────────────────── */

type Saved = {
  works: Map<string, Work>;
  diaries: Map<string, Diary>;
  folders: Map<string, Folder>;
  metaKey: string;
  /** 보는 위치(탭·스크롤·확대·선택)를 뺀 설정 — 이것이 바뀌어야 ‘저장 중’을 보여준다. */
  contentKey: string;
};
let saved: Saved = { works: new Map(), diaries: new Map(), folders: new Map(), metaKey: '', contentKey: '' };

type State = ReturnType<typeof useStore.getState>;

function metaOf(s: State): V2Meta {
  const work = activeWork(s);
  return {
    ...meta,
    tabs: s.tabs,
    cursors: work
      ? { ...s.cursors, [work.id]: { ...cursorOf(s, work), selectedIds: s.selectedIds } }
      : s.cursors,
    defaultDiaryId: s.defaultDiaryId,
    fonts: s.userFonts.map((f) => ({ id: f.id, name: f.name })),
    images: s.userImages.map((i) => ({ id: i.id, name: i.name })),
    textStyles: s.textStyles,
    print: savedPrintSettingsOf(s),
  };
}

/**
 * 보는 위치를 뺀 설정의 열쇠. 탭·스크롤·확대·선택만 바뀐 것은 작업 내용이 아니라서, 저장은 하되
 * 위 막대에 ‘저장 중…’을 띄우지 않는다(스크롤할 때마다 깜빡이면 무엇이 바뀌었는지 헷갈린다).
 */
function contentKeyOf(s: State): string {
  const { tabs: _tabs, cursors: _cursors, ...rest } = metaOf(s);
  return JSON.stringify(rest);
}

function remember(s: State) {
  saved = {
    works: new Map(s.works.map((w) => [w.id, w])),
    diaries: new Map(s.diaries.map((d) => [d.id, d])),
    folders: new Map(s.folders.map((f) => [f.id, f])),
    metaKey: JSON.stringify(metaOf(s)),
    contentKey: contentKeyOf(s),
  };
}

/**
 * 지난번 쓴 것과 견줘 바뀐 것만 쓴다. store는 고칠 때마다 새 객체를 만들므로(불변),
 * 참조가 같으면 안 바뀐 것이다.
 */
function hasChanges(s: State): boolean {
  return s.works.some((w) => saved.works.get(w.id) !== w) || saved.works.size !== s.works.length
    || s.diaries.some((d) => saved.diaries.get(d.id) !== d) || saved.diaries.size !== s.diaries.length
    || s.folders.some((f) => saved.folders.get(f.id) !== f) || saved.folders.size !== s.folders.length
    || JSON.stringify(metaOf(s)) !== saved.metaKey;
}

/** 작업 내용(작업·다이어리·폴더·글자 스타일·인쇄 설정 등)이 바뀌었는가 — 보는 위치만 바뀐 것은 아니다. */
function hasContentChanges(s: State): boolean {
  return s.works.some((w) => saved.works.get(w.id) !== w) || saved.works.size !== s.works.length
    || s.diaries.some((d) => saved.diaries.get(d.id) !== d) || saved.diaries.size !== s.diaries.length
    || s.folders.some((f) => saved.folders.get(f.id) !== f) || saved.folders.size !== s.folders.length
    || contentKeyOf(s) !== saved.contentKey;
}

let inFlight: Promise<void> | null = null;

/** 저장을 기다린 뒤에만 ‘저장됨’으로. 실패하면 바뀐 것이 그대로 남아 다음 시도에서 다시 쓴다. */
export async function flushAutosave(): Promise<void> {
  if (inFlight) {
    await inFlight;
    return flushAutosave();
  }
  const s = useStore.getState();
  if (!s.ready) return;
  if (!hasChanges(s)) {
    if (s.saveStatus !== 'saved') useStore.setState({ saveStatus: 'saved' });
    return;
  }
  const next = metaOf(s);
  // 보는 위치만 바뀌었으면 조용히 저장한다(실패하면 그때는 알린다).
  const loud = hasContentChanges(s) || s.saveStatus === 'error';
  if (loud) useStore.setState({ saveStatus: 'saving' });
  inFlight = (async () => {
    try {
      const writes: Promise<unknown>[] = [];
      for (const w of s.works) if (saved.works.get(w.id) !== w) writes.push(saveWork(w));
      for (const id of saved.works.keys()) if (!s.works.some((w) => w.id === id)) writes.push(deleteWork(id));
      for (const d of s.diaries) if (saved.diaries.get(d.id) !== d) writes.push(saveDiary(d));
      for (const id of saved.diaries.keys()) if (!s.diaries.some((d) => d.id === id)) writes.push(v2Delete('diaries', id));
      for (const f of s.folders) if (saved.folders.get(f.id) !== f) writes.push(saveFolder(f));
      for (const id of saved.folders.keys()) if (!s.folders.some((f) => f.id === id)) writes.push(deleteFolder(id));
      if (JSON.stringify(next) !== saved.metaKey) writes.push(saveMeta(next));
      // 실패한 쓰기가 있어도 나머지가 끝나야 다음 저장과 순서가 뒤집히지 않는다.
      const results = await Promise.allSettled(writes);
      if (results.some((r) => r.status === 'rejected')) throw new Error('저장 실패');
      meta = next;
      remember(s);
      const after = useStore.getState();
      if (loud || after.saveStatus !== 'saved') {
        useStore.setState({ saveStatus: hasContentChanges(after) ? 'pending' : 'saved' });
      }
    } catch {
      useStore.setState({ saveStatus: 'error' });
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
}

/** 고칠 때마다 시계를 다시 맞추고 손을 멈추면 쓴다. 탭을 숨기거나 닫을 때는 바로 쓴다. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (loud: boolean) => {
    if (timer !== null) clearTimeout(timer);
    if (loud) useStore.setState({ saveStatus: 'pending' });
    timer = setTimeout(() => {
      timer = null;
      void flushAutosave();
    }, 800);
  };
  const now = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    void flushAutosave();
  };
  const onVisibility = () => {
    if (document.hidden) now();
  };
  const unsubscribe = useStore.subscribe((s, before) => {
    // 저장 상태를 알리는 갱신이 다시 저장을 예약하지 않게 한다. 작업 내용이 바뀌면 ‘저장 중’을
    // 보여주고, 보는 위치(탭·스크롤·확대·선택)만 바뀌면 조용히 예약한다.
    const content = s.works !== before.works || s.diaries !== before.diaries || s.folders !== before.folders
      || contentKeyOf(s) !== contentKeyOf(before);
    if (content) schedule(true);
    else if (JSON.stringify(metaOf(s)) !== JSON.stringify(metaOf(before))) schedule(false);
  });
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', now);
    document.removeEventListener('visibilitychange', onVisibility);
    now();
  };
}
