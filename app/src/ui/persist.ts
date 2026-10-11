import { useStore } from '../store';
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
};
let saved: Saved = { works: new Map(), diaries: new Map(), folders: new Map(), metaKey: '' };

type State = ReturnType<typeof useStore.getState>;

function metaOf(s: State): V2Meta {
  return {
    ...meta,
    tabs: s.tabs,
    defaultDiaryId: s.defaultDiaryId,
    fonts: s.userFonts.map((f) => ({ id: f.id, name: f.name })),
    images: s.userImages.map((i) => ({ id: i.id, name: i.name })),
  };
}

function remember(s: State) {
  saved = {
    works: new Map(s.works.map((w) => [w.id, w])),
    diaries: new Map(s.diaries.map((d) => [d.id, d])),
    folders: new Map(s.folders.map((f) => [f.id, f])),
    metaKey: JSON.stringify(metaOf(s)),
  };
}

/**
 * 지난번 쓴 것과 견줘 바뀐 것만 쓴다. store는 고칠 때마다 새 객체를 만들므로(불변),
 * 참조가 같으면 안 바뀐 것이다.
 */
function flush() {
  const s = useStore.getState();
  if (!s.ready) return;

  for (const w of s.works) if (saved.works.get(w.id) !== w) void saveWork(w);
  for (const id of saved.works.keys()) if (!s.works.some((w) => w.id === id)) void deleteWork(id);

  for (const d of s.diaries) if (saved.diaries.get(d.id) !== d) void saveDiary(d);
  for (const id of saved.diaries.keys()) if (!s.diaries.some((d) => d.id === id)) void v2Delete('diaries', id);

  for (const f of s.folders) if (saved.folders.get(f.id) !== f) void saveFolder(f);
  for (const id of saved.folders.keys()) if (!s.folders.some((f) => f.id === id)) void deleteFolder(id);

  const next = metaOf(s);
  const key = JSON.stringify(next);
  if (key !== saved.metaKey) {
    meta = next;
    void saveMeta(next);
  }
  remember(s);
}

/** 고칠 때마다 시계를 다시 맞추고 손을 멈추면 쓴다. 탭을 숨기거나 닫을 때는 바로 쓴다. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 800);
  };
  const now = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    flush();
  };
  const onVisibility = () => {
    if (document.hidden) now();
  };
  const unsubscribe = useStore.subscribe(schedule);
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', now);
    document.removeEventListener('visibilitychange', onVisibility);
    now();
  };
}
