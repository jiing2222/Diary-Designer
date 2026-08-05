import { useId } from 'react';
import { gridArea, gridLattice, gridShapes, type DotGrid } from '../core/grid';
import {
  CONTENT_COLOR,
  DEFAULT_FONT_FAMILY,
  DOT_SIZE,
  GRID_LINE_WIDTH,
  OBJECT_LINE_CAP,
  OBJECT_LINE_COLOR,
  OBJECT_LINE_WIDTH,
  SCREEN_DOT_SIZE,
  SCREEN_GRID_COLOR,
  SCREEN_GRID_LINE_WIDTH,
  TEXT_COLOR,
} from '../core/style';
import { alignOf, anchorX, lineBaselines, sizeOf, splitLines, valignOf } from '../core/text';
import {
  isLine,
  isText,
  type DiaryObject,
  type LineObject,
  type TextObject,
} from '../core/objects';
import type { Mm } from '../core/units';

/** 'edit' — 작업 화면. 도트를 크고 진하게 보여준다. 'print' — 실제로 인쇄될 모습 그대로. */
export type ViewMode = 'edit' | 'print';

/**
 * 속지 한 장의 내용.
 *
 * 편집 화면과 인쇄 미리보기가 **둘 다 이것을 쓴다.** 각자 그리면 언젠가 어긋나는데,
 * 그 어긋남은 인쇄해봐야 알게 된다.
 *
 * 좌표는 속지 왼쪽 위가 원점인 mm다. 칸으로 옮기는 일은 core/place가 하므로
 * 여기서는 용지도 회전도 모른다.
 *
 * 그리는 순서가 곧 층이다. **도트 → 선 → 글자.**
 * 이 순서가 고정이라 나중에 선을 지우면 밑에 있던 도트가 저절로 드러난다.
 */
export function InsertView({
  insert,
  grid,
  objects,
  safeZoneWidth,
  mode = 'edit',
}: {
  insert: { width: Mm; height: Mm };
  grid: DotGrid;
  objects: DiaryObject[];
  safeZoneWidth: Mm;
  mode?: ViewMode;
}) {
  const clipId = useId();
  // 'print' 모드는 인쇄 여부(grid.print)를 따르고, 'edit'는 작업 중 표시 여부(grid.showOnScreen)를 따른다.
  const showDots = mode === 'print' ? grid.print : grid.showOnScreen;

  return (
    <>
      {showDots && (
        <DotGridLayer insert={insert} grid={grid} safeZoneWidth={safeZoneWidth} mode={mode} />
      )}
      <ObjectLayer objects={objects.filter(isLine)} />

      {/*
        글자만 속지 영역으로 자른다. 글자는 자기 상자를 넘칠 수 있지만(설계 원칙),
        속지 자체를 넘어가면 재단선 너머까지 인쇄되어 옆 칸을 침범한다.
        도트·선은 애초에 격자 안에서만 그려지므로 자를 필요가 없다.

        **'edit' 모드에서는 자르지 않는다.** 작업하는 동안은 얼마나 넘쳤는지 보이는
        편이 낫다 — 안 보이게 숨기면 얼마나 썼는지 가늠할 수 없다. 자르는 건
        'print' 모드(인쇄 미리보기)와 PDF뿐이다.
      */}
      <clipPath id={clipId}>
        <rect x={0} y={0} width={insert.width} height={insert.height} />
      </clipPath>
      <g clipPath={mode === 'print' ? `url(#${clipId})` : undefined}>
        <TextLayer objects={objects.filter(isText)} spacing={grid.spacing} />
      </g>
    </>
  );
}

/**
 * 글자.
 *
 * 놓는 자리는 core/text가 정한다. PDF도 같은 함수를 쓴다 — 화면은 text-anchor에
 * 맡기고 PDF는 폭을 재서 옮기지만, 기준점은 하나다. 여러 줄은 줄마다 tspan으로 쌓는다.
 *
 * `data-id`는 화면이 글자의 실제 크기를 재서 클릭 판정에 쓰기 위한 표시다.
 * 글자가 차지하는 크기는 글꼴이 정하므로 core가 알 수 없다.
 */
function TextLayer({ objects, spacing }: { objects: TextObject[]; spacing: Mm }) {
  return (
    /*
     * 커닝과 합자를 끈다.
     *
     * 브라우저는 `We` 같은 짝을 자동으로 좁히지만 pdf-lib은 글자 폭을 그냥 더한다.
     * 그대로 두면 가운데 정렬한 라틴 문자가 화면과 인쇄물에서 0.08mm쯤 어긋난다.
     * 눈에 띄는 차이는 아니지만, 두 뷰가 같은 자리에 놓는 편이 낫다.
     */
    <g
      fontFamily={DEFAULT_FONT_FAMILY}
      style={{ fontKerning: 'none', fontVariantLigatures: 'none', whiteSpace: 'pre' }}
    >
      {objects.map((t) => {
        const size = sizeOf(t);
        const align = alignOf(t);
        const lines = splitLines(t.text);
        const baselines = lineBaselines(t, size, valignOf(t), lines.length, spacing);
        const x = anchorX(t, align);
        return (
          <text
            key={t.id}
            data-id={t.id}
            x={x}
            fontSize={size}
            fill={t.color ?? TEXT_COLOR}
            textAnchor={align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'}
          >
            {lines.map((line, i) => (
              <tspan key={i} x={x} y={baselines[i]}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}

/** 값을 [lo, hi] 사이로 붙잡는다. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 화면 전용 도트 크기 · 짙기.
 *
 * 간격을 좁히면 도트가 빽빽해져서 위에 그린 것을 가린다. **간격이 좁을수록 도트를
 * 작고 연하게 낮춘다** — 촘촘한 격자에서도 그 위의 그림이 눈에 들어오게 하기 위해서다.
 * 기준 간격(5mm)에서는 원래 값(0.6mm · 완전 진하게) 그대로다.
 *
 * 인쇄되는 값(core/style의 DOT_SIZE)과는 무관하다. 위치만 같고 굵기·색은 화면 전용이다.
 */
function screenDotSize(spacing: Mm): Mm {
  return clamp((SCREEN_DOT_SIZE * spacing) / 5, 0.2, 1.0);
}
function screenDotOpacity(spacing: Mm): number {
  return clamp(spacing / 5, 0.45, 1);
}
function screenLineWidth(spacing: Mm): Mm {
  return clamp((SCREEN_GRID_LINE_WIDTH * spacing) / 5, 0.08, 0.32);
}

/**
 * 도트 격자.
 *
 * 좌표는 core/grid가 낸다. PDF도 같은 좌표를 쓴다.
 *
 * 'edit' 모드의 굵기와 색은 **화면 전용 값**이라 PDF와 다르다. 인쇄되는 0.2mm 도트를
 * 그대로 그리면 1픽셀도 되지 않아 작업할 수가 없다. 'print' 모드는 실제 인쇄 크기를
 * 그대로 쓴다 — 인쇄하기 탭의 미리보기가 이걸 쓴다.
 */
function DotGridLayer({
  insert,
  grid,
  safeZoneWidth,
  mode,
}: {
  insert: { width: Mm; height: Mm };
  grid: DotGrid;
  safeZoneWidth: Mm;
  mode: ViewMode;
}) {
  const lattice = gridLattice(gridArea(insert, grid, safeZoneWidth), grid.spacing);
  const { dots, lines } = gridShapes(lattice, grid.style);

  const dotSize = mode === 'print' ? DOT_SIZE : screenDotSize(grid.spacing);
  const lineWidth = mode === 'print' ? GRID_LINE_WIDTH : screenLineWidth(grid.spacing);
  const dotColor = mode === 'print' ? CONTENT_COLOR.dot : SCREEN_GRID_COLOR;
  const lineColor = mode === 'print' ? CONTENT_COLOR.line : SCREEN_GRID_COLOR;
  const opacity = mode === 'print' ? 1 : screenDotOpacity(grid.spacing);

  return (
    <g opacity={opacity}>
      {dots.length > 0 && (
        <g fill={dotColor}>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={dotSize / 2} />
          ))}
        </g>
      )}
      {lines.length > 0 && (
        <g stroke={lineColor} strokeWidth={lineWidth}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
        </g>
      )}
    </g>
  );
}

/**
 * 사용자가 그린 것들. 배열 순서대로 그린다(뒤가 위).
 *
 * 굵기·색·모양은 객체에 값이 있을 때만 그것을 쓰고, 없으면 기본값을 따른다.
 * 손대지 않은 선은 값을 갖지 않으므로 나중에 기본값을 바꾸면 다 같이 따라온다.
 */
function ObjectLayer({ objects }: { objects: LineObject[] }) {
  return (
    <g strokeLinecap={OBJECT_LINE_CAP}>
      {objects.map((o) => {
        const w = o.width ?? OBJECT_LINE_WIDTH;
        return (
          <line
            key={o.id}
            x1={o.x1}
            y1={o.y1}
            x2={o.x2}
            y2={o.y2}
            stroke={o.color ?? OBJECT_LINE_COLOR}
            strokeWidth={w}
            strokeDasharray={dashPattern(o.dash, w)}
          />
        );
      })}
    </g>
  );
}

/** 점선 간격은 굵기에 비례해야 어느 굵기에서나 비슷해 보인다. */
export function dashPattern(dash: LineObject['dash'], width: Mm): string | undefined {
  if (dash === 'dashed') return `${width * 6} ${width * 4}`;
  if (dash === 'dotted') return `${width} ${width * 3}`;
  return undefined;
}
