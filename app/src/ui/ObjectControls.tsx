import { useEffect, useRef, useState } from 'react';
import {
  imageRotateOf,
  MIN_BOX_SIZE,
  type CalendarStyle,
  type CheckboxIcon,
  type CheckboxStyle,
  type DotsObject,
  type ImageObject,
  type LineObject,
  type LineStyle,
  type ShapeObject,
  type ShapeStyle,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import { checkboxPath } from '../core/checkbox';
import { dotSizeAt, dotsColorOf, dotsSizeOf } from '../core/dots';
import {
  DEFAULT_FONT_FAMILY,
  DOTS_SIZE,
  MAX_LETTER_SPACING,
  MIN_LETTER_SPACING,
  OBJECT_LINE_COLOR,
  OBJECT_LINE_WIDTH,
  SHAPE_FILL_COLOR,
  TEXT_COLOR,
  TEXT_SIZE,
} from '../core/style';
import { letterSpacingOfText, naturalLineHeight } from '../core/text';
import { DEFAULT_FIELD_DRAFT } from '../core/fieldFormat';
import {
  letterSpacingOf,
  rowScaleOf,
  showAdjacentOf,
  sizeScaleOf,
  weekdayLangOf,
  weekStartOf,
} from '../core/calendar';
import { fillColorOf, fillOpacityOf, roundnessOf, strokeColorOf, strokeDashOf, strokeWidthOf } from '../core/shape';
import { FONT_ACCEPT, fontLabelOf, hasFont, registerFont } from '../fonts/registry';
import { IMAGE_ACCEPT, hasImage, imageLabelOf, registerImage } from '../images/registry';
import { libraryFonts, libraryImages, reusableIdFor } from '../core/assets';
import { mmToPt, ptToMm, roundMm, type Mm } from '../core/units';
import { useStore } from '../store';
import { ColorField } from './ColorControls';
import { ImagePickerDialog } from './ImagePickerDialog';
import { Pop, PopRow } from './Popover';

/** 굵기 드롭다운에서 고를 수 있는 값들. 선·도형·표·체크박스가 함께 쓴다. */
const WIDTHS: Mm[] = [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8];

/** 선의 굵기·색·모양. 고른 것이 없으면 앞으로 그을 선의 값이다. */
export function LineControls({
  lines,
  draft,
  apply,
}: {
  lines: LineObject[];
  draft: LineStyle | null;
  apply: (patch: LineStyle) => void;
}) {
  const editing = lines.length > 0;
  const mixed = (key: 'width' | 'color' | 'dash') =>
    editing && !lines.every((o) => o[key] === lines[0][key]);
  /**
   * 드롭다운에 보일 값.
   *
   * **기본값과 같으면 빈 문자열로 돌린다.** 목록에서 기본값에 해당하는 항목의 value가
   * 빈 문자열이기 때문이다 — `기본 0.2mm`라는 항목을 따로 두지 않고 목록의 `0.2mm`가
   * 곧 기본값이다. 예전에 0.2mm를 직접 골라둔 선도 같은 항목에 표시된다.
   */
  const val = (key: 'width' | 'color' | 'dash', dflt: string | number) => {
    if (mixed(key)) return 'mixed';
    const v = (editing ? lines[0][key] : draft?.[key]) ?? dflt;
    return v === dflt ? '' : String(v);
  };

  return (
    <>
      <select
        value={val('width', OBJECT_LINE_WIDTH)}
        onChange={(e) => apply({ width: e.target.value ? Number(e.target.value) : undefined })}
        title="굵기"
      >
        {mixed('width') && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <ColorField
        value={(editing ? lines[0].color : draft?.color) ?? OBJECT_LINE_COLOR}
        mixed={mixed('color')}
        onChange={(color) => apply({ color: color === OBJECT_LINE_COLOR ? undefined : color })}
        title="색"
      />

      <select
        value={val('dash', 'solid')}
        onChange={(e) => apply({ dash: (e.target.value || undefined) as never })}
        title="모양"
      >
        {mixed('dash') && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
        <option value="sketch">손그림</option>
      </select>
    </>
  );
}

/**
 * 달력의 시작 요일·요일 언어·이전달 표시.
 *
 * 값이 없는 오브젝트와 있는 오브젝트를 나란히 골라도 같은 결과를 보여주도록
 * `core/calendar`의 `weekStartOf` 등 접근자로 비교한다 — 원시 속성(`o.weekStart`)을
 * 직접 비교하면 "정하지 않아서 기본값"과 "기본값을 직접 골라 정함"이 서로
 * 다르게 보인다.
 *
 * 아직 그린 달력이 없으면(도구만 고른 상태) 아무 조작칸도 없다 — 만들기 전
 * 기본값을 바꿔 둘 자리가 없다(자동 필드처럼 이미 있는 것만 손댄다).
 */
const SIZE_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
const ROW_SCALES = [0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2];

/**
 * 달력의 시작 요일·요일 언어·글꼴·색·크기 등.
 *
 * 체크박스처럼 그리기 전에도 만지는 값이라(찍자마자 바로 적용되게)
 * `items`·`apply`로 일반화했다 — 실제로 그려진 달력들일 수도, 아직 하나도
 * 없어 대기 중인 draft 스타일 하나일 수도 있다(StyleBar의 호출부 참고).
 */
export function CalendarControls({
  items,
  apply,
}: {
  items: CalendarStyle[];
  apply: (patch: CalendarStyle) => void;
}) {
  const first = items[0];
  const colorMixed = items.length > 1 && !items.every((o) => (o.color ?? TEXT_COLOR) === (first.color ?? TEXT_COLOR));
  const sizeMixed = items.length > 1 && !items.every((o) => sizeScaleOf(o) === sizeScaleOf(first));
  const rowMixed = items.length > 1 && !items.every((o) => rowScaleOf(o) === rowScaleOf(first));
  const spacingMixed = items.length > 1 && !items.every((o) => letterSpacingOf(o) === letterSpacingOf(first));
  const fontMixed = items.length > 1 && !items.every((o) => (o.font ?? '') === (first.font ?? ''));

  // 막대에는 글꼴·색만. 크기·간격은 말풍선, 시작 요일·요일 언어·제목 같은 구성은
  // 왼쪽 AutoField 패널(CalendarPanelControls)에 둔다(사용자 요청 2026-10-11).
  return (
    <>
      <FontPicker value={fontMixed ? null : (first.font ?? '')} onPick={(font) => apply({ font })} />
      <ColorField
        value={first.color ?? TEXT_COLOR}
        mixed={colorMixed}
        onChange={(color) => apply({ color: color === TEXT_COLOR ? undefined : color })}
        title="글자 색"
      />
      <Pop label="크기·간격" title="글자 크기 배율·줄 간격·자간">
        <PopRow label="글자 크기">
          <select
            value={sizeMixed ? 'mixed' : sizeScaleOf(first) === 1 ? '' : String(sizeScaleOf(first))}
            onChange={(e) => apply({ sizeScale: e.target.value ? Number(e.target.value) : undefined })}
            title="상자 크기에서 자동으로 정해지는 크기에 곱하는 배율"
          >
            {sizeMixed && <option value="mixed">—</option>}
            {SIZE_SCALES.map((v) => (
              <option key={v} value={v === 1 ? '' : v}>
                {Math.round(v * 100)}%
              </option>
            ))}
          </select>
        </PopRow>
        <PopRow label="줄 간격">
          <select
            value={rowMixed ? 'mixed' : rowScaleOf(first) === 1 ? '' : String(rowScaleOf(first))}
            onChange={(e) => apply({ rowScale: e.target.value ? Number(e.target.value) : undefined })}
            title="글자 크기는 그대로 두고 제목·요일·날짜 행 사이 간격만"
          >
            {rowMixed && <option value="mixed">—</option>}
            {ROW_SCALES.map((v) => (
              <option key={v} value={v === 1 ? '' : v}>
                {Math.round(v * 100)}%
              </option>
            ))}
          </select>
        </PopRow>
        <PopRow label="자간">
          <NumField
            value={spacingMixed ? null : letterSpacingOf(first)}
            unit="mm"
            title="자간"
            min={MIN_LETTER_SPACING}
            max={MAX_LETTER_SPACING}
            step={0.1}
            onChange={(mm) => apply({ letterSpacing: mm === 0 ? undefined : mm })}
          />
        </PopRow>
      </Pop>
    </>
  );
}

/**
 * 달력의 구성 — 시작 요일·요일 언어·이전·다음 달·제목. 고민해서 정하는 값이라 왼쪽
 * AutoField 패널에 라벨과 함께 둔다(사용자 요청 2026-10-11).
 */
export function CalendarPanelControls({
  items,
  apply,
}: {
  items: CalendarStyle[];
  apply: (patch: CalendarStyle) => void;
}) {
  const adjacentRef = useRef<HTMLInputElement>(null);
  const first = items[0];
  const weekStartMixed = items.length > 1 && !items.every((o) => weekStartOf(o) === weekStartOf(first));
  const langMixed = items.length > 1 && !items.every((o) => weekdayLangOf(o) === weekdayLangOf(first));
  const adjacentMixed = items.length > 1 && !items.every((o) => showAdjacentOf(o) === showAdjacentOf(first));
  const titleMixed = items.length > 1 && !items.every((o) => o.title === first.title);

  useEffect(() => {
    if (adjacentRef.current) adjacentRef.current.indeterminate = adjacentMixed;
  }, [adjacentMixed]);

  return (
    <div className="panel-controls">
      <PopRow label="시작 요일">
        <select
          value={weekStartMixed ? 'mixed' : weekStartOf(first)}
          onChange={(e) => apply({ weekStart: e.target.value as CalendarStyle['weekStart'] })}
        >
          {weekStartMixed && <option value="mixed">—</option>}
          <option value="sun">일요일</option>
          <option value="mon">월요일</option>
        </select>
      </PopRow>
      <PopRow label="요일 이름">
        <select
          value={langMixed ? 'mixed' : weekdayLangOf(first)}
          onChange={(e) => apply({ weekdayLang: e.target.value as CalendarStyle['weekdayLang'] })}
        >
          {langMixed && <option value="mixed">—</option>}
          <option value="kr">일 월 화</option>
          <option value="en">Sun Mon Tue</option>
          <option value="en-short">S M T</option>
          <option value="hanja">日 月 火</option>
        </select>
      </PopRow>
      <PopRow label="이전·다음 달">
        <label className="check" title="이번 달이 아닌 칸에도 그 달 날짜를 보여줄지">
          <input
            ref={adjacentRef}
            type="checkbox"
            checked={!adjacentMixed && showAdjacentOf(first)}
            onChange={(e) => apply({ showAdjacent: e.target.checked })}
          />
          날짜 보이기
        </label>
      </PopRow>
      <PopRow label="제목">
        <span className="calendar-title-field" title="비워두면 지금 연·월이 자동으로 표시됩니다">
          <input
            type="text"
            value={titleMixed ? '' : (first.title ?? '')}
            placeholder={titleMixed ? '여러 값' : '자동(예: 2026년 8월)'}
            onChange={(e) => apply({ title: e.target.value })}
          />
          {!titleMixed && first.title !== undefined && (
            <button type="button" className="ghost" onClick={() => apply({ title: undefined })} title="자동으로 되돌리기">
              자동
            </button>
          )}
        </span>
      </PopRow>
    </div>
  );
}

/**
 * 도형의 모서리 둥글기·테두리 굵기·색·모양.
 *
 * 달력과 같은 이유로 그린 도형이 없으면(도구만 고른 상태) 아무 조작칸도
 * 없다 — 만들기 전 기본값을 바꿔 둘 자리가 없다. 값은 core/shape의
 * 접근자로 읽는다 — 화면(ShapeLayer)·PDF(drawShapes)와 같은 함수라
 * "정하지 않아서 기본값"과 "기본값을 직접 골라 정함"이 항상 같게 보인다.
 */
export function ShapeControls({ shapes }: { shapes: ShapeObject[] }) {
  const styleShape = useStore((s) => s.styleShape);
  const editing = shapes.length > 0;
  const first = shapes[0];

  const roundnessMixed = editing && !shapes.every((o) => roundnessOf(o) === roundnessOf(first));
  const strokeWidthMixed = editing && !shapes.every((o) => strokeWidthOf(o) === strokeWidthOf(first));
  const colorMixed = editing && !shapes.every((o) => strokeColorOf(o) === strokeColorOf(first));
  const dashMixed = editing && !shapes.every((o) => strokeDashOf(o) === strokeDashOf(first));

  const filledOf = (o: ShapeObject) => fillColorOf(o) !== null;
  const filledMixed = editing && !shapes.every((o) => filledOf(o) === filledOf(first));
  const filled = editing && !filledMixed && filledOf(first);
  const fillColorMixed = editing && !shapes.every((o) => fillColorOf(o) === fillColorOf(first));
  const fillOpacityMixed = editing && !shapes.every((o) => fillOpacityOf(o) === fillOpacityOf(first));

  if (!editing) {
    return null;
  }

  // 그리기 도구가 아무것도 고르지 않았을 때 보여주는 순서(굵기·색·모양·둥글기)와
  // 맞춘다 — 대기 화면과 다 그린 뒤가 순서까지 똑같아야 헷갈리지 않는다.
  return (
    <>
      <select
        value={strokeWidthMixed ? 'mixed' : strokeWidthOf(first) === OBJECT_LINE_WIDTH ? '' : strokeWidthOf(first)}
        onChange={(e) => styleShape({ strokeWidth: e.target.value ? Number(e.target.value) : undefined })}
        title="테두리 굵기"
      >
        {strokeWidthMixed && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <ColorField
        value={strokeColorOf(first)}
        mixed={colorMixed}
        onChange={(color) => styleShape({ color: color === OBJECT_LINE_COLOR ? undefined : color })}
        title="테두리 색"
      />

      <select
        value={dashMixed ? 'mixed' : strokeDashOf(first) === 'solid' ? '' : strokeDashOf(first)}
        onChange={(e) => styleShape({ dash: (e.target.value || undefined) as ShapeStyle['dash'] })}
        title="테두리 모양"
      >
        {dashMixed && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
      </select>

      <Pop label="모서리·채우기">
        <PopRow label="모서리">
          <select
            value={roundnessMixed ? 'mixed' : roundnessOf(first)}
            onChange={(e) =>
              styleShape({ roundness: (e.target.value ? Number(e.target.value) : undefined) as ShapeStyle['roundness'] })
            }
          >
            {roundnessMixed && <option value="mixed">—</option>}
            <option value={0}>각짐</option>
            <option value={1}>둥글기 1</option>
            <option value={2}>둥글기 2</option>
            <option value={3}>둥글기 3</option>
            <option value={4}>원·타원</option>
          </select>
        </PopRow>
        <PopRow label="채우기">
      <label className="check" title="상자 안을 색으로 채울지">
        <input
          type="checkbox"
          checked={filled}
          onChange={(e) =>
            styleShape(
              e.target.checked
                ? { fillColor: fillColorOf(first) ?? SHAPE_FILL_COLOR, fillOpacity: fillOpacityOf(first) }
                : { fillColor: undefined, fillOpacity: undefined },
            )
          }
        />
        채우기
      </label>
        </PopRow>

      {filled && (
        <>
          <PopRow label="채우기 색">
          <ColorField
            value={fillColorOf(first) ?? SHAPE_FILL_COLOR}
            mixed={fillColorMixed}
            onChange={(c) => styleShape({ fillColor: c })}
            title="채우기 색"
          />
          </PopRow>
          <PopRow label="불투명도">
          <label className="opacity-field" title="채우기 투명도">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={fillOpacityMixed ? 0 : Math.round(fillOpacityOf(first) * 100)}
              onChange={(e) => styleShape({ fillOpacity: Number(e.target.value) / 100 })}
            />
            <span>{fillOpacityMixed ? '—' : `${Math.round(fillOpacityOf(first) * 100)}%`}</span>
          </label>
          </PopRow>
        </>
      )}
      </Pop>
    </>
  );
}

/**
 * 표 — 테두리(도형)와 안쪽 칸 선을 함께 고쳤을 때 둘 다 같이 바뀌게 한다.
 *
 * 표를 그으면 테두리는 `ShapeObject`, 안쪽 칸 선은 여러 개의 `LineObject`로
 * 나뉜다(core/grid의 `tableSplit`) — 서로 다른 종류라 `styleShape`·
 * `styleSelected`도 따로다. 굵기·색·모양은 둘 다에게 그대로 적용하고,
 * 둥글기만 테두리(도형)에만 적용한다 — 안쪽 칸 선은 둥글게 할 수 없다.
 */
export function TableControls({ shapes, lines }: { shapes: ShapeObject[]; lines: LineObject[] }) {
  const styleShape = useStore((s) => s.styleShape);
  const styleSelected = useStore((s) => s.styleSelected);
  const first = shapes[0];

  const strokeWidthMixed =
    !shapes.every((o) => strokeWidthOf(o) === strokeWidthOf(first)) ||
    !lines.every((o) => (o.width ?? OBJECT_LINE_WIDTH) === strokeWidthOf(first));
  const colorMixed =
    !shapes.every((o) => strokeColorOf(o) === strokeColorOf(first)) ||
    !lines.every((o) => (o.color ?? OBJECT_LINE_COLOR) === strokeColorOf(first));
  const dashMixed =
    !shapes.every((o) => strokeDashOf(o) === strokeDashOf(first)) ||
    !lines.every((o) => (o.dash ?? 'solid') === strokeDashOf(first));
  const roundnessMixed = !shapes.every((o) => roundnessOf(o) === roundnessOf(first));

  const apply = (patch: { strokeWidth?: Mm; color?: string; dash?: LineStyle['dash'] }) => {
    styleShape(patch);
    styleSelected({ width: patch.strokeWidth, color: patch.color, dash: patch.dash as LineStyle['dash'] });
  };

  return (
    <>
      <select
        value={strokeWidthMixed ? 'mixed' : strokeWidthOf(first) === OBJECT_LINE_WIDTH ? '' : strokeWidthOf(first)}
        onChange={(e) => apply({ strokeWidth: e.target.value ? Number(e.target.value) : undefined })}
        title="굵기 — 테두리·안쪽 칸 선 둘 다"
      >
        {strokeWidthMixed && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <ColorField
        value={strokeColorOf(first)}
        mixed={colorMixed}
        onChange={(color) => apply({ color: color === OBJECT_LINE_COLOR ? undefined : color })}
        title="색 — 테두리·안쪽 칸 선 둘 다"
      />

      <select
        value={dashMixed ? 'mixed' : strokeDashOf(first) === 'solid' ? '' : strokeDashOf(first)}
        onChange={(e) => apply({ dash: (e.target.value || undefined) as LineStyle['dash'] })}
        title="모양 — 테두리·안쪽 칸 선 둘 다"
      >
        {dashMixed && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
      </select>

      <Pop label="모서리" title="테두리 모서리 둥글기 — 안쪽 칸 선은 둥글게 할 수 없다">
        <PopRow label="테두리 모서리">
          <select
            value={roundnessMixed ? 'mixed' : roundnessOf(first)}
            onChange={(e) =>
              styleShape({ roundness: (e.target.value ? Number(e.target.value) : undefined) as ShapeStyle['roundness'] })
            }
          >
            {roundnessMixed && <option value="mixed">—</option>}
            <option value={0}>각짐</option>
            <option value={1}>둥글기 1</option>
            <option value={2}>둥글기 2</option>
            <option value={3}>둥글기 3</option>
            <option value={4}>원·타원</option>
          </select>
        </PopRow>
      </Pop>
    </>
  );
}

/** 체크박스 아이콘 모양 여섯 가지 — 고르기 그리드의 순서·이름. */
const CHECKBOX_ICONS: { value: CheckboxIcon; label: string }[] = [
  { value: 'square', label: '네모' },
  { value: 'circle', label: '동그라미' },
  { value: 'triangle', label: '세모' },
  { value: 'diamond', label: '다이아' },
  { value: 'star', label: '별' },
  { value: 'heart', label: '하트' },
];

/**
 * 체크박스 아이콘 모양·테두리 굵기·색.
 *
 * TextControls와 같은 틀이다(`items`·`apply`) — 아직 찍은 체크박스가
 * 없어도(도구만 고른 상태) **다음에 찍을 모양**을 여기서 미리 고를 수
 * 있다. 매번 네모로 찍고 하나하나 고치는 게 아니라, 별을 찍고 싶으면
 * 찍기 전에 별을 고르는 쪽이 자연스럽다.
 *
 * 아이콘은 실제로 찍히는 것과 같은 경로(core/checkbox의 `checkboxPath`)로
 * 미리 그린다 — 모양을 글자 목록이 아니라 눈으로 보고 고른다.
 */
/**
 * 도트 판(9-4) — 가로·세로 개수, 기본 지름, 색. 판 하나를 골라 그 안의 도트를 눌러 고르면(Shift로 여러 개)
 * 그 도트들의 지름을 숫자로 바꾼다(2026-10-13 결정). 0이면 그 도트는 없다.
 */
export function DotsControls({ items }: { items: DotsObject[] }) {
  const styleDots = useStore((s) => s.styleDots);
  const pickedDots = useStore((s) => s.pickedDots);
  const setPickedDotSize = useStore((s) => s.setPickedDotSize);
  if (items.length === 0) {
    return <span className="stylebar-note">페이지를 끌어 도트 판을 만들어요 — 칸마다 가운데에 도트 하나</span>;
  }
  const first = items[0];
  const same = <T,>(f: (o: DotsObject) => T) => items.every((o) => f(o) === f(first));
  const lone = items.length === 1 ? first : null;
  const keys = lone && pickedDots?.id === lone.id ? pickedDots.keys : [];
  const pickedSize = keys.length > 0 && keys.every((k) => dotSizeAt(first, k) === dotSizeAt(first, keys[0])) ? dotSizeAt(first, keys[0]) : null;
  return (
    <>
      <NumField
        value={same((o) => o.cols) ? first.cols : null}
        unit="열"
        title="가로 도트 수"
        min={1}
        max={200}
        step={1}
        onChange={(cols) => styleDots({ cols })}
      />
      <NumField
        value={same((o) => o.rows) ? first.rows : null}
        unit="행"
        title="세로 도트 수"
        min={1}
        max={200}
        step={1}
        onChange={(rows) => styleDots({ rows })}
      />
      <NumField
        value={same(dotsSizeOf) ? roundMm(dotsSizeOf(first), 2) : null}
        unit="mm"
        title="도트 지름"
        min={0.1}
        max={10}
        step={0.1}
        onChange={(size) => styleDots({ size: size === DOTS_SIZE ? undefined : size })}
      />
      <ColorField
        value={dotsColorOf(first)}
        mixed={!same(dotsColorOf)}
        onChange={(color) => styleDots({ color: color === OBJECT_LINE_COLOR ? undefined : color })}
        title="도트 색"
      />
      {keys.length > 0 ? (
        <>
          <span className="stylebar-note">고른 도트 {keys.length}개</span>
          <NumField
            value={pickedSize === null ? null : roundMm(pickedSize, 2)}
            unit="mm"
            title="고른 도트의 지름 — 0이면 없음"
            min={0}
            max={10}
            step={0.1}
            onChange={(size) => setPickedDotSize(size)}
          />
          <button className="ghost" onClick={() => setPickedDotSize(undefined)} title="판의 기본 지름으로">
            기본 지름으로
          </button>
        </>
      ) : (
        lone && <span className="stylebar-note">도트를 눌러 골라요(Shift로 여러 개)</span>
      )}
    </>
  );
}

export function CheckboxControls({
  items,
  apply,
}: {
  items: CheckboxStyle[];
  apply: (patch: CheckboxStyle) => void;
}) {
  const mixed = (key: keyof CheckboxStyle) => items.length > 1 && !items.every((o) => o[key] === items[0][key]);
  const val = (key: 'strokeWidth' | 'color', dflt: number | string) => {
    if (mixed(key)) return 'mixed';
    const v = items[0][key] ?? dflt;
    return v === dflt ? '' : String(v);
  };

  // 아이콘 모양은 왼쪽 Draw 패널(CheckboxIconGrid)에서 고른다 — 모양은 눈으로 비교해 고르는 것이라.
  return (
    <>
      <select
        value={val('strokeWidth', OBJECT_LINE_WIDTH)}
        onChange={(e) => apply({ strokeWidth: e.target.value ? Number(e.target.value) : undefined })}
        title="테두리 굵기"
      >
        {mixed('strokeWidth') && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <ColorField
        value={items[0].color ?? OBJECT_LINE_COLOR}
        mixed={mixed('color')}
        onChange={(color) => apply({ color: color === OBJECT_LINE_COLOR ? undefined : color })}
        title="테두리 색"
      />
    </>
  );
}

/** 체크박스 아이콘 모양 고르기 — 실제로 찍히는 것과 같은 경로로 미리 그린다(core/checkbox). 왼쪽 패널용. */
export function CheckboxIconGrid({ items, apply }: { items: CheckboxStyle[]; apply: (patch: CheckboxStyle) => void }) {
  const mixed = items.length > 1 && !items.every((o) => o.icon === items[0].icon);
  const currentIcon = mixed ? null : (items[0].icon ?? 'square');
  return (
    <div className="icon-grid">
      {CHECKBOX_ICONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`icon-swatch ${currentIcon === value ? 'on' : ''}`}
          onClick={() => apply({ icon: value })}
          title={label}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d={checkboxPath(value, { x: 4, y: 4, width: 16, height: 16 })} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/**
 * 이미지 고르기·등록.
 *
 * 달력·도형과 같은 이유로 그린 이미지가 없으면(도구만 고른 상태) 아무
 * 조작칸도 없다 — 상자부터 그려야 한다. FontPicker와 같은 틀이다 —
 * 목록 맨 아래의 `이미지 파일 추가…`가 파일 창을 연다.
 *
 * **빈 이미지(막 그려서 아직 사진이 없는 상자)를 하나만 고르면 파일
 * 선택 창이 저절로 뜬다.** 상자를 그리자마자 곧바로 고른 상태가 되므로
 * (`commitImage`), 그리는 즉시 창이 뜨는 것처럼 보인다 — 사진을 먼저
 * 고르고 상자를 그리던 예전 순서를 뒤집었다.
 */
export function ImageControls({ images }: { images: ImageObject[] }) {
  const userImages = useStore((s) => s.userImages);
  const addUserImage = useStore((s) => s.addUserImage);
  const styleImage = useStore((s) => s.styleImage);
  const styleImageRotate = useStore((s) => s.styleImageRotate);
  const resizeObject = useStore((s) => s.resizeObject);
  const pickImageFor = useStore((s) => s.pickImageFor);
  const requestImagePick = useStore((s) => s.requestImagePick);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const editing = images.length > 0;
  const first = editing ? (images[0].imageId ?? '') : '';
  const mixed = editing && !images.every((i) => (i.imageId ?? '') === first);

  const rotateMixed = editing && !images.every((i) => imageRotateOf(i) === imageRotateOf(images[0]));
  const rotateValue = editing && !rotateMixed ? imageRotateOf(images[0]) : null;

  const widthMixed = editing && !images.every((i) => i.width === images[0].width);
  const heightMixed = editing && !images.every((i) => i.height === images[0].height);
  const widthValue = editing && !widthMixed ? images[0].width : null;
  const heightValue = editing && !heightMixed ? images[0].height : null;

  /**
   * 가로·세로를 입력으로 바꾼다 — 도트에 안 붙어 드래그로 정확히 맞추기
   * 어렵다는 피드백이라, 숫자로 바로 정할 수 있게 했다. 왼쪽 위(x, y)는
   * 그대로 두고 오른쪽·아래로만 자라거나 줄어든다(모서리로 끄는 것과
   * 같은 기준점). 여럿을 골랐으면 각자 자기 x·y는 유지한 채 크기만
   * 다 같이 바뀐다.
   */
  function resizeImages(patch: { width?: Mm; height?: Mm }) {
    for (const img of images) {
      resizeObject(img.id, {
        x: img.x,
        y: img.y,
        width: patch.width ?? img.width,
        height: patch.height ?? img.height,
      });
    }
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // 저장 파일을 열면 이미지가 이름만 남는다. 같은 이름의 파일을 다시
      // 등록하면 그때의 id를 물려받아 그 이미지를 쓰던 오브젝트가 되살아난다.
      const name = file.name.replace(/\.[^.]+$/, '');
      const image = await registerImage(file, reusableIdFor(userImages, name, hasImage));
      addUserImage(image);
      // 방금 등록한 이미지를 바로 씌운다. 등록만 하고 또 고르게 하면 한 번 더 손이 간다.
      styleImage(image.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 읽지 못했습니다');
    }
  }

  // 빈 이미지 상자를 더블클릭하면(EditorTab.tsx의 onDoubleClick) store의
  // pickImageFor에 그 상자 id가 신호로 온다 — 이미지 고르기 창을 스스로
  // 연다(예전엔 곧바로 OS 파일 창을 열었다). 선택 상태만으로는 "같은
  // 상자를 또 더블클릭했다"를 구분할 수 없어서(값이 그대로면 리액트가
  // 반응하지 않는다) 더블클릭마다 새로 오는 이 신호를 따로 쓴다.
  // 그리자마자 바로 열지는 않는다 — 여러 개를 잇달아 그릴 때 방해가 된다.
  useEffect(() => {
    if (pickImageFor && images.length === 1 && images[0].id === pickImageFor) {
      setShowPicker(true);
      requestImagePick(null);
    }
  }, [pickImageFor, images, requestImagePick]);

  if (!editing) {
    return null;
  }

  return (
    <>
      <select
        value={mixed ? 'mixed' : first}
        onChange={(e) => {
          if (e.target.value === ADD_IMAGE) {
            // 고른 값을 되돌려놓는다. 파일 창을 닫아버리면 아무 일도 없어야 한다.
            e.target.value = mixed ? 'mixed' : first;
            fileRef.current?.click();
            return;
          }
          styleImage(e.target.value);
        }}
        title={error ?? '이미지'}
        className={error ? 'has-error' : undefined}
      >
        {mixed && <option value="mixed">—</option>}
        {!first && <option value="">이미지를 고르세요</option>}
        {[
          ...libraryImages(userImages),
          // 목록에서 뺀 것이라도 고른 상자가 쓰고 있으면 보여준다(빈 칸으로 보이지 않게).
          ...userImages.filter((i) => i.hidden && images.some((o) => o.imageId === i.id)),
        ].map((img) => (
          <option key={img.id} value={img.id}>
            {/* 저장 파일에서 이름만 살아 돌아온 것. 다시 등록해야 보인다. */}
            {img.url ? imageLabelOf(img) : `${imageLabelOf(img)} (파일 없음)`}
          </option>
        ))}
        <option value={ADD_IMAGE}>이미지 파일 추가…</option>
      </select>

      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          // 같은 파일을 다시 고를 수 있게 비운다.
          e.target.value = '';
        }}
      />

      {showPicker && (
        <ImagePickerDialog
          onPick={(imageId) => {
            styleImage(imageId);
            setShowPicker(false);
          }}
          onAddFile={() => {
            setShowPicker(false);
            fileRef.current?.click();
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {editing && (
        <Pop label="크기·회전">
          <PopRow label="가로">
          <NumField
            value={widthValue}
            unit="mm"
            title="가로 — 왼쪽 위는 그대로 두고 오른쪽으로 자라거나 줄어듭니다"
            min={MIN_BOX_SIZE}
            max={1000}
            step={1}
            onChange={(v) => resizeImages({ width: v })}
          />
          </PopRow>
          <PopRow label="세로">
          <NumField
            value={heightValue}
            unit="mm"
            title="세로 — 왼쪽 위는 그대로 두고 아래로 자라거나 줄어듭니다"
            min={MIN_BOX_SIZE}
            max={1000}
            step={1}
            onChange={(v) => resizeImages({ height: v })}
          />
          </PopRow>
          <PopRow label="회전">
          <NumField
            value={rotateValue}
            unit="도"
            title="회전 — 자유로운 각도로 돌립니다(시계 방향)"
            min={-360}
            max={360}
            step={1}
            onChange={(v) => styleImageRotate(v)}
          />
          </PopRow>
        </Pop>
      )}
    </>
  );
}

/** 드롭다운에서 `파일 추가`를 뜻하는 값. 이미지 id와 부딪히지 않는 모양이면 된다. */
const ADD_IMAGE = '__add_image__';

/**
 * Text 패널의 ‘날짜가 자동으로 채워지는 글자’ 체크 — 고른 글자를 날짜 칸으로 바꾸거나 되돌린다.
 * 형식·몇째 날짜는 AutoField 패널에서 정한다(날짜 칸을 고르면 그 패널이 열린다).
 *
 * 여러 개를 골랐는데 일부만 필드면 체크박스를 어중간한(indeterminate) 상태로
 * 보여준다. 그 상태에서 누르면 전부 켠다.
 */
export function FieldToggle({ texts }: { texts: TextObject[] }) {
  const setField = useStore((s) => s.setField);
  const checkRef = useRef<HTMLInputElement>(null);

  const allOn = texts.every((t) => t.field);
  const noneOn = texts.every((t) => !t.field);
  const onMixed = !allOn && !noneOn;

  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = onMixed;
  }, [onMixed]);

  return (
    <div className="panel-controls">
      <label className="field-toggle">
        <input
          ref={checkRef}
          type="checkbox"
          checked={allOn}
          onChange={(e) => setField(e.target.checked ? { offset: 0, ...DEFAULT_FIELD_DRAFT } : null)}
        />
        날짜가 자동으로 채워지는 글자
      </label>
    </div>
  );
}

/** 목록에서 고르지 않고 직접 치는 값들의 한계. 잘못 친 값이 그대로 들어가지 않게 막는다. */
const MIN_TEXT_PT = 1;
const MAX_TEXT_PT = 300;
const MIN_LINE_MM: Mm = 0.5;
const MAX_LINE_MM: Mm = 200;

/** 기본 글자 크기를 pt로. 크기 칸에 아무것도 정하지 않았을 때 보이는 값이다. */
const DEFAULT_PT = Math.round(mmToPt(TEXT_SIZE) * 10) / 10;

/**
 * 글자의 크기·줄 간격·정렬·색.
 *
 * `items`는 지금 값을 읽어올 대상들이다 — 고른 글자 여럿, 입력 중인 상자 하나,
 * 혹은 앞으로 쓸 글자의 값 하나. 무엇이든 굵기·색·모양과 같은 모양(TextStyle)
 * 이라 이 컴포넌트 하나로 다 다룬다.
 *
 * **크기와 줄 간격은 목록이 아니라 직접 치는 칸이다.** 고를 수 있는 몇 개로 묶어두면
 * 6.5pt나 4.2mm 같은 값을 쓸 수 없다. 손바닥만 한 속지에서는 0.5pt 차이가 한 줄을
 * 더 넣느냐 마느냐를 가른다. 도트 간격을 설정에서 직접 치는 것과 같은 방식이다.
 *
 * 크기만 pt로 주고받는다. 문서 프로그램에서 쓰던 단위라 감이 있기 때문이고,
 * 저장은 mm로 한다 — 모든 좌표는 mm라는 규칙을 지키기 위해서다.
 *
 * `afterPick`은 드롭다운을 고른 **뒤**에 부른다. 글자를 치는 중이었다면 다시
 * 입력칸으로 돌아가기 위해서다. 직접 치는 칸에서는 부르지 않는다 — 한 글자 칠
 * 때마다 포커스를 빼앗아가면 값을 끝까지 칠 수 없다.
 */
export function TextControls({
  items,
  apply,
  afterPick,
}: {
  items: TextStyle[];
  apply: (patch: TextStyle) => void;
  afterPick?: () => void;
}) {
  const mixed = (key: keyof TextStyle) => !items.every((o) => o[key] === items[0][key]);
  /** 드롭다운에 보일 값. 기본값과 같으면 빈 문자열 — LineControls의 val과 같은 규칙이다. */
  const val = (key: 'align' | 'valign' | 'color', dflt: string) => {
    if (mixed(key)) return 'mixed';
    const v = items[0][key] ?? dflt;
    return v === dflt ? '' : v;
  };

  function pick(patch: TextStyle) {
    apply(patch);
    afterPick?.();
  }

  const sizeMm = mixed('size') ? null : (items[0].size ?? TEXT_SIZE);
  const sizePt = sizeMm === null ? null : Math.round(mmToPt(sizeMm) * 10) / 10;
  // 줄 간격은 만들 때 새겨지므로 대개 값이 있다. 없으면 글꼴 자체 높이가 쓰인다.
  const lineMm = mixed('lineHeight')
    ? null
    : roundMm(items[0].lineHeight ?? naturalLineHeight(sizeMm ?? TEXT_SIZE), 2);

  // 하나라도 꺼져 있으면 눌렀을 때 전부 켜진다. 여러 개가 섞여 있을 때
  // 무엇이 될지 예측하기 쉬운 쪽이다. B·I·U·S 넷 다 같은 규칙.
  const allOn = (key: 'bold' | 'italic' | 'underline' | 'strike') => !mixed(key) && !!items[0][key];

  return (
    <>
      <FontPicker
        value={mixed('font') ? null : (items[0].font ?? '')}
        onPick={(font) => pick({ font })}
      />

      {/* B·I·U·S — 모든 글꼴에서 core/text가 정한 대로 그린다(굵게는 가짜 굵게). 끌 때는 값을
          아예 지운다. 그래야 기본값을 따라간다. */}
      <span className="biu-group">
        {(
          [
            ['bold', 'B', '굵게'],
            ['italic', 'I', '기울임'],
            ['underline', 'U', '밑줄'],
            ['strike', 'S', '취소선'],
          ] as const
        ).map(([key, label, title]) => (
          <button
            key={key}
            type="button"
            className={`biu-btn ${key} ${allOn(key) ? 'on' : ''}`}
            onClick={() => pick({ [key]: allOn(key) ? undefined : true })}
            title={title}
            aria-label={title}
            aria-pressed={allOn(key)}
          >
            {label}
          </button>
        ))}
      </span>

      <NumField
        value={sizePt}
        unit="pt"
        title="글자 크기"
        min={MIN_TEXT_PT}
        max={MAX_TEXT_PT}
        step={0.5}
        onCommit={afterPick}
        // 기본값을 그대로 쳤으면 값을 비운다. 그래야 나중에 기본 크기를 바꿀 때
        // 손대지 않은 글자들이 같이 따라온다.
        onChange={(pt) => apply({ size: pt === DEFAULT_PT ? undefined : ptToMm(pt) })}
      />

      <select
        value={val('align', 'left')}
        onChange={(e) => pick({ align: (e.target.value || undefined) as never })}
        title="가로 정렬"
      >
        {mixed('align') && <option value="mixed">—</option>}
        <option value="">왼쪽</option>
        <option value="center">가운데</option>
        <option value="right">오른쪽</option>
      </select>

      <ColorField
        value={items[0].color ?? TEXT_COLOR}
        mixed={mixed('color')}
        onChange={(color) => pick({ color: color === TEXT_COLOR ? undefined : color })}
        title="색"
      />

      <Pop label="간격·배치" title="줄 간격·자간·세로 정렬·회전">
        <PopRow label="줄 간격">
          <NumField
            value={lineMm}
            unit="mm"
            title="Enter로 나뉜 줄 사이"
            min={MIN_LINE_MM}
            max={MAX_LINE_MM}
            step={0.5}
            onCommit={afterPick}
            onChange={(mm) => apply({ lineHeight: mm })}
          />
        </PopRow>
        <PopRow label="자간">
          {/* 줄 간격처럼 직접 치는 칸(세부계획 A4.5 결정). 0을 치면 값을 비워 기본(0)을 따른다. */}
          <NumField
            value={mixed('letterSpacing') ? null : letterSpacingOfText(items[0])}
            unit="mm"
            title="글자 사이에 더하는 간격(음수면 좁힌다)"
            min={MIN_LETTER_SPACING}
            max={MAX_LETTER_SPACING}
            step={0.1}
            onCommit={afterPick}
            onChange={(mm) => apply({ letterSpacing: mm === 0 ? undefined : mm })}
          />
        </PopRow>
        <PopRow label="세로 정렬">
          <select
            value={val('valign', 'middle')}
            onChange={(e) => pick({ valign: (e.target.value || undefined) as never })}
          >
            {mixed('valign') && <option value="mixed">—</option>}
            <option value="top">위</option>
            <option value="">가운데</option>
            <option value="bottom">아래</option>
          </select>
        </PopRow>
        <PopRow label="회전">
          <select
            value={mixed('rotate') ? 'mixed' : String(items[0].rotate ?? 0)}
            onChange={(e) =>
              pick({ rotate: e.target.value === '0' ? undefined : (Number(e.target.value) as 90 | 270) })
            }
            title="타공 방향에 맞춰 세워 쓰는 글자 등에 쓴다"
          >
            {mixed('rotate') && <option value="mixed">—</option>}
            <option value="0">없음</option>
            <option value="90">90도</option>
            <option value="270">270도</option>
          </select>
        </PopRow>
      </Pop>
    </>
  );
}

/**
 * 글꼴 고르기.
 *
 * 목록 맨 아래의 `글꼴 파일 추가…`가 파일 창을 연다. 드롭다운 하나에 고르기와
 * 등록을 함께 둔 것은, 글꼴을 바꾸려다 없다는 걸 알게 되는 순간이 곧 등록하고
 * 싶은 순간이기 때문이다.
 *
 * **등록한 글꼴은 이번 세션에만 산다.** 새로고침하면 목록이 비고, 그 글꼴을 쓰던
 * 글자는 기본 글꼴로 돌아간다. 자세한 이유는 fonts/registry에 있다.
 */
function FontPicker({
  value,
  onPick,
}: {
  /** 고른 글꼴 id. 빈 문자열이면 기본 글꼴, null이면 여러 개가 섞여 있다. */
  value: string | null;
  onPick: (id: string | undefined) => void;
}) {
  const userFonts = useStore((s) => s.userFonts);
  const addUserFont = useStore((s) => s.addUserFont);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // 저장 파일을 열면 글꼴이 이름만 남는다. 같은 이름의 파일을 다시 등록하면
      // **그때의 id를 물려받아** 그 글꼴을 쓰던 글자들이 한꺼번에 되살아난다.
      const name = file.name.replace(/\.[^.]+$/, '');
      const orphan = reusableIdFor(userFonts, name, hasFont);

      const font = await registerFont(file, orphan);
      addUserFont(font);
      // 방금 등록한 글꼴을 바로 씌운다. 등록만 하고 또 고르게 하면 한 번 더 손이 간다.
      // 다만 되살린 경우에는 씌우지 않는다 — 이미 그 글꼴을 쓰던 글자들이 있다.
      if (!orphan) onPick(font.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '글꼴을 읽지 못했습니다');
    }
  }

  return (
    <>
      <select
        value={value === null ? 'mixed' : value}
        onChange={(e) => {
          if (e.target.value === ADD_FONT) {
            // 고른 값을 되돌려놓는다. 파일 창을 닫아버리면 아무 일도 없어야 한다.
            e.target.value = value === null ? 'mixed' : (value ?? '');
            fileRef.current?.click();
            return;
          }
          onPick(e.target.value || undefined);
        }}
        title={error ?? '글꼴'}
        className={error ? 'has-error' : undefined}
      >
        {value === null && <option value="mixed">—</option>}
        <option value="">{DEFAULT_FONT_FAMILY}</option>
        {[
          ...libraryFonts(userFonts),
          // 목록에서 뺀 글꼴이라도 고른 글자가 쓰고 있으면 보여준다.
          ...userFonts.filter((f) => f.hidden && f.id === value),
        ].map((f) => (
          <option key={f.id} value={f.id}>
            {/* 저장 파일에서 이름만 살아 돌아온 것. 지금은 기본 글꼴로 그려진다. */}
            {hasFont(f.id) ? fontLabelOf(f) : `${fontLabelOf(f)} (파일 없음)`}
          </option>
        ))}
        <option value={ADD_FONT}>글꼴 파일 추가…</option>
      </select>

      <input
        ref={fileRef}
        type="file"
        accept={FONT_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          // 같은 파일을 다시 고를 수 있게 비운다.
          e.target.value = '';
        }}
      />
    </>
  );
}

/** 드롭다운에서 `파일 추가`를 뜻하는 값. 글꼴 id와 부딪히지 않는 모양이면 된다. */
const ADD_FONT = '__add__';

/**
 * 직접 치는 숫자 칸.
 *
 * 치는 도중에는 `1.`이나 빈 칸처럼 **아직 숫자가 아닌 상태**를 반드시 거친다.
 * 그 순간의 값을 그대로 위로 올리면 크기가 0이 되거나 NaN이 새어나간다. 그래서
 * 화면에 보이는 글자는 여기서 따로 들고 있고, **읽을 수 있는 값이 됐을 때만**
 * 위로 올린다. 손을 떼면 실제로 반영된 값으로 되돌린다 — 칸에 남은 `1.`이
 * 적용된 것처럼 보이면 안 된다.
 *
 * 값이 밖에서 바뀌면(다른 글자를 골랐다든지) 따라 바뀌지만, **치는 중일 때는
 * 건드리지 않는다.** 손이 올라가 있는 칸의 글자가 저절로 바뀌면 칠 수가 없다.
 *
 * `value`가 `null`이면 여러 개를 골랐는데 값이 서로 다르다는 뜻이다. 빈 칸에
 * `—`만 띄우고, 무언가 치면 그때 전부에 적용된다.
 */
export function NumField({
  value,
  unit,
  title,
  min,
  max,
  step,
  onChange,
  onCommit,
}: {
  value: number | null;
  unit: string;
  title: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    setDraft(shown);
  }, [shown]);

  return (
    <label className="numfield" title={title}>
      <input
        ref={ref}
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        placeholder={value === null ? '—' : ''}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        onKeyDown={(e) => {
          // Enter는 값을 확정한다는 뜻이다. 글자를 치던 중이었다면 그리로 돌아간다.
          if (e.key === 'Enter') {
            e.preventDefault();
            setDraft(shown);
            onCommit?.();
          }
        }}
        onBlur={() => setDraft(shown)}
      />
      <span>{unit}</span>
    </label>
  );
}
