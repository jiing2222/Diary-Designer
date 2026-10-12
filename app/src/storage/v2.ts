/**
 * 리뉴얼의 브라우저 저장소 — `rings-v2`(기본계획 8-1).
 *
 * 옛 저장소(`diary-designer`, storage/idb)와 **이름이 다르다.** 같은 브라우저에서
 * 옛 버전(main)과 새 버전을 번갈아 켜도 서로의 데이터를 망가뜨리지 않는다.
 * 새 버전은 처음 열 때 옛 저장소를 **읽어서 복사만** 한다(`migrateFromV1`).
 * 옮기다 문제가 생기면 `rings-v2`만 지우고 다시 열면 된다.
 *
 * 작업은 한 덩어리 JSON이 아니라 **작업마다 한 칸**에 넣는다 — 열린 작업 여러 개 중
 * 바뀐 것만 쓰고, 나중에 클라우드도 작업 단위로 올린다(기본계획 8-2).
 *
 * 읽기·쓰기 실패는 호출자에게 알린다. 빈 저장소와 실패를 구분하고, 화면은 저장 실패를 표시한다.
 */
import { idbEntries, idbGet } from './idb';
import { readProject, toTemplates, type SavedFont, type SavedImage, type SavedProject } from '../core/project';
import { ensureIdCounterAbove, type DiaryObject } from '../core/objects';
import { migrateTemplates, type Migrated } from '../core/migrate';
import type { Work } from '../core/work';
import type { Diary } from '../core/diary';
import type { Folder } from '../core/library';
import type { SavedTextStyle } from '../core/textStyles';
import type { SavedPalette } from '../core/palettes';
import type { Cursor, Tabs } from '../core/workspace';
import type { FontInfo, ImageInfo } from '../core/assets';

const DB_NAME = 'rings-v2';
const DB_VERSION = 1;

export type V2Store = 'works' | 'diaries' | 'folders' | 'meta' | 'fonts' | 'images';
const STORES: V2Store[] = ['works', 'diaries', 'folders', 'meta', 'fonts', 'images'];

function openV2(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: V2Store, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  const db = await openV2();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = body(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? ((req.result as T | undefined) ?? null) : null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('저장소 작업이 중단됐어요.'));
  });
}

export async function v2Put(store: V2Store, key: string, value: unknown): Promise<void> {
  await run(store, 'readwrite', (s) => {
    s.put(value, key);
  });
}

export async function v2Get<T>(store: V2Store, key: string): Promise<T | null> {
  return run<T>(store, 'readonly', (s) => s.get(key));
}

export async function v2Delete(store: V2Store, key: string): Promise<void> {
  await run(store, 'readwrite', (s) => {
    s.delete(key);
  });
}

export async function v2All<T>(store: V2Store): Promise<T[]> {
  return (await run<T[]>(store, 'readonly', (s) => s.getAll())) ?? [];
}

/** 여러 칸을 한 번에 — 옮기기처럼 전부 들어가거나 하나도 안 들어가야 할 때. */
async function putMany(entries: [V2Store, string, unknown][]): Promise<boolean> {
  try {
    const db = await openV2();
    const stores = [...new Set(entries.map(([s]) => s))];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const [store, key, value] of entries) tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

/* ────────────────────────── 읽고 쓰기 ────────────────────────── */

export interface V2Meta {
  /** 옛 저장소에서 옮긴 시각. 있으면 다시 옮기지 않는다. */
  migratedAt?: string;
  /** 옮기지 않은 노트 이름 — 처음 한 번 알려준다. */
  skippedNotebooks?: string[];
  tabs?: Tabs;
  /** 탭마다 편집 위치·확대·스크롤. 되돌리기 기록은 이번 실행에서만 보관한다. */
  cursors?: Record<string, Cursor>;
  /**
   * 등록한 글꼴·이미지의 목록 정보. 파일은 별도 fonts/images 칸에 id별로 남기고,
   * 이 목록은 파일이 없어도 이름·즐겨찾기·숨김 상태를 보존한다.
   */
  fonts?: FontInfo[];
  images?: ImageInfo[];
  /** 새 작업을 만들 때 쓰는 다이어리. */
  defaultDiaryId?: string | null;
  /** 저장한 글자 스타일 — 모든 작업 공통(core/textStyles). */
  textStyles?: SavedTextStyle[];
  /** 저장한 팔레트 — 모든 작업 공통(core/palettes). */
  savedPalettes?: SavedPalette[];
  /** 인쇄 설정(용지·배치·표시·PDF 전 확인 창의 선택) — store의 SAVED_PRINT_KEYS. */
  print?: Record<string, unknown>;
}

const META_KEY = 'meta';

export async function loadMeta(): Promise<V2Meta> {
  return (await v2Get<V2Meta>('meta', META_KEY)) ?? {};
}

export async function saveMeta(meta: V2Meta): Promise<void> {
  await v2Put('meta', META_KEY, meta);
}

export const saveWork = (w: Work) => v2Put('works', w.id, w);
export const deleteWork = (id: string) => v2Delete('works', id);
export const saveDiary = (d: Diary) => v2Put('diaries', d.id, d);
export const saveFolder = (f: Folder) => v2Put('folders', f.id, f);
export const deleteFolder = (id: string) => v2Delete('folders', id);

export interface V2Data {
  works: Work[];
  diaries: Diary[];
  folders: Folder[];
  meta: V2Meta;
}

export async function loadAll(): Promise<V2Data> {
  const [works, diaries, folders, meta] = await Promise.all([
    v2All<Work>('works'),
    v2All<Diary>('diaries'),
    v2All<Folder>('folders'),
    loadMeta(),
  ]);
  return { works, diaries, folders, meta };
}

/* ────────────────────────── 옛 저장소에서 옮기기 ────────────────────────── */

/**
 * 옛 자동 저장 JSON을 새 구조로. IndexedDB를 모르는 순수 함수라 테스트한다.
 * 읽을 수 없는 판이면 null — 옮길 것이 없는 것으로 친다.
 */
export function migrateSnapshot(
  raw: string | null,
  now: string,
): (Migrated & { fonts: SavedFont[]; images: SavedImage[] }) | null {
  if (raw === null) return null;
  try {
    const parsed = readProject(JSON.parse(raw));
    if ('error' in parsed) return null;
    // 옮기는 동안 반복 양식을 복사하며 새 id를 매긴다. 카운터를 먼저 옛 id들보다 위로
    // 올려야 새 id가 다른 양식의 객체와 겹치지 않는다(옛 판 loadProject와 같은 이유).
    ensureIdCounterAbove(savedIds(parsed.ok));
    return {
      ...migrateTemplates(toTemplates(parsed.ok), now),
      fonts: parsed.ok.fonts ?? [],
      images: parsed.ok.images ?? [],
    };
  } catch {
    return null;
  }
}

/** 옛 저장 파일 안의 모든 객체·그룹 id(앞·뒤·고친 쪽·노트 반쪽). */
function savedIds(p: SavedProject): string[] {
  const ids: string[] = [];
  const add = (objs: DiaryObject[] | undefined) => {
    for (const o of objs ?? []) {
      ids.push(o.id);
      if (o.groupId) ids.push(o.groupId);
    }
  };
  for (const t of p.templates) {
    ids.push(t.id);
    add(t.objects);
    add(t.back?.objects);
    for (const objs of Object.values(t.pageOverrides ?? {})) add(objs);
    for (const objs of Object.values(t.pageBackOverrides ?? {})) add(objs);
    add(t.cover?.front.objects);
    add(t.cover?.back.objects);
    for (const half of t.pages ?? []) add(half.objects);
  }
  return ids;
}

/**
 * 처음 열 때 한 번 — 옛 저장소의 양식·글꼴·이미지를 복사한다.
 *
 * 이미 옮겼으면(`meta.migratedAt`) 아무것도 안 한다. 옛 저장소에 아무것도 없어도
 * 옮긴 것으로 표시한다 — 다음에 옛 버전에서 만든 것이 새로 나타나는 일은 없다
 * (옛 버전과 새 버전은 따로 산다).
 */
export async function migrateFromV1(now: string): Promise<void> {
  const meta = await loadMeta();
  if (meta.migratedAt) return;

  const migrated = migrateSnapshot(await idbGet<string>('project', 'current'), now);
  const [fonts, images] = await Promise.all([idbEntries<unknown>('fonts'), idbEntries<unknown>('images')]);

  const entries: [V2Store, string, unknown][] = [
    ...fonts.map(([key, value]): [V2Store, string, unknown] => ['fonts', key, value]),
    ...images.map(([key, value]): [V2Store, string, unknown] => ['images', key, value]),
    ...(migrated?.works ?? []).map((w): [V2Store, string, unknown] => ['works', w.id, w]),
    ...(migrated?.diaries ?? []).map((d): [V2Store, string, unknown] => ['diaries', d.id, d]),
    [
      'meta',
      META_KEY,
      {
        ...meta,
        migratedAt: now,
        skippedNotebooks: migrated?.skippedNotebooks ?? [],
        fonts: migrated?.fonts ?? [],
        images: migrated?.images ?? [],
      } satisfies V2Meta,
    ],
  ];
  if (!(await putMany(entries))) throw new Error('기존 작업을 옮기지 못했어요.');
}
