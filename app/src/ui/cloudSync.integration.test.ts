import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 명시한 임시 로컬 DB에서만 실제 문서·보호 파일 전송을 검사한다. */
const url = process.env.RINGS_AUTH_TEST_URL;
const local = new Map<string, unknown>();
const files = new Map<string, ArrayBuffer>();
vi.mock('../storage/v2', () => ({
  v2Get: async (_s: string, k: string) => structuredClone(local.get(k) ?? null),
  v2Put: async (_s: string, k: string, v: unknown) => { local.set(k, structuredClone(v)); },
}));
vi.mock('./persist', () => ({ flushAutosave: async () => {} }));
vi.mock('../images/registry', async original => ({
  ...(await original<typeof import('../images/registry')>()),
  imageBytes: (id: string) => files.get(id),
  imageKind: () => 'png',
  adoptImage: async (id: string, name: string, bytes: ArrayBuffer) => {
    files.set(id, bytes); return { id, name, url: 'data:received' };
  },
  rekeyImage: async (from: string, to: string) => {
    if (files.has(from)) { files.set(to, files.get(from)!); files.delete(from); }
  },
}));

describe.skipIf(!url)('실제 서버 동기화', () => {
  let email = '';
  const password = 'Rings-review-2026';
  beforeEach(async () => {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url!).hostname)) throw new Error('임시 로컬 서버에서만 검사하세요.');
    vi.resetModules(); local.clear(); files.clear(); vi.stubEnv('VITE_PB_URL', url!);
    const saved = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => { saved.set(k, v); },
      removeItem: (k: string) => { saved.delete(k); },
    } });
    email = `rings-sync-${crypto.randomUUID()}@example.test`;
    await (await import('../cloud/client')).signUp(email, password);
  });
  afterEach(async () => {
    try {
      const c = await import('../cloud/client');
      await c.signIn(email, password); await c.deleteAccount(password);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

  it('작업·다이어리·파일을 올리고 다른 기기에서 받으며, 같으면 다시 쓰지 않는다', async () => {
    const { useStore } = await import('../store');
    const { syncNow, answerSyncAsk } = await import('./cloudSync');
    const docs = await import('../cloud/docs');
    const initial = useStore.getState();
    useStore.setState({ ready: true, today: '2026-10-15' });
    useStore.getState().addDiary('M6', '내 다이어리');
    useStore.getState().createWork('실제 서버 검사');
    useStore.getState().addUserImage({ id: 'img1', name: '검사 이미지', url: 'data:local' });
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer;
    files.set('img1', bytes);
    const pending = syncNow();
    await vi.waitFor(() => expect(useStore.getState().syncAsk).not.toBeNull());
    answerSyncAsk(true); await pending;
    expect(useStore.getState().cloudStatus.kind).toBe('saved');
    const uploaded = await docs.listDocs();
    expect(uploaded.map(d => d.kind).sort()).toEqual(['diary', 'image', 'prefs', 'work']);
    expect(new Uint8Array(await docs.getFile(uploaded.find(d => d.kind === 'image')!))).toEqual(new Uint8Array(bytes));
    await syncNow();
    expect(await docs.listDocs()).toEqual(uploaded);

    useStore.setState(initial, true); useStore.setState({ ready: true, today: '2026-10-15' });
    local.clear(); files.clear(); await syncNow();
    expect(useStore.getState().works.map(w => w.name)).toEqual(['실제 서버 검사']);
    expect(useStore.getState().diaries.map(d => d.name)).toEqual(['내 다이어리']);
    expect(new Uint8Array(files.get('img1')!)).toEqual(new Uint8Array(bytes));
    expect(useStore.getState().cloudStatus.kind).toBe('saved');
    const received = await docs.listDocs(); await syncNow();
    expect(await docs.listDocs()).toEqual(received);

    // 바이트 수가 같은 다른 파일을 서버에서 받는다.
    const updated = new Uint8Array([137, 80, 78, 71, 9, 8, 7]).buffer;
    await docs.putFile(uploaded.find(d => d.kind === 'image')!.id, updated, 'image.png');
    await syncNow();
    expect(new Uint8Array(files.get('img1')!)).toEqual(new Uint8Array(updated));
  });
});
