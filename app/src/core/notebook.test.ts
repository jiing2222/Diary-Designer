import { describe, expect, it } from 'vitest';
import { notebookInsertSize } from './notebook';

describe('노트 양식 크기', () => {
  it('가로는 완성 페이지의 두 배, 세로는 그대로다', () => {
    expect(notebookInsertSize(70, 105)).toEqual({ width: 140, height: 105 });
  });
});
