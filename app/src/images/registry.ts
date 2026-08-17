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
 * 무거워진다. 대신 `storage/idb.ts`로 브라우저(IndexedDB)에 파일 바이트를
 * 캐싱해두므로, 새로고침해도 `restoreCachedImages`가 같은 이름의 이미지를
 * 다시 물어보지 않고 자동으로 되살린다.
 */

import { idbDelete, idbEntries, idbPut } from '../storage/idb';

const ACCEPTED = ['.png', '.jpg', '.jpeg'];
export const IMAGE_ACCEPT = ACCEPTED.join(',');

export type ImageKind = 'png' | 'jpg';

export interface UserImage {
  id: string;
  /** 파일 이름에서 확장자만 뗀 것. IndexedDB 키이자 되살리기(orphan) 매칭 기준이다 — 안 바뀐다. */
  name: string;
  /** 화면에 바로 쓸 수 있는 data URL. 저장 파일에서 이름만 살아 돌아온 경우 빈 문자열이다. */
  url: string;
  /** 목록에 보일 이름. 사용자가 따로 바꾸지 않았으면 `name`을 그대로 쓴다. */
  label?: string;
  /** 디자인 관리에서 명시적으로 저장했는가. 켜져 있으면 "최근 사용" 개수 제한에서 빠진다. */
  saved?: boolean;
  /** 마지막으로 등록되거나 오브젝트에 씌워진 시각(ms). "최근 사용" 순서를 정한다. */
  usedAt?: number;
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

/** 이미지의 디자인 관리 부가정보. IndexedDB에도 파일 바이트와 함께 얹어 남긴다. */
interface ImageMeta {
  label?: string;
  saved?: boolean;
  usedAt?: number;
}

/** 이름·바이트·종류로 실제로 등록하는 부분(등록·복원이 함께 쓴다). */
async function loadImage(
  buffer: ArrayBuffer,
  name: string,
  kind: ImageKind,
  reuseId?: string,
  meta?: ImageMeta,
): Promise<UserImage> {
  const url = await readAsDataUrl(new Blob([buffer]));

  // 저장 파일을 열면 이미지 이름만 남아 있다. 같은 이름의 파일을 다시
  // 등록하면 그때의 id를 그대로 물려받아 그 이미지를 쓰던 오브젝트가 되살아난다.
  let id = reuseId;
  if (!id) {
    counter += 1;
    id = `img${counter}`;
  }

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
 * 등록한 순간을 `usedAt`으로 남긴다 — 디자인 관리에서 명시적으로 저장하지
 * 않은 이미지는 이 시각 기준 "최근 사용" 10개 안에 들어야 살아남는다
 * (store.ts의 `addUserImage`가 넘치는 만큼 오래된 것부터 지운다).
 */
export async function registerImage(file: File, reuseId?: string): Promise<UserImage> {
  const name = file.name.replace(/\.[^.]+$/, '');
  const kind = kindOf(file.name);
  if (!kind) {
    throw new Error(`이미지 파일이 아닙니다 (${ACCEPTED.join(', ')}만 됩니다)`);
  }

  const buffer = await file.arrayBuffer();
  const usedAt = Date.now();
  const image = await loadImage(buffer, name, kind, reuseId, { usedAt });
  idbPut('images', name, { name, kind, buffer, usedAt });
  return image;
}

/**
 * 이름·저장 여부·최근 사용 시각을 IndexedDB에 다시 남긴다.
 *
 * 이름 바꾸기·저장 켜기/끄기·다시 쓰기(usedAt 갱신)가 함께 쓴다 — 파일
 * 바이트는 그대로 두고 부가정보만 갈아 끼운다. 파일이 없는(저장 파일에서
 * 이름만 살아 돌아온) 이미지는 다시 저장할 바이트가 없으니 아무 일도 안 한다.
 */
export function persistImageMeta(id: string, name: string, meta: ImageMeta): void {
  const buffer = bytes.get(id);
  const kind = kinds.get(id);
  if (!buffer || !kind) return;
  idbPut('images', name, { name, kind, buffer, ...meta });
}

const restoredNames = new Set<string>();

/**
 * 새로고침 뒤, 예전에 등록했던 이미지들을 다시 물어보지 않고 되살린다.
 *
 * fonts/registry의 `restoreCachedFonts`와 같은 이유·같은 규칙이다.
 */
export async function restoreCachedImages(): Promise<UserImage[]> {
  const entries = await idbEntries<{ name: string; kind: ImageKind; buffer: ArrayBuffer } & ImageMeta>('images');
  const restored: UserImage[] = [];
  for (const [name, cached] of entries) {
    if (restoredNames.has(name)) continue;
    restoredNames.add(name);
    try {
      restored.push(
        await loadImage(cached.buffer, cached.name, cached.kind, undefined, {
          label: cached.label,
          saved: cached.saved,
          usedAt: cached.usedAt,
        }),
      );
    } catch {
      // 깨진 캐시 — 건너뛴다.
    }
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

/**
 * 자주 쓰는 이미지 목록(캐시)에서 하나를 뺀다.
 *
 * IndexedDB는 파일 이름으로 저장했으므로(`registerImage`) 이름으로 지운다.
 * 다음에 새로고침해도 다시 안 돌아온다 — `restoredNames`에서도 빼서, 혹시
 * 같은 세션에서 다시 등록하면 새 캐시로 잡히게 한다.
 */
export function removeImage(name: string): void {
  restoredNames.delete(name);
  void idbDelete('images', name);
}
