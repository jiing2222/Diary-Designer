import { useRef, useState } from 'react';
import { hasImage, IMAGE_ACCEPT, registerImage, type UserImage } from '../images/registry';
import { useStore } from '../store';
import { Modal } from './GalleryTab';

/**
 * 이미지 썸네일 그리드. 고르기 창(ImagePickerDialog)과 관리 창
 * (ImageLibraryDialog)이 함께 쓴다 — 늘어놓고 지우는 모양은 똑같고, 고르기
 * 창만 클릭해서 바로 씌우는 동작(onPick)이 하나 더 있을 뿐이다.
 */
function ImageThumbGrid({ images, onPick }: { images: UserImage[]; onPick?: (id: string) => void }) {
  const removeUserImage = useStore((s) => s.removeUserImage);

  return (
    <div className="image-picker-grid">
      {images.map((img) => (
        <div key={img.id} className="image-picker-item">
          {onPick ? (
            <button
              type="button"
              className="image-picker-thumb"
              onClick={() => onPick(img.id)}
              title={img.name}
            >
              <img src={img.url} alt={img.name} />
            </button>
          ) : (
            <div className="image-picker-thumb" title={img.name}>
              <img src={img.url} alt={img.name} />
            </div>
          )}
          <button
            type="button"
            className="image-picker-remove"
            onClick={(e) => {
              e.stopPropagation();
              removeUserImage(img.id);
            }}
            title="자주 쓰는 이미지 목록에서 빼기 — 지금 어딘가에 쓰는 중이면 안 빠집니다"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * 빈 이미지 상자를 더블클릭했을 때 뜨는 창.
 *
 * 곧바로 OS 파일 창을 열던 것을, 자주 쓰는(예전에 등록했던) 이미지를 먼저
 * 보여주고 고르게 바꿨다 — 매번 같은 사진을 다시 파일에서 찾지 않아도 된다.
 * "파일 불러오기"는 그대로 있다, 새 이미지를 쓰려면 여전히 필요하다.
 *
 * 목록은 `userImages`(images/registry가 새로고침 뒤에도 IndexedDB에서
 * 되살리는 그 목록)를 그대로 쓴다 — 따로 "즐겨찾기"로 관리하지 않는다,
 * 한 번 쓴 이미지는 전부 여기 뜬다.
 */
export function ImagePickerDialog({
  onPick,
  onAddFile,
  onClose,
}: {
  onPick: (imageId: string) => void;
  onAddFile: () => void;
  onClose: () => void;
}) {
  const userImages = useStore((s) => s.userImages);
  // 파일 없이 이름만 남은 것(저장 파일에서 막 열어 다시 등록 안 한 것)은
  // 썸네일을 그릴 수 없으니 뺀다 — 지금 이 창의 목적은 "바로 쓸 수 있는"
  // 이미지를 고르는 것이다.
  const usable = userImages.filter((i) => i.url);

  return (
    <Modal title="이미지 고르기" onClose={onClose}>
      {usable.length === 0 ? (
        <p className="modal-note">아직 자주 쓰는 이미지가 없습니다. 파일을 불러오면 다음부터 여기 뜹니다.</p>
      ) : (
        <ImageThumbGrid images={usable} onPick={onPick} />
      )}
      <button className="ghost" onClick={onAddFile}>
        파일 불러오기…
      </button>
    </Modal>
  );
}

/**
 * 이미지 관리 창 — 양식 관리 화면 위쪽 "이미지 관리" 버튼으로 연다.
 *
 * ImagePickerDialog와 달리 **어느 이미지 상자를 겨냥한 게 아니다** — 그냥
 * 지금까지 쓴(그래서 IndexedDB에 남아 있는) 이미지를 훑어보고 안 쓰는
 * 것을 지우거나, 나중에 쓸 이미지를 미리 등록해두는 자리다. 그래서
 * 썸네일을 눌러도 아무 데도 안 씌운다 — 지우기만 있다.
 */
export function ImageLibraryDialog({ onClose }: { onClose: () => void }) {
  const userImages = useStore((s) => s.userImages);
  const addUserImage = useStore((s) => s.addUserImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const usable = userImages.filter((i) => i.url);

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
    <Modal title="이미지 관리" onClose={onClose}>
      <p className="modal-note">
        지금까지 쓴 이미지입니다. 새로고침해도 남아 있고, 빈 이미지 상자를 더블클릭하면 여기서 바로 고를 수
        있습니다.
      </p>
      {usable.length === 0 ? (
        <p className="modal-note">아직 등록한 이미지가 없습니다.</p>
      ) : (
        <ImageThumbGrid images={usable} />
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
    </Modal>
  );
}
