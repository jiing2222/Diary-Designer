import { useEffect, useRef, useState } from 'react';
import { SlotAssign } from './SlotAssign';
import { ChevronIcon } from './icons';
import type { Layout } from '../core/layout';

/**
 * 인쇄하기 오른쪽 — 칸 배정.
 *
 * **접었다 펼 수 있고 폭도 끌어서 바꾼다.** 칸 배정은 낱장 조합에서만 쓰는
 * 기능이라 늘 자리를 차지하면 그만큼 용지가 좁아지고, 반대로 쓸 때는 칸이
 * 많을수록 넓어야 한다 — 어느 한 폭으로 고정할 수가 없다.
 *
 * 접힌 상태에서도 세로 탭은 남는다. 완전히 사라지면 이런 기능이 있다는
 * 것 자체를 알 수 없다.
 */

/** 접었다 펼 때 돌아갈 폭. 클로드 디자인의 오른쪽 패널과 같은 300px이다. */
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 180;
const MAX_WIDTH = 520;

export function SlotPanel({ layout, sheets }: { layout: Layout; sheets: number }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  /** 끄는 중인지. 끄는 동안에는 화면 전체에서 마우스를 따라간다. */
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      // 오른쪽 패널이라 왼쪽으로 끌수록 넓어진다 — 부호가 반대다.
      const next = d.startWidth + (d.startX - e.clientX);
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    }
    function onUp() {
      dragRef.current = null;
      document.body.classList.remove('resizing-col');
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <>
      {open && (
        <>
          {/*
            폭 손잡이. 패널과 캔버스 사이에 있어서, 끌면 캔버스가 넓어지고
            패널이 좁아진다(또는 반대로).
          */}
          <div
            className="slot-resizer"
            onPointerDown={(e) => {
              dragRef.current = { startX: e.clientX, startWidth: width };
              document.body.classList.add('resizing-col');
            }}
            title="끌어서 폭 조절"
          />
          <div className="slot-panel" style={{ width }}>
            <h2>칸 배정</h2>
            <p className="slot-panel-note">시트·칸마다 다른 속지를 넣을 수 있습니다.</p>
            <SlotAssign layout={layout} sheets={sheets} />
          </div>
        </>
      )}

      {/*
        세로 탭과 그 왼쪽 가장자리에 걸친 동그란 단추 — 왼쪽 도구줄의
        짝이다(디자인). 둘 다 같은 것을 여닫는다: 탭은 "여기 이런 게
        있다"를 알리고, 동그란 단추는 패널을 실제로 밀고 당기는 손잡이다.
      */}
      <div className="slot-rail-wrap">
        <div className="slot-rail">
          <button
            className={`rail-btn ${open ? 'on' : ''}`}
            onClick={() => setOpen((v) => !v)}
            title="칸 배정"
            aria-pressed={open}
          >
            <SlotIcon />
            <span>Slot</span>
          </button>
        </div>

        <button
          className="panel-toggle panel-toggle-right"
          onClick={() => setOpen((v) => !v)}
          title={open ? '칸 배정 닫기' : '칸 배정 열기'}
          aria-expanded={open}
        >
          <ChevronIcon />
        </button>
      </div>
    </>
  );
}

/** 넉 칸으로 나뉜 종이 — 칸 배정을 그림 하나로 나타낸다. */
function SlotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}
