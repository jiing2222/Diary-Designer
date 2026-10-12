import type { FontInfo, ImageInfo } from '../core/assets';
import { v2All, v2Put } from './v2';

type FileStore = 'fonts' | 'images';
export interface CachedAsset extends FontInfo, ImageInfo {
  buffer?: ArrayBuffer;
  kind?: 'png' | 'jpg';
  /** 옛 저장소에서 다시 가져오지 않도록 남기는 삭제 기록. 바이트는 담지 않는다. */
  deleted?: boolean;
}

export const readAssetCache = (store: FileStore) => v2All<CachedAsset>(store);
const pending = new Map<string, { store: FileStore; file: CachedAsset }>();

/** 새 파일은 저장 성공을 기다린다. 같은 이름도 id마다 따로 저장한다. */
export async function saveAssetFile(store: FileStore, file: CachedAsset): Promise<void> {
  await v2Put(store, file.id, file);
}

/** 이름·즐겨찾기·숨김·삭제는 자동 저장과 함께 확정한다. 실패한 것은 다음 저장에서 다시 시도한다. */
export function queueAssetWrite(store: FileStore, file: CachedAsset): void {
  pending.set(`${store}:${file.id}`, { store, file });
}

export function hasAssetWrites(): boolean { return pending.size > 0; }

export async function flushAssetWrites(): Promise<void> {
  const entries = [...pending.entries()];
  const results = await Promise.allSettled(entries.map(async ([key, job]) => {
    await saveAssetFile(job.store, job.file);
    if (pending.get(key) === job) pending.delete(key);
  }));
  if (results.some((r) => r.status === 'rejected')) throw new Error('이미지·글꼴을 저장하지 못했어요.');
}
