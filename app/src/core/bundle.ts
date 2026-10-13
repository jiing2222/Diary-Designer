import type { Work } from './work';
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

/** 파일로 담을 작업들(휴지통에 있는 것은 뺀다)과 그것들이 쓰는 것. 파일이 없는 글꼴·이미지는 이름도 담지 않는다. */
export function bundleWorks(
  snap: Pick<SyncSnapshot, 'works' | 'diaries' | 'fonts' | 'images'>,
  workIds: string[],
  files: {
    font: (id: string) => string | undefined;
    image: (id: string) => { kind: 'png' | 'jpg'; data: string } | undefined;
  },
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

/** 글자를 작업 파일로. 다른 파일이거나 더 새 판이면 이유를 돌려준다. 화면이 죽지 않을 만큼만 본다. */
export function readFile(text: string): { ok: RingsFile } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'Rings 작업 파일이 아니에요.' };
  }
  const f = raw as Partial<RingsFile> | null;
  if (!f || f.format !== FILE_FORMAT) return { error: 'Rings 작업 파일이 아니에요.' };
  if (typeof f.version !== 'number' || f.version > FILE_VERSION) {
    return { error: '더 새 버전의 Rings에서 저장한 파일이에요. 앱을 새로 고친 뒤 다시 열어 주세요.' };
  }
  if (!Array.isArray(f.works) || !Array.isArray(f.diaries)) return { error: '파일이 손상됐어요.' };
  return {
    ok: {
      format: FILE_FORMAT,
      version: f.version,
      savedAt: typeof f.savedAt === 'string' ? f.savedAt : '',
      works: f.works,
      diaries: f.diaries,
      fonts: Array.isArray(f.fonts) ? f.fonts : [],
      images: Array.isArray(f.images) ? f.images : [],
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
 * - 글꼴·이미지: 같은 id·같은 파일 이름이 있으면 그것을 쓴다. id만 겹치면 새 id.
 * - 작업: 언제나 새로 더한다. id가 겹치면 새 id. 폴더는 받는 쪽에 없으므로 폴더 밖으로.
 */
export function planImport(
  local: Pick<SyncSnapshot, 'works' | 'diaries' | 'fonts' | 'images'>,
  file: RingsFile,
  random: () => number = Math.random,
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
  const taken = (kind: SyncKind) =>
    new Set(
      (kind === 'work' ? local.works : kind === 'diary' ? local.diaries : kind === 'font' ? local.fonts : local.images).map((x) => x.id),
    );
  const fresh = (kind: SyncKind, id: string) => {
    const used = taken(kind);
    let next = freshKey(id, random);
    while (used.has(next)) next = freshKey(id, random);
    return next;
  };

  // 다이어리 — 같은 종이면 받는 쪽 것으로 갈아 끼운다.
  const reused = new Set<string>();
  for (const d of file.diaries) {
    const same = local.diaries.find((l) => samePaper(l, d));
    if (same) {
      s = rekeySnapshot(s, 'diary', d.id, same.id);
      reused.add(same.id);
    } else if (taken('diary').has(d.id)) s = rekeySnapshot(s, 'diary', d.id, fresh('diary', d.id));
  }

  // 글꼴·이미지 — 같은 것이면 그대로 쓰고, id만 겹치면 새 id. 파일 바이트는 따라간다.
  const fontData = new Map(file.fonts.map((f) => [f.info.id, f.data]));
  const imageData = new Map(file.images.map((i) => [i.info.id, i]));
  const keepFonts: FileFont[] = [];
  for (const f of file.fonts) {
    const mine = local.fonts.find((l) => l.id === f.info.id);
    if (mine && mine.name === f.info.name) continue;
    const id = mine ? fresh('font', f.info.id) : f.info.id;
    if (id !== f.info.id) s = rekeySnapshot(s, 'font', f.info.id, id);
    keepFonts.push({ info: { ...f.info, id }, data: fontData.get(f.info.id)! });
  }
  const keepImages: FileImage[] = [];
  for (const i of file.images) {
    const mine = local.images.find((l) => l.id === i.info.id);
    if (mine && mine.name === i.info.name) continue;
    const id = mine ? fresh('image', i.info.id) : i.info.id;
    if (id !== i.info.id) s = rekeySnapshot(s, 'image', i.info.id, id);
    const src = imageData.get(i.info.id)!;
    keepImages.push({ info: { ...i.info, id }, kind: src.kind, data: src.data });
  }

  // 작업 — 덮어쓰지 않는다.
  for (const w of file.works) {
    if (taken('work').has(w.id)) s = rekeySnapshot(s, 'work', w.id, fresh('work', w.id));
  }

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
