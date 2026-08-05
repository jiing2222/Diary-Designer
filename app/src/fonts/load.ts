import { DEFAULT_FONT_URL } from '../core/style';

/**
 * 속지 글꼴 불러오기.
 *
 * 화면은 CSS의 @font-face가 알아서 가져오지만, PDF에 심으려면 파일 자체가 필요하다.
 * **화면과 PDF가 같은 파일을 쓴다** — 다른 글꼴로 보여주면 글자 폭이 달라져서
 * 화면에서 칸에 맞춰놓은 것이 인쇄물에서 넘친다.
 *
 * 2.7MB짜리라 한 번 받아서 들고 있는다.
 */
let cached: Promise<ArrayBuffer> | null = null;

export function loadBodyFont(): Promise<ArrayBuffer> {
  cached ??= fetch(DEFAULT_FONT_URL).then((r) => {
    if (!r.ok) throw new Error(`글꼴을 불러오지 못했습니다 (${r.status})`);
    return r.arrayBuffer();
  });
  return cached;
}
