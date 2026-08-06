/**
 * 사용자가 등록한 글꼴.
 *
 * `.ttf`/`.otf` 파일을 받아 **화면과 PDF 양쪽에 쓸 수 있게** 들고 있는다.
 * 화면은 FontFace로 브라우저에 심고, PDF는 파일 바이트를 그대로 넘긴다.
 * 두 뷰가 같은 파일을 봐야 글자 폭이 어긋나지 않는다.
 *
 * **이번 세션에만 유효하다.** 새로고침하면 사라지고, 그 글꼴을 쓰던 글자는
 * 기본 글꼴로 되돌아간다. 양식 저장(5단계)이 생기기 전까지는 어쩔 수 없다 —
 * 2.7MB짜리 파일을 양식 JSON에 넣을 수는 없다. 저장 방식은 그때 정한다.
 *
 * 바이트는 store가 아니라 여기에 둔다. 상태에 수 MB짜리 버퍼가 들어가면
 * 구독하는 컴포넌트마다 그것을 들여다보게 된다. store에는 목록만 둔다.
 */

import { DEFAULT_FONT_FAMILY } from '../core/style';

/** 브라우저가 받아주는 글꼴 파일. 이 밖의 확장자는 열어봐야 실패한다. */
const ACCEPTED = ['.ttf', '.otf', '.woff', '.woff2'];
export const FONT_ACCEPT = ACCEPTED.join(',');

export interface UserFont {
  id: string;
  /** 목록에 보일 이름. 파일 이름에서 확장자만 뗀 것이다. */
  name: string;
  /**
   * CSS에 심을 이름.
   *
   * 파일 이름을 그대로 쓰지 않는다. 같은 이름을 두 번 등록하거나 파일 이름에
   * 따옴표가 들어가면 CSS가 깨진다. id에서 만든 이름이라 부딪힐 일이 없다.
   */
  family: string;
}

const bytes = new Map<string, ArrayBuffer>();
let counter = 0;

/**
 * 글꼴 파일 하나를 등록한다.
 *
 * 화면에 심는 것까지 마치고 돌려준다. 심기에 실패하면(글꼴 파일이 아니거나
 * 깨졌으면) 던진다 — 목록에 넣어놓고 나중에 안 그려지는 것보다 낫다.
 */
export async function registerFont(file: File, reuseId?: string): Promise<UserFont> {
  const name = file.name.replace(/\.[^.]+$/, '');
  if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    throw new Error(`글꼴 파일이 아닙니다 (${ACCEPTED.join(', ')}만 됩니다)`);
  }

  const buffer = await file.arrayBuffer();
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
  document.fonts.add(face);

  bytes.set(id, buffer);
  return { id, name, family };
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
