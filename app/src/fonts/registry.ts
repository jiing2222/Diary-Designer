/**
 * 사용자가 등록한 글꼴.
 *
 * `.ttf`/`.otf` 파일을 받아 **화면과 PDF 양쪽에 쓸 수 있게** 들고 있는다.
 * 화면은 FontFace로 브라우저에 심고, PDF는 파일 바이트를 그대로 넘긴다.
 * 두 뷰가 같은 파일을 봐야 글자 폭이 어긋나지 않는다.
 *
 * **파일 자체는 이번 세션에만 메모리에 있다.** 양식 저장 파일(JSON)에는
 * 이름만 남는다 — 2.7MB짜리 파일을 그대로 실을 수는 없다. 대신
 * `rings-v2`에 id별로 파일을 남기므로(옛 캐시는 읽어서 복사만 한다),
 * 새로고침해도 `restoreCachedFonts`가 같은 이름의 글꼴을 다시 물어보지
 * 않고 자동으로 되살린다.
 *
 * 바이트는 store가 아니라 여기에 둔다. 상태에 수 MB짜리 버퍼가 들어가면
 * 구독하는 컴포넌트마다 그것을 들여다보게 된다. store에는 목록만 둔다.
 */

import { DEFAULT_FONT_FAMILY } from '../core/style';
import { idbEntries } from '../storage/idb';
import type { FontInfo } from '../core/assets';
import { dropAssetWrite, queueAssetWrite, readAssetCache, saveAssetFile } from '../storage/assetCache';

/** 브라우저가 받아주는 글꼴 파일. 이 밖의 확장자는 열어봐야 실패한다. */
const ACCEPTED = ['.ttf', '.otf', '.woff', '.woff2'];
export const FONT_ACCEPT = ACCEPTED.join(',');

export interface UserFont {
  id: string;
  /** 파일 이름에서 확장자만 뗀 것. 되살리기(orphan) 매칭 기준이다. 파일은 id로 따로 저장한다. */
  name: string;
  /**
   * CSS에 심을 이름.
   *
   * 파일 이름을 그대로 쓰지 않는다. 같은 이름을 두 번 등록하거나 파일 이름에
   * 따옴표가 들어가면 CSS가 깨진다. id에서 만든 이름이라 부딪힐 일이 없다.
   */
  family: string;
  /** 목록에 보일 이름. 사용자가 따로 바꾸지 않았으면 `name`을 그대로 쓴다. */
  label?: string;
  /** 즐겨찾기 — Library·글꼴 고르기에서 맨 위(core/assets). */
  favorite?: boolean;
  /** Library 목록에서 뺐지만 쓰는 작업이 있어 파일은 남겨둔 것(core/assets). */
  hidden?: boolean;
}

/** 글꼴의 Library 부가정보. IndexedDB에도 파일 바이트와 함께 얹어 남긴다. */
type FontMeta = Pick<UserFont, 'label' | 'favorite' | 'hidden'>;

/** 목록·속성 막대에 보일 이름. */
export function fontLabelOf(font: Pick<UserFont, 'name' | 'label'>): string {
  return font.label ?? font.name;
}

const bytes = new Map<string, ArrayBuffer>();
let counter = 0;
const faces = new Map<string, FontFace>();

/**
 * 이름·바이트로 실제 화면에 심는 부분(등록·복원이 함께 쓴다).
 *
 * 심기에 실패하면(글꼴 파일이 아니거나 깨졌으면) 던진다 — 목록에 넣어놓고
 * 나중에 안 그려지는 것보다 낫다.
 */
async function loadFont(
  buffer: ArrayBuffer,
  name: string,
  reuseId?: string,
  meta?: FontMeta,
  persist = false,
): Promise<UserFont> {
  // 저장 파일을 열면 글꼴 이름만 남아 있다. 같은 이름의 파일을 다시 등록하면
  // **그때의 id를 그대로 물려받아** 그 글꼴을 쓰던 글자들이 되살아난다.
  // 새 id를 주면 글자들은 영영 없는 글꼴을 가리키게 된다.
  let id = reuseId;
  if (!id) {
    counter += 1;
    id = `f${counter}`;
  }
  const family = `user-font-${id}`;

  // 브라우저가 실제로 읽어낼 수 있는지 여기서 판가름 난다.
  const face = new FontFace(family, buffer);
  await face.load();
  // 새 파일은 저장에 성공한 뒤에만 화면·PDF에서 사용할 수 있게 한다.
  if (persist) await saveAssetFile('fonts', { id, name, buffer, ...meta });
  const old = faces.get(id);
  if (old) document.fonts.delete(old);
  document.fonts.add(face);
  faces.set(id, face);
  reserveIds([id]);

  bytes.set(id, buffer);
  return { id, name, family, ...meta };
}

/**
 * 글꼴 파일 하나를 등록한다.
 *
 * 화면에 심는 것까지 마치고 돌려준다. 등록에 성공하면 IndexedDB에도
 * 같이 남겨서, 다음에 새로고침해도 이 파일을 다시 고르지 않게 한다.
 */
export async function registerFont(file: File, reuseId?: string): Promise<UserFont> {
  const name = file.name.replace(/\.[^.]+$/, '');
  if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    throw new Error(`글꼴 파일이 아닙니다 (${ACCEPTED.join(', ')}만 됩니다)`);
  }

  const buffer = await file.arrayBuffer();
  return loadFont(buffer, name, reuseId, undefined, true);
}

/**
 * 이름·즐겨찾기·목록에서 뺀 표시를 IndexedDB에 다시 남긴다.
 *
 * 파일 바이트는 그대로 두고 부가정보만 갈아 끼운다. 파일이 없는(저장 파일에서
 * 이름만 살아 돌아온) 글꼴은 다시 저장할 바이트가 없으니 아무 일도 안 한다.
 */
export function persistFontMeta(id: string, name: string, meta: FontMeta): void {
  const buffer = bytes.get(id);
  if (!buffer) return;
  queueAssetWrite('fonts', { id, name, buffer, ...meta });
}

let restoring: Promise<UserFont[]> | null = null;

/** 동시에 두 번 열어도 같은 파일을 중복 등록하지 않는다. */
export async function restoreCachedFonts(resolveId?: (name: string) => string | undefined, known: FontInfo[] = []): Promise<UserFont[]> {
  if (restoring) return restoring;
  const task = restoreFonts(resolveId, known);
  restoring = task;
  try { return await task; } finally { if (restoring === task) restoring = null; }
}

/** 새 저장소의 id별 파일을 복원하고, 옛 파일은 읽어서 복사만 한다. */
async function restoreFonts(
  resolveId?: (name: string) => string | undefined,
  known: FontInfo[] = [],
): Promise<UserFont[]> {
  const rows = await readAssetCache('fonts');
  const cached = rows.filter((row) => typeof row.id === 'string' && row.id.length > 0);
  reserveIds(cached.map((f) => f.id));
  const names = new Set(cached.map((f) => f.name));
  const legacy = new Map(await idbEntries<{ name: string; buffer: ArrayBuffer } & FontMeta>('fonts'));
  // 첫 데이터 이전은 파일을 이름 키로 복사했다. id가 없는 그 사본도 원본과 같은 id로 복원한다.
  for (const row of rows) {
    if ((typeof row.id !== 'string' || !row.id) && row.buffer && typeof row.name === 'string') {
      legacy.set(row.name, { name: row.name, buffer: row.buffer, label: row.label, favorite: row.favorite, hidden: row.hidden });
    }
  }
  const restored: UserFont[] = [];
  for (const row of cached) {
    if (row.deleted) continue;
    const info = { ...row, ...known.find((f) => f.id === row.id) };
    const meta = { label: info.label, hidden: info.hidden, favorite: info.favorite };
    try {
      if (!row.buffer) throw new Error('파일 없음');
      restored.push(await loadFont(row.buffer, row.name, row.id, meta));
    } catch {
      restored.push({ id: row.id, name: row.name, family: `user-font-${row.id}`, ...meta });
    }
  }
  for (const [name, row] of legacy) {
    if (names.has(name)) continue;
    const id = resolveId?.(name);
    const info = { ...row, ...known.find((f) => f.id === id) };
    const meta = { label: info.label, hidden: info.hidden, favorite: info.favorite };
    let font: UserFont;
    try { font = await loadFont(row.buffer, row.name, id, meta); }
    catch { continue; }
    await saveAssetFile('fonts', { id: font.id, name: row.name, buffer: row.buffer, ...meta });
    restored.push(font);
  }
  return restored;
}

/** PDF에 심을 파일 바이트. 없으면 이번 세션에 등록된 글꼴이 아니다. */
export function fontBytes(id: string): ArrayBuffer | undefined {
  return bytes.get(id);
}

/** 파일까지 들고 있는가. 저장 파일에서 이름만 살아 돌아온 글꼴과 구분한다. */
export function hasFont(id: string): boolean {
  return bytes.has(id);
}

/**
 * 저장 파일을 열 때 id가 부딪히지 않게 번호를 밀어둔다.
 *
 * 불러온 글꼴이 `f7`까지 있는데 새로 등록하는 것이 `f1`이 되면 서로를 덮어쓴다.
 */
export function reserveIds(ids: string[]): void {
  for (const id of ids) {
    const n = Number(id.replace(/^f/, ''));
    if (Number.isFinite(n) && n > counter) counter = n;
  }
}

/**
 * 화면에 쓸 CSS font-family 이름.
 *
 * 등록한 적 없는 id(새로고침 뒤 남은 글자)는 기본 글꼴로 돌아간다. 글자가
 * 안 보이는 것보다 기본 글꼴로라도 보이는 편이 낫다.
 */
export function familyOf(fonts: UserFont[], id: string | undefined): string {
  const found = id ? fonts.find((f) => f.id === id) : undefined;
  return found ? `${found.family}, ${DEFAULT_FONT_FAMILY}` : DEFAULT_FONT_FAMILY;
}

/** 새 버전의 파일만 지운다. 옛 저장소의 원본은 그대로 둔다. */
export function removeFont(id: string, name: string): void {
  bytes.delete(id);
  const face = faces.get(id);
  if (face) document.fonts.delete(face);
  faces.delete(id);
  queueAssetWrite('fonts', { id, name, deleted: true });
}

/**
 * 계정 동기화에서 이 기기 글꼴에 새 id를 줄 때(core/sync — 다른 기기의 글꼴과 id가 겹쳤다). 파일과 화면용
 * 이름(`user-font-<id>`)을 새 id로 옮기고, 옛 id 칸은 비운다 — 그 자리는 계정의 다른 글꼴이 쓴다.
 */
export async function rekeyFont(from: string, to: string, name: string, meta: FontMeta): Promise<void> {
  const buffer = bytes.get(from);
  const face = faces.get(from);
  if (buffer) await loadFont(buffer, name, to, meta, true);
  await saveAssetFile('fonts', { id: from, name, deleted: true });
  if (face) document.fonts.delete(face);
  faces.delete(from);
  bytes.delete(from);
  dropAssetWrite('fonts', from);
}

/** 계정에서 받은 글꼴 파일을 그 id로 심고 이 기기에도 남긴다(리뉴얼 8-2c). */
export function adoptFont(id: string, name: string, buffer: ArrayBuffer, meta: FontMeta): Promise<UserFont> {
  return loadFont(buffer, name, id, meta, true);
}
