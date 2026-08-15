import { useStore } from '../store';
import { Modal } from './GalleryTab';

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
  const removeUserImage = useStore((s) => s.removeUserImage);
  // 파일 없이 이름만 남은 것(저장 파일에서 막 열어 다시 등록 안 한 것)은
  // 썸네일을 그릴 수 없으니 뺀다 — 지금 이 창의 목적은 "바로 쓸 수 있는"
  // 이미지를 고르는 것이다.
  const usable = userImages.filter((i) => i.url);

  return (
    <Modal title="이미지 고르기" onClose={onClose}>
      {usable.length === 0 ? (
        <p className="modal-note">아직 자주 쓰는 이미지가 없습니다. 파일을 불러오면 다음부터 여기 뜹니다.</p>
      ) : (
        <div className="image-picker-grid">
          {usable.map((img) => (
            <div key={img.id} className="image-picker-item">
              <button
                type="button"
                className="image-picker-thumb"
                onClick={() => onPick(img.id)}
                title={img.name}
              >
                <img src={img.url} alt={img.name} />
              </button>
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
      )}
      <button className="ghost" onClick={onAddFile}>
        파일 불러오기…
      </button>
    </Modal>
  );
}
