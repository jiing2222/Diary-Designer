/**
 * 작업을 서버에 올리고 내린다.
 *
 * **한 사람에 자리 하나다.** 지금 하던 작업이 그 자리에 계속 덮어써진다 —
 * `storage/autosave`가 브라우저에 하는 일을 서버에도 한 번 더 하는 것이다.
 * 이름을 붙여 여러 벌 보관하는 것은 다음 단계고, 여기서 노리는 것은
 * "브라우저를 갈아도, 이 컴퓨터가 아니어도 하던 자리로 돌아오는 것" 하나다.
 *
 * 주고받는 것은 파일 저장·자동 저장과 **똑같은 `SavedProject` JSON**이다.
 * 저장 형식이 세 군데(파일·브라우저·서버)로 갈라지면 반드시 하나만 항목이
 * 빠진다 — core/project 하나만 보게 한다.
 *
 * **글꼴·이미지 파일은 올라가지 않는다.** JSON에는 이름만 들어 있어서(core/project
 * 참고) 다른 컴퓨터에서 열면 "글꼴을 다시 등록하세요"가 뜬다. 파일 바이트까지
 * 올리는 것은 따로 할 일이고, 그 전까지는 화면이 이 사실을 분명히 알려야 한다.
 */

import { readProject, type SavedProject } from '../core/project';
import { authed } from './client';

/** 서버에 있는 내 작업 한 벌. */
export interface RemoteProject {
  /** 레코드 id. 다음 저장 때 이 자리에 덮어쓰려고 들고 있는다. */
  id: string;
  project: SavedProject;
  /** 서버가 찍은 마지막 수정 시각. 어느 쪽이 새것인지 가릴 때 쓴다. */
  updated: string;
}

/**
 * 레코드 id를 기억해둔다.
 *
 * 저장할 때마다 "내 레코드가 있나"를 묻지 않으려는 것이다. 로그아웃하면
 * 지운다 — 다른 사람으로 로그인했는데 앞사람 자리에 덮어쓰면 큰일이다.
 */
let recordId: string | null = null;

/** 로그아웃·계정 전환 때 부른다. */
export function forgetRecord(): void {
  recordId = null;
}

/**
 * 서버에 있는 내 작업을 가져온다. 아직 올린 적이 없으면 `null`.
 *
 * 읽을 때는 파일을 열 때와 **똑같은 검사**(core/project의 `readProject`)를
 * 통과시킨다 — 판이 달라져 못 읽게 된 것이 화면을 망가뜨리면 안 된다.
 * 그런 경우엔 없는 것으로 친다.
 */
export async function pullProject(): Promise<RemoteProject | null> {
  const a = authed();
  if (!a) return null;

  const found = await a.pb.collection('projects').getList(1, 1, {
    filter: `user = "${a.userId}"`,
    sort: '-updated',
  });
  const record = found.items[0];
  if (!record) {
    recordId = null;
    return null;
  }

  recordId = record.id;
  const parsed = readProject(record.data);
  if ('error' in parsed) return null;
  return { id: record.id, project: parsed.ok, updated: record.updated as string };
}

/**
 * 지금 작업을 서버에 올린다. 이미 올린 것이 있으면 그 자리에 덮어쓴다.
 *
 * 처음 올리는지 알아보려고 매번 묻지 않고, 기억해둔 id가 없을 때만 한 번
 * 찾아본다. 그 사이 다른 기기에서 만들었을 수도 있어서, 만들기 전에
 * 반드시 한 번은 확인한다 — 안 그러면 한 사람에게 자리가 둘이 생긴다.
 */
export async function pushProject(project: SavedProject): Promise<void> {
  const a = authed();
  if (!a) return;

  if (recordId === null) await pullProject();

  const body = { user: a.userId, data: project };
  if (recordId === null) {
    const created = await a.pb.collection('projects').create(body);
    recordId = created.id;
    return;
  }

  try {
    await a.pb.collection('projects').update(recordId, body);
  } catch (err) {
    // 다른 기기에서 지웠을 수 있다. 그때는 기억을 버리고 새로 만든다 —
    // 여기서 그냥 실패하면 이 사람은 다시 로그인하기 전까지 영영 못 올린다.
    if ((err as { status?: number })?.status === 404) {
      recordId = null;
      const created = await a.pb.collection('projects').create(body);
      recordId = created.id;
      return;
    }
    throw err;
  }
}

/**
 * 서버 것과 지금 것 중 어느 쪽이 새것인지.
 *
 * `savedAt`은 **만든 컴퓨터의 시계**라 기기마다 몇 초씩 어긋난다. 그래서
 * 초 단위로 엄밀히 비교하지 않고, 확실히 앞설 때만 새것으로 본다 —
 * 시계가 조금 틀어진 노트북에서 열었다고 "서버에 새 작업이 있습니다"가
 * 뜨면 사람이 그 안내를 믿지 않게 된다.
 */
const CLOCK_SLACK_MS = 60_000;

export function remoteIsNewer(remote: SavedProject, local: SavedProject | null): boolean {
  if (!local) return true;
  const r = Date.parse(remote.savedAt);
  const l = Date.parse(local.savedAt);
  if (Number.isNaN(r) || Number.isNaN(l)) return false;
  return r - l > CLOCK_SLACK_MS;
}
