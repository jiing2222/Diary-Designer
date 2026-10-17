import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: null as null | { developer: boolean },
  listeners: [] as (() => void)[],
}));
vi.mock('./cloud/client', () => ({
  currentUser: () => auth.user,
  onAuthChange: (l: () => void) => {
    auth.listeners.push(l);
    return () => {};
  },
}));

import { appLang, t } from './lang';

/** 로그인 상태가 바뀌었다고 알린다(SDK의 onChange). */
function signIn(user: null | { developer: boolean }) {
  auth.user = user;
  auth.listeners.forEach((l) => l());
}

describe('앱 언어', () => {
  it('로그인 안 했거나 일반 계정이면 영어', () => {
    expect([appLang(), t('저장', 'Save')]).toEqual(['en', 'Save']);
    signIn({ developer: false });
    expect(t('저장', 'Save')).toBe('Save');
  });

  it('개발자 계정이면 한국어, 로그아웃하면 영어', () => {
    signIn({ developer: true });
    expect([appLang(), t('저장', 'Save')]).toEqual(['ko', '저장']);
    signIn(null);
    expect(appLang()).toBe('en');
  });

  it('알림 없이 계정이 사라져도(토큰 만료) 다음 알림까지 말이 바뀌지 않는다', () => {
    signIn({ developer: true });
    auth.user = null;
    expect(appLang()).toBe('ko');
  });
});
