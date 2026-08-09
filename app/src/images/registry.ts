/**
 * 사용자가 등록한 이미지.
 *
 * `.png`/`.jpg` 파일을 받아 **화면과 PDF 양쪽에 쓸 수 있게** 들고 있는다.
 * 화면은 data URL로 `<image>`에 바로 넣고, PDF는 파일 바이트를 그대로
 * `embedPng`/`embedJpg`에 넘긴다. 두 뷰가 같은 파일을 봐야 어긋나지 않는다.
 *
 * **이번 세션에만 유효하다.** 새로고침하면 사라지고, 그 이미지를 쓰던
 * 오브젝트는 자리만 남긴 채 빈 채로 보인다. fonts/registry와 같은 이유다 —
 * 남의 이미지 파일을 저장 파일에 실어 옮기는 것은 라이선스상으로도 애매하고,
 * 파일 하나하나가 커서 프로젝트 파일이 그만큼 무거워진다.
 */

const ACCEPTED = ['.png', '.jpg', '.jpeg'];
export const IMAGE_ACCEPT = ACCEPTED.join(',');

export type ImageKind = 'png' | 'jpg';

export interface UserImage {
  id: string;
  /** 목록에 보일 이름. 파일 이름에서 확장자만 뗀 것이다. */
  name: string;
  /** 화면에 바로 쓸 수 있는 data URL. 저장 파일에서 이름만 살아 돌아온 경우 빈 문자열이다. */
  url: string;
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

/**
 * 이미지 파일 하나를 등록한다.
 *
 * 화면에 바로 쓸 data URL까지 만들어 돌려준다. 이미지 파일이 아니면 던진다 —
 * 목록에 넣어놓고 나중에 안 그려지는 것보다 낫다.
 */
export async function registerImage(file: File, reuseId?: string): Promise<UserImage> {
  const name = file.name.replace(/\.[^.]+$/, '');
  const kind = kindOf(file.name);
  if (!kind) {
    throw new Error(`이미지 파일이 아닙니다 (${ACCEPTED.join(', ')}만 됩니다)`);
  }

  const buffer = await file.arrayBuffer();
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다'));
    reader.readAsDataURL(file);
  });

  // 저장 파일을 열면 이미지 이름만 남아 있다. 같은 이름의 파일을 다시
  // 등록하면 그때의 id를 그대로 물려받아 그 이미지를 쓰던 오브젝트가 되살아난다.
  let id = reuseId;
  if (!id) {
    counter += 1;
    id = `img${counter}`;
  }

  bytes.set(id, buffer);
  kinds.set(id, kind);
  return { id, name, url };
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
