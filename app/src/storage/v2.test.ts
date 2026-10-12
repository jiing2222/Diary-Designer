import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateSnapshot, v2Get, v2Put } from './v2';
import { toProject } from '../core/project';
import { insertFromPreset, newTemplate } from '../core/template';
import { initHistory } from '../core/history';
import { newId } from '../core/objects';

const NOW = '2026-10-11T00:00:00.000Z';
afterEach(() => vi.unstubAllGlobals());

describe('저장소 실패는 빈 데이터·저장 성공과 구분한다', () => {
  it('저장소를 열지 못하면 읽기·쓰기 모두 실패를 알린다', async () => {
    const error = new Error('저장소를 사용할 수 없음');
    vi.stubGlobal('indexedDB', { open: () => {
      const request = { error, onerror: () => {} };
      queueMicrotask(() => request.onerror());
      return request;
    } });
    await expect(v2Get('works', 'w1')).rejects.toBe(error);
    await expect(v2Put('works', 'w1', {})).rejects.toBe(error);
  });
});

describe('migrateSnapshot — 옛 자동 저장 JSON을 새 구조로', () => {
  it('옛 자동 저장을 작업·다이어리로', () => {
    const project = toProject({
      templates: [newTemplate('위클리', insertFromPreset('M6')), newTemplate('메모', insertFromPreset('M6'))],
      print: {},
      fonts: [],
      images: [],
    });
    const out = migrateSnapshot(JSON.stringify(project), NOW);
    expect(out?.works.map((w) => w.name)).toEqual(['위클리', '메모']);
    expect(out?.diaries).toHaveLength(1);
  });

  it('글꼴·이미지의 id와 이름을 함께 넘긴다 — 다시 열 때 같은 id를 돌려주려고', () => {
    // toProject는 쓰는 글꼴만 담으므로, 자동 저장에 담겨 있던 모양을 직접 만든다.
    const project = {
      ...toProject({ templates: [newTemplate('a', insertFromPreset('M6'))], print: {}, fonts: [] }),
      fonts: [{ id: 'f3', name: '나눔손글씨' }],
      images: [{ id: 'img2', name: '고양이' }],
    };
    const out = migrateSnapshot(JSON.stringify(project), NOW);
    expect(out?.fonts).toEqual([{ id: 'f3', name: '나눔손글씨' }]);
    expect(out?.images).toEqual([{ id: 'img2', name: '고양이' }]);
  });

  it('반복 양식을 복사하며 매기는 새 id가 다른 양식의 객체와 겹치지 않는다', () => {
    // 카운터가 지금 몇인지 보고, 다음에 매겨질 id들을 옛 파일에 미리 넣어 둔다 —
    // 카운터를 올리지 않으면 복사본이 바로 이 id들을 받아 겹친다.
    const n = Number(newId('probe').replace('probe', ''));
    const line = (k: number) => ({ id: `l${n + k}`, type: 'line' as const, x1: 0, y1: 0, x2: 1, y2: 1 });
    const a = {
      ...newTemplate('a', insertFromPreset('M6')),
      objects: initHistory(Array.from({ length: 20 }, (_, k) => line(k + 2))),
    };
    const b = {
      ...newTemplate('b', insertFromPreset('M6')),
      objects: initHistory([line(1)]),
      repeat: { mode: 'repeat' as const, count: 3 },
    };
    const project = toProject({ templates: [b, a], print: {}, fonts: [] });
    const out = migrateSnapshot(JSON.stringify(project), NOW)!;
    const ids = out.works.flatMap((w) => w.items.flatMap((i) => (i.kind === 'page' ? i.face.objects.map((o) => o.id) : [])));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('없거나 읽을 수 없으면 null', () => {
    expect(migrateSnapshot(null, NOW)).toBeNull();
    expect(migrateSnapshot('not json', NOW)).toBeNull();
    expect(migrateSnapshot(JSON.stringify({ version: 999, templates: [] }), NOW)).toBeNull();
  });
});
