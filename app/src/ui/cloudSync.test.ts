import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteDoc, SyncKind } from '../core/sync';

/* 메모리 속 서버 하나와 기기 저장소 — 두 기기는 store를 갈아 끼워 흉내 낸다. */
const server = new Map<string, RemoteDoc>();
let clock = 0;
const user = { id: 'u1', email: 'a@b.c' };
const local = new Map<string, unknown>();

vi.mock('../cloud/client', () => ({
  cloudEnabled: true,
  currentUser: () => user,
  onAuthChange: () => () => {},
  cloudErrorText: (e: unknown) => String(e),
}));
vi.mock('../cloud/docs', () => ({
  listDocs: async () => [...server.values()].map((d) => ({ ...d, data: null })),
  withData: async (docs: RemoteDoc[]) => docs.map((d) => structuredClone(server.get(`${d.kind}:${d.key}`)!)),
  putDoc: async (kind: SyncKind, key: string, data: unknown, remoteId?: string) => {
    const k = `${kind}:${key}`;
    const id = remoteId ?? server.get(k)?.id ?? `r${++clock}`;
    const updated = `t${++clock}`;
    server.set(k, { id, kind, key, data: structuredClone(data), deleted: false, updated });
    return { id, updated };
  },
  putFile: async (remoteId: string, bytes: ArrayBuffer) => {
    uploaded.push({ remoteId, size: bytes.byteLength });
    const doc = [...server.values()].find((d) => d.id === remoteId)!;
    const updated = `t${++clock}`;
    server.set(`${doc.kind}:${doc.key}`, { ...doc, file: 'image_x.png', updated });
    return { id: remoteId, updated };
  },
  getFile: async () => new ArrayBuffer(7),
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
  adoptImage: async (id: string, name: string, bytes: ArrayBuffer) => {
    files.set(id, bytes);
    return { id, name, url: 'data:받음' };
  },
}));

const { useStore } = await import('../store');
const { answerSyncAsk, syncNow } = await import('./cloudSync');

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
  freshDevice();
});

describe('계정 동기화 순서', () => {
  it('처음엔 묻고, 올리기로 하면 작업·다이어리가 서버 칸이 된다', async () => {
    s().addDiary('M6', 'm6');
    s().createWork('봄');
    await syncAnswering(true);
    expect([...server.keys()].sort()).toEqual(expect.arrayContaining(['diary:d1', 'prefs:prefs']));
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
    s().createWork('B의 작업');
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
    ).toEqual(['여기서 고침 (이 기기 사본)', '저기서 고침']);
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
});
