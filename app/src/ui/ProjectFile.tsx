import { useRef, useState } from 'react';
import { missingFonts, missingImages, readProject, toProject, toTemplates } from '../core/project';
import { hasFont } from '../fonts/registry';
import { hasImage } from '../images/registry';
import { activeTemplate, useStore } from '../store';

/** File System Access API — 크롬 계열만 있다. 없으면 기존 다운로드 방식으로 대신한다. */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FileSystemWritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

/**
 * 작업 저장하기 · 불러오기.
 *
 * **지금 보고 있는 양식 하나**를 파일 하나로 주고받는다. 여러 날에 걸쳐 이렇게
 * 저장한 파일들을 나중에 한 번에 여러 개 골라 불러오면(파일 선택 창에서 여러
 * 개 선택), 지금 프로젝트에 그 양식들이 모두 더해진다 — 낱장 조합에서 여러
 * 양식을 함께 쓰려는 것이 이 파일들의 목적이기 때문이다. 용지·배치 설정은
 * 양식이 아니라 지금 프로젝트에 속한 값이라 불러올 때 건드리지 않는다.
 *
 * 브라우저에만 두지 않고 파일로 내보낸다. 이 프로그램은 서버가 없어서 새로고침
 * 한 번에 작업이 사라진다 — 손에 쥘 수 있는 파일이 있어야 안심하고 쓴다.
 */
export function ProjectFile() {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  async function save() {
    const active = activeTemplate(store);
    if (!active) return;

    const project = toProject({
      templates: [active],
      print: {
        paper: store.paper,
        gap: store.gap,
        allowRotate: store.allowRotate,
        align: store.align,
        cropMark: store.cropMark,
        showRuler: store.showRuler,
        duplex: store.duplex,
        fillEmptyBack: store.fillEmptyBack,
        comboSheets: store.comboSheets,
        cutStack: store.cutStack,
        cutStackGroup: store.cutStackGroup,
        unprintable: store.unprintable,
      },
      fonts: store.userFonts.map((f) => ({ id: f.id, name: f.name })),
      images: store.userImages.map((i) => ({ id: i.id, name: i.name })),
    });

    const json = JSON.stringify(project, null, 2);
    // 날짜를 붙인다. 같은 이름으로 덮어써서 어느 것이 최신인지 잃는 일이 잦다.
    const filename = `${active.name}_${new Date().toISOString().slice(0, 10)}.json`;

    // 지원하는 브라우저(크롬 계열)에서는 저장 위치를 직접 고르게 한다 — 한 번
    // "양식저장" 폴더를 고르면, 브라우저가 다음번에도 그 폴더를 기억해준다.
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        setNotice({ kind: 'ok', text: `'${active.name}' 양식을 저장했습니다.` });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // 사용자가 취소함
        // 다른 이유로 실패하면 아래 다운로드 방식으로 대신한다.
      }
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setNotice({ kind: 'ok', text: `'${active.name}' 양식을 저장했습니다.` });
  }

  async function open(files: FileList | null) {
    if (!files || files.length === 0) return;
    setNotice(null);

    let addedCount = 0;
    const missingF = new Set<string>();
    const missingI = new Set<string>();
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const parsed = readProject(JSON.parse(await file.text()));
        if ('error' in parsed) {
          errors.push(`${file.name}: ${parsed.error}`);
          continue;
        }
        store.importTemplates(toTemplates(parsed.ok));
        addedCount += parsed.ok.templates.length;
        for (const name of missingFonts(parsed.ok, hasFont)) missingF.add(name);
        for (const name of missingImages(parsed.ok, hasImage)) missingI.add(name);
      } catch {
        errors.push(`${file.name}: JSON이 아닌 것 같습니다.`);
      }
    }

    const parts = [
      missingF.size > 0 && `글꼴 ${missingF.size}개(${[...missingF].join(', ')})`,
      missingI.size > 0 && `이미지 ${missingI.size}개(${[...missingI].join(', ')})`,
    ].filter((p): p is string => !!p);
    const errorSuffix = errors.length > 0 ? ` (${errors.join(' / ')})` : '';

    if (addedCount === 0) {
      setNotice({ kind: 'error', text: errors.length > 0 ? errors.join(' / ') : '불러올 양식이 없습니다.' });
      return;
    }

    setNotice(
      parts.length > 0
        ? {
            kind: 'warn',
            text: `양식 ${addedCount}개를 불러왔습니다. ${parts.join(', ')}를 다시 등록해야 합니다. 같은 이름으로 등록하면 되살아납니다.${errorSuffix}`,
          }
        : { kind: 'ok', text: `양식 ${addedCount}개를 불러왔습니다.${errorSuffix}` },
    );
  }

  return (
    <>
      <button className="ghost" onClick={() => void save()} title="지금 편집 중인 양식 하나를 파일로 저장합니다">
        저장
      </button>
      <button
        className="ghost"
        onClick={() => fileRef.current?.click()}
        title="저장해둔 양식 파일을 지금 프로젝트에 더합니다 (여러 개를 한 번에 고를 수 있어요)"
      >
        불러오기
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        multiple
        hidden
        onChange={(e) => {
          void open(e.target.files);
          // 같은 파일을 다시 고를 수 있게 비운다.
          e.target.value = '';
        }}
      />

      {notice && (
        <div className={`notice notice-${notice.kind}`} onClick={() => setNotice(null)}>
          {notice.text}
          <span className="notice-close">닫기</span>
        </div>
      )}
    </>
  );
}
