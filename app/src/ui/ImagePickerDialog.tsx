import { imageLabelOf, type UserImage } from '../images/registry';
import { libraryImages } from '../core/assets';
import { useStore } from '../store';
import { removeAssetWithConfirm } from './removeAsset';
import { Modal } from './Modal';
import { t } from '../lang';

/**
 * 이미지 썸네일 그리드 — 빈 이미지 상자를 더블클릭했을 때 뜨는 고르기
 * 창(ImagePickerDialog)이 쓴다. 정사각형으로 크롭한 작은 그리드다 — 훑어보고
 * 빨리 고르는 자리라 원본 비율까지 살릴 필요는 없다(원본 비율로 크게
 * 보려면 Library → Images). ×는 Library의 지우기와 같은 확인을 거친다.
 */
export function ImageThumbGrid({ images, onPick }: { images: UserImage[]; onPick?: (id: string) => void }) {
  return (
    <div className="image-picker-grid">
      {images.map((img) => (
        <div key={img.id} className="image-picker-item">
          {onPick ? (
            <button
              type="button"
              className="image-picker-thumb"
              onClick={() => onPick(img.id)}
              title={imageLabelOf(img)}
            >
              <img src={img.url} alt={imageLabelOf(img)} />
            </button>
          ) : (
            <div className="image-picker-thumb" title={imageLabelOf(img)}>
              <img src={img.url} alt={imageLabelOf(img)} />
            </div>
          )}
          <button
            type="button"
            className="image-picker-remove"
            onClick={(e) => {
              e.stopPropagation();
              removeAssetWithConfirm('image', img.id, imageLabelOf(img));
            }}
            title={t('Library에서 지우기 — 쓰는 중이면 목록에서만 빠지고 작업에는 남아요', "Remove from Library. If it's in use, it stays in your works")}
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
  const usable = libraryImages(userImages).filter((i) => i.url);

  return (
    <Modal title={t('이미지 고르기', 'Choose an image')} onClose={onClose}>
      {usable.length === 0 ? (
        <p className="modal-note">{t('아직 올린 이미지가 없어요. 파일을 불러오면 Library에 남아 다음부터 여기 떠요.', 'No images yet. Images you open are kept in the Library and show up here next time.')}</p>
      ) : (
        <ImageThumbGrid images={usable} onPick={onPick} />
      )}
      <button className="ghost" onClick={onAddFile}>
        {t('파일 불러오기…', 'Open file…')}
      </button>
    </Modal>
  );
}
