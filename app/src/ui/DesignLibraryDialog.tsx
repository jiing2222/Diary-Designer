import { useRef, useState } from 'react';
import { FONT_ACCEPT, fontLabelOf, hasFont, registerFont, type UserFont } from '../fonts/registry';
import { IMAGE_ACCEPT, hasImage, imageLabelOf, registerImage } from '../images/registry';
import { useStore } from '../store';
import { Modal } from './GalleryTab';

/** "최근 사용" 개수 제한. store.ts의 RECENT_IMAGE_CAP과 같은 값 — 화면 안내문에만 쓴다. */
const RECENT_IMAGE_CAP = 10;

/**
 * 디자인 관리 — 양식 관리 화면 위쪽 "디자인 관리" 버튼으로 연다.
 *
 * 지금까지 등록한 이미지·글꼴을 훑어보고, 이름을 바꾸거나 계속 남길 것을
 * 고르는 자리다. 이미지는 핀터레스트처럼 원본 비율대로 늘어놓는다(CSS
 * `columns` — 매소너리를 계산 없이 만드는 가장 단순한 방법이다).
 */
export function DesignLibraryDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'image' | 'font'>('image');

  return (
    <Modal title="디자인 관리" onClose={onClose} size="large">
      <div className="design-tabs">
        <button type="button" className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}>
          이미지
        </button>
        <button type="button" className={tab === 'font' ? 'on' : ''} onClick={() => setTab('font')}>
          글꼴
        </button>
      </div>
      {tab === 'image' ? <ImageManagePanel /> : <FontManagePanel />}
    </Modal>
  );
}

function ImageManagePanel() {
  const userImages = useStore((s) => s.userImages);
  const addUserImage = useStore((s) => s.addUserImage);
  const renameUserImage = useStore((s) => s.renameUserImage);
  const saveUserImage = useStore((s) => s.saveUserImage);
  const unsaveUserImage = useStore((s) => s.unsaveUserImage);
  const removeUserImage = useStore((s) => s.removeUserImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // 파일 없이 이름만 남은 것(저장 파일에서 막 열어 다시 등록 안 한 것)은
  // 원본 비율을 알 수 없어 매소너리에 놓을 수 없으니 뺀다.
  const usable = userImages.filter((i) => i.url);
  const savedCount = usable.filter((i) => i.saved).length;
  const recentCount = usable.length - savedCount;

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const name = file.name.replace(/\.[^.]+$/, '');
      const orphan = userImages.find((i) => i.name === name && !hasImage(i.id));
      addUserImage(await registerImage(file, orphan?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 읽지 못했습니다');
    }
  }

  return (
    <>
      <p className="modal-note">
        저장한 이미지는 계속 남습니다. 저장하지 않은 "최근 사용" 이미지는 최대 {RECENT_IMAGE_CAP}개까지만 남고,
        지금 어느 양식에도 안 쓰는 중인 것부터 오래된 순으로 자동으로 지워집니다.
      </p>
      {usable.length > 0 && (
        <p className="modal-note">
          저장 {savedCount}개 · 최근 사용 {recentCount}/{RECENT_IMAGE_CAP}개
        </p>
      )}

      {usable.length === 0 ? (
        <p className="modal-note">아직 등록한 이미지가 없습니다.</p>
      ) : (
        <div className="design-grid">
          {usable.map((img) => (
            <div key={img.id} className="design-item">
              <div className="design-thumb">
                <img src={img.url} alt={imageLabelOf(img)} />
              </div>

              {renamingId === img.id ? (
                <input
                  className="design-name-input"
                  defaultValue={imageLabelOf(img)}
                  autoFocus
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v) renameUserImage(img.id, v);
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="design-name"
                  onDoubleClick={() => setRenamingId(img.id)}
                  title="더블클릭해서 이름 바꾸기"
                >
                  {imageLabelOf(img)}
                </button>
              )}

              <div className="design-actions">
                <button
                  type="button"
                  className={`ghost design-save ${img.saved ? 'on' : ''}`}
                  onClick={() => (img.saved ? unsaveUserImage(img.id) : saveUserImage(img.id))}
                  title={
                    img.saved
                      ? '저장 해제 — 다시 최근 사용으로 (오래되면 자동으로 지워질 수 있습니다)'
                      : '저장 — 계속 남깁니다'
                  }
                >
                  {img.saved ? '★ 저장됨' : '☆ 저장'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeUserImage(img.id)}
                  title="지금 지우기 — 어딘가에 쓰는 중이면 안 지워집니다"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="modal-note warn">{error}</p>}
      <button className="ghost" onClick={() => fileRef.current?.click()}>
        파일 추가…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}

function FontManagePanel() {
  const userFonts = useStore((s) => s.userFonts);
  const addUserFont = useStore((s) => s.addUserFont);
  const renameUserFont = useStore((s) => s.renameUserFont);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const name = file.name.replace(/\.[^.]+$/, '');
      const orphan = userFonts.find((f) => f.name === name && !hasFont(f.id));
      addUserFont(await registerFont(file, orphan?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '글꼴을 읽지 못했습니다');
    }
  }

  return (
    <>
      <p className="modal-note">지금까지 등록한 글꼴입니다. 이름은 목록·속성 막대에 함께 반영됩니다.</p>

      {userFonts.length === 0 ? (
        <p className="modal-note">아직 등록한 글꼴이 없습니다.</p>
      ) : (
        <div className="font-manage-list">
          {userFonts.map((f) => (
            <FontRow key={f.id} font={f} renaming={renamingId === f.id} setRenaming={setRenamingId} onRename={renameUserFont} />
          ))}
        </div>
      )}

      {error && <p className="modal-note warn">{error}</p>}
      <button className="ghost" onClick={() => fileRef.current?.click()}>
        파일 추가…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={FONT_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}

function FontRow({
  font,
  renaming,
  setRenaming,
  onRename,
}: {
  font: UserFont;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
  onRename: (id: string, label: string) => void;
}) {
  const loaded = hasFont(font.id);

  return (
    <div className="font-manage-row">
      <span className="font-manage-preview" style={loaded ? { fontFamily: font.family } : undefined}>
        가나다 ABC
      </span>
      {renaming ? (
        <input
          className="design-name-input"
          defaultValue={fontLabelOf(font)}
          autoFocus
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onRename(font.id, v);
            setRenaming(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setRenaming(null);
          }}
        />
      ) : (
        <button type="button" className="design-name" onDoubleClick={() => setRenaming(font.id)} title="더블클릭해서 이름 바꾸기">
          {fontLabelOf(font)}
          {!loaded && ' (파일 없음)'}
        </button>
      )}
    </div>
  );
}
