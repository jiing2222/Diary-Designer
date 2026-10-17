/**
 * 계정의 칸들(rings_docs)을 주고받는다 — 리뉴얼 8-2. 무엇을 주고받을지는 core/sync가 정하고,
 * 순서는 ui/cloudSync가 잡는다. 여기는 PocketBase 호출만 한다.
 *
 * 목록은 내용(data) 없이 먼저 받는다 — 작업이 많으면 매번 전부 받기에 무겁다. 마지막으로 맞춘 뒤
 * 바뀐 칸만 내용을 따로 받는다(`withData`).
 */

import { authed } from './client';
import type { RemoteDoc, SyncKind } from '../core/sync';
import { t } from '../lang';

const COLLECTION = 'rings_docs';

interface Row {
  id: string;
  kind: string;
  key: string;
  data?: unknown;
  deleted?: boolean;
  updated: string;
  file?: string;
}

const docOf = (r: Row): RemoteDoc => ({
  id: r.id,
  kind: r.kind as SyncKind,
  key: r.key,
  data: r.data ?? null,
  deleted: !!r.deleted,
  updated: r.updated,
  file: r.file || undefined,
});

function session() {
  const a = authed();
  if (!a) throw new Error(t('로그인하지 않았어요.', "You're not signed in."));
  return { pb: a.pb, user: a.userId, col: a.pb.collection(COLLECTION) };
}

/** 내 칸 전부 — 내용 없이. */
export async function listDocs(): Promise<RemoteDoc[]> {
  const { pb, user, col } = session();
  const rows = await col.getFullList<Row>({
    filter: pb.filter('user = {:user}', { user }),
    fields: 'id,kind,key,deleted,updated,file',
    batch: 500,
    requestKey: null,
  });
  return rows.map(docOf);
}

/** 이 칸들의 내용까지. 한 번에 50칸씩 묻는다(주소 길이 때문에). */
export async function withData(docs: RemoteDoc[]): Promise<RemoteDoc[]> {
  if (docs.length === 0) return [];
  const { pb, user, col } = session();
  const out: RemoteDoc[] = [];
  for (let i = 0; i < docs.length; i += 50) {
    const ids = docs.slice(i, i + 50).map((d) => d.id);
    const params: Record<string, string> = { user };
    ids.forEach((id, n) => (params[`id${n}`] = id));
    const rows = await col.getFullList<Row>({
      filter: pb.filter(`user = {:user} && (${ids.map((_, n) => `id = {:id${n}}`).join(' || ')})`, params),
      fields: 'id,kind,key,data,deleted,updated,file',
      requestKey: null,
    });
    out.push(...rows.map(docOf));
  }
  return out;
}

/** 올린다. `remoteId`가 있으면 그 칸을 덮어쓴다(지움 표시였어도 되살아난다). */
export async function putDoc(
  kind: SyncKind,
  key: string,
  data: unknown,
  remoteId?: string,
): Promise<{ id: string; updated: string }> {
  const { user, col } = session();
  const body = { user, kind, key, data, deleted: false };
  const row = remoteId
    ? await col.update<Row>(remoteId, body, { requestKey: null })
    : await col.create<Row>(body, { requestKey: null });
  return { id: row.id, updated: row.updated };
}

/** 지움 표시만 남긴다 — 내용과 파일은 비운다. */
export async function markDeleted(remoteId: string): Promise<{ id: string; updated: string }> {
  const { col } = session();
  const row = await col.update<Row>(remoteId, { deleted: true, data: null, file: null }, { requestKey: null });
  return { id: row.id, updated: row.updated };
}

/** 글꼴·이미지 파일을 그 칸에 올린다(8-2c). 서버가 이름 뒤에 꼬리를 붙여 저장한다. */
export async function putFile(
  remoteId: string,
  bytes: ArrayBuffer,
  filename: string,
): Promise<{ id: string; updated: string }> {
  const { col } = session();
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);
  const row = await col.update<Row>(remoteId, form, { requestKey: null });
  return { id: row.id, updated: row.updated };
}

/** 칸의 파일을 받는다. 보호된 파일이라 본인 토큰을 붙인다. */
export async function getFile(doc: RemoteDoc): Promise<ArrayBuffer> {
  const { pb } = session();
  if (!doc.file) throw new Error(t('파일이 없어요.', 'No file.'));
  const token = await pb.files.getToken({ requestKey: null });
  const url = pb.files.getURL({ id: doc.id, collectionName: COLLECTION }, doc.file, { token });
  const res = await fetch(url);
  if (!res.ok) throw new Error(t(`파일을 받지 못했어요(${res.status}).`, `Couldn't download the file (${res.status}).`));
  return res.arrayBuffer();
}
