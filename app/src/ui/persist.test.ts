import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { boot, flushAutosave, startAutosave } from './persist';
import { loadAll, saveFolder, saveMeta, saveWork, v2Put } from '../storage/v2';
import { newPage } from '../core/work';
import { queueAssetWrite } from '../storage/assetCache';

vi.mock('../storage/v2', () => ({
  loadAll: vi.fn(), migrateFromV1: vi.fn(async () => {}),
  saveWork: vi.fn(async () => {}), saveMeta: vi.fn(async () => {}), saveDiary: vi.fn(async () => {}),
  saveFolder: vi.fn(async () => {}), deleteFolder: vi.fn(async () => {}), deleteWork: vi.fn(async () => {}),
  v2Delete: vi.fn(async () => {}), v2Put: vi.fn(async () => {}),
}));
vi.mock('../fonts/registry', async (original) => ({
  ...await original<typeof import('../fonts/registry')>(), restoreCachedFonts: vi.fn(async () => []),
}));
vi.mock('../images/registry', async (original) => ({
  ...await original<typeof import('../images/registry')>(), restoreCachedImages: vi.fn(async () => []),
}));

const initial = useStore.getState();
let stop: (() => void) | undefined;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(saveWork).mockResolvedValue(undefined);
  vi.mocked(saveFolder).mockResolvedValue(undefined);
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  useStore.setState(initial, true);
  useStore.getState().createWork('검증');
  const s = useStore.getState();
  vi.mocked(loadAll).mockResolvedValue({ works: s.works, diaries: s.diaries, folders: [], meta: { migratedAt: '2026-10-12', tabs: s.tabs } });
  await boot();
  stop = startAutosave();
});
afterEach(async () => {
  stop?.();
  await flushAutosave();
  vi.unstubAllGlobals();
});

describe('자동 저장의 실제 결과', () => {
  it('작업 저장이 실패하면 파일부터 지우지 않고, 저장 성공 뒤에만 삭제 기록을 확정한다', async () => {
    const s = useStore.getState();
    s.renameWork(s.works[0].id, '바꾼 작업');
    queueAssetWrite('images', { id: 'img1', name: '사진', deleted: true });
    vi.mocked(saveWork).mockRejectedValueOnce(new Error('용량 초과'));
    await flushAutosave();
    expect(useStore.getState().saveStatus).toBe('error');
    expect(v2Put).not.toHaveBeenCalled();
    await flushAutosave();
    expect(v2Put).toHaveBeenCalledWith('images', 'img1', { id: 'img1', name: '사진', deleted: true });
    expect(useStore.getState().saveStatus).toBe('saved');
  });
  it('캐시 파일이 없거나 읽지 못해도 파일 이름·즐겨찾기·숨김을 복원하고 계속 저장한다', async () => {
    stop?.();
    const s = useStore.getState();
    const page = newPage();
    page.face.objects.push({ id: 'im40', type: 'image', imageId: 'img40', x: 0, y: 0, width: 10, height: 10 });
    vi.mocked(loadAll).mockResolvedValue({ works: [{ ...s.works[0], items: [page] }], diaries: s.diaries, folders: [], meta: {
      tabs: s.tabs,
      fonts: [{ id: 'f40', name: '찾는 글꼴', label: '내 글꼴', favorite: true }],
      images: [{ id: 'img40', name: '찾는 이미지', hidden: true }],
    } });
    await boot();
    expect(useStore.getState().userFonts).toMatchObject([{ id: 'f40', name: '찾는 글꼴', label: '내 글꼴', favorite: true }]);
    expect(useStore.getState().userImages).toMatchObject([{ id: 'img40', name: '찾는 이미지', url: '', hidden: true }]);
  });
  it('폴더·작업 이동을 저장하며 폴더 쓰기 실패도 다시 저장할 수 있다', async () => {
    const s = useStore.getState();
    const folderId = s.addFolder('기록')!;
    s.moveWorkToFolder(s.works[0].id, folderId);
    vi.mocked(saveFolder).mockRejectedValueOnce(new Error('용량 초과'));
    await flushAutosave();
    expect(useStore.getState().saveStatus).toBe('error');
    await flushAutosave();
    expect(useStore.getState().saveStatus).toBe('saved');
    expect(saveFolder).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveFolder).mock.lastCall?.[0]).toMatchObject({ id: folderId, name: '기록' });
    expect(vi.mocked(saveWork).mock.lastCall?.[0].folderId).toBe(folderId);
  });

  it('검색·정렬·필터만 바꾸면 작업이나 폴더를 다시 저장하지 않는다', async () => {
    useStore.getState().patch({ projectView: { diaryId: null, query: '메모', sort: 'name' } });
    await flushAutosave();
    expect(saveWork).not.toHaveBeenCalled();
    expect(saveFolder).not.toHaveBeenCalled();
    expect(useStore.getState().saveStatus).toBe('saved');
  });

  it('보는 위치(확대·스크롤)만 바꾸면 저장 중 표시 없이 조용히 저장한다', async () => {
    await flushAutosave();
    vi.mocked(saveMeta).mockClear();
    useStore.getState().rememberViewport({ zoom: 150, scrollTop: 300 });
    expect(useStore.getState().saveStatus).toBe('saved');
    await flushAutosave();
    expect(useStore.getState().saveStatus).toBe('saved');
    expect(vi.mocked(saveMeta).mock.lastCall?.[0].cursors?.[useStore.getState().tabs.active]).toMatchObject({ zoom: 150, scrollTop: 300 });
  });

  it('작업 내용을 고치면 저장 중을 보여주고, 끝나면 저장됨', async () => {
    await flushAutosave();
    useStore.getState().renameWork(useStore.getState().works[0].id, '새 이름');
    expect(useStore.getState().saveStatus).toBe('pending');
    await flushAutosave();
    expect(useStore.getState().saveStatus).toBe('saved');
  });

  it('색상 미리보기는 저장하지 않고 확정한 색만 저장한다', async () => {
    useStore.getState().previewPaletteColor('base5', '#123456');
    await flushAutosave();
    expect(saveWork).not.toHaveBeenCalled();
    expect(useStore.getState().saveStatus).toBe('saved');
    useStore.getState().finishPalettePreview(true);
    await flushAutosave();
    expect(vi.mocked(saveWork).mock.calls[0][0].palette.base.base5).toBe('#123456');
  });

  it('쓰기가 끝나기 전에는 저장됨으로 알리지 않는다', async () => {
    let finish!: () => void;
    vi.mocked(saveWork).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const s = useStore.getState();
    s.renameWork(s.works[0].id, '바꾼 이름');
    expect(useStore.getState().saveStatus).toBe('pending');
    const saving = flushAutosave();
    expect(useStore.getState().saveStatus).toBe('saving');
    finish();
    await saving;
    expect(useStore.getState().saveStatus).toBe('saved');
  });

  it('실패한 변경은 저장한 것으로 기억하지 않고 다시 쓴다', async () => {
    vi.mocked(saveWork).mockRejectedValueOnce(new Error('용량 초과'));
    const s = useStore.getState();
    s.renameWork(s.works[0].id, '실패 후 다시 저장');
    await flushAutosave();
    expect(useStore.getState().saveStatus).toBe('error');
    await flushAutosave();
    expect(saveWork).toHaveBeenCalledTimes(2);
    expect(useStore.getState().saveStatus).toBe('saved');
  });

  it('저장 도중 새 편집이 생기면 뒤의 내용까지 순서대로 저장한다', async () => {
    let finish!: () => void;
    vi.mocked(saveWork).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const id = useStore.getState().works[0].id;
    useStore.getState().renameWork(id, '첫 편집');
    const first = flushAutosave();
    useStore.getState().renameWork(id, '다음 편집');
    const next = flushAutosave();
    expect(saveWork).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, next]);
    expect(vi.mocked(saveWork).mock.calls.map(([w]) => w.name)).toEqual(['첫 편집', '다음 편집']);
    expect(useStore.getState().saveStatus).toBe('saved');
  });
});
