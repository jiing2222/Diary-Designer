import { describe, expect, it, vi } from 'vitest';

const user = vi.hoisted(() => ({ current: null as null | { developer: boolean } }));
vi.mock('./cloud/client', () => ({
  currentUser: () => user.current,
  onAuthChange: () => () => {},
}));

import { appLang, t } from './lang';

describe('앱 언어', () => {
  it('로그인 안 했거나 일반 계정이면 영어', () => {
    user.current = null;
    expect([appLang(), t('저장', 'Save')]).toEqual(['en', 'Save']);
    user.current = { developer: false };
    expect(t('저장', 'Save')).toBe('Save');
  });

  it('개발자 계정이면 한국어', () => {
    user.current = { developer: true };
    expect([appLang(), t('저장', 'Save')]).toEqual(['ko', '저장']);
  });
});
