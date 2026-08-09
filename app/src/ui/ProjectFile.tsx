import { useRef, useState } from 'react';
import { missingFonts, missingImages, readProject, toProject } from '../core/project';
import { hasFont } from '../fonts/registry';
import { hasImage } from '../images/registry';
import { useStore } from '../store';

/**
 * 작업 저장하기 · 불러오기.
 *
 * 양식 전체를 파일 하나로 주고받는다. 탭이 아니라 맨 위에 둔 이유는, 저장이
 * **지금 보고 있는 양식 하나가 아니라 작업 전체**에 대한 일이기 때문이다.
 *
 * 브라우저에만 두지 않고 파일로 내보낸다. 이 프로그램은 서버가 없어서 새로고침
 * 한 번에 작업이 사라진다 — 손에 쥘 수 있는 파일이 있어야 안심하고 쓴다.
 */
export function ProjectFile() {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  function save() {
    const project = toProject({
      templates: store.templates,
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

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 날짜를 붙인다. 같은 이름으로 덮어써서 어느 것이 최신인지 잃는 일이 잦다.
    a.download = `속지양식_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setNotice({ kind: 'ok', text: `양식 ${project.templates.length}개를 저장했습니다.` });
  }

  async function open(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const parsed = readProject(JSON.parse(await file.text()));
      if ('error' in parsed) {
        setNotice({ kind: 'error', text: parsed.error });
        return;
      }

      store.loadProject(parsed.ok);

      // 글꼴·이미지는 이름만 담긴다. 무엇을 다시 등록해야 하는지 알려준다.
      const missingF = missingFonts(parsed.ok, hasFont);
      const missingI = missingImages(parsed.ok, hasImage);
      const parts = [
        missingF.length > 0 && `글꼴 ${missingF.length}개(${missingF.join(', ')})`,
        missingI.length > 0 && `이미지 ${missingI.length}개(${missingI.join(', ')})`,
      ].filter((p): p is string => !!p);

      setNotice(
        parts.length > 0
          ? {
              kind: 'warn',
              text: `불러왔습니다. ${parts.join(', ')}를 다시 등록해야 합니다. 같은 이름으로 등록하면 되살아납니다.`,
            }
          : { kind: 'ok', text: `양식 ${parsed.ok.templates.length}개를 불러왔습니다.` },
      );
    } catch {
      setNotice({ kind: 'error', text: '파일을 읽을 수 없습니다. JSON이 아닌 것 같습니다.' });
    }
  }

  return (
    <>
      <button className="ghost" onClick={save} title="양식 전체를 파일로 저장합니다">
        저장
      </button>
      <button className="ghost" onClick={() => fileRef.current?.click()} title="저장해둔 파일 열기">
        불러오기
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void open(e.target.files?.[0]);
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
