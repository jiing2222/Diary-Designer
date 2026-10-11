import { describe, expect, it } from 'vitest';
import { daysLeft, expiredTrash, isTrashed, removeFolderFrom, restoreWork, trashWork } from './library';
import { newWork } from './work';

const NOW = '2026-10-11T00:00:00.000Z';
const work = () => newWork({ name: 'w', diaryId: 'd', now: NOW });

describe('휴지통', () => {
  it('넣고 되살리기', () => {
    const t = trashWork(work(), NOW);
    expect(isTrashed(t)).toBe(true);
    expect(isTrashed(restoreWork(t))).toBe(false);
  });

  it('남은 날: 넣은 날은 30일, 3일 뒤 27일', () => {
    const t = trashWork(work(), NOW);
    expect(daysLeft(t, NOW)).toBe(30);
    expect(daysLeft(t, '2026-10-14T00:00:00.000Z')).toBe(27);
    expect(daysLeft(work(), NOW)).toBeNull();
  });

  it('30일이 지나면 지울 대상', () => {
    const t = trashWork(work(), NOW);
    expect(expiredTrash([t], '2026-11-09T23:00:00.000Z')).toEqual([]);
    expect(expiredTrash([t], '2026-11-10T00:00:00.000Z')).toEqual([t.id]);
  });
});

describe('폴더', () => {
  it('폴더를 지우면 작업은 폴더 밖으로', () => {
    const a = { ...work(), folderId: 'f1' };
    const b = { ...work(), folderId: 'f2' };
    const out = removeFolderFrom([a, b], 'f1');
    expect(out[0].folderId).toBeUndefined();
    expect(out[1].folderId).toBe('f2');
  });
});
