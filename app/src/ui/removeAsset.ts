import { assetUseOf, useStore } from '../store';

/**
 * Library에서 지운다 — 쓰는 작업이 있으면 ‘목록에서만 빠져요’를 먼저 알린다(세부계획 B 결정 2026-10-11).
 * 편집기의 이미지 썸네일(×)도 이것을 쓴다 — 어디서 지우든 같은 확인을 거친다.
 */
export function removeAssetWithConfirm(kind: 'image' | 'font', id: string, label: string): void {
  const s = useStore.getState();
  const { count, retained } = assetUseOf(s, kind, id);
  const question =
    count > 0
      ? `‘${label}’은(는) 작업 ${count}개에서 쓰는 중이에요(휴지통 포함). 목록에서만 빠지고 작업에는 그대로 남아요. 뺄까요?`
      : retained
        ? `‘${label}’은(는) 글자 설정이나 되돌리기·복사 기록에서 필요해요. 목록에서만 빠지고 파일은 남아요. 뺄까요?`
        : `‘${label}’을(를) 지울까요? 파일도 지워져요.`;
  if (!window.confirm(question)) return;
  const result = kind === 'image' ? s.removeUserImage(id) : s.removeUserFont(id);
  if (result === 'hidden') s.showToast('목록에서 뺐어요. 쓰던 작업에는 그대로 있어요.');
}
