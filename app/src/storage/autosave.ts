/**
 * 자동 저장.
 *
 * **이 프로그램은 서버가 없어서, 여기 없으면 새로고침 한 번에 작업이 통째로
 * 사라진다.** 파일로 저장하기(ui/ProjectFile)가 있긴 하지만 그건 사용자가
 * 눌러야 하는 것이고, 사용자는 한 번 잃어보기 전까지 그 버튼을 누를 이유를
 * 모른다. 잃고 나서 배우게 두지 않는다.
 *
 * 브라우저(IndexedDB)에 **직전 모습 하나**만 덮어쓴다. 이력을 여러 벌 쌓지
 * 않는 이유는 되돌리기가 이미 store 안에 있고(core/history), 여기서 노리는
 * 것은 "실수로 닫았을 때 그 자리로 돌아오는 것" 하나뿐이기 때문이다.
 *
 * **파일 저장을 대신하지 않는다.** 브라우저 저장소는 사생활 보호 모드나
 * 저장공간 정리로 언제든 비워질 수 있다. 진짜 보관은 여전히 파일이다 —
 * 이건 그 사이를 메우는 그물이다.
 *
 * 실패는 조용히 삼킨다(storage/idb와 같은 원칙). 자동 저장이 안 됐다고
 * 작업 중인 화면에 오류를 띄우면, 정작 할 수 있는 일도 없으면서 방해만 된다.
 */

import { readProject, type SavedProject } from '../core/project';
import { idbDelete, idbGet, idbPut } from './idb';

/** 자리는 하나뿐이다. 여러 벌을 쌓지 않는 이유는 이 파일 맨 위 참고. */
const KEY = 'current';

/**
 * 마지막 변경 뒤 이만큼 조용하면 쓴다.
 *
 * 선 하나를 끄는 동안에도 store는 수십 번 바뀐다. 그때마다 쓰면 큰 양식에서
 * 눈에 띄게 버벅인다. 1.2초는 "손을 멈추면 곧 저장된다"고 느껴지면서도
 * 드래그 한 번을 한 번의 쓰기로 묶어주는 값이다.
 */
const DELAY_MS = 1200;

let timer: ReturnType<typeof setTimeout> | null = null;

/** 지금 상태를 저장 모양으로 만드는 함수. 부를 때마다 최신 상태를 읽어야 한다. */
export type SnapshotBuilder = () => SavedProject | null;

async function write(project: SavedProject): Promise<void> {
  // 구조화 복제(structured clone)로 들어가므로 JSON 문자열로 만들어 넣는다.
  // 객체를 그대로 주면 나중에 형태가 바뀌었을 때 무엇이 들었는지 알기 어렵고,
  // 파일 저장과 완전히 같은 바이트를 남겨두면 문제가 생겼을 때 그 값을 그대로
  // 파일로 꺼내 열어볼 수 있다.
  await idbPut('project', KEY, JSON.stringify(project));
}

/**
 * 잠시 뒤에 저장한다. 그 사이 또 불리면 시계를 다시 맞춘다.
 *
 * `build`를 지금 부르지 않고 시계가 울릴 때 부르는 것이 중요하다 — 변경마다
 * 프로젝트 전체를 직렬화하면 미루는 의미가 없다.
 */
export function scheduleSave(build: SnapshotBuilder): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const project = build();
    if (project) void write(project);
  }, DELAY_MS);
}

/**
 * 미루지 않고 지금 쓴다. 탭을 닫거나 숨길 때 쓴다.
 *
 * 브라우저가 페이지를 접는 중이라 이 쓰기가 끝까지 간다는 보장은 없다.
 * 그래도 대개는 들어가고, 안 들어가도 직전 `scheduleSave`가 남긴 것이 있다 —
 * 잃는 것은 마지막 1.2초뿐이다.
 */
export function saveNow(build: SnapshotBuilder): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const project = build();
  if (project) void write(project);
}

/**
 * 남아 있는 것을 읽는다. 없거나 읽을 수 없으면 `null`.
 *
 * 파일을 열 때와 **똑같은 검사**(core/project의 `readProject`)를 통과시킨다.
 * 판이 바뀌어 못 읽게 된 자동 저장이 화면을 망가뜨리는 일이 없어야 한다 —
 * 그런 경우엔 없는 것으로 치고 빈 화면에서 시작한다.
 */
export async function loadSnapshot(): Promise<SavedProject | null> {
  const raw = await idbGet<string>('project', KEY);
  if (raw === null) return null;
  try {
    const parsed = readProject(JSON.parse(raw));
    return 'error' in parsed ? null : parsed.ok;
  } catch {
    return null;
  }
}

/** 남아 있는 것을 지운다. */
export async function clearSnapshot(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  await idbDelete('project', KEY);
}
