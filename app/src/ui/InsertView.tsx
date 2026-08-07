import { useId } from 'react';
import { gridArea, gridLattice, gridShapes, type DotGrid } from '../core/grid';
import {
  CONTENT_COLOR,
  DEFAULT_FONT_FAMILY,
  DOT_SIZE,
  FONT_WEIGHT,
  GRID_LINE_WIDTH,
  OBJECT_LINE_CAP,
  SCREEN_DOT_SIZE,
  SCREEN_GRID_COLOR,
  SCREEN_GRID_LINE_WIDTH,
  TEXT_COLOR,
} from '../core/style';
import { colorOf, dashPattern, dashPatternOf, widthOf } from '../core/line';
import { familyOf } from '../fonts/registry';
import { useStore } from '../store';
import {
  alignOf,
  anchorX,
  boldOf,
  lineBaselines,
  lineHeightOf,
  sizeOf,
  splitLines,
  valignOf,
} from '../core/text';
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
  mirror = false,
  hiddenId,
}: {
  insert: { width: Mm; height: Mm };
  grid: DotGrid;
  objects: DiaryObject[];
  safeZoneWidth: Mm;
  mode?: ViewMode;
  /** 뒷면이면 켠다. 안전영역을 비울 때 오른쪽을 비운다(core/grid의 gridArea 참고). */
  mirror?: boolean;
  /**
   * 화면에서만 감출 글자 하나. 지금 고치는 중인 글자에 쓴다 — 입력칸이 같은
   * 자리에 겹쳐 있어서 둘 다 보이면 어느 게 지금 치는 내용인지 헷갈린다.
   *
   * **목록에서 빼지 않고 감추기만 한다.** 빼버리면 DOM에서 사라지는데, 클릭
   * 판정이 DOM의 `<text>`를 훑어 찾으므로 편집 중인 글자를 영영 집을 수 없게 된다.
   */
  hiddenId?: string;
}) {
  const clipId = useId();
  // 'print' 모드는 인쇄 여부(grid.print)를 따르고, 'edit'는 작업 중 표시 여부(grid.showOnScreen)를 따른다.
  const showDots = mode === 'print' ? grid.print : grid.showOnScreen;

  return (
    <>
      {showDots && (
        <DotGridLayer
          insert={insert}
          grid={grid}
          safeZoneWidth={safeZoneWidth}
          mode={mode}
          mirror={mirror}
        />
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
        <TextLayer objects={objects.filter(isText)} hiddenId={hiddenId} />
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
function TextLayer({ objects, hiddenId }: { objects: TextObject[]; hiddenId?: string }) {
  // 등록한 글꼴은 이번 세션에만 있다. 목록이 바뀌면 다시 그려야 한다.
  const userFonts = useStore((s) => s.userFonts);
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
        const baselines = lineBaselines(t, size, valignOf(t), lines.length, lineHeightOf(t));
        const x = anchorX(t, align);
        return (
          <text
            key={t.id}
            data-id={t.id}
            x={x}
            fontSize={size}
            // 등록한 글꼴이 있으면 그것으로. 새로고침 뒤 등록소가 비었으면
            // 기본 글꼴로 돌아간다 — 안 보이는 것보다 낫다.
            fontFamily={familyOf(userFonts, t.font)}
            // 400/700은 @font-face 선언과 같은 값이라 진짜 Bold 파일이 쓰인다.
            // 가짜 굵게(synthetic bold)로 그리면 PDF와 글자 폭이 어긋난다.
            fontWeight={boldOf(t) ? FONT_WEIGHT.bold : FONT_WEIGHT.regular}
            fill={t.color ?? TEXT_COLOR}
            textAnchor={align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'}
            // 감추되 좌표는 남긴다 — visibility는 getBBox를 그대로 두므로 클릭 판정이 산다.
            visibility={t.id === hiddenId ? 'hidden' : undefined}
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
  mirror,
}: {
  insert: { width: Mm; height: Mm };
  grid: DotGrid;
  safeZoneWidth: Mm;
  mode: ViewMode;
  mirror: boolean;
}) {
  const area = gridArea(insert, grid, safeZoneWidth, mirror);
  const lattice = gridLattice(area, grid.spacing, grid.minMargin, grid.toEdge);
  // 끝까지 채울 때는 선도 영역 끝까지 긋는다 — 잘린 마지막 칸이 종이 끝에서
  // 닫혀야 칸으로 읽힌다. 기준이 속지가 아니라 **격자 영역**인 이유는,
  // 안전영역을 피하도록 해뒀다면 선이 구멍 쪽으로 넘어가면 안 되기 때문이다.
  // 가장자리에 덧붙인 붙을 자리는 **화면에서만** 도트로 보인다. 인쇄물에
  // 재단선 위의 반쯤 잘린 도트가 남으면 격자가 어긋나 보인다.
  const { dots, lines } = gridShapes(
    lattice,
    grid.style,
    grid.toEdge ? area : null,
    mode === 'print',
  );

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
        <g
          stroke={lineColor}
          strokeWidth={lineWidth}
          // 점선 비율은 그은 선과 같은 core/line에서 나온다. 굵기만 격자 것을 쓴다 —
          // 화면과 인쇄의 격자선 굵기가 다르기 때문이다.
          strokeDasharray={dashPattern(grid.dash, lineWidth)?.join(' ')}
          strokeLinecap={grid.dash === 'dotted' ? 'round' : undefined}
        >
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
      {objects.map((o) => (
        <line
          key={o.id}
          x1={o.x1}
          y1={o.y1}
          x2={o.x2}
          y2={o.y2}
          stroke={colorOf(o)}
          strokeWidth={widthOf(o)}
          // core가 mm로 돌려준다. viewBox가 mm라 그대로 이어 붙이면 된다.
          strokeDasharray={dashPatternOf(o)?.join(' ')}
        />
      ))}
    </g>
  );
}
