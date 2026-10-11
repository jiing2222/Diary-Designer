import { describe, expect, it } from 'vitest';
import { migrateSnapshot } from './v2';
import { toProject } from '../core/project';
import { insertFromPreset, newTemplate } from '../core/template';

const NOW = '2026-10-11T00:00:00.000Z';

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

  it('없거나 읽을 수 없으면 null', () => {
    expect(migrateSnapshot(null, NOW)).toBeNull();
    expect(migrateSnapshot('not json', NOW)).toBeNull();
    expect(migrateSnapshot(JSON.stringify({ version: 999, templates: [] }), NOW)).toBeNull();
  });
});
