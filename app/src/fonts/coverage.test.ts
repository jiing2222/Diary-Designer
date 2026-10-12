/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 등록소는 브라우저 기능(FontFace)을 써서 여기서는 파일 바이트만 흉내 낸다 — 처음엔 없다가 나중에 생긴다.
const store = new Map<string, ArrayBuffer>();
vi.mock('./registry', () => ({ fontBytes: (id: string) => store.get(id) }));
vi.mock('./load', () => ({ loadBodyFont: async () => new ArrayBuffer(0) }));

import { cachedCoverageFont, ensureCoverageFont } from './coverage';

describe('글꼴 해석(커버리지·측정용)', () => {
  it('파일이 아직 없을 때 실패한 것을 기억하지 않는다 — 새로고침 뒤 늦게 등록된 글꼴도 읽힌다', async () => {
    expect(await ensureCoverageFont('f1')).toBeUndefined();
    const real = readFileSync(fileURLToPath(new URL('../../public/fonts/Pretendard-Regular.ttf', import.meta.url)));
    store.set('f1', real.buffer.slice(real.byteOffset, real.byteOffset + real.byteLength));
    expect(await ensureCoverageFont('f1')).toBeDefined();
    expect(cachedCoverageFont('f1')).toBeDefined();
  });
});
