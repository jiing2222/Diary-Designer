import type { DiaryObject } from './objects';
import type { Work, WorkItem } from './work';
import type { Diary } from './diary';
import type { Folder } from './library';
import type { SavedTextStyle } from './textStyles';
import type { SavedPalette } from './palettes';
import type { FontInfo, ImageInfo } from './assets';

/**
 * 계정 동기화의 판단(리뉴얼 8-2, 기본계획 8-2 ‘서버를 작업마다 한 칸씩’).
 *
 * **이 기기 저장(IndexedDB)이 기준**이고 서버는 그 뒤를 따르는 사본이다. 기록은 작업·다이어리·폴더·
 * 글자 스타일·팔레트·글꼴·이미지 하나하나가 서버의 한 칸이다(`kind:key`). 여기서는 무엇을 올리고 받을지만
 * 정한다 — 실제로 주고받는 것은 cloud/sync.
 *
 * 마지막으로 맞춘 때의 서버 시각과 내용 지문(`SyncState`)을 기억해 두고, 양쪽 중 어디가 바뀌었는지 본다.
 * - 한쪽만 바뀌었으면 그쪽을 따른다(지운 것도 ‘바뀐 것’이다).
 * - **양쪽 다 바뀌었으면**: 작업은 둘 다 남긴다 — 서버 것이 원래 자리에, 이 기기 것은 ‘(이 기기 사본)’으로
 *   새 자리에(2026-10-13 결정). 다른 기록은 서버 것을 따른다.
 * - 지운 쪽과 고친 쪽이 만나면 고친 쪽이 이긴다 — 잃는 것이 없게.
 * - **이 계정과 맞춘 적이 없는 로컬 기록이 서버의 같은 id와 부딪히면** 서로 다른 것이다 — id가 기기마다
 *   1부터 세어지므로(`w5`) 두 기기가 따로 만든 것이 같은 id일 수 있다. 로컬 쪽에 새 id를 준다.
 */

export type SyncKind = 'work' | 'diary' | 'folder' | 'textStyle' | 'palette' | 'font' | 'image' | 'prefs';

/** 서버의 한 칸. `deleted`면 지움 표시만 남은 것(다른 기기에서도 지우게). */
export interface RemoteDoc {
  id: string;
  kind: SyncKind;
  key: string;
  data: unknown;
  deleted: boolean;
  updated: string;
}

/** 칸마다 마지막으로 맞춘 때 — 서버 레코드 id·서버 시각·그때 내용의 지문. */
export interface SyncEntry {
  remoteId: string;
  updated: string;
  hash: string;
}

export type SyncState = Record<string, SyncEntry>;

/** 이 기기의 자료 중 동기화하는 것. */
export interface SyncSnapshot {
  works: Work[];
  diaries: Diary[];
  folders: Folder[];
  textStyles: SavedTextStyle[];
  savedPalettes: SavedPalette[];
  fonts: FontInfo[];
  images: ImageInfo[];
  defaultDiaryId: string | null;
}

export const docKey = (kind: SyncKind, key: string) => `${kind}:${key}`;

export function splitDocKey(k: string): { kind: SyncKind; key: string } {
  const i = k.indexOf(':');
  return { kind: k.slice(0, i) as SyncKind, key: k.slice(i + 1) };
}

/** 내용 지문. 같은 자료는 같은 글자가 된다(서버를 거쳐 와도 JSON의 키 순서는 그대로다). */
export function hashOf(data: unknown): string {
  return JSON.stringify(data);
}

/** 이 기기 자료를 칸들로. 기본 다이어리 같은 설정은 `prefs` 한 칸. */
export function docsOf(s: SyncSnapshot): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const add = (kind: SyncKind, list: { id: string }[]) => list.forEach((x) => out.set(docKey(kind, x.id), x));
  add('work', s.works);
  add('diary', s.diaries);
  add('folder', s.folders);
  add('textStyle', s.textStyles);
  add('palette', s.savedPalettes);
  add('font', s.fonts);
  add('image', s.images);
  out.set(docKey('prefs', 'prefs'), { defaultDiaryId: s.defaultDiaryId });
  return out;
}

export type SyncAction =
  /** 이 기기 것을 올린다. `remoteId`가 있으면 그 칸을 덮어쓴다. */
  | { type: 'push'; key: string; remoteId?: string }
  /** 서버 것을 받는다. */
  | { type: 'pull'; key: string; doc: RemoteDoc }
  /** 서버 칸에 지움 표시를 남긴다. */
  | { type: 'deleteRemote'; key: string; remoteId: string }
  /** 이 기기에서 지운다. */
  | { type: 'deleteLocal'; key: string; doc: RemoteDoc }
  /** 같은 내용 — 맞춘 것으로 적기만 한다. */
  | { type: 'same'; key: string; doc: RemoteDoc }
  /**
   * 이 기기 것에 새 id를 주고 새 칸으로 올린 뒤, 원래 칸은 서버 것을 받는다(`doc`이 지움 표시가 아니면).
   * `conflict`면 양쪽 다 고친 작업이라 ‘(이 기기 사본)’ 이름을 붙인다.
   */
  | { type: 'rekey'; key: string; doc: RemoteDoc; conflict: boolean };

/**
 * 무엇을 할지 정한다. `skip`은 이 기기에만 두기로 한 칸(처음 로그인 때 ‘안 올리기’) — 올리지 않는다.
 */
export function planSync(
  local: Map<string, unknown>,
  remote: RemoteDoc[],
  state: SyncState,
  skip: Set<string> = new Set(),
): SyncAction[] {
  const remoteByKey = new Map(remote.map((d) => [docKey(d.kind, d.key), d]));
  const keys = new Set([...local.keys(), ...remoteByKey.keys(), ...Object.keys(state)]);
  const out: SyncAction[] = [];
  for (const key of keys) {
    const l = local.get(key);
    const r = remoteByKey.get(key);
    const s = state[key];
    const has = l !== undefined;
    const live = r !== undefined && !r.deleted;

    if (!s) {
      // 이 계정과 맞춘 적이 없다.
      if (has && skip.has(key)) {
        if (live) out.push({ type: 'rekey', key, doc: r, conflict: false });
        continue;
      }
      if (has && live) {
        out.push(
          hashOf(l) === hashOf(r.data)
            ? { type: 'same', key, doc: r }
            : { type: 'rekey', key, doc: r, conflict: false },
        );
      } else if (has) out.push({ type: 'push', key, remoteId: r?.id });
      else if (live) out.push({ type: 'pull', key, doc: r });
      continue;
    }

    const localChanged = has ? hashOf(l) !== s.hash : true;
    const remoteChanged = r ? r.updated !== s.updated : false;
    if (!localChanged && !remoteChanged) continue;

    if (localChanged && !remoteChanged) {
      if (has) out.push({ type: 'push', key, remoteId: r?.id ?? s.remoteId });
      else if (r && !r.deleted) out.push({ type: 'deleteRemote', key, remoteId: r.id });
      continue;
    }
    if (!localChanged && remoteChanged) {
      out.push(r!.deleted ? { type: 'deleteLocal', key, doc: r! } : { type: 'pull', key, doc: r! });
      continue;
    }
    // 양쪽 다 바뀌었다.
    if (!has) {
      // 여기서 지웠는데 저쪽에서 고쳤다 — 고친 것을 되살린다. 저쪽도 지웠으면 맞춘 것으로 적는다.
      out.push(r!.deleted ? { type: 'same', key, doc: r! } : { type: 'pull', key, doc: r! });
    } else if (!live) {
      // 저쪽에서 지웠는데 여기서 고쳤다 — 고친 것을 다시 올린다.
      out.push({ type: 'push', key, remoteId: r!.id });
    } else if (hashOf(l) === hashOf(r!.data)) {
      out.push({ type: 'same', key, doc: r! });
    } else if (splitDocKey(key).kind === 'work') {
      out.push({ type: 'rekey', key, doc: r!, conflict: true });
    } else {
      out.push({ type: 'pull', key, doc: r! });
    }
  }
  return out;
}

/* ───────────────────────── 새 id로 바꾸기 ───────────────────────── */

/** 원래 id에 기기마다 다른 꼬리를 붙인다 — 숫자 카운터(`ensureIdCounterAbove`)를 건드리지 않게 글자만. */
export function freshKey(key: string, random: () => number = Math.random): string {
  let tail = '';
  for (let i = 0; i < 5; i++) tail += String.fromCharCode(97 + Math.floor(random() * 26));
  return `${key.split('~')[0]}~${tail}`;
}

/** 작업 안의 모든 객체와 날짜별로 바꾼 속성에 `fn`을 적용한다. 바뀐 게 없으면 같은 작업. */
function mapWorkRefs(work: Work, prop: 'font' | 'imageId', from: string, to: string): Work {
  let changed = false;
  const obj = (o: DiaryObject): DiaryObject => {
    if ((o as unknown as Record<string, unknown>)[prop] !== from) return o;
    changed = true;
    return { ...o, [prop]: to } as DiaryObject;
  };
  const items = work.items.map((item): WorkItem => {
    if (item.kind === 'page') return { ...item, face: { ...item.face, objects: item.face.objects.map(obj) } };
    return {
      ...item,
      faces: item.faces.map((f) => ({ ...f, objects: f.objects.map(obj) })),
      overrides: Object.fromEntries(
        Object.entries(item.overrides).map(([k, ov]) => [
          k,
          {
            ...ov,
            added: ov.added.map(obj),
            props: Object.fromEntries(
              Object.entries(ov.props).map(([id, p]) => {
                if (p[prop] !== from) return [id, p];
                changed = true;
                return [id, { ...p, [prop]: to }];
              }),
            ),
          },
        ]),
      ),
    };
  });
  return changed ? { ...work, items } : work;
}

/**
 * 이 기기 자료에서 한 기록의 id를 바꾸고, 그것을 가리키던 곳도 함께 바꾼다 — 작업의 다이어리·폴더,
 * 객체의 글꼴·이미지, 글자 스타일의 글꼴, 기본 다이어리.
 */
export function rekeySnapshot(s: SyncSnapshot, kind: SyncKind, from: string, to: string): SyncSnapshot {
  const re = <T extends { id: string }>(list: T[]) => list.map((x) => (x.id === from ? { ...x, id: to } : x));
  switch (kind) {
    case 'work':
      return { ...s, works: re(s.works) };
    case 'diary':
      return {
        ...s,
        diaries: re(s.diaries),
        works: s.works.map((w) => (w.diaryId === from ? { ...w, diaryId: to } : w)),
        defaultDiaryId: s.defaultDiaryId === from ? to : s.defaultDiaryId,
      };
    case 'folder':
      return {
        ...s,
        folders: re(s.folders),
        works: s.works.map((w) => (w.folderId === from ? { ...w, folderId: to } : w)),
      };
    case 'textStyle':
      return { ...s, textStyles: re(s.textStyles) };
    case 'palette':
      return { ...s, savedPalettes: re(s.savedPalettes) };
    case 'font':
      return {
        ...s,
        fonts: re(s.fonts),
        works: s.works.map((w) => mapWorkRefs(w, 'font', from, to)),
        textStyles: s.textStyles.map((t) => (t.style.font === from ? { ...t, style: { ...t.style, font: to } } : t)),
      };
    case 'image':
      return { ...s, images: re(s.images), works: s.works.map((w) => mapWorkRefs(w, 'imageId', from, to)) };
    case 'prefs':
      return s;
  }
}

/** 받은 기록을 이 기기 자료에 넣는다(있으면 바꾸고 없으면 더한다). */
export function applyRemote(s: SyncSnapshot, kind: SyncKind, key: string, data: unknown): SyncSnapshot {
  const put = <T extends { id: string }>(list: T[]) =>
    list.some((x) => x.id === key) ? list.map((x) => (x.id === key ? (data as T) : x)) : [...list, data as T];
  switch (kind) {
    case 'work':
      return { ...s, works: put(s.works) };
    case 'diary':
      return { ...s, diaries: put(s.diaries) };
    case 'folder':
      return { ...s, folders: put(s.folders) };
    case 'textStyle':
      return { ...s, textStyles: put(s.textStyles) };
    case 'palette':
      return { ...s, savedPalettes: put(s.savedPalettes) };
    case 'font':
      return { ...s, fonts: put(s.fonts) };
    case 'image':
      return { ...s, images: put(s.images) };
    case 'prefs': {
      const id = (data as { defaultDiaryId?: string | null }).defaultDiaryId ?? null;
      return { ...s, defaultDiaryId: id };
    }
  }
}

/** 이 기기에서 지운다(다른 기기에서 지운 것). */
export function removeLocal(s: SyncSnapshot, kind: SyncKind, key: string): SyncSnapshot {
  const drop = <T extends { id: string }>(list: T[]) => list.filter((x) => x.id !== key);
  switch (kind) {
    case 'work':
      return { ...s, works: drop(s.works) };
    case 'diary':
      return { ...s, diaries: drop(s.diaries) };
    case 'folder':
      return { ...s, folders: drop(s.folders) };
    case 'textStyle':
      return { ...s, textStyles: drop(s.textStyles) };
    case 'palette':
      return { ...s, savedPalettes: drop(s.savedPalettes) };
    case 'font':
      return { ...s, fonts: drop(s.fonts) };
    case 'image':
      return { ...s, images: drop(s.images) };
    case 'prefs':
      return s;
  }
}

/** 둘 다 고친 작업의 이 기기 쪽 이름. */
export const CONFLICT_SUFFIX = ' (이 기기 사본)';
