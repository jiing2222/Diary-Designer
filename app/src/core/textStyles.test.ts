import { describe, expect, it } from 'vitest';
import { applyToDraft, pickSavedStyle, stylePatchOf } from './textStyles';

describe('저장한 글자 스타일', () => {
  it('담는 것은 글꼴·크기·간격·색·B·I·U·S — 정렬·회전은 빼고, 기본값(없는 키)은 담지 않는다', () => {
    expect(pickSavedStyle({ size: 4, bold: true, align: 'center', rotate: 90, color: '@A', italic: undefined })).toEqual({
      size: 4,
      bold: true,
      color: '@A',
    });
  });

  it('쓸 때는 담는 키를 모두 준다 — 저장에 없는 것은 undefined라 지워져 기본으로', () => {
    const patch = stylePatchOf({ size: 4 });
    expect(patch.size).toBe(4);
    expect('bold' in patch && patch.bold === undefined).toBe(true);
    expect('align' in patch).toBe(false);
  });

  it('다음 글자 모양에 얹으면 담는 키는 통째로 바뀌고 정렬은 남는다', () => {
    expect(applyToDraft({ bold: true, align: 'right', size: 9 }, { size: 4, italic: true })).toEqual({
      align: 'right',
      size: 4,
      italic: true,
    });
  });
});
