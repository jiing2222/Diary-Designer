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

  it('없거나 읽을 수 없으면 null', () => {
    expect(migrateSnapshot(null, NOW)).toBeNull();
    expect(migrateSnapshot('not json', NOW)).toBeNull();
    expect(migrateSnapshot(JSON.stringify({ version: 999, templates: [] }), NOW)).toBeNull();
  });
});
