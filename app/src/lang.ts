import { currentUser } from './cloud/client';

/**
 * 앱의 언어 — 미국 출시라 기본은 영어, **개발자 계정이면 한국어**(2026-10-17 사용자 결정: 개발하는 사람은
 * 한국어로 본다). 화면 글자(영어화 단계)와 새로 만드는 객체의 기본 언어(달력 요일·제목)가 모두 여기를 본다.
 */
export function appLang(): 'ko' | 'en' {
  return currentUser()?.developer ? 'ko' : 'en';
}
