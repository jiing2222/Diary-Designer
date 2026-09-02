import { useEffect } from 'react';
import { useStore } from '../store';

const AUTO_DISMISS_MS = 10_000;

/**
 * 오른쪽 아래에 잠깐 뜨는 안내. store의 `toast` 상태를 그대로 보여주고,
 * 10초 뒤 스스로 지운다.
 *
 * 그사이 새 안내로 갈리면(key가 바뀌면) 이 효과가 다시 걸려 그 새 안내
 * 기준으로 10초를 다시 잰다 — `dismissToast`가 지금 떠 있는 것과 key가
 * 같을 때만 지우므로, 먼저 뜬 안내의 옛 타이머가 나중 안내를 잘못
 * 지우는 일은 없다.
 */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismissToast(toast.key), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div className="toast" role="status">
      {toast.message}
    </div>
  );
}
