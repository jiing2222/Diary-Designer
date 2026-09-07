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
 * 고르는 자리다. 이미지는 사진 크기와 무관하게 늘 같은 정사각 칸에
 * 놓인다(처음엔 원본 비율대로 매소너리로 늘어놓았지만, 사진 크기에 따라
 * 창 전체 높이가 들쭉날쭉해져서 고정 칸으로 바꿨다) — 칸은
 * `object-fit: contain`으로 사진 전체를 잘리지 않고 보여준다.
 */
export function DesignLibraryDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'image' | 'font'>('image');

  return (
    <Modal title="Library" onClose={onClose} size="large">
      <div className="design-tabs">
        <button type="button" className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}>
          Images
        </button>
        <button type="button" className={tab === 'font' ? 'on' : ''} onClick={() => setTab('font')}>
          Fonts
        </button>
      </div>
      {tab === 'image' ? <ImageManagePanel /> : <FontManagePanel />}
    </Modal>
  );
}

export function ImageManagePanel() {
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
      setError(e instanceof Error ? e.message : "Couldn't read that image");
    }
  }

  return (
    <>
      <p className="modal-note">
        Starred images are kept forever. Unstarred ones stay only as the {RECENT_IMAGE_CAP} most
        recent — the oldest ones no template is using are pruned first.
      </p>
      {usable.length > 0 && (
        <p className="modal-note">
          {savedCount} starred · {recentCount}/{RECENT_IMAGE_CAP} recent
        </p>
      )}

      {usable.length === 0 ? (
        <p className="modal-note">No images yet.</p>
      ) : (
        <div className="design-grid">
          {usable.map((img) => (
            <div key={img.id}>
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
                  title="Double-click to rename"
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
                      ? 'Unstar — back to recent (may be pruned once it ages out)'
                      : 'Star — keep forever'
                  }
                >
                  {img.saved ? '★ Starred' : '☆ Star'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeUserImage(img.id)}
                  title="Delete now — refused if a template still uses it"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="modal-note warn">{error}</p>}
      <button className="ghost" onClick={() => fileRef.current?.click()}>
        Add file…
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

export function FontManagePanel() {
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
      setError(e instanceof Error ? e.message : "Couldn't read that font");
    }
  }

  return (
    <>
      <p className="modal-note">Fonts you have added. Renaming one updates it in the list and the property bar.</p>

      {userFonts.length === 0 ? (
        <p className="modal-note">No fonts yet.</p>
      ) : (
        <div className="font-manage-list">
          {userFonts.map((f) => (
            <FontRow key={f.id} font={f} renaming={renamingId === f.id} setRenaming={setRenamingId} onRename={renameUserFont} />
          ))}
        </div>
      )}

      {error && <p className="modal-note warn">{error}</p>}
      <button className="ghost" onClick={() => fileRef.current?.click()}>
        Add file…
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
        Aa Bb Cc 123
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
        <button type="button" className="design-name" onDoubleClick={() => setRenaming(font.id)} title="Double-click to rename">
          {fontLabelOf(font)}
          {!loaded && ' (file missing)'}
        </button>
      )}
    </div>
  );
}
