import { syncSnapshotOf, useStore } from '../store';
import { bundleWorks, fileNameOf, planImport, readFile, FILE_FORMAT, FILE_VERSION, type RingsFile } from '../core/bundle';
import { allIdsOf } from '../core/work';
import { ensureIdCounterAbove } from '../core/objects';
import { adoptFont, fontBytes, reserveIds } from '../fonts/registry';
import { adoptImage, imageBytes, imageKind, reserveImageIds } from '../images/registry';
import { migrateSnapshot } from '../storage/v2';
import { t } from '../lang';
import type { ReadError } from '../core/bundle';

/**
 * 작업 파일(.rings) 저장·불러오기의 바깥 일 — 파일 바이트를 base64로, 내려받기, 받은 글꼴·이미지 등록.
 * 무엇을 담고 어떻게 합칠지는 core/bundle이 정한다.
 */

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  // 한 번에 String.fromCharCode에 다 넘기면 큰 글꼴에서 호출 스택이 넘친다 — 잘라서.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(data: string): ArrayBuffer {
  const s = atob(data);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/** 작업들을 파일 하나로 내려받는다. 담은 작업 수를 돌려준다(0이면 아무것도 안 했다). */
export function saveWorksToFile(workIds: string[], name: string): number {
  const s = useStore.getState();
  const file = bundleWorks(
    syncSnapshotOf(s),
    workIds,
    {
      font: (id) => {
        const b = fontBytes(id);
        return b ? toBase64(b) : undefined;
      },
      image: (id) => {
        const b = imageBytes(id);
        return b ? { kind: imageKind(id) ?? 'png', data: toBase64(b) } : undefined;
      },
    },
    new Date().toISOString(),
  );
  if (file.works.length === 0) return 0;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  a.download = fileNameOf(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return file.works.length;
}

/**
 * 옛 버전(리뉴얼 전)의 저장 파일 — 양식 목록 JSON. 새 구조로 옮겨 작업 파일처럼 다룬다. 그 파일에는
 * 글꼴·이미지 바이트가 없어서 이름만 남는다(같은 이름으로 다시 등록하면 되살아난다).
 */
function legacyFile(text: string): RingsFile | null {
  const m = migrateSnapshot(text, new Date().toISOString());
  if (!m || m.works.length === 0) return null;
  return { format: FILE_FORMAT, version: FILE_VERSION, savedAt: '', works: m.works, diaries: m.diaries, fonts: [], images: [] };
}

/** 파일을 읽어 Library에 더한다. 결과 문구를 돌려준다(알림으로 띄운다). */
export async function loadWorksFromFile(file: File): Promise<string> {
  const text = await file.text();
  const read = readFile(text);
  const data = 'ok' in read ? read.ok : legacyFile(text);
  if (!data) return 'error' in read ? readErrorText(read.error) : t('파일을 읽지 못했어요.', "Couldn't read the file.");

  const s = useStore.getState();
  const plan = planImport(syncSnapshotOf(s), data);

  // 글꼴·이미지 파일부터 등록한다 — 작업이 들어오는 순간 화면이 그 파일을 찾는다.
  for (const f of plan.fonts) {
    reserveIds([f.info.id]);
    const font = await adoptFont(f.info.id, f.info.name, fromBase64(f.data), {
      label: f.info.label,
      favorite: f.info.favorite,
    });
    useStore.getState().addUserFont(font);
  }
  for (const i of plan.images) {
    reserveImageIds([i.info.id]);
    const image = await adoptImage(i.info.id, i.info.name, fromBase64(i.data), i.kind, { label: i.info.label });
    useStore.getState().addUserImage(image);
  }

  // 들어오는 id들보다 위로 카운터를 올린다 — 이후 새로 만드는 것이 겹치지 않게.
  ensureIdCounterAbove([...plan.works.flatMap(allIdsOf), ...plan.diaries.map((d) => d.id)]);
  useStore.getState().applySyncOps([
    ...plan.diaries.map((d) => ({ type: 'put' as const, kind: 'diary' as const, key: d.id, data: d })),
    ...plan.works.map((w) => ({ type: 'put' as const, kind: 'work' as const, key: w.id, data: w })),
  ]);
  return t(`작업 ${plan.works.length}개를 불러왔어요.`, `Opened ${plan.works.length} work(s).`);
}

function readErrorText(e: ReadError): string {
  if (e === 'newer') {
    return t(
      '더 새 버전의 Rings에서 저장한 파일이에요. 앱을 새로 고친 뒤 다시 열어 주세요.',
      'This file was saved by a newer version of Rings. Reload the app and try again.',
    );
  }
  if (e === 'broken') return t('파일이 손상됐어요.', 'The file is damaged.');
  return t('Rings 작업 파일이 아니에요.', "This isn't a Rings file.");
}
