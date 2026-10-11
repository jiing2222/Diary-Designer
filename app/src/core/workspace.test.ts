import { describe, expect, it } from 'vitest';
import { closeTab, emptyTabs, keepExisting, leastRecent, LIBRARY_TAB, MAX_TABS, openTab, activate, type Tabs } from './workspace';

function open(tabs: Tabs, id: string): Tabs {
  const r = openTab(tabs, id);
  if ('full' in r) throw new Error('full');
  return r.tabs;
}

describe('탭', () => {
  it('처음엔 Library만', () => {
    expect(emptyTabs()).toMatchObject({ open: [], active: LIBRARY_TAB });
  });

  it('열면 그 탭으로, 이미 열려 있으면 다시 열지 않는다', () => {
    let t = open(emptyTabs(), 'a');
    t = open(t, 'b');
    t = open(t, 'a');
    expect(t.open).toEqual(['a', 'b']);
    expect(t.active).toBe('a');
  });

  it(`${MAX_TABS}개가 차면 열지 않고 가장 오래 안 본 탭을 알려준다`, () => {
    let t = emptyTabs();
    for (let i = 0; i < MAX_TABS; i++) t = open(t, `w${i}`);
    t = activate(t, 'w0'); // w0을 다시 봤으니 가장 오래 안 본 건 w1
    expect(openTab(t, 'new')).toEqual({ full: 'w1' });
  });

  it('지금 보는 탭은 닫을 후보가 아니다', () => {
    const t = open(emptyTabs(), 'a');
    expect(leastRecent(t)).toBeNull();
  });

  it('보던 탭을 닫으면 오른쪽, 없으면 왼쪽, 없으면 Library', () => {
    let t = open(open(open(emptyTabs(), 'a'), 'b'), 'c');
    t = activate(t, 'b');
    t = closeTab(t, 'b');
    expect(t.active).toBe('c');
    t = closeTab(t, 'c');
    expect(t.active).toBe('a');
    t = closeTab(t, 'a');
    expect(t.active).toBe(LIBRARY_TAB);
  });

  it('다른 탭을 닫으면 보던 탭 그대로', () => {
    let t = open(open(emptyTabs(), 'a'), 'b');
    t = closeTab(t, 'a');
    expect(t).toMatchObject({ open: ['b'], active: 'b' });
  });

  it('없어진 작업은 탭에서 뺀다', () => {
    const t = keepExisting(open(open(emptyTabs(), 'a'), 'b'), (id) => id === 'a');
    expect(t.open).toEqual(['a']);
    expect(t.active).toBe('a');
  });
});
