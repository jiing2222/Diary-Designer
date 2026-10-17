import { useEffect, useRef } from 'react';
import { LIBRARY_TAB } from '../core/workspace';

/**
 * 앱 안의 이동을 브라우저 방문 기록에 남긴다(2026-10-15 사용자 요청).
 *
 * 앱은 주소가 하나뿐이라, 예전엔 Library → 작업으로 들어간 뒤 뒤로가기를 누르면 앱을 통째로 떠나
 * 그 전 사이트(구글 등)로 가 버렸다. 이제 화면이 바뀔 때마다 기록을 한 칸 더하고(`pushState`),
 * 뒤로·앞으로를 누르면 그 칸의 화면으로 되돌린다. 주소는 바꾸지 않는다.
 *
 * 기록하는 것은 ‘어디를 보고 있나’뿐이다 — 홈/Learn/탭, 고른 탭, Library 메뉴, Print를 열었는가.
 * 작업 내용이나 펼침면 위치는 넣지 않는다(그건 탭이 기억한다).
 */
export interface NavState {
  screen: 'home' | 'tabs' | 'learn';
  /** 고른 탭 — Library 탭이거나 작업 id. */
  tab: string;
  /** Library 안의 메뉴(Projects·Diaries…). */
  section: string;
  /** 작업 탭이 Print 화면인가. */
  printing: boolean;
}

const KEY = 'rings';

const keyOf = (n: NavState) => `${n.screen}|${n.tab}|${n.section}|${n.printing}`;

/**
 * 눈에 보이는 화면 — 이것이 바뀔 때만 기록을 한 칸 더한다. 홈에 있는 동안 고른 탭이 바뀌는 것(홈에서 새 작업을
 * 만드는 순간 등)은 화면이 같으므로 지금 칸만 고친다 — 안 그러면 뒤로가기를 한 번 더 눌러야 했다.
 */
const viewOf = (n: NavState) =>
  n.screen !== 'tabs' ? n.screen : n.tab === LIBRARY_TAB ? `library|${n.section}` : `${n.tab}|${n.printing}`;

/**
 * `nav`는 지금 화면, `apply`는 기록에서 꺼낸 화면으로 되돌리는 일. 앱이 자료를 다 읽은 뒤(`ready`)부터 기록한다 —
 * 그 전의 빈 화면을 기록에 남기지 않게.
 */
export function useNavHistory(ready: boolean, nav: NavState, apply: (n: NavState) => void): void {
  const last = useRef<string | null>(null);
  const lastView = useRef<string | null>(null);
  // 뒤로·앞으로로 되돌리는 중 — 그 결과는 새 칸이 아니라 지금 칸을 고친다(앞으로 가기 기록이 지워지지 않게).
  const restoring = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const key = keyOf(nav);

  useEffect(() => {
    if (!ready) return;
    const state = { [KEY]: nav };
    if (last.current === null) {
      // 처음 — 앱에 들어온 자리를 지금 칸에 적어 둔다. 여기서 더 뒤로 가면 원래대로 앱을 떠난다.
      history.replaceState(state, '');
    } else if (key === last.current) {
      restoring.current = false;
      return;
    } else if (restoring.current || viewOf(nav) === lastView.current) {
      // 되돌린 결과가 기록과 조금 다르면(그 사이 닫힌 탭 → Library), 또는 보이는 화면이 같으면 지금 칸만 고친다.
      history.replaceState(state, '');
      restoring.current = false;
    } else {
      history.pushState(state, '');
    }
    last.current = key;
    lastView.current = viewOf(nav);
    // nav는 key로 대신 본다 — 같은 화면이면 객체가 새로 만들어져도 기록하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const saved = (e.state as Record<string, NavState> | null)?.[KEY];
      if (!saved) return;
      restoring.current = true;
      last.current = keyOf(saved);
      lastView.current = viewOf(saved);
      applyRef.current(saved);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
