import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';

const s = () => useStore.getState();
const initial = useStore.getState();

beforeEach(() => useStore.setState(initial, true));

describe('설정 저장소', () => {
  it('용지 기본값은 A4다', () => {
    expect(s().paper.presetId).toBe('A4');
    expect(s().paper.width).toBe(210);
    expect(s().paper.height).toBe(297);
  });

  it('크기를 고치면 사용자 지정이 된다', () => {
    s().patchPaper({ width: 200 });
    expect(s().paper.presetId).toBe('custom');
  });

  it('크기가 아닌 것을 고쳐도 프리셋을 잃지 않는다', () => {
    // 여백이나 방향을 건드렸다고 무엇을 고르고 있었는지 잊으면 안 된다
    s().patchPaper({ printMargin: 5 });
    expect(s().paper.presetId).toBe('A4');

    s().patchPaper({ landscape: true });
    expect(s().paper.presetId).toBe('A4');
  });

  it('같은 값을 다시 넣는 것은 고친 것이 아니다', () => {
    // 숫자 칸을 지웠다 같은 값으로 되돌려도 프리셋이 풀리면 안 된다
    s().patchPaper({ width: 210 });
    expect(s().paper.presetId).toBe('A4');
  });

  it('속지도 같은 규칙을 따른다', () => {
    expect(s().insert.presetId).toBe('M6');

    s().patchInsert({ height: 127 }); // 브랜드마다 M6 세로가 다르다
    expect(s().insert.presetId).toBe('custom');
  });

  it('인쇄 불가 영역은 배치에 관여하지 않는다', () => {
    // 화면 안내일 뿐이다. 배치를 미는 것은 paper.printMargin 쪽이다.
    expect(s().unprintable).toEqual({ show: true, width: 3 });
    expect(s().paper.printMargin).toBe(0);
  });
});
