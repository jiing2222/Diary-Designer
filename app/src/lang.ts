import { useSyncExternalStore } from 'react';
import { currentUser, onAuthChange } from './cloud/client';

/**
 * 앱의 언어 — 미국 출시라 기본은 영어, **개발자 계정이면 한국어**(2026-10-17 사용자 결정: 개발하는 사람은
 * 한국어로 본다). 화면 글자와 새로 만드는 객체의 기본 언어(달력 요일·제목)가 모두 여기를 본다.
 */
export type Lang = 'ko' | 'en';

export function appLang(): Lang {
  return currentUser()?.developer ? 'ko' : 'en';
}

/**
 * 화면 글자 — 한국어와 영어를 **그 자리에 나란히** 쓴다(따로 번역 파일을 두지 않는다: 문구를 고칠 때 두 말을
 * 함께 보고, 빠진 번역이 생길 수 없다). 언어가 바뀌면 App이 `useLang`으로 통째로 다시 그린다.
 */
export function t(ko: string, en: string): string {
  return appLang() === 'ko' ? ko : en;
}

/** 지금 언어. 로그인·로그아웃(다른 탭 포함)하면 다시 그린다 — App 맨 위에서 한 번 부른다. */
export function useLang(): Lang {
  return useSyncExternalStore((onChange) => onAuthChange(() => onChange()), appLang);
}
