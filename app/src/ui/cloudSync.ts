import { useStore, syncSnapshotOf } from '../store';
import { cloudEnabled, cloudErrorText, currentUser, onAuthChange } from '../cloud/client';
import { getFile, listDocs, markDeleted, putDoc, putFile, withData } from '../cloud/docs';
import {
  docKey,
  docsOf,
  freshKey,
  hashOf,
  planSync,
  splitDocKey,
  type RemoteDoc,
  type SyncOp,
  type SyncEntry,
  type SyncState,
} from '../core/sync';
import { allIdsOf, type Work } from '../core/work';
import { ensureIdCounterAbove } from '../core/objects';
import { adoptFont, fontBytes, rekeyFont, reserveIds } from '../fonts/registry';
import { adoptImage, imageBytes, imageKind, rekeyImage, reserveImageIds } from '../images/registry';
import { v2Get, v2Put } from '../storage/v2';
import { flushAutosave } from './persist';
import { t } from '../lang';

/**
 * 계정 동기화의 순서(리뉴얼 8-2) — ui/persist가 이 기기 저장을 맡듯, 이것이 계정과 맞추기를 맡는다.
 *
 * 1. 서버 칸 목록(내용 없이)을 받고, 마지막으로 맞춘 뒤 바뀐 칸만 내용을 받는다.
 * 2. **처음 이 계정에 맞출 때** 이 기기에 자료가 있으면 올릴지 묻는다(2026-10-13 결정). 안 올리면 그 기록들은
 *    이 기기에만 남는다(`skip`).
 * 3. core/sync가 정한 대로 받을 것을 store에 적용하고(새 id 주기 포함), 이어서 바뀐 것을 올린다.
 *
 * 맞춘 기록(`SyncState`)은 계정마다 이 기기 저장소에 남긴다 — 로그아웃했다 다시 들어와도 이어서 맞춘다.
 * 언제 맞추나: 계정 확인·로그인 직후, 이 기기 저장이 끝날 때(조금 기다렸다), 창으로 돌아올 때.
 */

interface SyncRecord {
  state: SyncState;
  /** 이 기기에만 두기로 한 칸. */
  skip: string[];
  /** 처음 올릴지 물어봤는가. */
  asked: boolean;
}

const recordKey = (userId: string) => `sync:${userId}`;

async function loadRecord(userId: string): Promise<SyncRecord> {
  return (await v2Get<SyncRecord>('meta', recordKey(userId))) ?? { state: {}, skip: [], asked: false };
}

const saveRecord = (userId: string, rec: SyncRecord) => v2Put('meta', recordKey(userId), rec);

/* ── 처음 올릴지 묻기 ── */

let answer: ((upload: boolean) => void) | null = null;
let cancelAsk: (() => void) | null = null;

/** 묻는 중에 로그아웃하면 답을 기다리지 않고 그만둔다 — 안 그러면 맞추기가 영영 끝나지 않는다. */
class AskCancelled extends Error {}
class SessionChanged extends Error {}
let accountGeneration = 0;

function ask(works: number, total: number): Promise<boolean> {
  useStore.setState({ syncAsk: { works, total } });
  return new Promise((resolve, reject) => {
    const done = () => {
      answer = null;
      cancelAsk = null;
      useStore.setState({ syncAsk: null });
    };
    cancelAsk = () => {
      done();
      reject(new AskCancelled());
    };
    answer = (upload) => {
      done();
      resolve(upload);
    };
  });
}

/** 묻는 창의 답. */
export function answerSyncAsk(upload: boolean): void {
  answer?.(upload);
}

/* ── 맞추기 ── */

let running: Promise<void> | null = null;
let again = false;

/** 지금 맞춘다. 이미 맞추는 중이면 끝난 뒤 한 번 더. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

const entryOf = (d: { id: string; updated: string }, data: unknown, previous?: SyncEntry): SyncEntry => ({
  ...previous,
  remoteId: d.id,
  updated: d.updated,
  hash: hashOf(data),
});

async function syncOnce(): Promise<void> {
  const user = cloudEnabled ? currentUser() : null;
  if (!user) {
    useStore.setState({ cloudStatus: { kind: 'local' } });
    return;
  }
  const generation = accountGeneration;
  const checkSession = () => {
    if (generation !== accountGeneration || currentUser()?.id !== user.id) throw new SessionChanged();
  };
  const wait = async <T,>(action: () => Promise<T>): Promise<T> => {
    checkSession();
    const value = await action();
    checkSession();
    return value;
  };
  useStore.setState({ cloudStatus: { kind: 'syncing' } });
  try {
    // 받은 것을 적용하기 전에 이 기기에서 고친 것부터 저장해 둔다.
    await wait(flushAutosave);
    const rec = await wait(() => loadRecord(user.id));
    const state: SyncState = { ...rec.state };
    let skip = new Set(rec.skip);

    const listed = await wait(listDocs);
    const changed = listed.filter((d) => !d.deleted && state[docKey(d.kind, d.key)]?.updated !== d.updated);
    const full = new Map((await wait(() => withData(changed))).map((d) => [docKey(d.kind, d.key), d]));
    const remote: RemoteDoc[] = listed.map((d) => full.get(docKey(d.kind, d.key)) ?? d);

    let local = docsOf(syncSnapshotOf(useStore.getState()));
    if (!rec.asked) {
      const fresh = [...local.keys()].filter((k) => !(k in state) && splitDocKey(k).kind !== 'prefs');
      if (fresh.length > 0) {
        const works = fresh.filter((k) => splitDocKey(k).kind === 'work').length;
        const upload = await wait(() => ask(works, fresh.length));
        // 안 올리면 지금 있는 것(기본 다이어리 설정 포함)은 이 기기에만 둔다.
        if (!upload) skip = new Set([...skip, ...fresh, docKey('prefs', 'prefs')]);
      }
      rec.asked = true;
      // 답은 바로 남긴다 — 뒤에서 실패해도 다시 묻지 않게.
      await wait(() => saveRecord(user.id, { state, skip: [...skip], asked: true }));
      local = docsOf(syncSnapshotOf(useStore.getState()));
    }

    // 이름과 id가 같아도 기기마다 실제 파일은 다를 수 있다. 처음 만난 파일은
    // 바이트까지 비교해 다른 파일이면 로컬 사본과 그 참조를 함께 보존한다.
    const downloaded = new Map<string, ArrayBuffer>();
    const readFile = async (d: RemoteDoc) => {
      if (!downloaded.has(d.id)) downloaded.set(d.id, await wait(() => getFile(d)));
      return downloaded.get(d.id)!;
    };
    const fileCollisions = remote.filter(d => !d.deleted && d.file &&
      (d.kind === 'font' || d.kind === 'image') && !rec.state[docKey(d.kind, d.key)] &&
      hashOf(local.get(docKey(d.kind, d.key))) === hashOf(d.data));
    const differentFiles = new Map<string, RemoteDoc>();
    for (const d of fileCollisions) {
      const bytes = d.kind === 'font' ? fontBytes(d.key) : imageBytes(d.key);
      if (bytes && await fileHash(bytes) !== await fileHash(await readFile(d))) differentFiles.set(docKey(d.kind, d.key), d);
      checkSession();
    }

    // 먼저 이 기기 자료의 id만 옮긴다. 파일을 옮기는 동안 계정이 바뀌더라도 현재
    // 파일과 그 참조는 함께 옮겨야 한다. 서버 자료를 받는 일은 그 뒤 별도로 한다.
    for (;;) {
      checkSession();
      local = docsOf(syncSnapshotOf(useStore.getState()));
      const collisions = planSync(local, remote, rec.state, skip).filter(a => a.type === 'rekey');
      for (const [key, doc] of differentFiles) {
        if (local.has(key) && !collisions.some(a => a.key === key)) collisions.push({ type: 'rekey', key, doc, conflict: false });
      }
      if (!collisions.length) break;
      for (const a of collisions) {
        checkSession();
        const { kind, key } = splitDocKey(a.key);
        let to = freshKey(key);
        while (local.has(docKey(kind, to)) || remote.some(d => d.kind === kind && d.key === to)) to += 'a';
        const op: SyncOp = { type: 'rekey', kind, from: key, to, conflict: a.conflict };
        await moveAssetFiles([op]);
        useStore.getState().applySyncOps([op]);
        differentFiles.delete(a.key);
        if (skip.delete(a.key)) skip.add(docKey(kind, to));
        // 로컬 id 변경과 ‘이 기기에만 두기’ 선택을 같이 남긴다. 옛 계정의 로컬
        // 기록이며, 여기서는 새 계정 서버에 요청하거나 서버 자료를 적용하지 않는다.
        await saveRecord(user.id, { state: rec.state, skip: [...skip], asked: rec.asked });
        checkSession();
        local = docsOf(syncSnapshotOf(useStore.getState()));
      }
    }

    // 1) 받기 — 파일 이동을 기다리는 사이 고친 작업도 반영해 다시 판단한다.
    const ops: SyncOp[] = [];
    for (const a of planSync(local, remote, rec.state, skip)) {
      const { kind, key } = splitDocKey(a.key);
      if (a.type === 'pull') {
        ops.push({ type: 'put', kind, key, data: a.doc.data });
        state[a.key] = entryOf(a.doc, a.doc.data, state[a.key]);
      } else if (a.type === 'deleteLocal') {
        ops.push({ type: 'remove', kind, key });
        delete state[a.key];
      } else if (a.type === 'same') {
        if (a.doc.deleted) delete state[a.key];
        else state[a.key] = entryOf(a.doc, a.doc.data, state[a.key]);
      }
    }
    if (ops.length > 0) {
      useStore.getState().applySyncOps(ops);
      reserveReceivedIds(ops);
    }

    // 2) 올리기 — 받은 뒤의 이 기기 자료로 다시 따져, 바뀐 것·새것·지운 것만.
    const now = docsOf(syncSnapshotOf(useStore.getState()));
    for (const a of planSync(now, remote, state, skip)) {
      const { kind, key } = splitDocKey(a.key);
      if (a.type === 'push') {
        const data = now.get(a.key);
        const res = await wait(() => putDoc(kind, key, data, a.remoteId));
        state[a.key] = entryOf(res, data, state[a.key]);
      } else if (a.type === 'deleteRemote') {
        await wait(() => markDeleted(a.remoteId));
        delete state[a.key];
      }
    }

    // 3) 글꼴·이미지 파일 — 칸이 맞춰진 뒤에 올리고 받는다.
    const failures = await syncFiles(state, rec.state, remote, skip, checkSession, readFile);

    await wait(() => saveRecord(user.id, { state, skip: [...skip], asked: rec.asked }));
    useStore.setState({ cloudStatus: failures
      ? { kind: 'error', text: t('일부 글꼴·이미지 파일을 맞추지 못했어요. 다음 동기화에서 다시 시도해요.', "Some font or image files didn't sync. We'll try again next time.") }
      : { kind: 'saved', at: Date.now() } });
  } catch (err) {
    if (err instanceof SessionChanged) {
      // 로그아웃 알림 없이 계정이 사라졌으면(토큰 만료) ‘맞추는 중’에 멈춰 있지 않게.
      if (!currentUser()) useStore.setState({ cloudStatus: { kind: 'local' } });
      return;
    }
    if (err instanceof AskCancelled) {
      useStore.setState({ cloudStatus: { kind: 'local' } });
      return;
    }
    // 400은 서버가 받은 자료를 거절한 것 — 로그인 오류 문구(cloudErrorText의 기본)와 구분한다.
    const text = (err as { status?: number })?.status === 400 ? t('서버가 자료를 받지 못했어요.', "The server didn't accept the data.") : cloudErrorText(err);
    useStore.setState({ cloudStatus: { kind: 'error', text } });
  }
}

async function fileHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** 서버에서 바뀐 파일을 먼저 받고, 그 뒤 로컬에서 바뀐 파일을 올린다. 실패 기록은 다음에 재시도한다. */
async function syncFiles(
  state: SyncState, previous: SyncState, remote: RemoteDoc[], skip: Set<string>,
  checkSession: () => void, readFile: (d: RemoteDoc) => Promise<ArrayBuffer>,
): Promise<number> {
  let failures = 0;
  const receiving = new Set<string>();
  for (const d of remote) {
    checkSession();
    if (d.deleted || !d.file || (d.kind !== 'font' && d.kind !== 'image')) continue;
    const k = docKey(d.kind, d.key);
    if (skip.has(k) || !state[k]) continue;
    const localBytes = d.kind === 'font' ? fontBytes(d.key) : imageBytes(d.key);
    if (localBytes && previous[k]?.fileHash && previous[k]?.fileUpdated === d.updated) continue;
    // 받기에 실패해도 옛 로컬 파일로 서버 파일을 덮어쓰지 않는다.
    receiving.add(k);
    try {
      const bytes = await readFile(d);
      const hash = await fileHash(bytes);
      checkSession();
      const now = useStore.getState();
      if (d.kind === 'font') {
        const info = now.userFonts.find(f => f.id === d.key);
        if (!info) continue;
        const adopted = await adoptFont(d.key, info.name, bytes, { label: info.label, favorite: info.favorite, hidden: info.hidden });
        checkSession();
        useStore.getState().addUserFont(adopted);
      } else {
        const info = now.userImages.find(i => i.id === d.key);
        if (!info) continue;
        const kind = /\.png$/i.test(d.file) ? 'png' : 'jpg';
        const adopted = await adoptImage(d.key, info.name, bytes, kind, { label: info.label, usedAt: info.usedAt, hidden: info.hidden });
        checkSession();
        useStore.getState().addUserImage(adopted);
      }
      state[k] = { ...state[k], file: bytes.byteLength, fileHash: hash, fileUpdated: state[k].updated };
    } catch (err) {
      if (err instanceof SessionChanged) throw err;
      failures++;
    }
  }
  const s = useStore.getState();
  const uploads = [
    ...s.userFonts.map((f) => ({ k: docKey('font', f.id), bytes: fontBytes(f.id), name: 'font.bin' })),
    ...s.userImages.map((i) => ({
      k: docKey('image', i.id),
      bytes: imageBytes(i.id),
      name: `image.${imageKind(i.id) ?? 'png'}`,
    })),
  ];
  for (const u of uploads) {
    checkSession();
    const e = state[u.k];
    if (!e || !u.bytes || skip.has(u.k) || receiving.has(u.k)) continue;
    try {
      const hash = await fileHash(u.bytes);
      checkSession();
      if (e.fileHash === hash) {
        state[u.k] = { ...e, fileUpdated: e.updated };
        continue;
      }
      const res = await putFile(e.remoteId, u.bytes, u.name);
      checkSession();
      state[u.k] = { ...e, updated: res.updated, file: u.bytes.byteLength, fileHash: hash, fileUpdated: res.updated };
    } catch (err) {
      if (err instanceof SessionChanged) throw err;
      failures++;
    }
  }
  return failures;
}

/** 새 id를 받은 글꼴·이미지는 파일도 새 id로 옮긴다 — 옛 id 자리는 계정의 다른 파일이 쓴다. */
async function moveAssetFiles(ops: SyncOp[]): Promise<void> {
  const s = useStore.getState();
  for (const op of ops) {
    if (op.type !== 'rekey') continue;
    if (op.kind === 'font') {
      const f = s.userFonts.find((x) => x.id === op.from);
      if (f) await rekeyFont(op.from, op.to, f.name, { label: f.label, favorite: f.favorite, hidden: f.hidden });
    } else if (op.kind === 'image') {
      const i = s.userImages.find((x) => x.id === op.from);
      if (i) await rekeyImage(op.from, op.to, i.name, { label: i.label, usedAt: i.usedAt, hidden: i.hidden });
    }
  }
}

/** 받은 기록의 id 아래로 새 id가 매겨지지 않게 카운터를 올린다(core/objects·글꼴·이미지 등록소). */
function reserveReceivedIds(ops: SyncOp[]): void {
  const ids: string[] = [];
  for (const op of ops) {
    if (op.type !== 'put') continue;
    if (op.kind === 'work') ids.push(...allIdsOf(op.data as Work));
    else ids.push(op.key);
    if (op.kind === 'font') reserveIds([op.key]);
    if (op.kind === 'image') reserveImageIds([op.key]);
  }
  ensureIdCounterAbove(ids);
}

/**
 * 앱을 연 뒤 한 번 부른다(ui/App). 로그인 상태가 바뀔 때·이 기기 저장이 끝날 때·창으로 돌아올 때 맞춘다.
 * 반환값을 부르면 그만둔다.
 */
export function startCloudSync(): () => void {
  if (!cloudEnabled) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms: number) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncNow();
    }, ms);
  };
  const stopAuth = onAuthChange((user) => {
    accountGeneration++;
    cancelAsk?.();
    if (user) soon(0);
    else {
      cancelAsk?.();
      useStore.setState({ cloudStatus: { kind: 'local' }, syncAsk: null });
    }
  });
  // 이 기기 저장이 끝나면(‘저장됨’) 조금 기다렸다 올린다 — 손을 멈출 때마다 서버에 가지 않게.
  const stopSaved = useStore.subscribe((s, before) => {
    if (s.saveStatus === 'saved' && before.saveStatus !== 'saved' && currentUser()) soon(3000);
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible' && currentUser()) soon(0);
  };
  document.addEventListener('visibilitychange', onVisible);
  if (currentUser()) soon(0);
  return () => {
    accountGeneration++;
    cancelAsk?.();
    if (timer !== null) clearTimeout(timer);
    stopAuth();
    stopSaved();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
