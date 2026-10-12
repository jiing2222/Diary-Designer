import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 실제 PocketBase와의 선택 검사. 임시 로컬 DB 주소를 명시할 때만 실행한다. */
const verifyUrl = process.env.RINGS_AUTH_TEST_URL;
let email = '';
let password = '';
let created = false;
const saved = new Map<string, string>();

describe.skipIf(!verifyUrl)('실제 PocketBase 계정 연결', () => {
  beforeEach(() => {
    const host = new URL(verifyUrl!).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error('임시 로컬 서버에서만 검사하세요.');
    vi.resetModules(); vi.stubEnv('VITE_PB_URL', verifyUrl!);
    email = `rings-review-${crypto.randomUUID()}@example.test`;
    password = 'Rings-review-2026'; created = false; saved.clear();
    const localStorage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    };
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(async () => {
    try {
      if (created) {
        const c = await import('./client');
        await c.signIn(email, password);
        await c.deleteAccount(password);
      }
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

  it('가입·재시작 확인·잘못된 로그인·비밀번호 변경·탈퇴가 실제 서버에서 동작한다', async () => {
    let c = await import('./client');
    const user = await c.signUp(` ${email} `, password); created = true;
    expect(c.currentUser()).toEqual(user);
    vi.resetModules(); c = await import('./client');
    expect(c.currentUser()).toEqual(user);
    expect(await c.refreshSession()).toEqual(user);
    c.signOut();
    await expect(c.signIn(email, 'wrong-password')).rejects.toMatchObject({ status: 400 });
    expect(c.currentUser()).toBeNull();
    await c.signIn(email, password);
    await c.changePassword(password, 'Rings-review-changed');
    password = 'Rings-review-changed';
    expect(c.currentUser()).toEqual(user);
    expect(await c.refreshSession()).toEqual(user);
    await c.deleteAccount(password); created = false;
    expect(c.currentUser()).toBeNull();
    await expect(c.signIn(email, password)).rejects.toMatchObject({ status: 400 });
  });

  it('서버가 거부하는 토큰은 계정만 해제하고 로컬 자료를 보존한다', async () => {
    const c = await import('./client');
    const user = await c.signUp(email, password); created = true;
    const pb = c.authed()!.pb;
    const parts = pb.authStore.token.split('.');
    parts[2] = 'wrong-signature';
    pb.authStore.save(parts.join('.'), pb.authStore.record);
    saved.set('local-review-work', 'original');
    expect(c.currentUser()).toEqual(user);
    expect(await c.refreshSession()).toBeNull();
    expect(c.currentUser()).toBeNull();
    expect(saved.get('local-review-work')).toBe('original');
  });
});
