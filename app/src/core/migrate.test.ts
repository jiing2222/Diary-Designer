import { describe, expect, it } from 'vitest';
import { migrateTemplates } from './migrate';
import { insertFromPreset, newTemplate, type Template } from './template';
import { initHistory } from './history';
import { expandWork, type DatedItem, type PageItem } from './work';
import type { DiaryObject, TextObject } from './objects';

const NOW = '2026-10-11T00:00:00.000Z';
const today = { year: 2026, month: 10, day: 11 };

const day: TextObject = {
  id: 't1',
  type: 'text',
  x: 0,
  y: 0,
  width: 10,
  height: 5,
  text: '',
  field: { offset: 0, format: 'M/D' },
};
const box: DiaryObject = { id: 'sh1', type: 'shape', x: 0, y: 0, width: 5, height: 5, color: '#8ea8c6' };

function tpl(over: Partial<Template> = {}): Template {
  return { ...newTemplate('양식', insertFromPreset('M6')), objects: initHistory([day, box]), ...over };
}

describe('migrateTemplates', () => {
  it('일반 양식은 작업 하나, 페이지 하나, 단면', () => {
    const { works } = migrateTemplates([tpl()], NOW);
    expect(works).toHaveLength(1);
    expect(works[0].items).toHaveLength(1);
    expect(works[0].duplex).toBe(false);
  });

  it('뒷면이 있으면 앞·뒤 두 페이지, 양면', () => {
    const { works } = migrateTemplates([tpl({ back: { objects: initHistory([box]) } })], NOW);
    expect(works[0].items).toHaveLength(2);
    expect(works[0].duplex).toBe(true);
  });

  it('반복 양식 N장은 같은 페이지 N장, 객체 id는 서로 다르다', () => {
    const { works } = migrateTemplates([tpl({ repeat: { mode: 'repeat', count: 3 } })], NOW);
    const pages = works[0].items as PageItem[];
    expect(pages).toHaveLength(3);
    expect(new Set(pages.map((p) => p.face.objects[0].id)).size).toBe(3);
  });

  it('같은 종이끼리 다이어리 하나로 묶는다', () => {
    const { diaries, works } = migrateTemplates([tpl(), tpl(), tpl({ insert: insertFromPreset('A5') })], NOW);
    expect(diaries).toHaveLength(2);
    expect(works[0].diaryId).toBe(works[1].diaryId);
    expect(works[2].diaryId).not.toBe(works[0].diaryId);
    expect(diaries[0].color).not.toBe(diaries[1].color);
  });

  it('다이어리 이름은 규격 이름', () => {
    const { diaries } = migrateTemplates([tpl()], NOW);
    expect(diaries[0].name).toBe('M6 (미니6)');
    expect(diaries[0].presetId).toBe('M6');
  });

  it('노트는 옮기지 않고 이름을 알려준다', () => {
    const { works, skippedNotebooks } = migrateTemplates([tpl(), { ...tpl(), kind: 'notebook', name: '노트1' }], NOW);
    expect(works).toHaveLength(1);
    expect(skippedNotebooks).toEqual(['노트1']);
  });

  it('메인·서브 색은 POINT A·B, 같은 색 객체에는 이름표', () => {
    const { works } = migrateTemplates([tpl({ palette: { main: '#8ea8c6', subs: ['#c9a27a'] } })], NOW);
    const w = works[0];
    expect(w.palette.points).toEqual([
      { key: 'A', color: '#8ea8c6' },
      { key: 'B', color: '#c9a27a' },
    ]);
    const objs = (w.items[0] as PageItem).face.objects;
    expect(objs.find((o) => o.id === 'sh1')).toMatchObject({ color: '@A' });
  });

  describe('날짜 세트 양식', () => {
    const dataset = { kind: 'date' as const, perPage: 1, start: '2026-10-01', end: '2026-10-05', step: 'day' as const };

    it('날짜 묶음 하나로, 쪽마다 실제 날짜', () => {
      const { works } = migrateTemplates([tpl({ repeat: { mode: 'dataset', dataset } })], NOW);
      expect(works[0].items[0].kind).toBe('dated');
      const faces = expandWork(works[0], today);
      expect(faces.map((f) => (f.objects.find((o) => o.id === 't1') as TextObject).text)).toEqual([
        '10/1',
        '10/2',
        '10/3',
        '10/4',
        '10/5',
      ]);
    });

    it('인쇄하기에서 고친 쪽은 그 날짜의 개별 수정이 되고, 펼치면 고친 결과와 같다', () => {
      // 옛 앱에서 3쪽(10/3)을 손봐 글자색을 바꾸고 상자를 지웠다.
      const edited: DiaryObject[] = [{ ...day, field: undefined, text: '10/3', color: '#ff0000' }];
      delete (edited[0] as TextObject).field;
      const { works } = migrateTemplates(
        [tpl({ repeat: { mode: 'dataset', dataset }, pageOverrides: { 2: edited } })],
        NOW,
      );
      const item = works[0].items[0] as DatedItem;
      expect(Object.keys(item.overrides)).toEqual(['2026-10-03/0']);
      const faces = expandWork(works[0], today);
      expect(faces[2].objects).toEqual(edited);
      // 다른 쪽은 그대로
      expect(faces[1].objects).toHaveLength(2);
    });

    it('고친 쪽의 색도 팔레트와 같으면 이름표', () => {
      const edited: DiaryObject[] = [{ ...box, color: '#c9a27a' }];
      const { works } = migrateTemplates(
        [
          tpl({
            repeat: { mode: 'dataset', dataset },
            palette: { main: '#8ea8c6', subs: ['#c9a27a'] },
            pageOverrides: { 0: edited },
          }),
        ],
        NOW,
      );
      const item = works[0].items[0] as DatedItem;
      expect(item.overrides['2026-10-01/0'].props.sh1).toEqual({ color: '@B' });
    });
  });
});
