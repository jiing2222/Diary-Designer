import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteDoc, SyncKind } from '../core/sync';

/* 메모리 속 서버 하나와 기기 저장소 — 두 기기는 store를 갈아 끼워 흉내 낸다. */
const server = new Map<string, RemoteDoc>();
let clock = 0;
const user = { id: 'u1', email: 'a@b.c' };
let signedIn = true;
let listGate: (() => Promise<void>) | null = null;
let fileFail = false;
let downloadFail = false;
let authListener: ((u: unknown) => void) | null = null;
const local = new Map<string, unknown>();

vi.mock('../cloud/client', () => ({
  cloudEnabled: true,
  currentUser: () => (signedIn ? user : null),
  onAuthChange: (l: (u: unknown) => void) => {
    authListener = l;
    return () => {};
  },
  cloudErrorText: (e: unknown) => String(e),
}));
vi.mock('../cloud/docs', () => ({
  listDocs: async () => {
    await listGate?.();
    return [...server.values()].map((d) => ({ ...d, data: null }));
  },
  withData: async (docs: RemoteDoc[]) => docs.map((d) => structuredClone(server.get(`${d.kind}:${d.key}`)!)),
  putDoc: async (kind: SyncKind, key: string, data: unknown, remoteId?: string) => {
    const k = `${kind}:${key}`;
    const id = remoteId ?? server.get(k)?.id ?? `r${++clock}`;
    const updated = `t${++clock}`;
    server.set(k, { id, kind, key, data: structuredClone(data), deleted: false, updated });
    return { id, updated };
  },
  putFile: async (remoteId: string, bytes: ArrayBuffer) => {
    if (fileFail) throw new Error('검증용 파일 실패');
    uploaded.push({ remoteId, size: bytes.byteLength });
    const doc = [...server.values()].find((d) => d.id === remoteId)!;
    const updated = `t${++clock}`;
    server.set(`${doc.kind}:${doc.key}`, { ...doc, file: 'image_x.png', updated });
    return { id: remoteId, updated };
  },
  getFile: async () => { if (downloadFail) throw new Error('받기 실패'); return new ArrayBuffer(7); },
  markDeleted: async (remoteId: string) => {
    const doc = [...server.values()].find((d) => d.id === remoteId)!;
    const updated = `t${++clock}`;
    server.set(`${doc.kind}:${doc.key}`, { ...doc, data: null, deleted: true, updated });
    return { id: remoteId, updated };
  },
}));
const uploaded: { remoteId: string; size: number }[] = [];
vi.mock('../storage/v2', () => ({
  v2Get: async (_s: string, k: string) => structuredClone(local.get(k) ?? null),
  v2Put: async (_s: string, k: string, v: unknown) => void local.set(k, structuredClone(v)),
}));
vi.mock('./persist', () => ({ flushAutosave: async () => {} }));
/* 이미지 등록소 — 파일 바이트만 흉내 낸다(브라우저의 FileReader 없이). */
const files = new Map<string, ArrayBuffer>();
vi.mock('../images/registry', async (original) => ({
  ...(await original<typeof import('../images/registry')>()),
  imageBytes: (id: string) => files.get(id),
  imageKind: () => 'png',
  hasImage: (id: string) => files.has(id),
  rekeyImage: async (from: string, to: string) => {
    if (files.has(from)) { files.set(to, files.get(from)!); files.delete(from); }
  },
  adoptImage: async (id: string, name: string, bytes: ArrayBuffer) => {
    files.set(id, bytes);
    return { id, name, url: 'data:받음' };
  },
}));

const { useStore } = await import('../store');
const { answerSyncAsk, startCloudSync, syncNow } = await import('./cloudSync');

const initial = useStore.getState();
const s = () => useStore.getState();

/** 기기 하나를 처음 상태로(서버는 그대로). */
function freshDevice() {
  useStore.setState(initial, true);
  useStore.setState({ ready: true, today: '2026-10-13' });
  local.clear();
}

/** 묻는 창이 뜨면 이렇게 답한다. */
async function syncAnswering(upload: boolean) {
  const done = syncNow();
  await vi.waitFor(() => expect(s().syncAsk ?? s().cloudStatus.kind !== 'syncing').toBeTruthy());
  if (s().syncAsk) answerSyncAsk(upload);
  await done;
}

beforeEach(() => {
  server.clear();
  files.clear();
  uploaded.length = 0;
  clock = 0;
  signedIn = true; user.id = 'u1'; listGate = null; fileFail = false; downloadFail = false;
  freshDevice();
});

describe('계정 동기화 순서', () => {
  it('같은 id·이름의 서로 다른 이미지 파일도 각각 보존한다', async () => {
    s().addUserImage({ id: 'img1', name: 'cat', url: 'data:여기' });
    files.set('img1', new ArrayBuffer(5));
    server.set('image:img1', { id: 'remote-image', kind: 'image', key: 'img1',
      data: { id: 'img1', name: 'cat' }, deleted: false, updated: 't1', file: 'remote.png' });
    await syncAnswering(true);
    expect(s().userImages).toHaveLength(2);
    expect(files.get('img1')?.byteLength).toBe(7);
    const moved = s().userImages.find(i => i.id !== 'img1')!;
    expect(files.get(moved.id)?.byteLength).toBe(5);
    expect(uploaded).toEqual([{ remoteId: server.get(`image:${moved.id}`)!.id, size: 5 }]);
  });

  it('파일 업로드 실패를 저장 완료로 표시하지 않고 재시도한다', async () => {
    s().addUserImage({ id: 'img1', name: 'cat', url: 'data:여기' });
    files.set('img1', new ArrayBuffer(5)); fileFail = true;
    await syncAnswering(true);
    expect(s().cloudStatus.kind).toBe('error');
    fileFail = false; await syncNow();
    expect(s().cloudStatus.kind).toBe('saved');
    expect(uploaded).toHaveLength(1);
  });

  it('파일 크기가 같아도 바이트가 바뀌면 다시 올린다', async () => {
    s().addUserImage({ id: 'img1', name: 'cat', url: 'data:여기' });
    files.set('img1', new ArrayBuffer(5)); await syncAnswering(true);
    files.set('img1', new Uint8Array([1, 2, 3, 4, 5]).buffer);
    await syncNow(); expect(uploaded).toHaveLength(2);
  });

  it('서버 파일이 갱신되면 받으며 이 기기의 옛 파일로 덮어쓰지 않는다', async () => {
    s().addUserImage({ id: 'img1', name: 'cat', url: 'data:여기' });
    files.set('img1', new ArrayBuffer(5)); await syncAnswering(true);
    const d = server.get('image:img1')!;
    server.set('image:img1', { ...d, file: 'new.png', updated: 't99' });
    await syncNow();
    expect(files.get('img1')?.byteLength).toBe(7);
    expect(uploaded).toHaveLength(1);
  });

  it('바뀐 서버 파일을 받지 못하면 옛 파일로 덮어쓰지 않고 다시 받는다', async () => {
    s().addUserImage({ id: 'img1', name: 'cat', url: 'data:여기' });
    files.set('img1', new ArrayBuffer(5)); await syncAnswering(true);
    const d = server.get('image:img1')!;
    server.set('image:img1', { ...d, file: 'new.png', updated: 't99' });
    downloadFail = true; await syncNow();
    expect(s().cloudStatus.kind).toBe('error'); expect(uploaded).toHaveLength(1);
    downloadFail = false; await syncNow();
    expect(files.get('img1')?.byteLength).toBe(7);
    expect(s().cloudStatus.kind).toBe('saved'); expect(uploaded).toHaveLength(1);
  });

  it('목록을 받는 중 계정을 바꾸면 옛 계정 자료를 적용하지 않는다', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    listGate = () => { entered(); return new Promise<void>(resolve => { release = resolve; }); };
    server.set('diary:d1', { id: 'r-d1', kind: 'diary', key: 'd1', data: { id: 'd1', name: 'A의 자료' }, deleted: false, updated: 't1' });
    const stop = startCloudSync();
    try {
      const pending = syncNow();
      await started;
      user.id = 'u2'; authListener?.(user);
      release(); await pending;
      expect(s().diaries).toEqual([]);
      expect(local.has('sync:u1')).toBe(false);
    } finally { stop(); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });

  it('처음엔 묻고, 올리기로 하면 작업·다이어리가 서버 칸이 된다', async () => {
    s().addDiary('M6', 'm6');
    s().createWork('봄');
    await syncAnswering(true);
    expect([...server.keys()].sort()).toEqual(expect.arrayContaining([`diary:${s().diaries[0].id}`, 'prefs:prefs']));
    expect([...server.values()].some((d) => d.kind === 'work' && (d.data as { name: string }).name === '봄')).toBe(
      true,
    );
    expect(s().cloudStatus.kind).toBe('saved');
  });

  it('이 기기에만 두기로 하면 올리지 않고, 다음에 다시 묻지 않으며, 새로 만든 것은 올린다', async () => {
    s().addDiary('M6', 'm6');
    await syncAnswering(false);
    expect(server.size).toBe(0);
    s().createWork('새것');
    await syncNow();
    expect(s().syncAsk).toBeNull();
    expect([...server.values()].map((d) => d.kind)).toEqual(['work']);
  });

  it('다른 기기에서 받은 작업이 들어오고, 같은 id의 이 기기 작업은 새 id로 둘 다 남는다', async () => {
    s().addDiary('M6', 'm6');
    s().createWork('A의 작업');
    await syncAnswering(true);

    freshDevice(); // 기기 B — 같은 id(d1, w…)로 다른 자료가 있다.
    s().addDiary('A5', 'a5');
    const bId = s().createWork('B의 작업')!;
    const aId = [...server.values()].find(d => d.kind === 'work')!.key;
    s().patch({ works: s().works.map(w => w.id === bId ? { ...w, id: aId } : w) });
    await syncAnswering(true);
    const names = s()
      .works.map((w) => w.name)
      .sort();
    expect(names).toEqual(['A의 작업', 'B의 작업']);
    expect(
      s()
        .diaries.map((d) => d.name)
        .sort(),
    ).toEqual(['a5', 'm6']);
    // B의 작업은 B의 다이어리를 그대로 가리킨다(새 id를 받았어도).
    const b = s().works.find((w) => w.name === 'B의 작업')!;
    expect(s().diaries.find((d) => d.id === b.diaryId)?.name).toBe('a5');
    const a = s().works.find((w) => w.name === 'A의 작업')!;
    expect(s().diaries.find((d) => d.id === a.diaryId)?.name).toBe('m6');
    expect([...server.values()].filter((d) => d.kind === 'work')).toHaveLength(2);
  });

  it('맞춘 뒤 양쪽에서 고친 작업은 둘 다 남는다', async () => {
    s().addDiary('M6', 'm6');
    const id = s().createWork('원본')!;
    await syncAnswering(true);
    const deviceA = structuredClone(local.get('sync:u1'));

    // 다른 기기가 같은 작업을 고쳐 올렸다.
    const doc = server.get(`work:${id}`)!;
    server.set(`work:${id}`, { ...doc, data: { ...(doc.data as object), name: '저기서 고침' }, updated: 't99' });
    // 이 기기도 고쳤다.
    s().renameWork(id, '여기서 고침');
    local.set('sync:u1', deviceA);
    await syncNow();
    expect(
      s()
        .works.map((w) => w.name)
        .sort(),
    ).toEqual(['여기서 고침 (copy from this device)', '저기서 고침']);
  });

  it('여기서 영구 삭제하면 서버엔 지움 표시, 다른 기기는 그걸 받아 지운다', async () => {
    s().addDiary('M6', 'm6');
    const id = s().createWork('지울 것')!;
    await syncAnswering(true);
    s().trashWorkById(id);
    s().deleteWorkForever(id);
    await syncNow();
    expect(server.get(`work:${id}`)?.deleted).toBe(true);
  });

  it('이미지 파일: 이 기기 것은 올리고, 다른 기기에서는 받아 온다', async () => {
    s().addUserImage({ id: 'img1', name: 'cat', url: 'data:여기' });
    files.set('img1', new ArrayBuffer(5));
    await syncAnswering(true);
    expect(uploaded).toEqual([{ remoteId: server.get('image:img1')!.id, size: 5 }]);
    await syncNow();
    expect(uploaded).toHaveLength(1); // 같은 파일은 다시 올리지 않는다.

    freshDevice();
    files.clear();
    await syncNow();
    expect(s().userImages).toEqual([expect.objectContaining({ id: 'img1', name: 'cat', url: 'data:받음' })]);
  });

  it('묻는 중에 로그아웃하면 기다리지 않고 그만두고, 다음에 다시 묻는다', async () => {
    // 테스트 환경에는 화면이 없다 — 창으로 돌아오기 신호만 흉내 낸다.
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const stop = startCloudSync();
    s().addDiary('M6', 'm6');
    const done = syncNow();
    await vi.waitFor(() => expect(s().syncAsk).not.toBeNull());
    signedIn = false;
    authListener?.(null);
    await done;
    signedIn = true;
    stop();
    vi.unstubAllGlobals();
    expect(s().syncAsk).toBeNull();
    expect(s().cloudStatus.kind).toBe('local');
    expect(server.size).toBe(0);
    await syncAnswering(true);
    expect([...server.values()].some((d) => d.kind === 'diary')).toBe(true);
  });
});
