import { BOLD_FONT_URL, DEFAULT_FONT_URL } from '../core/style';

/**
 * 속지 글꼴 불러오기.
 *
 * 화면은 CSS의 @font-face가 알아서 가져오지만, PDF에 심으려면 파일 자체가 필요하다.
 * **화면과 PDF가 같은 파일을 쓴다** — 다른 글꼴로 보여주면 글자 폭이 달라져서
 * 화면에서 칸에 맞춰놓은 것이 인쇄물에서 넘친다.
 *
 * 굵기마다 파일이 따로고 하나에 2.7MB다. 한 번 받으면 들고 있고, **필요할 때만**
 * 받는다 — 굵은 글자가 없는 양식을 뽑으면서 Bold를 내려받을 이유가 없다.
 */
const cache = new Map<string, Promise<ArrayBuffer>>();

function load(url: string): Promise<ArrayBuffer> {
  let hit = cache.get(url);
  if (!hit) {
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`글꼴을 불러오지 못했습니다 (${r.status})`);
      return r.arrayBuffer();
    });
    cache.set(url, hit);
  }
  return hit;
}

export function loadBodyFont(): Promise<ArrayBuffer> {
  return load(DEFAULT_FONT_URL);
}

export function loadBoldFont(): Promise<ArrayBuffer> {
  return load(BOLD_FONT_URL);
}
