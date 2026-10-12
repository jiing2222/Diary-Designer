import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();
const user = { id: 'account-a', email: 'a@example.test', collectionName: 'users' };
const token = (tag: string, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `test.${btoa(JSON.stringify({ exp, tag }))}.test`;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_PB_URL', 'http://localhost:8090');
  stored.clear();
  const localStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', { localStorage });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function savedLogin(exp?: number) {
  const savedToken = token('old', exp);
  stored.set('pocketbase_auth', JSON.stringify({ token: savedToken, record: user }));
  return savedToken;
}

describe('리뉴얼 계정 연결', () => {
  it('서버가 없으면 계정·연결 요청 없이 로컬로 쓴다', async () => {
    vi.stubEnv('VITE_PB_URL', '');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    expect(c.cloudEnabled).toBe(false);
    expect(c.currentUser()).toBeNull();
    expect(await c.refreshSession()).toBeNull();
    await expect(c.signIn(user.email, 'password')).rejects.toThrow('서버가 설정되지');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('저장된 계정을 확인하고 새 토큰으로 갱신한다', async () => {
    const old = savedLogin(); const next = token('next');
    const fetch = vi.fn(async () => reply({ token: next, record: user })); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    expect(c.currentUser()).toEqual({ id: user.id, email: user.email });
    expect(await c.refreshSession()).toEqual({ id: user.id, email: user.email });
    expect(fetch).toHaveBeenCalledWith('http://localhost:8090/api/collections/users/auth-refresh', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: old }),
    }));
    expect(JSON.parse(stored.get('pocketbase_auth')!).token).toBe(next);
  });

  it('만료된 토큰은 서버 요청 없이 비우며 작업 저장소는 건드리지 않는다', async () => {
    savedLogin(1); stored.set('my-local-work', 'original');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    expect(await c.refreshSession()).toBeNull();
    expect(c.currentUser()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(stored.get('my-local-work')).toBe('original');
  });

  it.each([401, 403])('서버가 계정을 거부하면(%s) 로그인만 해제한다', async (status) => {
    savedLogin(); stored.set('my-local-work', 'original');
    vi.stubGlobal('fetch', vi.fn(async () => reply({}, status)));
    const c = await import('./client');
    expect(await c.refreshSession()).toBeNull();
    expect(c.currentUser()).toBeNull();
    expect(stored.get('my-local-work')).toBe('original');
  });

  it('네트워크 실패를 탈퇴·로그아웃으로 취급하지 않는다', async () => {
    const old = savedLogin();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const c = await import('./client');
    await expect(c.refreshSession()).rejects.toMatchObject({ status: 0 });
    expect(c.currentUser()?.id).toBe(user.id);
    expect(JSON.parse(stored.get('pocketbase_auth')!).token).toBe(old);
  });

  it('동시에 시작한 확인은 한 요청을 공유한다', async () => {
    savedLogin();
    const fetch = vi.fn(async () => reply({ token: token('new'), record: user })); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    const a = c.refreshSession(); const b = c.refreshSession();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('확인 도중 로그아웃해도 늦은 응답이 다시 로그인시키지 않는다', async () => {
    savedLogin(); let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const c = await import('./client');
    const pending = c.refreshSession();
    c.signOut(); finish(reply({ token: token('late'), record: user }));
    expect(await pending).toBeNull();
    expect(c.currentUser()).toBeNull();
  });

  it.each([200, 401])('계정 전환 후 옛 확인 응답(%s)이 새 계정을 바꾸지 않는다', async (status) => {
    savedLogin(); let finish!: (response: Response) => void;
    const other = { ...user, id: 'account-b', email: 'b@example.test' };
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('auth-refresh')
      ? new Promise<Response>((resolve) => { finish = resolve; })
      : Promise.resolve(reply({ token: token('b'), record: other }))));
    const c = await import('./client');
    const pending = c.refreshSession();
    await c.signIn(other.email, 'password');
    finish(reply({ token: token('late'), record: user }, status));
    expect((await pending)?.id).toBe(other.id);
    expect(c.currentUser()?.id).toBe(other.id);
  });

  it('가입 후 바로 로그인하고 이메일 공백만 정리한다', async () => {
    const fetch = vi.fn(async (url: string, _options?: RequestInit) => reply(url.endsWith('auth-with-password')
      ? { token: token('new'), record: user } : user)); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    expect((await c.signUp(` ${user.email} `, ' password ')).id).toBe(user.id);
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toMatchObject({
      email: user.email, password: ' password ', passwordConfirm: ' password ',
    });
    expect(JSON.parse(String(fetch.mock.calls[1][1]!.body))).toMatchObject({ identity: user.email, password: ' password ' });
  });

  it('비밀번호 변경 뒤 새 비밀번호로 다시 인증한다', async () => {
    savedLogin();
    const fetch = vi.fn(async (url: string, _options?: RequestInit) => reply(url.endsWith('auth-with-password')
      ? { token: token('new'), record: user } : user)); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    await c.changePassword('old-password', 'new-password');
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toMatchObject({ oldPassword: 'old-password', password: 'new-password' });
    expect(JSON.parse(String(fetch.mock.calls[1][1]!.body))).toMatchObject({ identity: user.email, password: 'new-password' });
    expect(c.currentUser()?.id).toBe(user.id);
  });

  it('탈퇴는 비밀번호 확인에 실패하면 삭제 요청을 보내지 않는다', async () => {
    savedLogin();
    const fetch = vi.fn(async () => reply({}, 400)); vi.stubGlobal('fetch', fetch);
    const c = await import('./client');
    await expect(c.deleteAccount('wrong')).rejects.toMatchObject({ status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.currentUser()?.id).toBe(user.id);
  });

  it('로그아웃 상태 변경을 구독하고 구독 해제할 수 있다', async () => {
    savedLogin(); const c = await import('./client');
    const changed = vi.fn(); const stop = c.onAuthChange(changed);
    c.signOut(); expect(changed).toHaveBeenCalledWith(null);
    stop(); c.signOut(); expect(changed).toHaveBeenCalledTimes(1);
  });

  it('가입·계정 변경·연결 실패를 로그인 오류와 구분한다', async () => {
    const c = await import('./client');
    expect(c.cloudErrorText({ status: 400 }, 'signUp')).toContain('가입하지');
    expect(c.cloudErrorText({ status: 400 }, 'account')).toContain('변경하지');
    expect(c.cloudErrorText({ status: 400 })).toContain('맞지');
    expect(c.cloudErrorText({ status: 0 })).toContain('연결하지');
  });
});
