/**
 * 양식마다 따로 갖는 색상판.
 *
 * 메인색 1개 + 서브색 여러 개(개수 제한 없음)를 양식에 저장해두고, 색을 고를
 * 때마다 다시 16진 코드를 치지 않고 스와치를 눌러 재사용한다. `Template.dotGrid`와
 * 같은 자리의 값이다 — 양식 하나가 자기 색상판을 갖는다.
 *
 * 회색 5단계(아주 연하게~검정)는 여기 들어가지 않는다. 모든 양식이 공유하는
 * 고정값이라 ui/StyleBar.tsx에 상수로 둔다.
 */
export interface ColorPalette {
  /** 메인색. 아직 정하지 않았으면 null. */
  main: string | null;
  /** 서브색. 사용자가 + 를 눌러 하나씩 늘려간다. */
  subs: string[];
}

export const DEFAULT_PALETTE: ColorPalette = { main: null, subs: [] };
