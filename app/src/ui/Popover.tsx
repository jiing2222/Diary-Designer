import { useEffect, useRef, useState } from 'react';

/**
 * 상단 꾸미기 막대의 말풍선(세부계획 A0 결정 — Canva식 막대 + 팝오버).
 *
 * 자주 쓰는 것만 막대에 두고, 숫자를 넣는 설정은 `간격 ▾` 같은 단추를 누르면 라벨과
 * 함께 뜨는 말풍선에 둔다. 바깥을 누르거나 Esc로 닫힌다.
 *
 * 말풍선은 막대(.editor-bar) 안에 있다 — 글자를 쓰는 중에 말풍선의 칸을 눌러도 입력이
 * 확정되지 않는다(Editor의 TextInput onBlur가 막대 안으로 옮겨가는 포커스는 넘긴다).
 */
export function Pop({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
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
    <span className="pop" ref={ref}>
      <button type="button" className={`pop-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} title={title}>
        {label} ▾
      </button>
      {open && <div className="pop-panel">{children}</div>}
    </span>
  );
}

/** 말풍선·왼쪽 패널 안의 한 줄 — 라벨을 늘 붙인다(세부계획 A3: 단위만 보이는 칸을 만들지 않는다). */
export function PopRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pop-row">
      <span className="pop-row-label">{label}</span>
      <span className="pop-row-field">{children}</span>
    </div>
  );
}
