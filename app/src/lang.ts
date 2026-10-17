import { useSyncExternalStore } from 'react';
import { currentUser, onAuthChange } from './cloud/client';

/**
 * 앱의 언어 — 미국 출시라 기본은 영어, **개발자 계정이면 한국어**(2026-10-17 사용자 결정: 개발하는 사람은
 * 한국어로 본다). 화면 글자와 새로 만드는 객체의 기본 언어(달력 요일·제목)가 모두 여기를 본다.
 *
 * 언어는 한 번 정해 두고 로그인 상태가 바뀔 때만 다시 정한다. 매번 계정을 물으면 t() 한 번마다 로그인
 * 토큰을 풀어 보게 되고(화면 한 번 그리는 데 수백 번), 토큰이 저절로 만료될 때 알림 없이 말이 바뀌어
 * 한 화면에 두 말이 섞인다.
 */
export type Lang = 'ko' | 'en';

let current: Lang | null = null;
const listeners = new Set<() => void>();

const langOf = (): Lang => (currentUser()?.developer ? 'ko' : 'en');

export function appLang(): Lang {
  if (current === null) {
    current = langOf();
    // 처음 물을 때 듣기 시작한다 — 모듈을 읽는 순간에는 cloud/client가 아직 준비되지 않았을 수 있다(서로 import한다).
    onAuthChange(() => {
      const next = langOf();
      if (next === current) return;
      current = next;
      listeners.forEach((l) => l());
    });
  }
  return current;
}

/**
 * 화면 글자 — 한국어와 영어를 **그 자리에 나란히** 쓴다(따로 번역 파일을 두지 않는다: 문구를 고칠 때 두 말을
 * 함께 보고, 빠진 번역이 생길 수 없다). 언어가 바뀌면 App이 `useLang`으로 통째로 다시 그린다.
 */
export function t(ko: string, en: string): string {
  return appLang() === 'ko' ? ko : en;
}

function subscribe(onChange: () => void): () => void {
  appLang();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** 지금 언어. 로그인·로그아웃(다른 탭 포함)하면 다시 그린다 — App 맨 위에서 한 번 부른다. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, appLang);
}
