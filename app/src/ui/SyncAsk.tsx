import { useStore } from '../store';
import { answerSyncAsk } from './cloudSync';
import { Modal } from './Modal';
import { t } from '../lang';

/**
 * 처음 이 계정에 맞출 때 — 이 기기 자료를 올릴지 묻는다(리뉴얼 8-2, 2026-10-13 결정).
 * 공용 컴퓨터에서 로그인했을 때 남의 작업이 계정에 섞이지 않게 저절로 올리지 않는다.
 */
export function SyncAsk() {
  const ask = useStore((s) => s.syncAsk);
  if (!ask) return null;
  return (
    <Modal title={t('이 기기의 작업을 계정에 올릴까요?', 'Upload the works on this device to your account?')} onClose={() => answerSyncAsk(false)}>
      <p className="modal-note">
        {t(
          `이 기기에 작업 ${ask.works}개${ask.total > ask.works ? `(다이어리·폴더·스타일 등을 합쳐 ${ask.total}개)` : ''}가 있어요. 올리면 같은 계정으로 로그인한 다른 기기에서도 이어서 쓸 수 있어요.`,
          `This device has ${ask.works} work(s)${ask.total > ask.works ? ` (${ask.total} items including diaries, folders and styles)` : ''}. Upload them to keep working on any device signed in to this account.`,
        )}
      </p>
      <p className="modal-note">
        {t(
          '올리지 않으면 계정의 작업만 받아오고, 지금 있는 것은 이 기기에만 남아요. 이후에 새로 만든 것은 계정에 올라가요.',
          "If you don't, only your account's works are downloaded and what's here stays on this device. Anything new you make is uploaded.",
        )}
      </p>
      <div className="card-dialog-actions">
        <button className="ghost" onClick={() => answerSyncAsk(false)}>
          {t('이 기기에만 두기', 'Keep on this device')}
        </button>
        <button className="primary" autoFocus onClick={() => answerSyncAsk(true)}>
          {t('계정에 올리기', 'Upload')}
        </button>
      </div>
    </Modal>
  );
}
