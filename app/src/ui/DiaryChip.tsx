import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { diarySizeLabel, type Diary } from '../core/diary';
import { outsideObjects } from '../core/library';
import type { Work } from '../core/work';
import { Modal } from './Modal';
import { t } from '../lang';

/**
 * 편집기 위 막대의 다이어리 칩(리뉴얼 7-2, 세부계획 B).
 *
 * 누르면 등록한 다이어리 목록과 ‘Library에서 관리’가 뜬다. 다른 다이어리를 고르면 바로 바꾸지 않고
 * ‘기존 작업을 남길까요?’를 묻는다 — [사본으로 저장]이면 원본은 그대로 두고 새 다이어리의 사본을 열고,
 * [이 작업을 바꾸기]면 이 작업의 다이어리만 바꾼다(2026-10-12 결정). 어느 쪽이든 좌표는 그대로라
 * 새 크기 밖으로 나가는 객체가 있으면 그 수를 먼저 알려준다.
 */
export function DiaryChip({ work, diary, onManage }: { work: Work; diary: Diary; onManage: () => void }) {
  const diaries = useStore((s) => s.diaries);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Diary | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="diary-chip-wrap" ref={ref}>
      <button
        className={`diary-chip ${open ? 'on' : ''}`}
        title={diarySizeLabel(diary)}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="diary-dot" style={{ background: diary.color }} />
        {diary.name} ▾
      </button>
      {open && (
        <div className="popover popover-below diary-chip-pop">
          <h2>{t('다이어리', 'Diary')}</h2>
          {diaries.map((d) => (
            <button
              key={d.id}
              className={`diary-chip-item ${d.id === diary.id ? 'on' : ''}`}
              onClick={() => {
                setOpen(false);
                if (d.id !== diary.id) setTarget(d);
              }}
            >
              <span className="diary-dot" style={{ background: d.color }} />
              <span className="diary-chip-name">{d.name}</span>
              <span className="muted">
                {d.width}×{d.height}
              </span>
              {d.id === diary.id && <span aria-label={t('지금 쓰는 다이어리', 'Current diary')}>✓</span>}
            </button>
          ))}
          <button
            className="ghost diary-chip-manage"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            {t('Library에서 관리 →', 'Manage in Library →')}
          </button>
        </div>
      )}
      {target && <ChangeDiaryDialog work={work} from={diary} to={target} onClose={() => setTarget(null)} />}
    </span>
  );
}

function ChangeDiaryDialog({ work, from, to, onClose }: { work: Work; from: Diary; to: Diary; onClose: () => void }) {
  const outside = outsideObjects(work, to);
  const copy = () => {
    const s = useStore.getState();
    const id = s.duplicateWork(work.id, to.id);
    if (id) {
      s.openWork(id);
      s.showToast(t(`‘${to.name}’ 사본을 열었어요. 원본은 그대로예요.`, `Opened a copy for “${to.name}”. The original is unchanged.`));
    }
    onClose();
  };
  const change = () => {
    useStore.getState().setWorkDiary(work.id, to.id);
    onClose();
  };

  return (
    <Modal title={t('기존 작업을 남길까요?', 'Keep the original?')} onClose={onClose}>
      <p className="modal-note">
        {t(
          `‘${work.name}’의 다이어리를 ${from.name}(${from.width}×${from.height}mm)에서 ${to.name}(${to.width}×${to.height}mm)로 바꿔요. 내용은 같은 위치에 그대로 있고 크기에 맞춰 줄이지 않아요.`,
          `Change the diary of “${work.name}” from ${from.name} (${from.width}×${from.height} mm) to ${to.name} (${to.width}×${to.height} mm). Everything stays where it is and isn't scaled to the new size.`,
        )}
      </p>
      {outside > 0 && (
        <p className="modal-note diary-change-warn">
          {t(`새 크기 밖으로 걸치는 요소가 ${outside}개 있어요. 바꾼 뒤 배치를 확인해 주세요.`, `${outside} item(s) will stick out of the new size. Check the layout after changing.`)}
        </p>
      )}
      <div className="card-dialog-actions">
        <button className="ghost" onClick={onClose}>
          {t('취소', 'Cancel')}
        </button>
        <button className="ghost" onClick={change}>
          {t('이 작업을 바꾸기', 'Change this work')}
        </button>
        <button className="primary" onClick={copy} autoFocus>
          {t('사본으로 저장', 'Save as a copy')}
        </button>
      </div>
    </Modal>
  );
}
