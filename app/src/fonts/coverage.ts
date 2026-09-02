/**
 * 화면에서 "이 폰트로 이 글자가 실제로 그려지는가"를 보려고, 폰트 파일을
 * fontkit으로 미리 파싱해 캐시해둔다.
 *
 * PDF 쪽(pdf/export.ts)은 이미 폰트 파일을 손에 쥐고 있어 그 자리에서 바로
 * fontkit.create를 부르면 되지만, 화면은 기본 글꼴(Pretendard) 파일 자체를
 * 아직 안 받아왔을 수 있다 — `fonts/load.ts`(PDF에 심을 때 쓰던 것)를 그대로
 * 재사용해 받는다. 같은 파일을 두 번 내려받지 않는다(load.ts가 이미 캐싱).
 *
 * 등록 글꼴은 `fonts/registry.ts`의 `fontBytes`가 이미 메모리에 들고 있다.
 */
import fontkit, { type Font } from '@pdf-lib/fontkit';
import { loadBodyFont } from './load';
import { fontBytes } from './registry';

/** 기본 글꼴(Pretendard)을 가리키는 키. 등록 글꼴 id('f1' 등)와 안 겹친다. */
const DEFAULT_KEY = 'default';

const cache = new Map<string, Font>();
const loading = new Map<string, Promise<Font | undefined>>();

async function parse(key: string): Promise<Font | undefined> {
  const bytes = key === DEFAULT_KEY ? await loadBodyFont() : fontBytes(key);
  if (!bytes) return undefined;
  const font = fontkit.create(new Uint8Array(bytes));
  cache.set(key, font);
  return font;
}

/** 이미 파싱해둔 것이 있으면 바로 돌려준다. 없으면 undefined — 아직 못 그린다는 뜻이다. */
export function cachedCoverageFont(fontId: string | undefined): Font | undefined {
  return cache.get(fontId ?? DEFAULT_KEY);
}

/**
 * 파싱을 시작한다(이미 하는 중이면 그 약속을 그대로 돌려준다). 끝나면
 * `cachedCoverageFont`로 다시 물어보면 된다 — 화면은 이걸 부른 뒤 다시
 * 그리는 것으로 반영한다(ui/InsertView.tsx의 TextLayer).
 */
export function ensureCoverageFont(fontId: string | undefined): Promise<Font | undefined> {
  const key = fontId ?? DEFAULT_KEY;
  let hit = loading.get(key);
  if (!hit && !cache.has(key)) {
    hit = parse(key);
    loading.set(key, hit);
  }
  return hit ?? Promise.resolve(cache.get(key));
}
