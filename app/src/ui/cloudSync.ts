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
  type SyncState,
} from '../core/sync';
import { allIdsOf, type Work } from '../core/work';
import { ensureIdCounterAbove } from '../core/objects';
import { adoptFont, fontBytes, hasFont, rekeyFont, reserveIds } from '../fonts/registry';
import { adoptImage, hasImage, imageBytes, imageKind, rekeyImage, reserveImageIds } from '../images/registry';
import { v2Get, v2Put } from '../storage/v2';
import { flushAutosave } from './persist';

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

function ask(works: number, total: number): Promise<boolean> {
  useStore.setState({ syncAsk: { works, total } });
  return new Promise((resolve) => {
    answer = (upload) => {
      answer = null;
      useStore.setState({ syncAsk: null });
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

const entryOf = (d: { id: string; updated: string }, data: unknown) => ({
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
  useStore.setState({ cloudStatus: { kind: 'syncing' } });
  try {
    // 받은 것을 적용하기 전에 이 기기에서 고친 것부터 저장해 둔다.
    await flushAutosave();
    const rec = await loadRecord(user.id);
    const state: SyncState = { ...rec.state };
    let skip = new Set(rec.skip);

    const listed = await listDocs();
    const changed = listed.filter((d) => !d.deleted && state[docKey(d.kind, d.key)]?.updated !== d.updated);
    const full = new Map((await withData(changed)).map((d) => [docKey(d.kind, d.key), d]));
    const remote: RemoteDoc[] = listed.map((d) => full.get(docKey(d.kind, d.key)) ?? d);

    let local = docsOf(syncSnapshotOf(useStore.getState()));
    if (!rec.asked) {
      const fresh = [...local.keys()].filter((k) => !(k in state) && splitDocKey(k).kind !== 'prefs');
      if (fresh.length > 0) {
        const works = fresh.filter((k) => splitDocKey(k).kind === 'work').length;
        const upload = await ask(works, fresh.length);
        // 안 올리면 지금 있는 것(기본 다이어리 설정 포함)은 이 기기에만 둔다.
        if (!upload) skip = new Set([...skip, ...fresh, docKey('prefs', 'prefs')]);
      }
      rec.asked = true;
      local = docsOf(syncSnapshotOf(useStore.getState()));
    }

    // 1) 받기 — 새 id 주기·받기·지우기를 store에 적용한다.
    const ops: SyncOp[] = [];
    for (const a of planSync(local, remote, state, skip)) {
      const { kind, key } = splitDocKey(a.key);
      if (a.type === 'rekey') {
        const to = freshKey(key);
        ops.push({ type: 'rekey', kind, from: key, to, conflict: a.conflict });
        if (skip.has(a.key)) {
          skip.delete(a.key);
          skip.add(docKey(kind, to));
        }
        if (a.doc.deleted) delete state[a.key];
        else {
          ops.push({ type: 'put', kind, key, data: a.doc.data });
          state[a.key] = entryOf(a.doc, a.doc.data);
        }
      } else if (a.type === 'pull') {
        ops.push({ type: 'put', kind, key, data: a.doc.data });
        state[a.key] = entryOf(a.doc, a.doc.data);
      } else if (a.type === 'deleteLocal') {
        ops.push({ type: 'remove', kind, key });
        delete state[a.key];
      } else if (a.type === 'same') {
        if (a.doc.deleted) delete state[a.key];
        else state[a.key] = entryOf(a.doc, a.doc.data);
      }
    }
    if (ops.length > 0) {
      await moveAssetFiles(ops);
      useStore.getState().applySyncOps(ops);
      reserveReceivedIds(ops);
    }

    // 2) 올리기 — 받은 뒤의 이 기기 자료로 다시 따져, 바뀐 것·새것·지운 것만.
    const now = docsOf(syncSnapshotOf(useStore.getState()));
    for (const a of planSync(now, remote, state, skip)) {
      const { kind, key } = splitDocKey(a.key);
      if (a.type === 'push') {
        const data = now.get(a.key);
        const res = await putDoc(kind, key, data, a.remoteId);
        state[a.key] = entryOf(res, data);
      } else if (a.type === 'deleteRemote') {
        await markDeleted(a.remoteId);
        delete state[a.key];
      }
    }

    // 3) 글꼴·이미지 파일 — 칸이 맞춰진 뒤에 올리고 받는다.
    await syncFiles(state, remote, skip);

    await saveRecord(user.id, { state, skip: [...skip], asked: rec.asked });
    useStore.setState({ cloudStatus: { kind: 'saved', at: Date.now() } });
  } catch (err) {
    // 400은 서버가 받은 자료를 거절한 것 — 로그인 오류 문구(cloudErrorText의 기본)와 구분한다.
    const text = (err as { status?: number })?.status === 400 ? '서버가 자료를 받지 못했어요.' : cloudErrorText(err);
    useStore.setState({ cloudStatus: { kind: 'error', text } });
  }
}

/**
 * 글꼴·이미지 파일(8-2c, 2026-10-13 결정). 이 기기에 파일이 있고 아직 안 올렸으면(또는 크기가 달라졌으면)
 * 올리고, 계정에는 있는데 이 기기에 파일이 없으면 받는다. 파일 하나가 실패해도 나머지는 계속한다 —
 * 다음 맞추기에서 다시 해 본다.
 */
async function syncFiles(state: SyncState, remote: RemoteDoc[], skip: Set<string>): Promise<void> {
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
    const e = state[u.k];
    if (!e || !u.bytes || skip.has(u.k) || e.file === u.bytes.byteLength) continue;
    try {
      const res = await putFile(e.remoteId, u.bytes, u.name);
      state[u.k] = { ...e, updated: res.updated, file: u.bytes.byteLength };
    } catch {
      // 다음에 다시.
    }
  }
  for (const d of remote) {
    if (d.deleted || !d.file || (d.kind !== 'font' && d.kind !== 'image')) continue;
    const k = docKey(d.kind, d.key);
    if (d.kind === 'font' ? hasFont(d.key) : hasImage(d.key)) continue;
    try {
      const now = useStore.getState();
      if (d.kind === 'font') {
        const info = now.userFonts.find((f) => f.id === d.key);
        if (!info) continue;
        const bytes = await getFile(d);
        now.addUserFont(
          await adoptFont(d.key, info.name, bytes, { label: info.label, favorite: info.favorite, hidden: info.hidden }),
        );
        if (state[k]) state[k] = { ...state[k], file: bytes.byteLength };
      } else {
        const info = now.userImages.find((i) => i.id === d.key);
        if (!info) continue;
        const bytes = await getFile(d);
        const kind = /\.png$/i.test(d.file) ? 'png' : 'jpg';
        now.addUserImage(
          await adoptImage(d.key, info.name, bytes, kind, {
            label: info.label,
            usedAt: info.usedAt,
            hidden: info.hidden,
          }),
        );
        if (state[k]) state[k] = { ...state[k], file: bytes.byteLength };
      }
    } catch {
      // 다음에 다시.
    }
  }
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
    if (user) soon(0);
    else useStore.setState({ cloudStatus: { kind: 'local' }, syncAsk: null });
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
    if (timer !== null) clearTimeout(timer);
    stopAuth();
    stopSaved();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
