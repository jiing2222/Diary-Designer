import { assetUseOf, useStore } from '../store';
import { t } from '../lang';

/**
 * Library에서 지운다 — 쓰는 작업이 있으면 ‘목록에서만 빠져요’를 먼저 알린다(세부계획 B 결정 2026-10-11).
 * 편집기의 이미지 썸네일(×)도 이것을 쓴다 — 어디서 지우든 같은 확인을 거친다.
 */
export function removeAssetWithConfirm(kind: 'image' | 'font', id: string, label: string): void {
  const s = useStore.getState();
  const { count, retained } = assetUseOf(s, kind, id);
  const question =
    count > 0
      ? t(`‘${label}’은(는) 작업 ${count}개에서 쓰는 중이에요(휴지통 포함). 목록에서만 빠지고 작업에는 그대로 남아요. 뺄까요?`, `“${label}” is used in ${count} work(s), including the trash. It'll only leave this list and stay in those works. Remove it?`)
      : retained
        ? t(`‘${label}’은(는) 글자 설정이나 되돌리기·복사 기록에서 필요해요. 목록에서만 빠지고 파일은 남아요. 뺄까요?`, `“${label}” is still needed by text settings or undo/copy history. It'll only leave this list; the file stays. Remove it?`)
        : t(`‘${label}’을(를) 지울까요? 파일도 지워져요.`, `Delete “${label}”? The file is deleted too.`);
  if (!window.confirm(question)) return;
  const result = kind === 'image' ? s.removeUserImage(id) : s.removeUserFont(id);
  if (result === 'hidden') s.showToast(t('목록에서 뺐어요. 쓰던 작업에는 그대로 있어요.', 'Removed from the list. Works that use it keep it.'));
}
