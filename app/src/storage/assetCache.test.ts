import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';

const db = vi.hoisted(() => ({
  files: new Map<string, Map<string, unknown>>(), legacy: new Map<string, [string, unknown][]>(),
  fail: false,
}));
vi.mock('./v2', () => ({
  v2All: vi.fn(async (store: string) => [...(db.files.get(store)?.values() ?? [])]),
  v2Put: vi.fn(async (store: string, id: string, file: unknown) => {
    if (db.fail) throw new Error('용량 초과');
    if (!db.files.has(store)) db.files.set(store, new Map());
    db.files.get(store)!.set(id, file);
  }),
}));
vi.mock('./idb', () => ({
  idbEntries: vi.fn(async (store: string) => db.legacy.get(store) ?? []),
  idbPut: vi.fn(), idbDelete: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules(); db.files.clear(); db.legacy.clear(); db.fail = false;
  vi.stubGlobal('document', { fonts: { add: vi.fn(), delete: vi.fn() } });
  vi.stubGlobal('FontFace', class {
    async load() { return this; }
  });
  vi.stubGlobal('FileReader', class {
    result = ''; onload?: () => void;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((b) => { this.result = `data:image/png;base64,${Buffer.from(b).toString('base64')}`; this.onload?.(); });
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

const buffer = (n: number) => new Uint8Array([n]).buffer;
const file = (name: string, n: number) => ({ name, arrayBuffer: async () => buffer(n) }) as File;

async function registry(kind: 'font' | 'image') {
  if (kind === 'font') {
    const r = await import('../fonts/registry');
    return { add: r.registerFont, restore: r.restoreCachedFonts, remove: r.removeFont, bytes: r.fontBytes, store: 'fonts', ext: 'ttf' };
  }
  const r = await import('../images/registry');
  return { add: r.registerImage, restore: r.restoreCachedImages, remove: r.removeImage, bytes: r.imageBytes, store: 'images', ext: 'png' };
}

describe.each(['font', 'image'] as const)('%s 파일 보존', (kind) => {
  it('같은 이름의 두 파일도 id별로 보관하고 재열기 후 각각의 바이트를 보존한다', async () => {
    const r = await registry(kind);
    const a = await r.add(file(`same.${r.ext}`, 1));
    const b = await r.add(file(`same.${r.ext}`, 2));
    expect(a.id).not.toBe(b.id);
    expect(db.files.get(r.store)?.size).toBe(2);
    vi.resetModules();
    const reopened = await registry(kind);
    expect(await reopened.restore()).toHaveLength(2);
    expect(new Uint8Array(reopened.bytes(a.id)!)).toEqual(new Uint8Array([1]));
    expect(new Uint8Array(reopened.bytes(b.id)!)).toEqual(new Uint8Array([2]));
    const c = await reopened.add(file(`same.${r.ext}`, 3));
    expect([a.id, b.id]).not.toContain(c.id);
  });

  it('옛 파일은 복사만 하고 삭제해도 옛 저장소를 지우지 않으며 다음에 되살아나지 않는다', async () => {
    const r = await registry(kind);
    const old = { name: '원본', buffer: buffer(7), kind: 'png' };
    db.legacy.set(r.store, [['원본', old]]);
    const [a] = await r.restore();
    expect(a.name).toBe('원본');
    expect(db.files.get(r.store)?.size).toBe(1);
    r.remove(a.id, a.name);
    const cache = await import('./assetCache');
    await cache.flushAssetWrites();
    expect(db.files.get(r.store)?.get(a.id)).toEqual({ id: a.id, name: a.name, deleted: true });
    expect(db.legacy.get(r.store)).toEqual([['원본', old]]);
    const idb = await import('./idb');
    expect(idb.idbDelete).not.toHaveBeenCalled(); expect(idb.idbPut).not.toHaveBeenCalled();
    vi.resetModules();
    expect(await (await registry(kind)).restore()).toEqual([]);
  });

  it('동시 복원은 같은 옛 파일을 두 번 복사하지 않는다', async () => {
    const r = await registry(kind);
    db.legacy.set(r.store, [['원본', { name: '원본', buffer: buffer(4), kind: 'png' }]]);
    const [a, b] = await Promise.all([r.restore(), r.restore()]);
    expect(a).toBe(b); expect(a).toHaveLength(1); expect(db.files.get(r.store)?.size).toBe(1);
  });

  it('새 파일의 저장 실패를 알리고 사용 가능한 파일로 취급하지 않는다', async () => {
    const r = await registry(kind); db.fail = true;
    const id = kind === 'font' ? 'f40' : 'img40';
    await expect(r.add(file(`test.${r.ext}`, 1), id)).rejects.toThrow('용량 초과');
    expect(r.bytes(id)).toBeUndefined();
    if (kind === 'font') expect(document.fonts.add).not.toHaveBeenCalled();
  });
});

it('숨김·삭제 기록 저장이 실패하면 재시도 때까지 남긴다', async () => {
  const c = await import('./assetCache');
  c.queueAssetWrite('fonts', { id: 'f1', name: '글꼴', buffer: buffer(1), hidden: true });
  db.fail = true;
  await expect(c.flushAssetWrites()).rejects.toThrow();
  expect(c.hasAssetWrites()).toBe(true);
  db.fail = false; await c.flushAssetWrites();
  expect(c.hasAssetWrites()).toBe(false);
  expect(db.files.get('fonts')?.get('f1')).toMatchObject({ hidden: true });
});
