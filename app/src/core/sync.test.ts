import { describe, expect, it } from 'vitest';
import {
  applyOps,
  applyRemote,
  docKey,
  docsOf,
  freshKey,
  hashOf,
  planSync,
  rekeySnapshot,
  removeLocal,
  type RemoteDoc,
  type SyncSnapshot,
  type SyncState,
} from './sync';
import { newPage, newWork, type DatedItem, type Work } from './work';
import { emptyOverride } from './dated';
import type { DiaryObject } from './objects';

const w = (id: string, name = id): Work => ({ ...newWork({ name, diaryId: 'd1', now: '2026-10-13' }), id });
const remote = (kind: RemoteDoc['kind'], key: string, data: unknown, updated = 't1', deleted = false): RemoteDoc => ({
  id: `r-${key}`,
  kind,
  key,
  data,
  deleted,
  updated,
});
const synced = (key: string, data: unknown, updated = 't1'): SyncState => ({
  [key]: { remoteId: `r-${key.split(':')[1]}`, updated, hash: hashOf(data) },
});
const types = (actions: ReturnType<typeof planSync>) => actions.map((a) => `${a.type}:${a.key}`).sort();

describe('무엇을 주고받을지', () => {
  const a = w('w1');
  const k = docKey('work', 'w1');

  it('처음 기본 설정이 다르면 서버 것을 받고, 이 기기에만 두기로 하면 건너뛴다', () => {
    const local = new Map([['prefs:prefs', { defaultDiaryId: 'd2' }]]);
    const docs = [remote('prefs', 'prefs', { defaultDiaryId: 'd1' })];
    expect(types(planSync(local, docs, {}))).toEqual(['pull:prefs:prefs']);
    expect(planSync(local, docs, {}, new Set(['prefs:prefs']))).toEqual([]);
  });

  it('맞춘 적이 없으면 — 이 기기에만 있으면 올리고, 서버에만 있으면 받는다', () => {
    expect(types(planSync(new Map([[k, a]]), [], {}))).toEqual(['push:work:w1']);
    expect(types(planSync(new Map(), [remote('work', 'w1', a)], {}))).toEqual(['pull:work:w1']);
  });

  it('맞춘 적 없는 같은 id: 내용이 같으면 맞춘 것으로, 다르면 이 기기 것에 새 id', () => {
    expect(types(planSync(new Map([[k, a]]), [remote('work', 'w1', a)], {}))).toEqual(['same:work:w1']);
    const plan = planSync(new Map([[k, a]]), [remote('work', 'w1', w('w1', '다른 기기'))], {});
    expect(plan).toMatchObject([{ type: 'rekey', key: k, conflict: false }]);
  });

  it('한쪽만 바뀌면 그쪽을 따른다(지운 것 포함)', () => {
    const state = synced(k, a);
    const edited = { ...a, name: '고침' };
    expect(types(planSync(new Map([[k, edited]]), [remote('work', 'w1', a)], state))).toEqual(['push:work:w1']);
    expect(types(planSync(new Map([[k, a]]), [remote('work', 'w1', edited, 't2')], state))).toEqual(['pull:work:w1']);
    expect(types(planSync(new Map(), [remote('work', 'w1', a)], state))).toEqual(['deleteRemote:work:w1']);
    expect(types(planSync(new Map([[k, a]]), [remote('work', 'w1', null, 't2', true)], state))).toEqual([
      'deleteLocal:work:w1',
    ]);
    expect(planSync(new Map([[k, a]]), [remote('work', 'w1', a)], state)).toEqual([]);
  });

  it('양쪽 다 고친 작업은 둘 다 남기고, 다른 기록은 서버 것을 따른다', () => {
    const state = synced(k, a);
    const plan = planSync(
      new Map([[k, { ...a, name: '여기' }]]),
      [remote('work', 'w1', { ...a, name: '저기' }, 't2')],
      state,
    );
    expect(plan).toMatchObject([{ type: 'rekey', conflict: true }]);
    const dk = docKey('folder', 'fo1');
    const folder = { id: 'fo1', name: 'a' };
    const p2 = planSync(
      new Map([[dk, { ...folder, name: '여기' }]]),
      [remote('folder', 'fo1', { ...folder, name: '저기' }, 't2')],
      synced(dk, folder),
    );
    expect(types(p2)).toEqual(['pull:folder:fo1']);
  });

  it('지운 쪽과 고친 쪽이 만나면 고친 쪽이 이긴다', () => {
    const state = synced(k, a);
    expect(types(planSync(new Map(), [remote('work', 'w1', { ...a, name: '고침' }, 't2')], state))).toEqual([
      'pull:work:w1',
    ]);
    expect(
      types(planSync(new Map([[k, { ...a, name: '고침' }]]), [remote('work', 'w1', null, 't2', true)], state)),
    ).toEqual(['push:work:w1']);
  });

  it('이 기기에만 두기로 한 것은 올리지 않고, 서버의 같은 id와 부딪히면 새 id', () => {
    const skip = new Set([k]);
    expect(planSync(new Map([[k, a]]), [], {}, skip)).toEqual([]);
    expect(planSync(new Map([[k, a]]), [remote('work', 'w1', w('w1', '저기'))], {}, skip)).toMatchObject([
      { type: 'rekey' },
    ]);
  });
});

describe('새 id로 바꾸기', () => {
  const page = newPage();
  page.face.objects = [
    { id: 'i1', type: 'image', x: 0, y: 0, width: 5, height: 5, imageId: 'img1' },
    { id: 't1', type: 'text', x: 0, y: 0, width: 5, height: 5, text: 'a', font: 'f1' } as DiaryObject,
  ];
  const dated = {
    kind: 'dated',
    id: 'dt1',
    faces: [{ id: 'fc', background: page.face.background, objects: [] }],
    overrides: { k: { ...emptyOverride(), props: { t1: { font: 'f1' } } } },
  } as unknown as DatedItem;
  const snap: SyncSnapshot = {
    works: [{ ...w('w1'), folderId: 'fo1', items: [page, dated] }],
    diaries: [{ id: 'd1' } as SyncSnapshot['diaries'][number]],
    folders: [{ id: 'fo1', name: 'f' }],
    textStyles: [{ id: 'ts1', name: 's', style: { font: 'f1' } }],
    savedPalettes: [],
    fonts: [{ id: 'f1', name: 'Nanum' }],
    images: [{ id: 'img1', name: 'cat' }],
    defaultDiaryId: 'd1',
  };

  it('다이어리·폴더를 바꾸면 작업과 기본 다이어리가 따라간다', () => {
    const s = rekeySnapshot(rekeySnapshot(snap, 'diary', 'd1', 'd1~x'), 'folder', 'fo1', 'fo1~x');
    expect(s.works[0]).toMatchObject({ diaryId: 'd1~x', folderId: 'fo1~x' });
    expect(s.defaultDiaryId).toBe('d1~x');
  });

  it('글꼴·이미지를 바꾸면 객체·날짜별 수정·글자 스타일이 따라간다', () => {
    const s = rekeySnapshot(rekeySnapshot(snap, 'font', 'f1', 'f1~x'), 'image', 'img1', 'img1~x');
    const objs = (s.works[0].items[0] as typeof page).face.objects;
    expect(
      objs.map((o) => (o as { font?: string; imageId?: string }).font ?? (o as { imageId?: string }).imageId),
    ).toEqual(['img1~x', 'f1~x']);
    expect((s.works[0].items[1] as DatedItem).overrides.k.props.t1.font).toBe('f1~x');
    expect(s.textStyles[0].style.font).toBe('f1~x');
    expect(s.fonts[0].id).toBe('f1~x');
    // 원본 자료는 그대로.
    expect(snap.fonts[0].id).toBe('f1');
  });

  it('받기·지우기·새 꼬리', () => {
    expect(applyRemote(snap, 'folder', 'fo2', { id: 'fo2', name: 'n' }).folders).toHaveLength(2);
    expect(applyRemote(snap, 'prefs', 'prefs', { defaultDiaryId: null }).defaultDiaryId).toBeNull();
    expect(removeLocal(snap, 'work', 'w1').works).toEqual([]);
    expect(freshKey('w1~abcde', () => 0)).toBe('w1~aaaaa');
    expect(docsOf(snap).has('prefs:prefs')).toBe(true);
  });
});

describe('이 기기에 적용하기', () => {
  it('둘 다 고친 작업: 이 기기 것은 새 id·사본 이름, 원래 자리는 서버 것', () => {
    const base: SyncSnapshot = {
      works: [w('w1', '여기')],
      diaries: [],
      folders: [],
      textStyles: [],
      savedPalettes: [],
      fonts: [],
      images: [],
      defaultDiaryId: null,
    };
    const next = applyOps(base, [
      { type: 'rekey', kind: 'work', from: 'w1', to: 'w1~x', conflict: true },
      { type: 'put', kind: 'work', key: 'w1', data: w('w1', '저기') },
    ]);
    expect(next.works.map((x) => [x.id, x.name])).toEqual([
      ['w1~x', '여기 (copy from this device)'],
      ['w1', '저기'],
    ]);
    expect(applyOps(next, [{ type: 'remove', kind: 'work', key: 'w1' }]).works).toHaveLength(1);
  });
});
