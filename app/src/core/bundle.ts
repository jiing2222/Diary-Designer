import type { Face, Work, WorkItem } from './work';
import { samePaper, type Diary } from './diary';
import { fontsInUse, imagesInUse, type FontInfo, type ImageInfo } from './assets';
import { freshKey, rekeySnapshot, type SyncKind, type SyncSnapshot } from './sync';
import { isTrashed } from './library';

/**
 * 작업 파일(.rings) — 작업을 파일로 저장하고 불러온다(세부계획 ‘파일로 저장·불러오기’).
 *
 * 파일 하나에 **작업 여러 개**와 그것들이 쓰는 다이어리·글꼴·이미지 파일을 함께 담는다. 받는 쪽에 같은
 * 글꼴·이미지가 없어도 그대로 보이게 하려는 것이다. 폴더·탭·보는 위치는 담지 않는다(받는 쪽의 정리다).
 *
 * 불러오기는 **절대 받는 쪽의 것을 덮어쓰지 않는다.** id가 부딪히면 들어오는 쪽에 새 id를 주고, 가리키던
 * 곳도 함께 바꾼다(계정 동기화의 `rekeySnapshot`과 같은 일). 같은 종이의 다이어리가 이미 있으면 그것을 쓴다.
 * 파일 바이트를 base64로 바꾸는 일은 ui가 한다 — 여기서는 글자로만 다룬다.
 */

export const FILE_FORMAT = 'rings-file';
export const FILE_VERSION = 1;

export interface FileFont {
  info: FontInfo;
  /** 글꼴 파일, base64. */
  data: string;
}

export interface FileImage {
  info: ImageInfo;
  kind: 'png' | 'jpg';
  data: string;
}

export interface RingsFile {
  format: typeof FILE_FORMAT;
  version: number;
  savedAt: string;
  works: Work[];
  diaries: Diary[];
  fonts: FileFont[];
  images: FileImage[];
}

interface AssetFiles {
  font: (id: string) => string | undefined;
  image: (id: string) => { kind: 'png' | 'jpg'; data: string } | undefined;
}

/** 파일로 담을 작업들(휴지통에 있는 것은 뺀다)과 그것들이 쓰는 것. 파일이 없는 글꼴·이미지는 이름도 담지 않는다. */
export function bundleWorks(
  snap: Pick<SyncSnapshot, 'works' | 'diaries' | 'fonts' | 'images'>,
  workIds: string[],
  files: AssetFiles,
  now: string,
): RingsFile {
  const want = new Set(workIds);
  const works = snap.works.filter((w) => want.has(w.id) && !isTrashed(w));
  const diaryIds = new Set(works.map((w) => w.diaryId));
  const usedFonts = fontsInUse(works);
  const usedImages = imagesInUse(works);
  const fonts: FileFont[] = [];
  for (const info of snap.fonts) {
    const data = usedFonts.has(info.id) ? files.font(info.id) : undefined;
    if (data) fonts.push({ info, data });
  }
  const images: FileImage[] = [];
  for (const info of snap.images) {
    const file = usedImages.has(info.id) ? files.image(info.id) : undefined;
    if (file) images.push({ info, ...file });
  }
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    savedAt: now,
    works,
    diaries: snap.diaries.filter((d) => diaryIds.has(d.id)),
    fonts,
    images,
  };
}

/** 읽지 못한 이유 — 문구는 화면(ui/fileIO)이 언어에 맞게 붙인다. */
export type ReadError = 'not-rings' | 'newer' | 'broken';

const named = (v: { id: string; name: string } | null | undefined) =>
  !!v && typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string';
const unique = (list: { id: string }[]) => new Set(list.map(x => x.id)).size === list.length;
const record = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
function validFace(f: Face): boolean {
  return !!f && typeof f.id === 'string' && record(f.background) && f.background.spacing > 0 &&
    Array.isArray(f.objects) && f.objects.every(o => !!o && typeof o.id === 'string' && typeof o.type === 'string');
}
function validItem(i: WorkItem): boolean {
  if (!i || typeof i.id !== 'string') return false;
  if (i.kind === 'page') return validFace(i.face);
  if (i.kind !== 'dated' || !Array.isArray(i.faces) || !i.faces.every(validFace) || !i.dataset || !record(i.overrides)) return false;
  const d = i.dataset;
  const dataset = d.kind === 'calendar' ? Number.isInteger(d.year) : d.kind === 'date' &&
    typeof d.start === 'string' && typeof d.end === 'string' && d.perPage > 0 && ['day', 'week', 'month'].includes(d.step);
  return dataset && Object.values(i.overrides).every(o => !!o && record(o.props) && Array.isArray(o.added) && Array.isArray(o.removed));
}

/**
 * 글자를 작업 파일로. 다른 파일이거나 더 새 판이면 이유를 돌려준다. 손상된 구조는 store에 넣기 전에 거절해
 * 다음 실행에도 화면이 깨지지 않게 한다.
 */
export function readFile(text: string): { ok: RingsFile } | { error: ReadError } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'not-rings' };
  }
  const f = raw as Partial<RingsFile> | null;
  if (!f || f.format !== FILE_FORMAT) return { error: 'not-rings' };
  if (typeof f.version !== 'number' || f.version > FILE_VERSION) {
    return { error: 'newer' };
  }
  if (!Array.isArray(f.works) || !Array.isArray(f.diaries)) return { error: 'broken' };
  const fonts = f.fonts ?? [];
  const images = f.images ?? [];
  if (!f.diaries.every(d => named(d) && Number.isFinite(d.width) && d.width > 0 && Number.isFinite(d.height) && d.height > 0 && record(d.punch)) ||
    !f.works.every(w => named(w) && typeof w.diaryId === 'string' && f.diaries!.some(d => d.id === w.diaryId) &&
      record(w.palette?.base) && Array.isArray(w.palette?.points) && Array.isArray(w.items) && w.items.every(validItem)) ||
    !Array.isArray(fonts) || !fonts.every(a => !!a && named(a.info) && typeof a.data === 'string') ||
    !Array.isArray(images) || !images.every(a => !!a && named(a.info) && typeof a.data === 'string' && ['png', 'jpg'].includes(a.kind)) ||
    !unique(f.works) || !unique(f.diaries) || !unique(fonts.map(a => a.info)) || !unique(images.map(a => a.info))) {
    return { error: 'broken' };
  }
  return {
    ok: {
      format: FILE_FORMAT,
      version: f.version,
      savedAt: typeof f.savedAt === 'string' ? f.savedAt : '',
      works: f.works,
      diaries: f.diaries,
      fonts,
      images,
    },
  };
}

/** 불러올 때 실제로 더할 것 — 새 id를 받은 뒤의 모습. */
export interface ImportPlan {
  works: Work[];
  /** 새로 등록할 다이어리(같은 종이가 이미 있으면 그것을 쓰므로 빠진다). */
  diaries: Diary[];
  /** 새로 등록할 글꼴·이미지(같은 것이 이미 있으면 빠진다). `info.id`는 최종 id. */
  fonts: FileFont[];
  images: FileImage[];
}

/**
 * 받는 쪽(`local`)에 파일을 어떻게 더할지 정한다.
 * - 다이어리: 같은 종이(크기·구멍)의 다이어리가 있으면 그것을 쓴다. 없으면 새로 — id가 겹치면 새 id.
 * - 글꼴·이미지: id·이름·실제 파일이 같으면 그것을 쓴다. id만 겹치면 새 id.
 * - 작업: 언제나 새로 더한다. id가 겹치면 새 id. 폴더는 받는 쪽에 없으므로 폴더 밖으로.
 */
export function planImport(
  local: Pick<SyncSnapshot, 'works' | 'diaries' | 'fonts' | 'images'>,
  file: RingsFile,
  random: () => number = Math.random,
  files?: AssetFiles,
): ImportPlan {
  let s: SyncSnapshot = {
    works: file.works.map(({ folderId: _folder, ...w }) => w as Work),
    diaries: file.diaries,
    folders: [],
    textStyles: [],
    savedPalettes: [],
    fonts: file.fonts.map((f) => f.info),
    images: file.images.map((i) => i.info),
    defaultDiaryId: null,
  };
  const listOf = (source: typeof local, kind: SyncKind) =>
    kind === 'work' ? source.works : kind === 'diary' ? source.diaries : kind === 'font' ? source.fonts : source.images;
  const reserved = new Map<SyncKind, Set<string>>();
  const taken = (kind: SyncKind) => {
    if (!reserved.has(kind)) reserved.set(kind, new Set([...listOf(local, kind), ...listOf(s, kind)].map(x => x.id)));
    return reserved.get(kind)!;
  };
  const fresh = (kind: SyncKind, id: string) => {
    const used = taken(kind);
    let next = freshKey(id, random);
    while (used.has(next)) next += 'a';
    used.add(next);
    return next;
  };
  // id를 서로 바꾸는 경우에도 중간 id가 다른 입력을 끌고 가지 않도록 두 단계로 옮긴다.
  const remap = (kind: SyncKind, ids: Map<string, string>) => {
    const staged: [string, string][] = [];
    for (const [from, to] of ids) {
      if (from === to) continue;
      const temp = fresh(kind, from);
      s = rekeySnapshot(s, kind, from, temp);
      staged.push([temp, to]);
    }
    for (const [from, to] of staged) s = rekeySnapshot(s, kind, from, to);
  };

  // 다이어리 — 같은 종이면 받는 쪽 것으로 갈아 끼운다.
  const reused = new Set<string>();
  const diaryIds = new Map<string, string>();
  for (const d of file.diaries) {
    const same = local.diaries.find((l) => samePaper(l, d));
    if (same) {
      diaryIds.set(d.id, same.id);
      reused.add(same.id);
    } else if (local.diaries.some(l => l.id === d.id)) diaryIds.set(d.id, fresh('diary', d.id));
  }
  remap('diary', diaryIds);

  // 글꼴·이미지 — 같은 것이면 그대로 쓰고, id만 겹치면 새 id. 파일 바이트는 따라간다.
  const fontData = new Map(file.fonts.map((f) => [f.info.id, f.data]));
  const imageData = new Map(file.images.map((i) => [i.info.id, i]));
  const keepFonts: FileFont[] = [];
  const fontIds = new Map<string, string>();
  for (const f of file.fonts) {
    const mine = local.fonts.find((l) => l.id === f.info.id);
    if (mine && mine.name === f.info.name && files?.font(mine.id) === f.data) continue;
    const id = mine ? fresh('font', f.info.id) : f.info.id;
    fontIds.set(f.info.id, id);
    keepFonts.push({ info: { ...f.info, id }, data: fontData.get(f.info.id)! });
  }
  remap('font', fontIds);
  const keepImages: FileImage[] = [];
  const imageIds = new Map<string, string>();
  for (const i of file.images) {
    const mine = local.images.find((l) => l.id === i.info.id);
    const existing = mine ? files?.image(mine.id) : undefined;
    if (mine && mine.name === i.info.name && existing?.kind === i.kind && existing.data === i.data) continue;
    const id = mine ? fresh('image', i.info.id) : i.info.id;
    imageIds.set(i.info.id, id);
    const src = imageData.get(i.info.id)!;
    keepImages.push({ info: { ...i.info, id }, kind: src.kind, data: src.data });
  }
  remap('image', imageIds);

  // 작업 — 덮어쓰지 않는다.
  remap('work', new Map(file.works.filter(w => local.works.some(l => l.id === w.id)).map(w => [w.id, fresh('work', w.id)])));

  return {
    works: s.works,
    diaries: s.diaries.filter((d) => !reused.has(d.id)),
    fonts: keepFonts,
    images: keepImages,
  };
}

/** 파일 이름에 못 쓰는 글자를 걷어낸다. 비면 'rings'. */
export function fileNameOf(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safe || 'rings'}.rings`;
}
