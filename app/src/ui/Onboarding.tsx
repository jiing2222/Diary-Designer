import { useState } from 'react';
import { useStore } from '../store';
import { Modal } from './Modal';
import { DiaryPicker } from './Diaries';
import { findInsertPreset } from '../core/presets';
import { t } from '../lang';

/**
 * 첫 다이어리 온보딩(리뉴얼 7-2, 기본계획 7장 ‘규격 대신 내 다이어리’).
 *
 * 처음 Create를 누를 때 뜬다 — 둘러보러 온 사람을 막지 않고, 크기가 실제로 필요한 순간에 묻는다.
 * 규격을 고르고 실측이 다르면 고친 뒤 [등록하고 시작]: 그 다이어리가 기본이 되고 새 작업이 열린다.
 * 규격을 모르면 ‘잘 모르겠어요’ — 자로 재는 법을 보여주고, 재기 어려우면 M6로 시작한다(2026-10-12 결정).
 */
export function Onboarding() {
  const open = useStore((s) => s.onboarding);
  const finish = useStore((s) => s.finishOnboarding);
  const [unsure, setUnsure] = useState(false);
  if (!open) return null;

  // 어떻게 끝나든(등록·M6로 시작·닫기) 다음에 열 때는 첫 화면부터.
  const done = (diary: Parameters<typeof finish>[0]) => {
    setUnsure(false);
    finish(diary);
  };
  const close = () => done(null);

  return (
    <Modal title={unsure ? t('속지 크기 재는 법', 'How to measure your inserts') : t('어떤 다이어리를 쓰세요?', 'Which planner do you use?')} onClose={close} size="large">
      {unsure ? (
        <div className="onboarding-help">
          <ol>
            <li>
              {t('속지 한 장을 꺼내 가로·세로를 자로 재요(mm, 0.5mm까지).', 'Take out one insert and measure its width and height with a ruler (mm, to 0.5 mm).')}
            </li>
            <li>{t('구멍 수를 세요 — 6개면 A5·A6·Personal·Pocket, 5개면 Mini, 3개면 Micro 쪽이에요.', 'Count the holes: 6 means A5, A6, Personal or Pocket; 5 means Mini; 3 means Micro.')}</li>
            <li>{t('앞 화면에서 가까운 규격을 고르고 잰 크기를 넣으면, ±10mm 안의 규격을 찾아 알려줘요.', "Pick the closest size on the previous screen and enter your measurements. We'll find the size within ±10 mm.")}</li>
          </ol>
          <p className="tool-panel-note">
            {t(
              '재기 어려우면 가장 흔한 Pocket(M6)으로 시작해도 돼요. 나중에 Library → Diaries에서 크기를 고치거나 다른 다이어리를 더할 수 있어요.',
              'If measuring is tricky, start with Pocket (M6), the most common size. You can change it or add planners later in Library → Diaries.',
            )}
          </p>
          <div className="card-dialog-actions">
            <button className="ghost" onClick={() => setUnsure(false)}>
              {t('재 볼게요', "I'll measure")}
            </button>
            <button className="primary" onClick={() => done({ presetId: 'M6', name: findInsertPreset('M6')!.name })}>
              {t('Pocket(M6)으로 시작', 'Start with Pocket (M6)')}
            </button>
          </div>
        </div>
      ) : (
        <div className="onboarding">
          <p className="modal-note">
            {t(
              '처음 한 번만 물어봐요. 고른 다이어리가 기본 다이어리가 되어 새 작업이 이 크기로 시작해요. 같은 규격이라도 바인더마다 실측이 다르면 고쳐 주세요.',
              "We only ask once. The planner you pick becomes your default, and new works start at its size. Binders vary, so adjust the measurements if yours differ.",
            )}
          </p>
          <DiaryPicker
            submitLabel={t('등록하고 시작', 'Save and start')}
            onSubmit={(presetId, name, size) => done({ presetId, name, size })}
          />
          <button className="ghost onboarding-unsure" onClick={() => setUnsure(true)}>
            {t('잘 모르겠어요', "I'm not sure")}
          </button>
        </div>
      )}
    </Modal>
  );
}
