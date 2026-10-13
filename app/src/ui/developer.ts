import { useEffect, useState } from 'react';
import { currentUser, onAuthChange } from '../cloud/client';
import type { LibrarySection } from './Library';

/**
 * 개발자 계정 전용 도구. 관리자 화면에서 개발자 표시를 켠 계정으로 로그인했을 때만 보인다
 * (server/pb_migrations/3_developer.js, cloud/client의 `developer`).
 */

/** Library 레일에 붙는 개발자 도구 — 핀터레스트 홍보 이미지 만들기(ui/PinStudio). */
export const PINS_RAIL_ITEM: { id: LibrarySection; label: string; icon: string } = {
  id: 'pins',
  label: 'Pins',
  icon: '📌',
};

/** 지금 로그인한 계정이 개발자인가. 로그인·로그아웃·앱을 열 때의 계정 확인에 따라 바뀐다. */
export function useIsDeveloper(): boolean {
  const [dev, setDev] = useState(() => currentUser()?.developer === true);
  useEffect(() => onAuthChange((u) => setDev(u?.developer === true)), []);
  return dev;
}
