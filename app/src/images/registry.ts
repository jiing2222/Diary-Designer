/**
 * 사용자가 등록한 이미지.
 *
 * `.png`/`.jpg` 파일을 받아 **화면과 PDF 양쪽에 쓸 수 있게** 들고 있는다.
 * 화면은 data URL로 `<image>`에 바로 넣고, PDF는 파일 바이트를 그대로
 * `embedPng`/`embedJpg`에 넘긴다. 두 뷰가 같은 파일을 봐야 어긋나지 않는다.
 *
 * **파일 자체는 이번 세션에만 메모리에 있다.** 양식 저장 파일(JSON)에는
 * 이름만 남는다 — 남의 이미지 파일을 저장 파일에 실어 옮기는 것은
 * 라이선스상으로도 애매하고, 파일 하나하나가 커서 프로젝트 파일이 그만큼
 * 무거워진다. 대신 `rings-v2`에 id별로 파일 바이트를
 * 남기므로(옛 캐시는 읽어서 복사만 한다), 새로고침해도 `restoreCachedImages`가 같은 이름의 이미지를
 * 다시 물어보지 않고 자동으로 되살린다.
 */

import { idbEntries } from '../storage/idb';
import type { ImageInfo } from '../core/assets';
import { queueAssetWrite, readAssetCache, saveAssetFile } from '../storage/assetCache';

const ACCEPTED = ['.png', '.jpg', '.jpeg'];
export const IMAGE_ACCEPT = ACCEPTED.join(',');

export type ImageKind = 'png' | 'jpg';

export interface UserImage {
  id: string;
  /** 파일 이름에서 확장자만 뗀 것. 되살리기(orphan) 매칭 기준이다. 파일은 id로 따로 저장한다. */
  name: string;
  /** 화면에 바로 쓸 수 있는 data URL. 저장 파일에서 이름만 살아 돌아온 경우 빈 문자열이다. */
  url: string;
  /** 목록에 보일 이름. 사용자가 따로 바꾸지 않았으면 `name`을 그대로 쓴다. */
  label?: string;
  /** 마지막으로 등록되거나 오브젝트에 씌워진 시각(ms). Library의 최신순을 정한다(core/assets). */
  usedAt?: number;
  /** Library 목록에서 뺐지만 쓰는 작업이 있어 파일은 남겨둔 것(core/assets). */
  hidden?: boolean;
}

/** 목록·저장 파일에 보일 이름. */
export function imageLabelOf(image: Pick<UserImage, 'name' | 'label'>): string {
  return image.label ?? image.name;
}

const bytes = new Map<string, ArrayBuffer>();
const kinds = new Map<string, ImageKind>();
let counter = 0;

function kindOf(filename: string): ImageKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  return null;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다'));
    reader.readAsDataURL(blob);
  });
}

/** 이미지의 Library 부가정보. IndexedDB에도 파일 바이트와 함께 얹어 남긴다. */
interface ImageMeta {
  label?: string;
  usedAt?: number;
  hidden?: boolean;
}

/** 이름·바이트·종류로 실제로 등록하는 부분(등록·복원이 함께 쓴다). */
async function loadImage(
  buffer: ArrayBuffer,
  name: string,
  kind: ImageKind,
  reuseId?: string,
  meta?: ImageMeta,
  persist = false,
): Promise<UserImage> {
  const url = await readAsDataUrl(new Blob([buffer]));

  // 저장 파일을 열면 이미지 이름만 남아 있다. 같은 이름의 파일을 다시
  // 등록하면 그때의 id를 그대로 물려받아 그 이미지를 쓰던 오브젝트가 되살아난다.
  let id = reuseId;
  if (!id) {
    counter += 1;
    id = `img${counter}`;
  }

  // 새 파일은 저장에 성공한 뒤에만 화면·PDF에서 사용할 수 있게 한다.
  if (persist) await saveAssetFile('images', { id, name, kind, buffer, ...meta });
  reserveImageIds([id]);
  bytes.set(id, buffer);
  kinds.set(id, kind);
  return { id, name, url, ...meta };
}

/**
 * 이미지 파일 하나를 등록한다.
 *
 * 화면에 바로 쓸 data URL까지 만들어 돌려준다. 이미지 파일이 아니면 던진다 —
 * 목록에 넣어놓고 나중에 안 그려지는 것보다 낫다. 등록에 성공하면
 * IndexedDB에도 같이 남겨서, 다음에 새로고침해도 이 파일을 다시 고르지
 * 않게 한다.
 *
 * 등록한 순간을 `usedAt`으로 남긴다 — Library는 이 시각으로 최신순을 정한다.
 * 다시 올리면 목록에서 뺀 표시(hidden)도 풀린다.
 */
export async function registerImage(file: File, reuseId?: string): Promise<UserImage> {
  const name = file.name.replace(/\.[^.]+$/, '');
  const kind = kindOf(file.name);
  if (!kind) {
    throw new Error(`이미지 파일이 아닙니다 (${ACCEPTED.join(', ')}만 됩니다)`);
  }

  const buffer = await file.arrayBuffer();
  const usedAt = Date.now();
  return loadImage(buffer, name, kind, reuseId, { usedAt }, true);
}

/**
 * 이름·목록에서 뺀 표시·최근 사용 시각을 IndexedDB에 다시 남긴다.
 *
 * 이름 바꾸기·목록에서 빼기·다시 쓰기(usedAt 갱신)가 함께 쓴다 — 파일
 * 바이트는 그대로 두고 부가정보만 갈아 끼운다. 파일이 없는(저장 파일에서
 * 이름만 살아 돌아온) 이미지는 다시 저장할 바이트가 없으니 아무 일도 안 한다.
 */
export function persistImageMeta(id: string, name: string, meta: ImageMeta): void {
  const buffer = bytes.get(id);
  const kind = kinds.get(id);
  if (!buffer || !kind) return;
  queueAssetWrite('images', { id, name, kind, buffer, ...meta });
}

let restoring: Promise<UserImage[]> | null = null;

/** 동시에 두 번 열어도 같은 파일을 중복 등록하지 않는다. */
export async function restoreCachedImages(resolveId?: (name: string) => string | undefined, known: ImageInfo[] = []): Promise<UserImage[]> {
  if (restoring) return restoring;
  const task = restoreImages(resolveId, known);
  restoring = task;
  try { return await task; } finally { if (restoring === task) restoring = null; }
}

/** 새 저장소의 id별 파일을 복원하고, 옛 파일은 읽어서 복사만 한다. */
async function restoreImages(
  resolveId?: (name: string) => string | undefined,
  known: ImageInfo[] = [],
): Promise<UserImage[]> {
  const rows = await readAssetCache('images');
  const cached = rows.filter((row) => typeof row.id === 'string' && row.id.length > 0);
  reserveImageIds(cached.map((i) => i.id));
  const names = new Set(cached.map((i) => i.name));
  const legacy = new Map(await idbEntries<{ name: string; kind: ImageKind; buffer: ArrayBuffer } & ImageMeta>('images'));
  // 첫 데이터 이전은 파일을 이름 키로 복사했다. id가 없는 그 사본도 원본과 같은 id로 복원한다.
  for (const row of rows) {
    if ((typeof row.id !== 'string' || !row.id) && row.buffer && row.kind && typeof row.name === 'string') {
      legacy.set(row.name, { name: row.name, kind: row.kind, buffer: row.buffer, label: row.label, usedAt: row.usedAt, hidden: row.hidden });
    }
  }
  const restored: UserImage[] = [];
  for (const row of cached) {
    if (row.deleted) continue;
    const info = { ...row, ...known.find((i) => i.id === row.id) };
    const meta = { label: info.label, hidden: info.hidden, usedAt: info.usedAt };
    try {
      if (!row.buffer || !row.kind) throw new Error('파일 없음');
      restored.push(await loadImage(row.buffer, row.name, row.kind, row.id, meta));
    } catch {
      restored.push({ id: row.id, name: row.name, url: '', ...meta });
    }
  }
  for (const [name, row] of legacy) {
    if (names.has(name)) continue;
    const id = resolveId?.(name);
    const info = { ...row, ...known.find((i) => i.id === id) };
    const meta = { label: info.label, hidden: info.hidden, usedAt: info.usedAt };
    let image: UserImage;
    try { image = await loadImage(row.buffer, row.name, row.kind, id, meta); }
    catch { continue; }
    await saveAssetFile('images', { id: image.id, name: row.name, kind: row.kind, buffer: row.buffer, ...meta });
    restored.push(image);
  }
  return restored;
}

/** PDF에 심을 파일 바이트. 없으면 이번 세션에 등록된 이미지가 아니다. */
export function imageBytes(id: string): ArrayBuffer | undefined {
  return bytes.get(id);
}

export function imageKind(id: string): ImageKind | undefined {
  return kinds.get(id);
}

/** 파일까지 들고 있는가. 저장 파일에서 이름만 살아 돌아온 이미지와 구분한다. */
export function hasImage(id: string): boolean {
  return bytes.has(id);
}

/**
 * 저장 파일을 열 때 id가 부딪히지 않게 번호를 밀어둔다.
 *
 * fonts/registry의 `reserveIds`와 같은 이유다.
 */
export function reserveImageIds(ids: string[]): void {
  for (const id of ids) {
    const n = Number(id.replace(/^img/, ''));
    if (Number.isFinite(n) && n > counter) counter = n;
  }
}

/** 새 버전의 파일만 지운다. 옛 저장소의 원본은 그대로 둔다. */
export function removeImage(id: string, name: string): void {
  bytes.delete(id);
  kinds.delete(id);
  queueAssetWrite('images', { id, name, deleted: true });
}
