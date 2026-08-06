import { initHistory } from './history';
import { DEFAULT_DOT_GRID, type DotGrid } from './grid';
import type { DiaryObject } from './objects';
import type { InsertSetting, RepeatSetting, Template } from './template';
import { defaultInsert, SINGLE_REPEAT } from './template';

/** 저장 파일에 담기는 뒷면 모양. Template.back과 같지만 History가 아니라 배열이다. */
interface SavedBack {
  dotGrid: DotGrid;
  objects: DiaryObject[];
}

/**
 * 저장 파일.
 *
 * **판 번호를 맨 앞에 박아둔다.** 앞으로 뒷면(양면 인쇄)이나 표 같은 것이 생겨도
 * 옛 파일을 읽을 수 있어야 한다. 지금 판에 없는 것은 `없음 = 기본값`으로 읽는다.
 *
 * 담지 않는 것이 둘 있다.
 *
 * **실행취소 이력.** 되돌리기는 이번 작업 중의 이야기다. 파일을 열었을 때 남의
 * 과거로 되돌아갈 수 있으면 오히려 놀란다. 지금 모습만 담는다.
 *
 * **글꼴 파일.** 이름만 담는다. 2.7MB짜리를 base64로 넣으면 파일이 3.6MB씩
 * 불어나고, 남의 글꼴을 파일에 실어 옮기는 것은 라이선스상으로도 애매하다.
 * 불러올 때 무엇이 필요한지 알려주고 다시 등록받는다.
 */
export const PROJECT_VERSION = 1;

export interface SavedFont {
  id: string;
  name: string;
}

export interface SavedTemplate {
  id: string;
  name: string;
  insert: InsertSetting;
  dotGrid: DotGrid;
  objects: DiaryObject[];
  /** 옛 파일(7단계 이전)에는 없다. 없으면 `single`로 읽는다. */
  repeat?: RepeatSetting;
  /** 옛 파일(9단계 이전)에는 없다. 없거나 `null`이면 단면이다. */
  back?: SavedBack | null;
}

export interface SavedProject {
  version: number;
  /** 언제 저장했는지. 파일이 여러 개일 때 사람이 고르는 단서가 된다. */
  savedAt: string;
  templates: SavedTemplate[];
  /** 용지·배치 설정. 양식은 용지를 모르므로 따로 담는다. */
  print: Record<string, unknown>;
  /** 쓰인 글꼴의 이름. 파일은 담지 않는다. */
  fonts: SavedFont[];
}

/** 지금 상태를 저장 파일 모양으로. */
export function toProject(input: {
  templates: Template[];
  print: Record<string, unknown>;
  fonts: SavedFont[];
}): SavedProject {
  return {
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    templates: input.templates.map((t) => ({
      id: t.id,
      name: t.name,
      insert: t.insert,
      dotGrid: t.dotGrid,
      // 실행취소 이력은 빼고 지금 모습만.
      objects: t.objects.present,
      repeat: t.repeat,
      back: t.back ? { dotGrid: t.back.dotGrid, objects: t.back.objects.present } : null,
    })),
    print: input.print,
    // 실제로 쓰인 글꼴만 담는다. 등록만 해놓고 안 쓴 것까지 적어두면
    // 불러올 때 필요하지도 않은 파일을 찾게 만든다.
    fonts: input.fonts.filter((f) => usesFont(input.templates, f.id)),
  };
}

function usesFont(templates: Template[], id: string): boolean {
  return templates.some((t) =>
    t.objects.present.some((o) => o.type === 'text' && o.font === id),
  );
}

/**
 * 읽어들인 것이 저장 파일인지 확인한다.
 *
 * **깨진 파일로 화면을 망가뜨리지 않는 것이 목적이다.** 남이 만든 JSON이나
 * 판이 다른 파일을 열었을 때, 무슨 일인지 알려주고 지금 작업은 그대로 둔다.
 *
 * 하나하나 다 뜯어보지는 않는다. 좌표가 숫자인지까지 검사하면 코드가 배로 늘고,
 * 그렇게까지 망가진 파일은 사용자가 손으로 고친 경우뿐이다. 화면이 죽지 않을
 * 만큼만 본다 — 양식 목록이 있고, 각 양식에 크기와 객체 배열이 있는지.
 */
export function readProject(raw: unknown): { ok: SavedProject } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: '양식 파일이 아닙니다.' };
  const p = raw as Partial<SavedProject>;

  if (typeof p.version !== 'number') return { error: '양식 파일이 아닙니다.' };
  if (p.version > PROJECT_VERSION) {
    return {
      error: `더 새로운 판(v${p.version})으로 저장된 파일입니다. 이 프로그램은 v${PROJECT_VERSION}까지 읽습니다.`,
    };
  }
  if (!Array.isArray(p.templates) || p.templates.length === 0) {
    return { error: '양식이 하나도 들어 있지 않습니다.' };
  }
  for (const t of p.templates) {
    if (typeof t?.name !== 'string' || !Array.isArray(t?.objects)) {
      return { error: '양식 내용이 깨져 있습니다.' };
    }
    if (typeof t?.insert?.width !== 'number' || typeof t?.insert?.height !== 'number') {
      return { error: '양식의 속지 크기를 읽을 수 없습니다.' };
    }
    if (t.back && !Array.isArray(t.back.objects)) {
      return { error: '양식 뒷면 내용이 깨져 있습니다.' };
    }
  }

  return { ok: p as SavedProject };
}

/**
 * 저장 파일을 다시 양식으로.
 *
 * **없는 값은 기본값으로 채운다.** 옛 판에 없던 설정이 나중에 생겼을 때, 그
 * 파일이 안 열리는 것이 아니라 새 설정의 기본값으로 열려야 한다.
 *
 * 실행취소 이력은 빈 채로 시작한다 — 방금 연 파일이 첫 모습이다.
 */
export function toTemplates(p: SavedProject): Template[] {
  return p.templates.map((t, i) => ({
    id: t.id || `t${i + 1}`,
    name: t.name,
    insert: { ...defaultInsert(), ...t.insert },
    dotGrid: { ...DEFAULT_DOT_GRID, ...t.dotGrid },
    objects: initHistory(t.objects),
    repeat: t.repeat ?? SINGLE_REPEAT,
    back: t.back
      ? {
          dotGrid: { ...DEFAULT_DOT_GRID, ...t.back.dotGrid },
          objects: initHistory(t.back.objects),
        }
      : null,
  }));
}

/**
 * 다시 등록해야 하는 글꼴 이름들.
 *
 * 파일에 이름만 담기 때문에, 열고 나면 그 글꼴을 쓰던 글자는 기본 글꼴로 보인다.
 * 무엇이 빠졌는지 알려줘야 사용자가 같은 파일을 다시 찾아올 수 있다.
 */
export function missingFonts(p: SavedProject, have: (id: string) => boolean): string[] {
  return (p.fonts ?? []).filter((f) => !have(f.id)).map((f) => f.name);
}
