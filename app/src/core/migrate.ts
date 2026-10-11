import type { Template } from './template';
import { diarySizeLabel, nearestPreset, nextDiaryColor, samePaper, type Diary } from './diary';
import { addPoint, defaultWorkPalette, linkExactColors, type WorkPalette } from './colors';
import { resolveObjectsForPage } from './format';
import { diffOverride, isEmptyOverride, overrideKey, periodsOf, type FaceOverride } from './dated';
import { cloneFace, type DatedItem, type Face, type PageItem, type Work, type WorkItem } from './work';
import { newId, type DiaryObject } from './objects';

/**
 * 옛 양식을 리뉴얼의 작업·다이어리로 옮긴다(기본계획 8-1).
 *
 * 이 함수는 **읽기만** 한다 — 옛 저장소는 건드리지 않고 복사본을 만든다
 * (storage/v2가 새 저장소에 넣는다). 그래서 옛 버전도 계속 돌아간다.
 *
 * | 옛것 | 새것 |
 * |---|---|
 * | 일반 양식 | 작업 1개, 앞면(+뒷면) 페이지 |
 * | 반복 양식(N장) | 작업 1개, 같은 페이지 N장 |
 * | 날짜 세트 양식 | 작업 1개, 날짜 묶음 하나. 인쇄하기에서 고친 쪽은 그 날짜의 개별 수정 |
 * | 노트 | 옮기지 않는다(태그 notebook-last, 옛 저장소에 남는다) |
 * | 양식 색(메인·서브) | 작업 색상 POINT A·B…, 같은 색인 객체에는 이름표 |
 * | 양식 크기 | 같은 종이끼리 묶어 내 다이어리로 |
 * | 칸 배정 | 버린다 |
 */
export interface Migrated {
  diaries: Diary[];
  works: Work[];
  /** 옮기지 않은 노트 이름들 — 화면에서 알려준다. */
  skippedNotebooks: string[];
}

export function migrateTemplates(templates: Template[], now: string): Migrated {
  const diaries: Diary[] = [];
  const works: Work[] = [];
  const skippedNotebooks: string[] = [];

  for (const t of templates) {
    if (t.kind === 'notebook') {
      skippedNotebooks.push(t.name);
      continue;
    }
    const diary = diaryFor(t, diaries);
    const palette = paletteOf(t);
    const work: Work = {
      id: t.id,
      name: t.name,
      createdAt: t.createdAt ?? now,
      updatedAt: now,
      diaryId: diary.id,
      duplex: t.back !== null,
      palette,
      items: itemsOf(t),
    };
    works.push(linkWorkColors(work));
  }
  return { diaries, works, skippedNotebooks };
}

/** 같은 종이의 다이어리가 이미 있으면 그것, 없으면 새로 만들어 목록에 더한다. */
function diaryFor(t: Template, diaries: Diary[]): Diary {
  const paper = { width: t.insert.width, height: t.insert.height, punch: t.insert.punch };
  const found = diaries.find((d) => samePaper(d, paper));
  if (found) return found;
  const diary: Diary = {
    id: newId('d'),
    name: diarySizeLabel(paper),
    color: nextDiaryColor(diaries.map((d) => d.color)),
    presetId: nearestPreset(paper.width, paper.height)?.id ?? 'custom',
    ...paper,
    punch: { ...t.insert.punch },
  };
  diaries.push(diary);
  return diary;
}

/** 옛 메인·서브 색을 차례로 POINT A·B…로. 기본 5칸은 옛 회색 5단계와 값이 같다. */
function paletteOf(t: Template): WorkPalette {
  let palette = defaultWorkPalette();
  for (const color of [t.palette.main, ...t.palette.subs]) {
    if (color) palette = addPoint(palette, color);
  }
  return palette;
}

function facesOf(t: Template): Face[] {
  const front: Face = { id: newId('fc'), background: { ...t.dotGrid }, objects: t.objects.present };
  if (!t.back) return [front];
  return [front, { id: newId('fc'), background: { ...t.dotGrid }, objects: t.back.objects.present }];
}

function itemsOf(t: Template): WorkItem[] {
  const faces = facesOf(t);
  const pages = (fs: Face[]): PageItem[] => fs.map((face) => ({ kind: 'page', id: newId('pg'), face }));

  if (t.repeat.mode === 'single') return pages(faces);

  if (t.repeat.mode === 'repeat') {
    const out: PageItem[] = [];
    for (let i = 0; i < Math.max(1, t.repeat.count); i++) {
      out.push(...pages(i === 0 ? faces : faces.map(cloneFace)));
    }
    return out;
  }

  const dataset = t.repeat.dataset;
  const periods = periodsOf(dataset, 'continue');
  const overrides: Record<string, FaceOverride> = {};
  const sides: [Record<number, DiaryObject[]> | undefined, number][] = [
    [t.pageOverrides, 0],
    [t.pageBackOverrides, 1],
  ];
  for (const [pageOverrides, faceIndex] of sides) {
    const face = faces[faceIndex];
    if (!pageOverrides || !face) continue;
    for (const [pageStr, edited] of Object.entries(pageOverrides)) {
      const page = Number(pageStr);
      const period = periods[page];
      if (!period) continue;
      // 옛 앱이 그 쪽을 그릴 때와 똑같이 날짜를 채운 것과 견준다.
      const base = resolveObjectsForPage(face.objects, dataset, page);
      const ov = diffOverride(base, edited);
      if (!isEmptyOverride(ov)) overrides[overrideKey(period.key, faceIndex)] = ov;
    }
  }
  const item: DatedItem = { kind: 'dated', id: newId('dt'), faces, dataset, boundary: 'continue', overrides };
  return [item];
}

/** 작업 안의 모든 색(면·날짜별 수정)에서 팔레트와 같은 색에 이름표를 붙인다. */
function linkWorkColors(work: Work): Work {
  const link = (objs: DiaryObject[]) => linkExactColors(objs, work.palette);
  const linkFace = (f: Face): Face => ({ ...f, objects: link(f.objects) });
  const items = work.items.map((item): WorkItem => {
    if (item.kind === 'page') return { ...item, face: linkFace(item.face) };
    const overrides: Record<string, FaceOverride> = {};
    for (const [key, ov] of Object.entries(item.overrides)) {
      const patches = Object.entries(ov.props);
      const linked = linkExactColors(
        patches.map(([, p]) => p),
        work.palette,
      );
      overrides[key] = {
        props: Object.fromEntries(patches.map(([id], i) => [id, linked[i]])),
        added: link(ov.added),
        removed: ov.removed,
      };
    }
    return { ...item, faces: item.faces.map(linkFace), overrides };
  });
  return { ...work, items };
}

