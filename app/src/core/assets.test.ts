import { describe, expect, it } from 'vitest';
import {
  fontsInUse,
  imagesInUse,
  libraryFonts,
  libraryImages,
  purgeable,
  reusableIdFor,
  worksUsingAsset,
} from './assets';
import { newFace, newPage, type DatedItem } from './work';
import type { DiaryObject } from './objects';

const image = (id: string, imageId: string): DiaryObject => ({
  id,
  type: 'image',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  imageId,
});
const text = (id: string, font: string): DiaryObject =>
  ({ id, type: 'text', x: 0, y: 0, width: 10, height: 5, text: 'a', font }) as DiaryObject;

describe('쓰는 이미지·글꼴', () => {
  const page = newPage();
  page.face.objects = [image('a', 'img1'), text('t', 'f1')];
  const face = newFace();
  face.objects = [image('b', 'img2')];
  const dated = {
    kind: 'dated',
    id: 'd',
    faces: [face],
    overrides: {
      k: { props: { b: { imageId: 'img3' }, t: { font: 'f2' } }, added: [image('c', 'img4')], removed: [] },
    },
  } as unknown as DatedItem;
  const works = [{ items: [page] }, { items: [dated] }];

  it('원본·날짜별로 더한 것·날짜별로 바꾼 속성까지 센다', () => {
    expect([...imagesInUse(works)].sort()).toEqual(['img1', 'img2', 'img3', 'img4']);
    expect([...fontsInUse(works)].sort()).toEqual(['f1', 'f2']);
  });

  it('쓰는 작업 수', () => {
    expect(worksUsingAsset(works, 'image', 'img1')).toBe(1);
    expect(worksUsingAsset([...works, { items: [page] }], 'image', 'img1')).toBe(2);
    expect(worksUsingAsset(works, 'font', 'f9')).toBe(0);
  });

  it('지울 수 있는 것은 목록에서 뺐고 아무도 안 쓰는 것뿐', () => {
    const list = [
      { id: 'img1', name: 'a', hidden: true },
      { id: 'img5', name: 'b', hidden: true },
      { id: 'img6', name: 'c' },
    ];
    expect(purgeable(list, imagesInUse(works)).map((i) => i.id)).toEqual(['img5']);
  });
});

describe('목록 순서', () => {
  it('이미지는 최신순, 뺀 것 제외', () => {
    const list = [
      { id: '1', name: 'old', usedAt: 1 },
      { id: '2', name: 'new', usedAt: 3 },
      { id: '3', name: 'hidden', usedAt: 9, hidden: true },
      { id: '4', name: 'none' },
    ];
    expect(libraryImages(list).map((i) => i.id)).toEqual(['2', '1', '4']);
  });

  it('글꼴은 즐겨찾기가 위, 그 안에서 가나다순(바꾼 이름 기준)', () => {
    const list = [
      { id: '1', name: 'z', label: '하늘' },
      { id: '2', name: '나눔' },
      { id: '3', name: 'b', label: '다람', favorite: true },
      { id: '4', name: '가람', favorite: true },
      { id: '5', name: '가', hidden: true },
    ];
    expect(libraryFonts(list).map((f) => f.id)).toEqual(['4', '3', '2', '1']);
  });
});

describe('같은 이름을 다시 올리면', () => {
  const list = [
    { id: 'img1', name: 'a' },
    { id: 'img2', name: 'b', hidden: true },
    { id: 'img3', name: 'c' },
  ];
  const has = (id: string) => id !== 'img3';

  it('파일 없는 것·목록에서 뺀 것의 id를 이어받고, 목록에 있는 것은 새로', () => {
    expect(reusableIdFor(list, 'a', has)).toBeUndefined();
    expect(reusableIdFor(list, 'b', has)).toBe('img2');
    expect(reusableIdFor(list, 'c', has)).toBe('img3');
  });
});
