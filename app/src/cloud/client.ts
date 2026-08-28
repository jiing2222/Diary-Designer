/**
 * 클라우드 연결과 로그인.
 *
 * **서버는 있어도 되고 없어도 된다.** `VITE_PB_URL`을 정하지 않으면 이
 * 프로그램은 지금까지처럼 완전히 로컬로만 돌아간다 — 클라우드 관련 화면도
 * 아예 뜨지 않는다. 서버 없이 쓰는 사람(내 컴퓨터에서 혼자 쓰는 경우,
 * 정적 호스팅에만 올린 경우)이 여전히 제일 많을 것이기 때문이다.
 *
 * 그래서 이 파일 밖에서는 `pb`를 직접 만지지 않는다. 서버가 없을 때
 * `pb`가 `null`이라 부르는 쪽마다 검사를 흩뿌리게 되므로, 여기서 감싼
 * 함수만 내보낸다.
 *
 * 로그인 상태는 PocketBase SDK가 localStorage에 알아서 남긴다 —
 * 새로고침해도 다시 로그인하지 않는다.
 */

import PocketBase, { type RecordModel } from 'pocketbase';

/** 서버 주소. 빌드할 때 정한다(.env의 VITE_PB_URL). 비어 있으면 로컬 전용. */
const URL = (import.meta.env.VITE_PB_URL ?? '').trim();

/** 서버를 쓸 수 있는 빌드인지. 화면은 이 값으로 클라우드 UI를 보일지 정한다. */
export const cloudEnabled = URL.length > 0;

const pb = cloudEnabled ? new PocketBase(URL) : null;

export interface CloudUser {
  id: string;
  email: string;
}

function userOf(record: RecordModel | null): CloudUser | null {
  if (!record) return null;
  return { id: record.id, email: (record.email as string) ?? '' };
}

/** 지금 로그인한 사람. 안 했거나 서버가 없으면 `null`. */
export function currentUser(): CloudUser | null {
  if (!pb?.authStore.isValid) return null;
  return userOf(pb.authStore.record);
}

/**
 * 로그인 상태가 바뀔 때 알려준다. 반환값을 부르면 그만 듣는다.
 *
 * 토큰이 만료되거나 다른 탭에서 로그아웃하는 경우까지 함께 잡힌다 —
 * SDK가 localStorage를 지켜보기 때문이다.
 */
export function onAuthChange(listener: (user: CloudUser | null) => void): () => void {
  if (!pb) return () => {};
  return pb.authStore.onChange(() => listener(currentUser()));
}

export async function signIn(email: string, password: string): Promise<CloudUser> {
  if (!pb) throw new Error('서버가 설정되지 않았습니다.');
  const auth = await pb.collection('users').authWithPassword(email, password);
  return userOf(auth.record)!;
}

/**
 * 가입하고 곧바로 로그인까지 한다.
 *
 * 가입만 시키고 로그인 화면으로 되돌리면 방금 정한 비밀번호를 한 번 더
 * 치게 만든다 — 그럴 이유가 없다.
 */
export async function signUp(email: string, password: string): Promise<CloudUser> {
  if (!pb) throw new Error('서버가 설정되지 않았습니다.');
  await pb.collection('users').create({ email, password, passwordConfirm: password });
  return signIn(email, password);
}

export function signOut(): void {
  pb?.authStore.clear();
}

/**
 * 로그인한 사람만 쓸 수 있는 연결. 아니면 `null`.
 *
 * `cloud/projects`가 쓴다 — 여기서 한 번 걸러두면 그쪽은 "서버가 있나",
 * "로그인했나"를 따로 보지 않아도 된다.
 */
export function authed(): { pb: PocketBase; userId: string } | null {
  const user = currentUser();
  if (!pb || !user) return null;
  return { pb, userId: user.id };
}

/**
 * 사람이 읽을 수 있는 오류 문구.
 *
 * PocketBase가 내는 것은 상태 코드와 필드별 영어 메시지라 그대로 보여주면
 * 무엇을 해야 할지 알 수 없다. 실제로 자주 나오는 것만 골라 옮긴다.
 */
export function cloudErrorText(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 400) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (status === 403) return '권한이 없습니다. 다시 로그인해 보세요.';
  if (status === 404) return '서버에서 찾을 수 없습니다.';
  if (status === 0 || status === undefined) return '서버에 연결하지 못했습니다.';
  return '서버 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.';
}
