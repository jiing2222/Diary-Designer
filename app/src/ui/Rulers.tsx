import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { rulerTicks } from '../core/ruler';
import type { Mm } from '../core/units';
import { t } from '../lang';

/** 눈금자의 두께(px). 캔버스가 이만큼 비켜 앉는다(styles.css `.with-rulers`). */
export const RULER_PX = 18;

/**
 * 편집 화면 위·왼쪽의 mm 눈금자(리뉴얼 9-1, 2026-10-13 결정: 위·왼쪽). 0은 지금 편집 중인 속지의 왼쪽 위.
 * 눈금은 core/ruler가 고르고, 여기서는 그 속지가 화면 어디에 있는지 재서(스크롤·확대·창 크기가 바뀔 때마다)
 * 맞춰 그리기만 한다. 고른 것의 범위는 띠로, 마우스 자리는 선으로 보여준다. 인쇄되지 않는다.
 */
export function Rulers({
  canvasRef,
  sheetRef,
  width,
  height,
  scale,
  band,
  mark,
  layoutKey,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  sheetRef: RefObject<SVGSVGElement | null>;
  width: Mm;
  height: Mm;
  /** 1mm가 화면에서 몇 px인지. */
  scale: number;
  /** 고른 것의 범위(mm). */
  band: { x: Mm; y: Mm; width: Mm; height: Mm } | null;
  /** 마우스 자리(mm). */
  mark: { x: Mm; y: Mm } | null;
  /** 속지 자리가 바뀌는 것들(펼침면·앞뒤 등) — 바뀌면 다시 잰다. */
  layoutKey: string;
}) {
  // 속지 왼쪽 위가 캔버스 안에서 어디인지(px), 캔버스의 보이는 크기.
  const [at, setAt] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const measure = () => {
    const canvas = canvasRef.current;
    const sheet = sheetRef.current;
    if (!canvas || !sheet) return;
    const c = canvas.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    const next = { x: s.left - c.left, y: s.top - c.top, w: canvas.clientWidth, h: canvas.clientHeight };
    setAt((prev) => (prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
  };

  // 확대·크기·펼침면·앞뒤가 바뀌면 속지 자리가 바뀐다. 같으면 다시 그리지 않는다.
  // measure는 ref만 읽는다 — 바뀌는 것은 아래 값들뿐이다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [scale, width, height, layoutKey]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => {
      canvas.removeEventListener('scroll', measure);
      ro.disconnect();
    };
    // measure는 ref만 읽는다 — 처음 한 번 걸면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]);

  return (
    <>
      <div className="ruler ruler-top" style={{ left: RULER_PX, height: RULER_PX }}>
        <Ruler
          along={at.w}
          origin={at.x}
          length={width}
          scale={scale}
          band={band && [band.x, band.x + band.width]}
          mark={mark?.x ?? null}
          vertical={false}
        />
      </div>
      <div className="ruler ruler-left" style={{ top: RULER_PX, width: RULER_PX }}>
        <Ruler
          along={at.h}
          origin={at.y}
          length={height}
          scale={scale}
          band={band && [band.y, band.y + band.height]}
          mark={mark?.y ?? null}
          vertical
        />
      </div>
      <div className="ruler ruler-corner" style={{ width: RULER_PX, height: RULER_PX }} title={t('단위 mm', 'Units: mm')}>
        mm
      </div>
    </>
  );
}

const TICK_LEN = { major: 9, mid: 6, minor: 3 } as const;

/** 눈금자 한 줄. 가로로 그린 뒤 세로면 돌린다 — 눈금 계산을 두 번 쓰지 않게. */
function Ruler({
  along,
  origin,
  length,
  scale,
  band,
  mark,
  vertical,
}: {
  along: number;
  origin: number;
  length: Mm;
  scale: number;
  band: [Mm, Mm] | null;
  mark: Mm | null;
  vertical: boolean;
}) {
  const px = (mm: Mm) => origin + mm * scale;
  const ticks = rulerTicks(length, scale);
  return (
    <svg
      width={vertical ? RULER_PX : along}
      height={vertical ? along : RULER_PX}
      aria-hidden="true"
      className="ruler-svg"
    >
      <g transform={vertical ? `matrix(0 1 1 0 0 0)` : undefined}>
        <rect className="ruler-sheet" x={px(0)} y={0} width={length * scale} height={RULER_PX} />
        {band && (
          <rect className="ruler-band" x={px(band[0])} y={0} width={(band[1] - band[0]) * scale} height={RULER_PX} />
        )}
        {ticks.map((t) => (
          <line
            key={t.mm}
            className={`ruler-tick ${t.kind}`}
            x1={px(t.mm)}
            x2={px(t.mm)}
            y1={RULER_PX}
            y2={RULER_PX - TICK_LEN[t.kind]}
          />
        ))}
        {mark !== null && <line className="ruler-mark" x1={px(mark)} x2={px(mark)} y1={0} y2={RULER_PX} />}
      </g>
      {/* 숫자는 돌린 묶음 밖에서 — 축을 맞바꾸는 변환은 글자를 거울처럼 뒤집는다. 세로는 아래에서 위로 읽힌다. */}
      {ticks
        .filter((t) => t.label)
        .map((t) => (
          <text
            key={`l${t.mm}`}
            className="ruler-label"
            textAnchor={vertical ? 'end' : undefined}
            transform={vertical ? `translate(10 ${px(t.mm) + 2}) rotate(-90)` : `translate(${px(t.mm) + 2} 8)`}
          >
            {t.label}
          </text>
        ))}
    </svg>
  );
}
