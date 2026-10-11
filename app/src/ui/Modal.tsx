import { useEffect } from 'react';

/**
 * 화면 한가운데 띄우는 창.
 *
 * 바깥을 누르거나 Esc로 닫힌다. 창 안쪽 클릭이 바깥으로 새어나가 저절로 닫히는
 * 일이 없도록 배경에서만 닫기를 받는다.
 */
export function Modal({
  title,
  onClose,
  children,
  size = 'normal',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 'large' — 훑어볼 게 많은 창. 기본은 좁은 팝업. */
  size?: 'normal' | 'large';
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className={`modal ${size === 'large' ? 'modal-large' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
